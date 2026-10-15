import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./main-webview";
import * as webviewAPI from "./webview-api";
import { initWebview } from "./webview-setup";
import type { DitherkitAPI } from "./api-types";

const { api } = initWebview(webviewAPI);

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <App api={api as unknown as DitherkitAPI} />
  </React.StrictMode>,
);
