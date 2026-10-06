import { test, expect } from "@playwright/test";
import { trackErrors, settle } from "./helpers.js";

test("the map boots into standards mode with nothing on the console", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  expect(errors).toEqual([]);
});

test("the page a link lands on says what it is", async ({ page }) => {
  await page.goto("/");
  const head = await page.evaluate(() => ({
    canonical: document.querySelector("link[rel=canonical]")?.href,
    ogTitle: document.querySelector("meta[property='og:title']")?.content,
    ogImage: document.querySelector("meta[property='og:image']")?.content,
    twitter: document.querySelector("meta[name='twitter:card']")?.content,
    manifest: document.querySelector("link[rel=manifest]")?.href,
  }));
  expect(head.canonical).toBe("https://kulaworld.retroatlas.org/");
  expect(head.ogTitle).toBe("Kula World Map");
  expect(head.ogImage).toMatch(/og-image\.png$/);
  expect(head.twitter).toBe("summary_large_image");
  for (const path of [
    "og-image.png",
    "favicon-96.png",
    "apple-touch-icon.png",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
    "404.html",
  ]) {
    const res = await page.request.get(`/${path}`);
    expect(res.status(), path).toBe(200);
  }
});

test("the icons are Hiro's ball in its own panel colours, on the tile", async ({ page }) => {
  await page.goto("/");
  const icons = await page.evaluate(async () => {
    const { balls } = await (await fetch("objects.json")).json();
    const panels = [...new Set(balls[0].rgb.map((c) => c.slice(0, 3).join()))];
    const read = async (src, size) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0, size, size);
      const px = g.getImageData(0, 0, size, size).data;
      const at = (x, y) => [...px.slice((y * size + x) * 4, (y * size + x) * 4 + 4)];
      const seen = new Map(panels.map((p) => [p, 0]));
      for (let i = 0; i < px.length; i += 4) {
        const key = `${px[i]},${px[i + 1]},${px[i + 2]}`;
        if (px[i + 3] === 255 && seen.has(key)) seen.set(key, seen.get(key) + 1);
      }
      return {
        src,
        natural: [img.naturalWidth, img.naturalHeight],
        corner: at(0, 0),
        tile: at(Math.round(size / 24), Math.round(size / 2)),
        centre: at(size / 2, size / 2),
        panels: [...seen.values()],
      };
    };
    return Promise.all([
      read("favicon.svg", 96),
      read("favicon-96.png", 96),
      read("apple-touch-icon.png", 180),
    ]);
  });
  expect(icons[1].natural).toEqual([96, 96]);
  expect(icons[2].natural).toEqual([180, 180]);
  for (const icon of icons) {
    expect(icon.corner[3], icon.src).toBe(0);
    expect(icon.tile, icon.src).toEqual([18, 22, 31, 255]);
    expect(icon.centre, icon.src).toEqual([255, 255, 255, 255]);
    expect(icon.panels.filter((count) => count > 20).length, icon.src).toBe(5);
  }
});
