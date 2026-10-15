import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "../main-webview";
import { createMockApi } from "./mock-api";

// Browser harness: the real panel against a fake Photoshop. ?theme=light|darkest switches the host theme.
ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App api={createMockApi()} />
  </React.StrictMode>,
);
