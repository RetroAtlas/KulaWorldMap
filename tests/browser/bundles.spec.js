import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, docOf, shown, toBundle, toCard, toList, written } from "./drafthelpers.js";
import { file, listed, openPatch, rows, saved } from "./patchhelpers.js";
import { blank, setMeta } from "../../public/js/format/project.js";
import { readBundle, writeBundle } from "../../public/js/format/bundle.js";

const NAME = "spiral-campaign.kula-bundle.json";
const HEAD = { title: "Spiral campaign", author: "Ada", notes: "Three up the wall." };
const LEVELS = [
  setMeta(blank("MARS"), { title: "Spiral 1", time: 42 }),
  setMeta(blank("INCA"), { title: "Spiral 2" }),
  setMeta(blank("HIRO"), { title: "Spiral 3" }),
];
const BUNDLE = writeBundle({ ...HEAD, levels: LEVELS });
const SHUFFLED = writeBundle({ ...HEAD, levels: [LEVELS[2], LEVELS[0], LEVELS[1]] });
const TOWER_NAME = "tower-set.kula-bundle.json";
const TOWER = writeBundle({
  title: "Tower set",
  author: "",
  notes: "",
  levels: [
    setMeta(blank("HIRO"), { title: "Tower 1" }),
    setMeta(blank("HIRO"), { title: "Tower 2" }),
  ],
});

/** Every bundle this browser holds, as the editor lists them. */
const bundles = (page) =>
  page.evaluate(async () => {
    const { bundles } = await import(new URL("js/editor/drafts.js", location.href).href);
    return bundles();
  });

/** The drafts this browser holds in the order they were made. */
const made = async (page) => (await listed(page)).sort((a, b) => a.id - b.id);

/** Give the bundle file to the sidebar's file input, and wait for your levels to count `total`. */
async function addBundle(page, name, text, total) {
  await page.locator("#draftFile").setInputFiles(file(name, text));
  await expect(levels(page)).toHaveCount(total);
}

/** Open the page with a level in no bundle made and the bundle file opened after it, the bundle's first level on screen; the name on the tile or row of the level on screen. */
async function shelved(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(1);
  await addBundle(page, NAME, BUNDLE, 4);
  const current = page.locator('#draftRows [aria-current="true"] .name');
  await expect(current).toHaveText("Spiral 1");
  return current;
}

/** Open the page and the bundle file through the sidebar's file input, and wait for its levels to be listed. */
async function openedBundle(page, text = BUNDLE, total = LEVELS.length) {
  await page.goto(EDIT);
  await settle(page);
  await addBundle(page, NAME, text, total);
}

/** Change the title, author or notes of the level on screen through the model, as a change that comes while the list stands. */
const amended = (page, meta) =>
  page.evaluate(async (meta) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setMeta }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    update(state.lvl.draft, setMeta(get(state.lvl.draft).doc, meta));
  }, meta);

const group = (page) => page.locator("#draftRows details.bundle");
/** Every level among your levels, as a tile or a row, inside a group or under them. */
const levels = (page) =>
  page.locator("#draftRows .tile, #draftRows > button, #draftRows .members > button");
const isOpen = (fold) => fold.evaluate((d) => d.open);
const loose = (page) => page.locator("#draftRows > ul.tiles .tile .name");
const box = (page) => page.locator("#bundle");
/** A button of the bar under a group's heading, by its words. */
const onBar = (fold, words) => fold.locator(".bar").getByRole("button", { name: words });

/** Open the Level card's box for the bundle the shown level goes into. */
async function openAdd(page) {
  await page.locator("#draftBundle").click();
  await expect(box(page)).toBeVisible();
}

const bundleCard = (page) => page.locator("#bundleCard");
/** The save of the File row on the bundle's card. */
const cardSave = (page) =>
  bundleCard(page)
    .getByRole("group", { name: "File", exact: true })
    .getByRole("button", { name: "save the bundle" });

/** Open the page with the bundle file and, from the list, stand the bundle's card through its group's edit the bundle, giving the group, the card and the levels' ids in the file's order. */
async function carded(page) {
  await openedBundle(page);
  await toList(page);
  const fold = group(page);
  await toBundle(page, fold);
  return { fold, card: bundleCard(page), ids: (await made(page)).map((d) => d.id) };
}

test("a bundle file opens its levels as drafts marked saved and gathered into a bundle, the first shown, with one toast", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const on = await shown(page);
  expect(on).toMatchObject({ li: -1, theme: "MARS", time: 42 });
  expect(on.chip).toContain("Spiral 1");
  const drafts = await made(page);
  expect(drafts.map((d) => d.title)).toEqual(["Spiral 1", "Spiral 2", "Spiral 3"]);
  expect(drafts[0].id).toBe(on.draft);
  for (const d of drafts) expect(d.saved).not.toBeNull();
  expect(await docOf(page, drafts[1].id)).toEqual(LEVELS[1]);
  const kept = await bundles(page);
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatchObject({ ...HEAD, levels: drafts.map((d) => d.id) });
  await expect(page.locator("#toastStack .toast")).toHaveText([
    `Opened 3 levels from ${NAME} as a bundle.`,
  ]);
  await expect(page.locator("#say")).toContainText(
    `Opened 3 levels from ${NAME} as a bundle. Draft, Spiral 1`,
  );
  await expect(page.locator("#draftCard details.report")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a group's save the bundle writes the bundle as one file that reads back with its levels in order, and marks each of them saved", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await toList(page);
  const button = onBar(group(page), "save the bundle");
  await expect(button).toHaveAttribute(
    "title",
    "Save the bundle, every level of it in order, as one file",
  );
  await expect(button).not.toHaveClass(/unsaved/);
  // the Level card's Bundle row holds no save
  await toCard(page);
  await expect(
    page
      .locator("#draftCard")
      .getByRole("group", { name: "Bundle", exact: true })
      .getByRole("button"),
  ).toHaveText(["Spiral campaign", "take out", "move to another bundle…"]);
  await page.locator("#draftTitle").fill("Spiral One");
  await toList(page);
  await expect(button).toHaveClass(/unsaved/);
  const out = await saved(page, button);
  expect(out.name).toBe("spiral-campaign.kula-bundle.json");
  const text = out.bytes.toString("utf8");
  const back = readBundle(text);
  expect(back.report).toEqual([]);
  expect(back.bundle).toMatchObject(HEAD);
  expect(back.bundle.levels.map((p) => p.title)).toEqual(["Spiral One", "Spiral 2", "Spiral 3"]);
  expect(text).toBe(writeBundle({ ...HEAD, levels: back.bundle.levels }));
  for (const d of await made(page)) {
    expect(d.saved).not.toBeNull();
    expect(d.edits).toBe(0);
  }
  await expect(button).not.toHaveClass(/unsaved/);
  await expect(
    page.locator("#draftRows button", { hasText: "Spiral One" }).locator(".line"),
  ).toHaveText("MARS · saved to a file");
  expect(errors).toEqual([]);
});

test("the disc box's a file… takes a bundle, adding a row for each of its levels, gathered into a bundle, the map staying on the level it showed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(1);
  await openPatch(page, (await shown(page)).draft);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await dialog.locator("#patchFile").setInputFiles(file(NAME, BUNDLE));
  await expect(rows(dialog).locator(".name")).toHaveText([
    "Untitled level",
    "Spiral 1",
    "Spiral 2",
    "Spiral 3",
  ]);
  await expect(levels(page)).toHaveCount(4);
  const drafts = await made(page);
  expect(drafts.map((d) => d.title)).toEqual([
    "Untitled level",
    "Spiral 1",
    "Spiral 2",
    "Spiral 3",
  ]);
  expect(await bundles(page)).toMatchObject([
    { ...HEAD, levels: drafts.slice(1).map((d) => d.id) },
  ]);
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  await expect(page.locator("#toastStack .toast")).toHaveText([
    `Opened 3 levels from ${NAME} as a bundle.`,
  ]);
  expect(errors).toEqual([]);
});

test("a level of a bundle the disc cannot show is left out and said, in a toast and in the fold on the first level's card", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const levels = [LEVELS[0], setMeta(LEVELS[1], { world: "NOWHERE" }), LEVELS[2]];
  await openedBundle(page, writeBundle({ ...HEAD, levels }), 2);
  const line = "level 1 (Spiral 2) names a world the disc has not; it is left out";
  await expect(page.locator("#toastStack .toast")).toHaveText([
    line,
    `Opened 2 levels from ${NAME} as a bundle.`,
  ]);
  const fold = page.locator("#draftCard details.report");
  await expect(fold.locator("summary")).toHaveText("Read with 1 repair");
  await expect(fold.locator("li")).toHaveText([line]);
  expect((await made(page)).map((d) => d.title)).toEqual(["Spiral 1", "Spiral 3"]);
  expect((await bundles(page))[0].levels).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("a bundle's group opens when one of its levels comes on screen, and otherwise stays as it was left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const fold = group(page);
  await expect(fold).toHaveCount(1);
  expect(await isOpen(fold)).toBe(true);
  // closed by a press, it stays closed through a change to the shown level and a level in no
  // bundle coming on screen
  await toList(page);
  await fold.locator("summary").click();
  await expect.poll(() => isOpen(fold)).toBe(false);
  await amended(page, { title: "Spiral One" });
  await expect(page.locator("#chipLine b")).toHaveText("Spiral One");
  expect(await isOpen(fold)).toBe(false);
  // folded, its count says that a level of it is not saved to a file, by a dot and in words
  await expect(fold.locator("summary .n.unsaved + .sr")).toHaveText(", not all saved to a file");
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
  expect(await isOpen(fold)).toBe(false);
  // one of its levels coming on screen opens it
  const second = (await made(page))[1].id;
  await page.evaluate((hash) => (location.hash = hash), `#DRAFT/${second}/45,35/fit/33`);
  await expect(page.locator("#chipLine b")).toHaveText("Spiral 2");
  await expect.poll(() => isOpen(fold)).toBe(true);
  await expect(fold.locator('.tile[aria-current="true"] .name')).toHaveText("Spiral 2");
  // left open, it stays open while a level in no bundle is shown
  await toList(page);
  await page.locator("#draftRows > ul.tiles .tile").click();
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  expect(await isOpen(fold)).toBe(true);
  // nothing of it is kept: a reload leaves it closed while the shown level is in no bundle
  await page.reload();
  await settle(page);
  await expect(levels(page)).toHaveCount(4);
  expect(await isOpen(fold)).toBe(false);
  expect(errors).toEqual([]);
});

test("a bundle made around the level on screen, or coming to hold it, opens around it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const spiral = group(page).nth(0);
  await toList(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
  await toList(page);
  await spiral.locator("summary").click();
  await expect.poll(() => isOpen(spiral)).toBe(false);
  const id = (await shown(page)).draft;
  const [b] = await bundles(page);
  // the shown level entering the bundle opens its group around it
  await page.evaluate(
    async ([bid, id]) => {
      const { bundle, updateBundle } = await import(
        new URL("js/editor/drafts.js", location.href).href
      );
      updateBundle(bid, { levels: [...bundle(bid).levels, id] });
    },
    [b.id, id],
  );
  await expect(spiral.locator("summary .n")).toHaveText("4 levels");
  expect(await isOpen(spiral)).toBe(true);
  await expect(spiral.locator('.tile[aria-current="true"] .name')).toHaveText("Untitled level");
  await expect(spiral.locator('.tile[aria-current="true"]')).toBeVisible();
  // taken out again, the group stays as left, and a bundle made around the level opens
  await page.evaluate(
    async ([bid, id]) => {
      const { bundle, updateBundle } = await import(
        new URL("js/editor/drafts.js", location.href).href
      );
      updateBundle(bid, { levels: bundle(bid).levels.filter((l) => l !== id) });
    },
    [b.id, id],
  );
  await expect(spiral.locator("summary .n")).toHaveText("3 levels");
  expect(await isOpen(spiral)).toBe(true);
  await spiral.locator("summary").click();
  await expect.poll(() => isOpen(spiral)).toBe(false);
  await page.evaluate(async (id) => {
    const { createBundle } = await import(new URL("js/editor/drafts.js", location.href).href);
    createBundle({ title: "Solo", levels: [id] });
  }, id);
  const folds = group(page);
  await expect(folds).toHaveCount(2);
  await expect(folds.nth(1).locator("summary .name")).toHaveText("Solo");
  expect(await isOpen(folds.nth(1))).toBe(true);
  await expect(folds.nth(1).locator('.tile[aria-current="true"] .name')).toHaveText(
    "Untitled level",
  );
  await expect(folds.nth(1).locator('.tile[aria-current="true"]')).toBeVisible();
  expect(await isOpen(spiral)).toBe(false);
  expect(errors).toEqual([]);
});

test("the groups stand first in the order the bundles were made, each in its own order under the title sort, and the levels in no bundle under them, as tiles and as rows", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(1);
  await addBundle(page, NAME, SHUFFLED, 4);
  await addBundle(page, TOWER_NAME, TOWER, 6);
  const folds = group(page);
  await expect(folds).toHaveCount(2);
  await expect(folds.locator("summary .name")).toHaveText(["Spiral campaign", "Tower set"]);
  await expect(folds.nth(0).locator("summary .by")).toHaveText("by Ada");
  await expect(folds.nth(1).locator("summary .by")).toHaveAttribute("hidden", "");
  await expect(folds.locator("summary .n")).toHaveText(["3 levels", "2 levels"]);
  const tagOf = (locator) => locator.evaluate((e) => `${e.tagName.toLowerCase()}.${e.className}`);
  expect(await tagOf(page.locator("#draftRows > :first-child"))).toBe("details.bundle");
  expect(await tagOf(page.locator("#draftRows > :last-child"))).toBe("ul.tiles");
  const spiral = folds.nth(0).locator(".tile .name");
  await expect(spiral).toHaveText(["Spiral 3", "Spiral 1", "Spiral 2"]);
  await expect(folds.nth(1).locator('.tile[aria-current="true"] .name')).toHaveText("Tower 1");
  await expect(page.locator("#draftRows > ul.tiles .tile .name")).toHaveText(["Untitled level"]);
  await toList(page);
  await page.locator("#draftSort").selectOption("title");
  await expect(spiral).toHaveText(["Spiral 3", "Spiral 1", "Spiral 2"]);
  await page.locator("#draftView").getByRole("button", { name: "list" }).click();
  await expect(folds.nth(0).locator(".members > button .name")).toHaveText([
    "Spiral 3",
    "Spiral 1",
    "Spiral 2",
  ]);
  await expect(folds.nth(1).locator('.members > button[aria-current="true"] .name')).toHaveText(
    "Tower 1",
  );
  await expect(page.locator("#draftRows > button .name")).toHaveText(["Untitled level"]);
  expect(await tagOf(page.locator("#draftRows > :first-child"))).toBe("details.bundle");
  expect(await tagOf(page.locator("#draftRows > :last-child"))).toBe("button.");
  await expect(page.locator("#draftRows .tile")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("[ and ] step through your levels in the list's order, a bundle's levels in the bundle's order and then the levels in no bundle, each brought into the sidebar's view, and nowhere past either end", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const current = await shelved(page);
  await toList(page);
  const press = async (key, title) => {
    await page.keyboard.press(key);
    await expect(current).toHaveText(title);
    await expect(current).toBeInViewport();
  };
  // from the sidebar's top, where the levels lie below its foot
  await page.locator("#sidebar").evaluate((side) => (side.scrollTop = 0));
  await expect(current).not.toBeInViewport();
  await press("]", "Spiral 2");
  await press("[", "Spiral 1");
  await press("[", "Spiral 1");
  await press("]", "Spiral 2");
  await press("]", "Spiral 3");
  await press("]", "Untitled level");
  await press("]", "Untitled level");
  await press("[", "Spiral 3");
  expect(errors).toEqual([]);
});

test("a step taken from a control of the Level card leaves the keyboard on that control of the next level's card, or on the card itself where that card has none in sight", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const current = await shelved(page);
  await page.locator("#draftSaveKwl").focus();
  await page.keyboard.press("]");
  await expect(current).toHaveText("Spiral 2");
  await expect(page.locator("#draftSaveKwl")).toBeFocused();
  // a level in no bundle has no take out, so from that button the keyboard goes to the card itself
  await page.keyboard.press("]");
  await page.locator("#draftUnbundle").focus();
  await page.keyboard.press("]");
  await expect(current).toHaveText("Untitled level");
  await expect(page.locator("#draftTitle")).toHaveValue("Untitled level");
  await expect(page.locator("#draftCard")).toBeFocused();
  expect(errors).toEqual([]);
});

test("the filter hides a group none of whose levels it keeps, shows a kept level inside its group and leaves the group's count at the whole bundle's count", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await toList(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
  await toList(page);
  const fold = group(page);
  const inside = fold.locator(".tile .name");
  const free = loose(page);
  const filter = page.locator("#draftFilter");
  const empty = page.locator("#draftEmpty");
  await filter.fill("inca");
  await expect(inside).toHaveText(["Spiral 2"]);
  await expect(fold).toBeVisible();
  await expect(fold.locator("summary .n")).toHaveText("3 levels");
  await expect(free).toHaveCount(0);
  await expect(empty).toBeHidden();
  await filter.fill("untitled");
  await expect(fold).toBeHidden();
  await expect(free).toHaveText(["Untitled level"]);
  await filter.fill("zzz");
  await expect(fold).toBeHidden();
  await expect(free).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("Nothing matches.");
  await filter.fill("");
  await expect(fold).toBeVisible();
  await expect(inside).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  await expect(free).toHaveText(["Untitled level"]);
  await expect(empty).toBeHidden();
  expect(errors).toEqual([]);
});

test("add to a bundle… makes a new bundle holding the level through its box, with the remembered author, and the group stands with the card's buttons", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(1);
  await page.locator("#draftTitle").fill("Spiral 1");
  await page.locator("#draftAuthor").fill("Ada");
  await expect(page.locator("#draftUnbundle")).toBeHidden();
  await openAdd(page);
  const b = box(page);
  await expect(b.locator("#bundleHeading")).toHaveText("Add to a bundle");
  await expect(b.locator("#bundleNote")).toHaveText(
    "A bundle is a set of your levels in play order, saved as one file.",
  );
  await expect(b.locator("#bundlePick option")).toHaveText(["a new bundle"]);
  await expect(b.locator("#bundleTitle")).toBeFocused();
  await expect(b.locator("#bundleSays")).toBeEmpty();
  // cancel closes the box and gives the focus back
  await b.locator("#bundleCancel").click();
  await expect(b).toBeHidden();
  await expect(page.locator("#draftBundle")).toBeFocused();
  await openAdd(page);
  await b.locator("#bundleTitle").fill("Spiral campaign");
  await b.locator("#bundleAdd").click();
  await expect(b).toBeHidden();
  const fold = group(page);
  await expect(fold).toHaveCount(1);
  await expect(fold.locator("summary .name")).toHaveText("Spiral campaign");
  await expect(fold.locator("summary .by")).toHaveText("by Ada");
  await expect(fold.locator("summary .n")).toHaveText("1 level");
  await expect(fold.locator(".tile .name")).toHaveText(["Spiral 1"]);
  expect(await isOpen(fold)).toBe(true);
  await expect(loose(page)).toHaveCount(0);
  await expect(page.locator("#say")).toHaveText("Added Spiral 1 to a new bundle, Spiral campaign.");
  const id = (await shown(page)).draft;
  expect(await bundles(page)).toMatchObject([
    { title: "Spiral campaign", author: "Ada", notes: "", levels: [id] },
  ]);
  await expect(page.locator("#draftUnbundle")).toHaveText("take out");
  await expect(page.locator("#draftPlace")).toHaveText("Spiral campaign · level 1 of 1");
  await expect(page.locator("#draftBundle")).toHaveText("move to another bundle…");
  await expect(page.locator("#draftBundle")).toHaveAttribute(
    "title",
    "Move this level to another bundle, or to a new one",
  );
  // the box is worded afresh each time it opens
  await openAdd(page);
  await expect(b.locator("#bundleHeading")).toHaveText("Move to another bundle");
  await b.locator("#bundleCancel").click();
  expect(errors).toEqual([]);
});

test("the box for a level in a bundle is worded as a move, says which bundle it leaves, offers only the others, and puts the level last into the one chosen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await addBundle(page, TOWER_NAME, TOWER, 5);
  await expect(page.locator("#chipLine b")).toHaveText("Tower 1");
  await openAdd(page);
  const b = box(page);
  await expect(b.locator("#bundleHeading")).toHaveText("Move to another bundle");
  await expect(b.locator("#bundleAdd")).toHaveText("move");
  await expect(b.locator("#bundlePick")).toHaveAttribute(
    "title",
    "The bundle to move this level to",
  );
  await expect(b.locator("#bundleSays")).toHaveText(
    "Tower 1 leaves Tower set when it is moved to another bundle.",
  );
  await expect(b.locator("#bundlePick option")).toHaveText(["Spiral campaign", "a new bundle"]);
  await expect(b.locator("#bundlePick")).toBeFocused();
  await expect(b.locator("#bundleTitle")).toBeHidden();
  await b.locator("#bundlePick").selectOption({ label: "a new bundle" });
  await expect(b.locator("#bundleTitle")).toBeVisible();
  await b.locator("#bundlePick").selectOption({ label: "Spiral campaign" });
  await expect(b.locator("#bundleTitle")).toBeHidden();
  await b.locator("#bundleAdd").click();
  await expect(b).toBeHidden();
  const folds = group(page);
  await expect(folds.locator("summary .n")).toHaveText(["4 levels", "1 level"]);
  await expect(folds.nth(0).locator(".tile .name")).toHaveText([
    "Spiral 1",
    "Spiral 2",
    "Spiral 3",
    "Tower 1",
  ]);
  await expect(page.locator("#say")).toHaveText("Moved Tower 1 from Tower set to Spiral campaign.");
  const [spiral, tower] = await bundles(page);
  expect(spiral.levels).toHaveLength(4);
  expect(tower.levels).toEqual([(await made(page))[4].id]);
  expect(errors).toEqual([]);
});

test("edit the bundle, on the bar under a group's heading, stands the bundle's card, which reads in the Level card's order with the bundle's save in its File row, and whose fields write the bundle that save then writes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await toList(page);
  const fold = group(page);
  const opener = onBar(fold, "edit the bundle");
  const card = bundleCard(page);
  // the bar stands directly under the heading, which holds no button of its own, and over the levels
  await expect(fold.locator("summary + .bar button")).toHaveText([
    "save the bundle",
    "edit the bundle",
  ]);
  await expect(fold.locator("summary button")).toHaveCount(0);
  await expect(fold.locator(".bar + .members .tile")).toHaveCount(3);
  await expect(opener).toHaveAttribute(
    "title",
    "Set the bundle's title, author and notes and the order of its levels, or take it apart",
  );
  // the opener unfolds nothing, so it says nothing of a fold
  await expect(opener).not.toHaveAttribute("aria-expanded");
  await expect(card).toBeHidden();
  await opener.click();
  await expect(card).toBeVisible();
  await expect(fold).toBeHidden();
  await expect(card.locator("h3")).toHaveText("Bundle");
  await expect(
    card.locator(
      "h3 + label:has(.title) + .state + .row.named + label:has(.author) + label:has(.notes) + .order + .levels + .row.last",
    ),
  ).toHaveCount(1);
  const save = cardSave(page);
  await expect(save).toHaveAttribute(
    "title",
    "Save the bundle, every level of it in order, as one file",
  );
  await expect(save).not.toHaveClass(/unsaved/);
  await expect(card.locator(".title")).toHaveValue("Spiral campaign");
  await expect(card.locator(".author")).toHaveValue("Ada");
  await expect(card.locator(".notes")).toHaveValue("Three up the wall.");
  // the caption in sight names the list, whose rows open on their places
  await expect(card.getByText("Levels, in play order")).toBeVisible();
  const list = card.getByRole("list", { name: "Levels, in play order" });
  await expect(list.locator("li .name")).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  await expect(list.locator("li > :first-child")).toHaveText(["1", "2", "3"]);
  // the line under the title follows a change of a level
  const line = card.locator("label:has(.title) + .state");
  await expect(line).toHaveText("3 levels · saved to a file");
  await amended(page, { notes: "Up the wall." });
  await expect(line).toHaveText("3 levels · 1 not saved to a file");
  await expect(save).toHaveClass(/unsaved/);
  await card.locator(".title").fill("Spiral set");
  await expect(fold.locator("summary .name")).toHaveText("Spiral set");
  await card.locator(".author").fill("Grace");
  await expect(fold.locator("summary .by")).toHaveText("by Grace");
  await card.locator(".notes").fill("Four up the wall.");
  expect((await bundles(page))[0]).toMatchObject({
    title: "Spiral set",
    author: "Grace",
    notes: "Four up the wall.",
  });
  await expect(save).toBeEnabled();
  const out = await saved(page, save);
  expect(out.name).toBe("spiral-set.kula-bundle.json");
  const back = readBundle(out.bytes.toString("utf8"));
  expect(back.bundle).toMatchObject({
    title: "Spiral set",
    author: "Grace",
    notes: "Four up the wall.",
  });
  expect(back.bundle.levels.map((p) => p.title)).toEqual(["Spiral 1", "Spiral 2", "Spiral 3"]);
  // the save marks every level saved, which the card's line and the button's dot follow
  await expect(line).toHaveText("3 levels · saved to a file");
  await expect(save).not.toHaveClass(/unsaved/);
  expect(errors).toEqual([]);
});

test("the card's up and down move a level a place, saying where it stands, the keyboard staying on its row", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { fold, card, ids } = await carded(page);
  const rows = card.locator(".levels li");
  await expect(rows.nth(0).locator('[data-act="up"]')).toBeDisabled();
  await expect(rows.nth(2).locator('[data-act="down"]')).toBeDisabled();
  await rows.nth(2).locator('[data-act="up"]').click();
  await expect(rows.locator(".name")).toHaveText(["Spiral 1", "Spiral 3", "Spiral 2"]);
  await expect(rows.nth(1).locator('[data-act="up"]')).toBeFocused();
  await expect(fold.locator(".tile .name")).toHaveText(["Spiral 1", "Spiral 3", "Spiral 2"]);
  await expect(page.locator("#say")).toHaveText("Moved Spiral 3 up, to level 2 of 3.");
  // from the keyboard, to the top, where up is no more and down takes the focus
  await page.keyboard.press("Enter");
  await expect(rows.locator(".name")).toHaveText(["Spiral 3", "Spiral 1", "Spiral 2"]);
  await expect(rows.nth(0).locator('[data-act="down"]')).toBeFocused();
  await expect(page.locator("#say")).toHaveText("Moved Spiral 3 up, to level 1 of 3.");
  await rows.nth(1).locator('[data-act="down"]').click();
  await expect(rows.locator(".name")).toHaveText(["Spiral 3", "Spiral 2", "Spiral 1"]);
  await expect(rows.nth(2).locator('[data-act="up"]')).toBeFocused();
  await expect(page.locator("#say")).toHaveText("Moved Spiral 1 down, to level 3 of 3.");
  // the Level card says where the level on screen then stands
  await expect(page.locator("#draftPlace")).toHaveText("Spiral campaign · level 3 of 3");
  expect((await bundles(page))[0].levels).toEqual([ids[2], ids[1], ids[0]]);
  await written(page, (s) => s?.bundles[Object.keys(s.bundles)[0]].levels).toEqual([
    ids[2],
    ids[1],
    ids[0],
  ]);
  expect(errors).toEqual([]);
});

test("take out, on the card's row and on the Level card, leaves the level among your levels in no bundle, and an emptied bundle offers no save", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await toList(page);
  await page.locator("#draftSort").selectOption("title");
  const fold = group(page);
  await toBundle(page, fold);
  const card = bundleCard(page);
  const ids = (await made(page)).map((d) => d.id);
  const rows = card.locator(".levels li");
  await rows.nth(1).locator('[data-act="out"]').click();
  await expect(rows.locator(".name")).toHaveText(["Spiral 1", "Spiral 3"]);
  await expect(rows.nth(1).locator('[data-act="out"]')).toBeFocused();
  await expect(fold.locator("summary .n")).toHaveText("2 levels");
  await expect(loose(page)).toHaveText(["Spiral 2"]);
  await expect(page.locator("#say")).toHaveText("Took Spiral 2 out of Spiral campaign.");
  // the Level card's button takes the shown level out and gives way to add to a bundle…
  await expect(page.locator("#draftPlace")).toHaveText("Spiral campaign · level 1 of 2");
  await toList(page);
  await toCard(page);
  await page.locator("#draftUnbundle").click();
  await expect(loose(page)).toHaveText(["Spiral 1", "Spiral 2"]);
  await expect(page.locator("#draftUnbundle")).toBeHidden();
  await expect(page.locator("#draftPlace")).toBeHidden();
  await expect(page.locator("#draftBundle")).toBeFocused();
  await expect(page.locator("#draftBundle")).toHaveText("add to a bundle…");
  await expect(page.locator("#say")).toHaveText("Took Spiral 1 out of Spiral campaign.");
  expect((await bundles(page))[0].levels).toEqual([ids[2]]);
  // the last level out leaves a bundle that cannot be saved, the focus on take apart
  await toList(page);
  await toBundle(page, fold);
  await expect(rows.locator(".name")).toHaveText(["Spiral 3"]);
  await expect(cardSave(page)).toBeEnabled();
  await rows.nth(0).locator('[data-act="out"]').click();
  await expect(rows).toHaveCount(0);
  await expect(fold.locator("summary .n")).toHaveText("0 levels");
  await expect(cardSave(page)).toBeDisabled();
  await expect(card.getByText("Levels, in play order")).toBeHidden();
  await expect(card.locator(".row button", { hasText: /^take apart/ })).toBeFocused();
  await expect(loose(page)).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  await toList(page);
  await expect(onBar(fold, "save the bundle")).toBeDisabled();
  expect(errors).toEqual([]);
});

test("take apart asks to be pressed again, then forgets the bundle and leaves its levels among your levels", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { fold, card } = await carded(page);
  const apart = card.locator(".row button", { hasText: /^take apart/ });
  await expect(apart).toHaveAttribute("title", "Keep the levels and forget the bundle");
  // alone at the far end of the row that closes the card
  await apart.scrollIntoViewIfNeeded();
  const seat = await apart.boundingBox();
  const row = await card.locator(".levels + .row").boundingBox();
  expect(seat.x + seat.width).toBeCloseTo(row.x + row.width, 0);
  await apart.click();
  await expect(apart).toHaveText("take apart?");
  // the button keeps its box while it asks, so nothing moves under the pointer
  expect(await apart.boundingBox()).toEqual(seat);
  await expect(apart).toHaveAttribute(
    "title",
    "Press again to keep the levels and forget the bundle",
  );
  await expect(fold).toHaveCount(1);
  await apart.click();
  await expect(fold).toHaveCount(0);
  await page.locator("#draftSort").selectOption("title");
  await expect(loose(page)).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  await expect(page.locator("#say")).toHaveText(
    "Took Spiral campaign apart, leaving its 3 levels among your levels.",
  );
  await expect(page.locator("#draftNew")).toBeFocused();
  await expect(page.locator("#draftUnbundle")).toHaveAttribute("hidden", "");
  expect(await bundles(page)).toEqual([]);
  await written(page, (s) => s?.bundles).toEqual({});
  expect(errors).toEqual([]);
});
