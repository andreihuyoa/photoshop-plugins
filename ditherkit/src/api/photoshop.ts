// Ditherkit's Photoshop side. Every exported function is callable from the panel (webview) through
// Bolt UXP's Comlink bridge, so arguments and results are plain data. Pixels never cross the bridge:
// the panel gets small PNG data URLs and numbers.
import {
  algorithmInfo, autoPalette, downscale, histogram, outputColors, parsePaletteFile, pngDataUrl, render,
  separate, toGpl, toHex, parseHex, extractPalette, prepare, DEFAULTS,
  type Pixels, type RGB,
} from "@andreihuyoa/dither-engine";
import { photoshop, uxp } from "../globals";
import {
  activePalette, paletteHex, toEngine,
  type DitherSettings, type Output, type Source, type Viewport,
} from "../shared/settings";

const { app, core, imaging, action, constants } = photoshop;
const PREVIEW_MAX = 560; // fit preview, longest side (2× the stage for sharp screens)

// ---------------------------------------------------------------- state

interface Bounds { left: number; top: number; right: number; bottom: number }

interface SourceState {
  docId: number;
  layerId: number | null;
  name: string;
  bounds: Bounds;
  resolution: number;
  profile: string;
  fit: Pixels;
  fitScale: number;
  /** Identifies the region last sent as the "before" image, so it's only re-encoded when it changes. */
  beforeKey: string;
  tiles: Pixels;
  tilesScale: number;
  autoKey: string;
  auto: string[] | null;
  full: Pixels | null;
}

let src: SourceState | null = null;
let batchStop = false;

type Listener = (event: string) => void;
let changeListener: Listener | null = null;

let progressListener: ((done: number, total: number) => void) | null = null;

/** Called by the host page with functions that forward document changes and batch progress to the panel. */
export const setListeners = (onChange: Listener | null, onProgress: ((done: number, total: number) => void) | null): void => {
  changeListener = onChange;
  progressListener = onProgress;
};

async function selectLayer(id: number): Promise<void> {
  await action.batchPlay([{ _obj: "select", _target: [{ _ref: "layer", _id: id }], makeVisible: false }], {});
}

let notifying = false;
const EVENTS = ["select", "make", "delete", "set", "open", "close", "convertMode", "imageSize", "canvasSize", "historyStateChanged"];
/** Events that arrive while (or just after) Ditherkit itself edits the document are its own, not the user's. */
let ownEditUntil = 0;
let ownEdits = 0;

function ensureNotifications(): void {
  if (notifying) return;
  notifying = true;
  action.addNotificationListener(EVENTS, (event: string) => {
    if (ownEdits > 0 || Date.now() < ownEditUntil) return;
    changeListener?.(event);
  });
}

// ---------------------------------------------------------------- diagnostics

// A step-by-step record of the last save, written to ditherkit-debug.log in the plugin's data folder
// (~/Library/Application Support/Adobe/UXP/PluginsStorage/PHSP/<version>/Developer/<id>/PluginData on macOS).
const trace: string[] = [];
function log(message: string): void {
  trace.push(`${new Date().toISOString().slice(11, 23)} ${message}`);
}
function layerList(doc: any): string {
  const walk = (layers: any[], depth: number): string[] =>
    layers.flatMap((l) => [`${"  ".repeat(depth)}${l.name} [${l.kind}${l.visible === false ? ", hidden" : ""}]`, ...(l.layers ? walk(l.layers, depth + 1) : [])]);
  try { return walk(doc.layers, 1).join("\n"); } catch (e: any) { return `  (couldn't list layers: ${e?.message ?? e})`; }
}
async function flushLog(): Promise<void> {
  try {
    const folder = await uxp.storage.localFileSystem.getDataFolder();
    const file = await folder.createFile("ditherkit-debug.log", { overwrite: true });
    await file.write(trace.join("\n") + "\n", { format: uxp.storage.formats.utf8 });
  } catch { /* diagnostics must never break saving */ }
}

// ---------------------------------------------------------------- helpers

async function modal<T>(name: string, fn: (ctx: any) => Promise<T>): Promise<T> {
  ownEdits++;
  try {
    return (await core.executeAsModal(fn as any, { commandName: name })) as T;
  } finally {
    ownEdits--;
    ownEditUntil = Date.now() + 400;
  }
}

function activeDoc(): any | null {
  return app.documents.length ? app.activeDocument : null;
}

async function grab(params: Record<string, unknown>, what: string): Promise<{ image: Pixels; bounds: Bounds; profile: string }> {
  let res: any;
  try {
    res = await imaging.getPixels({ componentSize: 8, colorSpace: "RGB", ...params } as any);
  } catch (e: any) {
    throw new Error(`Couldn't read pixels from ${what}. Pick a pixel layer, or set Source to Visible. (${e?.message ?? e})`);
  }
  const imageData = res.imageData;
  try {
    const data = new Uint8Array(await imageData.getData({ chunky: true }));
    const components = imageData.components as 3 | 4;
    return { image: { data, width: imageData.width, height: imageData.height, components }, bounds: res.sourceBounds, profile: imageData.colorProfile };
  } finally {
    imageData.dispose();
  }
}

async function putPixels(docId: number, layerId: number, img: Pixels, at: { left: number; top: number }, profile: string): Promise<void> {
  const opts: any = { width: img.width, height: img.height, components: img.components, chunky: true, colorSpace: "RGB" };
  if (profile) opts.colorProfile = profile;
  const data = await imaging.createImageDataFromBuffer(img.data as Uint8Array, opts);
  try {
    await imaging.putPixels({ documentID: docId, layerID: layerId, imageData: data, targetBounds: at } as any);
  } finally {
    data.dispose();
  }
}

async function putMask(docId: number, layerId: number, gray: Uint8Array, width: number, height: number, at: { left: number; top: number }): Promise<void> {
  const data = await imaging.createImageDataFromBuffer(gray, { width, height, components: 1, chunky: true, colorSpace: "Grayscale" } as any);
  try {
    await (imaging as any).putLayerMask({ documentID: docId, layerID: layerId, imageData: data, targetBounds: at });
  } finally {
    data.dispose();
  }
}

function crop(img: Pixels, cx: number, cy: number, w: number, h: number): { image: Pixels; x: number; y: number } {
  const cw = Math.min(w, img.width), ch = Math.min(h, img.height);
  const x0 = Math.max(0, Math.min(img.width - cw, Math.round(cx - cw / 2)));
  const y0 = Math.max(0, Math.min(img.height - ch, Math.round(cy - ch / 2)));
  const C = img.components;
  const out = new Uint8Array(cw * ch * C);
  for (let y = 0; y < ch; y++) out.set(img.data.subarray(((y0 + y) * img.width + x0) * C, ((y0 + y) * img.width + x0 + cw) * C), y * cw * C);
  return { image: { data: out, width: cw, height: ch, components: C }, x: x0, y: y0 };
}

function resolvedPalette(s: DitherSettings, source: SourceState): { all: string[]; active: RGB[] | null } {
  if (s.mode === "indexed" && s.paletteId === "auto") {
    const key = JSON.stringify([s.autoColors, s.levels, s.invert, source.docId, source.layerId, source.fit.width]);
    if (source.autoKey !== key || !source.auto) {
      source.auto = autoPalette(source.fit, { levels: s.levels, invert: s.invert }, s.autoColors).map((c) => toHex(c));
      source.autoKey = key;
    }
  }
  const all = paletteHex(s, source.auto);
  return { all, active: activePalette(s, all) };
}

/** Size of one output pixel in document pixels. */
function docPixel(s: DitherSettings, source: SourceState): number {
  const dpiFactor = s.dpi > 0 ? Math.max(1, source.resolution / s.dpi) : 1;
  return Math.max(1, Math.round(s.pixelSize * dpiFactor));
}

// ---------------------------------------------------------------- status and preflight

export interface Check { id: "doc" | "layer" | "mode" | "bits" | "profile"; label: string; ok: boolean; fixable: boolean }
export interface Status {
  hasDoc: boolean;
  docName: string;
  layerName: string;
  selectedCount: number;
  summary: string;
  checks: Check[];
  ready: boolean;
}

export const getStatus = async (source: Source): Promise<Status> => {
  ensureNotifications();
  const doc = activeDoc();
  if (!doc) {
    return { hasDoc: false, docName: "", layerName: "", selectedCount: 0, summary: "No document open", checks: [], ready: false, };
  }
  const layers = doc.activeLayers as any[];
  const layer = layers[0];
  const mode = doc.mode === constants.DocumentMode.RGB;
  const bits = doc.bitsPerChannel === constants.BitsPerChannelType.EIGHT;
  const profile = String(doc.colorProfileName ?? "");
  const srgb = !profile || /srgb/i.test(profile);
  const isGroup = layer && layer.kind === constants.LayerKind.GROUP;
  const layerOk = source === "merged" || (!!layer && !isGroup);
  const checks: Check[] = [
    { id: "layer", label: source === "merged" ? "Using all visible layers" : layer ? (isGroup ? `“${layer.name}” is a group` : `Layer “${layer.name}”`) : "No layer selected", ok: layerOk, fixable: false },
    { id: "mode", label: mode ? "RGB color" : `${String(doc.mode).replace("ColorMode", "")} color`, ok: mode, fixable: !mode },
    { id: "bits", label: bits ? "8 bits per channel" : `${String(doc.bitsPerChannel).replace("bitDepth", "")}-bit`, ok: bits, fixable: !bits },
    { id: "profile", label: srgb ? "sRGB profile" : `Profile: ${profile}`, ok: srgb, fixable: !srgb },
  ];
  const ready = layerOk && mode && bits;
  const summary = [mode ? "RGB" : "Not RGB", bits ? "8-bit" : "Not 8-bit", srgb ? "sRGB" : profile.slice(0, 18)].join(" · ");
  return { hasDoc: true, docName: doc.title ?? doc.name, layerName: source === "merged" ? "Visible" : layer?.name ?? "", selectedCount: layers.length, summary, checks, ready };
};

export const fixIssue = async (id: Check["id"]): Promise<void> => {
  await modal("Ditherkit document fix", async () => {
    const doc = activeDoc();
    if (!doc) return;
    if (id === "mode") await doc.changeMode(constants.ChangeMode.RGB);
    if (id === "bits") doc.bitsPerChannel = constants.BitsPerChannelType.EIGHT;
    if (id === "profile") await doc.convertProfile("sRGB IEC61966-2.1", constants.Intent.RELATIVECOLORIMETRIC, true, false);
  });
};

// ---------------------------------------------------------------- source and preview

export interface SourceInfo { name: string; width: number; height: number; fitScale: number; histogram: number[] }

/** Reads the source at preview size. Full resolution is only read when the preview zooms in or a dither starts. */
export const loadSource = async (source: Source): Promise<SourceInfo> => {
  ensureNotifications();
  return modal("Ditherkit preview", async () => {
    const doc = activeDoc();
    if (!doc) throw new Error("Open a document to start.");
    if (doc.mode !== constants.DocumentMode.RGB || doc.bitsPerChannel !== constants.BitsPerChannelType.EIGHT) {
      throw new Error("Ditherkit needs an RGB, 8-bit document. Use the check below to convert it.");
    }
    let layer: any = null;
    if (source === "layer") {
      layer = doc.activeLayers[0];
      if (!layer) throw new Error("Select a layer, or set Source to Visible.");
      if (layer.kind === constants.LayerKind.GROUP) throw new Error(`“${layer.name}” is a group. Pick a layer inside it, or set Source to Visible.`);
    }
    const b = layer ? layer.bounds : { left: 0, top: 0, right: doc.width, bottom: doc.height };
    const w = b.right - b.left, h = b.bottom - b.top;
    if (w <= 0 || h <= 0) throw new Error(`“${layer ? layer.name : doc.title}” is empty.`);

    const params: Record<string, unknown> = { documentID: doc.id };
    if (layer) params.layerID = layer.id;
    const fullSize = Math.max(w, h) <= PREVIEW_MAX;
    if (!fullSize) params.targetSize = w >= h ? { width: PREVIEW_MAX } : { height: PREVIEW_MAX };
    const fit = await grab(params, layer ? `“${layer.name}”` : "the document");
    const fitScale = fit.image.width / w;

    const tiles = downscale(fit.image, 120);
    src = {
      docId: doc.id, layerId: layer ? layer.id : null, name: layer ? layer.name : "Visible",
      bounds: { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, resolution: doc.resolution ?? 72,
      profile: fit.profile, fit: fit.image, fitScale, beforeKey: "",
      tiles, tilesScale: tiles.width / w, autoKey: "", auto: null, full: fullSize ? fit.image : null,
    };
    return { name: src.name, width: Math.round(w), height: Math.round(h), fitScale, histogram: histogram(fit.image) };
  });
};

export interface PreviewResult {
  url: string;
  width: number;
  height: number;
  palette: string[];
  ms: number;
  /** The source pixels behind the preview, only when the visible region changed. */
  beforeUrl: string | null;
  /** The region shown, in document pixels, and its scale (preview pixels per document pixel). */
  view: { x: number; y: number; w: number; h: number; scale: number };
}

/**
 * Renders the preview for a viewport. "fit" uses the downsized source. A numeric zoom crops the
 * full-resolution layer around the viewport's center, sized to the stage, so 100% shows exact pixels
 * of whatever part of the layer you're looking at.
 */
export const renderPreview = async (s: DitherSettings, vp: Viewport): Promise<PreviewResult | null> => {
  if (!src) return null;
  const source = src;
  const t = Date.now();
  const { all, active } = resolvedPalette(s, source);
  const p = docPixel(s, source);
  const W = source.bounds.right - source.bounds.left, H = source.bounds.bottom - source.bounds.top;

  let image: Pixels, scale: number, x0 = 0, y0 = 0, key: string;
  if (vp.zoom === "fit") {
    image = source.fit;
    scale = source.fitScale;
    key = "fit";
  } else {
    const full = source.full ?? (await modal("Ditherkit preview", () => fullSource(source)));
    const cw = Math.min(W, Math.ceil(vp.width / vp.zoom)), ch = Math.min(H, Math.ceil(vp.height / vp.zoom));
    const cx = (vp.cx ?? source.bounds.left + W / 2) - source.bounds.left;
    const cy = (vp.cy ?? source.bounds.top + H / 2) - source.bounds.top;
    // Start the crop on the output-pixel grid, so blocks and patterns match the final render.
    x0 = Math.max(0, Math.min(W - cw, Math.round(cx - cw / 2)));
    y0 = Math.max(0, Math.min(H - ch, Math.round(cy - ch / 2)));
    x0 -= x0 % p;
    y0 -= y0 % p;
    image = crop(full, x0 + cw / 2, y0 + ch / 2, cw, ch).image;
    scale = 1;
    key = `${x0},${y0},${cw},${ch}`;
  }

  const origin = { x: Math.round(((source.bounds.left + x0) * scale) / Math.max(1, Math.round(p * scale))), y: Math.round(((source.bounds.top + y0) * scale) / Math.max(1, Math.round(p * scale))) };
  const out = render(image, toEngine(s, active, scale, origin, source.resolution));
  const beforeUrl = key !== source.beforeKey ? pngDataUrl(image) : null;
  source.beforeKey = key;
  const view = vp.zoom === "fit"
    ? { x: source.bounds.left, y: source.bounds.top, w: W, h: H, scale }
    : { x: source.bounds.left + x0, y: source.bounds.top + y0, w: image.width, h: image.height, scale: 1 };
  return { url: pngDataUrl(out), width: out.width, height: out.height, palette: all, ms: Date.now() - t, beforeUrl, view };
};

/** Forces the next preview to resend the "before" image (after the panel reloads). */
export const resetPreviewCache = async (): Promise<void> => { if (src) src.beforeKey = ""; };

/** Small previews of each algorithm with the current settings, for the pattern picker. */
export const renderTiles = async (s: DitherSettings, ids: string[]): Promise<{ id: string; url: string }[]> => {
  if (!src) return [];
  const { active } = resolvedPalette(s, src);
  const tile = crop(src.tiles, src.tiles.width / 2, src.tiles.height / 2, 72, 48).image;
  return ids.map((id) => {
    const opts = toEngine({ ...s, algorithm: id, pixelSize: Math.max(1, Math.min(s.pixelSize, 2)) }, active, Math.max(src!.tilesScale, 0.25), { x: 0, y: 0 }, src!.resolution);
    return { id, url: pngDataUrl(render(tile, opts)) };
  });
};

// ---------------------------------------------------------------- full renders

async function fullSource(source: SourceState): Promise<Pixels> {
  if (source.full) return source.full;
  const base: Record<string, unknown> = { documentID: source.docId };
  if (source.layerId !== null) base.layerID = source.layerId;
  const g = await grab(base, source.layerId !== null ? `“${source.name}”` : "the document");
  source.full = g.image;
  source.bounds = g.bounds;
  return g.image;
}

function renderFull(s: DitherSettings, source: SourceState, full: Pixels): Pixels {
  const { active } = resolvedPalette(s, source);
  const dpiFactor = s.dpi > 0 ? Math.max(1, source.resolution / s.dpi) : 1;
  const p = Math.max(1, Math.round(s.pixelSize * dpiFactor));
  return render(full, toEngine(s, active, 1, { x: Math.round(source.bounds.left / p), y: Math.round(source.bounds.top / p) }, source.resolution));
}

function sameSource(): void {
  const doc = activeDoc();
  if (!src || !doc || doc.id !== src.docId) throw new Error("The document changed. Refresh the preview and try again.");
}

// ---------------------------------------------------------------- apply

/** The dither as a grayscale mask: light pixels reveal the layer, dark ones hide it. */
function maskPixels(result: Pixels): Uint8Array {
  const gray = new Uint8Array(result.width * result.height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * result.components;
    const lum = 0.2126 * result.data[j] + 0.7152 * result.data[j + 1] + 0.0722 * result.data[j + 2];
    gray[i] = result.components === 4 ? (lum * result.data[j + 3]) / 255 : lum;
  }
  return gray;
}

async function ensureMask(layerId: number): Promise<void> {
  await selectLayer(layerId);
  try {
    await action.batchPlay([{ _obj: "make", new: { _class: "channel" }, at: { _ref: "channel", _enum: "channel", _value: "mask" }, using: { _enum: "userMaskEnabled", _value: "revealAll" } }], {});
  } catch (e: any) { log(`mask: make said: ${e?.message ?? e} (fine if the layer already has one)`); }
}

function findLayer(layers: any[], id: number): any | null {
  for (const l of layers) {
    if (l.id === id) return l;
    if (l.layers) { const f = findLayer(l.layers, id); if (f) return f; }
  }
  return null;
}

/**
 * Renders the dither at full resolution and writes it as `output`, as a single undo step.
 * PNG export asks for a file first, since a save dialog can't open inside a modal.
 */
export const applyDither = async (s: DitherSettings, output: Output): Promise<{ message: string; ms: number }> => {
  sameSource();
  const source = src!;
  const t = Date.now();
  trace.length = 0;
  log(`apply: output "${output}", algorithm ${s.algorithm}, mode ${s.mode}`);
  try {
    let message = "";
    if (output === "png") {
      const file = await uxp.storage.localFileSystem.getFileForSaving(`${source.name.replace(/[^\w-]+/g, "-")}-dither.png`, { types: ["png"] });
      if (!file) return { message: "Export cancelled.", ms: 0 };
      await modal("Ditherkit", async () => {
        await writePng(renderFull(s, source, await fullSource(source)), source, file);
      });
      message = `Saved ${file.name}.`;
    } else {
      await modal("Ditherkit", async (ctx) => {
        const doc = activeDoc();
        const result = renderFull(s, source, await fullSource(source));
        const suspension = await ctx.hostControl.suspendHistory({ documentID: doc.id, name: "Ditherkit" });
        try {
          message = await writeOutput(doc, s, source, result, output);
        } finally {
          await ctx.hostControl.resumeHistory(suspension);
        }
      });
    }
    log(`apply: done, "${message}"`);
    return { message, ms: Date.now() - t };
  } catch (e: any) {
    log(`apply: FAILED ${e?.message ?? e}`);
    throw e;
  } finally {
    try { const doc = activeDoc(); if (doc) log(`layers after:\n${layerList(doc)}`); } catch { /* ignore */ }
    await flushLog();
  }
};

// ---------------------------------------------------------------- outputs

/** Name of the layer a dither becomes. */
function resultName(s: DitherSettings): string {
  return `Dither · ${algorithmInfo(s.algorithm).name}`;
}

async function writeOutput(doc: any, s: DitherSettings, source: SourceState, result: Pixels, output: Output): Promise<string> {
  const name = resultName(s);
  const at = { left: source.bounds.left, top: source.bounds.top };
  const srcLayer = source.layerId !== null ? findLayer(doc.layers, source.layerId) : null;
  log(`write: output "${output}", source layer ${srcLayer ? `"${srcLayer.name}"` : "none (Visible)"}, result ${result.width}x${result.height}`);

  if (output === "layer" || output === "replace") {
    if (srcLayer) await selectLayer(srcLayer.id);
    const layer = await doc.createPixelLayer({ name });
    if (srcLayer) layer.move(srcLayer, constants.ElementPlacement.PLACEBEFORE);
    else if (doc.layers[0] && doc.layers[0].id !== layer.id) layer.move(doc.layers[0], constants.ElementPlacement.PLACEBEFORE);
    await putPixels(doc.id, layer.id, result, at, source.profile);
    if (output === "replace" && srcLayer) srcLayer.visible = false;
    if (srcLayer) await selectLayer(srcLayer.id);
    return output === "replace" ? `Added “${name}” and hid the original.` : `Added “${name}”.`;
  }

  if (output === "separate") {
    const { active } = resolvedPalette(s, source);
    const colors = outputColors({ ...DEFAULTS, ...toEngine(s, active, 1, { x: 0, y: 0 }) });
    const idx = separate(result, colors);
    if (srcLayer) await selectLayer(srcLayer.id);
    const group = await doc.createLayerGroup({ name: `${name} · colors` });
    if (srcLayer) group.move(srcLayer, constants.ElementPlacement.PLACEBEFORE);
    const W = doc.width, H = doc.height;
    let made = 0;
    for (let k = colors.length - 1; k >= 0; k--) {
      let any = false;
      const mask = new Uint8Array(W * H);
      for (let y = 0; y < result.height; y++) {
        const dy = y + at.top;
        if (dy < 0 || dy >= H) continue;
        for (let x = 0; x < result.width; x++) {
          const dx = x + at.left;
          if (dx < 0 || dx >= W) continue;
          if (idx[y * result.width + x] === k) {
            const a = result.components === 4 ? result.data[(y * result.width + x) * 4 + 3] : 255;
            mask[dy * W + dx] = a;
            if (a) any = true;
          }
        }
      }
      if (!any) continue;
      const c = colors[k];
      log(`write: color layer ${toHex(c)}`);
      await action.batchPlay([{
        _obj: "make",
        _target: [{ _ref: "contentLayer" }],
        using: { _obj: "contentLayer", name: toHex(c).toUpperCase(), type: { _obj: "solidColorLayer", color: { _obj: "RGBColor", red: c[0], grain: c[1], blue: c[2] } } },
      }], {});
      const fill = doc.activeLayers[0];
      fill.move(group, constants.ElementPlacement.PLACEINSIDE);
      await putMask(doc.id, fill.id, mask, W, H, { left: 0, top: 0 });
      made++;
    }
    if (srcLayer) await selectLayer(srcLayer.id);
    return `Added ${made} color layers in “${name} · colors”.`;
  }

  if (output === "mask") {
    if (!srcLayer) throw new Error("Layer mask output needs a layer as the source.");
    log("write: adding a layer mask");
    await ensureMask(srcLayer.id);
    await putMask(doc.id, srcLayer.id, maskPixels(result), result.width, result.height, at);
    log("write: mask pixels written");
    return `Masked “${srcLayer.name}” with the dither.`;
  }

  if (output === "document") {
    const newDoc = await app.createDocument({
      width: result.width, height: result.height, resolution: source.resolution,
      mode: constants.NewDocumentMode.RGB, fill: constants.DocumentFill.TRANSPARENT, name,
    } as any);
    if (!newDoc) throw new Error("Photoshop couldn't create the new document.");
    await putPixels(newDoc.id, newDoc.layers[0].id, result, { left: 0, top: 0 }, source.profile);
    return `Opened “${name}” as a new document.`;
  }
  return "";
}

async function writePng(result: Pixels, source: SourceState, file: any): Promise<void> {
  const newDoc = await app.createDocument({
    width: result.width, height: result.height, resolution: source.resolution,
    mode: constants.NewDocumentMode.RGB, fill: constants.DocumentFill.TRANSPARENT, name: "Ditherkit export",
  } as any);
  if (!newDoc) throw new Error("Photoshop couldn't create the export document.");
  try {
    await putPixels(newDoc.id, newDoc.layers[0].id, result, { left: 0, top: 0 }, source.profile);
    await newDoc.saveAs.png(file, { compression: 6 } as any, true);
  } finally {
    await newDoc.closeWithoutSaving();
  }
}

// ---------------------------------------------------------------- batch

export const stopBatch = async (): Promise<void> => { batchStop = true; };

/** Dithers every selected pixel layer with the same settings, each to its own output. One undo step. */
export const ditherSelected = async (s: DitherSettings, output: Output): Promise<string> => {
  if (output === "png") throw new Error("Batch can't export PNG files. Choose another output.");
  batchStop = false;
  let done = 0, total = 0;
  await modal("Ditherkit batch", async (ctx) => {
    const doc = activeDoc();
    if (!doc) throw new Error("Open a document first.");
    const layers = [...(doc.activeLayers as any[])].filter((l) => l.kind !== constants.LayerKind.GROUP);
    total = layers.length;
    if (!total) throw new Error("Select one or more layers to batch.");
    const suspension = await ctx.hostControl.suspendHistory({ documentID: doc.id, name: "Ditherkit batch" });
    try {
      for (const layer of layers) {
        if (batchStop) break;
        const g = await grab({ documentID: doc.id, layerID: layer.id }, `“${layer.name}”`);
        if (!g.image.width || !g.image.height) { done++; continue; }
        const fit = downscale(g.image, PREVIEW_MAX);
        const one: SourceState = {
          docId: doc.id, layerId: layer.id, name: layer.name, bounds: g.bounds, resolution: doc.resolution ?? 72, profile: g.profile,
          fit, fitScale: fit.width / g.image.width, beforeKey: "",
          tiles: fit, tilesScale: 1, autoKey: "", auto: null, full: g.image,
        };
        await writeOutput(doc, s, one, renderFull(s, one, g.image), output);
        done++;
        progressListener?.(done, total);
      }
    } finally {
      await ctx.hostControl.resumeHistory(suspension);
    }
  });
  return batchStop ? `Stopped after ${done} of ${total} layers.` : `Dithered ${done} layer${done === 1 ? "" : "s"}.`;
};

// ---------------------------------------------------------------- palettes and files

export const importPaletteFile = async (): Promise<string[]> => {
  const file = await uxp.storage.localFileSystem.getFileForOpening({ types: ["ase", "aco", "gpl", "txt"] });
  if (!file) return [];
  const fmt = /\.(gpl|txt)$/i.test(file.name) ? uxp.storage.formats.utf8 : uxp.storage.formats.binary;
  const data = await file.read({ format: fmt });
  const colors = parsePaletteFile(file.name, data as ArrayBuffer | string);
  if (!colors.length) throw new Error(`No colors found in ${file.name}.`);
  return colors.slice(0, 64).map((c) => toHex(c));
};

/** Opens an image in Photoshop, pulls n colors from it and closes it again. */
export const importPaletteFromImage = async (n: number): Promise<string[]> => {
  const file = await uxp.storage.localFileSystem.getFileForOpening({ types: ["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "psd"] });
  if (!file) return [];
  return modal("Ditherkit palette", async () => {
    const before = activeDoc();
    const doc = await app.open(file);
    try {
      if (doc.mode !== constants.DocumentMode.RGB) await doc.changeMode(constants.ChangeMode.RGB);
      if (doc.bitsPerChannel !== constants.BitsPerChannelType.EIGHT) doc.bitsPerChannel = constants.BitsPerChannelType.EIGHT;
      const w = doc.width, h = doc.height;
      const params: Record<string, unknown> = { documentID: doc.id };
      if (Math.max(w, h) > 400) params.targetSize = w >= h ? { width: 400 } : { height: 400 };
      const g = await grab(params, file.name);
      const p = prepare(g.image, {});
      return extractPalette(p.rgb, p.alpha, n).map((c) => toHex(c));
    } finally {
      await doc.closeWithoutSaving();
      if (before) app.activeDocument = before;
    }
  });
};

export const exportPaletteFile = async (name: string, colors: string[]): Promise<string> => {
  const file = await uxp.storage.localFileSystem.getFileForSaving(`${name.replace(/[^\w-]+/g, "-") || "palette"}.gpl`, { types: ["gpl"] });
  if (!file) return "Export cancelled.";
  await file.write(toGpl(name, colors.map((h) => parseHex(h)).filter((c): c is RGB => !!c)), { format: uxp.storage.formats.utf8 });
  return `Saved ${file.name}.`;
};

export const exportPresetsFile = async (json: string): Promise<string> => {
  const file = await uxp.storage.localFileSystem.getFileForSaving("ditherkit-presets.json", { types: ["json"] });
  if (!file) return "Export cancelled.";
  await file.write(json, { format: uxp.storage.formats.utf8 });
  return `Saved ${file.name}.`;
};

export const importPresetsFile = async (): Promise<string | null> => {
  const file = await uxp.storage.localFileSystem.getFileForOpening({ types: ["json"] });
  if (!file) return null;
  return (await file.read({ format: uxp.storage.formats.utf8 })) as string;
};

export const getSwatchColors = async (): Promise<{ foreground: string; background: string }> => {
  const hex = (c: any) => toHex([c.rgb.red, c.rgb.green, c.rgb.blue]);
  return { foreground: hex(app.foregroundColor), background: hex(app.backgroundColor) };
};

// ---------------------------------------------------------------- preferences

const PREFS_KEY = "ditherkit.prefs";
const OLD_PREFS_KEY = "ditherkit.v2.prefs"; // used by development builds; read once so saved presets carry over

export const loadPrefs = async (): Promise<string | null> => {
  try { return localStorage.getItem(PREFS_KEY) ?? localStorage.getItem(OLD_PREFS_KEY); } catch { return null; }
};

export const savePrefs = async (json: string): Promise<void> => {
  try { localStorage.setItem(PREFS_KEY, json); } catch { /* storage is a convenience */ }
};
