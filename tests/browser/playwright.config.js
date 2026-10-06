import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = 8480;

export default defineConfig({
  testDir: ".",
  retries: 0, // a flake must surface as red, not be retried away
  timeout: 20_000,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1, // canvas pixels are CSS pixels
    contextOptions: { reducedMotion: "no-preference" },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `python3 -m http.server --bind 127.0.0.1 ${PORT} -d public`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false, // a stray server from another tree must not serve this suite
    stdout: "ignore",
    stderr: "ignore",
  },
});
