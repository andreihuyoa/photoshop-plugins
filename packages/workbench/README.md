# Workbench

The design system for andreihuyoa Photoshop plugins. Every plugin gets the same layout, components and rules. Two themes fill in the tokens:

- **Instrument** (the default): a clean, precise look. It has a light and a dark variant that follow Photoshop's interface brightness.
- **Photoshop**: Photoshop's own panel colors, blue accent and system font, for people who prefer the default look. It reads the `--uxp-host-*` colors Bolt UXP passes in.

Users switch between them in each plugin's menu, under **Appearance**.

## Use it in a plugin

```tsx
import { Panel, PluginHeader, resolveTheme } from "@andreihuyoa/workbench";

const { theme, tone } = resolveTheme(appearance, hostTheme); // hostTheme from Bolt's getColorScheme()
<Panel theme={theme} tone={tone}>
  <PluginHeader name="Ditherkit" version="0.3.0" actions={menuButton} />
  …
</Panel>
```

Importing the package also loads `workbench.css` and the IBM Plex fonts (Latin only, bundled, no network). Plugins need Bolt UXP's **webview UI**: Photoshop's built-in UXP renderer doesn't support enough CSS for this design.

## Anatomy

Every panel is laid out the same way, top to bottom:

1. **Header:** the andreihuyoa wordmark, the plugin name under it, the version, and a `···` menu.
2. **Preview stage:** a pixel-exact preview with a before/after split, Fit / 1:1 / 2:1 zoom and a one-line readout.
3. **Sections** that scroll. Each has a short title, a live summary on the right, and collapses.
4. **Footer:** a status line, then the action bar: one primary action, with a dropdown for its options.

## Tokens

| Token | Instrument light | Instrument dark | Use |
| --- | --- | --- | --- |
| `--wb-ground` | `#f4f5f7` | `#16181b` | Panel background |
| `--wb-surface` | `#ffffff` | `#1d2024` | Fields, menus, dialogs |
| `--wb-well` | `#e6e9ed` | `#0e1012` | Behind the preview checkerboard |
| `--wb-ink` | `#14171b` | `#eef0f3` | Text, values |
| `--wb-ink-2` | `#3d444d` | `#c3c8cf` | Control labels |
| `--wb-muted` | `#6a727c` | `#8d949d` | Summaries, hints, readouts |
| `--wb-line` | `#dde0e4` | `#2a2e33` | Section dividers |
| `--wb-line-2` | `#b9bfc6` | `#474d55` | Tab frames, slider tracks, field borders |
| `--wb-accent` | `#1f4fe0` | `#3d6bff` | Primary button, slider fill, focus, selected tile |
| `--wb-sel` / `--wb-on-sel` | ink / white | white / ink | Selected tab, zoom chip |
| `--wb-ok` | `#0d7a55` | `#3fbf8a` | Passing checks in the status line |
| `--wb-danger` | `#c2372b` | `#ff7a6b` | Errors, muted swatches |

Shape: radius 3px (2px small); 4px spacing grid; 12px panel gutter. Type: IBM Plex Sans 11–12px for the interface and 18px semibold for the plugin name; IBM Plex Mono for numbers, readouts and summaries.

## Components

`Panel`, `PluginHeader`, `Logo`, `PreviewStage` (zoom, pan, before/after split), `StageBar`, `SettingsIcon`, `PresetsIcon`, `ChevronDownIcon`, `Section`, `Tabs` (`grid` wraps into rows of three, `scroll` scrolls sideways), `Row`, `Slider` (drag, arrow keys, or click the value to type), `Select`, `Toggle`, `ColorField`, `SwatchStrip`, `LevelsControl`, `Menu` (put `data-menu-toggle` on the button that opens it), `Dialog`, `Toast`, `StatusLine`, `Progress`. Buttons are plain `<button className="wb-btn">` with `primary`, `small`, `icon` and `danger` modifiers.

## Rules

- **One accent.** `--wb-accent` marks what's active and the one primary action. `--wb-ok` and `--wb-danger` are only for status. Never add another hue.
- **Selection inverts.** Selected tabs and chips use `--wb-sel` and `--wb-on-sel`.
- **Numbers in mono.** Every value, size and readout uses IBM Plex Mono with tabular figures.
- **Sentence case.** Buttons say exactly what happens (`Dither`, `Save`, `Cancel`, `Convert to RGB`). Errors say what's wrong and offer the fix as a button.
- **The document changes only on the primary action.** Controls update the panel preview; the document is touched once, as one undo step, when the user presses the primary button. `Slider` also has `onCommit` (fires on release) for anything too slow to run while dragging.
