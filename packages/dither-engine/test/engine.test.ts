import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import {
  ALGORITHMS, FAMILIES, KERNELS, autoPalette, bayerMatrix, buildBlueNoise, downscale, histogram, levelsLut,
  outputColors, rankMatrix, render, separate, DEFAULTS,
} from "../src/engine.ts";
import { PALETTES, mergeNearDuplicates, parseHex, toHex } from "../src/palettes.ts";
import { parseAco, parseAse, parseGpl, toGpl } from "../src/palette-files.ts";
import { base64, encodePng } from "../src/png.ts";
import type { Pixels, RGB } from "../src/types.ts";

function flat(w: number, h: number, rgb: number[], a = 255): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, a], i * 4);
  return { data, width: w, height: h, components: 4 };
}

function grayRamp(w: number, h: number): Pixels {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.fill(Math.round((x / (w - 1)) * 255), (y * w + x) * 3, (y * w + x) * 3 + 3);
  return { data, width: w, height: h, components: 3 };
}

function mean(img: Pixels, c = 0): number {
  let s = 0;
  for (let i = 0; i < img.width * img.height; i++) s += img.data[i * img.components + c] ?? 0;
  return s / (img.width * img.height);
}

const key = (img: Pixels, i: number) => Array.from(img.data.slice(i * img.components, i * img.components + 3)).join(",");

test("every algorithm belongs to a known family, and there are 30+", () => {
  const families = new Set(FAMILIES.map((f) => f.id));
  for (const a of ALGORITHMS) assert.ok(families.has(a.family), a.id);
  assert.ok(ALGORITHMS.length >= 30, String(ALGORITHMS.length));
  assert.equal(new Set(ALGORITHMS.map((a) => a.id)).size, ALGORITHMS.length);
});

test("bayer and clustered matrices are permutations of 0..n²-1", () => {
  for (const n of [2, 4, 8, 16]) assert.deepEqual([...bayerMatrix(n)].sort((a, b) => a - b), Array.from({ length: n * n }, (_, i) => i));
  assert.deepEqual(bayerMatrix(2), [0, 2, 3, 1]);
  const c = rankMatrix(4, (u, v) => u * u + v * v);
  assert.deepEqual([...c].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
});

test("blue noise ranks every cell exactly once", () => {
  const b = buildBlueNoise(16, 1.5, 3);
  const ranks = [...b].map((v) => Math.round(v * 256 - 0.5)).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 256 }, (_, i) => i));
});

test("diffusion kernels are normalised", () => {
  for (const [id, k] of Object.entries(KERNELS)) {
    const sum = k.taps.reduce((s, t) => s + t[2], 0);
    assert.equal(sum, id === "atkinson" ? 6 : k.div, id);
  }
  for (const a of ALGORITHMS.filter((x) => x.family === "diffusion")) assert.ok(KERNELS[a.id], a.id);
});

test("every algorithm keeps the average tone of a gradient (1-bit)", () => {
  const src = grayRamp(256, 64);
  const target = mean(src);
  const loose: Record<string, number> = { threshold: 3, atkinson: 12, xerox: 20, "beam-h": 16, "beam-v": 16, "halftone-ellipse": 14, "halftone-cross": 14, "mosaic-round": 14, "mosaic-square": 14, "cluster-8": 12, "cluster-4": 12 };
  for (const a of ALGORITHMS) {
    const out = render(src, { algorithm: a.id });
    for (let i = 0; i < out.data.length; i++) assert.ok(out.data[i] === 0 || out.data[i] === 255);
    const tolerance = loose[a.id] ?? 9;
    assert.ok(Math.abs(mean(out) - target) < tolerance, `${a.id}: ${mean(out).toFixed(1)} vs ${target.toFixed(1)}`);
  }
});

test("tone mode maps onto the dark/light ramp; mono is always two colors", () => {
  const out = render(grayRamp(64, 8), { algorithm: "bayer-4", mode: "tone", steps: 3, dark: [10, 20, 30], light: [210, 220, 230] });
  const seen = new Set<string>();
  for (let i = 0; i < out.width * out.height; i++) seen.add(key(out, i));
  assert.deepEqual([...seen].sort(), ["10,20,30", "110,120,130", "210,220,230"]);
  assert.equal(outputColors({ ...DEFAULTS, mode: "mono", steps: 9 }).length, 2);
});

test("indexed mode only emits palette colors, and exact colors stay exact", () => {
  const pico = PALETTES.find((p) => p.id === "pico8")!.colors;
  const allowed = new Set(pico.map((c) => c.join(",")));
  for (const algorithm of ["floyd-steinberg", "bayer-8", "halftone-dot", "mosaic-round", "beam-h"]) {
    const out = render(grayRamp(64, 16), { mode: "indexed", palette: pico, algorithm });
    for (let i = 0; i < out.width * out.height; i++) assert.ok(allowed.has(key(out, i)), algorithm);
  }
  const red = render(flat(8, 8, [255, 0, 77]), { mode: "indexed", palette: pico, algorithm: "floyd-steinberg" });
  assert.deepEqual(Array.from(red.data.slice(0, 3)), [255, 0, 77]);
});

test("rgb mode with 2 levels yields the 8 cube corners", () => {
  const out = render(flat(32, 32, [200, 60, 120]), { mode: "rgb", rgbLevels: 2 });
  for (let i = 0; i < out.data.length; i++) if (i % 4 !== 3) assert.ok(out.data[i] === 0 || out.data[i] === 255);
  assert.ok(Math.abs(mean(out, 0) - 200) < 10);
  assert.ok(Math.abs(mean(out, 1) - 60) < 10);
});

test("pixel size renders constant blocks with crisp edges", () => {
  const out = render(grayRamp(50, 21), { pixelSize: 4, algorithm: "floyd-steinberg" });
  assert.equal(out.width, 50);
  assert.equal(out.height, 21);
  for (let y = 0; y < 20; y++) for (let x = 0; x < 48; x++) {
    assert.equal(out.data[(y * 50 + x) * 3], out.data[((y - (y % 4)) * 50 + x - (x % 4)) * 3]);
  }
});

test("rounded edges stay on the output colors; soft edges blend", () => {
  const colors = new Set(["0,0,0", "255,255,255"]);
  const rounded = render(grayRamp(64, 32), { pixelSize: 6, edge: "rounded", algorithm: "bayer-4" });
  for (let i = 0; i < rounded.width * rounded.height; i++) assert.ok(colors.has(key(rounded, i)));
  const soft = render(grayRamp(64, 32), { pixelSize: 6, edge: "soft", algorithm: "bayer-4" });
  let between = 0;
  for (let i = 0; i < soft.width * soft.height; i++) if (!colors.has(key(soft, i))) between++;
  assert.ok(between > 0);
  const grown = render(flat(40, 40, [128, 128, 128]), { pixelSize: 5, edge: "rounded", bleed: 0.8, algorithm: "bayer-4" });
  const shrunk = render(flat(40, 40, [128, 128, 128]), { pixelSize: 5, edge: "rounded", bleed: -0.8, algorithm: "bayer-4" });
  assert.ok(mean(grown) > mean(shrunk));
});

test("alpha is preserved, and the alpha threshold cuts it", () => {
  const src = flat(8, 8, [128, 128, 128], 100);
  src.data[3] = 0;
  const soft = render(src, {});
  assert.equal(soft.data[3], 0);
  assert.equal(soft.data[7], 100);
  assert.equal(render(src, { alphaThreshold: 128 }).data[7], 0);
  assert.equal(render(flat(4, 4, [10, 10, 10], 200), { alphaThreshold: 128 }).data[3], 255);
});

test("levels: input range, gamma, output range and invert", () => {
  const id = levelsLut({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 }, false);
  assert.equal(id[0], 0); assert.equal(id[128], 128); assert.equal(id[255], 255);
  const clip = levelsLut({ inBlack: 50, inWhite: 200, gamma: 1, outBlack: 0, outWhite: 255 }, false);
  assert.equal(clip[50], 0); assert.equal(clip[200], 255); assert.equal(clip[20], 0);
  const out = levelsLut({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 40, outWhite: 220 }, false);
  assert.equal(out[0], 40); assert.equal(out[255], 220);
  assert.ok((levelsLut({ inBlack: 0, inWhite: 255, gamma: 2, outBlack: 0, outWhite: 255 }, false)[128] ?? 0) > 160);
  assert.equal(levelsLut({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 }, true)[0], 255);
});

test("denoise removes isolated specks", () => {
  const src = flat(9, 9, [100, 100, 100]);
  src.data.set([255, 255, 255, 255], (4 * 9 + 4) * 4);
  const out = render(src, { denoise: 1, mode: "tone", steps: 256, algorithm: "threshold" });
  assert.ok((out.data[(4 * 9 + 4) * 4] ?? 255) < 140);
});

test("auto palette finds the dominant colors", () => {
  const src = flat(40, 40, [255, 0, 0]);
  for (let i = 0; i < 800; i++) src.data.set([0, 0, 255, 255], i * 4);
  const pal = autoPalette(src, {}, 4).map((c) => c.join(","));
  assert.ok(pal.includes("255,0,0") && pal.includes("0,0,255"), pal.join(" "));
});

test("merging near duplicates averages close colors only", () => {
  const merged = mergeNearDuplicates([[10, 10, 10], [14, 12, 10], [250, 0, 0]], 30);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], [12, 11, 10]);
});

test("separate assigns every opaque pixel to an output color", () => {
  const colors: RGB[] = [[0, 0, 0], [255, 255, 255]];
  const out = render(grayRamp(32, 4), { algorithm: "bayer-4" });
  const idx = separate(out, colors);
  for (let i = 0; i < idx.length; i++) assert.equal(colors[idx[i] ?? 0]?.join(","), key(out, i));
});

test("histogram counts every sampled pixel", () => {
  const h = histogram(flat(10, 10, [255, 255, 255]));
  assert.equal(h[255], 100);
  assert.equal(h.reduce((a, b) => a + b, 0), 100);
});

test("downscale keeps the aspect ratio and averages", () => {
  const d = downscale(flat(400, 200, [60, 120, 180]), 100);
  assert.equal(d.width, 100); assert.equal(d.height, 50);
  assert.deepEqual(Array.from(d.data.slice(0, 4)), [60, 120, 180, 255]);
});

test("palette files: gpl round trip, ase and aco", () => {
  const colors: RGB[] = [[1, 2, 3], [250, 128, 0]];
  assert.deepEqual(parseGpl(toGpl("Test", colors)), colors);

  // ASE with one RGB entry named "A" (1.0, 0.5, 0.0)
  const ase = new ArrayBuffer(12 + 6 + 2 + 4 + 4 + 12 + 2);
  const v = new DataView(ase);
  v.setUint32(0, 0x41534546); v.setUint16(4, 1); v.setUint16(6, 0); v.setUint32(8, 1);
  v.setUint16(12, 1); v.setUint32(14, 2 + 4 + 4 + 12 + 2);
  v.setUint16(18, 2); v.setUint16(20, 65); v.setUint16(22, 0);
  "RGB ".split("").forEach((ch, i) => v.setUint8(24 + i, ch.charCodeAt(0)));
  v.setFloat32(28, 1); v.setFloat32(32, 0.5); v.setFloat32(36, 0);
  assert.deepEqual(parseAse(ase), [[255, 128, 0]]);

  // ACO v1 with one RGB entry
  const aco = new ArrayBuffer(4 + 10);
  const a = new DataView(aco);
  a.setUint16(0, 1); a.setUint16(2, 1); a.setUint16(4, 0);
  a.setUint16(6, 0x1200); a.setUint16(8, 0x3400); a.setUint16(10, 0x5600);
  assert.deepEqual(parseAco(aco), [[0x12, 0x34, 0x56]]);
});

test("hex helpers round-trip", () => {
  assert.deepEqual(parseHex("#0f380f"), [15, 56, 15]);
  assert.deepEqual(parseHex("abc"), [170, 187, 204]);
  assert.equal(parseHex("nope"), null);
  assert.equal(toHex([15, 56, 15]), "#0f380f");
});

test("png encoder produces a decodable image", () => {
  const png = encodePng(flat(70, 1000, [1, 2, 3], 4));
  const buf = Buffer.from(png);
  const raw = zlib.inflateSync(buf.subarray(41, 41 + buf.readUInt32BE(33)));
  assert.equal(raw.length, (70 * 4 + 1) * 1000);
  assert.deepEqual(Array.from(raw.subarray(1, 5)), [1, 2, 3, 4]);
});

test("base64 matches Node", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 100]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255);
    assert.equal(base64(bytes), Buffer.from(bytes).toString("base64"));
  }
});
