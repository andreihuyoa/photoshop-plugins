import { useEffect, useRef, useState, type ReactElement } from "react";

export interface PreviewStageProps {
  /** Data URL of the processed image. */
  after: string | null;
  /** Data URL of the source, shown left of the split line. */
  before: string | null;
  /** Image size in pixels. */
  width: number;
  height: number;
  /** null fits the image to the stage; a number draws each image pixel that many CSS pixels wide. */
  scale: number | null;
  busy?: boolean;
  empty?: string;
  /** Wheel or pinch over the image: direction +1 zooms in, -1 out, around the pointer (fractions of the image). */
  onZoomAt?: (direction: 1 | -1, fx: number, fy: number) => void;
  /** A drag ended, moved by this many CSS pixels. */
  onPan?: (dx: number, dy: number) => void;
  /** A click without dragging, at fractions of the image. */
  onClickAt?: (fx: number, fy: number) => void;
  onDoubleClick?: () => void;
  /** Reports the stage's size in CSS pixels, so zoomed previews can be rendered to fit it. */
  onResize?: (width: number, height: number) => void;
}

/**
 * Pixel-exact preview with a before/after split. Zoomed images are drawn nearest-neighbour so dither
 * patterns stay crisp. Dragging moves the image immediately; the host re-renders when the drag ends.
 */
export function PreviewStage(props: PreviewStageProps): ReactElement {
  const { after, before, width, height, scale, busy, empty } = props;
  const [split, setSplit] = useState(0);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const splitting = useRef(false);
  const wheel = useRef(0);
  const latest = useRef(props);
  latest.current = props;

  // Wheel needs a non-passive listener to stop the panel from scrolling while zooming.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const p = latest.current;
      if (!p.after || !p.onZoomAt || !frame.current) return;
      e.preventDefault();
      wheel.current += e.deltaY;
      if (Math.abs(wheel.current) < 40) return;
      const dir = wheel.current < 0 ? 1 : -1;
      wheel.current = 0;
      const r = frame.current.getBoundingClientRect();
      p.onZoomAt(dir, clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const measure = () => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
      latest.current.onResize?.(el.clientWidth, el.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { el.removeEventListener("wheel", onWheel); ro.disconnect(); };
  }, []);

  // A new image means the host has caught up with the drag.
  useEffect(() => { setDrag(null); }, [after]);

  const zoomed = scale !== null;
  // Fit is computed from the measured stage: percentage max-height doesn't constrain an image whose
  // container has no fixed height, so tall images would overflow.
  const shown = zoomed ? scale! : fitScale(box, width, height);
  const imgStyle: React.CSSProperties = { width: width * shown, height: height * shown, maxWidth: "none", maxHeight: "none" };

  return (
    <div
      ref={stage}
      className={`wb-stage${zoomed ? " zoomed" : ""}${drag ? " dragging" : ""}`}
      onPointerDown={(e) => {
        if (!after || splitting.current) return;
        press.current = { x: e.clientX, y: e.clientY, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        if (!p.moved && Math.hypot(dx, dy) > 3) p.moved = true;
        if (p.moved && zoomed) setDrag({ x: dx, y: dy });
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        if (!p || !frame.current) return;
        if (p.moved) {
          if (zoomed) props.onPan?.(e.clientX - p.x, e.clientY - p.y);
        } else {
          const r = frame.current.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            props.onClickAt?.((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
          }
        }
      }}
      onDoubleClick={() => props.onDoubleClick?.()}
    >
      {after ? (
        <div className="wb-stage-frame" ref={frame} style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}>
          <img src={after} alt="Dithered preview" style={imgStyle} draggable={false} />
          {before && split > 0 && (
            <img className="wb-before-img" src={before} alt="" draggable={false}
              style={{ clipPath: `inset(0 ${100 - split * 100}% 0 0)` }} />
          )}
          {before && (
            <div
              className="wb-split"
              role="slider"
              aria-label="Before and after"
              aria-valuenow={Math.round(split * 100)}
              tabIndex={0}
              style={{ left: `${split * 100}%` }}
              onPointerDown={(e) => { e.stopPropagation(); splitting.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                if (!splitting.current || !frame.current) return;
                const r = frame.current.getBoundingClientRect();
                setSplit(clamp01((e.clientX - r.left) / r.width));
              }}
              onPointerUp={(e) => { e.stopPropagation(); splitting.current = false; }}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setSplit((s) => Math.max(0, s - 0.05));
                if (e.key === "ArrowRight") setSplit((s) => Math.min(1, s + 0.05));
              }}
            />
          )}
        </div>
      ) : (
        <div className="wb-stage-empty">{empty}</div>
      )}
      {busy && <div className="wb-stage-busy" />}
    </div>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** CSS pixels per image pixel that fit an image inside a stage of the given size. */
export function fitScale(stage: { w: number; h: number }, width: number, height: number): number {
  if (!width || !height || !stage.w || !stage.h) return 1;
  return Math.min(stage.w / width, stage.h / height);
}

export interface StageBarProps {
  info: string;
  /** Shown between the zoom buttons, e.g. "100%" or "Fit". */
  zoomLabel: string;
  fit: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function StageBar({ info, zoomLabel, fit, canZoomIn, canZoomOut, onZoomIn, onZoomOut, onFit }: StageBarProps): ReactElement {
  return (
    <div className="wb-stagebar">
      <span title={info}>{info}</span>
      <span className="wb-zoom">
        <button onClick={onZoomOut} disabled={!canZoomOut} aria-label="Zoom out" title="Zoom out">−</button>
        <span className="wb-zoom-label">{zoomLabel}</span>
        <button onClick={onZoomIn} disabled={!canZoomIn} aria-label="Zoom in" title="Zoom in">+</button>
        <button className={fit ? "on" : ""} onClick={onFit} title="Fit the whole layer">Fit</button>
      </span>
    </div>
  );
}
