import { useRef, useState, type ReactElement } from "react";

export type Zoom = "fit" | "1:1" | "2:1";

export interface PreviewStageProps {
  /** Data URL of the processed image. */
  after: string | null;
  /** Data URL of the source, shown left of the split line. */
  before: string | null;
  width: number;
  height: number;
  zoom: Zoom;
  busy?: boolean;
  empty?: string;
}

/**
 * Pixel-exact preview with a draggable before/after split. At 2:1 the image is drawn at twice its size,
 * nearest-neighbour, so dither patterns stay crisp.
 */
export function PreviewStage({ after, before, width, height, zoom, busy, empty }: PreviewStageProps): ReactElement {
  const [split, setSplit] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const scale = zoom === "2:1" ? 2 : 1;
  const style = zoom === "fit"
    ? { maxWidth: "100%", maxHeight: 180 }
    : { width: width * scale, height: height * scale, maxWidth: "none", maxHeight: "none" };

  const move = (clientX: number) => {
    const r = frame.current?.getBoundingClientRect();
    if (!r) return;
    setSplit(Math.min(1, Math.max(0, (clientX - r.left) / r.width)));
  };

  return (
    <div className="wb-stage">
      {after ? (
        <div className="wb-stage-frame" ref={frame}>
          <img src={after} alt="Dithered preview" style={style} draggable={false} />
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
              onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => dragging.current && move(e.clientX)}
              onPointerUp={() => { dragging.current = false; }}
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

export interface StageBarProps {
  info: string;
  zoom: Zoom;
  onZoom: (z: Zoom) => void;
}

export function StageBar({ info, zoom, onZoom }: StageBarProps): ReactElement {
  return (
    <div className="wb-stagebar">
      <span title={info}>{info}</span>
      <span className="wb-zoom">
        {(["fit", "1:1", "2:1"] as Zoom[]).map((z) => (
          <button key={z} className={z === zoom ? "on" : ""} onClick={() => onZoom(z)}>{z === "fit" ? "Fit" : z}</button>
        ))}
      </span>
    </div>
  );
}

export function LiveBadge({ children }: { children: string }): ReactElement {
  return <div className="wb-live" role="status"><i />{children}</div>;
}
