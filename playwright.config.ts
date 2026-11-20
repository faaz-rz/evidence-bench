import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  use: { baseURL: "http://127.0.0.1:4330", browserName: "chromium" },
  webServer: {
    command: "npm run build:demo && npx vite preview --strictPort --port 4330",
    url: "http://127.0.0.1:4330",
    timeout: 60_000,
  },
});
