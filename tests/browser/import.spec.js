import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { FILE_MOST } from "../../public/js/files.js";
import { writePak } from "../../public/js/pak.js";
import { record } from "../../public/js/iso.js";
import { EOF_SUBMODE, SECTOR_RAW, USER, sector } from "../../public/js/sectors.js";
import { projectOf, readKwl, writeKwl } from "../../public/js/kwl.js";
import { mapData, levelKey } from "../unit/fixtures.js";
import {
  CNF,
  CNF_AT,
  ROOM_AT,
  ROOM_SECTORS,
  ROOT_AT,
  SYNTHETIC_SECTORS,
  WORLD_AT,
  streamOf,
  synthetic,
  syntheticImage,
} from "../unit/synthetic.js";

const EDIT_MARS = "/?edit#MARS/0/45,35/fit/33";
const orbit = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/orbit-levels.json", import.meta.url)), "utf8"),
);
const file = (name, data) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(data),
});
const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return {
      li: state.li,
      draft: state.lvl.draft,
      theme: state.lvl.theme,
      chip: document.getElementById("chipLine").textContent,
    };
  });
const entryOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/drafts.js", location.href).href);
    return get(id);
  }, id);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
/** Wait for a closed dialog's history entry to have been given back. */
const unstood = (page) =>
  expect.poll(() => page.evaluate(() => history.state?.dialog ?? null)).toBeNull();
/** The blocks the page's reader gives a level written from a project, in a world. */
const blocksOf = (project, world) => readKwl(writeKwl(project), world).project.blocks;
const pak = () =>
  writePak(
    ["LEVEL 1", "LEVEL 2", "LEVEL 3"],
    [1, 2, 3].map((n) => streamOf(synthetic(n, `LEVEL ${n}`), 1)),
  );

const padded = (bytes) => {
  const out = new Uint8Array(USER);
  out.set(bytes);
  return out;
};
const concat = (parts) => Buffer.concat(parts.map((p) => Buffer.from(p)));

/** The synthetic image with a directory the disc has not, MODS, holding a pack of one level. */
function imageWithMods() {
  const DIR_AT = SYNTHETIC_SECTORS;
  const PAK_AT = DIR_AT + 1;
  const mods = writePak(["MY LEVEL"], [streamOf(synthetic(2, "MY LEVEL"))]);
  const root = concat([
    record("\0", ROOT_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    record("3.00;1", ROOM_AT, ROOM_SECTORS * USER),
    record("HIRO", WORLD_AT, USER, 2),
    record("MODS", DIR_AT, USER, 2),
    record("SYSTEM.CNF;1", CNF_AT, CNF.length),
  ]);
  const dir = concat([
    record("\0", DIR_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    record("MODS.PAK;1", PAK_AT, mods.length),
  ]);
  const image = concat([
    syntheticImage(),
    sector(DIR_AT, padded(dir), EOF_SUBMODE),
    sector(PAK_AT, padded(mods), EOF_SUBMODE),
  ]);
  image.set(sector(ROOT_AT, padded(root), EOF_SUBMODE), ROOT_AT * SECTOR_RAW);
  return image;
}

test("a pack asks which level to open, and opens it under its name in the world on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  const rows = page.locator("#draftRows button");
  await page.locator("#draftFile").setInputFiles(file("custom.pak", pak()));
  const dialog = page.locator("#import");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#importTitle")).toHaveText("Open a level from a pack");
  await expect(dialog.locator("#importPack")).toBeHidden();
  await expect(dialog.locator("#importSlot option")).toHaveText(["LEVEL 1", "LEVEL 2", "LEVEL 3"]);
  await expect(dialog.locator("#importNote")).toContainText("the world on screen");
  await expect(dialog.locator("#importSlot")).toBeFocused();
  await dialog.locator("#importSlot").selectOption({ index: 1 });
  await dialog.locator("#importOpen").click();
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);
  const opened = await shown(page);
  expect(opened).toMatchObject({ li: -1, theme: "MARS" });
  expect(opened.chip).toContain("LEVEL 2");
  const entry = await entryOf(page, opened.draft);
  expect(entry.doc).toMatchObject({ title: "LEVEL 2", world: "MARS", time: 99 });
  expect(entry.doc.blocks).toEqual(blocksOf(synthetic(2, "LEVEL 2"), "MARS"));
  expect(entry.saved).toBeGreaterThan(0);
  await expect(rows.locator(".state")).toHaveText("saved to a file");
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a disc image lists its packs and opens the chosen slot in the pack's own world", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  const rows = page.locator("#draftRows button");
  await page.locator("#draftFile").setInputFiles(file("image.bin", syntheticImage()));
  const dialog = page.locator("#import");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#importTitle")).toHaveText("Open a level from a disc");
  await expect(dialog.locator("#importPack")).toBeVisible();
  const packs = dialog.locator("#importPack option");
  await expect(packs).toHaveCount(2);
  await expect(packs.nth(0)).toContainText("HIRO.PAK");
  await expect(packs.nth(1)).toContainText("HIROFI.PAK");
  await expect(dialog.locator("#importSlot option")).toHaveText(["LEVEL 1", "LEVEL 2", "LEVEL 3"]);
  await expect(dialog.locator("#importNote")).toContainText(
    "A level opens in the world its pack belongs to,",
  );
  await dialog.locator("#importPack").selectOption({ index: 1 });
  await expect(dialog.locator("#importSlot option")).toHaveText(["FINAL 1", "FINAL 2"]);
  await dialog.locator("#importSlot").selectOption({ index: 1 });
  await dialog.locator("#importSlot").press("Enter");
  await expect(dialog).toBeHidden();
  await expect(rows).toHaveCount(1);
  const opened = await shown(page);
  expect(opened).toMatchObject({ li: -1, theme: "HIRO" });
  expect(opened.chip).toContain("FINAL 2");
  const entry = await entryOf(page, opened.draft);
  expect(entry.doc).toMatchObject({ title: "FINAL 2", world: "HIRO" });
  expect(entry.doc.blocks).toEqual(blocksOf(synthetic(5, "FINAL 5"), "HIRO"));
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a pack under none of the disc's worlds opens in the world on screen, and the note says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("modded.bin", imageWithMods()));
  const dialog = page.locator("#import");
  await expect(dialog).toBeVisible();
  const packs = dialog.locator("#importPack option");
  await expect(packs).toHaveText(["HIRO.PAK (HIRO)", "HIROFI.PAK (HIRO)", "MODS.PAK"]);
  await dialog.locator("#importPack").selectOption({ index: 2 });
  await expect(dialog.locator("#importSlot option")).toHaveText(["MY LEVEL"]);
  await expect(dialog.locator("#importNote")).toHaveText(
    "This pack lies under none of the disc's worlds, so the level opens with MARS's artwork, the world on screen. The Level card's World changes it.",
  );
  await dialog.locator("#importPack").selectOption({ index: 0 });
  await expect(dialog.locator("#importNote")).toHaveText(
    "A level opens in the world its pack belongs to, HIRO.",
  );
  await dialog.locator("#importPack").selectOption({ index: 2 });
  await dialog.locator("#importOpen").click();
  await expect(dialog).toBeHidden();
  const opened = await shown(page);
  expect(opened).toMatchObject({ li: -1, theme: "MARS" });
  expect(opened.chip).toContain("MY LEVEL");
  const entry = await entryOf(page, opened.draft);
  expect(entry.doc).toMatchObject({ title: "MY LEVEL", world: "MARS" });
  expect(entry.doc.blocks).toEqual(blocksOf(synthetic(2, "MY LEVEL"), "MARS"));
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("declining the question opens nothing and says nothing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  const rows = page.locator("#draftRows button");
  const dialog = page.locator("#import");
  await page.locator("#draftFile").setInputFiles(file("custom.pak", pak()));
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.locator("#draftFile").setInputFiles(file("custom.pak", pak()));
  await expect(dialog).toBeVisible();
  await dialog.locator("#importCancel").click();
  await expect(dialog).toBeHidden();
  await page.locator("#draftFile").setInputFiles(file("image.bin", syntheticImage()));
  await expect(dialog).toBeVisible();
  await dialog.locator(".x").click();
  await expect(dialog).toBeHidden();
  await unstood(page);
  await expect(rows).toHaveCount(0);
  expect(await toasts(page)).toEqual([]);
  expect((await shown(page)).draft).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a level file of the community's viewer opens as the level it holds, in the world on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  const [n, c] = Object.entries(orbit.levels)[0];
  await page.locator("#draftFile").setInputFiles(file(`viewer-${n}.json`, JSON.stringify(c.json)));
  const rows = page.locator("#draftRows button");
  await expect(rows).toHaveCount(1);
  const opened = await shown(page);
  expect(opened).toMatchObject({ li: -1, theme: "MARS" });
  expect(opened.chip).toContain(`viewer-${n}`);
  const entry = await entryOf(page, opened.draft);
  const own = projectOf(mapData.levels.find((l) => levelKey(l) === c.level));
  expect(entry.doc).toMatchObject({ title: `viewer-${n}`, world: "MARS", time: own.time });
  expect(entry.doc.blocks).toEqual(own.blocks);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator("#draftCard .report")).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** A disc image of 2048-byte sectors, the form a .iso or .img rip takes. */
function isoForm(sectors = 17) {
  const out = new Uint8Array(2048 * sectors);
  out.set(Buffer.from("CD001"), 16 * 2048 + 1);
  return out;
}

test("a rip of 2048-byte sectors, a cue sheet and a file far too large are each told what they are", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  const toast = page.locator("#toastStack .toast");
  const refused = async (name, data, sentence) => {
    await page.locator("#draftFile").setInputFiles(file(name, data));
    await expect(toast.first()).toHaveText(sentence);
  };
  await refused(
    "rip.iso",
    isoForm(),
    "That file is a disc image of 2048-byte sectors; the map reads the raw image of 2352-byte sectors, the .bin a .cue names.",
  );
  await refused(
    "Roll Away.cue",
    'FILE "Roll Away.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n',
    "That file is a cue sheet; open the disc image it names, the .bin beside it.",
  );
  await refused(
    "huge.dat",
    new Uint8Array(FILE_MOST + 1),
    "That file is far larger than any level file, and it does not read as a disc image.",
  );
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a browser that cannot unpack the game's files is told so, for a pack and for an image", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.DecompressionStream;
  });
  await page.goto(EDIT_MARS);
  await settle(page);
  const dialog = page.locator("#import");
  const toast = page.locator("#toastStack .toast");
  const sentence =
    "Opening a level from a pack needs a newer browser, one that can unpack the game's files.";
  await page.locator("#draftFile").setInputFiles(file("custom.pak", pak()));
  await expect(dialog).toBeVisible();
  await dialog.locator("#importOpen").click();
  await expect(dialog).toBeHidden();
  await expect(toast).toHaveText([sentence]);
  await expect(toast).toHaveCount(0, { timeout: 6000 });
  await page.locator("#draftFile").setInputFiles(file("image.bin", syntheticImage()));
  await expect(dialog).toBeVisible();
  await dialog.locator("#importOpen").click();
  await expect(dialog).toBeHidden();
  await expect(toast).toHaveText([sentence]);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a file that is none of these is still refused with one toast", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("sectors.bin", new Uint8Array(2352 * 17)));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That file is neither a level of the map's nor one of the game's.",
  ]);
  await page
    .locator("#draftFile")
    .setInputFiles(file("almost.pak", Uint8Array.of(1, 0, 0, 0, 1, 2, 3)));
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "That file is neither a level of the map's nor one of the game's.",
  );
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});
