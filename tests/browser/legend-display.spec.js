import { test, expect } from "@playwright/test";
import { settle, still, textured, written, landed, drawn } from "./helpers.js";

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

test("a level's note folds away and back with a click on the chip, or with its keys", async ({
  page,
}) => {
  await page.goto("/#MARS/12");
  await settle(page);
  const fold = page.getByRole("button", { name: /^LEVEL 133/ });
  const note = page.locator("#chipNote");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toHaveAttribute("aria-controls", "chipNote");
  await expect(note).toContainText("Japanese release");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  await expect(page.locator("#detail")).toBeHidden();
  // folded, the chip is as tall as the menu button, and a row taller for each row its line adds
  const [chip, menu] = await Promise.all(
    ["#chip", "#menuBtn"].map((s) => page.locator(s).boundingBox()),
  );
  const [rows, row] = await page.locator("#chipLine").evaluate((e) => {
    const s = getComputedStyle(e);
    const row = parseFloat(s.lineHeight);
    return [(e.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / row, row];
  });
  expect(chip.height).toBe(menu.height + (rows - 1) * row);
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(note).toBeVisible();
  await page.keyboard.press(" ");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold).toBeFocused();
});

test("a note folded stays folded from level to level and from one visit to the next", async ({
  page,
}) => {
  await page.goto("/#MARS/12");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const title = page.locator("#chip b");
  const fold = page.locator("#chipBtn");
  const note = page.locator("#chipNote");
  await fold.click();
  expect(await kept()).toEqual({ note: false });
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 134");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 135");
  await expect(fold).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  await page.keyboard.press("[");
  await expect(title).toHaveText("LEVEL 134");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/#MARS\/13\//);
  await page.reload();
  await settle(page);
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  // the Display's reset puts back what is under its own heading
  await page.locator("#resetDisplay").click();
  await expect(note).toBeHidden();
  expect(await kept()).toEqual({ note: false });
  await fold.click();
  await expect(note).toBeVisible();
  expect(await kept()).toEqual({});
});

test("a level without a note has nothing on its chip to fold", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  await expect(page.locator("#chip").getByRole("button")).toHaveCount(0);
  await expect(page.locator("#chipDot")).toBeHidden();
  await expect(page.locator("#chipNote")).toBeHidden();
});

test("a switch in the settings puts the compass away, and is remembered", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const compass = page.locator("#compass");
  const box = page.locator("#showCompass");
  await expect(compass).toBeVisible();
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await expect(box).toBeChecked();
  await box.click();
  await expect(compass).toBeHidden();
  await expect(page.locator("#settings label:has(#showCompass) .def")).toHaveText("on by default");
  expect(await kept()).toEqual({ compass: false });
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  // the button beside it moves into the corner the compass held
  const [fit, map] = await Promise.all(
    ["#fitBtn", "#cv"].map((sel) => page.locator(sel).boundingBox()),
  );
  expect(fit.x + fit.width).toBe(map.x + map.width - 12);
  await page.reload();
  await settle(page);
  await expect(compass).toBeHidden();
  // the Display's reset leaves it as it leaves the other settings
  await page.locator("#resetDisplay").click();
  await expect(compass).toBeHidden();
  expect(await kept()).toEqual({ compass: false });
  await page.keyboard.press("s");
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(compass).toBeVisible();
  expect(await kept()).toEqual({});
});

test("arriving somewhere is spoken, and names the map with it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const line = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(line);
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", line);
  await page.keyboard.press("]");
  await expect(page.locator("#say")).toContainText("LEVEL 2");
});

test("a level that holds more than can be scored gives its best out of all it holds", async ({
  page,
}) => {
  await page.goto("/#FIELD/16");
  await settle(page);
  await expect(page.locator("#chipLine")).toContainText("19050 of 23525 points");
  await expect(page.locator("#chipNote")).toHaveText(/^The level holds 4475 more points, /);
  await expect(page.locator("#say")).toContainText(
    "19050 of 23525 points, time 99. The level holds 4475 more points, ",
  );
});

test("the legend lists the objects the chip counts, every kind of block but the plain one, and the settings apart", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("19 blocks");
  await expect(page.locator("#chip")).toContainText("10 objects");
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#kinds ul")].map((list) => ({
      head: document.getElementById(list.getAttribute("aria-labelledby"))?.textContent ?? "",
      rows: [...list.querySelectorAll(".kind")].map((c) => [
        c.children[1].textContent,
        Number(c.querySelector(".n").textContent),
      ]),
    })),
  );
  const sum = (g) => g.rows.reduce((n, [, k]) => n + k, 0);
  expect(groups.map((g) => g.head)).toEqual(["Objects", "Blocks and faces", ""]);
  await expect(page.locator("#kinds ul[role=list]")).toHaveCount(groups.length);
  expect(sum(groups[0])).toBe(10);
  expect(groups[1].rows).toContainEqual(["Ice block", 1]);
  expect(sum(groups[1])).toBe(10);
  expect(groups[2].rows).toEqual([["Level settings", 1]]);
});

test("the legend runs from the most to the fewest, rows with as many by name, then by number", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const rows = (name) =>
    page
      .getByRole("list", { name })
      .locator(".kind")
      .evaluateAll((rows) =>
        rows.map((r) => [r.children[1].textContent, Number(r.querySelector(".n").textContent)]),
      );
  expect(await rows("Objects")).toEqual([
    ["Coin (gold)", 4],
    ["Coin (bronze)", 1],
    ["Exit", 1],
    ["Fruit", 1],
    ["Gem (blue)", 1],
    ["Key", 1],
    ["Start", 1],
  ]);
  expect(await rows("Blocks and faces")).toEqual([
    ["Crumbling block", 6],
    ["Laser", 2],
    ["Ice block", 1],
    ["Moving platform", 1],
  ]);

  // two types that share a name
  await page.goto("/#HIRO/19");
  await expect(page.locator("#chip b")).toHaveText("LESSON");
  const alike = await page
    .getByRole("list", { name: "Objects" })
    .getByRole("button")
    .evaluateAll((rows) =>
      rows.filter((r) => r.children[1].textContent === "Captivator").map((r) => r.dataset.kind),
    );
  expect(alike).toEqual(["t50", "t52"]);
});

test("a legend row of objects shows and hides them, and a row of blocks only counts", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await textured(page);
  const objects = page.getByRole("list", { name: "Objects" });
  const blocks = page.getByRole("list", { name: "Blocks and faces" });
  const rows = await objects.getByRole("listitem").count();
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(rows);
  await expect(blocks.getByRole("listitem")).toHaveCount(4);
  await expect(blocks.getByRole("button")).toHaveCount(0);
  await expect(blocks.locator("[aria-pressed]")).toHaveCount(0);
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  await blocks.getByRole("listitem").first().click();
  expect(await hidden()).toEqual([]);
  const toggles = await page.locator("#kinds").getByRole("button").count();
  await objects
    .getByRole("button")
    .first()
    .click({ modifiers: ["Shift"] });
  expect(await hidden()).toHaveLength(toggles - 1);
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(1);
  await page.locator("#resetKinds").click();
  expect(await hidden()).toEqual([]);
});

test("a type that is paint on a face is listed with the blocks, apart from the kind of its name, and toggles", async ({
  page,
}) => {
  await page.goto("/#HILLSFI/0");
  await settle(page);
  await textured(page);
  const objects = page.getByRole("list", { name: "Objects" });
  const blocks = page.getByRole("list", { name: "Blocks and faces" });
  await expect(objects.getByRole("button", { name: /^Ice/ })).toHaveCount(0);
  const kind = blocks.getByRole("listitem").filter({ hasText: /^Ice block/ });
  await expect(kind).toHaveCount(1);
  await expect(kind.locator(".n")).toHaveText("26");
  await expect(kind.getByRole("button")).toHaveCount(0);
  const ice = blocks.getByRole("button", { name: /^Ice/ });
  await expect(ice).toHaveCount(1);
  await expect(ice.locator(".n")).toHaveText("8");
  await expect(ice).toHaveAttribute("aria-pressed", "true");
  await expect(ice.locator("canvas.icon")).toHaveCount(1);
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  await ice.click();
  expect(await hidden()).toEqual(["t2"]);
  await expect(ice).toHaveAttribute("aria-pressed", "false");
  await ice.click({ modifiers: ["Shift"] });
  const toggles = await page.locator("#kinds").getByRole("button").count();
  expect(await hidden()).toHaveLength(toggles - 1);
  await expect(page.locator("#kinds").getByRole("button", { pressed: true })).toHaveText(/^Ice/);

  // what paints a face and stands on it as well stays an object
  await page.goto("/#HILLS/19");
  await expect(page.locator("#chip b")).toHaveText("OBJ LEVEL");
  await expect(blocks.getByRole("button", { name: /^Clock/ })).toHaveCount(1);
  await expect(objects.getByRole("button", { name: /teleporter/i })).not.toHaveCount(0);
  await expect(objects.getByRole("button", { name: /^Exit/ })).toHaveCount(1);
});

test("hiding a row of paint strips the face back to the stone the block wears without it", async ({
  page,
}) => {
  await page.goto("/#ARCTIC/13/30,60");
  await settle(page);
  await textured(page);
  await still(page);
  const ice = page
    .getByRole("list", { name: "Blocks and faces" })
    .getByRole("button", { name: /^Ice/ });
  /** The colour at the middle of a top face with ice on it and nothing above,
      drawn afresh, with the ice taken off the record first where `bare`. */
  const face = (bare) =>
    page.evaluate(async (bare) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw }] = await Promise.all(["state.js", "render.js"].map(at));
      const [key] = [...state.idx.markers].find(
        ([k, ms]) => ms.some((m) => m.type === 2 && m.face === 0) && !state.idx.cells.has(k - 1),
      );
      const c = state.idx.cells.get(key);
      const r = state.idx.records.get(key)[0];
      const on = r.on;
      if (bare) r.on = on.filter((o) => o.face !== 0);
      draw();
      r.on = on;
      const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
      const cv = document.getElementById("cv");
      const k = cv.width / cv.clientWidth;
      return String(
        cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data,
      );
    }, bare);
  const iced = await face(false);
  const stone = await face(true);
  expect(stone).not.toEqual(iced);
  await ice.click();
  await expect(ice).toHaveAttribute("aria-pressed", "false");
  expect(await face(false)).toEqual(stone);
  await expect(ice.locator("canvas.icon")).toHaveCount(1);
  await page.locator("#resetKinds").click();
  expect(await face(false)).toEqual(iced);
});

test("a legend row keeps the focus when the legend is built anew", async ({ page }) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await textured(page);
  const key = page.getByRole("list", { name: "Objects" }).getByRole("button", { name: "Key" });
  await key.focus();
  await page.keyboard.press("Space");
  await expect(key).toHaveAttribute("aria-pressed", "false");
  await expect(key).toBeFocused();
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ emit }, { state }] = await Promise.all(["dom.js", "state.js"].map(at));
    emit("atlas-loaded", state.lvl.theme);
  });
  await expect(key).toBeFocused();
});

test("a legend row's icon shows the row's pointer, and the map the hand that turns it", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const cursor = (at) => at.evaluate((e) => getComputedStyle(e).cursor);
  const row = page.getByRole("list", { name: "Objects" }).getByRole("button").first();
  expect(await cursor(row)).toBe("pointer");
  expect(await cursor(row.locator(".icon"))).toBe("pointer");
  const map = page.locator("#cv");
  expect(await cursor(map)).toBe("grab");
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await cursor(map)).toBe("grabbing");
  await page.mouse.up();
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

test("the keys list wears each key as a cap and leaves a gesture in words", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const rows = page.locator("#help dt");
  await expect(rows.first()).toHaveText("drag");
  await expect(rows.first().locator("kbd")).toHaveCount(0);
  await expect(rows.filter({ hasText: "wheel" }).locator("kbd")).toHaveText(["+", "−"]);
  await expect(rows.filter({ hasText: "Esc" }).locator("kbd")).toHaveText(["Esc"]);
  await expect(rows.last().locator("kbd")).toHaveText(["?"]);
  // a cap in the list is the hint beside a switch in the settings
  const look = (sel) =>
    page.evaluate((sel) => {
      const s = getComputedStyle(document.querySelector(sel));
      return [s.font, s.color, s.backgroundColor, s.borderBottomWidth, s.borderRadius].join();
    }, sel);
  expect(await look("#help dt kbd")).toBe(await look("#settings kbd"));
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
  await page.evaluate(() => {
    for (const key of ["Escape", "?"])
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => history.state?.dialog)).toBeGreaterThan(first);
  await expect(help).toBeVisible();
  await page.goBack();
  await expect(help).toBeHidden();
  expect(await page.evaluate(() => history.state)).toBeNull();
});

const notice = (page, msg) =>
  page.evaluate(
    async (msg) => (await import(new URL("js/toast.js", location.href).href)).toast(msg),
    msg,
  );

test("a notice comes and goes at the foot of the map, and a repeat does not stack", async ({
  page,
}) => {
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
  await expect(toasts.filter({ hasText: "Five." })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#toastStack .toast-more")).toHaveCount(0);
  await expect(toasts).toHaveCount(0, { timeout: 10000 });
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
      ["state.js", "atlas.js", "blocks.js", "icons.js"].map(at),
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

/** The map's colour where the game's camera stands as the level opens. */
const atEye = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, screen }, { startCamera }] = await Promise.all(
      ["state.js", "overlays.js"].map(at),
    );
    const [x, y] = screen(...startCamera(state.lvl).eye);
    const cv = document.getElementById("cv");
    const k = cv.width / cv.clientWidth;
    return [...cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
  });
const amber = ([r, g, b]) => r > 200 && g > 150 && b < 150;

test("the settings hold the start camera, which keeps its key", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await expect(panel.locator("#showCamera")).toHaveCount(1);
  await expect(page.locator("#display #showCamera")).toHaveCount(0);
  await expect(panel).toBeHidden();
  expect(amber(await atEye(page))).toBe(false);
  await page.keyboard.press("c");
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  await page.locator("#settingsBtn").click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#settings .x")).toBeFocused();
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await panel.getByText("Start camera").click();
  await expect(page.locator("#showCamera")).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  await expect.poll(async () => amber(await atEye(page))).toBe(false);
  await panel.getByText("Start camera").click();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  expect(await kept()).toEqual({ camera: true });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("#settingsBtn")).toBeFocused();
  // the display's reset puts back what is under its heading, and no setting
  await page.keyboard.press("l");
  await page.keyboard.press("x");
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({ camera: true });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
});

test("a setting's key works inside the settings, once a press", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const box = page.locator("#showCamera");
  await page.keyboard.press("s");
  await expect(panel).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.keyboard.press("c");
  await expect(box).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await page.locator("#showCameraSays").click();
  await page.keyboard.press("c");
  await expect(box).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  // a key of the display's stays the map's, and the dialog keeps it from the map
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("a switch clicked leaves the keys to the map, and the slider keeps its own", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await page.locator("#showLabels").click();
  await expect(page.locator("#showLabels")).toBeFocused();
  await page.keyboard.press("b");
  await expect(page.locator("#showOutlines")).toBeChecked();
  const view = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { pan: [state.cam.panX, state.cam.panY], slice: state.slice };
    });
  const before = await view();
  await page.locator("#slice").focus();
  await page.keyboard.press("ArrowLeft");
  const after = await view();
  expect(after.pan).toEqual(before.pan);
  expect(after.slice).toBe(before.slice - 1);
});

test("a switch that does something only under another is greyed while it is off, its tick kept", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  // the clicks below are forced, which does not wait for the sidebar to finish sliding in
  await still(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const greyed = async (ids) => {
    const all = ["showModels", "showThrough", "showLabels", "showFaces", "showHidden"];
    for (const id of all)
      if (ids.includes(id)) await expect(page.locator(`#${id}`), id).toBeDisabled();
      else await expect(page.locator(`#${id}`), id).toBeEnabled();
  };
  // the labels open off and the slice cuts nothing
  await greyed(["showFaces", "showHidden"]);
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  await greyed(["showHidden"]);
  await page.keyboard.press("o");
  await greyed(["showModels", "showThrough", "showLabels", "showFaces", "showHidden"]);
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showFaces")).toBeChecked();
  expect(await kept()).toEqual({ labels: true, faces: true, objects: false });
  // its key and a click leave it as it is and say for a moment what holds it
  // back, by the whole of each name however the label is marked up
  await page.evaluate(() => {
    const label = document.getElementById("showFaces").closest("label");
    const text = [...label.childNodes].find((n) => n.textContent.includes("face"));
    const word = text.splitText(text.textContent.indexOf("face"));
    word.splitText(4);
    const em = document.createElement("em");
    word.replaceWith(em);
    em.append(word);
  });
  const said = page.locator("#toastStack .toast").first();
  await page.keyboard.press("n");
  await expect(said).toHaveText("“Name the face in labels” needs “Objects” on.");
  await page.locator("label", { has: page.locator("#showLabels") }).click({ force: true });
  await expect(said).toHaveText("“Object labels” needs “Objects” on.");
  await page.locator("#showModels").click({ force: true });
  await expect(said).toHaveText("“Objects as models” needs “Objects” on.");
  await expect(page.locator("#showFaces")).toBeChecked();
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showModels")).toBeChecked();
  await expect(page.locator("label", { has: page.locator("#showFaces") })).toHaveAttribute(
    "title",
    "“Name the face in labels” needs “Objects” on.",
  );
  // a reader hears it by its name, greyed, and why
  const faces = page.getByRole("checkbox", { name: "Name the face in labels", exact: false });
  await expect(faces).toBeDisabled();
  await expect(faces).toHaveAccessibleDescription("“Name the face in labels” needs “Objects” on.");
  await page.keyboard.press("o");
  await greyed(["showHidden"]);
  expect(await written(page)).toContain("Key · top");
  // the dim waits on the slice
  await page.keyboard.press("h");
  await expect(said).toHaveText("“Dim what the slice hides” needs the slice lowered.");
  await page.evaluate(async () => {
    const { state, SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await greyed([]);
  await page.keyboard.press("h");
  await expect(page.locator("#showHidden")).toBeChecked();
  await page.keyboard.press("\\");
  await greyed(["showHidden"]);
  await expect(page.locator("#showHidden")).toBeChecked();
});

test("every switch's key is the one its row shows and the key list names", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("label.check")].map((l) => ({
      id: l.querySelector("input").id,
      key: l.querySelector("kbd")?.textContent,
    })),
  );
  expect(rows.map((r) => r.id).sort()).toEqual(
    [
      ...["showSkins", "showObjects", "showModels", "showMotion", "showThrough", "showLabels"],
      ...["showOutlines", "showBase", "panMode", "showFaces", "showHidden", "showCamera"],
      "showCompass",
    ].sort(),
  );
  // the compass alone has no key, every letter that reads as it being taken
  expect(rows.filter((r) => !r.key).map((r) => r.id)).toEqual(["showCompass"]);
  const keyed = rows.filter((r) => r.key);
  const keys = keyed.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  // every switch free to be set: the labels on, and the slice cutting into the level
  await page.keyboard.press("l");
  await page.evaluate(async () => {
    const { state, SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await expect(page.locator("input:disabled")).toHaveCount(0);
  for (const { id, key } of keyed) {
    const box = page.locator(`#${id}`);
    const was = await box.isChecked();
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id}`).toBe(!was);
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id} back`).toBe(was);
  }
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const listed = await page.locator("#help dt kbd").allTextContents();
  for (const key of [...keys, "s"]) expect(listed).toContain(key);
});

test("Display puts the game's own look first, then what the map adds, then the controls", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#display .group")].map((g) =>
      [...g.querySelectorAll("input")].map((i) => `${i.id}${i.checked ? " on" : ""}`),
    ),
  );
  expect(groups).toEqual([
    ["showSkins on", "showObjects on", "showModels on", "showMotion on"],
    ["showThrough", "showLabels", "showFaces", "showOutlines", "showBase"],
    ["panMode", "slice", "showHidden"],
  ]);
});

test("the keys and the settings open in a box of one width, which a phone narrows", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const help = await page.locator("#help .box").boundingBox();
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  const settings = await page.locator("#settings .box").boundingBox();
  expect(settings.width).toBe(help.width);
  expect(help.width).toBe(460);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 700 });
  await page.keyboard.press("?");
  const phone = await page.locator("#help .box").boundingBox();
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  // the keys take no more than half the row, the gestures wrapping before the words do
  const dl = await page.locator("#help dl").boundingBox();
  const dt = await page.locator("#help dt").first().boundingBox();
  expect(dt.width).toBeLessThanOrEqual(dl.width / 2 + 1);
});

test("the display keeps only the switches set away from their defaults", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true });
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ labels: true, motion: false });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ motion: false });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).not.toBeChecked();
});

test("a saved switch the display does not have is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: true, gone: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).toBeChecked();
  const show = await page.evaluate(
    async () => (await import(new URL("js/state.js", location.href).href)).state.show,
  );
  expect(show).not.toHaveProperty("gone");
  await page.keyboard.press("b");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved value not of its switch's kind is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem(
      "kula.display",
      JSON.stringify({ labels: "yes", through: 1, outlines: true, panMode: "yes" }),
    ),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showThrough")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).toBeChecked();
  await expect(page.locator("#panMode")).not.toBeChecked();
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved switch stays saved until it is set again, though it matches the default", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  // a switch saved at its default, which is what a choice made against another
  // default leaves
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await page.keyboard.press("x");
  expect(await kept()).toEqual({ labels: false, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ through: true });
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({});
});
