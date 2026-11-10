import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, docOf, shown, written } from "./drafthelpers.js";
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

/** Open the page and the bundle file through the sidebar's file input, and wait for its levels to be listed. */
async function openedBundle(page, text = BUNDLE, total = LEVELS.length) {
  await page.goto(EDIT);
  await settle(page);
  await addBundle(page, NAME, text, total);
}

const group = (page) => page.locator("#draftRows details.bundle");
/** Every level among your levels, as a tile or a row, inside a group or under them. */
const levels = (page) =>
  page.locator("#draftRows .tile, #draftRows > button, #draftRows .members > button");
const isOpen = (fold) => fold.evaluate((d) => d.open);
const loose = (page) => page.locator("#draftRows > ul.tiles .tile .name");
const box = (page) => page.locator("#bundle");

/** Open the Level card's box for the bundle the shown level goes into. */
async function openAdd(page) {
  await page.locator("#draftBundle").click();
  await expect(box(page)).toBeVisible();
}

/** Open the page with the bundle file and the bundle's card through its group's arrange…, giving the group, the card and the levels' ids in the file's order. */
async function arranged(page) {
  await openedBundle(page);
  const fold = group(page);
  await fold.locator("summary .arrange").click();
  const card = fold.locator(".card");
  await expect(card).toBeVisible();
  return { fold, card, ids: (await made(page)).map((d) => d.id) };
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

test("save as a bundle writes the bundle as one file that reads back with its levels in order, and marks each of them saved", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const button = page.locator("#draftSaveBundle");
  await expect(button).toHaveText("save as a bundle");
  await expect(button).not.toHaveClass(/unsaved/);
  await page.locator("#draftTitle").fill("Spiral One");
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

test("a level in no bundle offers no bundle to save", async ({ page }) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const button = page.locator("#draftSaveBundle");
  await expect(button).toBeVisible();
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
  await expect(button).toBeHidden();
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
  await fold.locator("summary").click();
  await expect.poll(() => isOpen(fold)).toBe(false);
  await page.locator("#draftTitle").fill("Spiral One");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral One");
  expect(await isOpen(fold)).toBe(false);
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
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
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
  await expect(folds.nth(0).locator("summary .by")).toHaveText("Ada");
  await expect(folds.nth(1).locator("summary .by")).toHaveAttribute("hidden", "");
  await expect(folds.locator("summary .n")).toHaveText(["3 levels", "2 levels"]);
  const tagOf = (locator) => locator.evaluate((e) => `${e.tagName.toLowerCase()}.${e.className}`);
  expect(await tagOf(page.locator("#draftRows > :first-child"))).toBe("details.bundle");
  expect(await tagOf(page.locator("#draftRows > :last-child"))).toBe("ul.tiles");
  const spiral = folds.nth(0).locator(".tile .name");
  await expect(spiral).toHaveText(["Spiral 3", "Spiral 1", "Spiral 2"]);
  await expect(folds.nth(1).locator('.tile[aria-current="true"] .name')).toHaveText("Tower 1");
  await expect(page.locator("#draftRows > ul.tiles .tile .name")).toHaveText(["Untitled level"]);
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

test("the filter hides a group none of whose levels it keeps, shows a kept level inside its group and leaves the group's count at the whole bundle's count", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await page.locator("#draftNew").click();
  await expect(levels(page)).toHaveCount(4);
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
  await expect(page.locator("#draftSaveBundle")).toBeHidden();
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
  await expect(fold.locator("summary .by")).toHaveText("Ada");
  await expect(fold.locator("summary .n")).toHaveText("1 level");
  await expect(fold.locator(".tile .name")).toHaveText(["Spiral 1"]);
  expect(await isOpen(fold)).toBe(true);
  await expect(loose(page)).toHaveCount(0);
  await expect(page.locator("#say")).toHaveText("Added Spiral 1 to a new bundle, Spiral campaign.");
  const id = (await shown(page)).draft;
  expect(await bundles(page)).toMatchObject([
    { title: "Spiral campaign", author: "Ada", notes: "", levels: [id] },
  ]);
  await expect(page.locator("#draftUnbundle")).toBeVisible();
  await expect(page.locator("#draftSaveBundle")).toBeVisible();
  await expect(page.locator("#draftBundle")).toHaveAttribute(
    "title",
    "Move this level to another bundle, or to a new one",
  );
  expect(errors).toEqual([]);
});

test("the box for a level in a bundle says which bundle it leaves, offers only the others, and add moves the level last into the one chosen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  await addBundle(page, TOWER_NAME, TOWER, 5);
  await expect(page.locator("#chipLine b")).toHaveText("Tower 1");
  await openAdd(page);
  const b = box(page);
  await expect(b.locator("#bundleSays")).toHaveText(
    "Tower 1 leaves Tower set when it is added to another bundle.",
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

test("arrange… opens the bundle's card under its levels, whose fields write the bundle and whose save writes its file, and puts it away again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openedBundle(page);
  const fold = group(page);
  const arrange = fold.locator("summary .arrange");
  const card = fold.locator(".card");
  await expect(arrange).toHaveText("arrange…");
  await expect(arrange).toHaveAttribute("aria-expanded", "false");
  await expect(card).toBeHidden();
  // closed, the group opens with its card
  await fold.locator("summary").click();
  await expect.poll(() => isOpen(fold)).toBe(false);
  await arrange.click();
  await expect(card).toBeVisible();
  await expect(arrange).toHaveAttribute("aria-expanded", "true");
  expect(await isOpen(fold)).toBe(true);
  await expect(card.locator("h3")).toHaveText("Bundle");
  await expect(card.locator(".title")).toHaveValue("Spiral campaign");
  await expect(card.locator(".author")).toHaveValue("Ada");
  await expect(card.locator(".notes")).toHaveValue("Three up the wall.");
  await expect(card.locator(".levels li .name")).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  await card.locator(".title").fill("Spiral set");
  await expect(fold.locator("summary .name")).toHaveText("Spiral set");
  await card.locator(".author").fill("Grace");
  await expect(fold.locator("summary .by")).toHaveText("Grace");
  await card.locator(".notes").fill("Four up the wall.");
  expect((await bundles(page))[0]).toMatchObject({
    title: "Spiral set",
    author: "Grace",
    notes: "Four up the wall.",
  });
  const save = card.locator(".row button", { hasText: "save as a bundle" });
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
  // pressed again, the card goes and the group stays open
  await arrange.click();
  await expect(card).toBeHidden();
  await expect(arrange).toHaveAttribute("aria-expanded", "false");
  expect(await isOpen(fold)).toBe(true);
  // closing the group puts the card away, and the next press opens the group with it again
  await arrange.click();
  await expect(card).toBeVisible();
  await fold.locator("summary").click();
  await expect.poll(() => isOpen(fold)).toBe(false);
  await expect(arrange).toHaveAttribute("aria-expanded", "false");
  await expect(card).toHaveAttribute("hidden", "");
  await arrange.click();
  await expect(card).toBeVisible();
  await expect(arrange).toHaveAttribute("aria-expanded", "true");
  expect(await isOpen(fold)).toBe(true);
  expect(errors).toEqual([]);
});

test("the card's up and down move a level a place, saying where it stands, the keyboard staying on its row", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { fold, card, ids } = await arranged(page);
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
  const { fold, card, ids } = await arranged(page);
  await page.locator("#draftSort").selectOption("title");
  const rows = card.locator(".levels li");
  await rows.nth(1).locator('[data-act="out"]').click();
  await expect(rows.locator(".name")).toHaveText(["Spiral 1", "Spiral 3"]);
  await expect(rows.nth(1).locator('[data-act="out"]')).toBeFocused();
  await expect(fold.locator("summary .n")).toHaveText("2 levels");
  await expect(loose(page)).toHaveText(["Spiral 2"]);
  await expect(page.locator("#say")).toHaveText("Took Spiral 2 out of Spiral campaign.");
  // the Level card's button takes the shown level out and gives way to add to a bundle…
  await page.locator("#draftUnbundle").click();
  await expect(rows.locator(".name")).toHaveText(["Spiral 3"]);
  await expect(loose(page)).toHaveText(["Spiral 1", "Spiral 2"]);
  await expect(page.locator("#draftUnbundle")).toBeHidden();
  await expect(page.locator("#draftBundle")).toBeFocused();
  await expect(page.locator("#say")).toHaveText("Took Spiral 1 out of Spiral campaign.");
  expect((await bundles(page))[0].levels).toEqual([ids[2]]);
  // the last level out leaves a bundle that cannot be saved, the focus on take apart
  await rows.nth(0).locator('[data-act="out"]').click();
  await expect(rows).toHaveCount(0);
  await expect(fold.locator("summary .n")).toHaveText("0 levels");
  await expect(card.locator(".row button", { hasText: "save as a bundle" })).toBeDisabled();
  await expect(card.locator(".row button", { hasText: /^take apart/ })).toBeFocused();
  await expect(loose(page)).toHaveText(["Spiral 1", "Spiral 2", "Spiral 3"]);
  expect(errors).toEqual([]);
});

test("take apart asks to be pressed again, then forgets the bundle and leaves its levels among your levels", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { fold, card } = await arranged(page);
  const apart = card.locator(".row button", { hasText: /^take apart/ });
  await expect(apart).toHaveAttribute("title", "Keep the levels and forget the bundle");
  await apart.click();
  await expect(apart).toHaveText("take apart?");
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
  await expect(page.locator("#draftUnbundle")).toBeHidden();
  await expect(page.locator("#draftSaveBundle")).toBeHidden();
  expect(await bundles(page)).toEqual([]);
  await written(page, (s) => s?.bundles).toEqual({});
  expect(errors).toEqual([]);
});
