import { expect, test } from "@playwright/test";
import { drawn, keyed, landed, settle } from "./helpers.js";

const notice = (page, msg) =>
  page.evaluate(
    async (msg) => (await import(new URL("js/viewer/ui/toast.js", location.href).href)).toast(msg),
    msg,
  );

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

test("the keys list wears each key as a cap and leaves a gesture in words", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const rows = page.locator("#help dt");
  await expect(rows.first()).toHaveText("drag");
  await expect(rows.first().locator("kbd")).toHaveCount(0);
  await expect(rows.filter({ hasText: "wheel" }).locator("kbd")).toHaveText(["+", "−"]);
  await expect(rows.filter({ hasText: "Esc" }).first().locator("kbd")).toHaveText(["Esc"]);
  await expect(rows.filter({ hasText: "?" }).locator("kbd")).toHaveText(["?"]);
  // a chord is a cap for each key, and the arrow keys are arrows
  await expect(rows.filter({ hasText: "Shift+s" }).locator("kbd")).toHaveText(["Shift", "s"]);
  await expect(rows.filter({ hasText: "right-drag" }).locator("kbd")).toHaveText([
    "Shift",
    "←",
    "↑",
    "→",
    "↓",
  ]);
  // a cap in the list is the hint beside a switch in the settings
  const look = (sel) =>
    page.evaluate((sel) => {
      const s = getComputedStyle(document.querySelector(sel));
      return [s.font, s.color, s.backgroundColor, s.borderBottomWidth, s.borderRadius].join();
    }, sel);
  expect(await look("#help dt kbd")).toBe(await look("#settings kbd"));
  // the plus joining a chord wears the caps' grey, so the keys carry the chord
  const colour = (sel) =>
    page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).color, sel);
  expect(await colour("#help dt i")).toBe(await colour("#help dt kbd"));
});

test("the keys list is sorted into sections by what the keys are for", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  await expect(page.locator("#help")).toBeVisible();
  const sections = await page.evaluate(() =>
    [...document.querySelectorAll("#help section")].map((s) => ({
      title: s.querySelector("h4").textContent,
      keys: [...s.querySelectorAll("dt")].map((d) => d.textContent),
      said: [...s.querySelectorAll("dd")].map((d) => d.textContent),
    })),
  );
  expect(sections.map((s) => s.title)).toEqual([
    "The map",
    "Display",
    "Route planner",
    "Play",
    "Editor",
  ]);
  for (const s of sections) expect(s.keys.length, s.title).toBeGreaterThan(0);
  // the section says the mode, so no row does
  for (const s of sections)
    for (const line of s.said)
      expect(line).not.toMatch(/while editing|while playing|with the route planner on/);
  // a key that means something in several modes has a row in each
  expect(sections.filter((s) => s.keys.includes("Esc")).map((s) => s.title)).toEqual([
    "The map",
    "Play",
    "Editor",
  ]);
  // a section's heading wears the look of the headings in Settings
  const look = (sel) =>
    page.evaluate((sel) => {
      const s = getComputedStyle(document.querySelector(sel));
      return [s.font, s.color, s.textTransform, s.letterSpacing].join();
    }, sel);
  expect(await look("#help h4")).toBe(await look("#settings h4"));
});

test("the keys list says what a key does and not what it waits on", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const said = await page.locator("#help dd").allTextContents();
  for (const line of [
    "dim what the slice hides rather than take it off",
    "previous and next level",
    "objects as models",
    "motion",
    "object labels",
    "start camera",
  ])
    expect(said).toContain(line);
});

test("the list and the tooltips name Ctrl and Alt as the keyboard in front of you does", async ({
  context,
}) => {
  for (const [platform, ctrl, alt] of [
    ["Win32", "Ctrl", "Alt"],
    ["MacIntel", "Cmd", "Option"],
  ]) {
    const page = await context.newPage();
    await page.addInitScript(
      (p) => Object.defineProperty(navigator, "platform", { get: () => p, configurable: true }),
      platform,
    );
    await page.goto("/#HIRO/0");
    await settle(page);
    await page.keyboard.press("?");
    await expect(page.locator("#help")).toBeVisible();
    const keys = await page.locator("#help dt").allTextContents();
    for (const key of [`${ctrl}+Z`, `${ctrl}+Shift+Z`, `${alt}+click`])
      expect(keys, platform).toContain(key);
    const other = ctrl === "Ctrl" ? /\b(Cmd|Option)\b/ : /\b(Ctrl|Alt)\b/;
    for (const key of keys) expect(key, platform).not.toMatch(other);
    for (const [id, chord] of [
      ["undoBtn", `${ctrl}-Z`],
      ["redoBtn", `${ctrl}-Shift-Z`],
      ["courseUndo", `${ctrl}-Z`],
      ["courseRedo", `${ctrl}-Shift-Z`],
    ])
      expect(await page.locator(`#${id}`).getAttribute("title"), `${id} on ${platform}`).toMatch(
        new RegExp(`\\(${chord}\\)$`),
      );
    await page.close();
  }
});

test("Back closes a dialog and leaves the map where it was", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const url = page.url();
  const help = page.locator("#help");
  await page.keyboard.press("?");
  await expect(help).toBeVisible();
  await page.goBack();
  await expect(help).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.locator("#chip")).toContainText("LEVEL 12");
  // closed any other way, it gives back the entry it stood on
  await page.keyboard.press("?");
  await expect.poll(() => page.evaluate(() => history.state)).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  expect(page.url()).toBe(url);
});

test("a dialog keeps the keys to itself", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const help = page.locator("#help");
  const inside = () =>
    page.evaluate(() => document.getElementById("help").contains(document.activeElement));
  await page.keyboard.press("?");
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).not.toBeChecked();
  await page.locator("#aboutBtn").click();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }
});

test("a dialog opened as another closes stays open, on an entry of its own", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const help = page.locator("#help");
  await page.keyboard.press("?");
  const first = await page.evaluate(() => history.state.dialog);
  // both at once, before the Back that closing the first spends has landed
  await keyed(page, "keydown", ["Escape", "?"], { active: true });
  await expect.poll(() => page.evaluate(() => history.state?.dialog)).toBeGreaterThan(first);
  await expect(help).toBeVisible();
  await page.goBack();
  await expect(help).toBeHidden();
  expect(await page.evaluate(() => history.state)).toBeNull();
});

test("a notice comes and goes at the foot of the map, and a repeat does not stack", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#HIRO/0");
  await settle(page);
  const toasts = page.locator("#toastStack .toast");
  await expect(page.locator("#toastStack")).toHaveAttribute("aria-live", "polite");
  await notice(page, "One.");
  await expect(toasts).toHaveText(["One."]);
  await notice(page, "One.");
  await expect(toasts).toHaveCount(1);
  for (const msg of ["Two.", "Three.", "Four.", "Five."]) await notice(page, msg);
  // three at once, the newest lowest, and the rest counted above them
  await expect(toasts).toHaveText(["Three.", "Two.", "One."]);
  await expect(page.locator("#toastStack .toast-more")).toHaveText("+2 more");
  const tops = await toasts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops[0]).toBeGreaterThan(tops[1]);
  expect(tops[1]).toBeGreaterThan(tops[2]);
  // each leaves in its time, and what waited comes on as it does
  await page.clock.runFor(3000 + 150);
  await expect(toasts.filter({ hasText: "Five." })).toBeVisible();
  await expect(page.locator("#toastStack .toast-more")).toHaveCount(0);
  await page.clock.runFor(3000 + 150);
  await expect(toasts).toHaveCount(0);
});

test("where the system asks for reduced motion a notice neither slides nor drains", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#HIRO/0");
  await settle(page);
  await notice(page, "Still.");
  const toast = page.locator("#toastStack .toast");
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  await expect(page.locator("#toastStack .toast-bar")).toBeHidden();
  for (const s of ["#menuBtn", "#sidebar"])
    expect(await page.locator(s).evaluate((e) => getComputedStyle(e).transitionDuration)).toBe(
      "0s",
    );
});

test("an invisible block's icon shows it at the peak of its pulse", async ({ page }) => {
  await page.goto("/#HILLS/19");
  await settle(page);
  const { median, peak } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }, { SKINNED_LOOK }, { blockIcon }] = await Promise.all(
      [
        "viewer/state.js",
        "viewer/draw/atlas.js",
        "viewer/draw/blocks.js",
        "viewer/draw/icons.js",
      ].map(at),
    );
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
    const cv = blockIcon(state.lvl, 3);
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const alphas = [];
    for (let i = 3; i < px.length; i += 4) if (px[i]) alphas.push(px[i]);
    alphas.sort((a, b) => a - b);
    return { median: alphas[alphas.length >> 1], peak: SKINNED_LOOK[3].alpha * 255 };
  });
  expect(Math.abs(median - peak)).toBeLessThan(8);
});

test("no block's icon is outlined, however faint the block", async ({ page }) => {
  await page.goto("/#HILLS/19");
  await settle(page);
  const { kinds, stroked } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }, { blockIcon }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/atlas.js", "viewer/draw/icons.js"].map(at),
    );
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
    const kinds = [...new Set(state.lvl.records.map((r) => r.kind))];
    const stroke = CanvasRenderingContext2D.prototype.stroke;
    const stroked = [];
    for (const kind of kinds) {
      CanvasRenderingContext2D.prototype.stroke = function (...a) {
        stroked.push(kind);
        return stroke.apply(this, a);
      };
      blockIcon(state.lvl, kind);
    }
    CanvasRenderingContext2D.prototype.stroke = stroke;
    return { kinds, stroked };
  });
  expect(kinds).toEqual(expect.arrayContaining([3, 7]));
  expect(stroked).toEqual([]);
});

test("where the system asks for reduced motion the map opens still, and a choice to move is kept", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await landed(page);
  expect(await drawn(page)).toBe(0);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  expect(await kept()).toBeNull();
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ motion: true });
  expect(await drawn(page)).toBeGreaterThan(8);
  await page.reload();
  await settle(page);
  await expect(page.locator("#showMotion")).toBeChecked();
  await page.keyboard.press("v");
  expect(await kept()).toEqual({});
});
