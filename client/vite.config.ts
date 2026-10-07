import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Builds to ../web, which the Node server serves. Two entries: the app and the public login page.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../web",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: resolve(__dirname, "index.html"), login: resolve(__dirname, "login.html"), emerald: resolve(__dirname, "emerald.html") },
      // Keep the licensed font files together so they can be left out of git.
      output: { assetFileNames: (a) => (/\.woff2?$/.test(a.name ?? "") ? "assets/fonts/[name]-[hash][extname]" : "assets/[name]-[hash][extname]") },
    },
  },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
