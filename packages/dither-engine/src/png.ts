import type { Pixels } from "./types.ts";

// Minimal PNG encoder using uncompressed (stored) deflate blocks. Used for the panel preview,
// where JPEG would smear the dither pattern, and for the Node sample renderer.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodePng({ data, width, height, components }: Pixels): Uint8Array {
  const hasAlpha = components === 4;
  const outC = hasAlpha ? 4 : 3;
  const rowLen = width * outC + 1;
  const raw = new Uint8Array(rowLen * height);
  for (let y = 0; y < height; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * components;
      const d = y * rowLen + 1 + x * outC;
      raw[d] = data[s]; raw[d + 1] = data[s + 1]; raw[d + 2] = data[s + 2];
      if (hasAlpha) raw[d + 3] = data[s + 3];
    }
  }

  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlibLen = 2 + raw.length + blocks * 5 + 4;
  const chunks: [string, number][] = [
    ["IHDR", 13],
    ["IDAT", zlibLen],
    ["IEND", 0],
  ];
  const total = 8 + chunks.reduce((n, [, len]) => n + 12 + len, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let p = 8;

  const begin = (type: string, len: number): number => {
    view.setUint32(p, len);
    for (let i = 0; i < 4; i++) out[p + 4 + i] = type.charCodeAt(i);
    p += 8;
    return p - 4; // CRC covers type + data
  };
  const end = (crcStart: number): void => {
    view.setUint32(p, crc32(out, crcStart, p));
    p += 4;
  };

  let c = begin("IHDR", 13);
  view.setUint32(p, width); view.setUint32(p + 4, height);
  out[p + 8] = 8; out[p + 9] = hasAlpha ? 6 : 2; out[p + 10] = 0; out[p + 11] = 0; out[p + 12] = 0;
  p += 13;
  end(c);

  c = begin("IDAT", zlibLen);
  out[p++] = 0x78; out[p++] = 0x01;
  let a = 1, b = 0;
  for (let i = 0; i < raw.length; i++) {
    a = (a + raw[i]) % 65521;
    b = (b + a) % 65521;
  }
  for (let blk = 0; blk < blocks; blk++) {
    const start = blk * 65535;
    const len = Math.min(65535, raw.length - start);
    out[p++] = blk === blocks - 1 ? 1 : 0;
    out[p++] = len & 0xff; out[p++] = len >>> 8;
    out[p++] = ~len & 0xff; out[p++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), p);
    p += len;
  }
  view.setUint32(p, ((b << 16) | a) >>> 0);
  p += 4;
  end(c);

  c = begin("IEND", 0);
  end(c);
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64(bytes: Uint8Array): string {
  let s = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + "=";
  }
  return s;
}

export function pngDataUrl(image: Pixels): string {
  return "data:image/png;base64," + base64(encodePng(image));
}

