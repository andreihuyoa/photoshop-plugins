// Settings shared by the panel (webview) and the Photoshop side (UXP). Everything here is plain data
// so it crosses the postMessage bridge unchanged.
import {
  DEFAULT_LEVELS, PALETTES, algorithmInfo, parseHex,
  type ColorMode, type EdgeStyle, type Family, type Levels, type RenderOptions, type RGB,
} from "@andreihuyoa/dither-engine";

/** "fit" shows the whole source; a number is preview pixels per document pixel (1 = 100%). */
export type Zoom = "fit" | number;
export const ZOOM_STEPS = [0.25, 0.5, 1, 2, 4, 8];

/** What the preview stage shows: a zoom, the document point at its center, and its size in CSS pixels. */
export interface Viewport {
  zoom: Zoom;
  cx: number | null;
  cy: number | null;
  width: number;
  height: number;
}
export type Source = "layer" | "merged";
export type Output = "layer" | "replace" | "separate" | "mask" | "document" | "png";

export interface DitherSettings {
  algorithm: string;
  /** 0–100 */
  strength: number;
  serpentine: boolean;
  /** Halftone / mosaic / modulation cell, in document pixels. */
  scale: number;
  angle: number;

  mode: ColorMode;
  steps: number;
  dark: string;
  light: string;
  /** "auto", a built-in palette id, or "custom". */
  paletteId: string;
  autoColors: number;
  customColors: string[];
  muted: string[];
  rgbLevels: number;

  pixelSize: number;
  /** Interpret pixel size against this resolution: at 300 ppi a 4 px pixel prints at the same size as 1 px at 72. 0 = off. */
  dpi: number;
  blur: number;
  /** 0–200 */
  sharpen: number;
  /** 0–100 */
  denoise: number;
  levels: Levels;
  invert: boolean;

  edge: EdgeStyle;
  /** -100–100 */
  bleed: number;
  /** 0 keeps soft transparency. */
  alphaThreshold: number;
  seed: number;
}

export const DEFAULT_SETTINGS: DitherSettings = {
  algorithm: "floyd-steinberg",
  strength: 100,
  serpentine: true,
  scale: 8,
  angle: 45,
  mode: "mono",
  steps: 4,
  dark: "#000000",
  light: "#ffffff",
  paletteId: "auto",
  autoColors: 8,
  customColors: [],
  muted: [],
  rgbLevels: 2,
  pixelSize: 1,
  dpi: 0,
  blur: 0,
  sharpen: 0,
  denoise: 0,
  levels: { ...DEFAULT_LEVELS },
  invert: false,
  edge: "crisp",
  bleed: 0,
  alphaThreshold: 0,
  seed: 1,
};

export interface Preset {
  name: string;
  builtIn?: boolean;
  settings: Partial<DitherSettings>;
}

export const BUILT_IN_PRESETS: Preset[] = [
  { name: "Classic 1-bit", builtIn: true, settings: { algorithm: "atkinson", mode: "mono", pixelSize: 1 } },
  { name: "Newsprint", builtIn: true, settings: { algorithm: "halftone-dot", mode: "mono", scale: 6, angle: 45, dark: "#1b1b1b", light: "#f4f1ea" } },
  { name: "Game Boy", builtIn: true, settings: { algorithm: "bayer-4", mode: "indexed", paletteId: "gameboy", pixelSize: 3, edge: "crisp" } },
  { name: "Risograph", builtIn: true, settings: { algorithm: "blue-noise", mode: "indexed", paletteId: "riso", pixelSize: 2 } },
  { name: "Photocopy", builtIn: true, settings: { algorithm: "xerox", mode: "mono", levels: { inBlack: 30, inWhite: 210, gamma: 1, outBlack: 0, outWhite: 255 } } },
  { name: "Scanlines", builtIn: true, settings: { algorithm: "beam-h", mode: "tone", steps: 2, scale: 5, dark: "#0d1b2a", light: "#e0f2ff" } },
  { name: "Soft blobs", builtIn: true, settings: { algorithm: "bayer-8", mode: "mono", pixelSize: 6, edge: "rounded" } },
];

export interface Prefs {
  appearance: "workbench" | "photoshop";
  checkBeforeDither: boolean;
  source: Source;
  output: Output;
  family: Family;
  open: Record<string, boolean>;
  settings: DitherSettings;
  presets: Preset[];
}

export const DEFAULT_PREFS: Prefs = {
  appearance: "workbench",
  checkBeforeDither: true,
  source: "layer",
  output: "layer",
  family: "diffusion",
  open: { pattern: true, color: true, tone: false, scale: false },
  settings: DEFAULT_SETTINGS,
  presets: [],
};

export const OUTPUTS: { id: Output; label: string; detail: string }[] = [
  { id: "layer", label: "New layer", detail: "Above the source" },
  { id: "replace", label: "Replace source", detail: "Original kept hidden" },
  { id: "separate", label: "Color layers", detail: "One fill layer per color, masked" },
  { id: "mask", label: "Layer mask", detail: "On the source layer" },
  { id: "document", label: "New document", detail: "Same size and resolution" },
  { id: "png", label: "PNG file", detail: "Saved where you choose" },
];

/** Colors of the selected palette before muting, as hex. Auto palettes come from the image, so they're passed in. */
export function paletteHex(s: DitherSettings, auto: string[] | null): string[] {
  if (s.paletteId === "custom") return s.customColors;
  if (s.paletteId === "auto") return auto ?? [];
  const p = PALETTES.find((x) => x.id === s.paletteId);
  return p ? p.colors.map((c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("")) : [];
}

/**
 * Engine options for an image rendered at `scale` preview pixels per document pixel.
 * `palette` is the active (unmuted) palette; `origin` aligns pattern phase with the full render.
 */
export function toEngine(s: DitherSettings, palette: RGB[] | null, scale: number, origin: { x: number; y: number }, docResolution = 72): Partial<RenderOptions> {
  const dpiFactor = s.dpi > 0 ? Math.max(1, docResolution / s.dpi) : 1;
  const docPixel = s.pixelSize * dpiFactor;
  const p = Math.max(1, Math.round(docPixel * scale));
  const family = algorithmInfo(s.algorithm).family;
  const cellDoc = family === "diffusion" || family === "ordered" || family === "noise" ? s.scale : s.scale * dpiFactor;
  return {
    algorithm: s.algorithm,
    strength: s.strength / 100,
    serpentine: s.serpentine,
    // Below ~4 preview pixels a cell aliases into moiré, so scaled-down previews keep cells at least that big.
    cell: Math.max(scale < 1 ? 4 : 2, (cellDoc * scale) / p),
    angle: s.angle,
    mode: s.mode,
    steps: s.steps,
    dark: parseHex(s.dark) ?? [0, 0, 0],
    light: parseHex(s.light) ?? [255, 255, 255],
    palette,
    rgbLevels: s.rgbLevels,
    pixelSize: p,
    blur: (s.blur * scale) / p,
    sharpen: s.sharpen / 100,
    denoise: s.denoise / 100,
    levels: s.levels,
    invert: s.invert,
    edge: s.edge,
    bleed: s.bleed / 100,
    alphaThreshold: s.alphaThreshold,
    originX: origin.x,
    originY: origin.y,
    seed: s.seed,
  };
}

/** The palette the engine should use: the selected colors minus muted ones (never fewer than two). */
export function activePalette(s: DitherSettings, all: string[]): RGB[] | null {
  if (s.mode !== "indexed") return null;
  const muted = new Set(s.muted.map((m) => m.toLowerCase()));
  let use = all.filter((h) => !muted.has(h.toLowerCase()));
  if (use.length < 2) use = all;
  const rgb = use.map((h) => parseHex(h)).filter((c): c is RGB => !!c);
  return rgb.length >= 2 ? rgb : [[0, 0, 0], [255, 255, 255]];
}

export function summarize(s: DitherSettings): Record<string, string> {
  const alg = algorithmInfo(s.algorithm);
  const mode = { mono: "Mono", tone: `Tone · ${s.steps}`, indexed: "Indexed", rgb: `RGB · ${s.rgbLevels ** 3}` }[s.mode];
  return {
    pattern: `${alg.name}${s.strength !== 100 ? ` · ${s.strength}%` : ""}`,
    color: mode,
    tone: s.levels.inBlack !== 0 || s.levels.inWhite !== 255 || s.levels.gamma !== 1 || s.levels.outBlack !== 0 || s.levels.outWhite !== 255 || s.blur || s.sharpen || s.denoise || s.invert ? "Adjusted" : "Off",
    scale: `${s.pixelSize} px${s.edge !== "crisp" && s.pixelSize > 1 ? ` · ${s.edge}` : ""}${s.dpi ? ` · ${s.dpi} ppi` : ""}`,
  };
}
