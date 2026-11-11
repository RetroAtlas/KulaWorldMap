import { expect, test } from "@playwright/test";
import { filledTiles, settle, textured, topPixels, trackErrors } from "./helpers.js";
import { EDIT, docOf, faced, shown, stored, written } from "./drafthelpers.js";

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

/** The picture on the tile of draft `id`: how many of its pixels are not the background, and a
    digest of them all; nothing where the tile has not been painted. */
const picture = (page, id) =>
  page.evaluate(async (id) => {
    const cv = document.querySelector(`#draftRows .tile[data-key="${id}"] canvas`);
    if (!cv?.width) return { drawn: 0, hash: "" };
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let drawn = 0;
    for (let i = 0; i < px.length; i += 4)
      if (px[i + 3] && (px[i] !== 0x11 || px[i + 1] !== 0x17 || px[i + 2] !== 0x25)) drawn++;
    const digest = await crypto.subtle.digest("SHA-256", px);
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return { drawn, hash };
  }, id);
const painted = (page, id) => expect.poll(async () => (await picture(page, id)).drawn);
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("kula.tiles")));
/** A new level titled `title`, in `world` where one is named. */
async function made(page, title, world) {
  await page.locator("#draftNew").click();
  await page.locator("#draftTitle").fill(title);
  if (world) await page.selectOption("#draftWorld", world);
  await expect(page.locator("#chipLine b")).toHaveText(title);
  return (await shown(page)).draft;
}

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
  await expect(row.locator(".line")).toHaveText("HIRO · not saved to a file");
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
  await expect(page.locator("#draftFrom")).toBeHidden();

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
  await expect(page.locator("#draftFrom")).toHaveText("Copied from LEVEL 1");
  await expect(page.locator("#say")).toContainText("Copied LEVEL 1. Draft, LEVEL 1");

  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const second = await shown(page);
  expect(second.li).toBe(-1);
  expect(second.draft).not.toBe(copy.draft);
  expect(await standing(page)).toEqual(shipped);
  expect(await docOf(page, second.draft)).toEqual(doc);
  await expect(page.locator("#draftRows button[aria-current='true']")).toHaveCount(1);
  expect(await filledTiles(page, "#draftRows")).toEqual([String(second.draft)]);
  expect(errors).toEqual([]);
});

test("copy this level and w title a copy of a level that differs on the disc shown with that disc's code, and a copy under US with the title alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HELL/17/45,35/fit/33/d-eu");
  await settle(page);
  await expect(page.locator("#chipLine .tag")).toHaveText("EU");
  await page.locator("#draftCopy").click();
  const rows = page.locator("#draftRows button");
  await expect(rows).toHaveCount(1);
  await expect(rows.locator(".name")).toHaveText("BONUS 30 (EU)");
  await expect(page.locator("#chipLine b")).toHaveText("BONUS 30 (EU)");
  await expect(page.locator("#chipLine .tag")).toHaveText(["Draft", "EU"]);
  await expect(page.locator("#say")).toContainText("Copied BONUS 30 (EU).");
  await expect(page.locator("#say")).toContainText("Draft, BONUS 30 (EU), HELL,");
  const pal = await shown(page);
  expect(pal.li).toBe(-1);
  expect(await docOf(page, pal.draft)).toMatchObject({
    title: "BONUS 30 (EU)",
    from: "/HELL/HELL.PAK#17",
    fromRelease: "eu",
  });

  await page.evaluate(() => (location.hash = "#HELL/17/45,35/fit/33"));
  await expect(page.locator("#chipLine b")).toHaveText("BONUS 30");
  await expect(page.locator("#chipLine .tag")).toHaveCount(0);
  await page.locator("#draftCopy").click();
  await expect(rows).toHaveCount(2);
  await expect(rows.locator(".name")).toHaveText(["BONUS 30", "BONUS 30 (EU)"]);
  await expect(page.locator("#draftRows button[aria-current='true'] .name")).toHaveText("BONUS 30");
  await expect(page.locator("#say")).toContainText("Copied BONUS 30. Draft, BONUS 30, HELL,");
  const us = await shown(page);
  expect(us.draft).not.toBe(pal.draft);
  const doc = await docOf(page, us.draft);
  expect(doc).toMatchObject({ title: "BONUS 30", from: "/HELL/HELL.PAK#17" });
  expect(doc).not.toHaveProperty("fromRelease");

  await page.evaluate(() => (location.hash = "#HELL/17/45,35/fit/33/d-eu"));
  await expect(page.locator("#chipLine .tag")).toHaveText("EU");
  await page.keyboard.press("w");
  await expect(page.locator("#say")).toHaveText(
    /^Copied BONUS 30 \(EU\)\. .*Draft, BONUS 30 \(EU\), HELL, .*\. Editing on\.$/,
  );
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

test("a level's tile carries a picture of the level, painted as the tile shows", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  const tile = page.locator("#draftRows ul.tiles[role=list] > li > button.tile");
  await expect(tile).toHaveCount(1);
  const id = (await shown(page)).draft;
  await expect(tile).toHaveAttribute("data-key", String(id));
  await expect(tile.locator("canvas.thumb")).toHaveAttribute("aria-hidden", "true");
  await painted(page, id).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("list and tiles switch the view once this browser holds two levels, and the choice is kept across a reload", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows .tile")).toHaveCount(1);
  const bar = page.locator("#draftView");
  await expect(bar).toBeHidden();
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows .tile")).toHaveCount(2);
  await expect(bar).toBeVisible();
  const pressed = bar.locator(".scope button[aria-pressed='true']");
  await expect(pressed).toHaveText("tiles");
  await bar.getByRole("button", { name: "list" }).click();
  const rows = page.locator("#draftRows > button");
  await expect(rows).toHaveCount(2);
  await expect(rows.locator(".state")).toHaveText(["not saved to a file", "not saved to a file"]);
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#draftRows .tile")).toHaveCount(0);
  await expect(pressed).toHaveText("list");
  await expect(pressed).toBeFocused();
  expect(await kept(page)).toEqual({ view: "list" });
  await page.reload();
  await settle(page);
  await expect(rows).toHaveCount(2);
  await expect(bar.locator(".scope button[aria-pressed='true']")).toHaveText("list");
  await bar.getByRole("button", { name: "tiles" }).click();
  await expect(page.locator("#draftRows .tile")).toHaveCount(2);
  await expect(rows).toHaveCount(0);
  expect(await kept(page)).toEqual({ view: "tiles" });
  expect(errors).toEqual([]);
});

test("the sort orders your levels by the last change, by title, by world in the game's order or with those not saved to a file first, and is kept", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await made(page, "Alpha");
  await made(page, "Beta", "MARS");
  const gamma = await made(page, "Gamma", "INCA");
  const names = page.locator("#draftRows .tile .name");
  await expect(names).toHaveText(["Gamma", "Beta", "Alpha"]);
  const sort = page.locator("#draftSort");
  await expect(sort).toHaveValue("changed");
  await sort.selectOption("title");
  await expect(names).toHaveText(["Alpha", "Beta", "Gamma"]);
  await sort.selectOption("world");
  await expect(names).toHaveText(["Alpha", "Gamma", "Beta"]);
  await page.evaluate(async (id) => {
    const { markSaved } = await import(new URL("js/editor/drafts.js", location.href).href);
    markSaved(id);
  }, gamma);
  await sort.selectOption("unsaved");
  await expect(names).toHaveText(["Beta", "Alpha", "Gamma"]);
  expect(await kept(page)).toEqual({ sort: "unsaved" });
  await page.reload();
  await settle(page);
  await expect(names).toHaveText(["Beta", "Alpha", "Gamma"]);
  await expect(sort).toHaveValue("unsaved");
  expect(errors).toEqual([]);
});

test("the filter keeps the levels whose title or world holds its text, whatever the case, says when none does, and starts empty on every visit", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await made(page, "Alpha");
  await made(page, "Beta", "MARS");
  const names = page.locator("#draftRows .tile .name");
  const filter = page.locator("#draftFilter");
  const empty = page.locator("#draftEmpty");
  await expect(names).toHaveText(["Beta", "Alpha"]);
  await filter.fill("ALP");
  await expect(names).toHaveText(["Alpha"]);
  await expect(page.locator("#yoursCount")).toHaveText("2");
  await filter.fill("mars");
  await expect(names).toHaveText(["Beta"]);
  await filter.fill("zzz");
  await expect(names).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("Nothing matches.");
  await filter.fill("");
  await expect(names).toHaveText(["Beta", "Alpha"]);
  await expect(empty).toBeHidden();
  await filter.fill("beta");
  await expect(names).toHaveText(["Beta"]);
  await page.reload();
  await settle(page);
  await expect(names).toHaveText(["Beta", "Alpha"]);
  await expect(filter).toHaveValue("");
  expect(errors).toEqual([]);
});

test("a tile's picture is painted again when its level changes", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await textured(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows .tile")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await painted(page, id).toBeGreaterThan(0);
  const before = (await picture(page, id)).hash;
  await laid(page, [19, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await expect.poll(async () => (await picture(page, id)).hash).not.toBe(before);
  expect(errors).toEqual([]);
});

test("a tile's picture is flat until its world's textures land, and painted again with them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  let held = null;
  await page.route("**/tex/MARS.png", (route) => {
    held = route;
  });
  await page.goto(EDIT);
  await settle(page);
  await textured(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows .tile")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await painted(page, id).toBeGreaterThan(0);
  const hiro = (await picture(page, id)).hash;
  await page.selectOption("#draftWorld", "MARS");
  const line = page.locator(`#draftRows .tile[data-key="${id}"] .line`);
  await expect(line).toHaveText("MARS · not saved to a file · 1 change");
  const flat = (await picture(page, id)).hash;
  expect(flat).not.toBe(hiro);
  await expect.poll(() => held !== null).toBe(true);
  await held.continue();
  await textured(page);
  expect((await picture(page, id)).hash).not.toBe(flat);
  expect(errors).toEqual([]);
});
