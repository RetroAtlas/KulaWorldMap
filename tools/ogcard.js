// The social card is a real render of a real level, posed by this script so it
// can be redrawn whenever the renderer or the palette changes.
//
//     npx playwright install --with-deps chromium
//     node tools/ogcard.js
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = 8481;
const W = 1200;
const H = 630;
const LEVEL = 30; // FINAL 1, whose lattice reads as a solid from every angle

const server = spawn("python3", ["-m", "http.server", String(PORT), "-d", "public"], {
  cwd: ROOT,
  stdio: "ignore",
});

try {
  const browser = await chromium.launch();
  // The map opens with Motion off for a visitor who asks for reduced motion,
  // every thing where and as the level starts it, so the card comes out the
  // same on every run.
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.evaluate(async (level) => {
    const url = (m) => new URL("js/" + m, location.href).href;
    const { state } = await import(url("state.js"));
    const nav = await import(url("navigate.js"));
    const render = await import(url("render.js"));
    const { setSidebar } = await import(url("sidebar.js"));
    const { atlasFor } = await import(url("atlas.js"));
    const deadline = Date.now() + 30000;
    while (!state.data) {
      if (Date.now() > deadline) throw new Error("map_data.json did not load");
      await new Promise(requestAnimationFrame);
    }
    setSidebar(false);
    await new Promise((r) => setTimeout(r, 400));
    render.resize();
    nav.selectLevel(level);
    state.cam.yaw = 38;
    state.cam.pitch = 30;
    nav.fit();
    state.cam.zoom *= 0.78;
    state.cam.panX = -6.4;
    state.cam.panY = 2.1;
    // a pose rather than a fit, which a resize leaves where it is
    state.framing = null;
    state.show.labels = false;
    state.show.start = false;
    state.show.outlines = true;
    render.invalidatePick();
    render.draw();

    // The level draws flat until its world's atlas arrives, and draws again
    // as it lands, which would paint over the title.
    while (!atlasFor(state.lvl.theme)) {
      if (Date.now() > deadline) throw new Error("the atlas did not load");
      await new Promise((r) => setTimeout(r, 50));
    }
    render.invalidatePick();
    render.draw();

    const cv = document.getElementById("cv");
    const g = cv.getContext("2d");
    const d = state.view.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    // the scale bar the map draws for itself has no business on a card
    g.fillStyle = "#111725";
    g.fillRect(0, 470, cv.width, cv.height);
    g.font = "600 52px ui-sans-serif, system-ui, sans-serif";
    g.fillStyle = "#e8eefb";
    g.fillText("Kula World ", 64, 552);
    const w = g.measureText("Kula World ").width;
    g.fillStyle = "#6fd3ff";
    g.fillText("Map", 64 + w, 552);
    g.font = "21px ui-sans-serif, system-ui, sans-serif";
    g.fillStyle = "#a3b1c6";
    g.fillText("Every level of the PlayStation original, read straight off the disc", 66, 588);
    for (const id of ["chip", "readout", "corner", "menuBtn"])
      document.getElementById(id).style.display = "none";
  }, LEVEL);

  await page.locator("#cv").screenshot({ path: join(ROOT, "public", "og-image.png") });
  await browser.close();
  // the same squeeze tools/png.py puts over everything else it writes
  spawnSync("oxipng", ["-q", "-o", "max", "--strip", "safe", join(ROOT, "public", "og-image.png")]);
  console.log(`public/og-image.png  ${W}x${H}`);
} finally {
  server.kill();
}
