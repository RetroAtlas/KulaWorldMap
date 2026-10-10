import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const hashChanged = (page) =>
  page.evaluate(() => new Promise((r) => addEventListener("hashchange", r, { once: true })));

// A level not on the disc is installed through the funnel the disc's levels
// take, and a link reaches it through a source a module provides.
test("a link names a level a source provides, and installing it again keeps the view", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const first = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { provideLevels }] = await Promise.all(["state.js", "navigate.js"].map(at));
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    copy.name = "Spiral";
    delete copy.shown;
    window.copy = copy;
    provideLevels((slot) => (slot === "DRAFT/7" ? copy : null));
    const changed = new Promise((r) => addEventListener("hashchange", r, { once: true }));
    location.hash = "#DRAFT/7/45,35/fit/33";
    await changed;
    return {
      li: state.li,
      draft: state.lvl.draft,
      chip: document.getElementById("chipLine").textContent,
      hash: location.hash,
    };
  });
  expect(first).toMatchObject({ li: -1, draft: 7 });
  expect(first.chip).toContain("Spiral");
  expect(first.hash).toMatch(/^#DRAFT\/7\//);

  const second = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, cellKey }, { showLevel, setSlice }, { showCell }, { on }] = await Promise.all(
      ["state.js", "navigate.js", "detail.js", "dom.js"].map(at),
    );
    state.hiddenKinds.add("t37/2");
    setSlice(20);
    showCell(state.idx.cells.get(cellKey(17, 12, 17)));
    const counts = { changed: 0, updated: 0 };
    on("level-changed", () => counts.changed++);
    on("level-updated", () => counts.updated++);
    const again = { ...window.copy, cells: [...window.copy.cells] };
    showLevel(again, { keepView: true, push: false, keep: cellKey(17, 12, 17) });
    const s = state.selected;
    return {
      li: state.li,
      same: state.lvl === again,
      hidden: [...state.hiddenKinds],
      slice: state.slice,
      selected: s && [s.x, s.y, s.z],
      ...counts,
    };
  });
  expect(second).toEqual({
    li: -1,
    same: true,
    hidden: ["t37/2"],
    slice: 20,
    selected: [17, 12, 17],
    changed: 0,
    updated: 1,
  });

  // a link to a level no source holds gives way to the view on screen
  const fell = hashChanged(page);
  await page.evaluate(() => {
    location.hash = "#DRAFT/8/45,35/fit/33";
  });
  await fell;
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/7\//);
  const third = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { li: state.li, draft: state.lvl.draft, hash: location.hash };
  });
  expect(third).toMatchObject({ li: -1, draft: 7 });
  expect(third.hash).toMatch(/^#DRAFT\/7\//);
  expect(errors).toEqual([]);
});

test("an update that keeps the selected cell keeps its face too", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const out = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, cellKey }, { showLevel }, { showCell }] = await Promise.all(
      ["state.js", "navigate.js", "detail.js"].map(at),
    );
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    showLevel(copy);
    const key = cellKey(17, 12, 17);
    showCell({ ...state.idx.cells.get(key), face: 2 });
    showLevel({ ...copy, cells: [...copy.cells] }, { keepView: true, push: false, keep: key });
    const kept = state.selected;
    // a cell kept that is not the selected one takes no face from it
    showLevel(
      { ...copy, cells: [...copy.cells] },
      {
        keepView: true,
        push: false,
        keep: cellKey(17, 13, 17),
      },
    );
    const other = state.selected;
    return {
      kept: kept && [kept.x, kept.y, kept.z, kept.face],
      other: other && [other.x, other.y, other.z, other.face ?? null],
    };
  });
  expect(out).toEqual({ kept: [17, 12, 17, 2], other: [17, 13, 17, null] });
  expect(errors).toEqual([]);
});

test("the keys that step through the levels leave a level from elsewhere alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const out = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showLevel, stepLevel }] = await Promise.all(
      ["state.js", "navigate.js"].map(at),
    );
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    showLevel(copy);
    stepLevel(1);
    stepLevel(-1);
    return { li: state.li, draft: state.lvl.draft };
  });
  expect(out).toEqual({ li: -1, draft: 7 });
  expect(errors).toEqual([]);
});

test("an update refreshes the map's name and the search's scope without announcing it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showLevel }] = await Promise.all(["state.js", "navigate.js"].map(at));
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    copy.name = "Spiral";
    delete copy.shown;
    window.copy = copy;
    showLevel(copy);
  });
  await expect(page.locator("#say")).toHaveText(/^Draft, Spiral, /);
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^Draft, Spiral, /);
  await page.keyboard.press("/");
  await page.locator("#search").fill("block");
  const level = page.locator("#scope button").nth(2);
  await expect(level).toHaveText("Spiral");
  await level.click();
  await page.evaluate(async () => {
    const { showLevel } = await import(new URL("js/navigate.js", location.href).href);
    showLevel({ ...window.copy, name: "Helix" }, { keepView: true, push: false });
  });
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^Draft, Helix, /);
  await expect(level).toHaveText("Helix");
  await expect(level).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#say")).toHaveText(/^Draft, Spiral, /);
  expect(errors).toEqual([]);
});
