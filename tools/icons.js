// Renders the raster icons from public/favicon.svg.
//
//     npx playwright install --with-deps chromium
//     node tools/icons.js
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT } from "../tests/public.js";

const ICONS = [
  ["favicon-96.png", 96],
  ["apple-touch-icon.png", 180],
];

const svg = readFileSync(join(ROOT, "public", "favicon.svg"), "utf8");
const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const browser = await chromium.launch();
try {
  for (const [name, size] of ICONS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="${src}" width="${size}" height="${size}"></body>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    const icon = join(ROOT, "public", name);
    await page.screenshot({ path: icon, omitBackground: true });
    await page.close();
    const packed = spawnSync("oxipng", ["-o", "max", "--strip", "safe", icon], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    if (packed.error || packed.status !== 0) {
      console.error(`oxipng did not compress public/${name}: do not commit it`);
      process.exitCode = 1;
    }
    console.log(`public/${name}  ${size}x${size}`);
  }
} finally {
  await browser.close();
}
