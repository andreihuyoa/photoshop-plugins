import { UXP_Manifest, UXP_Config, UXP_Config_Extra } from "vite-uxp-plugin";
import { version } from "./package.json";

const extraPrefs: UXP_Config_Extra = {
  hotReloadPort: 8080,
  webviewUi: true,
  webviewReloadPort: 8082,
  copyZipAssets: [],
  uniqueIds: true,
  debugger: "udt",
};

export const id = "com.andrei.ditherkit"; 
const name = "Ditherkit"; 

const manifest: UXP_Manifest = {
  id,
  name,
  version,
  main: "index.html",
  manifestVersion: 6,
  host: [
    {
      app: "PS",
      minVersion: "25.0.0",
    },
  ],
  entrypoints: [
    {
      type: "panel",
      id: `${id}.main`,
      label: {
        default: name,
      },
      minimumSize: { width: 260, height: 420 },
      maximumSize: { width: 2000, height: 3000 },
      preferredDockedSize: { width: 300, height: 760 },
      preferredFloatingSize: { width: 320, height: 820 },
      icons: [
        {
          width: 23,
          height: 23,
          path: "icons/dark.png",
          scale: [1, 2],
          theme: ["darkest", "dark", "medium"],
        },
        {
          width: 23,
          height: 23,
          path: "icons/light.png",
          scale: [1, 2],
          theme: ["lightest", "light"],
        },
      ],
    },
  ],
  requiredPermissions: {
    // File pickers for palettes, presets and PNG export.
    localFileSystem: "request",
    network: {
      domains: [
        `ws://localhost:${extraPrefs.hotReloadPort}`, // hot reload in dev
        `http://localhost:${extraPrefs.webviewReloadPort}`, // webview dev server
      ],
    },
    webview: {
      allow: "yes",
      allowLocalRendering: "yes",
      domains: "all",
      enableMessageBridge: "localAndRemote",
    },
  },
  icons: [
    {
      width: 48,
      height: 48,
      path: "icons/plugin-icon.png",
      scale: [1, 2],
      theme: ["darkest", "dark", "medium", "lightest", "light", "all"],
      species: ["pluginList"],
    },
  ],
};

export const config: UXP_Config = {
  manifest,
  ...extraPrefs,
};
