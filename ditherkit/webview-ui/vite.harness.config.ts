import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Serves harness.html: the panel with a fake Photoshop, for UI work in a normal browser.
export default defineConfig({
  plugins: [react()],
  server: { port: 5181, open: false },
  build: { outDir: "harness-dist", rollupOptions: { input: "harness.html" } },
});
