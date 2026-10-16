// A stand-in for the Photoshop side, for working on the panel in a normal browser (pnpm harness).
// It runs the real engine on a generated image; Photoshop-only actions just report what they'd do.
import { autoPalette, downscale, histogram, pngDataUrl, render, toHex, type Pixels } from "@andreihuyoa/dither-engine";
import { activePalette, paletteHex, toEngine, type DitherSettings, type Output, type Source, type Viewport } from "../../../src/shared/settings";
import type { DitherkitAPI, Status } from "../api-types";

function sampleImage(w: number, h: number): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const cx = w * 0.58, cy = h * 0.52, r = h * 0.34;
    const d = Math.hypot(x - cx, y - cy) / r;
    let rgb: number[];
    if (d < 1) {
      const lit = Math.max(0, 1 - Math.hypot(x - (cx - r * 0.35), y - (cy - r * 0.38)) / (r * 1.5));
      rgb = [70 + 185 * lit, 110 + 140 * lit, 190 + 65 * lit];
    } else {
      const t = x / w;
      const sky = y < h * 0.62;
      rgb = sky ? [240 - 90 * t, 200 - 40 * t + 30 * (y / h), 150 + 60 * t] : [60 + 30 * t, 70 + 20 * t, 50];
    }
    data.set([...rgb.map((v) => Math.max(0, Math.min(255, v))), 255], i);
  }
  return { data, width: w, height: h, components: 4 };
}

// ?size=770x1193 tests a tall layer; the default is a wide one.
const [SW, SH] = (new URL(location.href).searchParams.get("size") || "1600x1000").split("x").map(Number);
const FULL = sampleImage(SW || 1600, SH || 1000);
const FIT = downscale(FULL, 560);
const fitScale = FIT.width / FULL.width;
const TILE = downscale(FULL, 120);

let session = false;
let beforeKey = "";
let autoKey = "";
let auto: string[] = [];
let stop = false;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function palette(s: DitherSettings) {
  if (s.mode === "indexed" && s.paletteId === "auto") {
    const key = JSON.stringify([s.autoColors, s.levels, s.invert]);
    if (key !== autoKey) { auto = autoPalette(FIT, { levels: s.levels, invert: s.invert }, s.autoColors).map((c) => toHex(c)); autoKey = key; }
  }
  const all = paletteHex(s, auto);
  return { all, active: activePalette(s, all) };
}

// ?demo=halftone or ?demo=palette opens the harness in a preset state, for screenshots.
const DEMOS: Record<string, object> = {
  halftone: { family: "halftone", open: { pattern: true, color: true, tone: false, scale: false, output: false },
    settings: { algorithm: "halftone-dot", mode: "tone", steps: 2, scale: 7, angle: 45, dark: "#1b2433", light: "#f2efe8" } },
  palette: { family: "diffusion", open: { pattern: false, color: true, tone: true, scale: false, output: false },
    settings: { algorithm: "atkinson", mode: "indexed", paletteId: "auto", autoColors: 8, pixelSize: 2 } },
};

export function createMockApi(): DitherkitAPI {
  (window as unknown as { __undoDither: () => void }).__undoDither = () => {
    session = false;
    window.dispatchEvent(new CustomEvent("document-changed", { detail: "session-ended" }));
  };
  let prefs: string | null = null;
  const demo = new URL(location.href).searchParams.get("demo");
  if (demo && DEMOS[demo]) prefs = JSON.stringify(DEMOS[demo]);
  else try { prefs = localStorage.getItem("ditherkit.harness.prefs"); } catch { /* ignore */ }
  const status = (source: Source): Status => ({
    hasDoc: true, docName: "sample.psd", layerName: source === "merged" ? "Visible" : "Photo", selectedCount: 3,
    summary: "RGB · 8-bit · sRGB", ready: true, session,
    checks: [
      { id: "layer", label: source === "merged" ? "Using all visible layers" : "Layer “Photo”", ok: true, fixable: false },
      { id: "mode", label: "RGB color", ok: true, fixable: false },
      { id: "bits", label: "8 bits per channel", ok: true, fixable: false },
      { id: "profile", label: "Profile: Display P3", ok: false, fixable: true },
    ],
  });
  return {
    getStatus: async (source) => status(source),
    fixIssue: async () => { await delay(200); },
    loadSource: async () => {
      await delay(80);
      beforeKey = "";
      return { name: "Photo", width: FULL.width, height: FULL.height, fitScale, histogram: histogram(FIT) };
    },
    renderPreview: async (s, vp: Viewport) => {
      const t = performance.now();
      const { all, active } = palette(s);
      let image: Pixels = FIT, scale = fitScale, x0 = 0, y0 = 0, key = "fit";
      if (vp.zoom !== "fit") {
        const p = Math.max(1, Math.round(s.pixelSize));
        const cw = Math.min(FULL.width, Math.ceil(vp.width / vp.zoom)), ch = Math.min(FULL.height, Math.ceil(vp.height / vp.zoom));
        x0 = Math.max(0, Math.min(FULL.width - cw, Math.round((vp.cx ?? FULL.width / 2) - cw / 2)));
        y0 = Math.max(0, Math.min(FULL.height - ch, Math.round((vp.cy ?? FULL.height / 2) - ch / 2)));
        x0 -= x0 % p; y0 -= y0 % p;
        const data = new Uint8Array(cw * ch * 4);
        for (let y = 0; y < ch; y++) data.set(FULL.data.subarray(((y0 + y) * FULL.width + x0) * 4, ((y0 + y) * FULL.width + x0 + cw) * 4), y * cw * 4);
        image = { data, width: cw, height: ch, components: 4 };
        scale = 1;
        key = `${x0},${y0},${cw},${ch}`;
      }
      const out = render(image, toEngine(s, active, scale, { x: 0, y: 0 }));
      const beforeUrl = key !== beforeKey ? pngDataUrl(image) : null;
      beforeKey = key;
      const view = vp.zoom === "fit"
        ? { x: 0, y: 0, w: FULL.width, h: FULL.height, scale }
        : { x: x0, y: y0, w: image.width, h: image.height, scale: 1 };
      return { url: pngDataUrl(out), width: out.width, height: out.height, palette: all, ms: Math.round(performance.now() - t), beforeUrl, view };
    },
    resetPreviewCache: async () => { beforeKey = ""; },
    renderTiles: async (s, ids) => {
      const { active } = palette(s);
      const w = 72, h = 48, x0 = Math.round((TILE.width - w) / 2), y0 = Math.round((TILE.height - h) / 2);
      const data = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) data.set(TILE.data.subarray(((y0 + y) * TILE.width + x0) * 4, ((y0 + y) * TILE.width + x0 + w) * 4), y * w * 4);
      const tile: Pixels = { data, width: w, height: h, components: 4 };
      return ids.map((id) => ({ id, url: pngDataUrl(render(tile, toEngine({ ...s, algorithm: id, pixelSize: Math.min(2, s.pixelSize) }, active, 0.25, { x: 0, y: 0 }))) }));
    },
    startSession: async (s) => {
      const t = performance.now();
      render(FULL, toEngine(s, palette(s).active, 1, { x: 0, y: 0 }));
      session = true;
      return { ms: Math.round(performance.now() - t) };
    },
    setSessionOutput: async () => ({ ms: 0 }),
    updateSession: async (s) => {
      const t = performance.now();
      render(FULL, toEngine(s, palette(s).active, 1, { x: 0, y: 0 }));
      return { ms: Math.round(performance.now() - t) };
    },
    cancelSession: async () => { await delay(120); session = false; },
    saveSession: async (_s, output: Output) => { await delay(200); session = false; return `Would save as: ${output}.`; },
    isSessionActive: async () => session,
    ditherSelected: async (s) => {
      stop = false;
      for (let i = 1; i <= 3 && !stop; i++) {
        render(FIT, toEngine(s, palette(s).active, 1, { x: 0, y: 0 }));
        await delay(400);
        window.dispatchEvent(new CustomEvent("batch-progress", { detail: { done: i, total: 3 } }));
      }
      return stop ? "Stopped." : "Dithered 3 layers.";
    },
    stopBatch: async () => { stop = true; },
    importPaletteFile: async () => ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"],
    importPaletteFromImage: async (n) => autoPalette(FIT, {}, n).map((c) => toHex(c)),
    exportPaletteFile: async () => "Would save a .gpl file.",
    exportPresetsFile: async () => "Would save ditherkit-presets.json.",
    importPresetsFile: async () => null,
    getSwatchColors: async () => ({ foreground: "#1d2b53", background: "#fff1e8" }),
    loadPrefs: async () => prefs,
    savePrefs: async (json) => { if (demo) return; try { localStorage.setItem("ditherkit.harness.prefs", json); } catch { /* ignore */ } },
    // window.__undoDither() in the console simulates undoing the live layer in Photoshop.
    getColorScheme: async () => ({ theme: new URL(location.href).searchParams.get("theme") || "darkest", colors: {} }),
  };
}
