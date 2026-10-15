// Generates the panel and plugin-list icons into public/icons: a Bayer-dithered disc.
// Run with: node scripts/make-icons.ts
import fs from "node:fs";
import path from "node:path";
import { bayerMatrix, encodePng } from "@andreihuyoa/dither-engine";

const bayer = bayerMatrix(4);

function icon(size: number, cell: number, rgb: [number, number, number]): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2, r = size * 0.44;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d > r + 0.5) continue;
    const tone = 1 - (y + x * 0.4) / (size * 1.4);
    const on = tone > (bayer[(Math.floor(y / cell) % 4) * 4 + (Math.floor(x / cell) % 4)] + 0.5) / 16;
    const i = (y * size + x) * 4;
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
    data[i + 3] = on ? Math.round(255 * Math.min(1, r - d + 0.5)) : Math.round(70 * Math.min(1, r - d + 0.5));
  }
  return encodePng({ data, width: size, height: size, components: 4 });
}

const dir = path.join(import.meta.dirname, "..", "public", "icons");
fs.mkdirSync(dir, { recursive: true });
const write = (name: string, bytes: Uint8Array) => fs.writeFileSync(path.join(dir, name), bytes);
const light: [number, number, number] = [238, 240, 243]; // for dark Photoshop themes
const ink: [number, number, number] = [20, 23, 27]; // for light Photoshop themes
write("dark@1x.png", icon(23, 2, light));
write("dark@2x.png", icon(46, 4, light));
write("light@1x.png", icon(23, 2, ink));
write("light@2x.png", icon(46, 4, ink));
write("plugin-icon@1x.png", icon(48, 4, [31, 79, 224]));
write("plugin-icon@2x.png", icon(96, 8, [31, 79, 224]));
console.log("icons written to", dir);
