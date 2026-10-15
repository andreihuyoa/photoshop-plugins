// Functions the UXP side calls on the panel. They re-dispatch as DOM events so React components can listen.

export const updateColorScheme = (val: { theme: string; colors: Record<string, string> }) => {
  const root = document.documentElement;
  for (const [key, color] of Object.entries(val.colors)) root.style.setProperty(key, color);
  root.dataset.theme = val.theme;
  window.dispatchEvent(new CustomEvent("host-theme", { detail: val.theme }));
  return true;
};

export const documentChanged = (event: string) => {
  window.dispatchEvent(new CustomEvent("document-changed", { detail: event }));
  return true;
};

export const batchProgress = (done: number, total: number) => {
  window.dispatchEvent(new CustomEvent("batch-progress", { detail: { done, total } }));
  return true;
};
