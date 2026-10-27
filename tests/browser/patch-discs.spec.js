import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { booting, synthetic, syntheticImage } from "../unit/synthetic.js";
import { mapData, releases } from "../unit/fixtures.js";
import { EDIT, WARNINGS, file, openPatch, opened } from "./patchhelpers.js";

const [us, eu, jp] = releases;
const SLOT_19 = "/HIRO/HIRO.PAK#19";
const BONUS_30 = "/HELL/HELL.PAK#17";
const NONE = "SYSTEM.CNF names none of the three discs' executables";
const title = (l) => l.shown || l.name;
const lesson = title(mapData.levels.find((l) => `${l.pack}#${l.index}` === SLOT_19));
const bar = (dialog) => dialog.locator("#patchDiscs");
const pressed = (dialog) => bar(dialog).locator('button[aria-pressed="true"]');
const press = (dialog, id) => bar(dialog).locator(`button[data-release="${id}"]`).click();
const forDisc = (r) =>
  `The fits above are worked out for the ${r.name} disc until the image is given.`;

/** The box open for a fresh draft, the page opened on the link given. */
async function boxOn(page, link) {
  await page.goto(link);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  return dialog;
}

test("the bar stands above the image's file control on the disc the map shows, saying the fits are that disc's until the image is given", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await boxOn(page, `${EDIT}/d-eu`);
  const group = bar(dialog);
  await expect(group).toHaveAttribute("role", "group");
  await expect(group).toHaveAttribute("aria-label", "The disc the patch is for");
  const buttons = group.getByRole("button");
  await expect(buttons).toHaveText([us.label, eu.label, jp.label]);
  await expect(buttons.nth(1)).toHaveAttribute(
    "title",
    `${eu.name}, the PAL release (${eu.serial})`,
  );
  await expect(pressed(dialog)).toHaveText(eu.label);
  await expect(group.locator("button:disabled")).toHaveCount(0);
  await expect(dialog.locator("#patchFor")).toHaveText(forDisc(eu));
  const [above, control] = await Promise.all([
    group.boundingBox(),
    dialog.locator("#patchDisc").boundingBox(),
  ]);
  expect(above.y + above.height).toBeLessThanOrEqual(control.y);
  expect(errors).toEqual([]);
});

test("a press titles the slots as that disc titles them, HIRO's slot 19 OBJ LEVEL under EU and LESSON again under US", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await boxOn(page, EDIT);
  const option = dialog.locator(`#patchSlot option[value="${SLOT_19}"]`);
  await expect(pressed(dialog)).toHaveText(us.label);
  await expect(option).toHaveText(lesson);
  await expect(dialog.locator("#patchFor")).toHaveText("");
  await press(dialog, "eu");
  await expect(pressed(dialog)).toHaveText(eu.label);
  await expect(option).toHaveText(title(eu.levels[SLOT_19]));
  await expect(dialog.locator("#patchFor")).toHaveText(forDisc(eu));
  await press(dialog, "us");
  await expect(pressed(dialog)).toHaveText(us.label);
  await expect(option).toHaveText(lesson);
  await expect(dialog.locator("#patchFor")).toHaveText("");
  expect(errors).toEqual([]);
});

test("the disc pressed holds while the box is closed and opened again", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(pressed(dialog)).toHaveText(us.label);
  await press(dialog, "jp");
  await expect(pressed(dialog)).toHaveText(jp.label);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openPatch(page, id);
  await expect(dialog).toBeVisible();
  await expect(pressed(dialog)).toHaveText(jp.label);
  expect(errors).toEqual([]);
});

test("a copy of the PAL BONUS 30 is fitted to the disc pressed before the image is given, a rebuild under US and in place under EU", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HELL/17/45,35/fit/33/d-eu");
  await settle(page);
  await expect(page.locator("#chipLine .tag")).toHaveText("EU");
  await page.locator("#draftCopy").click();
  await expect(page.locator("#chipLine b")).toHaveText("BONUS 30 (EU)");
  await page.locator('#release button[data-release="us"]').click();
  await expect(page.locator("#chipLine .tag")).toHaveText(["Draft"]);
  await page.locator("#draftPatch").click();
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await expect(pressed(dialog)).toHaveText(us.label);
  await expect(dialog.locator("#patchSlot")).toHaveValue(BONUS_30);
  await expect(dialog.locator("#patchReach")).toContainText("It takes BONUS 30's place");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is rebuilt to make room, with 87 bytes to spare, so the patch carries its other levels too.",
  );
  await press(dialog, "eu");
  await expect(pressed(dialog)).toHaveText(eu.label);
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 75 bytes to spare.",
  );
  await expect(dialog.locator("#patchSlot")).toHaveValue(BONUS_30);
  expect(errors).toEqual([]);
});

test("an image read as one of the discs locks the bar to that disc and says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await boxOn(page, `${EDIT}/d-eu`);
  await expect(pressed(dialog)).toHaveText(eu.label);
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "synthetic.bin is read, an image of the Roll Away disc.",
  );
  await expect(pressed(dialog)).toHaveText(us.label);
  await expect(bar(dialog).locator("button:disabled")).toHaveText([eu.label, jp.label]);
  await expect(bar(dialog).locator('button[data-release="us"]')).toBeEnabled();
  await expect(dialog.locator("#patchFor")).toHaveText("");
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  expect(errors).toEqual([]);
});

test("a new file that is no image unlocks the bar, the disc read staying pressed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await boxOn(page, EDIT);
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(bar(dialog).locator("button:disabled")).toHaveCount(2);
  await dialog.locator("#patchDisc").setInputFiles(file("notes.bin", new Uint8Array(5000)));
  await expect(dialog.locator("#patchStatus")).toContainText(
    "notes.bin does not read as a disc image",
  );
  await expect(bar(dialog).locator("button:disabled")).toHaveCount(0);
  await expect(pressed(dialog)).toHaveText(us.label);
  expect(errors).toEqual([]);
});

test("an image booting none of the three keeps the disc pressed, and the folder named is that disc's", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const dialog = await boxOn(page, `${EDIT}/d-eu`);
  await dialog.locator("#patchDisc").setInputFiles(file("other.bin", booting("SLES_000.00")));
  await expect(dialog.locator("#patchStatus")).toHaveText("other.bin is read.");
  await expect(pressed(dialog)).toHaveText(eu.label);
  await expect(bar(dialog).locator("button:disabled")).toHaveCount(0);
  await expect(dialog.locator("#patchWarnings li")).toHaveText([NONE, WARNINGS[1]]);
  await expect(dialog.locator("#patchPlay li").nth(1)).toHaveText(
    `ePSXe and PCSX-ReARMed read it from their patches folder as ${eu.boot}, with no extension`,
  );
  expect(errors).toEqual([]);
});
