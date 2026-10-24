import { test, expect } from "@playwright/test";
import { trackErrors, settle, landed, textured, drawn } from "./helpers.js";

const WORLDS = 10;
/** The paths the page asks for, as it asks for them. */
const record = (page) => {
  const asked = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  return asked;
};
const textures = (asked) => asked.filter((p) => p.startsWith("/tex/"));

test("the page asks for the world's textures itself, once, and the other worlds' textures once the map has drawn, each once and without a redraw", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const asked = record(page);
  // the others land spread out, so a redraw on a landing would be caught in the act
  await page.route("**/tex/*.png", async (route) => {
    if (!route.request().url().endsWith("/INCA.png")) await new Promise((r) => setTimeout(r, 150));
    await route.continue();
  });
  await page.goto("/#INCA/11/45,35/fit/33");
  await settle(page);
  // held still, so that only a landing could draw the map again
  await page.locator("#showMotion").uncheck();
  await landed(page);
  // the page's preload asked for it, and the draw took that rather than asking again
  const asker = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((e) => /\/tex\/INCA\.png$/.test(e.name))
      .map((e) => e.initiatorType),
  );
  expect(asker).toEqual(["link"]);
  expect(textures(asked)[0]).toBe("/tex/INCA.png");
  // the map stays as it is while the others land
  await expect.poll(() => textures(asked).length).toBeGreaterThan(1);
  expect(await drawn(page)).toBe(0);
  await expect.poll(() => textures(asked).length, { timeout: 15000 }).toBe(WORLDS);
  expect(new Set(textures(asked)).size).toBe(WORLDS);
  // the next world's textures came first, so stepping into it finds its textures here
  const order = textures(asked);
  expect(order[1]).toBe("/tex/ARCTIC.png");
  await page.evaluate(() => {
    location.hash = "#ARCTIC/0/45,35/fit/33";
  });
  await settle(page);
  await textured(page);
  expect(textures(asked).length).toBe(WORLDS);
  expect(errors).toEqual([]);
});

test("a browser set to save data gets the shown world's textures and no other world's textures ahead", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const asked = record(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true } });
  });
  await page.goto("/#HAZE/0/45,35/fit/33");
  await settle(page);
  await landed(page);
  await page.waitForTimeout(1500);
  expect(textures(asked)).toEqual(["/tex/HAZE.png"]);
  expect(errors).toEqual([]);
});

test("a link to a draft preloads no texture, and the level shown asks for its own texture once", async ({
  page,
}) => {
  const asked = record(page);
  await page.goto("/#DRAFT/5/45,35/fit/33");
  await settle(page);
  expect(await page.locator("link[rel=preload][as=image]").count()).toBe(0);
  await textured(page);
  expect(textures(asked)[0]).toBe("/tex/HIRO.png");
  expect(textures(asked).filter((p) => p === "/tex/HIRO.png")).toHaveLength(1);
});
