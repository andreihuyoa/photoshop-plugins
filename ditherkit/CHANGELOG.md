# Changelog

Ditherkit follows [semantic versioning](https://semver.org). Before 1.0, minor versions add features and patch versions only fix bugs.

## Unreleased

### Added

- Preview zoom from Fit up to 800%. Scroll or pinch over the preview to zoom around the pointer, drag to pan, click a spot in the Fit view to see it at 100%, and double-click to fit again. The − and + buttons step through 25% to 800%.
- A Presets button next to the source switch.
- Delete or rename your own presets from Presets › Manage presets.

### Changed

- Settings open from a gear icon in the header. Presets moved out of that menu.
- Removed the "Live on canvas" banner. Cancel and Save already show that a dither is in progress.
- The source switch is locked while a dither is in progress, instead of hidden.
- The live layer is named like the result it will become (for example "Dither · Atkinson") instead of "Ditherkit preview", and it's renamed when you change patterns.

### Fixed

- Undoing the dither in Photoshop, deleting its layer or closing the document now ends the dither in the panel. Before, the panel kept showing Cancel and Save, and Save applied the dither again.
- The 100% and 200% previews always showed the middle of the layer, which is often empty (a frame, a logo, text). They now show whatever part of the layer you zoom into.
- Tall layers overflowed the preview in Fit view, so it showed only part of the layer at the wrong scale and didn't match the canvas. Fit now always shows the whole layer, and the zoom readout matches what's on screen.
- The live layer could appear a few layers below the source, wherever Photoshop put new layers. It now always sits directly above the source layer (or at the top when the source is Visible).

## 0.2.0 (2026-10-15)

Rebuilt on Bolt UXP with a React webview UI and the Workbench design system. This release was first tagged 2.0.0 in the repo and has been renumbered.

- 31 patterns in six families, with thumbnails rendered from the source image.
- Live dithering on the canvas with Save and Cancel as one undo step.
- Mono, tone, indexed and RGB color modes; palette import and export (.ase, .aco, .gpl).
- Levels with five handles over the histogram, plus blur, sharpen, denoise and invert.
- Pixel size, print-resolution sizing, and crisp, soft or rounded edges.
- Six output types, batch across selected layers, a document check with fixes, and presets.

## 0.1.0 (2026-10-15)

First prototype: a plain UXP panel with 20 patterns that dithered to a new layer.
