import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";

export interface SectionProps {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/** Collapsible group with a title on the left and a live summary of its settings on the right. */
export function Section({ title, summary, open, onToggle, children }: SectionProps): ReactElement {
  return (
    <section className={open ? "wb-sec" : "wb-sec closed"}>
      <div className="wb-sec-h" onClick={onToggle} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}>
        <b>{title}</b>
        {summary && <span>{summary}</span>}
      </div>
      <div className="wb-sec-body">{children}</div>
    </section>
  );
}

export interface TabsProps<T extends string> {
  items: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  scroll?: boolean;
  /** Wrap into rows of three. */
  grid?: boolean;
}

export function Tabs<T extends string>({ items, value, onChange, scroll, grid }: TabsProps<T>): ReactElement {
  return (
    <div className={["wb-tabs", scroll && "scroll", grid && "grid"].filter(Boolean).join(" ")} role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={it.id === value} className={it.id === value ? "on" : ""} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return <div className="wb-row"><label>{label}</label>{children}</div>;
}

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  /** Fires continuously while dragging. */
  onChange: (v: number) => void;
  /** Fires once when a drag ends or a typed value is entered. */
  onCommit?: (v: number) => void;
}

/** Slider with a value you can click and type into. Arrow keys step; Shift steps by ten. */
export function Slider({ label, value, min, max, step = 1, format, onChange, onCommit }: SliderProps): ReactElement {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [text, setText] = useState<string | null>(null);
  const fmt = format || ((v: number) => String(v));
  const pct = ((value - min) / (max - min)) * 100;
  const snap = (v: number) => {
    const s = Math.round((Math.min(max, Math.max(min, v)) - min) / step) * step + min;
    return Number(s.toFixed(4));
  };
  const fromX = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return snap(min + ((clientX - r.left) / r.width) * (max - min));
  };

  return (
    <div className="wb-row">
      <label>{label}</label>
      <div
        className="wb-slider"
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(fromX(e.clientX));
        }}
        onPointerMove={(e) => dragging.current && onChange(fromX(e.clientX))}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          onCommit?.(fromX(e.clientX));
        }}
        onKeyDown={(e) => {
          const d = (e.shiftKey ? 10 : 1) * step;
          let v: number | null = null;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") v = snap(value + d);
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = snap(value - d);
          if (v !== null) { e.preventDefault(); onChange(v); onCommit?.(v); }
        }}
      >
        <div className="track" />
        <div className="fill" style={{ left: 0, width: `${pct}%` }} />
        <div className="thumb" style={{ left: `${pct}%` }} />
      </div>
      <input
        className="wb-val"
        value={text ?? fmt(value)}
        onFocus={(e) => { setText(String(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text ?? "");
          setText(null);
          if (Number.isFinite(n)) { const v = snap(n); onChange(v); onCommit?.(v); }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setText(null); (e.target as HTMLInputElement).blur(); }
          e.stopPropagation();
        }}
        aria-label={`${label} value`}
      />
    </div>
  );
}

export interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>): ReactElement {
  return (
    <div className="wb-row">
      <label>{label}</label>
      <select className="wb-select" value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }): ReactElement {
  return (
    <div className={value ? "wb-toggle on" : "wb-toggle"} role="switch" aria-checked={value} tabIndex={0}
      onClick={() => onChange(!value)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), onChange(!value))}>
      <span className="sw" />
      <span>{label}</span>
    </div>
  );
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Hex color field with a chip. Invalid input reverts on blur. */
export function ColorField({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }): ReactElement {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const m = text.trim().match(HEX);
    if (!m) { setText(value); return; }
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    onChange(`#${h}`);
  };
  return (
    <div className="wb-color" title={label}>
      <span className="chip" style={{ background: value }} />
      <input value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
    </div>
  );
}
