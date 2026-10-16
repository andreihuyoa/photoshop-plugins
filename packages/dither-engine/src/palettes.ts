import type { RGB } from "./types.ts";

/** Parses "#rgb", "rgb", "#rrggbb" or "rrggbb". Returns null when the text isn't a hex color. */
export function parseHex(input: string): RGB | null {
  let s = String(input || "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(rgb: readonly number[]): string {
  return "#" + rgb.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function luminance(c: readonly number[]): number {
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
}

export interface Palette {
  id: string;
  name: string;
  colors: RGB[];
}

const RAW: { id: string; name: string; colors: string[] }[] = [
  { id: "bw", name: "1-bit", colors: ["000000", "ffffff"] },
  { id: "gameboy", name: "Game Boy", colors: ["0f380f", "306230", "8bac0f", "9bbc0f"] },
  { id: "gb-pocket", name: "Game Boy Pocket", colors: ["000000", "555555", "aaaaaa", "ffffff"] },
  { id: "cga", name: "CGA", colors: ["000000", "55ffff", "ff55ff", "ffffff"] },
  { id: "riso", name: "Risograph", colors: ["f2efe6", "ff48b0", "0078bf", "ffe800"] },
  { id: "cmyk", name: "CMYK", colors: ["ffffff", "00aeef", "ec008c", "fff200", "000000"] },
  { id: "sepia", name: "Sepia", colors: ["1c120c", "4a3424", "86664a", "c4a882", "f1e4c8"] },
  { id: "teletext", name: "Teletext", colors: ["000000", "ff0000", "00ff00", "0000ff", "ffff00", "ff00ff", "00ffff", "ffffff"] },
  {
    id: "pico8",
    name: "PICO-8",
    colors: ["000000", "1d2b53", "7e2553", "008751", "ab5236", "5f574f", "c2c3c7", "fff1e8",
      "ff004d", "ffa300", "ffec27", "00e436", "29adff", "83769c", "ff77a8", "ffccaa"],
  },
  {
    id: "c64",
    name: "Commodore 64",
    colors: ["000000", "ffffff", "68372b", "70a4b2", "6f3d86", "588d43", "352879", "b8c76f",
      "6f4f25", "433900", "9a6759", "444444", "6c6c6c", "9ad284", "6c5eb5", "959595"],
  },
  {
    id: "mac16",
    name: "Macintosh",
    colors: ["ffffff", "fbf305", "ff6403", "dd0907", "f20884", "4700a5", "0000d3", "02abea",
      "1fb714", "006412", "562c05", "90713a", "c0c0c0", "808080", "404040", "000000"],
  },
  {
    id: "ega",
    name: "EGA",
    colors: ["000000", "800000", "008000", "808000", "000080", "800080", "008080", "c0c0c0",
      "808080", "ff0000", "00ff00", "ffff00", "0000ff", "ff00ff", "00ffff", "ffffff"],
  },
  { id: "pastel", name: "Pastel", colors: ["fdf6ec", "f7c6c7", "f9e2ae", "bde4c8", "b5d3f0", "5b5470"] },
  { id: "blueprint", name: "Blueprint", colors: ["0b2a6f", "1f4fb4", "8fb4ff", "eef4ff"] },
];

export const PALETTES: Palette[] = RAW.map((p) => ({ id: p.id, name: p.name, colors: p.colors.map((c) => parseHex(c) as RGB) }));

/** Squared redmean distance: cheap and noticeably closer to perceived difference than plain RGB. */
export function colorDistance(a: readonly number[], b: readonly number[]): number {
  const [ar = 0, ag = 0, ab = 0] = a;
  const [br = 0, bg = 0, bb = 0] = b;
  const rm = (ar + br) / 2;
  const dr = ar - br, dg = ag - bg, db = ab - bb;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

/** Merges colors closer than `threshold` (redmean distance, roughly 0–765) into their average. */
export function mergeNearDuplicates(colors: RGB[], threshold: number): RGB[] {
  const out: { sum: number[]; n: number }[] = [];
  const t2 = threshold * threshold;
  for (const c of colors) {
    const hit = out.find((o) => colorDistance(o.sum.map((v) => v / o.n), c) < t2);
    if (hit) { hit.sum = hit.sum.map((v, i) => v + (c[i] ?? 0)); hit.n++; }
    else out.push({ sum: [...c], n: 1 });
  }
  return out.map((o) => o.sum.map((v) => Math.round(v / o.n)) as RGB);
}
