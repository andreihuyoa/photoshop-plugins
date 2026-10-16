import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

export type MenuItem =
  | { kind: "item"; label: string; checked?: boolean; disabled?: boolean; hint?: string; onSelect: () => void }
  | { kind: "label"; label: string }
  | { kind: "divider" };

export interface MenuProps {
  items: MenuItem[];
  onClose: () => void;
  style?: React.CSSProperties;
}

/**
 * Popover menu. Closes on outside click and Escape. Put `data-menu-toggle` on the button that opens it:
 * presses there are left to that button, so clicking it again closes the menu instead of reopening it.
 */
export function Menu({ items, onClose, style }: MenuProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target) || target.closest?.("[data-menu-toggle]")) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, [onClose]);
  return (
    <div className="wb-menu" ref={ref} role="menu" style={style}>
      {items.map((it, i) => {
        if (it.kind === "divider") return <hr key={i} />;
        if (it.kind === "label") return <div key={i} className="label">{it.label}</div>;
        return (
          <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { onClose(); it.onSelect(); }}>
            <span>{it.label}</span>
            {it.checked ? <span className="check">✓</span> : it.hint ? <span className="wb-kbd">{it.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export interface DialogProps {
  title: string;
  children: ReactNode;
  buttons: ReactNode;
  onClose: () => void;
}

export function Dialog({ title, children, buttons, onClose }: DialogProps): ReactElement {
  return (
    <div className="wb-scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <div className="wb-dialog" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {children}
        <div className="buttons">{buttons}</div>
      </div>
    </div>
  );
}

export interface ToastProps {
  message: string;
  error?: boolean;
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}

/** One-line message above the action bar. Info toasts dismiss themselves after four seconds. */
export function Toast({ message, error, action, onDismiss }: ToastProps): ReactElement {
  useEffect(() => {
    if (error || action) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message, error, action, onDismiss]);
  return (
    <div className={error ? "wb-toast error" : "wb-toast"} role={error ? "alert" : "status"}>
      <span>{message}</span>
      {action ? <button onClick={action.onClick}>{action.label}</button> : <button onClick={onDismiss} aria-label="Dismiss">✕</button>}
    </div>
  );
}

export function StatusLine({ left, right, tone }: { left: string; right?: string; tone?: "ok" | "warn" }): ReactElement {
  return (
    <div className="wb-status">
      <span title={left}>{left}</span>
      {right && <span className={tone ?? ""}>{right}</span>}
    </div>
  );
}

export function Progress({ value }: { value: number }): ReactElement {
  return <div className="wb-progress"><i style={{ width: `${Math.round(value * 100)}%` }} /></div>;
}
