// Renders the social card from a level of each world of the map.
//
//     npx playwright install --with-deps chromium
//     node tools/ogcard.js
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, serve } from "../tests/public.js";

const W = 1200;
const H = 630;
const LEVELS = [
  "/HIRO/HIRO.PAK#6", // LEVEL 7
  "/HILLS/HILLSFI.PAK#1", // FINAL 4
  "/INCA/INCA.PAK#8", // LEVEL 39
  "/ARCTIC/ARCTIC.PAK#6", // LEVEL 52
  "/COWBOY/COWBOY.PAK#3", // LEVEL 64
  "/FIELD/FIELD.PAK#8", // LEVEL 84
  "/ATLANT/ATLANT.PAK#11", // LEVEL 102
  "/HAZE/HAZEFI.PAK#0", // FINAL 15
  "/MARS/MARS.PAK#0", // LEVEL 121
  "/HELL/HELL.PAK#13", // LEVEL 149
];
const TILE = { w: 240, h: 225, cols: 5, top: 10, pad: [20, 16] };

const server = await serve(join(ROOT, "public"));

try {
  const browser = await chromium.launch();
  // Reduced motion opens the map held still, so the card comes out the same on
  // every run.
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const png = await page.evaluate(
    async ({ W, H, LEVELS, TILE }) => {
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
      state.show.labels = false;
      state.show.outlines = true;

      const cv = document.getElementById("cv");
      const g = cv.getContext("2d");
      // The box round what the map drew, above the scale bar.
      const drawn = () => {
        render.invalidatePick();
        render.draw();
        const w = cv.width;
        const h = cv.height - 60;
        const px = g.getImageData(0, 0, w, h).data;
        let x0 = w,
          y0 = h,
          x1 = -1,
          y1 = -1;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (px[i] === px[0] && px[i + 1] === px[1] && px[i + 2] === px[2]) continue;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      };

      const card = document.createElement("canvas");
      card.width = W;
      card.height = H;
      const c = card.getContext("2d");
      c.fillStyle = "#111725";
      c.fillRect(0, 0, W, H);
      for (const [n, key] of LEVELS.entries()) {
        const i = state.data.levels.findIndex((l) => `${l.pack}#${l.index}` === key);
        if (i < 0) throw new Error(`${key} is not on the disc`);
        nav.selectLevel(i);
        state.cam.yaw = 38;
        state.cam.pitch = 30;
        nav.fit();
        state.framing = null;
        while (!atlasFor(state.lvl.theme)) {
          if (Date.now() > deadline) throw new Error(`the atlas of ${key} did not load`);
          await new Promise((r) => setTimeout(r, 50));
        }
        // Half the fit keeps the level clear of the scale bar while it is measured.
        state.cam.zoom /= 2;
        let box = drawn();
        state.cam.zoom *= Math.min((TILE.w - TILE.pad[0]) / box.w, (TILE.h - TILE.pad[1]) / box.h);
        box = drawn();
        const x = (n % TILE.cols) * TILE.w + (TILE.w - box.w) / 2;
        const y = TILE.top + Math.floor(n / TILE.cols) * TILE.h + (TILE.h - box.h) / 2;
        c.drawImage(cv, box.x, box.y, box.w, box.h, Math.round(x), Math.round(y), box.w, box.h);
      }

      c.font = "600 52px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = "#e8eefb";
      c.fillText("Kula World ", 64, 552);
      const w = c.measureText("Kula World ").width;
      c.fillStyle = "#6fd3ff";
      c.fillText("Map", 64 + w, 552);
      c.font = "21px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = "#a3b1c6";
      c.fillText("Every level of the PlayStation original, read straight off the disc", 66, 588);
      return card.toDataURL("image/png");
    },
    { W, H, LEVELS, TILE },
  );

  const out = join(ROOT, "public", "og-image.png");
  await writeFile(out, Buffer.from(png.slice(png.indexOf(",") + 1), "base64"));
  await browser.close();
  const packed = spawnSync("oxipng", ["-o", "max", "--strip", "safe", out], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (packed.error || packed.status !== 0) {
    console.error("oxipng did not compress public/og-image.png: do not commit it");
    process.exitCode = 1;
  }
  console.log(`public/og-image.png  ${W}x${H}`);
} finally {
  server.close();
}
