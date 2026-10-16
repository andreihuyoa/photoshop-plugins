import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ChevronDownIcon, ColorField, Dialog, LevelsControl, Menu, Panel, PluginHeader, PresetsIcon, PreviewStage, Progress, Section, SettingsIcon,
  Select, Slider, StageBar, StatusLine, SwatchStrip, Tabs, Toast, Toggle, resolveTheme,
  type MenuItem,
} from "@andreihuyoa/workbench";
import { ALGORITHMS, FAMILIES, PALETTES, algorithmInfo, mergeNearDuplicates, parseHex, toHex, type ColorMode, type EdgeStyle, type Family } from "@andreihuyoa/dither-engine";
import {
  BUILT_IN_PRESETS, DEFAULT_PREFS, DEFAULT_SETTINGS, OUTPUTS, summarize,
  ZOOM_STEPS, type DitherSettings, type Output, type Preset, type Prefs, type Source, type Zoom,
} from "../../src/shared/settings";
import { version as VERSION } from "../../package.json";
import type { DitherkitAPI, SourceInfo, Status } from "./api-types";

const MODES: { id: ColorMode; label: string }[] = [
  { id: "mono", label: "Mono" }, { id: "tone", label: "Tone" }, { id: "indexed", label: "Indexed" }, { id: "rgb", label: "RGB" },
];
const EDGES: { id: EdgeStyle; label: string }[] = [{ id: "crisp", label: "Crisp" }, { id: "soft", label: "Soft" }, { id: "rounded", label: "Rounded" }];
const SOURCES: { id: Source; label: string }[] = [{ id: "layer", label: "Active layer" }, { id: "merged", label: "Visible" }];
const CELL_FAMILIES: Family[] = ["halftone", "mosaic", "modulation"];

/** Runs an async job with the latest argument only: calls made while one runs collapse into one follow-up. */
function useLatest<T>(job: (arg: T) => Promise<void>) {
  const state = useRef<{ running: boolean; pending: { arg: T } | null }>({ running: false, pending: null });
  const jobRef = useRef(job);
  jobRef.current = job;
  return useCallback((arg: T) => {
    const st = state.current;
    st.pending = { arg };
    if (st.running) return;
    st.running = true;
    (async () => {
      while (st.pending) {
        const { arg: next } = st.pending;
        st.pending = null;
        try { await jobRef.current(next); } catch { /* reported by the job */ }
      }
      st.running = false;
    })();
  }, []);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, "");

export function App({ api }: { api: DitherkitAPI }): ReactElement {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [hostTheme, setHostTheme] = useState("dark");
  const [status, setStatus] = useState<Status | null>(null);
  const [source, setSource] = useState<SourceInfo | null>(null);
  const [sourceError, setSourceError] = useState<string>("");
  const [preview, setPreview] = useState<{ url: string; width: number; height: number; ms: number; view: { x: number; y: number; w: number; h: number; scale: number } } | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [vp, setVp] = useState<{ zoom: Zoom; cx: number | null; cy: number | null }>({ zoom: "fit", cx: null, cy: null });
  const vpRef = useRef(vp);
  const stageSize = useRef({ w: 276, h: 180 });
  const toolrow = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [tiles, setTiles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(false);
  const [sessionMs, setSessionMs] = useState(0);
  const [working, setWorking] = useState("");
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [menu, setMenu] = useState<"settings" | "presets" | "output" | null>(null);
  const [dialog, setDialog] = useState<null | { kind: "preflight" } | { kind: "hex"; index: number; value: string } | { kind: "preset"; name: string } | { kind: "manage"; names: string[] }>(null);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);
  const [marked, setMarked] = useState<number[]>([]);

  const s = prefs.settings;
  const settingsRef = useRef(s);
  settingsRef.current = s;
  const sessionRef = useRef(false);
  sessionRef.current = session;

  const { theme, tone } = resolveTheme(prefs.appearance, hostTheme);
  const family = algorithmInfo(s.algorithm).family;
  const sum = useMemo(() => summarize(s), [s]);
  const fail = (e: unknown) => setToast({ message: errMsg(e), error: true });

  // ---------------------------------------------------------------- persistence

  useEffect(() => {
    api.loadPrefs().then((json) => {
      if (json) {
        try {
          const saved = JSON.parse(json) as Partial<Prefs>;
          setPrefs({ ...DEFAULT_PREFS, ...saved, settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) }, open: { ...DEFAULT_PREFS.open, ...(saved.open || {}) } });
        } catch { /* start fresh */ }
      }
      setLoaded(true);
    });
    api.getColorScheme().then((c) => setHostTheme(c.theme)).catch(() => {});
    const onTheme = (e: Event) => setHostTheme((e as CustomEvent<string>).detail);
    window.addEventListener("host-theme", onTheme);
    return () => window.removeEventListener("host-theme", onTheme);
  }, [api]);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => api.savePrefs(JSON.stringify(prefs)), 300);
    return () => clearTimeout(t);
  }, [prefs, loaded, api]);

  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  // ---------------------------------------------------------------- rendering

  const renderPreview = useLatest<void>(async () => {
    setBusy(true);
    try {
      const r = await api.renderPreview(settingsRef.current, { ...vpRef.current, width: stageSize.current.w, height: stageSize.current.h });
      if (r) {
        setPreview({ url: r.url, width: r.width, height: r.height, ms: r.ms, view: r.view });
        if (r.beforeUrl) setBefore(r.beforeUrl);
        setPalette(r.palette);
      }
    } catch (e) { fail(e); } finally { setBusy(false); }
  });

  const renderTiles = useLatest<void>(async () => {
    const st = settingsRef.current;
    const ids = ALGORITHMS.filter((a) => a.family === algorithmInfo(st.algorithm).family).map((a) => a.id);
    try {
      const out = await api.renderTiles(st, ids);
      setTiles((t) => ({ ...t, ...Object.fromEntries(out.map((o) => [o.id, o.url])) }));
    } catch { /* tiles are decoration */ }
  });

  const updateSession = useLatest<void>(async () => {
    try {
      const r = await api.updateSession(settingsRef.current);
      if (r.ms) setSessionMs(r.ms);
    } catch (e) { fail(e); }
  });

  const tilesTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scheduleTiles = () => { clearTimeout(tilesTimer.current); tilesTimer.current = setTimeout(() => renderTiles(), 250); };

  /** Updates settings. `commit` is false while a slider is being dragged: the canvas waits for release. */
  const set = (patch: Partial<DitherSettings>, commit = true) => {
    // Compute synchronously: the render jobs below read settingsRef before React applies the update.
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setPrefs((p) => ({ ...p, settings: next }));
    renderPreview();
    if (!("algorithm" in patch)) scheduleTiles();
    if (commit && sessionRef.current) updateSession();
  };
  const slide = (key: keyof DitherSettings) => ({
    onChange: (v: number) => set({ [key]: v } as Partial<DitherSettings>, false),
    onCommit: (v: number) => set({ [key]: v } as Partial<DitherSettings>, true),
  });

  // ---------------------------------------------------------------- document and source

  const refreshStatus = useCallback(async () => {
    try { setStatus(await api.getStatus(prefs.source)); } catch (e) { fail(e); }
  }, [api, prefs.source]);

  const reloadSource = useCallback(async () => {
    if (sessionRef.current) return;
    try {
      const info = await api.loadSource(prefs.source);
      setSource(info);
      setSourceError("");
      const fit = { zoom: "fit" as Zoom, cx: null, cy: null };
      vpRef.current = fit;
      setVp(fit);
      renderPreview();
      renderTiles();
    } catch (e) {
      setSource(null);
      setPreview(null);
      setBefore(null);
      setSourceError(errMsg(e));
    }
  }, [api, prefs.source, renderPreview, renderTiles]);

  useEffect(() => {
    if (!loaded) return;
    refreshStatus();
    reloadSource();
  }, [loaded, refreshStatus, reloadSource]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onChange = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "session-ended") endedOutside();
      clearTimeout(t);
      t = setTimeout(() => { refreshStatus(); reloadSource(); }, 300);
    };
    const onProgress = (e: Event) => setBatch((e as CustomEvent<{ done: number; total: number }>).detail);
    window.addEventListener("document-changed", onChange);
    window.addEventListener("batch-progress", onProgress);
    return () => { clearTimeout(t); window.removeEventListener("document-changed", onChange); window.removeEventListener("batch-progress", onProgress); };
  }, [refreshStatus, reloadSource]);

  useEffect(() => { renderTiles(); }, [family, renderTiles]);

  // ---------------------------------------------------------------- preview navigation

  /** How many CSS pixels one document pixel takes up in the stage right now. */
  const fitScale = preview && source && vp.zoom === "fit"
    ? Math.min(stageSize.current.w / preview.width, stageSize.current.h / preview.height, 1) * (preview.width / source.width)
    : null;
  const currentScale = vp.zoom === "fit" ? fitScale ?? 1 : vp.zoom;

  const navigate = (next: { zoom: Zoom; cx: number | null; cy: number | null }) => {
    vpRef.current = next;
    setVp(next);
    renderPreview();
  };

  /** Zooms to `zoom`, keeping the document point under (fx, fy) of the current image where it is. */
  const zoomTo = (zoom: Zoom, anchor?: { fx: number; fy: number }, centerOnAnchor = false) => {
    if (zoom === "fit") return navigate({ zoom, cx: null, cy: null });
    const v = preview?.view;
    if (!v || !anchor) return navigate({ zoom, cx: vpRef.current.cx, cy: vpRef.current.cy });
    const docX = v.x + anchor.fx * v.w, docY = v.y + anchor.fy * v.h;
    if (centerOnAnchor) return navigate({ zoom, cx: docX, cy: docY });
    const cw = stageSize.current.w / zoom, ch = stageSize.current.h / zoom;
    navigate({ zoom, cx: docX + (0.5 - anchor.fx) * cw, cy: docY + (0.5 - anchor.fy) * ch });
  };
  const zoomIn = ZOOM_STEPS.find((z) => z > currentScale + 1e-6);
  const zoomOutStep = [...ZOOM_STEPS].reverse().find((z) => z < currentScale - 1e-6);
  // Zooming out to a size where the whole layer already fits goes to Fit instead.
  const fitsWhole = (z: number) => !source || z * Math.max(source.width / stageSize.current.w, source.height / stageSize.current.h) <= 1;
  const zoomOutTarget: Zoom | undefined =
    vp.zoom === "fit" ? undefined : zoomOutStep !== undefined && !fitsWhole(zoomOutStep) ? zoomOutStep : "fit";

  const pan = (dx: number, dy: number) => {
    if (vp.zoom === "fit" || !preview) return;
    const v = preview.view;
    const cx = (vpRef.current.cx ?? v.x + v.w / 2) - dx / vp.zoom;
    const cy = (vpRef.current.cy ?? v.y + v.h / 2) - dy / vp.zoom;
    navigate({ zoom: vp.zoom, cx, cy });
  };

  const resizeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onStageResize = (w: number, h: number) => {
    if (Math.abs(w - stageSize.current.w) < 2 && Math.abs(h - stageSize.current.h) < 2) return;
    stageSize.current = { w, h };
    clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => { if (vpRef.current.zoom !== "fit") renderPreview(); else setVp({ ...vpRef.current }); }, 150);
  };

  // ---------------------------------------------------------------- session

  const start = async (skipCheck = false) => {
    if (!status?.hasDoc) { setToast({ message: "Open a document to start.", error: true }); return; }
    const bad = status.checks.filter((c) => !c.ok);
    if (!skipCheck && bad.length && (prefs.checkBeforeDither || !status.ready)) { setDialog({ kind: "preflight" }); return; }
    if (!source) { setToast({ message: sourceError || "Nothing to dither yet.", error: true }); return; }
    setWorking("Rendering on canvas…");
    try {
      const r = await api.startSession(settingsRef.current);
      setSession(true);
      setSessionMs(r.ms);
    } catch (e) { fail(e); } finally { setWorking(""); }
  };

  /** The live layer disappeared in Photoshop (undo, delete, closed document): go back to the idle state. */
  const endedOutside = () => {
    if (!sessionRef.current) return;
    sessionRef.current = false;
    setSession(false);
    setToast({ message: "The dither was undone in Photoshop." });
  };

  useEffect(() => {
    if (!session) return;
    const check = () => { api.isSessionActive().then((alive) => { if (!alive) { endedOutside(); refreshStatus(); reloadSource(); } }).catch(() => {}); };
    const timer = setInterval(check, 2000);
    window.addEventListener("focus", check);
    return () => { clearInterval(timer); window.removeEventListener("focus", check); };
  }, [session, api, refreshStatus, reloadSource]);

  const cancel = async () => {
    setWorking("Reverting…");
    try { await api.cancelSession(); } catch (e) { fail(e); }
    setSession(false);
    setWorking("");
  };

  const save = async (output: Output = prefs.output) => {
    setWorking("Saving…");
    try {
      const msg = await api.saveSession(settingsRef.current, output);
      const still = await api.isSessionActive();
      setSession(still);
      if (msg) setToast({ message: msg });
    } catch (e) { fail(e); setSession(await api.isSessionActive()); }
    setWorking("");
  };

  const runBatch = async () => {
    setBatch({ done: 0, total: status?.selectedCount ?? 0 });
    try { setToast({ message: await api.ditherSelected(settingsRef.current, prefs.output) }); } catch (e) { fail(e); }
    setBatch(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || dialog || menu) return;
    if (e.key === "Enter") { e.preventDefault(); session ? save() : start(); }
    if (e.key === "Escape" && session) { e.preventDefault(); cancel(); }
  };

  // ---------------------------------------------------------------- palette editing

  const editablePalette = () => (s.paletteId === "custom" ? [...s.customColors] : [...palette]);
  const onSwatch = (index: number, how: "edit" | "mute" | "mark") => {
    const hex = palette[index];
    if (how === "mute") {
      const muted = s.muted.includes(hex) ? s.muted.filter((m) => m !== hex) : [...s.muted, hex];
      set({ muted });
    } else if (how === "mark") {
      setMarked((m) => (m.includes(index) ? m.filter((i) => i !== index) : [...m, index]));
    } else {
      setDialog({ kind: "hex", index, value: hex });
    }
  };
  const mergeMarked = () => {
    const colors = editablePalette();
    const rgb = marked.map((i) => parseHex(colors[i])!).filter(Boolean);
    const avg = toHex([0, 1, 2].map((c) => rgb.reduce((a, x) => a + x[c], 0) / rgb.length));
    const next = colors.filter((_, i) => !marked.includes(i));
    next.splice(Math.min(...marked), 0, avg);
    setMarked([]);
    set({ paletteId: "custom", customColors: next });
  };
  const tidyPalette = () => {
    const next = mergeNearDuplicates(editablePalette().map((h) => parseHex(h)!), 40).map((c) => toHex(c));
    set({ paletteId: "custom", customColors: next });
    setToast({ message: `Merged near-duplicates: ${palette.length} → ${next.length} colors.` });
  };
  const importPalette = async (fromImage: boolean) => {
    try {
      const colors = fromImage ? await api.importPaletteFromImage(s.autoColors) : await api.importPaletteFile();
      if (colors.length) { set({ paletteId: "custom", customColors: colors, muted: [] }); setToast({ message: `Imported ${colors.length} colors.` }); }
    } catch (e) { fail(e); }
  };

  // ---------------------------------------------------------------- presets

  const applyPreset = (p: Preset) => {
    const next = { ...DEFAULT_SETTINGS, ...p.settings, levels: { ...DEFAULT_SETTINGS.levels, ...(p.settings.levels || {}) } };
    settingsRef.current = next;
    setPrefs((pr) => ({ ...pr, settings: next, family: algorithmInfo(next.algorithm).family }));
    renderPreview();
    renderTiles();
    if (sessionRef.current) updateSession();
  };
  const exportPresets = async () => {
    try { setToast({ message: await api.exportPresetsFile(JSON.stringify({ ditherkitPresets: 1, presets: prefs.presets }, null, 2)) }); } catch (e) { fail(e); }
  };
  const importPresets = async () => {
    try {
      const text = await api.importPresetsFile();
      if (!text) return;
      const parsed = JSON.parse(text);
      const list: Preset[] = (parsed.presets || []).filter((p: Preset) => p && p.name && p.settings);
      setPref("presets", [...prefs.presets.filter((p) => !list.some((q) => q.name === p.name)), ...list]);
      setToast({ message: `Imported ${list.length} preset${list.length === 1 ? "" : "s"}.` });
    } catch (e) { fail(new Error(`That file isn't a Ditherkit preset file. (${errMsg(e)})`)); }
  };

  // ---------------------------------------------------------------- menus

  const presetsMenu: MenuItem[] = [
    { kind: "label", label: "Built in" },
    ...BUILT_IN_PRESETS.map((p): MenuItem => ({ kind: "item", label: p.name, onSelect: () => applyPreset(p) })),
    ...(prefs.presets.length ? [{ kind: "label", label: "Yours" } as MenuItem] : []),
    ...prefs.presets.map((p): MenuItem => ({ kind: "item", label: p.name, onSelect: () => applyPreset(p) })),
    { kind: "divider" },
    { kind: "item", label: "Save current as preset…", onSelect: () => setDialog({ kind: "preset", name: "" }) },
    { kind: "item", label: "Import presets…", onSelect: importPresets },
    { kind: "item", label: "Export presets…", disabled: !prefs.presets.length, onSelect: exportPresets },
    { kind: "item", label: "Manage presets…", disabled: !prefs.presets.length, onSelect: () => setDialog({ kind: "manage", names: prefs.presets.map((p) => p.name) }) },
  ];
  const settingsMenu: MenuItem[] = [
    { kind: "label", label: "Appearance" },
    { kind: "item", label: "Workbench", checked: prefs.appearance === "workbench", onSelect: () => setPref("appearance", "workbench") },
    { kind: "item", label: "Photoshop", checked: prefs.appearance === "photoshop", onSelect: () => setPref("appearance", "photoshop") },
    { kind: "divider" },
    { kind: "item", label: "Check document before dithering", checked: prefs.checkBeforeDither, onSelect: () => setPref("checkBeforeDither", !prefs.checkBeforeDither) },
    { kind: "item", label: "Run document check", onSelect: async () => { await refreshStatus(); setDialog({ kind: "preflight" }); } },
    { kind: "item", label: "Refresh preview", onSelect: () => { refreshStatus(); reloadSource(); } },
    { kind: "item", label: "Reset all settings", onSelect: () => applyPreset({ name: "Default", settings: {} }) },
  ];
  const outputMenu: MenuItem[] = [
    { kind: "label", label: "Save as" },
    ...OUTPUTS.map((o): MenuItem => ({ kind: "item", label: o.label, hint: o.detail, checked: prefs.output === o.id, onSelect: () => setPref("output", o.id) })),
  ];

  // ---------------------------------------------------------------- render

  const open = (key: string) => prefs.open[key] !== false;
  const toggle = (key: string) => setPref("open", { ...prefs.open, [key]: !open(key) });
  const outputInfo = OUTPUTS.find((o) => o.id === prefs.output)!;
  const familyAlgorithms = ALGORITHMS.filter((a) => a.family === family);
  const statusLeft = working || (batch ? `Dithering ${batch.done} of ${batch.total} layers` : status?.hasDoc ? `${status.layerName || status.docName}` : "No document open");
  const statusRight = session ? `${(sessionMs / 1000).toFixed(2)} s` : status?.hasDoc ? status.summary : "";
  const statusTone = status && status.hasDoc && !status.ready ? "warn" : status?.checks.every((c) => c.ok) ? "ok" : undefined;

  return (
    <Panel theme={theme} tone={tone} onKeyDown={onKeyDown}>
      <PluginHeader
        name="Ditherkit"
        version={VERSION}
        actions={<button className="wb-btn icon" aria-label="Settings" title="Settings" onClick={() => setMenu(menu === "settings" ? null : "settings")}><SettingsIcon /></button>}
      />
      {menu === "settings" && <Menu items={settingsMenu} onClose={() => setMenu(null)} style={{ right: 10, top: 40, maxHeight: "75%", overflowY: "auto" }} />}

      <PreviewStage
        after={preview?.url ?? null}
        before={before}
        width={preview?.width ?? 0}
        height={preview?.height ?? 0}
        scale={vp.zoom === "fit" ? null : vp.zoom}
        busy={busy}
        empty={sourceError || "Select a layer to preview"}
        onZoomAt={(dir, fx, fy) => {
          const target = dir > 0 ? zoomIn : zoomOutTarget;
          if (target !== undefined) zoomTo(target, { fx, fy });
        }}
        onPan={pan}
        onClickAt={(fx, fy) => { if (vp.zoom === "fit") zoomTo(1, { fx, fy }, true); }}
        onDoubleClick={() => zoomTo("fit")}
        onResize={onStageResize}
      />
      <StageBar
        info={source ? `${source.name} · ${source.width}×${source.height}` : status?.hasDoc ? "No preview" : "No document"}
        zoomLabel={`${Math.round(currentScale * 100)}%`}
        fit={vp.zoom === "fit"}
        canZoomIn={!!source && zoomIn !== undefined}
        canZoomOut={!!source && zoomOutTarget !== undefined}
        onZoomIn={() => zoomIn !== undefined && zoomTo(zoomIn, { fx: 0.5, fy: 0.5 })}
        onZoomOut={() => zoomOutTarget !== undefined && zoomTo(zoomOutTarget, { fx: 0.5, fy: 0.5 })}
        onFit={() => zoomTo("fit")}
      />
      <div className="wb-toolrow" ref={toolrow}>
        <div className={session ? "src disabled" : "src"} title={session ? "Save or cancel the current dither to change the source" : undefined}>
          <Tabs items={SOURCES} value={prefs.source} onChange={(v) => setPref("source", v)} />
        </div>
        <button className="wb-btn" onClick={() => setMenu(menu === "presets" ? null : "presets")} aria-haspopup="menu" aria-expanded={menu === "presets"}>
          <PresetsIcon /> Presets <ChevronDownIcon />
        </button>
      </div>
      {menu === "presets" && (
        <Menu items={presetsMenu} onClose={() => setMenu(null)}
          style={{ right: 12, top: (toolrow.current ? toolrow.current.offsetTop + toolrow.current.offsetHeight + 4 : 300), maxHeight: "55%", overflowY: "auto" }} />
      )}

      <div className="wb-scroll">
        <Section title="Pattern" summary={sum.pattern} open={open("pattern")} onToggle={() => toggle("pattern")}>
          <Tabs grid items={FAMILIES.map((f) => ({ id: f.id, label: f.name }))} value={family}
            onChange={(f) => { const first = ALGORITHMS.find((a) => a.family === f)!; set({ algorithm: first.id }); }} />
          <div className="wb-tiles">
            {familyAlgorithms.map((a) => (
              <button key={a.id} className={a.id === s.algorithm ? "wb-tile on" : "wb-tile"} onClick={() => set({ algorithm: a.id })} title={a.name}>
                {tiles[a.id] ? <img src={tiles[a.id]} alt="" /> : <span className="ph" />}
                <span>{a.name}</span>
              </button>
            ))}
          </div>
          <Slider label="Strength" value={s.strength} min={0} max={100} format={(v) => `${v}%`} {...slide("strength")} />
          {family === "diffusion" && <Toggle label="Serpentine scan" value={s.serpentine} onChange={(v) => set({ serpentine: v })} />}
          {CELL_FAMILIES.includes(family) && <Slider label="Cell" value={s.scale} min={2} max={64} format={(v) => `${v} px`} {...slide("scale")} />}
          {family === "halftone" && (
            <Select label="Angle" value={String(s.angle)} onChange={(v) => set({ angle: parseFloat(v) })}
              options={["0", "15", "22.5", "45", "75", "90"].map((v) => ({ value: v, label: `${v}°` }))} />
          )}
          {(s.algorithm === "white-noise" || s.algorithm === "xerox") && (
            <div className="wb-row"><label>Seed</label><span className="wb-grow wb-mono">{s.seed}</span>
              <button className="wb-btn small" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 9999) })}>Shuffle</button></div>
          )}
        </Section>

        <Section title="Color" summary={sum.color} open={open("color")} onToggle={() => toggle("color")}>
          <Tabs items={MODES} value={s.mode} onChange={(mode) => set({ mode })} />
          {(s.mode === "mono" || s.mode === "tone") && (
            <>
              <div className="wb-row">
                <label>Colors</label>
                <ColorField label="Dark color" value={s.dark} onChange={(dark) => set({ dark })} />
                <button className="wb-btn icon" aria-label="Swap colors" title="Swap" onClick={() => set({ dark: s.light, light: s.dark })}>⇄</button>
                <ColorField label="Light color" value={s.light} onChange={(light) => set({ light })} />
              </div>
              <div className="wb-row"><label /><button className="wb-btn small" onClick={async () => {
                try { const c = await api.getSwatchColors(); set({ dark: c.foreground, light: c.background }); } catch (e) { fail(e); }
              }}>Use foreground / background</button></div>
              {s.mode === "tone" && <Slider label="Steps" value={s.steps} min={2} max={16} {...slide("steps")} />}
            </>
          )}
          {s.mode === "indexed" && (
            <>
              <Select label="Palette" value={s.paletteId} onChange={(paletteId) => { setMarked([]); set({ paletteId, muted: [] }); }}
                options={[
                  { value: "auto", label: "From this image" },
                  ...(s.customColors.length ? [{ value: "custom", label: `Custom · ${s.customColors.length}` }] : []),
                  ...PALETTES.map((p) => ({ value: p.id, label: `${p.name} · ${p.colors.length}` })),
                ]} />
              {s.paletteId === "auto" && <Slider label="Colors" value={s.autoColors} min={2} max={64} {...slide("autoColors")} />}
              <SwatchStrip
                swatches={palette.map((hex, i) => ({ hex, muted: s.muted.includes(hex), marked: marked.includes(i) }))}
                onSwatch={onSwatch}
                onAdd={() => setDialog({ kind: "hex", index: -1, value: "#808080" })}
              />
              <div className="wb-hint">Click to edit · Alt-click to mute · Shift-click to mark for merging</div>
              <div className="wb-row" style={{ flexWrap: "wrap", gap: 4 }}>
                {marked.length >= 2 && <button className="wb-btn small" onClick={mergeMarked}>Merge {marked.length}</button>}
                <button className="wb-btn small" onClick={tidyPalette}>Merge similar</button>
                <button className="wb-btn small" onClick={() => importPalette(false)}>Import…</button>
                <button className="wb-btn small" onClick={() => importPalette(true)}>From image…</button>
                <button className="wb-btn small" onClick={async () => { try { setToast({ message: await api.exportPaletteFile("Ditherkit palette", palette) }); } catch (e) { fail(e); } }}>Export…</button>
              </div>
            </>
          )}
          {s.mode === "rgb" && <Slider label="Levels" value={s.rgbLevels} min={2} max={8} format={(v) => `${v} · ${v ** 3}`} {...slide("rgbLevels")} />}
        </Section>

        <Section title="Tone" summary={sum.tone} open={open("tone")} onToggle={() => toggle("tone")}>
          <LevelsControl value={s.levels} histogram={source?.histogram ?? null}
            onChange={(levels) => set({ levels }, false)} onCommit={(levels) => set({ levels }, true)} />
          <Slider label="Blur" value={s.blur} min={0} max={20} format={(v) => `${v} px`} {...slide("blur")} />
          <Slider label="Sharpen" value={s.sharpen} min={0} max={200} format={(v) => `${v}%`} {...slide("sharpen")} />
          <Slider label="Denoise" value={s.denoise} min={0} max={100} format={(v) => `${v}%`} {...slide("denoise")} />
          <div className="wb-row" style={{ justifyContent: "space-between" }}>
            <Toggle label="Invert" value={s.invert} onChange={(invert) => set({ invert })} />
            <button className="wb-btn small" onClick={() => set({ levels: { ...DEFAULT_SETTINGS.levels }, blur: 0, sharpen: 0, denoise: 0, invert: false })}>Reset tone</button>
          </div>
        </Section>

        <Section title="Scale and edges" summary={sum.scale} open={open("scale")} onToggle={() => toggle("scale")}>
          <Slider label="Pixel size" value={s.pixelSize} min={1} max={32} format={(v) => `${v} px`} {...slide("pixelSize")} />
          <Select label="Print at" value={String(s.dpi)} onChange={(v) => set({ dpi: parseInt(v, 10) })}
            options={[{ value: "0", label: "Document pixels" }, ...[72, 100, 150, 200, 300].map((d) => ({ value: String(d), label: `${d} ppi dots` }))]} />
          <div className="wb-row"><label>Edges</label><div className="wb-grow"><Tabs items={EDGES} value={s.edge} onChange={(edge) => set({ edge })} /></div></div>
          {s.edge !== "crisp" && s.pixelSize < 2 && <div className="wb-hint" style={{ margin: "-4px 0 6px 70px" }}>Edges apply when pixel size is 2 or more.</div>}
          {s.edge === "rounded" && <Slider label="Bleed" value={s.bleed} min={-100} max={100} {...slide("bleed")} />}
          <Select label="Alpha" value={s.alphaThreshold ? "crisp" : "soft"} onChange={(v) => set({ alphaThreshold: v === "crisp" ? 128 : 0 })}
            options={[{ value: "soft", label: "Keep soft edges" }, { value: "crisp", label: "Crisp (threshold)" }]} />
          {s.alphaThreshold > 0 && <Slider label="Cutoff" value={s.alphaThreshold} min={1} max={255} {...slide("alphaThreshold")} />}
        </Section>

        <Section title="Output" summary={outputInfo.label} open={open("output")} onToggle={() => toggle("output")}>
          <Select label="Save as" value={prefs.output} onChange={(v) => setPref("output", v)} options={OUTPUTS.map((o) => ({ value: o.id, label: o.label }))} />
          <div className="wb-hint" style={{ margin: "-2px 0 8px 70px" }}>{outputInfo.detail}</div>
          {(status?.selectedCount ?? 0) > 1 && prefs.source === "layer" && !session && (
            <button className="wb-btn small" style={{ width: "100%" }} disabled={!!batch || prefs.output === "png"} onClick={runBatch}>
              Dither all {status!.selectedCount} selected layers
            </button>
          )}
        </Section>
      </div>

      <footer className="wb-foot">
        {batch && <Progress value={batch.total ? batch.done / batch.total : 0} />}
        <StatusLine left={statusLeft} right={statusRight} tone={session ? undefined : statusTone} />
        <div className="wb-actions">
          {batch ? (
            <button className="wb-btn" onClick={() => api.stopBatch()}>Stop</button>
          ) : session ? (
            <>
              <button className="wb-btn" disabled={!!working} onClick={cancel}>Cancel <span className="wb-kbd">esc</span></button>
              <div className="wb-split-btn">
                <button className="wb-btn primary" disabled={!!working} onClick={() => save()}>Save <span className="wb-kbd">⏎</span></button>
                <button className="wb-btn primary" aria-label="Save as" disabled={!!working} onClick={() => setMenu(menu === "output" ? null : "output")}>▾</button>
              </div>
            </>
          ) : (
            <button className="wb-btn primary" disabled={!!working || !status?.hasDoc} onClick={() => start()}>Dither</button>
          )}
        </div>
      </footer>
      {menu === "output" && <Menu items={outputMenu} onClose={() => setMenu(null)} style={{ right: 12, bottom: 54, minWidth: 230 }} />}

      {toast && <Toast message={toast.message} error={toast.error} onDismiss={() => setToast(null)} />}

      {dialog?.kind === "preflight" && status && (
        <Dialog title="Document check" onClose={() => setDialog(null)} buttons={
          <>
            <button className="wb-btn small" onClick={() => setDialog(null)}>Close</button>
            {status.ready && !session && <button className="wb-btn small primary" onClick={() => { setDialog(null); start(true); }}>Dither anyway</button>}
          </>
        }>
          <p>{status.ready ? "This document can be dithered. Fixing the items below gives more accurate colors." : "Fix the items below before dithering."}</p>
          <div className="checks">
            {status.checks.map((c) => (
              <div className="check" key={c.id}>
                <span>{c.label}</span>
                {c.ok ? <span className="st ok">✓</span> : c.fixable ? (
                  <button className="wb-btn small" onClick={async () => {
                    try { await api.fixIssue(c.id); await refreshStatus(); reloadSource(); } catch (e) { fail(e); }
                  }}>{c.id === "mode" ? "Convert to RGB" : c.id === "bits" ? "Convert to 8-bit" : "Convert to sRGB"}</button>
                ) : <span className="st bad">✕</span>}
              </div>
            ))}
          </div>
        </Dialog>
      )}

      {dialog?.kind === "hex" && (
        <Dialog title={dialog.index < 0 ? "Add color" : "Edit color"} onClose={() => setDialog(null)} buttons={
          <>
            {dialog.index >= 0 && <button className="wb-btn small danger" onClick={() => {
              const colors = editablePalette().filter((_, i) => i !== dialog.index);
              setDialog(null); setMarked([]); set({ paletteId: "custom", customColors: colors });
            }}>Remove</button>}
            <button className="wb-btn small" onClick={() => setDialog(null)}>Cancel</button>
            <button className="wb-btn small primary" onClick={() => {
              const rgb = parseHex(dialog.value);
              if (!rgb) { setToast({ message: `“${dialog.value}” isn't a hex color like #1a2b3c.`, error: true }); return; }
              const colors = editablePalette();
              if (dialog.index < 0) colors.push(toHex(rgb)); else colors[dialog.index] = toHex(rgb);
              setDialog(null); set({ paletteId: "custom", customColors: colors });
            }}>{dialog.index < 0 ? "Add" : "Apply"}</button>
          </>
        }>
          <p>Edits turn this into a custom palette.</p>
          <input type="text" autoFocus value={dialog.value} onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()} aria-label="Hex color" />
        </Dialog>
      )}

      {dialog?.kind === "manage" && (
        <Dialog title="Your presets" onClose={() => setDialog(null)} buttons={
          <>
            <button className="wb-btn small" onClick={() => setDialog(null)}>Cancel</button>
            <button className="wb-btn small primary" onClick={() => {
              // names[i] is the edited name of prefs.presets[i], or "" when deleted.
              const kept = prefs.presets.flatMap((p, i) =>
                dialog.names[i] === "" ? [] : [{ ...p, name: dialog.names[i].trim() || p.name }]);
              const removed = prefs.presets.length - kept.length;
              setPref("presets", kept);
              setDialog(null);
              if (removed) setToast({ message: `Deleted ${removed} preset${removed === 1 ? "" : "s"}.` });
            }}>Done</button>
          </>
        }>
          <p>Rename a preset by editing its name. Built-in presets can't be changed.</p>
          <div className="wb-preset-list">
            {prefs.presets.map((p, i) => dialog.names[i] === "" ? null : (
              <div className="wb-preset-row" key={p.name}>
                <input type="text" value={dialog.names[i]} aria-label={`Name of ${p.name}`}
                  onChange={(e) => setDialog({ kind: "manage", names: dialog.names.map((n, j) => (j === i ? e.target.value || " " : n)) })}
                  onKeyDown={(e) => e.stopPropagation()} />
                <button className="wb-btn small danger" aria-label={`Delete ${p.name}`}
                  onClick={() => setDialog({ kind: "manage", names: dialog.names.map((n, j) => (j === i ? "" : n)) })}>Delete</button>
              </div>
            ))}
            {dialog.names.every((n) => n === "") && <p className="wb-hint">All your presets will be deleted.</p>}
          </div>
        </Dialog>
      )}

      {dialog?.kind === "preset" && (
        <Dialog title="Save preset" onClose={() => setDialog(null)} buttons={
          <>
            <button className="wb-btn small" onClick={() => setDialog(null)}>Cancel</button>
            <button className="wb-btn small primary" disabled={!dialog.name.trim()} onClick={() => {
              const name = dialog.name.trim();
              setPref("presets", [...prefs.presets.filter((p) => p.name !== name), { name, settings: { ...s } }]);
              setDialog(null);
              setToast({ message: `Saved preset “${name}”.` });
            }}>Save</button>
          </>
        }>
          <p>Saves every setting in this panel. Find it in the menu under Presets.</p>
          <input type="text" autoFocus placeholder="Preset name" value={dialog.name}
            onChange={(e) => setDialog({ ...dialog, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Preset name" />
        </Dialog>
      )}
    </Panel>
  );
}
