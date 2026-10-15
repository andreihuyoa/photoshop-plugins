# dither-engine

The image code behind Ditherkit: dithering, halftones, palettes and a small PNG encoder. It's plain TypeScript with no Photoshop or browser dependencies, so the same code runs inside Photoshop, in the browser harness and in Node tests.

```ts
import { render, PALETTES } from "@andreihuyoa/dither-engine";

const out = render(pixels, {
  algorithm: "atkinson",
  mode: "indexed",
  palette: PALETTES.find((p) => p.id === "gameboy")!.colors,
  pixelSize: 3,
});
```

`pixels` is `{ data, width, height, components }` with 8-bit RGB or RGBA data. The result has the same shape. `ALGORITHMS` lists every pattern; `DEFAULTS` documents every option.

The steps, in order: downsample to the pixel size, then denoise, blur, sharpen and Levels, then dither, then scale back up with crisp, soft or rounded edges.

```bash
pnpm test      # node --test, using Node's built-in TypeScript support
pnpm gallery   # re-render the README images in docs/images/patterns
```
