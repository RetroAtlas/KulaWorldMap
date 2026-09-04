import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame } from "./helpers.js";

test("the map boots into standards mode with nothing on the console", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  expect(errors).toEqual([]);
});

test("a permalink opens on the level and the camera it names", async ({ page }) => {
  await page.goto("/#L11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { name: state.lvl.name, ...state.cam, slice: state.slice, target: state.target };
  });
  expect(cam.name).toBe("LEVEL 12");
  expect(cam.yaw).toBe(30);
  expect(cam.pitch).toBe(20);
  expect(cam.zoom).toBeCloseTo(1.25, 5);
  expect(cam.slice).toBe(25);
  expect(cam.target).toEqual([18, 13, 17]);
});

test("a hash naming no level puts the address bar back", async ({ page }) => {
  await page.goto("/#L11");
  await settle(page);
  await page.evaluate(() => (location.hash = "#L999"));
  await frame(page);
  expect(page.url()).toContain("#L11/");
});

test("the camera writes the URL once a frame, not once an event", async ({ page }) => {
  await page.goto("/#L0");
  await settle(page);
  const calls = await page.evaluate(() => {
    let n = 0;
    const orig = history.replaceState.bind(history);
    history.replaceState = (...a) => {
      n++;
      return orig(...a);
    };
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }));
    for (let i = 0; i < 60; i++)
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 600 + i, clientY: 400 + i, pointerId: 1 }),
      );
    for (let i = 0; i < 20; i++)
      cv.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: 600, clientY: 400, cancelable: true }),
      );
    cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 660, clientY: 460, pointerId: 1 }));
    history.replaceState = orig;
    return n;
  });
  expect(calls).toBe(0);
  await frame(page);
  expect(page.url()).toMatch(/#L0\//);
});

test("clicking the start's block opens the record every level ends with", async ({ page }) => {
  await page.goto("/#L0");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const [x, y, z] = state.lvl.start.at;
    showCell({ x, y, z, v: 5 });
  });
  const detail = page.locator("#detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Start");
  await expect(detail).toContainText("time");
});

test("the catalogue's own note reaches the catalogue", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const note = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { levelNote } = await import(new URL("js/data.js", location.href).href);
    const i = state.data.levels.findIndex((l) => l.name === "OBJ LEVEL");
    const { selectLevel } = await import(new URL("js/navigate.js", location.href).href);
    selectLevel(i);
    return levelNote(state.data.levels[i]);
  });
  expect(note).toMatch(/object catalogue/i);
  await expect(page.locator("#chip .note")).toContainText("object catalogue");
});
