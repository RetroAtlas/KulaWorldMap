import { expect, test } from "@playwright/test";
import { settle, steps, textured, topPixels, trackErrors } from "./helpers.js";
import { EDIT, docOf, shown, stored, written } from "./drafthelpers.js";

/** Put `object` on `face` of the shown draft's first block, or take it off, through the model. */
const faced = (page, face, object) =>
  page.evaluate(
    async ([face, object]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setFace }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, setFace(get(id).doc, [17, 17, 17], face, object));
    },
    [face, object],
  );

/** Put `block` into the shown draft at `cell`, or take the block there out with null, through the
    model. */
const laid = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock, removeBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, block ? setBlock(get(id).doc, cell, block) : removeBlock(get(id).doc, cell));
    },
    [cell, block],
  );

/** Mark the shown draft a Simon room, or unmark it, through the model. */
const roomed = (page, simon) =>
  page.evaluate(async (simon) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setMeta }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setMeta(get(id).doc, { simon }));
  }, simon);

/** How the level on screen is drawn: its blocks, its things, its room mark and whether it wears
    the bonus artwork. */
const drawnAs = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { objectCount, skinsTable }, { lookOf }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js", "viewer/skins.js"].map(at),
    );
    const l = state.lvl;
    const world = state.data.themes.findIndex((t) => t.id === l.theme);
    return {
      placed: l.placed,
      objects: objectCount(l),
      simon: l.simon,
      bonus: lookOf(skinsTable(), l, world).bonus,
    };
  });

// what stands where on the level on screen, as the game stores it
const standing = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return state.lvl.records
      .flatMap((r) => r.on.map((o) => [r.x, r.y, r.z, o.face, o.type].join()))
      .sort();
  });

test("Your levels folds under its heading: closed at first, open once a level of your own is shown, and kept as left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const fold = page.locator("#yoursFold");
  const isOpen = () => fold.evaluate((d) => d.open);
  // the fold's state reaches the store on the toggle event, a moment after the click
  const kept = (value) =>
    expect.poll(() => page.evaluate(() => localStorage.getItem("kula.yours"))).toBe(value);
  await page.goto(EDIT);
  await expect(fold.locator("summary h2")).toHaveText("Your levels");
  await expect(page.locator("#draftNew")).toBeHidden();
  expect(await isOpen()).toBe(false);
  await settle(page);
  await expect(page.locator("#draftNew")).toBeVisible();
  await fold.locator("summary").click();
  await expect(page.locator("#draftNew")).toBeHidden();
  await kept("closed");
  await page.reload();
  await expect(fold.locator("summary h2")).toHaveText("Your levels");
  expect(await isOpen()).toBe(false);
  // a level of your own coming on screen opens the fold, and shows how many the browser holds
  await expect(page.locator("#chipLine b")).toHaveText("LEVEL 1");
  await page.keyboard.press("w");
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect(await isOpen()).toBe(true);
  await expect(page.locator("#yoursCount")).toHaveText("1");
  // closed while editing, it stays closed through the edits
  await fold.locator("summary").click();
  await expect(page.locator("#draftRows button")).toBeHidden();
  await kept("closed");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [1, 1, 32], { kind: 0 }));
  });
  await expect(page.locator("#chipLine")).toContainText("21 blocks");
  expect(await isOpen()).toBe(false);
  await page.reload();
  await expect(page.locator("#yoursCount")).toHaveText("1");
  expect(await isOpen()).toBe(false);
  await fold.locator("summary").click();
  await kept("open");
  await page.reload();
  await expect(page.locator("#yoursCount")).toHaveText("1");
  expect(await isOpen()).toBe(true);
  expect(errors).toEqual([]);
});

test("new makes a draft, shown and kept in this browser, which a reload brings back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await expect(page.locator("#yours")).toBeVisible();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  await expect(page.locator("#draftCard")).toBeHidden();

  await page.locator("#draftNew").click();
  const row = page.locator("#draftRows button");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(row.locator(".name")).toHaveText("Untitled level");
  await expect(row.locator(".tag")).toHaveText("Draft");
  await expect(row.locator(".state")).toHaveText("not saved to a file");
  await expect(page.locator("#draftEmpty")).toBeHidden();
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  await expect(page.locator("#say")).toContainText("Made a new level. Draft, Untitled level,");
  const first = await shown(page);
  expect(first).toMatchObject({ li: -1, theme: "HIRO" });
  const id = first.draft;
  expect(first.hash.startsWith(`#DRAFT/${id}/`)).toBe(true);
  await expect(page.locator("#draftCard")).toBeVisible();
  await expect(page.locator("#draftTitle")).toHaveValue("Untitled level");
  await expect(page.locator("#draftWorld")).toHaveValue("HIRO");
  await expect(page.locator("#draftTime")).toHaveValue("99");

  await written(page, (s) => s?.version).toBe(1);
  const store = await stored(page);
  expect(store.drafts[id]).toMatchObject({ saved: null, edits: 0 });
  expect(store.drafts[id].doc).toMatchObject({
    format: "kula-world-level",
    title: "Untitled level",
    world: "HIRO",
  });

  await page.reload();
  await settle(page);
  const again = await shown(page);
  expect(again).toMatchObject({ li: -1, draft: id });
  expect(again.hash.startsWith(`#DRAFT/${id}/`)).toBe(true);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  expect(errors).toEqual([]);
});

test("copy this level makes a draft out of the level on screen, and of a draft a copy", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const shipped = await standing(page);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const copy = await shown(page);
  expect(copy.li).toBe(-1);
  expect(copy.chip).toContain("LEVEL 1");
  expect(await standing(page)).toEqual(shipped);
  const doc = await docOf(page, copy.draft);
  expect(doc).toMatchObject({ title: "LEVEL 1", world: "HIRO", from: "/HIRO/HIRO.PAK#0" });
  await expect(page.locator("#draftRows button .name")).toHaveText("LEVEL 1");
  await expect(page.locator("#say")).toContainText("Copied LEVEL 1. Draft, LEVEL 1");

  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const second = await shown(page);
  expect(second.li).toBe(-1);
  expect(second.draft).not.toBe(copy.draft);
  expect(await standing(page)).toEqual(shipped);
  expect(await docOf(page, second.draft)).toEqual(doc);
  await expect(page.locator("#draftRows button[aria-current='true']")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the Level card edits the draft as the game would load it, keeping the view", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    window.__compass = 0;
    CanvasRenderingContext2D.prototype.clearRect = function (...a) {
      if (this.canvas.id === "compass") window.__compass++;
      return clear.apply(this, a);
    };
  });
  await page.goto("/#HILLSFI/0/45,35/fit/33");
  await settle(page);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await textured(page);
  const id = (await shown(page)).draft;

  const title = page.locator("#draftTitle");
  await title.fill("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await expect(page.locator("#draftRows button .name")).toHaveText("Spiral");
  await expect(title).toBeFocused();
  await title.pressSequentially(" II");
  await expect(title).toHaveValue("Spiral II");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral II");

  const icons = () =>
    page.evaluate(async () => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { levelMarkers, blockMarkers }, { markerIcon }] = await Promise.all(
        ["viewer/state.js", "viewer/data.js", "viewer/draw/icons.js"].map(at),
      );
      const all = [...levelMarkers(state.lvl), ...blockMarkers(state.lvl)];
      const pixels = (cv) =>
        cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.join();
      const out = {};
      for (const row of document.querySelectorAll("#kinds button.kind")) {
        const cv = row.querySelector("canvas.icon");
        const m = all.find((m) => m.id === row.dataset.kind);
        if (!cv || !m) continue;
        out[row.dataset.kind] = { shown: pixels(cv), fresh: pixels(markerIcon(m, state.lvl)) };
      }
      return out;
    });
  const before = await icons();
  expect(Object.keys(before).length).toBeGreaterThan(0);

  const view = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { setSlice }, { showCell }, { on }] = await Promise.all(
      [
        "viewer/state.js",
        "viewer/chrome/navigate.js",
        "viewer/chrome/detail.js",
        "viewer/ui/dom.js",
      ].map(at),
    );
    const c = state.idx.cells.get([...state.idx.cells.keys()][0]);
    state.hiddenKinds.add("t37/2");
    setSlice(20);
    showCell(c);
    window.counts = { changed: 0, updated: 0 };
    on("level-changed", () => window.counts.changed++);
    on("level-updated", () => window.counts.updated++);
    return { cell: [c.x, c.y, c.z], compass: window.__compass };
  });
  await page.selectOption("#draftWorld", "INCA");
  const after = await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const s = state.selected;
    return {
      theme: state.lvl.theme,
      slice: state.slice,
      selected: s && [s.x, s.y, s.z],
      hidden: [...state.hiddenKinds],
      ...window.counts,
    };
  });
  expect(after).toEqual({
    theme: "INCA",
    slice: 20,
    selected: view.cell,
    hidden: ["t37/2"],
    changed: 0,
    updated: 1,
  });
  expect(await page.evaluate(() => window.__compass)).toBeGreaterThan(view.compass);
  await textured(page);
  const later = await icons();
  expect(Object.keys(later)).toEqual(Object.keys(before));
  for (const [key, { shown, fresh }] of Object.entries(later)) expect(shown, key).toBe(fresh);
  expect(Object.keys(later).some((k) => later[k].shown !== before[k].shown)).toBe(true);

  await page.locator("#draftTime").fill("45");
  await page.locator("#draftHidden").check();
  const afar = page.locator("#draftAfar");
  await expect(page.locator("#draftCard label.check", { has: afar })).toHaveText(
    "Invisible blocks show from afar",
  );
  await afar.check();
  expect((await shown(page)).time).toBe(45);
  await expect(page.locator("#chipLine")).toContainText("time 45");
  await expect(page.locator("#draftRows button .state")).toHaveText(
    /^not saved to a file · \d+ changes$/,
  );
  await written(page, (s) => s?.drafts[id]?.doc).toMatchObject({
    title: "Spiral II",
    world: "INCA",
    time: 45,
    hidden: true,
    invisibleFromAfar: true,
  });
  expect((await stored(page)).drafts[id].edits).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test("new asks for editing once its level is open, and copy this level does not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ on }, { state }] = await Promise.all(["viewer/ui/dom.js", "viewer/state.js"].map(at));
    window.__wanted = [];
    on("edit-wanted", () => window.__wanted.push(state.lvl.draft));
  });
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  expect(await page.evaluate(() => window.__wanted)).toEqual([]);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(3);
  const made = (await shown(page)).draft;
  expect(await page.evaluate(() => window.__wanted)).toEqual([made]);
  expect(errors).toEqual([]);
});

test("a level of your own marked a Simon room is drawn with its world's artwork, where one with no key wears the bonus artwork and one with a key its world's artwork", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await textured(page);
  // a plain block well away from the start, whose ball stands on the first block
  const probed = [21, 17, 17];
  await laid(page, probed, { kind: 0 });
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 1, simon: false, bonus: true });
  const bonus = await topPixels(page, probed);
  expect(bonus.length).toBeGreaterThan(100);
  await faced(page, 1, { type: 31 });
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 2, simon: false, bonus: false });
  const arcade = await topPixels(page, probed);
  expect(arcade).not.toEqual(bonus);
  await faced(page, 1, null);
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 1, simon: false, bonus: true });
  expect(await topPixels(page, probed)).toEqual(bonus);
  // marked a room, the keyless level wears its world's artwork, as a level with a key does
  await roomed(page, true);
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 1, simon: true, bonus: false });
  expect(await topPixels(page, probed)).toEqual(arcade);
  await expect(page.locator("#draftPlays")).toHaveText("Plays as a Simon room.");
  // a key on the room makes an arcade level of it, drawn the same
  await faced(page, 1, { type: 31 });
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 2, simon: true, bonus: false });
  expect(await topPixels(page, probed)).toEqual(arcade);
  await expect(page.locator("#draftPlays")).toHaveText("Plays as an arcade level.");
  await faced(page, 1, null);
  await roomed(page, false);
  await expect
    .poll(() => drawnAs(page))
    .toEqual({ placed: 2, objects: 1, simon: false, bonus: true });
  expect(await topPixels(page, probed)).toEqual(bonus);
  expect(errors).toEqual([]);
});

test("the Level card lets a level with no key play as a bonus level or a Simon room, shows a level with a key as an arcade level, says how it plays, and counts the checks' errors", async ({
  page,
}) => {
  const NO_KEY = "How the game plays the level while it has no key";
  const HAS_KEY =
    "A level with a key plays as an arcade level. Take every key away to choose how it plays.";
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  const mode = page.locator("#draftMode");
  const options = mode.locator("option");
  const plays = page.locator("#draftPlays");
  const errorLine = page.locator("#draftErrors");
  await expect(mode).toHaveAccessibleName("Plays as");
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveValue("bonus");
  await expect(options).toHaveText(["Bonus level", "Simon room"]);
  await expect(mode).toHaveAttribute("title", NO_KEY);
  await expect(mode).toHaveAccessibleDescription(NO_KEY);
  await expect(plays).toHaveText("Plays as a bonus level since it has no key.");
  await expect(errorLine).toBeHidden();
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
    await page.keyboard.press("w");
  const before = await steps(page);

  // choosing Simon room marks the level as one step, said by nothing but the sentence
  await mode.selectOption("simon");
  expect((await docOf(page, id)).simon).toBe(true);
  await expect(plays).toHaveText("Plays as a Simon room.");
  await expect(page.locator("#say")).toBeEmpty();
  expect(await steps(page)).toEqual({ past: before.past + 1, future: 0 });
  await page.locator("#cv").focus();
  await page.locator("#undoBtn").click();
  expect((await docOf(page, id)).simon).toBe(false);
  await expect(mode).toHaveValue("bonus");
  await expect(plays).toHaveText("Plays as a bonus level since it has no key.");
  expect(await steps(page)).toEqual({ past: before.past, future: 1 });
  await page.locator("#redoBtn").click();
  expect((await docOf(page, id)).simon).toBe(true);
  await expect(mode).toHaveValue("simon");
  await expect(plays).toHaveText("Plays as a Simon room.");

  // a key makes an arcade level of it, and the choice closes, its tip saying why
  await faced(page, 1, { type: 31 });
  await expect(mode).toBeDisabled();
  await expect(mode).toHaveValue("arcade");
  await expect(options).toHaveText(["Arcade level"]);
  await expect(mode).toHaveAttribute("title", HAS_KEY);
  await expect(mode).toHaveAccessibleDescription(HAS_KEY);
  await expect(plays).toHaveText("Plays as an arcade level.");
  // the choice opens again when the last key goes, the mark kept through the key
  await faced(page, 1, null);
  await expect(mode).toBeEnabled();
  await expect(mode).toHaveValue("simon");
  await expect(options).toHaveText(["Bonus level", "Simon room"]);
  await expect(mode).toHaveAttribute("title", NO_KEY);
  await expect(plays).toHaveText("Plays as a Simon room.");
  await mode.selectOption("bonus");
  expect((await docOf(page, id)).simon).toBe(false);
  await expect(plays).toHaveText("Plays as a bonus level since it has no key.");
  // the choice is a stop in the card's order after Time while it is open, and none once greyed
  await page.locator("#draftTime").focus();
  await page.keyboard.press("Tab");
  await expect(mode).toBeFocused();
  await faced(page, 1, { type: 31 });
  await expect(mode).toBeDisabled();
  await page.locator("#draftTime").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#draftHidden")).toBeFocused();
  await page.locator("#draftHidden").check();
  await expect(plays).toHaveText(
    "Plays as a hidden level, with the glass ball on half-seen blocks.",
  );

  await faced(page, 0, null);
  await expect(errorLine).toBeVisible();
  await expect(errorLine).toHaveText("1 error, listed under the level line");
  await expect(errorLine.locator("a, button")).toHaveCount(0);
  await faced(page, 0, { type: 30, facing: 3 });
  await expect(errorLine).toBeHidden();
  expect(errors).toEqual([]);
});

test("the Level card counts the checks' errors without the game's face table", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/objects.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const errorLine = page.locator("#draftErrors");
  await expect(errorLine).toBeHidden();
  await faced(page, 0, null);
  await expect(errorLine).toHaveText("1 error, listed under the level line");
  await faced(page, 0, { type: 30, facing: 3 });
  await expect(errorLine).toBeHidden();
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("the Level card's Circuits rows set a colour's starting state as one step, which the panel's own row shows and undo takes back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  const rows = page.locator("#draftCard .circuit");
  const toggle = (colour) => page.locator(`#draftCircuit${colour}`);
  const members = rows.locator(".members");
  // the lamps are for the eye alone
  for (let colour = 0; colour < 4; colour++)
    await expect(rows.nth(colour).locator(".lamp")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#draftCard .circuits")).toHaveAccessibleName("Circuits");
  await expect(rows).toHaveCount(4);
  // a reader hears four switches apart by colour, the state in whether each is pressed
  for (const [i, name] of ["yellow", "blue", "green", "red"].entries()) {
    await expect(rows.nth(i)).toHaveAccessibleName("Circuit");
    await expect(toggle(i)).toHaveAccessibleName(`${name} circuit`);
    await expect(toggle(i)).toHaveText("starts on");
  }
  await expect(members).toHaveText(Array(4).fill("nothing of this colour"));
  await expect(toggle(2)).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(2)).toHaveAttribute("title", "Turn the green circuit off");

  await faced(page, 1, { type: 9, variant: 2 });
  await expect(members.nth(2)).toHaveText("1 switch");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [17, 19, 17], { kind: 8, far: [21, 19, 17], colour: 2 }));
  });
  await expect(members.nth(2)).toHaveText("1 switch, 1 laser");
  await expect(members.nth(0)).toHaveText("nothing of this colour");
  // a switch under a platform's face stands on nothing, so neither the card nor the panel counts it
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    const platform = { kind: 5, far: [20, 25, 17], length: 2, speed: 30 };
    update(
      id,
      setBlock(get(id).doc, [20, 21, 17], { ...platform, faces: { 0: { type: 9, variant: 2 } } }),
    );
  });
  await expect(members.nth(2)).toHaveText("1 switch, 1 laser");

  // the panel's own row, on the face that holds the switch, says the same
  await expect(page.locator("#tools")).toBeVisible();
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
    await page.keyboard.press("w");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showCell }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
    );
    showCell({ ...state.idx.cells.get(cellKey(17, 17, 17)), face: 1 });
  });
  const panelRow = page.locator('#detail [data-field="circuit-2"]');
  await expect(panelRow).toHaveText("starts on");
  await expect(page.locator("#detail .circuit .members")).toHaveText("1 switch, 1 laser");
  const before = await steps(page);

  await toggle(2).click();
  expect((await docOf(page, id)).circuits).toEqual({ 2: "off" });
  await expect(toggle(2)).toHaveText("starts off");
  await expect(page.locator("#say")).toBeEmpty();
  await expect(toggle(2)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(2)).toHaveAccessibleName("green circuit");
  await expect(toggle(2)).toHaveAttribute("title", "Turn the green circuit on");
  await expect(toggle(2)).toBeFocused();
  await expect(toggle(0)).toHaveText("starts on");
  await expect(panelRow).toHaveText("starts off");
  expect(await steps(page)).toEqual({ past: before.past + 1, future: 0 });

  await page.locator("#undoBtn").click();
  expect((await docOf(page, id)).circuits).toEqual({});
  await expect(toggle(2)).toHaveText("starts on");
  await expect(panelRow).toHaveText("starts on");
  expect(await steps(page)).toEqual({ past: before.past, future: 1 });

  await panelRow.click();
  await expect(toggle(2)).toHaveText("starts off");
  await expect(members.nth(2)).toHaveText("1 switch, 1 laser");
  // the panel's row speaks and the card's row does not, so the card's press takes the sentence down
  await expect(page.locator("#say")).toHaveText("Turned the green circuit off");
  await toggle(2).click();
  await expect(toggle(2)).toHaveText("starts on");
  await expect(panelRow).toHaveText("starts on");
  await expect(page.locator("#say")).toBeEmpty();
  // a field of the card takes the sentence down as its toggles do
  await panelRow.click();
  await expect(page.locator("#say")).toHaveText("Turned the green circuit off");
  await page.locator("#draftTime").fill("45");
  await page.locator("#draftTime").blur();
  await expect(page.locator("#chipLine")).toContainText("time 45");
  await expect(page.locator("#say")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("the card's time field takes the seconds the file can hold and says when it keeps the old value, and the title stops at eighty letters", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.clock.install();
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const time = page.locator("#draftTime");
  await expect(time).toHaveAttribute("min", "1");
  await expect(time).toHaveAttribute("max", "32767");
  for (const bad of ["0", "", "32768", "-5", "0.5", "32767.4"]) {
    await time.fill(bad);
    await time.blur();
    await expect(time).toHaveValue("99");
    await expect(page.locator("#toastStack .toast")).toHaveText([
      "The time is from 1 to 32767 seconds.",
    ]);
  }
  expect((await shown(page)).time).toBe(99);
  // a fraction of a second lands as the nearest whole second, with nothing to say, and the
  // field shows what landed at once, whether Enter or a blur committed it
  await time.fill("2.5");
  await time.press("Enter");
  await expect(time).toHaveValue("3");
  expect((await shown(page)).time).toBe(3);
  await time.fill("4.5");
  await time.blur();
  await expect(time).toHaveValue("5");
  expect((await shown(page)).time).toBe(5);
  await time.fill("1.4");
  await time.blur();
  await expect(time).toHaveValue("1");
  expect((await shown(page)).time).toBe(1);
  await time.fill("99.4");
  await time.blur();
  await expect(time).toHaveValue("99");
  expect((await shown(page)).time).toBe(99);
  await page.clock.runFor(3000 + 150);
  await expect(page.locator("#toastStack .toast")).toHaveCount(0);
  await time.fill("200");
  await time.blur();
  await expect(time).toHaveValue("200");
  expect((await shown(page)).time).toBe(200);
  await expect(page.locator("#chipLine")).toContainText("time 200");

  const title = page.locator("#draftTitle");
  await expect(title).toHaveAttribute("maxlength", "80");
  await title.selectText();
  await title.pressSequentially("x".repeat(85));
  await expect(title).toHaveValue("x".repeat(80));
  await expect(page.locator("#draftRows button .name")).toHaveText("x".repeat(80));
  expect(errors).toEqual([]);
});

test("delete asks twice, and deleting the shown draft returns to the disc's level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("]");
  expect((await shown(page)).li).toBe(1);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect((await shown(page)).li).toBe(-1);
  const del = page.locator("#draftCard button", { hasText: /^delete/ });
  await del.click();
  await expect(del).toHaveText("delete?");
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect((await shown(page)).li).toBe(-1);
  await del.click();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  await expect(page.locator("#draftCard")).toBeHidden();
  const back = await shown(page);
  expect(back.li).toBe(1);
  expect(back.chip).toContain("LEVEL 2");
  expect(back.hash).toMatch(/^#HIRO\/1\//);
  await expect(page.locator("#chipLine .tag")).toHaveCount(0);
  await expect(page.locator("#say")).toContainText("Deleted Untitled level. LEVEL 2");
  await written(page, (s) => s?.drafts).toEqual({});
  expect(errors).toEqual([]);
});

test("duplicate opens a copy of the shown draft, saying so and which level is then on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const first = (await shown(page)).draft;
  await page.locator("#draftTitle").fill("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await page.locator("#draftCard button", { hasText: "duplicate" }).click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const copy = await shown(page);
  expect(copy.li).toBe(-1);
  expect(copy.draft).not.toBe(first);
  expect(copy.chip).toContain("Spiral");
  expect(copy.hash).toMatch(new RegExp(`^#DRAFT/${copy.draft}/`));
  expect(await docOf(page, copy.draft)).toMatchObject({ title: "Spiral" });
  await expect(page.locator("#say")).toContainText("Copied the level. Draft, Spiral,");
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(2);
  expect(errors).toEqual([]);
});
