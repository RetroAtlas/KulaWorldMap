import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { blank, readProject, setMeta, writeProject } from "../../public/js/format/project.js";
import { RECORD, readKwl, writeKwl } from "../../public/js/format/kwl.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const hostile = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/hostile-projects.json", import.meta.url)),
    "utf8",
  ),
);

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return {
      li: state.li,
      draft: state.lvl.draft,
      theme: state.lvl.theme,
      time: state.lvl.time,
      chip: document.getElementById("chipLine").textContent,
    };
  });
const entryOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/editor/drafts.js", location.href).href);
    return get(id);
  }, id);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const saved = async (page, locator) => {
  const [download] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
};
const file = (name, data) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(data),
});
/** The map's file for a new level in the first world, titled Spiral Two. */
const MAP_FILE = `{
  "format": "kula-world-level",
  "version": 1,
  "title": "Spiral Two",
  "author": "",
  "notes": "",
  "world": "HIRO",
  "time": 99,
  "hidden": false,
  "invisibleFromAfar": false,
  "simon": false,
  "circuits": {},
  "blocks": [
    { "cell": [17, 17, 17], "kind": 0, "faces": { "0": { "type": 30, "facing": 3 } } }
  ]
}
`;

test("a draft saves as the map's file and as the game's, and the row counts the changes since", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.locator("#draftTitle").fill("Spiral Two");
  const id = (await shown(page)).draft;
  const row = page.locator("#draftRows button .state");
  const saveJson = page.locator("#draftSaveJson");
  const saveKwl = page.locator("#draftSaveKwl");
  await expect(saveJson).toHaveText("save as .json");
  await expect(saveKwl).toHaveText("save as .kwl");
  await expect(row).toHaveText("not saved to a file · 1 change");
  await expect(saveJson).toHaveClass(/unsaved/);

  const asMap = await saved(page, saveJson);
  expect(asMap.name).toBe("spiral-two.kula.json");
  const entry = await entryOf(page, id);
  expect(asMap.bytes.toString("utf8")).toBe(MAP_FILE);
  expect(readProject(MAP_FILE).project).toEqual(entry.doc);
  expect(entry.saved).toBeGreaterThan(0);
  expect(entry.edits).toBe(0);
  await expect(row).toHaveText("saved to a file");
  await expect(saveJson).not.toHaveClass(/unsaved/);

  await page.locator("#draftTime").fill("45");
  await page.locator("#draftTime").blur();
  await expect(row).toHaveText("saved to a file · 1 change since");
  await expect(saveJson).toHaveClass(/unsaved/);
  const note = page.locator("#draftCard .note");
  await expect(note).toBeVisible();
  await expect(note).toHaveText("Saved in this browser");
  await expect(note).toBeHidden({ timeout: 4000 });

  const asGame = await saved(page, saveKwl);
  expect(asGame.name).toBe("spiral-two.kwl");
  const doc = (await entryOf(page, id)).doc;
  expect(doc.time).toBe(45);
  expect(asGame.bytes.equals(Buffer.from(writeKwl(doc)))).toBe(true);
  const back = readKwl(new Uint8Array(asGame.bytes), doc.world);
  expect(back.project.blocks).toEqual(doc.blocks);
  expect(back.project.time).toBe(45);
  expect(back.report).toEqual([]);
  await expect(row).toHaveText("saved to a file");

  // the row above holds the four openers alone, so the saves are the card's
  const actions = page.locator("#yours .actions button");
  await expect(actions).toHaveCount(4);
  expect(await actions.evaluateAll((buttons) => buttons.map((b) => b.id))).toEqual([
    "draftNew",
    "draftCopy",
    "draftOpen",
    "draftPaste",
  ]);
  await expect(page.locator("#draftExport")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("opening a file makes a saved draft out of what it holds, or refuses it with one toast", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const input = page.locator("#draftFile");
  const rows = page.locator("#draftRows button");

  const project = setMeta(blank("MARS"), { title: "Opened one", time: 42, hidden: true });
  await input.setInputFiles(file("opened-one.kula.json", writeProject(project)));
  await expect(rows).toHaveCount(1);
  const first = await shown(page);
  expect(first).toMatchObject({ li: -1, theme: "MARS", time: 42 });
  expect(first.chip).toContain("Opened one");
  const entry = await entryOf(page, first.draft);
  expect(entry.doc).toEqual(project);
  expect(entry.saved).toBeGreaterThan(0);
  expect(entry.edits).toBe(0);
  await expect(rows.locator(".state")).toHaveText("saved to a file");
  await expect(page.locator("#say")).toContainText("Opened Opened one. Draft, Opened one");
  await expect(page.locator("#draftCard .report")).toHaveCount(0);
  expect(await toasts(page)).toEqual([]);

  // the game's bytes take the file's stem and the world on screen
  const game = setMeta(blank("HIRO"), { title: "Ignored", time: 77 });
  await input.setInputFiles(file("spiral.kwl", writeKwl(game)));
  await expect(rows).toHaveCount(2);
  const second = await shown(page);
  expect(second).toMatchObject({ li: -1, theme: "MARS", time: 77 });
  expect(second.chip).toContain("spiral");
  const opened = await entryOf(page, second.draft);
  expect(opened.doc).toMatchObject({ title: "spiral", world: "MARS", time: 77 });
  expect(opened.doc.blocks).toEqual(game.blocks);
  expect(opened.saved).toBeGreaterThan(0);
  expect(await toasts(page)).toEqual([]);

  // the same name again still opens
  await input.setInputFiles(file("spiral.kwl", writeKwl(game)));
  await expect(rows).toHaveCount(3);

  await input.setInputFiles(file("other.json", JSON.stringify({ hello: 1, blocks: [] })));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That file is not a level file of the map's.",
  ]);
  await expect(rows).toHaveCount(3);
  await input.setInputFiles(file("noise.kwl", new Uint8Array(1000).fill(7)));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That file is neither a level of the map's nor one of the game's.",
    "That file is not a level file of the map's.",
  ]);
  await expect(rows).toHaveCount(3);
  // the gate goes by the count alone, so a crowd with no device, which the writer writes, is refused as one with a switch is
  const crowd = Array.from({ length: 2049 }, (_, i) => ({
    cell: [1 + (i % 32), 1 + (Math.floor(i / 32) % 32), 1 + Math.floor(i / 1024)],
    kind: 6,
  }));
  const crowded =
    "That file cannot be read as a level: 2049 records, over the 123 the game has room for.";
  await input.setInputFiles(
    file("crowd.kula.json", JSON.stringify({ ...project, hidden: false, blocks: crowd })),
  );
  await expect(page.locator("#toastStack .toast").first()).toHaveText(crowded);
  await expect(rows).toHaveCount(3);
  await input.setInputFiles(
    file("nowhere.kula.json", writeProject({ ...project, world: "NOWHERE" })),
  );
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "That file names a world the disc has not.",
  );
  await expect(rows).toHaveCount(3);
  crowd[2047] = { cell: [32, 32, 2], kind: 0, faces: { 0: { type: 9, variant: 0 } } };
  await input.setInputFiles(
    file("switched.kula.json", JSON.stringify({ ...project, hidden: false, blocks: crowd })),
  );
  await expect(page.locator("#toastStack .toast").first()).toHaveText(crowded);
  await expect(rows).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("what the reader repaired shows as a toast and in a fold on the card, until another draft is shown", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const whole = writeKwl(setMeta(blank("HIRO"), { time: 33 }));
  await page.locator("#draftFile").setInputFiles(file("cut.kwl", whole.slice(0, -RECORD)));
  const rows = page.locator("#draftRows button");
  await expect(rows).toHaveCount(1);
  const out = await shown(page);
  expect(out).toMatchObject({ li: -1, time: 99 });
  const fold = page.locator("#draftCard details.report");
  await expect(fold).toHaveCount(1);
  await expect(fold.locator("summary")).toHaveText("Read with 1 repair");
  await expect(fold.locator("li")).toHaveText([/^no trailer/]);
  const line = await fold.locator("li").textContent();
  expect(await toasts(page)).toEqual([line]);

  const crowd = hostile.cases.find((c) => c.name === "two hundred platforms of length 32767");
  await page
    .locator("#draftFile")
    .setInputFiles(file("platforms.kula.json", JSON.stringify(crowd.input)));
  await expect(rows).toHaveCount(2);
  await expect(fold.locator("summary")).toHaveText("Read with 200 repairs");
  await expect(fold.locator("li")).toHaveCount(4);
  await expect(page.locator("#toastStack .toast").first()).toHaveText("Read with 200 repairs.");

  await page.locator("#draftNew").click();
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#draftCard details.report")).toHaveCount(0);
  await rows.filter({ hasText: "cut" }).click();
  expect((await shown(page)).draft).toBe(out.draft);
  await expect(page.locator("#draftCard details.report")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a file read with notes and no repair says so, and one repair beside a note counts one", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const kept = blank("HIRO");
  kept.blocks.push(
    { cell: [10, 12, 17], kind: 5, far: [10, 16, 17], length: 4, speed: 30 },
    { cell: [12, 12, 17], kind: 5, far: [12, 16, 17], length: 4, speed: 30 },
  );
  const input = page.locator("#draftFile");
  const rows = page.locator("#draftRows button");
  const fold = page.locator("#draftCard details.report");
  const toast = page.locator("#toastStack .toast").first();
  await input.setInputFiles(file("kept.kwl", writeKwl(kept)));
  await expect(rows).toHaveCount(1);
  await expect(fold.locator("summary")).toHaveText("Read with notes");
  await expect(fold.locator("li")).toHaveText([/is 4 blocks long$/, /is 4 blocks long$/]);
  await expect(toast).toHaveText("Read with notes.");

  await input.setInputFiles(file("cut.kwl", writeKwl(kept).slice(0, -RECORD)));
  await expect(rows).toHaveCount(2);
  await expect(fold.locator("summary")).toHaveText("Read with 1 repair");
  await expect(fold.locator("li")).toHaveCount(3);
  await expect(toast).toHaveText("Read with 1 repair.");

  await input.setInputFiles(
    file("newer.kula.json", JSON.stringify({ ...blank("HIRO"), version: 2 })),
  );
  await expect(rows).toHaveCount(3);
  await expect(fold.locator("summary")).toHaveText("Read with notes");
  await expect(fold.locator("li")).toHaveText([/^written as version 2/]);
  await expect(toast).toHaveText(/^written as version 2/);
  expect(errors).toEqual([]);
});
