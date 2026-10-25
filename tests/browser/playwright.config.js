import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = 8480;

export default defineConfig({
  testDir: ".",
  fullyParallel: true, // every test opens its own page, so a file's tests need no order
  retries: 0, // a flake must surface as red, not be retried away
  timeout: process.env.CI ? 20_000 : 10_000, // past it a test holds the page's clock, or calls test.slow() and says what it waits for
  workers: process.env.CI ? 3 : undefined, // a renderer a vCPU, one left to the browser's own processes
  globalTimeout: process.env.CI ? 600_000 : 0, // a shard's run is short, so one that passes this has hung
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["./budget.js"]],
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
