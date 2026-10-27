import { expect, test } from "@playwright/test";
import { settle, steps, trackErrors } from "./helpers.js";
import { writeProject } from "../../public/js/format/project.js";
import { SLUG_MOST } from "../../public/js/editor/files.js";
import { synthetic, syntheticImage } from "../unit/synthetic.js";
import { annotations, mapData } from "../unit/fixtures.js";
import { EXIT } from "../../public/js/format/kwl.js";
import {
  ADD,
  CASE,
  EDIT,
  FILE,
  WARNINGS,
  docOf,
  elsewhere,
  file,
  openPatch,
  opened,
  rows,
  saved,
  sha256,
  shownDraft,
  stored,
  toasts,
} from "./patchhelpers.js";

const FIFTH = "/#HIRO/4/45,35/fit/33";

/** The key of the slot whose level the pause screen titles so. */
const keyOf = (title) => {
  const l = mapData.levels.find((l) => (l.shown || l.name) === title);
  return `${l.pack}#${l.index}`;
};

test("the draft goes onto the disc as the fixture's bytes, the slot kept on the draft", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await page.locator("#draftPatch").click();
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  for (const live of ["#patchFit", "#patchStatus", "#patchReady"])
    await expect(dialog.locator(live)).toHaveAttribute("aria-live", "polite");
  await expect(dialog.locator(".name")).toHaveText("Spiral");
  await expect(dialog.locator("#patchPlays")).toHaveText("Plays as an arcade level.");
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  await expect(dialog.locator("#patchChecks details summary")).toHaveText("1 warning");
  await expect(dialog.locator("#patchChecks details li")).toHaveText([
    "warning: a key and no exit",
  ]);

  const slot = dialog.locator("#patchSlot");
  const options = slot.locator("option");
  await expect(options).toHaveCount(230);
  expect(
    await options.evaluateAll((os) => os.filter((o) => o.value.includes("COPYCAT")).length),
  ).toBe(10);
  expect(await slot.locator("optgroup").count()).toBe(11);
  await expect(slot).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(options.first()).toHaveText("LEVEL 1");
  await expect(dialog.locator("#patchReach")).toHaveText(
    "It takes LEVEL 1's place, where a new game starts.",
  );
  await expect(dialog.locator("#patchWear")).toHaveText("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is rebuilt to make room, with 1127 bytes to spare, so the patch carries its other levels too.",
  );
  await expect(dialog.locator("#patchPrivate")).toHaveText(
    "Read in your browser; nothing is uploaded.",
  );
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  const playing = dialog.locator("#patchPlaying");
  await expect(playing).toBeHidden();
  expect((await docOf(page, id)).into).toBeUndefined();
  expect((await steps(page, id)).past).toBe(0);

  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 93 bytes to spare.",
  );
  await expect(dialog.locator("#patchReach")).toHaveText(
    /^It takes LEVEL 2's place, reached with a save that has got that far in .+\.$/,
  );
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  await slot.selectOption("/MARS/MARSFI.PAK#1");
  await expect(dialog.locator("#patchReach")).toHaveText(
    /^It takes FINAL 18's place among .+'s finals, reached once the arcade is finished\.$/,
  );
  await expect(dialog.locator("#patchWear")).toContainText("artwork there.");
  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchWear")).toHaveText("");
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  expect((await steps(page, id)).past).toBe(1);

  const drop = dialog.locator(".drop");
  const disc = dialog.locator("#patchDisc");
  await expect(drop).toHaveText("Drop the disc image here, or choose it");
  await expect(disc).toBeVisible();
  expect((await disc.boundingBox()).height).toBeGreaterThan(1);
  await slot.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.locator("#patchAdd")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.locator("#patchClear")).toBeFocused();
  for (const id of ["us", "eu", "jp"]) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(`#patchDiscs button[data-release="${id}"]`)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(disc).toBeFocused();

  await disc.setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(disc).toHaveValue(/synthetic\.bin$/);
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  await expect(disc).toHaveValue(/synthetic\.bin$/);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), disc.click()]);
  expect(await chooser.element().getAttribute("id")).toBe("patchDisc");
  await expect(disc).toHaveValue("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(dialog.locator("#patchFrom")).toHaveCount(0);
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeEnabled();
  await expect(playing).toBeVisible();
  await expect(playing.locator("h4")).toHaveText("Playing it");
  const play = dialog.locator("#patchPlay li");
  await expect(play).toHaveCount(3);
  await expect(play.nth(0)).toContainText("synthetic.ppf");
  await expect(play.nth(1)).toHaveText(
    "ePSXe and PCSX-ReARMed read it from their patches folder as SLUS_007.24, with no extension",
  );
  await expect(play.nth(2)).toContainText(
    'xdelta3 -d -s "synthetic.bin" "spiral.xdelta" "spiral.bin"',
  );
  await expect(playing.locator(".sub")).toHaveText(
    "Mednafen, Beetle and RetroArch apply no patch and play the patched disc instead.",
  );

  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(patch.name).toBe("spiral.ppf");
  expect(sha256(patch.bytes)).toBe(CASE.ppf);
  const delta = await saved(page, dialog.locator("#patchXdelta"));
  expect(delta.name).toBe("spiral.xdelta");
  expect(sha256(delta.bytes)).toBe(CASE.xdelta);
  const image = await saved(page, dialog.locator("#patchImage"));
  expect(image.name).toBe("spiral.bin");
  expect(image.bytes.length).toBe(syntheticImage().length);
  expect(sha256(image.bytes)).toBe(CASE.patched);
  const sheet = await saved(page, dialog.locator("#patchCue"));
  expect(sheet.name).toBe("spiral.cue");
  expect(sheet.bytes.toString("utf8")).toBe(
    'FILE "spiral.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n',
  );

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openPatch(page, id);
  await expect(dialog).toBeVisible();
  await expect(slot).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(playing).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("a level with an error shows it and keeps the patches back, image or no image", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const broken = synthetic(6, "No start");
  delete broken.blocks[0].faces;
  const id = await opened(page, "no-start.kula.json", broken);
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#patchChecks .errors li")).toHaveText(["error: no start"]);
  await expect(dialog.locator("#patchChecks")).toContainText(
    "A level with errors cannot go on the disc until they are fixed.",
  );
  await expect(dialog.locator("#patchFit")).toContainText("to spare.");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "A level with errors cannot go on the disc until they are fixed.",
  );
  await dialog.locator(".x").click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test("a level the checks pass says it has no warnings, in no fold and with no error", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const clean = synthetic(6, "Clean");
  clean.blocks[0].faces[1] = { type: EXIT };
  const id = await opened(page, "clean.kula.json", clean);
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const checks = dialog.locator("#patchChecks");
  await expect(checks).toHaveText("no warnings");
  await expect(checks.locator("p")).toHaveClass("sub");
  await expect(checks.locator("details")).toHaveCount(0);
  await expect(checks.locator(".errors")).toHaveCount(0);
  await expect(dialog.locator("#patchFit")).toContainText("bytes to spare");
  expect(errors).toEqual([]);
});

test("a row's slot select and the add select draw the page's own chevron, the same way", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const slot = dialog.locator("#patchSlot");
  const add = dialog.locator("#patchAdd");
  for (const select of [slot, add]) {
    await expect(select).toHaveCSS("appearance", "none");
    await expect(select).toHaveCSS("background-image", /^url\("data:image\/svg\+xml/);
  }
  const chevron = (select) =>
    select.evaluate((e) => {
      const s = getComputedStyle(e);
      return [
        s.backgroundImage,
        s.backgroundPosition,
        s.backgroundSize,
        s.backgroundRepeat,
        s.paddingRight,
      ];
    });
  expect(await chevron(slot)).toEqual(await chevron(add));
  expect(errors).toEqual([]);
});

test("without the game's face table the checks still run, the table is said to be missing and the patches stay back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.route("**/objects.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(EDIT);
  await settle(page);
  const missing =
    "The game's face table could not be loaded, so the checks cannot run in full and the level cannot go on the disc from here.";
  const broken = synthetic(6, "No start");
  delete broken.blocks[0].faces;
  const id = await opened(page, "no-start.kula.json", broken);
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog.locator("#patchChecks .errors li")).toHaveText(["error: no start"]);
  await expect(dialog.locator("#patchChecks")).toContainText(missing);
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "A level with errors cannot go on the disc until they are fixed.",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const clean = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, clean);
  await expect(dialog).toBeVisible();
  await expect(rows(dialog)).toHaveCount(2);
  await rows(dialog).first().locator(".out").click();
  await expect(rows(dialog)).toHaveCount(1);
  await expect(dialog.locator(".name")).toHaveText("Spiral");
  await expect(dialog.locator("#patchChecks .errors li")).toHaveCount(0);
  await expect(dialog.locator("#patchChecks")).toContainText(missing);
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(missing);
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  expect(errors).toEqual([
    "console: Failed to load resource: the server responded with a status of 404 (Not Found)",
  ]);
});

test("a download is named by the title's slug, composed, lower-cased and cut to a length", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const title = `E\u0301pe\u0301e, a\u0300 la mode!! ${"x".repeat(59)}`;
  const id = await opened(page, "epee.kula.json", synthetic(6, title));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  const patch = await saved(page, dialog.locator("#patchPpf"));
  const stem = patch.name.replace(/\.ppf$/, "");
  expect(stem.normalize("NFC")).toBe(stem);
  expect(stem.startsWith("\u00e9p\u00e9e-\u00e0-la-mode-xxxx")).toBe(true);
  expect(stem.length).toBeLessThanOrEqual(SLUG_MOST);
  expect(stem.endsWith("-")).toBe(false);
  expect(errors).toEqual([]);
});

test("an image dropped beside the box is taken rather than opened in the tab", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const prevented = await page.evaluate((b64) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "dropped.bin"));
    const overlay = document.getElementById("patch");
    return ["dragover", "drop"].map((type) => {
      const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data });
      overlay.dispatchEvent(e);
      return e.defaultPrevented;
    });
  }, Buffer.from(syntheticImage()).toString("base64"));
  expect(prevented).toEqual([true, true]);
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "dropped.bin is read, an image of the Roll Away disc.",
  );
  expect(
    await dialog.locator("#patchDisc").evaluate((i) => [...i.files].map((f) => f.name)),
  ).toEqual(["dropped.bin"]);
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a row opens on the slot its title names, else where its copy came from, and never on a slot another row has", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(FIFTH);
  await settle(page);
  const dialog = page.locator("#patch");
  const level = rows(dialog);
  const slot = dialog.locator("#patchSlot");
  const title = page.locator("#draftTitle");
  const chip = page.locator("#chipLine b");
  const hundredAndOne = keyOf("LEVEL 101");
  /** The box opened for the draft alone shows its row on this slot, and closes again emptied. */
  const opensOn = async (id, key, name) => {
    await openPatch(page, id);
    await expect(dialog).toBeVisible();
    await expect(level).toHaveCount(1);
    await expect(slot).toHaveValue(key);
    await expect(dialog.locator("#patchReach")).toContainText(`It takes ${name}'s place`);
    await dialog.locator("#patchClear").click();
    await expect(level).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  };

  // a copy of LEVEL 5 goes where it came from until its title names a slot
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect.poll(() => shownDraft(page)).not.toBeUndefined();
  const copy = await shownDraft(page);
  expect(await docOf(page, copy)).toMatchObject({ title: "LEVEL 5", from: "/HIRO/HIRO.PAK#4" });
  await title.fill("Spiral");
  await expect(chip).toHaveText("Spiral");
  await opensOn(copy, "/HIRO/HIRO.PAK#4", "LEVEL 5");
  await title.fill("Bonus 3");
  await expect(chip).toHaveText("Bonus 3");
  await opensOn(copy, "/HIRO/HIRO.PAK#17", "BONUS 3");
  await title.fill("My level 101");
  await expect(chip).toHaveText("My level 101");
  await opensOn(copy, hundredAndOne, "LEVEL 101");
  expect((await docOf(page, copy)).into).toBeUndefined();

  // a level from a file goes by its title, and by its target over its title
  await page
    .locator("#draftFile")
    .setInputFiles(file("remix.kula.json", writeProject(synthetic(6, "My level 101"))));
  await expect.poll(() => shownDraft(page)).not.toBe(copy);
  const titled = await shownDraft(page);
  await opensOn(titled, hundredAndOne, "LEVEL 101");
  const aimed = await opened(page, "aimed.kula.json", {
    ...synthetic(6, "Also my level 101"),
    into: "/HIRO/HIRO.PAK#1",
  });
  await opensOn(aimed, "/HIRO/HIRO.PAK#1", "LEVEL 2");
  const held = await opened(page, "held.kula.json", {
    ...synthetic(6, "Held"),
    into: hundredAndOne,
  });
  await opensOn(held, hundredAndOne, "LEVEL 101");

  // a slot another row has is not guessed, whichever row is first
  await openPatch(page, titled);
  await expect(dialog).toBeVisible();
  const add = dialog.locator("#patchAdd");
  await add.selectOption(String(held));
  await add.selectOption(String(copy));
  await add.selectOption(String(aimed));
  await expect(level).toHaveCount(4);
  await expect(slot).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(level.nth(1).locator("select")).toHaveValue(hundredAndOne);
  await expect(level.nth(2).locator("select")).toHaveValue("/HIRO/HIRO.PAK#4");
  await expect(level.nth(3).locator("select")).toHaveValue("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchClash p")).toHaveCount(0);
  for (const id of [copy, titled]) expect((await docOf(page, id)).into).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a Simon room's slot is listed last and names the room's world, a level that plays as a room takes the first free room, and the row says where the level and the slot disagree", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const rooms = mapData.levels
    .filter((l) => l.pack === "/HIRO/COPYCAT.PAK")
    .sort((a, b) => a.index - b.index);
  const worldOf = (id) => annotations.worlds?.[id]?.name || id;
  const roomLine = (i) =>
    `It takes ${rooms[i].shown || rooms[i].name}'s place, the room Simon mode plays in ${worldOf(rooms[i].theme)} on its first round.`;
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  const marked = await opened(page, "marked.kula.json", {
    ...synthetic(6, "Marked"),
    simon: true,
  });
  const loop = await opened(page, "loop.kula.json", { ...synthetic(2, "Loop"), simon: true });
  await openPatch(page, loop);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  const level = rows(dialog);
  const slot = dialog.locator("#patchSlot");
  const reach = dialog.locator("#patchReach");
  const mode = dialog.locator("#patchMode");
  const wear = dialog.locator("#patchWear");
  await expect(dialog.locator("#patchPlays")).toHaveText("Plays as a Simon room.");
  await expect(dialog.locator("#patchChecks .sub")).toHaveText("no warnings");
  const groups = slot.locator("optgroup");
  await expect(groups).toHaveCount(11);
  await expect(groups.last()).toHaveAttribute("label", "Simon rooms");
  await expect(groups.last().locator("option")).toHaveText(rooms.map((l) => l.shown || l.name));
  expect(
    await groups
      .last()
      .locator("option")
      .evaluateAll((os) => os.map((o) => o.value)),
  ).toEqual(rooms.map((l) => `${l.pack}#${l.index}`));

  // with no target, no title that names a slot and no origin, a room takes the first free room
  await expect(slot).toHaveValue("/HIRO/COPYCAT.PAK#0");
  await expect(reach).toHaveText(roomLine(0));
  await expect(mode).toHaveText("");
  await expect(wear).toHaveText("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 241 bytes to spare.",
  );
  expect((await docOf(page, loop)).into).toBeUndefined();

  // another room's slot names the room's own world, whose artwork the level wears there
  await slot.selectOption("/HIRO/COPYCAT.PAK#1");
  await expect(reach).toHaveText(roomLine(1));
  await expect(mode).toHaveText("");
  await expect(wear).toHaveText(`It will wear ${worldOf(rooms[1].theme)}'s artwork there.`);
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 212 bytes to spare.",
  );
  expect((await docOf(page, loop)).into).toBe("/HIRO/COPYCAT.PAK#1");

  // a room in a world pack's slot is played as a bonus level there
  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(reach).toHaveText(
    /^It takes LEVEL 2's place, reached with a save that has got that far in .+\.$/,
  );
  await expect(mode).toHaveText("The game plays it as a bonus level there.");
  await expect(wear).toHaveText("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 207 bytes to spare.",
  );
  await slot.selectOption("/HIRO/COPYCAT.PAK#0");
  await expect(reach).toHaveText(roomLine(0));
  await expect(mode).toHaveText("");

  // an arcade level takes the first free slot of the worlds, and in a room's slot is played in Simon mode there
  const add = dialog.locator("#patchAdd");
  await add.selectOption(String(spiral));
  const second = level.nth(1);
  await expect(second.locator(".plays")).toHaveText("Plays as an arcade level.");
  await expect(second.locator("select")).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(second.locator("#patchMode2")).toHaveText("");
  await second.locator("select").selectOption("/HIRO/COPYCAT.PAK#2");
  await expect(second.locator("#patchReach2")).toHaveText(roomLine(2));
  await expect(second.locator("#patchMode2")).toHaveText("The game plays it in Simon mode there.");
  await expect(second.locator("#patchWear2")).toHaveText(
    `It will wear ${worldOf(rooms[2].theme)}'s artwork there.`,
  );
  await expect(second.locator(".room")).toHaveText(
    "It fits in the slot's own bytes, with 231 bytes to spare.",
  );

  // a key on a marked level makes it an arcade level, so its default is a world's slot
  await add.selectOption(String(marked));
  const third = level.nth(2);
  await expect(third.locator(".plays")).toHaveText("Plays as an arcade level.");
  await expect(third.locator("select")).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(third.locator("#patchMode3")).toHaveText("");
  await expect(dialog.locator("#patchClash p")).toHaveCount(0);
  expect((await docOf(page, loop)).into).toBe("/HIRO/COPYCAT.PAK#0");
  expect((await docOf(page, spiral)).into).toBe("/HIRO/COPYCAT.PAK#2");
  expect((await docOf(page, marked)).into).toBeUndefined();
  expect(errors).toEqual([]);
});

test("a level another tab deletes leaves its row, and the box closes when the last one goes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const tower = await opened(page, "tower.kula.json", synthetic(30, "Tower"));
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  const store = await stored(page, spiral);
  await openPatch(page, spiral);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchAdd").selectOption(String(tower));
  const level = rows(dialog);
  await expect(level).toHaveCount(2);
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"spiral-and-1-more.xdelta"');

  const without = structuredClone(store);
  delete without.drafts[tower];
  await elsewhere(page, without);
  await expect(level).toHaveCount(1);
  await expect(level.first().locator(".name")).toHaveText("Spiral");
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "Another tab deleted Tower, so the patch goes on without it.",
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText(
    '"spiral.xdelta" "spiral.bin"',
  );
  await expect(dialog.locator("#patchAdd option")).toHaveText([ADD, FILE]);

  const none = structuredClone(without);
  delete none.drafts[spiral];
  await elsewhere(page, none);
  await expect(dialog).toBeHidden();
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "Another tab deleted Spiral, so the box closed without a patch.",
  );
  expect(errors).toEqual([]);
});

test("the box keeps its levels and the image once closed, a card's opening adds its level, and take all out empties the rows", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const third = await opened(page, "third.kula.json", synthetic(6, "Third"));
  const tower = await opened(page, "tower.kula.json", synthetic(30, "Tower"));
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  const dialog = page.locator("#patch");
  const level = rows(dialog);
  const names = level.locator(".name");
  const add = dialog.locator("#patchAdd");
  const clear = dialog.locator("#patchClear");
  const status = dialog.locator("#patchStatus");
  /** Show the draft and open the box from its card. */
  const openFrom = async (id) => {
    await page.locator(`#draftRows button[data-id="${id}"]`).click();
    await expect.poll(() => shownDraft(page)).toBe(id);
    await page.locator("#draftPatch").click();
    await expect(dialog).toBeVisible();
  };

  await openFrom(spiral);
  await expect(clear).toHaveText("take all out");
  await expect(clear).toBeEnabled();
  await add.selectOption(String(tower));
  await expect(names).toHaveText(["Spiral", "Tower"]);
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(status).toHaveText("synthetic.bin is read, an image of the Roll Away disc.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // opened again from the same card: the rows, the image and the downloads as they were left
  await openFrom(spiral);
  await expect(names).toHaveText(["Spiral", "Tower"]);
  await expect(status).toHaveText("synthetic.bin is read, an image of the Roll Away disc.");
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeEnabled();
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"spiral-and-1-more.xdelta"');
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // opened from another level's card: that level joins the rows
  await openFrom(third);
  await expect(names).toHaveText(["Spiral", "Tower", "Third"]);
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"spiral-and-2-more.xdelta"');
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // a level deleted while the box was closed is gone from the rows without a word
  await page.locator(`#draftRows button[data-id="${tower}"]`).click();
  await expect.poll(() => shownDraft(page)).toBe(tower);
  const del = page.locator("#draftCard button", { hasText: /^delete/ });
  await del.click();
  await expect(del).toHaveText("delete?");
  await del.click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  await openFrom(spiral);
  await expect(names).toHaveText(["Spiral", "Third"]);
  expect(await toasts(page)).toEqual([]);
  await expect(status).toHaveText("synthetic.bin is read, an image of the Roll Away disc.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();

  await clear.click();
  await expect(level).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(clear).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Add a level above to make the patches.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await expect(status).toHaveText("synthetic.bin is read, an image of the Roll Away disc.");
  expect((await add.locator("option").allTextContents()).sort()).toEqual(
    [ADD, "Spiral", "Third", FILE].sort(),
  );
  await add.selectOption(String(third));
  await expect(names).toHaveText(["Third"]);
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"third.xdelta"');
  expect(errors).toEqual([]);
});
