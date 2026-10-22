import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite preview` serves the build with the same security headers as Vercel (vercel.json), so they can be tried locally.
// The dev server leaves them out: React's hot reload needs inline scripts.
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> };
const securityHeaders = Object.fromEntries(vercel.headers.flatMap(h => h.headers).map(h => [h.key, h.value]));

export default defineConfig({
  plugins: [react()],
  // Font files stay separate files: inlined as data: URLs they'd be refused by the font-src 'self' policy.
  build: { assetsInlineLimit: file => (/\.woff2?$/.test(file) ? false : undefined) },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:4000", ws: true } }
  },
  preview: {
    headers: securityHeaders,
    proxy: { "/api": { target: "http://127.0.0.1:4000", ws: true } }
  }
});
