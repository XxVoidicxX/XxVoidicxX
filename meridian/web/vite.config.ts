import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true, proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } } },
  resolve: { alias: { "@": "/src" } },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
});
