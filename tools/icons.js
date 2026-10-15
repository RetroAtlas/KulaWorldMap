// Renders the raster icons from public/favicon.svg.
//
//     npx playwright install --with-deps chromium
//     node tools/icons.js
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT } from "../tests/public.js";

// A home screen fills a transparent icon with black, so its icon carries the tile.
const ICONS = [
  ["favicon-96.png", 96, false],
  ["apple-touch-icon.png", 180, true],
];

const ball = readFileSync(join(ROOT, "public", "favicon.svg"), "utf8");
const tile = ball
  .replace(/viewBox="[^"]*"/, 'viewBox="0 0 64 64"')
  .replace("</defs>", '</defs>\n  <rect width="64" height="64" rx="10" fill="#12161f"/>');
const src = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const browser = await chromium.launch();
try {
  for (const [name, size, tiled] of ICONS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<body style="margin:0;background:transparent"><img src="${src(tiled ? tile : ball)}" width="${size}" height="${size}"></body>`,
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
