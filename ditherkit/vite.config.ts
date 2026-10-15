import { defineConfig } from "vite";
import { runAction, uxp, uxpSetup } from "vite-uxp-plugin";
import react from "@vitejs/plugin-react"; 

import { config } from "./uxp.config";

const action = process.env.BOLT_ACTION;
const mode = process.env.MODE;
process.env.VITE_BOLT_MODE = mode;
process.env.VITE_BOLT_WEBVIEW_UI = (config.webviewUi === true).toString();
process.env.VITE_BOLT_WEBVIEW_PORT = config.webviewReloadPort.toString();

if (action) runAction(config, action);

const shouldNotEmptyDir = false;

export default defineConfig({
  plugins: [
    uxp(config, mode),
    react(), 
  ],
  build: {
    sourcemap: mode && ["dev", "build"].includes(mode) ? "inline" : false,
    minify: false,
    emptyOutDir: !shouldNotEmptyDir,
    rollupOptions: {
      external: [
        "photoshop", 
        "uxp",
        "fs",
        "os",
        "path",
        "process",
        "shell",
      ],
      output: {
        // format: "cjs",
        format: "iife", // Needed for Webview UI in Vue to prevent global overrides
      },
    },
  },
  publicDir: "public",
});
