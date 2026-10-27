import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers.js";
import { BONUS_LEVEL, anchor, clockLine, opened, startPlay, stopOn } from "./playhelpers.js";

test("the play strip ends short of the corner's widgets once Follow shows, its buttons wrapping rather than its line's words, so the corner's ball button can still be pressed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await page.keyboard.press("r");
  await stopOn(page, [17, 15, 17]);
  await stopOn(page, [20, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  await startPlay(page);
  await expect(page.locator("#followBtn")).toBeVisible();
  await expect(page.locator("#followBtn")).toHaveText("Follow");
  await expect(page.locator("#keepBtn")).toHaveText("Keep");
  const strip = await page.locator("#play").boundingBox();
  const corner = await page.locator("#corner").boundingBox();
  expect(strip.x + strip.width).toBeLessThanOrEqual(corner.x);
  const lineBox = await page.locator("#playLine").boundingBox();
  expect(lineBox.height).toBeLessThan(30);
  const hit = () =>
    page.evaluate(() => {
      const button = document.getElementById("playBtn");
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    });
  expect(await hit()).toBe(true);
  // with the pad shown the corner stands left of the jump, the strip still short of the corner
  await page.locator("#padBtn").click();
  await expect(page.locator("#jump")).toBeVisible();
  const [padded, moved, jump] = await Promise.all(
    ["#play", "#corner", "#jump"].map((sel) => page.locator(sel).boundingBox()),
  );
  expect(padded.x + padded.width).toBeLessThanOrEqual(moved.x);
  expect(moved.x + moved.width).toBeLessThanOrEqual(jump.x);
  expect(await hit()).toBe(true);
  await page.locator("#padBtn").click();
  await expect(page.locator("#jump")).toBeHidden();
  const [cv, back] = await Promise.all(
    ["#cv", "#corner"].map((sel) => page.locator(sel).boundingBox()),
  );
  expect(cv.x + cv.width - (back.x + back.width)).toBeLessThanOrEqual(13);
  await page.locator("#playBtn").click();
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the HUD takes the level line's place while the ball is on the level, naming it and showing the clock in the middle with the points at its left and the keys with the key's icon at its right, and gives the line back on Leave", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const hud = page.locator("#hud");
  const chip = page.locator("#chip");
  await expect(chip).toBeVisible();
  await expect(hud).toBeHidden();
  await startPlay(page);
  await expect(hud).toBeVisible();
  await expect(chip).toBeHidden();
  await expect(page.locator("#hudTitle")).toHaveText("LEVEL 1 · HIRO");
  // the clock reads as a phrase, its word for a reader alone and its digits shown large
  await expect(clockLine(page)).toHaveText(/^Time \d+$/);
  const word = await clockLine(page).locator(".sr").boundingBox();
  expect(word.width).toBeLessThanOrEqual(1);
  await expect(clockLine(page).locator("b")).toBeVisible();
  await expect(clockLine(page).locator("b")).toHaveText(/^\d+$/);
  await expect(page.locator("#playPoints")).toHaveText("0 points");
  await expect(page.locator("#playKeys")).toHaveText("Keys 1");
  await expect(page.locator("#playKeys canvas.icon")).toHaveCount(1);
  const [box, cv, points, clock, keys] = await Promise.all(
    ["#hud", "#cv", "#playPoints", "#playClock", "#playKeys"].map((sel) =>
      page.locator(sel).boundingBox(),
    ),
  );
  expect(Math.abs(box.x + box.width / 2 - (cv.x + cv.width / 2))).toBeLessThanOrEqual(2);
  expect(box.y + box.height).toBeLessThanOrEqual(cv.y + 80);
  expect(points.x + points.width).toBeLessThanOrEqual(clock.x);
  expect(clock.x + clock.width).toBeLessThanOrEqual(keys.x);
  // the clock keeps the middle as the figures beside it grow
  const middle = (b) => b.x + b.width / 2;
  await page.evaluate(() => {
    document.querySelector("#playPoints b").textContent = "2500";
    document.querySelector("#playKeys b").textContent = "12";
  });
  const grown = await page.locator("#playClock").boundingBox();
  expect(Math.abs(middle(grown) - middle(clock))).toBeLessThanOrEqual(1);
  expect(Math.abs(middle(grown) - (cv.x + cv.width / 2))).toBeLessThanOrEqual(2);
  // the HUD lies over the view, so the ball is framed a fifth below the middle of what the strip
  // alone leaves free
  const spot = await anchor(page);
  expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
  await page.keyboard.press("Escape");
  await expect(hud).toBeHidden();
  await expect(chip).toBeVisible();
  expect(errors).toEqual([]);
});

test("the HUD's title carries the disc's word on a level as another disc ships it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: "/#HELL/17/45,35/fit/33/d-eu" });
  await startPlay(page);
  await expect(page.locator("#hudTitle")).toHaveText("BONUS 30 · HELL · EU");
  expect(errors).toEqual([]);
});

test("on a level with no key the HUD counts the blocks still to roll onto and draws no key", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: BONUS_LEVEL });
  await startPlay(page);
  await expect(page.locator("#playKeys")).toHaveText(/^\d+ blocks$/);
  await expect(page.locator("#playKeys canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
});
