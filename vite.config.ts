import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __ENABLE_LOCAL_API__: JSON.stringify(mode !== "demo") },
  plugins: [react(), viteSingleFile()],
  server: { proxy: { "/api": "http://127.0.0.1:4328" } },
}));
