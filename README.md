# REA Photoshop plugins

Free, open source Photoshop plugins.

## Why this exists

I'm a beginner graphic designer, and I've been looking for ways to work faster and get more interesting results. Again and again, the tools that would help most turn out to be paid plugins. That's a real wall when you're starting out.

So I'm rebuilding them. When a paid plugin does something I want, I study what it does and how that kind of effect works, with help from [REA (Reverse Engineer Anything)](https://github.com/morluto/rea), then write my own version from scratch and release it here for free. The plugins are built from published techniques; no code from paid plugins is copied.

## Plugins

Click a plugin to see what it does and how to install it.

<details>
<summary><strong>Ditherkit</strong>: dithering, halftones and bitmap effects (v1.0.0)</summary>

<br>

<p>
  <img src="docs/images/panel-dark.png" width="300" alt="Ditherkit panel in Photoshop's dark theme, previewing a round-dot halftone">
  &nbsp;
  <img src="docs/images/panel-light.png" width="300" alt="Ditherkit panel in the light theme, with an 8-color palette taken from the image">
</p>

Photoshop's built-in Bitmap mode takes a dozen steps, flattens your file, and gives you a handful of patterns. Ditherkit does it from one panel and keeps your layers intact. Pick a pattern, adjust it against the preview in the panel, and press Dither. The result goes into your document as a single undo step.

| | | | |
| :-: | :-: | :-: | :-: |
| ![Floyd–Steinberg](docs/images/patterns/floyd-steinberg.png) | ![Atkinson](docs/images/patterns/atkinson.png) | ![Bayer 8×8](docs/images/patterns/bayer-8.png) | ![Blue noise](docs/images/patterns/blue-noise.png) |
| Floyd–Steinberg | Atkinson | Bayer 8×8 | Blue noise |
| ![Round-dot halftone](docs/images/patterns/halftone-dot.png) | ![Line screen](docs/images/patterns/halftone-line.png) | ![Mosaic](docs/images/patterns/mosaic-round.png) | ![H beam](docs/images/patterns/beam-h.png) |
| Halftone, round dot | Halftone, line | Mosaic | H beam |
| ![Xerox grain](docs/images/patterns/xerox.png) | ![Four-step tone ramp](docs/images/patterns/tone-ramp.png) | ![PICO-8 palette](docs/images/patterns/indexed-pico8.png) | ![Rounded edges](docs/images/patterns/rounded.png) |
| Xerox grain | Four-step tone ramp | PICO-8 palette | Rounded edges |

#### What it can do

- **31 patterns** in six groups: error diffusion (Floyd–Steinberg, Atkinson, Jarvis, Stucki, Sierra and others), ordered (Bayer, clustered), halftone (dot, ellipse, diamond, line, crosshatch at any angle), mosaic, noise (blue noise, Xerox grain) and modulation (scan lines that bend with brightness). Each one has a thumbnail rendered from your own image.
- **Color modes:**
  - Mono, and tone ramps between any two colors (including your foreground and background colors).
  - Indexed palettes: built-in ones, colors pulled from the image, or your own. Import Adobe `.ase` / `.aco` and GIMP `.gpl` files, and export `.gpl`.
  - RGB with a set number of levels per channel.
- **Tone controls:** a Levels control with five handles over the image's histogram, plus blur, sharpen, denoise and invert.
- **Scale and edges:** chunky pixels, print-resolution sizing, and crisp, soft or rounded edges.
- **Preview:** zoom from Fit up to 800%, pan around, and drag a line across to compare with the original.
- **Output:** a new layer, a replacement for the source (the original stays, hidden), one masked fill layer per color, a layer mask, a new document, or a PNG.
- **Batch:** dither every selected layer with the same settings.
- **Document check:** warns about CMYK, 16-bit or non-sRGB documents and converts them in one click.
- **Presets** you can save, rename, delete, import and export.
- **Two themes:** the panel's own look, light or dark to match Photoshop, or Photoshop's native look.

#### Install

Needs Photoshop 2024 (version 25) or newer.

1. Download `ditherkit-1.0.0.ccx` from the [latest release](https://github.com/andreihuyoa/rea-photoshop-plugins/releases/latest).
2. Double-click it. Creative Cloud asks you to confirm installing a third-party plugin; accept.
3. Restart Photoshop if it was open. The panel is under *Plugins › Ditherkit*.

If Creative Cloud won't install it, load it with UXP Developer Tools instead (see [Building from source](#building-from-source)).

#### Using it

1. Select a layer, or switch the source to **Visible** to use everything you can see.
2. Pick a pattern and color mode. The preview at the top updates as you go. Drag the line across it to compare with the original. Scroll over the preview to zoom, drag to move around, and click a spot to see it at 100%.
3. Choose what the result should become with the arrow on the **Dither** button. The button shows your choice.
4. Press **Dither** (or Enter). The result is written into the document as one step, so a single undo removes it.

The document has to be RGB at 8 bits per channel; the document check converts it if it isn't. Ditherkit is developed on macOS. Windows hasn't been tested yet.

See the [changelog](ditherkit/CHANGELOG.md) for what changed in each version.

</details>

## Installing plugins

Every plugin here is released as a `.ccx` file, Adobe's plugin package format. Download it from [Releases](https://github.com/andreihuyoa/rea-photoshop-plugins/releases), double-click it, and Creative Cloud installs it into Photoshop. To remove a plugin, open the Creative Cloud app and go to *Stock & Marketplace › Plugins › Manage plugins*.

## Building from source

You need Node.js 22.18 or newer, [pnpm](https://pnpm.io), and Adobe's UXP Developer Tools (install it from the Creative Cloud app).

```bash
git clone https://github.com/andreihuyoa/rea-photoshop-plugins.git
cd rea-photoshop-plugins
pnpm install
pnpm build
```

Then load a plugin:

1. In Photoshop, go to *Settings › Plugins*, turn on **Enable Developer Mode**, and restart Photoshop.
2. In UXP Developer Tools, click **Add Plugin** and choose the plugin's `dist/manifest.json` (for Ditherkit, `ditherkit/dist/manifest.json`).
3. Click **Load**.

To make your own `.ccx`, run `pnpm --filter ditherkit ccx`. The file appears in `ditherkit/ccx/`.

## What's in the repo

| Folder | What it is |
| --- | --- |
| [`ditherkit`](ditherkit) | The Ditherkit plugin, built with [Bolt UXP](https://github.com/hyperbrew/bolt-uxp), React and a webview UI |
| [`packages/workbench`](packages/workbench) | The design system every plugin here uses: themes, React components and layout rules |
| [`packages/dither-engine`](packages/dither-engine) | The dithering, palette and image code. Plain TypeScript with no Photoshop dependencies, so it runs and is tested in Node |

## Development

```bash
pnpm dev        # rebuild on change and reload the plugin in Photoshop
pnpm harness    # run the Ditherkit panel in a browser against a fake Photoshop (localhost:5181)
pnpm test       # engine tests
pnpm typecheck  # all packages
```

When using `pnpm dev`, load the plugin in UXP Developer Tools with **Load**, not **Load & Watch**; Bolt UXP handles reloading itself.

## Credits

- [REA (Reverse Engineer Anything)](https://github.com/morluto/rea) for helping me understand how the features I wanted work.
- [Bolt UXP](https://github.com/hyperbrew/bolt-uxp) by Hyper Brew for the plugin build setup.
- [IBM Plex](https://github.com/IBM/plex), used under the SIL Open Font License.
- Ditherkit's algorithms come from published work: Floyd and Steinberg (1976), Jarvis, Judice and Ninke (1976), Stucki (1981), Bill Atkinson's dithering for the original Macintosh, Frankie Sierra's filters, Shiau and Fan (1996), and Ulichney's void-and-cluster method (1993) for blue noise.

## License

[MIT](LICENSE)
