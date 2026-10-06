import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame, headings } from "./helpers.js";

test("search answers a number as a whole word, and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level 45");
  await expect(page.locator("#results [role=option]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 45");
  await expect(page.locator("#results [role=option] mark")).toHaveText(["LEVEL", "45"]);
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit0");

  await search.fill("zzzz");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  await expect(page.locator("#results")).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(search).not.toHaveAttribute("aria-activedescendant", /./);

  await search.fill("");
  await expect(page.locator("#found")).toBeEmpty();
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("the box's clear button shows for as long as it holds text, and the keyboard reaches it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  const clear = page.locator("#clear");
  await expect(clear).toBeHidden();
  await box.fill("key");
  await expect(clear).toBeVisible();
  await page.locator("#cv").focus();
  await expect(box).not.toBeFocused();
  await expect(clear).toBeVisible();
  await expect(clear).toHaveAccessibleName("Clear the search");
  const target = await clear.boundingBox();
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
  // Tab reaches it from the box, and Enter empties the box and gives it the focus
  await box.focus();
  await page.keyboard.press("Tab");
  await expect(clear).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#scope")).toBeHidden();
  // a scope chosen goes with the text, as it does under Escape
  await box.fill("key");
  await page.locator("#scope button").nth(2).click();
  await clear.click();
  await box.fill("key");
  await expect(page.locator("#scope button[aria-pressed=true]")).toHaveText("All");
  await box.press("Escape");
  await expect(clear).toBeHidden();
  await expect(box).not.toBeFocused();
});

test("a cell is answered by itself alone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("17,12,17");
  await expect(page.locator("#results [role=group]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]")).toHaveText(
    "17, 12, 17 centre the view here",
  );
  await expect(page.locator("#found")).toBeEmpty();
  await search.fill("40,1,1");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
});

test("the places are eight to a group like the objects, and keep to the scope", async ({
  page,
}) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level");
  const levels = page.locator("#results [role=group][aria-label=Levels]");
  await expect(levels.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await expect(levels.locator(".showmore")).toHaveText(/^show \d+ more$/);
  await search.fill("hiro");
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(1);
  await page.locator("#scope button").nth(2).click();
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(0);
});

test("a search's way back to everywhere is a button the keyboard reaches", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#scope button").nth(2).click();
  const found = page.locator("#found");
  await expect(found).toContainText("in LEVEL 1");
  const widen = found.locator(".widen");
  await expect(widen).toHaveRole("button");
  await widen.focus();
  await page.keyboard.press("Enter");
  await expect(found).not.toContainText("in LEVEL 1");
  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#scope button[aria-pressed=true]")).toHaveText("All");
  await page.locator("#scope button").nth(2).click();
  await expect(page.locator("#scope button").nth(2)).toBeFocused();
  await page.keyboard.press("]");
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
  await expect(page.locator("#scope button").nth(2)).toBeFocused();
  await page.locator("#scope button").nth(0).focus();
  await page.keyboard.press("]");
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 3");
  await expect(page.locator("#scope button").nth(0)).toBeFocused();
  await widen.focus();
  await page.keyboard.press("]");
  await expect(found).toContainText("in LEVEL 4");
  await expect(found.locator(".widen")).toBeFocused();
  await widen.click();
  await expect(page.locator("#search")).toBeFocused();
});

test.describe("under a finger", () => {
  test.use({ hasTouch: true });

  test("widening the search by touch takes the first find, or the scope where there is none, and by mouse the box", async ({
    page,
  }) => {
    await page.goto("/#HIRO/0");
    await settle(page);
    await page.locator("#search").fill("key");
    await page.locator("#scope button").nth(2).click();
    const widen = page.locator("#found .widen");
    await widen.tap();
    await expect(page.locator("#results [role=option]").first()).toBeFocused();
    await page.locator("#scope button").nth(2).click();
    await widen.click();
    await expect(page.locator("#search")).toBeFocused();
    await page.locator("#search").fill("zzzz");
    await page.locator("#scope button").nth(2).click();
    await expect(page.locator("#found")).toContainText("Nothing matches that in LEVEL 1");
    await widen.tap();
    await expect(page.locator("#found")).toHaveText("Nothing matches that.");
    await expect(page.locator("#scope button[aria-pressed=true]")).toBeFocused();
  });
});

test("what a search found is said as well as shown", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const found = page.locator("#found");
  await expect(found).toHaveRole("status");
  await page.locator("#search").fill("zzzz");
  await expect(found).toHaveText("Nothing matches that.");
  await page.locator("#search").fill("key");
  await expect(found).toHaveText(/^\d+ objects$/);
});

test("a search held to the level in hand follows the level as it changes", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#scope button").nth(2).click();
  const found = page.locator("#found");
  const group = page.locator("#results [role=group]").first();
  await expect(found).toContainText("in LEVEL 1");
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect(found).toContainText("in LEVEL 2");
  await expect(group).toHaveAttribute("aria-label", /LEVEL 2$/);
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
});

test("by level, a search lists the levels that hold the thing, most first, and a row opens one", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  await box.fill("key");
  const bylevel = page.locator("#scope button").nth(3);
  await expect(bylevel).toHaveText("By level");
  await bylevel.click();
  await expect(bylevel).toHaveAttribute("aria-pressed", "true");
  const groups = page.locator("#results [role=group]");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("aria-label", "By level");
  const found = page.locator("#found");
  await expect(found).toHaveText(/^\d+ objects in \d+ levels · search everywhere$/);
  const rows = page.locator("#results [role=option]:not(.showmore)");
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveText(/^LEVEL \d+ \d+ objects [A-Z]+$/);
  const counts = await rows.evaluateAll((els) =>
    els.map((e) => Number(/(\d+) objects?/.exec(e.textContent)[1])),
  );
  expect(counts[0]).toBeGreaterThan(1);
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  const keys = () =>
    page.locator("#results [role=option]").evaluateAll((els) => els.map((e) => e.dataset.key));
  const before = await keys();
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  expect(await keys()).toEqual(before);
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
  await box.focus();
  await box.press("ArrowDown");
  await box.press("ArrowDown");
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  const title = await rows.nth(1).locator(".loc").textContent();
  await box.press("Enter");
  await expect(page.locator("#chip b")).toHaveText(title);
  expect(
    await page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return state.selected;
    }),
  ).toBeNull();
  await expect(page.locator("#detail")).toBeHidden();
  expect(await keys()).toEqual(before);
  await box.fill("inca");
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(1);
  await expect(found).toHaveText("no objects, blocks or settings in any level · search everywhere");
  await box.fill("settings");
  await expect(found).toHaveText(/^the settings in \d+ levels · search everywhere$/);
  await box.fill("zzzz");
  await expect(found).toHaveText("Nothing matches that in any level. · search everywhere");
});

test("a search counts objects, blocks by their kind, and settings apart", async ({ page }) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const search = page.locator("#search");
  const more = page.locator("#found");
  await search.fill("key, crumbling, settings");
  await expect(more).toHaveText(
    /^\d+ objects, \d+ crumbling blocks and the settings of \d+ levels$/,
  );
  await page.locator("#scope button").nth(2).click();
  await expect(more).toContainText("1 object, 6 crumbling blocks and the level's settings in");
  await search.fill("level 94");
  await expect(more).toContainText("no objects, blocks or settings in");
});

test("a block of a kind of its own is found as often as the legend counts it, and a row goes to it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  for (const [hash, title, name, kind, alone] of [
    ["#INCA/7", "LEVEL 38", "Fire block", 1, "fire"],
    ["#ARCTIC/1", "LEVEL 47", "Ice block", 2, "ice"],
  ]) {
    await page.goto(`/${hash}`);
    await settle(page);
    await expect(page.locator("#chip")).toContainText(title);
    const search = page.locator("#search");
    const found = page.locator("#found");
    const noun = name.toLowerCase();
    await search.fill(noun);
    await expect(page.locator("#results [role=group]").first()).toHaveAttribute(
      "aria-label",
      new RegExp(` · ${title}$`),
    );
    await expect(found).toHaveText(new RegExp(`^\\d+ ${noun}s$`));
    await page.locator("#scope button").nth(2).click();
    const legend = page.locator("#kinds li", { hasText: name }).locator(".n");
    const n = Number(await legend.textContent());
    expect(n).toBeGreaterThan(1);
    await expect(found).toHaveText(new RegExp(`^${n} ${noun}s in ${title} · `));
    const rows = page.locator("#results [role=option]");
    await expect(rows).toHaveCount(n);
    await search.fill(alone);
    await expect(found).toContainText(`${n} ${noun}s in ${title}`);
    await search.fill(`kind=${kind}`);
    await expect(found).toHaveText(new RegExp(`^${n} ${noun}s in ${title} · `));

    // Enter goes to the first and selects it, as a click on the block would
    await expect(rows.first()).toContainText(new RegExp(`${name} \\d+,\\d+,\\d+ · kind=${kind}$`));
    const [, x, y, z] = /(\d+),(\d+),(\d+)/.exec(await rows.first().textContent());
    await search.press("Enter");
    const selected = await page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { x, y, z } = state.selected;
      return [x, y, z];
    });
    expect(selected).toEqual([x, y, z].map(Number));
    expect((await headings(page))[0]).toBe(name);
    await expect(page.locator("#say")).toHaveText(`${name}, ${x},${y},${z}, ${title}`);
    await search.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("an object search lists every one round the level in hand, and a row goes there", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  const groups = page.locator("#results [role=group]");
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(groups.nth(1)).toHaveAttribute("aria-label", "HIRO");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("LEVEL 12");
  await expect(rows.first()).toContainText(/top · \d+,\d+,\d+$/);
  await expect(page.locator("#found")).toHaveText(/^\d+ objects$/);
  // eight to a group, the rest a row away that the keys reach too
  const hiro = groups.nth(1);
  await expect(hiro.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await search.focus();
  for (let i = 0; i < 9; i++) await search.press("ArrowDown");
  await expect(hiro.locator(".showmore")).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(hiro.locator(".showmore")).toHaveCount(0);
  expect(await hiro.locator("[role=option]").count()).toBeGreaterThan(8);
  await expect(hiro.locator("[role=option]").nth(8)).toHaveAttribute("aria-selected", "true");
  await expect(search).toBeFocused();

  // a row in another level goes there and leaves the list as it was
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
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(search).not.toBeFocused();

  // the scope bar narrows the list to the level in hand
  await page.locator("#scope button").nth(2).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#found")).toContainText(`1 object in ${at.name}`);
  await page.locator("#found .widen").click();
  expect(await rows.count()).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("down and Enter walk the finds in order, wherever the view has gone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  const walked = [];
  for (let i = 0; i < 3; i++) {
    // choosing gives the keys back to the map, and / takes them again
    if (i) await page.keyboard.press("/");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    walked.push(
      await page.evaluate(async () => {
        const { state } = await import(new URL("js/state.js", location.href).href);
        return state.lvl.name;
      }),
    );
  }
  expect(walked).toEqual(["LEVEL 1", "LEVEL 2", "LEVEL 3"]);
});

test("a field is searched as name=value, and a match outside the row is appended to it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("starts=off");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("starts=off");
  await expect(rows.first().locator("mark")).toHaveText("starts=off");
  await search.fill("f9=500");
  await expect(rows.first()).toContainText("f9=500");
  await search.fill("f9=50");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  // the keys walk the rows and Enter chooses
  await search.fill("coin");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit1");
  const before = await page.evaluate(() => location.hash);
  await search.press("Enter");
  await frame(page);
  expect(await page.evaluate(() => location.hash)).not.toBe(before);
});

test("a coloured thing is named thing first, and found by colour and thing in either order", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const search = page.locator("#search");
  const rows = page.locator("#results [role=option]:not(.showmore)");
  // the name is what sits between the row's level and its face and cell
  const named = () =>
    rows.evaluateAll((all) =>
      all.map((r) =>
        [...r.childNodes]
          .filter((n) => !n.className)
          .map((n) => n.textContent)
          .join("")
          .trim(),
      ),
    );
  await search.fill("blue gem");
  await expect(rows.first()).toContainText("LEVEL 94");
  const byColour = await named();
  expect(byColour.length).toBeGreaterThan(1);
  expect(new Set(byColour)).toEqual(new Set(["Gem (blue)"]));
  await expect(rows.first().locator("mark")).toHaveText(["Gem", "blue"]);
  await search.fill("gem blue");
  await expect(rows.first()).toContainText("LEVEL 94");
  expect(await named()).toEqual(byColour);
  await expect(rows.first().locator("mark")).toHaveText(["Gem", "blue"]);
});

test("a find above the slice's ceiling lifts the ceiling to it", async ({ page }) => {
  await page.goto("/#HIRO/11/45,35/1/17,17,17/0,0/14");
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

test("a search held to the world keeps its order as the level moves within the world", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  await box.fill("key");
  await page.locator("#scope button").nth(1).click();
  const keys = () =>
    page.locator("#results [role=option]").evaluateAll((els) => els.map((e) => e.dataset.key));
  const before = await keys();
  const away = before.findIndex((k) => !k.startsWith("0:"));
  expect(away).toBeGreaterThan(0);
  for (let i = 0; i <= away; i++) await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page.locator("#chip b")).not.toHaveText("LEVEL 1");
  expect(await keys()).toEqual(before);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { selectLevel }] = await Promise.all(["state.js", "navigate.js"].map(at));
    selectLevel(state.data.levels.findIndex((l) => l.theme === "INCA"));
  });
  await expect(page.locator("#scope button").nth(1)).toHaveText("INCA");
  expect((await keys())[0]).not.toEqual(before[0]);
});
