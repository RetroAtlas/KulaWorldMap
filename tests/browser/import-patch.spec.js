import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { shown } from "./drafthelpers.js";
import { docOf, file, fixture, listed, opened, rows } from "./patchhelpers.js";
import { BLOCK_AT, description, planAll, ppf, vcdiff } from "../../public/js/format/patch.js";
import { readKwl, writeKwl } from "../../public/js/format/kwl.js";
import { streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { discs } from "../unit/fixtures.js";

const EDIT_MARS = "/#MARS/0/45,35/fit/33";
const SET = fixture.sets.find((s) => s.name === "across packs");
const IMAGE = syntheticImage();
const LISTED = ["LEVEL 2 (HIRO)", "FINAL 1 (HIRO)"];
const DRAFTS = [
  { title: "LEVEL 2", into: "/HIRO/HIRO.PAK#1" },
  { title: "TOWER", into: "/HIRO/HIROFI.PAK#0" },
];
const inflate = async (bytes) => new Uint8Array(inflateSync(bytes));
const toasts = (page) => page.locator("#toastStack .toast");
/** The blocks the page's reader gives a level written from a project, in a world. */
const blocksOf = (project, world) => readKwl(writeKwl(project), world).project.blocks;
/** The synthetic image with a byte of the PPF's block check changed, so no patch of the image was made for it. */
function another() {
  const image = Uint8Array.from(IMAGE);
  image[BLOCK_AT + 512] ^= 0xff;
  return image;
}

let patches;
test.beforeAll(async () => {
  const blob = new Blob([IMAGE]);
  const items = SET.items.map(({ pack, slot, blocks, title }) => ({
    pack,
    slot,
    stream: streamOf(synthetic(blocks, title)),
    title,
  }));
  const planned = await planAll(blob, items, inflate, discs);
  patches = {
    ppf: await ppf(blob, planned.writes, description(items.map((i) => i.title))),
    xdelta: await vcdiff(blob, planned.writes),
  };
});

/** The drafts this browser holds in the order they were made, each its title and slot. */
const made = async (page) =>
  (await listed(page)).sort((a, b) => a.id - b.id).map(({ title, into }) => ({ title, into }));

test("a PPF asks for the image it was made for and opens the levels it changes as drafts marked saved, on their slots", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("set.ppf", patches.ppf));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#fromPatchTitle")).toHaveText("Open levels from a patch");
  await expect(dialog.locator("#fromPatchName")).toHaveText("set.ppf");
  await expect(dialog.locator("#fromPatchSaid")).toHaveText("Kula World Map: Spiral, Tower");
  await expect(dialog.locator(".drop")).toBeVisible();
  await expect(dialog.locator("#fromPatchOver")).toBeHidden();
  await expect(dialog.locator("#fromPatchOpen")).toBeDisabled();
  await dialog.locator("#fromPatchImage").setInputFiles(file("image.bin", IMAGE));
  await expect(dialog.locator("#fromPatchSays")).toHaveText("The patch was made for this image.");
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await expect(dialog.locator("#fromPatchOpen")).toBeEnabled();
  await dialog.locator("#fromPatchOpen").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const on = await shown(page);
  expect(on).toMatchObject({ li: -1, theme: "HIRO" });
  expect(on.chip).toContain("LEVEL 2");
  expect(await made(page)).toEqual(DRAFTS);
  const all = (await listed(page)).sort((a, b) => a.id - b.id);
  expect(all[0].id).toBe(on.draft);
  for (const d of all) expect(d.saved).not.toBeNull();
  const [first, second] = await Promise.all(all.map((d) => docOf(page, d.id)));
  expect(first).toMatchObject({ world: "HIRO", simon: false });
  expect(first.blocks).toEqual(blocksOf(synthetic(6, "Spiral"), "HIRO"));
  expect(second).toMatchObject({ world: "HIRO" });
  expect(second.blocks).toEqual(blocksOf(synthetic(5, "Tower"), "HIRO"));
  await expect(toasts(page)).toHaveText(["Opened 2 levels from set.ppf."]);
  expect(errors).toEqual([]);
});

test("an xdelta opens the same levels, with no line on a block check", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("set.xdelta", patches.xdelta));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#fromPatchName")).toHaveText("set.xdelta");
  await expect(dialog.locator("#fromPatchSaid")).toBeHidden();
  await dialog.locator("#fromPatchImage").setInputFiles(file("image.bin", IMAGE));
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await expect(dialog.locator("#fromPatchSays")).toHaveText("");
  await dialog.locator("#fromPatchOpen").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  expect(await made(page)).toEqual(DRAFTS);
  await expect(toasts(page)).toHaveText(["Opened 2 levels from set.xdelta."]);
  expect(errors).toEqual([]);
});

test("cancelling the box opens nothing and says nothing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("set.ppf", patches.ppf));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await dialog.locator("#fromPatchImage").setInputFiles(file("image.bin", IMAGE));
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await dialog.locator("#fromPatchCancel").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#draftEmpty")).toBeVisible();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  const on = await shown(page);
  expect(on.draft).toBeUndefined();
  expect(on.theme).toBe("MARS");
  await expect(toasts(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a PPF given another image says so and keeps the chooser for the right one", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file("set.ppf", patches.ppf));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await dialog.locator("#fromPatchImage").setInputFiles(file("other.bin", another()));
  await expect(dialog.locator("#fromPatchSays")).toHaveText(
    "other.bin is not the image the patch was made for.",
  );
  await expect(dialog.locator("#fromPatchLevels li")).toHaveCount(0);
  await expect(dialog.locator("#fromPatchOpen")).toBeDisabled();
  await expect(dialog.locator(".drop")).toBeVisible();
  await dialog.locator("#fromPatchImage").setInputFiles(file("image.bin", IMAGE));
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await expect(dialog.locator("#fromPatchOpen")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("the disc box's picker takes a patch and adds a row for each level, on its slot", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await opened(page, "spiral.kula.json", synthetic(6));
  await page.locator("#draftPatch").click();
  const box = page.locator("#patch");
  await expect(box).toBeVisible();
  await expect(rows(box)).toHaveCount(1);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    box.locator("#patchAdd").selectOption("file"),
  ]);
  await chooser.setFiles(file("set.ppf", patches.ppf));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await expect(box).toBeHidden();
  await expect(dialog.locator(".drop")).toBeVisible();
  await dialog.locator("#fromPatchImage").setInputFiles(file("image.bin", IMAGE));
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await dialog.locator("#fromPatchOpen").click();
  await expect(dialog).toBeHidden();
  await expect(box).toBeVisible();
  await expect(rows(box)).toHaveCount(3);
  await expect(rows(box).locator(".name")).toHaveText(["Spiral", "LEVEL 2", "TOWER"]);
  await expect(box.locator("#patchSlot2")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(box.locator("#patchSlot3")).toHaveValue("/HIRO/HIROFI.PAK#0");
  await expect(box.locator("#patchAdd")).toBeFocused();
  await expect(toasts(page)).toHaveText(["Opened 2 levels from set.ppf."]);
  expect(errors).toEqual([]);
});

test("a patch reads over the image the disc box holds without asking for one", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT_MARS);
  await settle(page);
  await opened(page, "spiral.kula.json", synthetic(6));
  await page.locator("#draftPatch").click();
  const box = page.locator("#patch");
  await expect(box).toBeVisible();
  await box.locator("#patchDisc").setInputFiles(file("image.bin", IMAGE));
  await expect(box.locator("#patchStatus")).toHaveText(
    "image.bin is read, an image of the Roll Away disc.",
  );
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    box.locator("#patchAdd").selectOption("file"),
  ]);
  await chooser.setFiles(file("set.xdelta", patches.xdelta));
  const dialog = page.locator("#fromPatch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".drop")).toBeHidden();
  await expect(dialog.locator("#fromPatchOver")).toHaveText(
    "Read over image.bin, the image Put it on the disc holds.",
  );
  await expect(dialog.locator("#fromPatchLevels li")).toHaveText(LISTED);
  await dialog.locator("#fromPatchOpen").click();
  await expect(dialog).toBeHidden();
  await expect(box).toBeVisible();
  await expect(rows(box)).toHaveCount(3);
  await expect(box.locator("#patchSlot2")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(box.locator("#patchSlot3")).toHaveValue("/HIRO/HIROFI.PAK#0");
  await expect(box.locator("#patchStatus")).toHaveText(
    "image.bin is read, an image of the Roll Away disc.",
  );
  expect(errors).toEqual([]);
});
