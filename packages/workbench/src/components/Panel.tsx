import type { ReactElement, ReactNode } from "react";
import { LOGO_PATHS, LOGO_VIEWBOX } from "../logo-paths";

export type WorkbenchTheme = "instrument-light" | "instrument-dark" | "photoshop";
export type Appearance = "workbench" | "photoshop";
export type HostTone = "light" | "dark";

/**
 * Picks the panel theme from the user's appearance choice and Photoshop's interface brightness.
 * Bolt UXP reports "darkest" | "dark" | "light" | "lightest"; anything with "dark" in it is dark.
 */
export function resolveTheme(appearance: Appearance, hostTheme: string): { theme: WorkbenchTheme; tone: HostTone } {
  const tone: HostTone = /dark/.test(hostTheme) ? "dark" : "light";
  if (appearance === "photoshop") return { theme: "photoshop", tone };
  return { theme: tone === "dark" ? "instrument-dark" : "instrument-light", tone };
}

export interface PanelProps {
  theme: WorkbenchTheme;
  tone: HostTone;
  children: ReactNode;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/** Root of every Workbench plugin panel. Sets the theme tokens for everything inside. */
export function Panel({ theme, tone, children, onKeyDown }: PanelProps): ReactElement {
  return (
    <div className="wb-panel" data-wb-theme={theme} data-wb-tone={tone} onKeyDown={onKeyDown} tabIndex={-1} style={{ position: "relative" }}>
      {children}
    </div>
  );
}

/** The andreihuyoa wordmark, drawn in the current text color. */
export function Logo({ className = "wb-logo" }: { className?: string }): ReactElement {
  return (
    <svg className={className} viewBox={LOGO_VIEWBOX} fill="currentColor" role="img" aria-label="andreihuyoa">
      {LOGO_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export interface PluginHeaderProps {
  name: string;
  version?: string;
  actions?: ReactNode;
}

/** Wordmark, plugin name and version, with an actions slot (usually the panel menu) on the right. */
export function PluginHeader({ name, version, actions }: PluginHeaderProps): ReactElement {
  return (
    <header className="wb-head">
      <div className="wb-brand">
        <Logo />
        <div className="wb-name">
          {name}
          {version && <span className="wb-version">v{version}</span>}
        </div>
      </div>
      {actions}
    </header>
  );
}
