import type { Algorithm, Family, Levels, Pixels, RenderOptions, RGB } from "./types.ts";
import { colorDistance, luminance } from "./palettes.ts";

// Pipeline:
//   downsample by pixelSize -> denoise -> blur -> sharpen -> levels -> (mosaic cell average)
//   -> dither -> upscale (crisp / soft / rounded) -> alpha

const FLOYD_STEINBERG: Algorithm = { id: "floyd-steinberg", name: "Floyd–Steinberg", family: "diffusion" };

export const ALGORITHMS: Algorithm[] = [
  FLOYD_STEINBERG,
  { id: "atkinson", name: "Atkinson", family: "diffusion" },
  { id: "jarvis", name: "Jarvis–Judice–Ninke", family: "diffusion" },
  { id: "stucki", name: "Stucki", family: "diffusion" },
  { id: "burkes", name: "Burkes", family: "diffusion" },
  { id: "sierra", name: "Sierra", family: "diffusion" },
  { id: "sierra-2", name: "Sierra two-row", family: "diffusion" },
  { id: "sierra-lite", name: "Sierra Lite", family: "diffusion" },
  { id: "shiau-fan", name: "Shiau–Fan", family: "diffusion" },
  { id: "shiau-fan-2", name: "Shiau–Fan 2", family: "diffusion" },
  { id: "fan", name: "Fan", family: "diffusion" },
  { id: "false-fs", name: "False Floyd–Steinberg", family: "diffusion" },

  { id: "bayer-2", name: "Bayer 2×2", family: "ordered" },
  { id: "bayer-4", name: "Bayer 4×4", family: "ordered" },
  { id: "bayer-8", name: "Bayer 8×8", family: "ordered" },
  { id: "bayer-16", name: "Bayer 16×16", family: "ordered" },
  { id: "cluster-4", name: "Clustered 4×4", family: "ordered" },
  { id: "cluster-8", name: "Clustered 8×8", family: "ordered" },
  { id: "threshold", name: "Threshold", family: "ordered" },

  { id: "halftone-dot", name: "Round dot", family: "halftone" },
  { id: "halftone-ellipse", name: "Ellipse", family: "halftone" },
  { id: "halftone-diamond", name: "Diamond", family: "halftone" },
  { id: "halftone-line", name: "Line", family: "halftone" },
  { id: "halftone-cross", name: "Crosshatch", family: "halftone" },

  { id: "mosaic-round", name: "Mosaic round", family: "mosaic" },
  { id: "mosaic-square", name: "Mosaic square", family: "mosaic" },

  { id: "blue-noise", name: "Blue noise", family: "noise" },
  { id: "ign", name: "Gradient noise", family: "noise" },
  { id: "white-noise", name: "White noise", family: "noise" },
  { id: "xerox", name: "Xerox grain", family: "noise" },

  { id: "beam-h", name: "H beam", family: "modulation" },
  { id: "beam-v", name: "V beam", family: "modulation" },
];

export const FAMILIES: { id: Family; name: string }[] = [
  { id: "diffusion", name: "Diffusion" },
  { id: "ordered", name: "Ordered" },
  { id: "halftone", name: "Halftone" },
  { id: "mosaic", name: "Mosaic" },
  { id: "noise", name: "Noise" },
  { id: "modulation", name: "Modulation" },
];

// [dx, dy, weight] taps, normalised by div.
export const KERNELS: Record<string, { div: number; taps: [number, number, number][] }> = {
  "floyd-steinberg": { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  "false-fs": { div: 8, taps: [[1, 0, 3], [0, 1, 3], [1, 1, 2]] },
  atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jarvis: {
    div: 48,
    taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3],
      [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]],
  },
  stucki: {
    div: 42,
    taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2],
      [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]],
  },
  burkes: { div: 32, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra: {
    div: 32,
    taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2],
      [-1, 2, 2], [0, 2, 3], [1, 2, 2]],
  },
  "sierra-2": { div: 16, taps: [[1, 0, 4], [2, 0, 3], [-2, 1, 1], [-1, 1, 2], [0, 1, 3], [1, 1, 2], [2, 1, 1]] },
  "sierra-lite": { div: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
  "shiau-fan": { div: 8, taps: [[1, 0, 4], [-2, 1, 1], [-1, 1, 1], [0, 1, 2]] },
  "shiau-fan-2": { div: 16, taps: [[1, 0, 8], [-3, 1, 1], [-2, 1, 1], [-1, 1, 2], [0, 1, 4]] },
  fan: { div: 16, taps: [[1, 0, 7], [-2, 1, 1], [-1, 1, 3], [0, 1, 5]] },
};

export const DEFAULT_LEVELS: Levels = { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };

export const DEFAULTS: RenderOptions = {
  algorithm: "floyd-steinberg",
  strength: 1,
  serpentine: true,
  cell: 8,
  angle: 45,
  mode: "mono",
  steps: 4,
  dark: [0, 0, 0],
  light: [255, 255, 255],
  palette: null,
  rgbLevels: 2,
  pixelSize: 1,
  blur: 0,
  sharpen: 0,
  denoise: 0,
  levels: DEFAULT_LEVELS,
  invert: false,
  edge: "crisp",
  bleed: 0,
  alphaThreshold: 0,
  originX: 0,
  originY: 0,
  seed: 1,
};

export function algorithmInfo(id: string): Algorithm {
  return ALGORITHMS.find((a) => a.id === id) ?? FLOYD_STEINBERG;
}

// ---------------------------------------------------------------- threshold maps

export function bayerMatrix(n: number): number[] {
  let m = [0];
  let size = 1;
  while (size < n) {
    const s2 = size * 2;
    const next = new Array<number>(s2 * s2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = (m[y * size + x] ?? 0) * 4;
        next[y * s2 + x] = v;
        next[y * s2 + x + size] = v + 2;
        next[(y + size) * s2 + x] = v + 3;
        next[(y + size) * s2 + x + size] = v + 1;
      }
    }
    m = next;
    size = s2;
  }
  return m;
}

/** Ranks a spot function over an n×n cell into a threshold matrix (0..n²-1), centre first. */
export function rankMatrix(n: number, spot: (u: number, v: number) => number): number[] {
  const cells: { i: number; s: number }[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) cells.push({ i: y * n + x, s: spot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) + (y * n + x) * 1e-9 });
  }
  cells.sort((a, b) => a.s - b.s);
  const out = new Array<number>(n * n);
  cells.forEach((c, r) => (out[c.i] = r));
  return out;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Void-and-cluster blue noise (Ulichney 1993) on a toroidal size×size grid. Thresholds in [0, 1). */
export function buildBlueNoise(size: number, sigma: number, seed: number): Float32Array {
  const n = size * size;
  const radius = Math.ceil(sigma * 3.5);
  const kernel: [number, number, number][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) kernel.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))]);
  }
  const energy = new Float64Array(n);
  const bits = new Uint8Array(n);
  const splat = (i: number, sign: number) => {
    const x = i % size;
    const y = (i / size) | 0;
    for (const [dx, dy, w] of kernel) {
      const k = ((y + dy + size) % size) * size + ((x + dx + size) % size);
      energy[k] = (energy[k] ?? 0) + sign * w;
    }
  };
  const tightestCluster = () => {
    let best = -1, bestE = -Infinity;
    for (let i = 0; i < n; i++) { const e = energy[i] ?? 0; if (bits[i] && e > bestE) { bestE = e; best = i; } }
    return best;
  };
  const largestVoid = () => {
    let best = -1, bestE = Infinity;
    for (let i = 0; i < n; i++) { const e = energy[i] ?? 0; if (!bits[i] && e < bestE) { bestE = e; best = i; } }
    return best;
  };

  const rand = mulberry32(seed);
  const initial = Math.max(1, Math.floor(n / 10));
  for (let placed = 0; placed < initial;) {
    const i = Math.floor(rand() * n);
    if (!bits[i]) { bits[i] = 1; splat(i, 1); placed++; }
  }
  for (let iter = 0; iter < n; iter++) {
    const c = tightestCluster();
    bits[c] = 0; splat(c, -1);
    const v = largestVoid();
    bits[v] = 1; splat(v, 1);
    if (v === c) break;
  }
  const rank = new Int32Array(n);
  const protoBits = bits.slice();
  const protoEnergy = energy.slice();
  for (let r = initial - 1; r >= 0; r--) {
    const c = tightestCluster();
    bits[c] = 0; splat(c, -1);
    rank[c] = r;
  }
  bits.set(protoBits);
  energy.set(protoEnergy);
  for (let r = initial; r < n; r++) {
    const v = largestVoid();
    bits[v] = 1; splat(v, 1);
    rank[v] = r;
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = ((rank[i] ?? 0) + 0.5) / n;
  return out;
}

const cache: { bayer: Record<number, number[]>; cluster: Record<number, number[]>; blue: Float32Array | null } = {
  bayer: {},
  cluster: {},
  blue: null,
};
const BLUE_SIZE = 64;

function blueNoise(): Float32Array {
  if (!cache.blue) cache.blue = buildBlueNoise(BLUE_SIZE, 1.9, 7);
  return cache.blue;
}

const frac = (v: number) => v - Math.floor(v);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Threshold t(x, y, v) in [0, 1]: a value moves up one level when its fractional part exceeds t.
 * `v` is the pixel's own value (0–1), used by patterns that bend with brightness.
 */
export type Threshold = (x: number, y: number, v: number) => number;

export function makeThreshold(o: RenderOptions): Threshold {
  const ox = Math.round(o.originX);
  const oy = Math.round(o.originY);
  const id = o.algorithm;
  const cell = Math.max(2, o.cell);

  if (id.startsWith("bayer-") || id.startsWith("cluster-")) {
    const size = parseInt(id.split("-")[1] ?? "8", 10);
    const table = id.startsWith("bayer-") ? cache.bayer : cache.cluster;
    const m = table[size] ?? (table[size] = id.startsWith("bayer-") ? bayerMatrix(size) : rankMatrix(size, (u, v) => u * u + v * v));
    const area = size * size;
    // Clustered dots grow from the centre: invert the rank so the centre goes dark first.
    const flip = id.startsWith("cluster-");
    return (x, y) => {
      const r = ((m[mod(y + oy, size) * size + mod(x + ox, size)] ?? 0) + 0.5) / area;
      return flip ? 1 - r : r;
    };
  }
  if (id === "blue-noise") {
    const b = blueNoise();
    return (x, y) => b[mod(y + oy, BLUE_SIZE) * BLUE_SIZE + mod(x + ox, BLUE_SIZE)] ?? 0.5;
  }
  if (id === "ign") return (x, y) => frac(52.9829189 * frac(0.06711056 * (x + ox) + 0.00583715 * (y + oy)));
  if (id === "white-noise") return (x, y) => hash2(x + ox, y + oy, o.seed);
  if (id === "xerox") {
    // Clumpy noise: value noise at 2px plus a little fine grain, like toner on a photocopy.
    const s = o.seed;
    const lattice = (x: number, y: number) => {
      const fx = (x + ox) / 2, fy = (y + oy) / 2;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    return (x, y) => Math.min(1, Math.max(0, 0.5 + (lattice(x, y) - 0.5) * 1.6 + (hash2(x + ox, y + oy, s + 7) - 0.5) * 0.25));
  }
  if (id.startsWith("halftone-")) {
    const a = (o.angle * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const k = (2 * Math.PI) / cell;
    const shape = id.slice(9);
    return (x, y) => {
      const px = x + ox + 0.5, py = y + oy + 0.5;
      const u = px * ca + py * sa;
      const v = -px * sa + py * ca;
      if (shape === "line") return 0.5 + 0.5 * Math.cos(k * v);
      if (shape === "cross") {
        // Two triangle-wave line screens. Their union covers 1-(1-f)² of the cell, so squaring the
        // threshold keeps total ink coverage equal to darkness.
        const tu = 1 - Math.abs(2 * frac(u / cell) - 1), tv = 1 - Math.abs(2 * frac(v / cell) - 1);
        return Math.max(tu, tv) ** 2;
      }
      if (shape === "diamond") return 1 - (Math.abs(frac(u / cell) - 0.5) + Math.abs(frac(v / cell) - 0.5));
      if (shape === "ellipse") return 0.5 + 0.3 * Math.cos(k * u) + 0.2 * Math.cos(k * v);
      return 0.5 + 0.25 * (Math.cos(k * u) + Math.cos(k * v));
    };
  }
  if (id.startsWith("mosaic-")) {
    // Area-linear dots on a square grid. Values are already averaged per cell (see render).
    const square = id === "mosaic-square";
    return (x, y) => {
      const du = frac((x + ox + 0.5) / cell) - 0.5;
      const dv = frac((y + oy + 0.5) / cell) - 0.5;
      const area = square ? (2 * Math.max(Math.abs(du), Math.abs(dv))) ** 2 : Math.PI * (du * du + dv * dv);
      return Math.max(0, 1 - area);
    };
  }
  if (id.startsWith("beam-")) {
    // Scan lines whose thickness follows darkness and whose position bends with brightness.
    const vertical = id === "beam-v";
    return (x, y, v) => {
      const along = vertical ? x + ox : y + oy;
      const phase = frac((along + v * cell * 0.75) / cell);
      return 1 - Math.abs(2 * phase - 1);
    };
  }
  return () => 0.5;
}

// ---------------------------------------------------------------- pre-processing

function boxBlur(buf: Uint8ClampedArray, w: number, h: number, channels: number, radius: number): void {
  const r = Math.round(radius);
  if (r < 1) return;
  const tmp = new Float32Array(Math.max(w, h));
  const win = 2 * r + 1;
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += buf[(row + Math.min(w - 1, Math.max(0, i))) * channels + c] ?? 0;
      for (let x = 0; x < w; x++) {
        tmp[x] = sum / win;
        sum += (buf[(row + Math.min(w - 1, x + r + 1)) * channels + c] ?? 0) - (buf[(row + Math.max(0, x - r)) * channels + c] ?? 0);
      }
      for (let x = 0; x < w; x++) buf[(row + x) * channels + c] = tmp[x] ?? 0;
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += buf[(Math.min(h - 1, Math.max(0, i)) * w + x) * channels + c] ?? 0;
      for (let y = 0; y < h; y++) {
        tmp[y] = sum / win;
        sum += (buf[(Math.min(h - 1, y + r + 1) * w + x) * channels + c] ?? 0) - (buf[(Math.max(0, y - r) * w + x) * channels + c] ?? 0);
      }
      for (let y = 0; y < h; y++) buf[(y * w + x) * channels + c] = tmp[y] ?? 0;
    }
  }
}

function median3(buf: Uint8ClampedArray, w: number, h: number, amount: number): void {
  const src = new Uint8ClampedArray(buf);
  const win = new Array<number>(9);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            win[k++] = src[(yy * w + xx) * 3 + c] ?? 0;
          }
        }
        win.sort((a, b) => a - b);
        const i = (y * w + x) * 3 + c;
        const own = src[i] ?? 0;
        buf[i] = own + ((win[4] ?? own) - own) * amount;
      }
    }
  }
}

export function levelsLut(l: Levels, invert: boolean): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, l.inWhite - l.inBlack);
  const g = 1 / Math.max(0.1, l.gamma);
  for (let i = 0; i < 256; i++) {
    let v = Math.min(1, Math.max(0, (i - l.inBlack) / span));
    v = Math.pow(v, g);
    v = (l.outBlack + v * (l.outWhite - l.outBlack)) / 255;
    if (invert) v = 1 - v;
    lut[i] = Math.round(v * 255);
  }
  return lut;
}

export interface Prepared {
  w: number;
  h: number;
  rgb: Uint8ClampedArray;
  alpha: Uint8ClampedArray;
  pixelSize: number;
  o: RenderOptions;
}

/** Downsamples by pixelSize (alpha-weighted box average) and applies denoise, blur, sharpen and levels. */
export function prepare(src: Pixels, opts: Partial<RenderOptions>): Prepared {
  const o: RenderOptions = { ...DEFAULTS, ...opts, levels: { ...DEFAULT_LEVELS, ...(opts.levels || {}) } };
  const { data, width: W, height: H, components: C } = src;
  const p = Math.max(1, Math.round(o.pixelSize));
  const w = Math.ceil(W / p);
  const h = Math.ceil(H / p);
  const rgb = new Uint8ClampedArray(w * h * 3);
  const alpha = new Uint8ClampedArray(w * h);

  for (let by = 0; by < h; by++) {
    const y0 = by * p, y1 = Math.min(H, y0 + p);
    for (let bx = 0; bx < w; bx++) {
      const x0 = bx * p, x1 = Math.min(W, x0 + p);
      let r = 0, g = 0, b = 0, as = 0, count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * C;
          const a = C === 4 ? (data[i + 3] ?? 0) : 255;
          r += (data[i] ?? 0) * a; g += (data[i + 1] ?? 0) * a; b += (data[i + 2] ?? 0) * a;
          as += a; count++;
        }
      }
      const j = by * w + bx;
      if (as > 0) { rgb[j * 3] = r / as; rgb[j * 3 + 1] = g / as; rgb[j * 3 + 2] = b / as; }
      alpha[j] = as / count;
    }
  }

  if (o.denoise > 0) median3(rgb, w, h, Math.min(1, o.denoise));
  if (o.blur > 0) { boxBlur(rgb, w, h, 3, o.blur); boxBlur(rgb, w, h, 3, o.blur); }
  if (o.sharpen > 0) {
    const soft = new Uint8ClampedArray(rgb);
    boxBlur(soft, w, h, 3, 1);
    for (let i = 0; i < rgb.length; i++) { const v = rgb[i] ?? 0; rgb[i] = v + o.sharpen * (v - (soft[i] ?? v)); }
  }
  const lut = levelsLut(o.levels, o.invert);
  for (let i = 0; i < rgb.length; i++) rgb[i] = lut[rgb[i] ?? 0] ?? 0;

  return { w, h, rgb, alpha, pixelSize: p, o };
}

/** Replaces each cell×cell block (aligned to the pattern origin) with its average color. */
function cellAverage(rgb: Uint8ClampedArray, alpha: Uint8ClampedArray, w: number, h: number, cell: number, ox: number, oy: number): void {
  const c = Math.max(2, Math.round(cell));
  const offX = mod(-ox, c), offY = mod(-oy, c);
  for (let y0 = offY - c; y0 < h; y0 += c) {
    for (let x0 = offX - c; x0 < w; x0 += c) {
      const ys = Math.max(0, y0), ye = Math.min(h, y0 + c), xs = Math.max(0, x0), xe = Math.min(w, x0 + c);
      if (ys >= ye || xs >= xe) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
        const j = y * w + x;
        if (alpha[j] === 0) continue;
        r += rgb[j * 3] ?? 0; g += rgb[j * 3 + 1] ?? 0; b += rgb[j * 3 + 2] ?? 0; n++;
      }
      if (!n) continue;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) {
        const j = y * w + x;
        rgb[j * 3] = r / n; rgb[j * 3 + 1] = g / n; rgb[j * 3 + 2] = b / n;
      }
    }
  }
}

// ---------------------------------------------------------------- scalar dithering (mono, tone, rgb)

export function ditherScalar(plane: Uint8ClampedArray, w: number, h: number, levels: number, alpha: Uint8ClampedArray, o: RenderOptions): Uint8Array {
  const out = new Uint8Array(w * h);
  const L1 = Math.max(1, levels - 1);
  const step = 255 / L1;
  const s = o.strength;
  const kernel = KERNELS[o.algorithm];

  if (kernel) {
    let rows: [Float32Array, Float32Array, Float32Array] = [new Float32Array(w), new Float32Array(w), new Float32Array(w)];
    const taps = kernel.taps;
    for (let y = 0; y < h; y++) {
      const reverse = o.serpentine && (y & 1) === 1;
      const dir = reverse ? -1 : 1;
      const err0 = rows[0];
      for (let i = 0; i < w; i++) {
        const x = reverse ? w - 1 - i : i;
        const idx = y * w + x;
        if (alpha[idx] === 0) continue;
        const v = (plane[idx] ?? 0) + (err0[x] ?? 0);
        let q = Math.round(v / step);
        q = q < 0 ? 0 : q > L1 ? L1 : q;
        out[idx] = q;
        const e = ((v - q * step) * s) / kernel.div;
        for (const [dx, dy, wt] of taps) {
          const xx = x + dx * dir;
          const row = rows[dy];
          if (xx < 0 || xx >= w || !row) continue;
          row[xx] = (row[xx] ?? 0) + e * wt;
        }
      }
      err0.fill(0);
      rows = [rows[1], rows[2], err0];
    }
    return out;
  }

  const t = makeThreshold(o);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pv = plane[idx] ?? 0;
      const v = pv / step;
      const base = Math.floor(v);
      const th = 0.5 + (t(x, y, pv / 255) - 0.5) * s;
      const q = base + (v - base > th ? 1 : 0);
      out[idx] = q > L1 ? L1 : q;
    }
  }
  return out;
}

// ---------------------------------------------------------------- palette dithering (indexed)

export function makeNearest(palette: RGB[]): (r: number, g: number, b: number) => number {
  const n = palette.length;
  const memo = new Int16Array(1 << 18).fill(-1); // 6 bits per channel
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = memo[key] ?? -1;
    if (hit >= 0) return hit;
    let best = 0, bestD = Infinity;
    const c = [r, g, b];
    for (let i = 0; i < n; i++) {
      const d = colorDistance(c, palette[i] ?? c);
      if (d < bestD) { bestD = d; best = i; }
    }
    memo[key] = best;
    return best;
  };
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function ditherPalette(rgb: Uint8ClampedArray, w: number, h: number, palette: RGB[], alpha: Uint8ClampedArray, o: RenderOptions): Uint8Array {
  const out = new Uint8Array(w * h);
  const nearest = makeNearest(palette);
  const kernel = KERNELS[o.algorithm];
  const s = o.strength;

  if (kernel) {
    let rows: [Float32Array, Float32Array, Float32Array] = [new Float32Array(w * 3), new Float32Array(w * 3), new Float32Array(w * 3)];
    const taps = kernel.taps;
    for (let y = 0; y < h; y++) {
      const reverse = o.serpentine && (y & 1) === 1;
      const dir = reverse ? -1 : 1;
      const e0 = rows[0];
      for (let i = 0; i < w; i++) {
        const x = reverse ? w - 1 - i : i;
        const idx = y * w + x;
        if (alpha[idx] === 0) continue;
        const r = clamp255((rgb[idx * 3] ?? 0) + (e0[x * 3] ?? 0));
        const g = clamp255((rgb[idx * 3 + 1] ?? 0) + (e0[x * 3 + 1] ?? 0));
        const b = clamp255((rgb[idx * 3 + 2] ?? 0) + (e0[x * 3 + 2] ?? 0));
        const k = nearest(r | 0, g | 0, b | 0);
        out[idx] = k;
        const [cr, cg, cb] = palette[k] ?? [r, g, b];
        const er = ((r - cr) * s) / kernel.div;
        const eg = ((g - cg) * s) / kernel.div;
        const eb = ((b - cb) * s) / kernel.div;
        for (const [dx, dy, wt] of taps) {
          const xx = x + dx * dir;
          const row = rows[dy];
          if (xx < 0 || xx >= w || !row) continue;
          row[xx * 3] = (row[xx * 3] ?? 0) + er * wt;
          row[xx * 3 + 1] = (row[xx * 3 + 1] ?? 0) + eg * wt;
          row[xx * 3 + 2] = (row[xx * 3 + 2] ?? 0) + eb * wt;
        }
      }
      e0.fill(0);
      rows = [rows[1], rows[2], e0];
    }
    return out;
  }

  const t = makeThreshold(o);
  const spread = (255 / Math.cbrt(palette.length)) * s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const r = rgb[idx * 3] ?? 0, g = rgb[idx * 3 + 1] ?? 0, b = rgb[idx * 3 + 2] ?? 0;
      const lum = luminance([r, g, b]) / 255;
      const off = (0.5 - t(x, y, lum)) * spread;
      out[idx] = nearest(clamp255(r + off) | 0, clamp255(g + off) | 0, clamp255(b + off) | 0);
    }
  }
  return out;
}

// ---------------------------------------------------------------- palette extraction

/** Median cut followed by a few k-means passes. Returns up to n colors from opaque pixels, dark to light. */
export function extractPalette(rgb: Uint8ClampedArray, alpha: Uint8ClampedArray, n: number): RGB[] {
  const total = alpha.length;
  const stride = Math.max(1, Math.floor(total / 60000));
  const samples: number[] = [];
  for (let i = 0; i < total; i += stride) {
    if ((alpha[i] ?? 0) < 128) continue;
    samples.push(rgb[i * 3] ?? 0, rgb[i * 3 + 1] ?? 0, rgb[i * 3 + 2] ?? 0);
  }
  const count = samples.length / 3;
  if (count === 0) return [[0, 0, 0], [255, 255, 255]];
  const sample = (i: number, c: number) => samples[i * 3 + c] ?? 0;

  const boxRange = (idx: number[]) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const i of idx) for (let c = 0; c < 3; c++) {
      const v = sample(i, c);
      if (v < (lo[c] ?? 255)) lo[c] = v;
      if (v > (hi[c] ?? 0)) hi[c] = v;
    }
    const ranges = [0, 1, 2].map((c) => (hi[c] ?? 0) - (lo[c] ?? 0));
    const channel = ranges.indexOf(Math.max(...ranges));
    return { channel, range: ranges[channel] ?? 0 };
  };

  const boxes: number[][] = [Array.from({ length: count }, (_, i) => i)];
  while (boxes.length < n) {
    let pick = -1, pickScore = 0, pickChannel = 0;
    boxes.forEach((idx, bi) => {
      if (idx.length < 2) return;
      const { channel, range } = boxRange(idx);
      const score = range * Math.sqrt(idx.length);
      if (score > pickScore) { pickScore = score; pick = bi; pickChannel = channel; }
    });
    const chosen = boxes[pick];
    if (pick < 0 || !chosen) break;
    const idx = chosen.sort((a, b) => sample(a, pickChannel) - sample(b, pickChannel));
    const mid = idx.length >> 1;
    boxes.splice(pick, 1, idx.slice(0, mid), idx.slice(mid));
  }

  let centers: [number, number, number][] = boxes.map((idx) => {
    let r = 0, g = 0, b = 0;
    for (const i of idx) { r += sample(i, 0); g += sample(i, 1); b += sample(i, 2); }
    return [r / idx.length, g / idx.length, b / idx.length];
  });

  for (let iter = 0; iter < 6; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0] as [number, number, number, number]);
    for (let i = 0; i < count; i++) {
      const r = sample(i, 0), g = sample(i, 1), b = sample(i, 2);
      let best = 0, bestD = Infinity;
      centers.forEach(([cr, cg, cb], k) => {
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      });
      const acc = sums[best];
      if (acc) { acc[0] += r; acc[1] += g; acc[2] += b; acc[3]++; }
    }
    centers = centers.map((c, k) => {
      const [sr, sg, sb, sn] = sums[k] ?? [0, 0, 0, 0];
      return sn ? [sr / sn, sg / sn, sb / sn] : c;
    });
  }

  const seen = new Set<string>();
  const out: RGB[] = [];
  for (const c of centers) {
    const v: RGB = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
    const key = v.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(v); }
  }
  out.sort((a, b) => luminance(a) - luminance(b));
  return out;
}

export function autoPalette(src: Pixels, opts: Partial<RenderOptions>, n: number): RGB[] {
  const { rgb, alpha } = prepare(src, { ...opts, pixelSize: 1, blur: 0, sharpen: 0 });
  return extractPalette(rgb, alpha, n);
}

/** 256-bin luminance histogram of the opaque pixels. */
export function histogram(src: Pixels): number[] {
  const bins = new Array<number>(256).fill(0);
  const { data, components: C } = src;
  const n = src.width * src.height;
  const stride = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += stride) {
    const j = i * C;
    if (C === 4 && (data[j + 3] ?? 0) < 128) continue;
    const bin = Math.round(luminance([data[j] ?? 0, data[j + 1] ?? 0, data[j + 2] ?? 0]));
    bins[bin] = (bins[bin] ?? 0) + 1;
  }
  return bins;
}

// ---------------------------------------------------------------- render

/** The colors a render can produce, used to snap rounded edges back onto them. */
export function outputColors(o: RenderOptions): RGB[] {
  if (o.mode === "indexed") return o.palette && o.palette.length ? o.palette : [[0, 0, 0], [255, 255, 255]];
  if (o.mode === "rgb") {
    const L = Math.max(2, Math.round(o.rgbLevels));
    const vals = Array.from({ length: L }, (_, k) => Math.round((k * 255) / (L - 1)));
    const out: RGB[] = [];
    for (const r of vals) for (const g of vals) for (const b of vals) out.push([r, g, b]);
    return out;
  }
  const L = o.mode === "mono" ? 2 : Math.max(2, Math.round(o.steps));
  return Array.from({ length: L }, (_, k) => {
    const t = k / (L - 1);
    const mix = (c: 0 | 1 | 2) => Math.round(o.dark[c] + (o.light[c] - o.dark[c]) * t);
    return [mix(0), mix(1), mix(2)] as RGB;
  });
}

export function render(src: Pixels, opts: Partial<RenderOptions>): Pixels {
  const prep = prepare(src, opts);
  const { w, h, rgb, alpha, pixelSize: p, o } = prep;
  if (algorithmInfo(o.algorithm).family === "mosaic") cellAverage(rgb, alpha, w, h, o.cell, o.originX, o.originY);

  const colors = outputColors(o);
  const work = new Uint8ClampedArray(w * h * 3);

  if (o.mode === "indexed") {
    const idx = ditherPalette(rgb, w, h, colors, alpha, o);
    for (let i = 0; i < idx.length; i++) work.set(colors[idx[i] ?? 0] ?? [0, 0, 0], i * 3);
  } else if (o.mode === "rgb") {
    const L = Math.max(2, Math.round(o.rgbLevels));
    const plane = new Uint8ClampedArray(w * h);
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < plane.length; i++) plane[i] = rgb[i * 3 + c] ?? 0;
      const q = ditherScalar(plane, w, h, L, alpha, o);
      for (let i = 0; i < q.length; i++) work[i * 3 + c] = Math.round(((q[i] ?? 0) * 255) / (L - 1));
    }
  } else {
    const plane = new Uint8ClampedArray(w * h);
    for (let i = 0; i < plane.length; i++) plane[i] = luminance([rgb[i * 3] ?? 0, rgb[i * 3 + 1] ?? 0, rgb[i * 3 + 2] ?? 0]);
    const q = ditherScalar(plane, w, h, colors.length, alpha, o);
    for (let i = 0; i < q.length; i++) work.set(colors[q[i] ?? 0] ?? [0, 0, 0], i * 3);
  }

  return upscale(src, work, alpha, w, h, p, o, colors);
}

function upscale(src: Pixels, work: Uint8ClampedArray, alpha: Uint8ClampedArray, w: number, h: number, p: number, o: RenderOptions, colors: RGB[]): Pixels {
  const { width: W, height: H, components: C } = src;
  const out = new Uint8Array(W * H * C);
  const smooth = p > 1 && o.edge === "soft";
  const bias = o.bleed * 96;
  const px = [0, 0, 0];

  // Rounded: upscale, blur by about half a block, then snap back onto the output colors.
  // The blur turns square blocks into round blobs; bleed shifts where the snap cuts.
  let rounded: Uint8ClampedArray | null = null;
  if (p > 1 && o.edge === "rounded") {
    rounded = new Uint8ClampedArray(W * H * 3);
    for (let y = 0; y < H; y++) {
      const ny = Math.min(h - 1, (y / p) | 0);
      for (let x = 0; x < W; x++) {
        const j = (ny * w + Math.min(w - 1, (x / p) | 0)) * 3;
        rounded[(y * W + x) * 3] = work[j] ?? 0; rounded[(y * W + x) * 3 + 1] = work[j + 1] ?? 0; rounded[(y * W + x) * 3 + 2] = work[j + 2] ?? 0;
      }
    }
    // Three box passes approximate a Gaussian, which is round; fewer passes leave diamond shapes.
    const r = Math.max(1, Math.round(p * 0.3));
    boxBlur(rounded, W, H, 3, r);
    boxBlur(rounded, W, H, 3, r);
    boxBlur(rounded, W, H, 3, r);
    const snap = makeNearest(colors);
    for (let i = 0; i < W * H; i++) {
      const k = snap(clamp255((rounded[i * 3] ?? 0) + bias) | 0, clamp255((rounded[i * 3 + 1] ?? 0) + bias) | 0, clamp255((rounded[i * 3 + 2] ?? 0) + bias) | 0);
      const [kr, kg, kb] = colors[k] ?? [0, 0, 0];
      rounded[i * 3] = kr; rounded[i * 3 + 1] = kg; rounded[i * 3 + 2] = kb;
    }
  }

  for (let y = 0; y < H; y++) {
    const wy = (y + 0.5) / p - 0.5;
    const y0 = Math.max(0, Math.min(h - 1, Math.floor(wy)));
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, wy - y0));
    const ny = Math.min(h - 1, (y / p) | 0);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const nx = Math.min(w - 1, (x / p) | 0);
      const jn = ny * w + nx;
      if (rounded) {
        const j = (y * W + x) * 3;
        out[i] = rounded[j] ?? 0; out[i + 1] = rounded[j + 1] ?? 0; out[i + 2] = rounded[j + 2] ?? 0;
      } else if (smooth) {
        const wx = (x + 0.5) / p - 0.5;
        const x0 = Math.max(0, Math.min(w - 1, Math.floor(wx)));
        const x1 = Math.min(w - 1, x0 + 1);
        const tx = Math.min(1, Math.max(0, wx - x0));
        for (let c = 0; c < 3; c++) {
          const a = work[(y0 * w + x0) * 3 + c] ?? 0, b = work[(y0 * w + x1) * 3 + c] ?? 0;
          const d = work[(y1 * w + x0) * 3 + c] ?? 0, e = work[(y1 * w + x1) * 3 + c] ?? 0;
          px[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
        }
        out[i] = px[0] ?? 0; out[i + 1] = px[1] ?? 0; out[i + 2] = px[2] ?? 0;
      } else {
        out[i] = work[jn * 3] ?? 0; out[i + 1] = work[jn * 3 + 1] ?? 0; out[i + 2] = work[jn * 3 + 2] ?? 0;
      }
      if (C === 4) {
        const a = alpha[jn] ?? 0;
        out[i + 3] = o.alphaThreshold > 0 ? (a >= o.alphaThreshold ? 255 : 0) : a;
      }
    }
  }
  return { data: out, width: W, height: H, components: C };
}

/** Index of each output color per pixel, for color-separated output. Pixels that match no color get 255. */
export function separate(img: Pixels, colors: RGB[]): Uint8Array {
  const n = img.width * img.height;
  const out = new Uint8Array(n).fill(255);
  const nearest = makeNearest(colors);
  for (let i = 0; i < n; i++) {
    const j = i * img.components;
    if (img.components === 4 && img.data[j + 3] === 0) continue;
    out[i] = nearest(img.data[j] ?? 0, img.data[j + 1] ?? 0, img.data[j + 2] ?? 0);
  }
  return out;
}

/** Scales an image down with a box filter so its longest side is at most `max`. */
export function downscale(src: Pixels, max: number): Pixels {
  const k = Math.max(src.width, src.height) / max;
  if (k <= 1) return src;
  const w = Math.max(1, Math.round(src.width / k)), h = Math.max(1, Math.round(src.height / k));
  const C = src.components;
  const out = new Uint8Array(w * h * C);
  for (let y = 0; y < h; y++) {
    const ys = Math.floor(y * k), ye = Math.max(ys + 1, Math.floor((y + 1) * k));
    for (let x = 0; x < w; x++) {
      const xs = Math.floor(x * k), xe = Math.max(xs + 1, Math.floor((x + 1) * k));
      const acc = [0, 0, 0, 0];
      let n = 0;
      for (let yy = ys; yy < ye && yy < src.height; yy++) for (let xx = xs; xx < xe && xx < src.width; xx++) {
        const j = (yy * src.width + xx) * C;
        for (let c = 0; c < C; c++) acc[c] = (acc[c] ?? 0) + (src.data[j + c] ?? 0);
        n++;
      }
      for (let c = 0; c < C; c++) out[(y * w + x) * C + c] = (acc[c] ?? 0) / Math.max(1, n);
    }
  }
  return { data: out, width: w, height: h, components: C };
}
