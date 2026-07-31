import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// This config file is executed by Vite in Node, where `process` exists. We
// deliberately do NOT depend on @types/node: that would both desync
// package-lock.json and leak Node globals into browser-facing `src/` code
// (which must use `import.meta.env` instead). A `declare const` inside a
// module is file-scoped, so this narrow surface stays confined here.
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves a project site from /<repo>/, so the bundle needs a
// matching base path. A deploy workflow can set VITE_BASE at build time; local
// dev and user/org pages fall back to "/".
const base = process.env.VITE_BASE || "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true
  }
});
