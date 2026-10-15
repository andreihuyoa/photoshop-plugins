import { useEffect } from "react";
import { webviewInitHost } from "./webview-setup-host";
import { setListeners } from "./api/photoshop";

/**
 * The UXP side renders no UI of its own: it hosts the Workbench panel in a webview and forwards
 * Photoshop events and batch progress to it.
 */
export const App = () => {
  useEffect(() => {
    webviewInitHost({ multi: false }).then(([panel]) => {
      setListeners(
        (event) => { Promise.resolve(panel.documentChanged(event)).catch(() => {}); },
        (done, total) => { Promise.resolve(panel.batchProgress(done, total)).catch(() => {}); },
      );
    });
    return () => setListeners(null, null);
  }, []);
  return null;
};
