# Ditherkit

The Photoshop plugin. For what it does and how to install it, see the [main README](../README.md).

## Commands

Run these from this folder, or from the repo root with `pnpm --filter ditherkit <command>`.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Rebuild on change and reload the plugin in Photoshop |
| `pnpm build` | Build once into `dist/` |
| `pnpm ccx` | Package an installable `.ccx` into `ccx/` |
| `pnpm harness` | Run the panel in a browser against a fake Photoshop |
| `pnpm typecheck` | Typecheck the plugin and the panel |
| `pnpm icons` | Regenerate the icons in `public/icons` |

## Where things are

| Path | What it does |
| --- | --- |
| `src/api/photoshop.ts` | Everything that touches Photoshop: reading pixels, previews, the live canvas session, every output type, batch, document fixes, palette and preset files. The panel can call every function exported here. |
| `src/shared/settings.ts` | Settings, presets and output types, shared by the plugin side and the panel |
| `src/main.tsx` | Hosts the panel's webview and forwards Photoshop events to it |
| `webview-ui/src/main-webview.tsx` | The panel UI, built from [Workbench](../packages/workbench) components |
| `webview-ui/src/harness/` | The browser harness and its fake Photoshop |
| `uxp.config.ts` | Plugin manifest: id, panel size, permissions |

The two sides talk through Bolt UXP's Comlink bridge, so everything passed between them has to be plain data. The panel never receives full-size pixels, only PNG previews and numbers.

## Things that only work inside Photoshop

The harness covers the panel, but these need a real document to test: the live canvas layer, undoing through history on Cancel, color-layer and layer-mask output, PNG export, and the document fixes.
