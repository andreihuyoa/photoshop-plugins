import type { RGB } from "./types.ts";
import { toHex } from "./palettes.ts";

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** GIMP / Inkscape palette: "GIMP Palette" header, then "R G B name" lines. */
export function parseGpl(text: string): RGB[] {
  const out: RGB[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/);
    if (m) out.push([clamp(+m[1]), clamp(+m[2]), clamp(+m[3])]);
  }
  return out;
}

export function toGpl(name: string, colors: RGB[]): string {
  const lines = ["GIMP Palette", `Name: ${name}`, "Columns: 8", "#"];
  for (const c of colors) lines.push(`${String(c[0]).padStart(3)} ${String(c[1]).padStart(3)} ${String(c[2]).padStart(3)}\t${toHex(c)}`);
  return lines.join("\n") + "\n";
}

function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  return [clamp(255 * (1 - c) * (1 - k)), clamp(255 * (1 - m) * (1 - k)), clamp(255 * (1 - y) * (1 - k))];
}

function labToRgb(L: number, a: number, b: number): RGB {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  x = 0.95047 * f(x); y = f(y); z = 1.08883 * f(z);
  const lin = [x * 3.2406 + y * -1.5372 + z * -0.4986, x * -0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 + y * -0.204 + z * 1.057];
  return lin.map((v) => clamp(255 * (v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v))) as RGB;
}

/** Adobe Swatch Exchange (.ase): RGB, CMYK, LAB and gray entries; groups are flattened. */
export function parseAse(buf: ArrayBuffer): RGB[] {
  const v = new DataView(buf);
  if (v.byteLength < 12 || v.getUint32(0) !== 0x41534546) throw new Error("Not an Adobe Swatch Exchange file.");
  const blocks = v.getUint32(8);
  const out: RGB[] = [];
  let p = 12;
  for (let b = 0; b < blocks && p + 6 <= v.byteLength; b++) {
    const type = v.getUint16(p);
    const len = v.getUint32(p + 2);
    const start = p + 6;
    if (type === 0x0001) {
      const nameLen = v.getUint16(start);
      let q = start + 2 + nameLen * 2;
      const model = String.fromCharCode(v.getUint8(q), v.getUint8(q + 1), v.getUint8(q + 2), v.getUint8(q + 3)).trim();
      q += 4;
      const f = (i: number) => v.getFloat32(q + i * 4);
      if (model === "RGB") out.push([clamp(f(0) * 255), clamp(f(1) * 255), clamp(f(2) * 255)]);
      else if (model === "CMYK") out.push(cmykToRgb(f(0), f(1), f(2), f(3)));
      else if (model === "LAB") out.push(labToRgb(f(0) * 100, f(1), f(2)));
      else if (model === "Gray") out.push([clamp(f(0) * 255), clamp(f(0) * 255), clamp(f(0) * 255)]);
    }
    p = start + len;
  }
  return out;
}

/** Photoshop color swatches (.aco), version 1 or 2: RGB, CMYK, Lab and grayscale entries. */
export function parseAco(buf: ArrayBuffer): RGB[] {
  const v = new DataView(buf);
  const read = (offset: number, withNames: boolean) => {
    const count = v.getUint16(offset + 2);
    const out: RGB[] = [];
    let p = offset + 4;
    for (let i = 0; i < count && p + 10 <= v.byteLength; i++) {
      const space = v.getUint16(p);
      const w = [v.getUint16(p + 2), v.getUint16(p + 4), v.getUint16(p + 6), v.getUint16(p + 8)];
      p += 10;
      if (withNames) { const len = v.getUint32(p); p += 4 + len * 2; }
      if (space === 0) out.push([w[0] >> 8, w[1] >> 8, w[2] >> 8]);
      else if (space === 2) out.push(cmykToRgb(1 - w[0] / 65535, 1 - w[1] / 65535, 1 - w[2] / 65535, 1 - w[3] / 65535));
      else if (space === 7) out.push(labToRgb(w[0] / 100, v.getInt16(p - 6) / 100, v.getInt16(p - 4) / 100));
      else if (space === 8) { const g = clamp(255 - w[0] / 10000 * 255); out.push([g, g, g]); }
    }
    return { out, end: p };
  };
  if (v.byteLength < 4) throw new Error("Not a Photoshop swatches file.");
  const v1 = read(0, false);
  if (v1.end + 4 <= v.byteLength && v.getUint16(v1.end) === 2) {
    try { return read(v1.end, true).out; } catch { /* fall back to version 1 */ }
  }
  return v1.out;
}

/** Picks a parser from the file name. */
export function parsePaletteFile(name: string, data: ArrayBuffer | string): RGB[] {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "gpl" || ext === "txt") return parseGpl(typeof data === "string" ? data : new TextDecoder().decode(data));
  if (typeof data === "string") throw new Error(`Expected binary data for .${ext} files.`);
  if (ext === "ase") return parseAse(data);
  if (ext === "aco") return parseAco(data);
  throw new Error(`Ditherkit can't read .${ext} palettes. Use .ase, .aco or .gpl.`);
}
