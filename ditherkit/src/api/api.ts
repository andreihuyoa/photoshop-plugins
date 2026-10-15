import * as photoshop from "./photoshop";
import * as uxpLib from "./uxp";

// Everything exported here is callable from the panel (webview) through Comlink.
export const api = { ...uxpLib, ...photoshop };
export type API = typeof api;
