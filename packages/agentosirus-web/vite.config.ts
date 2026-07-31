import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves a project site from /<repo>/, so the bundle needs a
// matching base path. The deploy workflow sets VITE_BASE at build time; local
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
