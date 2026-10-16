// The panel's view of the UXP side: the Photoshop functions plus the Bolt UXP helpers it uses.
// Kept as an explicit interface so the browser harness can implement the same contract.
import type * as ps from "../../src/api/photoshop";

type Fns = typeof ps;
export type Status = ps.Status;
export type SourceInfo = ps.SourceInfo;

export interface DitherkitAPI {
  getStatus: Fns["getStatus"];
  fixIssue: Fns["fixIssue"];
  loadSource: Fns["loadSource"];
  renderPreview: Fns["renderPreview"];
  resetPreviewCache: Fns["resetPreviewCache"];
  renderTiles: Fns["renderTiles"];
  applyDither: Fns["applyDither"];
  ditherSelected: Fns["ditherSelected"];
  stopBatch: Fns["stopBatch"];
  importPaletteFile: Fns["importPaletteFile"];
  importPaletteFromImage: Fns["importPaletteFromImage"];
  exportPaletteFile: Fns["exportPaletteFile"];
  exportPresetsFile: Fns["exportPresetsFile"];
  importPresetsFile: Fns["importPresetsFile"];
  getSwatchColors: Fns["getSwatchColors"];
  loadPrefs: Fns["loadPrefs"];
  savePrefs: Fns["savePrefs"];
  getColorScheme: () => Promise<{ theme: string; colors: Record<string, string> }>;
}
