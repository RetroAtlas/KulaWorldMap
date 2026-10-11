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

test("a dialog opened for a control gives the focus back to that control", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const out = await page.evaluate(async () => {
    const { openDialog, closeDialog } = await import(new URL("js/dialog.js", location.href).href);
    const settings = document.getElementById("settings");
    // the focus is elsewhere, as it is in an engine that does not focus a clicked button
    document.getElementById("cv").focus();
    openDialog(settings, document.getElementById("aboutBtn"));
    const inside = settings.contains(document.activeElement);
    closeDialog();
    const named = document.activeElement.id;
    document.getElementById("menuBtn").focus();
    openDialog(settings);
    closeDialog();
    return { inside, named, held: document.activeElement.id };
  });
  expect(out).toEqual({ inside: true, named: "aboutBtn", held: "menuBtn" });
  expect(errors).toEqual([]);
});

test("Settings and the About name their buttons, and the keys name none", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const focused = () => page.evaluate(() => document.activeElement.id);
  // the click reaches the button without focusing it, as in an engine that does not focus a clicked button
  const opened = async (button, dialog) => {
    await page.evaluate(() => document.getElementById("cv").focus());
    await page.locator(button).dispatchEvent("click");
    await expect(page.locator(dialog)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(dialog)).toBeHidden();
    return focused();
  };
  expect(await opened("#settingsBtn", "#settings")).toBe("settingsBtn");
  expect(await opened("#aboutBtn", "#help")).toBe("aboutBtn");
  const keyed = async (key, dialog) => {
    await page.evaluate(() => document.getElementById("menuBtn").focus());
    await page.keyboard.press(key);
    await expect(page.locator(dialog)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(dialog)).toBeHidden();
    return focused();
  };
  expect(await keyed("s", "#settings")).toBe("menuBtn");
  expect(await keyed("?", "#help")).toBe("menuBtn");
  expect(errors).toEqual([]);
});

test("the same level installed again keeps its clock and its presses, and another starts afresh", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const out = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showLevel, selectLevel }, { draw, clock }, { motionTable, flip }] =
      await Promise.all(["state.js", "navigate.js", "render.js", "data.js"].map(at));
    while (!motionTable()) await new Promise(requestAnimationFrame);
    state.show.motion = true;
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    showLevel(copy);
    await new Promise((r) => setTimeout(r, 400));
    draw();
    const before = clock();
    flip(0, before);
    const pressed = [...state.presses];
    showLevel({ ...copy, cells: [...copy.cells] }, { keepView: true, push: false });
    const after = clock();
    const kept = [...state.presses];
    selectLevel(1);
    return { before, after, pressed, kept, fresh: clock() };
  });
  expect(out.before).toBeGreaterThan(0);
  expect(out.after).toBeGreaterThanOrEqual(out.before);
  expect(out.kept).toEqual(out.pressed);
  expect(out.fresh).toBeLessThan(out.before);
  expect(errors).toEqual([]);
});

test("the same level installed again keeps what travels while its records are unchanged", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  const out = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showLevel, selectLevel }, { draw }, { motionTable }] = await Promise.all(
      ["state.js", "navigate.js", "render.js", "data.js"].map(at),
    );
    while (!motionTable()) await new Promise(requestAnimationFrame);
    state.show.motion = true;
    // what travels is laid out anew only where the dice are read again
    const table = motionTable();
    const dice = table.dice;
    let rolled = 0;
    Object.defineProperty(table, "dice", {
      get() {
        rolled++;
        return dice;
      },
    });
    const copy = { ...state.data.levels[0], pack: "/DRAFT/DRAFT.PAK", index: 7, draft: 7 };
    showLevel(copy);
    draw();
    const laid = rolled;
    showLevel({ ...copy, cells: [...copy.cells] }, { keepView: true, push: false });
    draw();
    const sameCells = rolled;
    showLevel(
      { ...copy, records: copy.records.map((r) => ({ ...r, on: r.on.map((o) => ({ ...o })) })) },
      { keepView: true, push: false },
    );
    draw();
    const sameRecords = rolled;
    showLevel({ ...copy, cells: [...copy.cells, 2, 2, 2, 0] }, { keepView: true, push: false });
    draw();
    const otherCells = rolled;
    // a word of a record, with everything the level draws as it was
    const bump = (o, k) => (k ? o : { ...o, f: o.f.map((v, j) => (j === 7 ? v + 1 : v)) });
    const records = copy.records.map((r, i) => (i ? r : { ...r, on: r.on.map(bump) }));
    showLevel({ ...copy, records }, { keepView: true, push: false });
    draw();
    const otherRecords = rolled;
    selectLevel(1);
    draw();
    return { laid, sameCells, sameRecords, otherCells, otherRecords, another: rolled };
  });
  expect(out).toEqual({
    laid: 1,
    sameCells: 1,
    sameRecords: 1,
    otherCells: 1,
    otherRecords: 2,
    another: 3,
  });
  expect(errors).toEqual([]);
});
