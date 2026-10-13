import { test, expect } from "@playwright/test";
import { settle, textured, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const KEY = "kula.drafts";
const SETTLE = 300;
const FULL = "This browser cannot hold more drafts; save them to files and delete some.";
const NO_ROOM =
  "This browser gives the map no room to keep levels, so they will live only until the page is closed.";
const ELSEWHERE =
  "That link names a level kept in another browser. Open it there, or ask for the level file.";
const NUMBERED_OUT =
  "This browser has run out of numbers for its levels, so no more can be made here.";
/** A store holding one draft, as another tab or an earlier visit would have left it. */
const KEPT = {
  version: 1,
  next: 2,
  drafts: {
    1: {
      doc: {
        format: "kula-world-level",
        version: 1,
        title: "Kept",
        world: "INCA",
        time: 60,
        blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
      },
      updated: 1,
      saved: null,
      edits: 0,
    },
  },
};

const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
/** What `pick` reads off the store once the write that waits has landed. */
const written = (page, pick = (s) => s) => expect.poll(async () => pick(await stored(page)));
const flush = (page) =>
  page.evaluate(async () => (await import(new URL("js/drafts.js", location.href).href)).flush());
/** Another tab's copy of the store, written and announced as the browser would. */
const arrives = (page, copy) =>
  page.evaluate(
    ([key, copy]) => {
      const text = JSON.stringify(copy);
      localStorage.setItem(key, text);
      dispatchEvent(
        new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
      );
    },
    [KEY, copy],
  );
/** A browser that refuses the store's writes, with the error named, until `window.__room` is set. */
const refusing = (page, name = "QuotaExceededError") =>
  page.addInitScript(
    ([key, name]) => {
      const set = Storage.prototype.setItem;
      window.__room = false;
      Storage.prototype.setItem = function (k, v) {
        if (k === key && !window.__room) throw new DOMException("refused", name);
        return set.call(this, k, v);
      };
    },
    [KEY, name],
  );
const room = (page, yes) => page.evaluate((yes) => void (window.__room = yes), yes);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return {
      li: state.li,
      draft: state.lvl.draft,
      theme: state.lvl.theme,
      time: state.lvl.time,
      hash: location.hash,
      chip: document.getElementById("chipLine").textContent,
    };
  });
const docOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/drafts.js", location.href).href);
    return get(id)?.doc ?? null;
  }, id);
/** Put `object` on `face` of the shown draft's first block, or take it off, through the model. */
const faced = (page, face, object) =>
  page.evaluate(
    async ([face, object]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setFace }] = await Promise.all(
        ["state.js", "drafts.js", "project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, setFace(get(id).doc, [17, 17, 17], face, object));
    },
    [face, object],
  );
// what stands where on the level on screen, as the game stores it
const standing = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.lvl.records
      .flatMap((r) => r.on.map((o) => [r.x, r.y, r.z, o.face, o.type].join()))
      .sort();
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
        ["state.js", "data.js", "icons.js"].map(at),
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
      ["state.js", "navigate.js", "detail.js", "dom.js"].map(at),
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
    const { state } = await import(new URL("js/state.js", location.href).href);
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
  await page.locator("#draftAfar").check();
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
    const [{ on }, { state }] = await Promise.all(["dom.js", "state.js"].map(at));
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

test("the Level card marks a level with no key as a bonus level, says how it plays, and counts the checks' errors", async ({
  page,
}) => {
  const NO_KEY =
    "The level has no key, so the game plays it as a bonus level. Place a key to make it an arcade level.";
  const HAS_KEY =
    "This level has a key, so the game plays it as an arcade level. Take every key away to make it a bonus level.";
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const bonus = page.locator("#draftBonus");
  const bonusLabel = page.locator("#draftCard label.check", { hasText: "Bonus level" });
  const plays = page.locator("#draftPlays");
  const errorLine = page.locator("#draftErrors");
  await expect(bonus).toBeChecked();
  await expect(bonus).toBeDisabled();
  await expect(bonusLabel).toHaveAttribute("title", NO_KEY);
  await expect(bonus).toHaveAccessibleDescription(NO_KEY);
  await expect(plays).toHaveText(/^Plays as a bonus level: /);
  await expect(errorLine).toBeHidden();
  // the runner's own check holds a label for a disabled control to be disabled; a pointer does not
  await bonusLabel.click({ force: true });
  await expect(page.locator("#toastStack .toast")).toHaveText([NO_KEY]);
  await expect(bonus).toBeChecked();
  // the greyed row says why when pressed, and takes no focus
  await expect(bonusLabel).toHaveCSS("opacity", "0.4");
  expect(await bonusLabel.getAttribute("tabindex")).toBeNull();

  await faced(page, 1, { type: 31 });
  await expect(bonus).not.toBeChecked();
  await expect(bonus).toBeDisabled();
  await expect(bonusLabel).toHaveAttribute("title", HAS_KEY);
  await expect(bonus).toHaveAccessibleDescription(HAS_KEY);
  await expect(plays).toHaveText("Plays as an arcade level.");
  // the greyed box is no stop in the card's order, which runs from Time on to Hidden level
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
      ["state.js", "drafts.js", "project.js"].map(at),
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
      ["state.js", "drafts.js", "project.js"].map(at),
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
    const [{ state, cellKey }, { showCell }] = await Promise.all(["state.js", "detail.js"].map(at));
    showCell({ ...state.idx.cells.get(cellKey(17, 17, 17)), face: 1 });
  });
  const panelRow = page.locator('#detail [data-field="circuit-2"]');
  await expect(panelRow).toHaveText("starts on");
  await expect(page.locator("#detail .circuit .members")).toHaveText("1 switch, 1 laser");
  const steps = () =>
    page.evaluate(async () => {
      const [{ state }, { steps }] = await Promise.all(
        ["state.js", "trail.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
      );
      return steps(state.lvl.draft);
    });
  const before = await steps();

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
  expect(await steps()).toEqual({ past: before.past + 1, future: 0 });

  await page.locator("#undoBtn").click();
  expect((await docOf(page, id)).circuits).toEqual({});
  await expect(toggle(2)).toHaveText("starts on");
  await expect(panelRow).toHaveText("starts on");
  expect(await steps()).toEqual({ past: before.past, future: 1 });

  await panelRow.click();
  await expect(toggle(2)).toHaveText("starts off");
  await expect(members.nth(2)).toHaveText("1 switch, 1 laser");
  // the panel's row speaks and the card's does not, so the card's press takes the sentence down
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
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const time = page.locator("#draftTime");
  await expect(time).toHaveAttribute("min", "1");
  await expect(time).toHaveAttribute("max", "32767");
  for (const bad of ["0", "", "32768", "-5"]) {
    await time.fill(bad);
    await time.blur();
    await expect(time).toHaveValue("99");
    await expect(page.locator("#toastStack .toast")).toHaveText([
      "The time is a whole number of seconds from 1 to 32767.",
    ]);
  }
  expect((await shown(page)).time).toBe(99);
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

test("a draft in the store that cannot be read is kept as it is, with one toast, and the rest stay", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const good = {
    format: "kula-world-level",
    version: 1,
    title: "Good",
    world: "MARS",
    time: 50,
    blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
  };
  const unread = {
    2: { doc: { format: "something-else", blocks: [] }, updated: 2 },
    3: null,
    4: { doc: { ...good, world: "NOWHERE" }, updated: 3 },
  };
  await page.addInitScript(
    ([key, good, unread]) => {
      const store = {
        version: 1,
        next: 5,
        drafts: { 1: { doc: good, updated: 1, saved: null, edits: 2 }, ...unread },
      };
      // the script also runs on the blank page between the two loads, which has no storage
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* ignore */
      }
    },
    [KEY, good, unread],
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  const out = await shown(page);
  expect(out).toMatchObject({ li: -1, draft: 1, theme: "MARS", time: 50 });
  expect(out.chip).toContain("Good");
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button .state")).toHaveText(
    "not saved to a file · 2 changes",
  );
  expect((await toasts(page)).filter((t) => t.includes("could not be read"))).toEqual([
    "3 drafts in this browser could not be read and are kept as they are.",
  ]);
  const row = page.locator("#draftUnread");
  await expect(row.locator(".state")).toHaveText("3 drafts in this browser could not be read");
  // a change here writes the store with those entries as they were
  await page.locator("#draftTitle").fill("Good II");
  await written(page, (s) => s?.drafts[1]?.doc.title).toBe("Good II");
  const after = await stored(page);
  expect(after.next).toBe(5);
  expect([after.drafts[2], after.drafts[3], after.drafts[4]]).toEqual([
    unread[2],
    unread[3],
    unread[4],
  ]);

  // a link to one that was left out gives way to the first level, and the session is told once
  await page.goto("about:blank");
  await page.goto("/#DRAFT/2/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "false");
  await expect(row).toHaveCount(1);
  expect(await toasts(page)).toEqual([]);

  // the row's remove asks to be pressed again, then lets them go, the readable draft kept
  const remove = row.locator("button");
  await expect(remove).toHaveText("remove");
  await remove.click();
  await expect(remove).toHaveText("remove?");
  await expect(remove).toHaveClass(/warn/);
  await expect(remove).toHaveAttribute(
    "title",
    "Press again to remove what could not be read from this browser",
  );
  await remove.click();
  await expect(row).toHaveCount(0);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Good"]);
  await expect(page.locator("#say")).toHaveText("Removed 3 drafts that could not be read.");
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual(["1"]);
  expect((await stored(page)).next).toBe(5);
  expect(errors).toEqual([]);
});

test("entries that cannot be read do not load the editor by themselves, and a key the language reserves is kept like any other", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const text = '{"version":1,"next":1,"drafts":{"__proto__":{"doc":1},"9":null}}';
  await page.addInitScript(
    ([key, text]) => {
      try {
        localStorage.setItem(key, text);
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, text],
  );
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator("#draftEmpty")).toBeVisible();

  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect(fetched()).toContain("/js/editor.js");
  expect((await shown(page)).draft).toBe(10);
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "2 drafts in this browser could not be read and are kept as they are.",
  ]);
  await expect(page.locator("#draftUnread .state")).toHaveText(
    "2 drafts in this browser could not be read",
  );
  await expect(page.locator("#draftEmpty")).toBeHidden();
  // read inside the page, since a key named __proto__ does not survive the trip out of it
  const keys = () =>
    page.evaluate((key) => {
      const drafts = JSON.parse(localStorage.getItem(key) ?? "{}").drafts ?? {};
      return Object.keys(drafts)
        .sort()
        .map((k) => `${k}=${JSON.stringify(drafts[k])}`);
    }, KEY);
  await expect.poll(keys).toHaveLength(3);
  expect((await keys()).slice(1)).toEqual(["9=null", '__proto__={"doc":1}']);
  expect(errors).toEqual([]);
});

test("an entry of a draft's shape loads the editor at the start under a key that is an id, whatever its document holds, and under any other key not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const kept = KEPT.drafts[1];
  const unreadable = { ...kept, doc: { ...kept.doc, world: "NOWHERE" } };
  await page.addInitScript(
    ([key, store]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page between the loads has no storage */
      }
    },
    [KEY, { version: 1, next: 2, drafts: { "01": kept } }],
  );
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator("#draftEmpty")).toBeVisible();

  await page.evaluate(
    ([key, store]) => localStorage.setItem(key, JSON.stringify(store)),
    [KEY, { version: 1, next: 2, drafts: { 1: unreadable } }],
  );
  requested.length = 0;
  await page.goto("about:blank");
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toContain("/js/editor.js");
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftUnread .state")).toHaveText(
    "1 draft in this browser could not be read",
  );
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "1 draft in this browser could not be read and is kept as it is.",
  ]);
  expect(errors).toEqual([]);
});

test("a change waits a moment before it is written, the moment's changes landing as one write, and none waits past the page being hidden or left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    window.__writes = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__writes++;
      return set.call(this, k, v);
    };
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(1);
  const writes = () => page.evaluate(() => window.__writes);
  expect(await writes()).toBe(1);
  // a run of changes in one breath, then the store as it stands before the moment has passed
  const retitle = (titles, then) =>
    page.evaluate(
      async ([key, titles, then]) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { get, update }] = await Promise.all(["state.js", "drafts.js"].map(at));
        const id = state.lvl.draft;
        for (const title of titles) update(id, { ...get(id).doc, title });
        if (then === "hidden") {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
        } else if (then === "left")
          dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
        return JSON.parse(localStorage.getItem(key)).drafts[id].doc.title;
      },
      [KEY, titles, then],
    );
  expect(await retitle(["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"])).toBe("Untitled level");
  await written(page, (s) => Object.values(s?.drafts ?? {})[0]?.doc.title).toBe("Step 5");
  expect(await writes()).toBe(2);
  expect(await retitle(["Hidden"], "hidden")).toBe("Hidden");
  expect(await writes()).toBe(3);
  expect(await retitle(["Left"], "left")).toBe("Left");
  expect(await writes()).toBe(4);
  // a timer set after the flush and as long as the settle fires after any the flush left behind
  expect(
    await page.evaluate(
      (ms) => new Promise((r) => setTimeout(() => r(window.__writes), ms)),
      SETTLE,
    ),
  ).toBe(4);
  expect(errors).toEqual([]);
});

test("a browser whose storage cannot be read keeps the levels in memory alone, and says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    window.__writes = 0;
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) {
      if (k === key) throw new DOMException("denied", "SecurityError");
      return get.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__writes++;
      return set.call(this, k, v);
    };
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  expect(await toasts(page)).toEqual([]);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "This browser cannot keep your levels, so they will live only until the page is closed.",
  ]);
  expect((await shown(page)).li).toBe(-1);
  await page.locator("#draftTitle").fill("Fleeting");
  await expect(page.locator("#draftRows button .name")).toHaveText(["Fleeting"]);
  await flush(page);
  expect(await page.evaluate(() => window.__writes)).toBe(0);
  await page.reload();
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a browser with no room at all keeps the draft on screen and says so once", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, k, v);
    };
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([NO_ROOM]);
  expect((await shown(page)).li).toBe(-1);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect(await stored(page)).toBeNull();

  await expect(page.locator("#toastStack .toast")).toHaveCount(0, { timeout: 6000 });
  await page.locator("#draftTitle").fill("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await flush(page);
  expect(await toasts(page)).toEqual([]);
  expect(await stored(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("a browser with levels kept and no room for more says so, and keeps what it holds", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key) throw new DOMException("full", "QuotaExceededError");
        return set.call(this, k, v);
      };
    },
    [KEY, KEPT],
  );
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button .name")).toHaveText(["Untitled level", "Kept"]);
  await expect(page.locator("#toastStack .toast")).toHaveText([FULL]);
  expect(Object.keys((await stored(page)).drafts)).toEqual(["1"]);
  expect(errors).toEqual([]);
});

test("a browser that refuses a write for a reason other than room says so plainly, and writes once it can", async ({
  page,
}) => {
  const REFUSED =
    "This browser could not keep your levels just now. Save them to files to be safe.";
  const errors = trackErrors(page);
  await refusing(page, "SecurityError");
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([REFUSED]);
  expect(await stored(page)).toBeNull();
  await room(page, true);
  await page.locator("#draftTitle").fill("Spiral");
  await written(page, (s) => Object.values(s?.drafts ?? {})[0]?.doc.title).toBe("Spiral");
  expect(await toasts(page)).toEqual([REFUSED]);
  expect(errors).toEqual([]);
});

test("a store that has handed out every number it has makes no more levels, and says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const spent = { ...KEPT, next: Number.MAX_SAFE_INTEGER + 1 };
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, spent],
  );
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect((await shown(page)).li).toBe(0);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect((await stored(page)).next).toBe(Number.MAX_SAFE_INTEGER + 1);
  expect(errors).toEqual([]);
});

test("w on a disc level over a spent store makes no copy and leaves editing off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, next: 2 ** 53, drafts: {} }));
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("w");
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).not.toHaveClass(/editing/);
  expect(errors).toEqual([]);
});

test("new on a store that has handed out every number it has leaves editing off where a draft is on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const spent = { ...KEPT, next: Number.MAX_SAFE_INTEGER + 1 };
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, spent],
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).draft).toBe(1);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#draftNew").click();
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).not.toHaveClass(/editing/);
  expect((await shown(page)).draft).toBe(1);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect(errors).toEqual([]);
});

test("a store a newer version wrote is read for what this one knows and written back under its version", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const newer = { ...KEPT, version: 7, drafts: { ...KEPT.drafts, 3: { later: true } }, next: 4 };
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, newer],
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).draft).toBe(1);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  await expect(page.locator("#draftUnread .state")).toHaveText(
    "1 draft in this browser could not be read",
  );
  await page.locator("#draftTitle").fill("Kept II");
  await written(page, (s) => s?.drafts[1]?.doc.title).toBe("Kept II");
  const out = await stored(page);
  expect([out.version, out.next, out.drafts[3]]).toEqual([7, 4, { later: true }]);
  expect(errors).toEqual([]);
});

test("a draft deleted here is not taken back from another tab's copy, and one changed here is kept, until the write", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const gone = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(2);
  const copy = await stored(page);
  const kept = Number(Object.keys(copy.drafts).find((id) => Number(id) !== gone));
  // the other tab's copy lacks the draft kept here and still holds the one deleted here
  const theirs = structuredClone(copy);
  delete theirs.drafts[kept];
  // in one breath: a change here, a deletion here, and the other tab's copy arriving
  const out = await page.evaluate(
    async ([key, theirs, kept, gone]) => {
      const { get, update, remove } = await import(new URL("js/drafts.js", location.href).href);
      update(kept, { ...get(kept).doc, title: "Kept here" });
      remove(gone);
      const text = JSON.stringify(theirs);
      dispatchEvent(
        new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
      );
      return { kept: get(kept)?.doc.title ?? null, gone: get(gone) !== null };
    },
    [KEY, theirs, kept, gone],
  );
  expect(out).toEqual({ kept: "Kept here", gone: false });
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept here"]);
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(kept)]);
  expect((await stored(page)).drafts[kept].doc.title).toBe("Kept here");
  expect(errors).toEqual([]);
});

test("another tab clearing the store takes every draft not changed here, and the disc's level comes back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("]");
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect((await shown(page)).li).toBe(-1);
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(1);
  await page.evaluate(() => {
    localStorage.clear();
    dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
  });
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  const back = await shown(page);
  expect(back.li).toBe(1);
  expect(back.chip).toContain("LEVEL 2");
  expect(errors).toEqual([]);
});

test("another tab's copy of the store reloads the list, the draft changed later winning", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(id)]);
  const send = (copy) =>
    page.evaluate(
      ([key, copy]) => {
        const text = JSON.stringify(copy);
        localStorage.setItem(key, text);
        dispatchEvent(
          new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
        );
      },
      [KEY, copy],
    );
  const copy = await stored(page);
  const mine = copy.drafts[id];
  mine.doc.title = "From another tab";
  mine.updated += 1000;
  copy.drafts[copy.next] = {
    doc: { ...mine.doc, title: "Theirs", world: "HELL" },
    updated: mine.updated - 5,
    saved: null,
    edits: 0,
  };
  copy.next += 1;
  await send(copy);
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  await expect(page.locator("#draftRows button .name")).toHaveText(["From another tab", "Theirs"]);
  await expect(page.locator("#chipLine b")).toHaveText("From another tab");
  await expect(page.locator("#draftTitle")).toHaveValue("From another tab");
  expect((await shown(page)).draft).toBe(id);

  // an older copy changes nothing here
  const stale = structuredClone(copy);
  stale.drafts[id].doc.title = "Stale";
  stale.drafts[id].updated -= 5000;
  await send(stale);
  await expect(page.locator("#chipLine b")).toHaveText("From another tab");
  await expect(page.locator("#draftRows button .name")).toHaveText(["From another tab", "Theirs"]);
  expect(errors).toEqual([]);
});

test("a page back from the cache or thawed, and every write, takes in what another tab stored while it could not hear", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(id)]);
  const quietly = (copy) =>
    page.evaluate(([key, copy]) => localStorage.setItem(key, JSON.stringify(copy)), [KEY, copy]);
  const another = (title, updated) => ({
    doc: { ...KEPT.drafts[1].doc, title },
    updated,
    saved: null,
    edits: 0,
  });
  const names = page.locator("#draftRows button .name");

  const copy = await stored(page);
  copy.drafts[id].doc.title = "Renamed away";
  copy.drafts[id].updated += 1;
  copy.drafts[id + 1] = another("Theirs", 1);
  copy.next = id + 2;
  await quietly(copy);
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(page.locator("#chipLine b")).toHaveText("Renamed away");
  await expect(names).toHaveText(["Renamed away", "Theirs"]);

  copy.drafts[id + 2] = another("Third", 2);
  copy.next = id + 3;
  await quietly(copy);
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(names).toHaveText(["Renamed away", "Third", "Theirs"]);

  copy.drafts[id + 1] = another("Theirs II", 3);
  await quietly(copy);
  await page.locator("#draftTitle").fill("Mine now");
  await written(page, (s) => s?.drafts[id]?.doc.title).toBe("Mine now");
  const out = await stored(page);
  expect(Object.keys(out.drafts).sort()).toEqual([id, id + 1, id + 2].map(String));
  expect(out.drafts[id + 1].doc.title).toBe("Theirs II");
  expect(out.next).toBe(id + 3);
  await expect(names).toHaveText(["Mine now", "Theirs II", "Third"]);
  expect(errors).toEqual([]);
});

const EDITOR_FILES =
  /\/js\/(editor|drafts|draftlist|palette|trail|project|kwl|vendor\/pako_deflate\.min)\.js$/;

test("a plain visit shows the section and fetches none of the editor, which Make a level then loads", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await expect(page.locator("#yours")).toBeVisible();
  await expect(page.locator("#draftEmpty")).toBeVisible();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#makeBtn")).toBeVisible();
  // the picker offers every kind of file the reader takes
  await expect(page.locator("#draftFile")).toHaveAttribute(
    "accept",
    ".json,.kwl,.pak,.bin,.img,.iso",
  );
  expect(requested).toContain("/js/main.js");
  expect(fetched()).toEqual([]);

  await page.locator("#makeBtn").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  const out = await shown(page);
  expect(out.li).toBe(-1);
  expect(out.chip).toContain("LEVEL 1");
  expect(fetched()).toContain("/js/editor.js");
  expect(fetched()).toContain("/js/project.js");
  expect(errors).toEqual([]);
});

test("a link to a draft this browser holds loads the editor before the level shows, and a held draft loads it at the start", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page between the loads has no storage */
    }
  }, KEY);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  const linked = await shown(page);
  expect(linked).toMatchObject({ li: -1, draft: 1, theme: "INCA", time: 60 });
  expect(linked.chip).toContain("Kept");
  expect(requested).toContain("/js/editor.js");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "true");

  requested.length = 0;
  await page.goto("about:blank");
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button .name")).toHaveText("Kept");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "false");
  await expect(page.locator("#draftEmpty")).toBeHidden();
  expect(requested).toContain("/js/editor.js");
  expect(errors).toEqual([]);
});

test("a link to a draft arriving after a plain visit loads the editor where this browser holds it, and says where it is otherwise", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const go = (hash) =>
    page.evaluate((hash) => {
      location.hash = hash;
    }, hash);
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  await go("#DRAFT/5/45,35/fit/33");
  await expect(page.locator("#toastStack .toast")).toHaveText([ELSEWHERE]);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#HIRO\/0\//);
  expect((await shown(page)).li).toBe(0);
  expect(fetched()).toEqual([]);
  // another tab's level, kept while this page was up, so no storage event announced it
  await page.evaluate(
    ([key, store]) => localStorage.setItem(key, JSON.stringify(store)),
    [KEY, KEPT],
  );
  await go("#DRAFT/1/45,35/fit/33");
  await expect(page.locator("#chipLine b")).toHaveText("Kept");
  expect(await shown(page)).toMatchObject({ li: -1, draft: 1, theme: "INCA", time: 60 });
  expect(fetched()).toContain("/js/editor.js");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/1\//);
  await go("#DRAFT/7/45,35/fit/33");
  await expect(page.locator("#toastStack .toast", { hasText: ELSEWHERE })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/1\//);
  expect((await shown(page)).draft).toBe(1);
  expect(errors).toEqual([]);
});

test("a link to a draft this browser does not hold fetches none of the editor at the start, and says where the level is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/#DRAFT/5/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([ELSEWHERE]);
  expect(requested.filter((p) => EDITOR_FILES.test(p))).toEqual([]);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#HIRO\/0\//);
  await expect(page.locator("#yours")).toBeVisible();
  await expect(page.locator("#draftEmpty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("two presses of w before the editor has loaded end with editing on", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/js/editor.js", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("w");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  expect((await shown(page)).li).toBe(-1);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("a visitor whose editor cannot be loaded still gets the map, and is told", async ({
  page,
}) => {
  const UNLOADED = "The editor could not be loaded; reload the page to try again.";
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page has no storage */
    }
  }, KEY);
  await page.route("**/js/editor.js", (route) => route.abort());
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([UNLOADED]);
  await page.keyboard.press("]");
  expect((await shown(page)).li).toBe(1);
  await expect(page.locator("#chipLine b")).toHaveText("LEVEL 2");
  // the editor's controls still ask for it, and say so again
  await expect(page.locator("#toastStack .toast")).toHaveCount(0, { timeout: 6000 });
  await page.locator("#makeBtn").click();
  await expect(page.locator("#toastStack .toast")).toHaveText([UNLOADED]);
  expect((await shown(page)).li).toBe(1);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("an editor whose boot throws leaves the map and its controls, which say so and do not try it again", async ({
  page,
}) => {
  const UNLOADED = "The editor could not be loaded; reload the page to try again.";
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page has no storage */
    }
  }, KEY);
  await page.route("**/js/editor.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: [
        "export function bootEditor() {",
        "  window.__boots = (window.__boots ?? 0) + 1;",
        "  throw new Error('boot');",
        "}",
        "export function toggleEditing() { window.__toggled = true; }",
      ].join("\n"),
    }),
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([UNLOADED]);
  expect(await page.evaluate(() => window.__boots)).toBe(1);
  // each control says so again, once the last toast has gone, and none runs the boot again or does what it does
  for (const control of [
    () => page.locator("#makeBtn").click(),
    () => page.keyboard.press("w"),
    () => page.locator("#draftNew").click(),
  ]) {
    await expect(page.locator("#toastStack .toast")).toHaveCount(0, { timeout: 6000 });
    await control();
    await expect(page.locator("#toastStack .toast")).toHaveText([UNLOADED]);
  }
  expect(await page.evaluate(() => window.__boots)).toBe(1);
  expect(await page.evaluate(() => window.__toggled ?? false)).toBe(false);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a draft and a disc level that share a number are two levels, so showing one after the other is a change", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("]");
  expect((await shown(page)).li).toBe(1);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { on }] = await Promise.all(["state.js", "dom.js"].map(at));
    state.hiddenKinds.add("t31");
    window.counts = { changed: 0, updated: 0 };
    on("level-changed", () => window.counts.changed++);
    on("level-updated", () => window.counts.updated++);
  });
  // the first draft is number 1, as LEVEL 2 is among the disc's levels
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const made = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { draft: state.lvl.draft, hidden: [...state.hiddenKinds], ...window.counts };
  });
  expect(made).toEqual({ draft: 1, hidden: [], changed: 1, updated: 0 });
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^Draft, Untitled level/);
  await expect(page.locator("#worlds .levels button[aria-current='true']")).toHaveCount(0);
  await page.locator("#worlds .levels button[data-i='1']").click();
  expect(await page.evaluate(() => window.counts)).toEqual({ changed: 2, updated: 0 });
  await expect(page.locator("#worlds .levels button[data-i='1']")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^LEVEL 2/);
  expect(errors).toEqual([]);
});

test("a write the browser refused is tried again at a flush, and when another tab writes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const id = (await shown(page)).draft;
  expect(await stored(page)).toBeNull();
  // room made: the flush that leaves the page writes what waited
  await room(page, true);
  await flush(page);
  expect((await stored(page)).drafts[id].doc.title).toBe("Untitled level");
  // refused again, a change waits; the other tab's write is the moment to try once more
  await room(page, false);
  await page.locator("#draftTitle").fill("Spiral");
  await flush(page);
  expect((await stored(page)).drafts[id].doc.title).toBe("Untitled level");
  await room(page, true);
  await arrives(page, await stored(page));
  await written(page, (s) => s?.drafts[id]?.doc.title).toBe("Spiral");
  expect(errors).toEqual([]);
});

test("a draft whose id another tab handed out before this tab's write landed moves to a new id", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const mine = (await shown(page)).draft;
  await page.locator("#draftTitle").fill("Mine");
  await expect(page.locator("#chipLine b")).toHaveText("Mine");
  // the other tab, with room, makes a level of its own under the same id
  const theirs = {
    version: 1,
    next: mine + 1,
    drafts: {
      [mine]: {
        doc: {
          format: "kula-world-level",
          version: 1,
          title: "Theirs",
          world: "HELL",
          time: 99,
          blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
        },
        updated: Date.now() + 1000,
        saved: null,
        edits: 0,
      },
    },
  };
  await room(page, true);
  await arrives(page, theirs);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Theirs", "Mine"]);
  // the screen follows this tab's draft to its new id
  expect((await shown(page)).draft).toBe(mine + 1);
  await expect(page.locator("#chipLine b")).toHaveText("Mine");
  await expect(page.locator("#draftRows button").nth(1)).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toMatch(new RegExp(`^#DRAFT/${mine + 1}/`));
  expect(await docOf(page, mine)).toMatchObject({ title: "Theirs" });
  expect(await docOf(page, mine + 1)).toMatchObject({ title: "Mine" });
  const trails = await page.evaluate(
    async ([a, b]) => {
      const { steps } = await import(new URL("js/trail.js", location.href).href);
      return [steps(a).past, steps(b).past];
    },
    [mine, mine + 1],
  );
  expect(trails).toEqual([0, 1]);
  expect(await toasts(page)).toContain(
    "Another tab's level took the place of Mine, which stays in the list under a new link.",
  );
  await written(page, (s) => s && [s.next, Object.keys(s.drafts)]).toEqual([
    mine + 2,
    [String(mine), String(mine + 1)],
  ]);
  expect((await stored(page)).drafts[mine + 1].doc.title).toBe("Mine");
  expect(errors).toEqual([]);
});

test("deleting a draft that never reached storage leaves another tab's level under its id alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const id = (await shown(page)).draft;
  const del = page.locator("#draftCard button", { hasText: /^delete/ });
  await del.click();
  await del.click();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(await stored(page)).toBeNull();
  // the other tab, with room, made a level of its own under the id this tab let go
  const theirs = {
    version: 1,
    next: id + 1,
    drafts: {
      [id]: {
        doc: {
          format: "kula-world-level",
          version: 1,
          title: "Theirs",
          world: "HELL",
          time: 99,
          blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
        },
        updated: Date.now() + 1000,
        saved: null,
        edits: 0,
      },
    },
  };
  await room(page, true);
  await arrives(page, theirs);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Theirs"]);
  expect((await stored(page)).drafts[id].doc.title).toBe("Theirs");
  // and this tab's next write carries it along
  await page.locator("#draftNew").click();
  await written(page, (s) => Object.keys(s?.drafts ?? {}).sort()).toEqual([
    String(id),
    String(id + 1),
  ]);
  expect((await stored(page)).drafts[id].doc.title).toBe("Theirs");
  expect(errors).toEqual([]);
});
