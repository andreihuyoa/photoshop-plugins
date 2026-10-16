# Changelog

Ditherkit follows [semantic versioning](https://semver.org): patch versions fix bugs, minor versions add features, and major versions change how existing features work.

## 1.0.0 (2026-10-16)

First release.

- 31 patterns in six families (diffusion, ordered, halftone, mosaic, noise, modulation), picked from thumbnails rendered from your own image.
- Mono, tone, indexed and RGB color modes. Indexed palettes can be built in, pulled from the image or your own, with .ase, .aco and .gpl import, .gpl export, and swatches you can mute, merge or edit.
- Levels with five handles over the histogram, plus blur, sharpen, denoise and invert.
- Pixel size, print-resolution sizing, and crisp, soft or rounded edges.
- A preview that zooms from Fit up to 800%, pans, and compares against the original with a split line.
- Dither writes the result straight into the document as one undo step: as a new layer, a replacement for the source, color-separated fill layers, a layer mask, a new document or a PNG file. Pick the output from the arrow on the Dither button.
- Batch dithering across selected layers.
- A document check that converts CMYK, 16-bit or non-sRGB documents in one click.
- Built-in presets and your own, with rename, delete, import and export.
- Instrument theme in light and dark to match Photoshop, or Photoshop's own look.
- A step-by-step log of each Dither in `ditherkit-debug.log`, in the plugin's data folder.
