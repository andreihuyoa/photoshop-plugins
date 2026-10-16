import type { ReactElement } from "react";

// Small line icons drawn on a 16px grid in currentColor, so they follow the theme.

export function SettingsIcon({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M6.7 1.6h2.6l.4 1.9 1.3.7 1.8-.6 1.3 2.2-1.4 1.3v1.6l1.4 1.3-1.3 2.2-1.8-.6-1.3.7-.4 1.9H6.7l-.4-1.9-1.3-.7-1.8.6-1.3-2.2 1.4-1.3V7.1L1.9 5.8l1.3-2.2 1.8.6 1.3-.7z" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2.1" />
    </svg>
  );
}

export function PresetsIcon({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 10 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
