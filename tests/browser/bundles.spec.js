import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, docOf, shown } from "./drafthelpers.js";
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

/** Every bundle this browser holds, as the editor lists them. */
const bundles = (page) =>
  page.evaluate(async () => {
    const { bundles } = await import(new URL("js/editor/drafts.js", location.href).href);
    return bundles();
  });

/** The drafts this browser holds in the order they were made. */
const made = async (page) => (await listed(page)).sort((a, b) => a.id - b.id);

/** Open the bundle file through the sidebar's file input, and wait for its levels to be listed. */
async function openedBundle(page, text = BUNDLE, levels = LEVELS.length) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftFile").setInputFiles(file(NAME, text));
  await expect(page.locator("#draftRows button")).toHaveCount(levels);
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
  await expect(page.locator("#draftRows button")).toHaveCount(4);
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
  await expect(page.locator("#draftRows button")).toHaveCount(1);
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
  await expect(page.locator("#draftRows button")).toHaveCount(4);
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
