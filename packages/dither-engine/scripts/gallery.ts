// Renders the pattern examples used in the README into docs/images/patterns.
// Run with: node scripts/gallery.ts
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PALETTES, render, type Pixels, type RenderOptions } from "../src/index.ts";

/** A gradient sky, ground and a lit sphere: enough tone range to show each pattern. */
function scene(w: number, h: number): Pixels {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = w * 0.6, cy = h * 0.5, r = h * 0.33;
    const d = Math.hypot(x - cx, y - cy) / r;
    let v: number;
    if (d < 1) v = Math.max(0, 1 - Math.hypot(x - (cx - r * 0.35), y - (cy - r * 0.38)) / (r * 1.5)) * 230 + 20;
    else v = y < h * 0.62 ? 235 - 120 * (x / w) : 70 + 30 * (x / w);
    data.fill(Math.max(0, Math.min(255, v)), (y * w + x) * 3, (y * w + x) * 3 + 3);
  }
  return { data, width: w, height: h, components: 3 };
}

/** PNG with real deflate compression (the engine's own encoder stores blocks uncompressed). */
function png(img: Pixels): Buffer {
  const { width: w, height: h, components: c } = img;
  const raw = Buffer.alloc((w * c + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * c + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * w * c, w * c).copy(raw, y * (w * c + 1) + 1);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let k = n; for (let i = 0; i < 8; i++) k = k & 1 ? 0xedb88320 ^ (k >>> 1) : k >>> 1; return k >>> 0; });
  const crc = (b: Buffer) => { let v = 0xffffffff; for (const x of b) v = crcTable[(v ^ x) & 0xff] ^ (v >>> 8); return (v ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const c32 = Buffer.alloc(4); c32.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c32]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = c === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const src = scene(320, 200);
const pico = PALETTES.find((p) => p.id === "pico8")!.colors;
const examples: [string, Partial<RenderOptions>][] = [
  ["floyd-steinberg", { algorithm: "floyd-steinberg" }],
  ["atkinson", { algorithm: "atkinson" }],
  ["bayer-8", { algorithm: "bayer-8" }],
  ["blue-noise", { algorithm: "blue-noise" }],
  ["halftone-dot", { algorithm: "halftone-dot", cell: 7, angle: 45 }],
  ["halftone-line", { algorithm: "halftone-line", cell: 6, angle: 30 }],
  ["mosaic-round", { algorithm: "mosaic-round", cell: 9 }],
  ["beam-h", { algorithm: "beam-h", cell: 6 }],
  ["xerox", { algorithm: "xerox" }],
  ["tone-ramp", { algorithm: "bayer-4", mode: "tone", steps: 4, dark: [27, 36, 51], light: [242, 239, 232] }],
  ["indexed-pico8", { algorithm: "floyd-steinberg", mode: "indexed", palette: pico }],
  ["rounded", { algorithm: "bayer-8", pixelSize: 5, edge: "rounded" }],
];

const out = path.join(import.meta.dirname, "..", "..", "..", "docs", "images", "patterns");
fs.mkdirSync(out, { recursive: true });
for (const [name, opts] of examples) fs.writeFileSync(path.join(out, `${name}.png`), png(render(src, opts)));
console.log(`wrote ${examples.length} images to ${out}`);
