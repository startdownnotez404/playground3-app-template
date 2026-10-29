import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { playground3DevHost } from "./dev/devHostPlugin.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // playground3DevHost is serve-only: it opens dev/host.html (mock
  // StageBridge host) and never touches `vite build` output.
  plugins: [react(), viteSingleFile(), playground3DevHost({ rootDir })],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@mui/material",
      "@mui/icons-material",
      "@emotion/react",
      "@emotion/styled",
    ],
  },
  optimizeDeps: {
    exclude: ["@startdownnotez404/playground3-stage-sdk"],
  },
  server: {
    host: true,
  },
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
  },
});
