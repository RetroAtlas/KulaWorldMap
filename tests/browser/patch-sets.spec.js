import { inflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { writeProject } from "../../public/js/format/project.js";
import { streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { readPak, writePak } from "../../public/js/format/pak.js";
import { openDisc } from "../../public/js/format/iso.js";
import { RECORD, writeKwl } from "../../public/js/format/kwl.js";
import {
  ADD,
  CASE,
  EDIT,
  FILE,
  WARNINGS,
  docOf,
  file,
  fixture,
  listed,
  openPatch,
  opened,
  rows,
  saved,
  sha256,
  shownDraft,
  toasts,
} from "./patchhelpers.js";

const [ONE_PACK, ACROSS] = fixture.sets;

const pak = () =>
  writePak(
    ["LEVEL 1", "LEVEL 2", "LEVEL 3"],
    [1, 2, 3].map((n) => streamOf(synthetic(n, `LEVEL ${n}`), 1)),
  );

/** The level a slot of the patched image holds, read as the game reads it. */
const slotOf = async (image, pack, slot) => {
  const pak = readPak(await (await openDisc(new Blob([image]))).readFile(pack));
  return { names: pak.names, level: inflateSync(pak.streams[slot]) };
};

test("two drafts go onto the disc as one patch, the second added from the select, as the fixture's set in one pack", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await page.goto(EDIT);
  await settle(page);
  const tower = await opened(page, "tower.kula.json", synthetic(30, "Tower"));
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  await page.locator("#draftPatch").click();
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const level = rows(dialog);
  await expect(level).toHaveCount(1);
  await expect(level.first().locator(".name")).toHaveText("Spiral");
  const add = dialog.locator("#patchAdd");
  await expect(add).toBeEnabled();
  await expect(add.locator("option")).toHaveText([ADD, "Tower", FILE]);
  await expect(add.locator("option").nth(1)).toHaveAttribute("value", String(tower));
  await expect(add).toHaveValue("");

  await add.selectOption(String(tower));
  await expect(level).toHaveCount(2);
  await expect(add).toHaveValue("");
  await expect(add).toBeEnabled();
  await expect(add.locator("option")).toHaveText([ADD, FILE]);
  const second = level.nth(1);
  await expect(second.locator(".name")).toHaveText("Tower");
  await expect(second.locator(".plays")).toHaveText("Plays as an arcade level.");
  await expect(second.locator(".checks .errors")).toHaveCount(0);
  await expect(second.locator("select")).toHaveAttribute("id", "patchSlot2");
  await expect(second.locator(".room")).toHaveAttribute("id", "patchFit2");
  await expect(second.locator(".room")).toHaveAttribute("aria-live", "polite");
  await expect(second.locator(".out")).toHaveText("take out");
  await expect(dialog.locator("#patchSlot")).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(second.locator("select")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(second.locator(".reach")).toHaveText(
    /^It takes LEVEL 2's place, reached with a save that has got that far in .+\.$/,
  );
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is rebuilt to make room, with 1127 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(second.locator(".room")).toHaveText(
    "The pack is rebuilt to make room, with 806 bytes to spare, so the patch carries its other levels too.",
  );
  expect((await docOf(page, spiral)).into).toBeUndefined();
  expect((await docOf(page, tower)).into).toBeUndefined();

  // the second's slot chosen: the first, still on its default, keeps the first free slot
  await second.locator("select").selectOption("/HIRO/HIRO.PAK#2");
  expect((await docOf(page, tower)).into).toBe("/HIRO/HIRO.PAK#2");
  await expect(dialog.locator("#patchSlot")).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(second.locator(".room")).toHaveText(
    "The pack is rebuilt to make room, with 889 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(dialog.locator("#patchClash p")).toHaveCount(0);

  // both on one slot: an error until a slot changes, the patches kept back, the
  // first row fitted alone from the layout and the later one showing no fit
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#2");
  await expect(dialog.locator("#patchClash p")).toHaveText([
    "error: two levels take LEVEL 3's place",
  ]);
  expect((await docOf(page, spiral)).into).toBe("/HIRO/HIRO.PAK#2");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 176 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText("");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Give each level a slot of its own above.",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 176 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText("");

  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchClash p")).toHaveCount(0);
  expect((await docOf(page, spiral)).into).toBe("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText(
    "The pack is rebuilt to make room, with 525 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  await expect(dialog.locator("#patchReady")).toHaveText("Save what your emulator wants.");
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText(
    '"spiral-and-1-more.xdelta" "spiral-and-1-more.bin"',
  );

  // a clash made once the image is placed: the fits come from the layout again, not
  // from the last placing, and the placing comes back when the clash goes
  await second.locator("select").selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchClash p")).toHaveText([
    "error: two levels take LEVEL 2's place",
  ]);
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Give each level a slot of its own above.",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await expect(dialog.locator("#patchWarnings li")).toHaveCount(0);
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 93 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText("");
  await second.locator("select").selectOption("/HIRO/HIRO.PAK#2");
  await expect(dialog.locator("#patchClash p")).toHaveCount(0);
  expect((await docOf(page, tower)).into).toBe("/HIRO/HIRO.PAK#2");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText(
    "The pack is rebuilt to make room, with 525 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  await expect(dialog.locator("#patchReady")).toHaveText("Save what your emulator wants.");
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(patch.name).toBe("spiral-and-1-more.ppf");
  expect(sha256(patch.bytes)).toBe(ONE_PACK.ppf);
  expect(patch.bytes.subarray(6, 56).toString("latin1").trimEnd()).toBe(
    "Kula World Map: Spiral, Tower",
  );
  const delta = await saved(page, dialog.locator("#patchXdelta"));
  expect(delta.name).toBe("spiral-and-1-more.xdelta");
  expect(sha256(delta.bytes)).toBe(ONE_PACK.xdelta);
  const image = await saved(page, dialog.locator("#patchImage"));
  expect(image.name).toBe("spiral-and-1-more.bin");
  expect(sha256(image.bytes)).toBe(ONE_PACK.patched);
  const one = await slotOf(image.bytes, "/HIRO/HIRO.PAK", 1);
  expect(one.names).toEqual(["LEVEL 1", "LEVEL 2", "TOWER"]);
  expect(one.level).toEqual(Buffer.from(writeKwl(synthetic(6))));
  expect((await slotOf(image.bytes, "/HIRO/HIRO.PAK", 2)).level).toEqual(
    Buffer.from(writeKwl(synthetic(30, "Tower"))),
  );
  const sheet = await saved(page, dialog.locator("#patchCue"));
  expect(sheet.name).toBe("spiral-and-1-more.cue");
  expect(sheet.bytes.toString("utf8").split("\n")[0]).toBe('FILE "spiral-and-1-more.bin" BINARY');

  await second.locator(".out").click();
  await expect(level).toHaveCount(1);
  await expect(level.first().locator(".name")).toHaveText("Spiral");
  await expect(add).toBeEnabled();
  await expect(add.locator("option")).toHaveText([ADD, "Tower", FILE]);
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText(
    '"spiral.xdelta" "spiral.bin"',
  );
  const alone = await saved(page, dialog.locator("#patchPpf"));
  expect(alone.name).toBe("spiral.ppf");
  expect(sha256(alone.bytes)).toBe(CASE.ppf);

  await level.first().locator(".out").click();
  await expect(level).toHaveCount(0);
  await expect(dialog.locator("#patchReady")).toHaveText("Add a level above to make the patches.");
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await expect(add).toBeFocused();
  expect((await add.locator("option").allTextContents()).sort()).toEqual(
    [ADD, "Spiral", "Tower", FILE].sort(),
  );
  await add.selectOption(String(spiral));
  await expect(level).toHaveCount(1);
  await expect(dialog.locator("#patchSlot")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a level in a world pack and another in its finals pack go on as one patch, as the fixture's set across packs", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await page.goto(EDIT);
  await settle(page);
  const tower = await opened(page, "tower.kula.json", synthetic(5, "Tower"));
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, spiral);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const level = rows(dialog);
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchAdd").selectOption(String(tower));
  const second = level.nth(1);
  await expect(second.locator("select")).toHaveValue("/HIRO/HIRO.PAK#0");
  await second.locator("select").selectOption("/HIRO/HIROFI.PAK#0");
  await expect(second.locator(".reach")).toHaveText(
    /^It takes FINAL 1's place among .+'s finals, reached once the arcade is finished\.$/,
  );
  await expect(second.locator("#patchMode2")).toHaveText("");
  await expect(second.locator("#patchWear2")).toHaveText("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 93 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText(
    "It fits in the slot's own bytes, with 641 bytes to spare.",
  );
  expect((await docOf(page, tower)).into).toBe("/HIRO/HIROFI.PAK#0");

  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(second.locator(".room")).toHaveText(
    "The pack is rebuilt to make room, with 1454 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(patch.name).toBe("spiral-and-1-more.ppf");
  expect(sha256(patch.bytes)).toBe(ACROSS.ppf);
  const delta = await saved(page, dialog.locator("#patchXdelta"));
  expect(sha256(delta.bytes)).toBe(ACROSS.xdelta);
  const image = await saved(page, dialog.locator("#patchImage"));
  expect(sha256(image.bytes)).toBe(ACROSS.patched);
  expect((await slotOf(image.bytes, "/HIRO/HIRO.PAK", 1)).level).toEqual(
    Buffer.from(writeKwl(synthetic(6))),
  );
  const finals = await slotOf(image.bytes, "/HIRO/HIROFI.PAK", 0);
  expect(finals.names).toEqual(["TOWER", "FINAL 2"]);
  expect(finals.level).toEqual(Buffer.from(writeKwl(synthetic(5, "Tower"))));
  expect(errors).toEqual([]);
});

test("a level added from a file is a saved draft of Your levels and a row on the slot its file names, and a file that holds no level is refused with one toast", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await page.goto(EDIT);
  await settle(page);
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, spiral);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const level = rows(dialog);
  const add = dialog.locator("#patchAdd");
  const picker = dialog.locator("#patchFile");
  const yours = page.locator("#draftRows button");
  await expect(add).toBeEnabled();
  await expect(add.locator("option")).toHaveText([ADD, FILE]);
  await expect(picker).toBeHidden();
  await expect(picker).toHaveAttribute(
    "accept",
    await page.locator("#draftFile").getAttribute("accept"),
  );

  // the last entry opens the box's own picker, and the select returns to its prompt
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), add.selectOption("file")]);
  expect(await chooser.element().getAttribute("id")).toBe("patchFile");
  await expect(add).toHaveValue("");
  await chooser.setFiles(
    file("tower.kula.json", writeProject({ ...synthetic(30, "Tower"), into: "/HIRO/HIRO.PAK#2" })),
  );
  await expect(level).toHaveCount(2);
  const second = level.nth(1);
  await expect(second.locator(".name")).toHaveText("Tower");
  await expect(second.locator("select")).toHaveValue("/HIRO/HIRO.PAK#2");
  await expect(second.locator(".reach")).toHaveText(
    /^It takes LEVEL 3's place, reached with a save that has got that far in .+\.$/,
  );
  await expect(dialog.locator("#patchSlot")).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(add.locator("option")).toHaveText([ADD, FILE]);
  await expect(add).toBeFocused();
  await expect(yours).toHaveCount(2);
  await expect(yours.filter({ hasText: "Tower" }).locator(".state")).toHaveText("saved to a file");
  const tower = (await listed(page)).find((d) => d.title === "Tower");
  expect(tower).toMatchObject({ into: "/HIRO/HIRO.PAK#2", edits: 0 });
  expect(tower.saved).toBeGreaterThan(0);
  expect(await shownDraft(page)).toBe(spiral);
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  expect(await toasts(page)).toEqual([]);

  await picker.setInputFiles(file("other.json", JSON.stringify({ hello: 1, blocks: [] })));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That file is not one of the map's level files.",
  ]);
  await expect(dialog).toBeVisible();
  await expect(level).toHaveCount(2);
  await expect(yours).toHaveCount(2);
  await picker.setInputFiles(file("noise.kwl", new Uint8Array(1000).fill(7)));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That file is neither one of the map's level files nor a level file of the game.",
    "That file is not one of the map's level files.",
  ]);
  await expect(level).toHaveCount(2);
  await expect(yours).toHaveCount(2);

  // the two rows are the fixture's set once the first takes its slot
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(patch.name).toBe("spiral-and-1-more.ppf");
  expect(sha256(patch.bytes)).toBe(ONE_PACK.ppf);
  expect(errors).toEqual([]);
});

test("a pack added from a file asks which level in the box's place, and the box comes back with the answer", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, spiral);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const level = rows(dialog);
  const picker = dialog.locator("#patchFile");
  const question = page.locator("#import");
  const yours = page.locator("#draftRows button");

  // declined: nothing opens, and the box is back as it was
  await picker.setInputFiles(file("custom.pak", pak()));
  await expect(question).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(question.locator("#importTitle")).toHaveText("Open a level from a pack");
  await question.locator("#importCancel").click();
  await expect(question).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(level).toHaveCount(1);
  await expect(yours).toHaveCount(1);
  await expect(dialog.locator("#patchAdd")).toBeFocused();
  expect(await toasts(page)).toEqual([]);

  // answered: the level is a saved draft and a row, read in the world on screen
  await picker.setInputFiles(file("custom.pak", pak()));
  await expect(question).toBeVisible();
  await expect(dialog).toBeHidden();
  await question.locator("#importSlot").selectOption({ index: 1 });
  await question.locator("#importOpen").click();
  await expect(question).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(level).toHaveCount(2);
  await expect(level.nth(1).locator(".name")).toHaveText("LEVEL 2");
  await expect(level.nth(1).locator("select")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(level.nth(1).locator("#patchMode2")).toHaveText("");
  await expect(level.nth(1).locator("#patchWear2")).toHaveText("");
  await expect(yours).toHaveCount(2);
  const second = (await listed(page)).find((d) => d.title === "LEVEL 2");
  expect(second.saved).toBeGreaterThan(0);
  expect(await shownDraft(page)).toBe(spiral);
  expect(await toasts(page)).toEqual([]);

  // what the reader repaired is said once
  await picker.setInputFiles(file("cut.kwl", writeKwl(synthetic(5, "Cut")).slice(0, -RECORD)));
  await expect(level).toHaveCount(3);
  await expect(level.nth(2).locator(".name")).toHaveText("cut");
  await expect(level.nth(2).locator("select")).toHaveValue("/HIRO/HIRO.PAK#2");
  await expect(page.locator("#toastStack .toast")).toHaveText([/^no trailer/]);
  await expect(yours).toHaveCount(3);

  // the box that came back stands on an entry of its own, which closing spends
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state?.dialog ?? null)).toBeNull();
  expect(errors).toEqual([]);
});
