import { useEffect, useRef, type ReactElement } from "react";

export interface Swatch {
  hex: string;
  muted?: boolean;
  marked?: boolean;
}

export interface SwatchStripProps {
  swatches: Swatch[];
  /** Plain click: edit. Alt-click: mute. Shift-click: mark for merging. */
  onSwatch: (index: number, how: "edit" | "mute" | "mark") => void;
  onAdd?: () => void;
}

export function SwatchStrip({ swatches, onSwatch, onAdd }: SwatchStripProps): ReactElement {
  return (
    <div className="wb-swatches">
      {swatches.map((s, i) => (
        <button
          key={i}
          className={["wb-swatch", s.muted && "muted", s.marked && "marked"].filter(Boolean).join(" ")}
          style={{ background: s.hex }}
          title={`${s.hex}${s.muted ? " (muted)" : ""}`}
          aria-label={`${s.hex}${s.muted ? ", muted" : ""}`}
          onClick={(e) => onSwatch(i, e.altKey ? "mute" : e.shiftKey ? "mark" : "edit")}
        />
      ))}
      {onAdd && <button className="wb-swatch add" onClick={onAdd} aria-label="Add color">+</button>}
    </div>
  );
}

export interface LevelsValue {
  inBlack: number;
  inWhite: number;
  gamma: number;
  outBlack: number;
  outWhite: number;
}

export interface LevelsControlProps {
  value: LevelsValue;
  histogram: number[] | null;
  onChange: (v: LevelsValue) => void;
  onCommit?: (v: LevelsValue) => void;
}

type Handle = "inBlack" | "mid" | "inWhite" | "outBlack" | "outWhite";

/**
 * Photoshop-style Levels with five handles over the image histogram: input black, midtone (gamma)
 * and input white on top; output black and white below.
 */
export function LevelsControl({ value, histogram, onChange, onCommit }: LevelsControlProps): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const railIn = useRef<HTMLDivElement>(null);
  const railOut = useRef<HTMLDivElement>(null);
  const drag = useRef<Handle | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const midPos = value.inBlack + (value.inWhite - value.inBlack) * Math.pow(0.5, value.gamma);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    c.width = 256; c.height = 40;
    ctx.clearRect(0, 0, 256, 40);
    if (!histogram) return;
    const max = Math.max(1, ...histogram.slice(1, 255));
    ctx.fillStyle = getComputedStyle(c).color;
    for (let i = 0; i < 256; i++) {
      const h = Math.min(40, (histogram[i] / max) * 38);
      ctx.fillRect(i, 40 - h, 1, h);
    }
  }, [histogram]);

  const pos = (rail: HTMLDivElement, clientX: number) => {
    const r = rail.getBoundingClientRect();
    return Math.round(Math.min(255, Math.max(0, ((clientX - r.left) / r.width) * 255)));
  };

  const apply = (h: Handle, x: number): LevelsValue => {
    const v = { ...latest.current };
    if (h === "inBlack") v.inBlack = Math.min(x, v.inWhite - 2);
    if (h === "inWhite") v.inWhite = Math.max(x, v.inBlack + 2);
    if (h === "outBlack") v.outBlack = x;
    if (h === "outWhite") v.outWhite = x;
    if (h === "mid") {
      const rel = Math.min(0.99, Math.max(0.01, (x - v.inBlack) / Math.max(1, v.inWhite - v.inBlack)));
      v.gamma = Math.min(9.99, Math.max(0.1, Math.log(rel) / Math.log(0.5)));
    }
    return v;
  };

  const handlers = (rail: React.RefObject<HTMLDivElement | null>, pick: (x: number) => Handle) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      const x = pos(rail.current!, e.clientX);
      drag.current = pick(x);
      e.currentTarget.setPointerCapture(e.pointerId);
      onChange(apply(drag.current, x));
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag.current) onChange(apply(drag.current, pos(rail.current!, e.clientX)));
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const v = apply(drag.current, pos(rail.current!, e.clientX));
      drag.current = null;
      onCommit?.(v);
    },
  });

  const nearestIn = (x: number): Handle => {
    const d = [["inBlack", value.inBlack], ["mid", midPos], ["inWhite", value.inWhite]] as [Handle, number][];
    return d.sort((a, b) => Math.abs(a[1] - x) - Math.abs(b[1] - x))[0][0];
  };
  const nearestOut = (x: number): Handle => (Math.abs(x - value.outBlack) <= Math.abs(x - value.outWhite) ? "outBlack" : "outWhite");
  const at = (v: number) => ({ left: `${(v / 255) * 100}%` });

  return (
    <div className="wb-levels">
      <div className="hist"><canvas ref={canvas} style={{ color: "var(--wb-line-2)" }} /></div>
      <div className="rail" ref={railIn} {...handlers(railIn, nearestIn)}>
        <i className="h" style={at(value.inBlack)} />
        <i className="h mid" style={at(midPos)} />
        <i className="h" style={at(value.inWhite)} />
      </div>
      <div className="nums"><span>{value.inBlack}</span><span>{value.gamma.toFixed(2)}</span><span>{value.inWhite}</span></div>
      <div className="grad" />
      <div className="rail" ref={railOut} {...handlers(railOut, nearestOut)}>
        <i className="h out" style={at(value.outBlack)} />
        <i className="h out" style={at(value.outWhite)} />
      </div>
      <div className="nums"><span>out {value.outBlack}</span><span>{value.outWhite}</span></div>
    </div>
  );
}
