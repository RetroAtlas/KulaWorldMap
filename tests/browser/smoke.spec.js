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

test("clicking the start's block opens the object standing on it", async ({ page }) => {
  await page.goto("/#L0");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 30));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  const detail = page.locator("#detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Start");
  await expect(detail).toContainText("on the top");
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

test("the drawer stays dismissable on the narrowest phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#L0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  const btn = await page.locator("#menuBtn").boundingBox();
  expect(btn.x + btn.width).toBeLessThanOrEqual(320);
  await expect(page.locator("#scrim")).toBeVisible();
  await page.locator("#scrim").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
});

test("Escape leaves the drawer alone where it sits beside the map", async ({ page }) => {
  await page.goto("/#L0");
  await settle(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#scrim")).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains("sidebar-open"))).toBe(true);
});

test("search answers a number as a whole word, and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level 45");
  await expect(page.locator("#results [role=option]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 45");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit0");

  await search.fill("zzzz");
  await expect(page.locator("#results .empty")).toBeVisible();
  await expect(search).not.toHaveAttribute("aria-activedescendant", /./);

  await search.fill("");
  await expect(page.locator("#results")).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("an object search lists every one round the level in hand, and a row goes there", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#L11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  const groups = page.locator("#results [role=group]");
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(groups.nth(1)).toHaveAttribute("aria-label", "HIRO");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("LEVEL 12");
  await expect(rows.first()).toContainText("number=");
  await expect(page.locator("#results .more")).toContainText(/^\d+ objects · HIRO \d+ · HILLS/);
  // eight to a group, the rest a click away
  const hiro = groups.nth(1);
  await expect(hiro.locator("[role=option]")).toHaveCount(8);
  await hiro.locator(".showmore").click();
  expect(await hiro.locator("[role=option]").count()).toBeGreaterThan(8);

  // a row in another level goes there and keeps the list, laid out round the new level
  const row = hiro.locator("[role=option]").first();
  const where = await row.textContent();
  await row.click();
  const at = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { x, y, z } = state.selected;
    return { name: state.lvl.name, target: state.target, selected: [x, y, z] };
  });
  expect(where).toContain(at.name);
  const [, x, y, z] = /(\d+),(\d+),(\d+)/.exec(where);
  expect(at.target).toEqual([x, y, z].map((v) => Number(v) + 0.5));
  // the find is selected, so the panel and the outline say which one it was
  expect(at.selected).toEqual([x, y, z].map(Number));
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Key");
  await expect(page.locator("#detail")).toContainText(`cell ${x},${y},${z}`);
  await expect(page.locator("#say")).toHaveText(`Key, top, ${x},${y},${z}, ${at.name}`);
  await expect(page.locator("#results")).toBeVisible();
  await expect(groups.first()).toHaveAttribute("aria-label", `HIRO · ${at.name}`);
  await expect(rows.first()).toHaveAttribute("aria-selected", "true");
  await expect(search).not.toBeFocused();

  // the scope bar narrows the list to the level in hand
  await page.locator("#scope button").nth(2).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#results .more")).toContainText(`1 object in ${at.name}`);
  await page.locator("#results .widen").click();
  expect(await rows.count()).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("a field is searched as name=value, and a match outside the row is appended to it", async ({
  page,
}) => {
  await page.goto("/#L0");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("starts=off");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("starts=off");
  await expect(rows.first().locator("mark")).toHaveText("starts=off");
  await search.fill("f12=500");
  await expect(rows.first()).toContainText("f12=500");
  await search.fill("f12=50");
  await expect(page.locator("#results .empty")).toBeVisible();
  // the keys walk the rows and Enter chooses
  await search.fill("coin");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit1");
  const before = await page.evaluate(() => location.hash);
  await search.press("Enter");
  await frame(page);
  expect(await page.evaluate(() => location.hash)).not.toBe(before);
});

test("a find above the slice's ceiling lifts the ceiling to it", async ({ page }) => {
  await page.goto("/#L11/45,35/1/17,17,17/0,0/14");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 12");
  await search.press("Enter");
  const at = await page.evaluate(async () => {
    const { state, sliceZ } = await import(new URL("js/state.js", location.href).href);
    return { z: state.selected.z, ceiling: sliceZ(), slice: state.slice };
  });
  expect(at.z).toBeLessThan(19);
  expect(at.ceiling).toBe(at.z);
  await expect(page.locator("#chip")).toContainText(`sliced to z≥${at.z}`);
  await expect(page.locator("#slice")).toHaveValue(String(at.slice));
});

test("arriving somewhere is spoken, and names the map with it", async ({ page }) => {
  await page.goto("/#L0");
  await settle(page);
  const line = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(line);
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", line);
  await page.keyboard.press("]");
  await expect(page.locator("#say")).toContainText("LEVEL 2");
});

test("a panel is a dialog that a click inside does not dismiss", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.locator("#aboutBtn").click();
  const help = page.locator("#help");
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("aria-label", "About this map");
  await expect(page.locator("#help .x")).toBeFocused();

  await page.locator("#help .box p").first().click();
  await expect(help).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(page.locator("#aboutBtn")).toBeFocused();

  await page.locator("#aboutBtn").click();
  await page.locator("#help").click({ position: { x: 5, y: 5 } });
  await expect(help).toBeHidden();
});

test("objects draw as themselves, keep turning, and go back to markers on d", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#L0");
  await settle(page);
  const probe = async () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { markerModel, levelMarkers } = await import(new URL("js/data.js", location.href).href);
      const marks = levelMarkers(state.lvl);
      return {
        models: state.show.models,
        drawn: marks.filter((m) => markerModel(m, state.lvl)).length,
        of: marks.length,
      };
    });
  const before = await probe();
  expect(before.models).toBe(true);
  // LEVEL 1: two coins, a key, a fruit, the exit, and the ball at the start
  expect(before.drawn).toBe(6);
  expect(before.of).toBe(6);
  // the coins turn, so the frame is drawn again without anyone touching the page
  const frames = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const cv = document.getElementById("cv");
        const g = cv.getContext("2d");
        const fill = g.fill.bind(g);
        g.fill = (...a) => (n++, fill(...a));
        setTimeout(() => done(n), 400);
      }),
  );
  expect(frames).toBeGreaterThan(50);
  await page.keyboard.press("d");
  const after = await probe();
  expect(after.models).toBe(false);
  await expect(page.locator("#showModels")).not.toBeChecked();
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
