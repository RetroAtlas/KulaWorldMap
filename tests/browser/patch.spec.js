import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { settle, steps, trackErrors } from "./helpers.js";
import { writeProject } from "../../public/js/format/project.js";
import { SLUG_MOST } from "../../public/js/editor/files.js";
import { SYNTHETIC_SECTORS, streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { USER, sector } from "../../public/js/format/sectors.js";
import { annotations, mapData, packs } from "../unit/fixtures.js";
import { REBUILD, RELOCATE, fit, readPak, writePak } from "../../public/js/format/pak.js";
import { openDisc } from "../../public/js/format/iso.js";
import { EXIT, RECORD, writeKwl } from "../../public/js/format/kwl.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const FIFTH = "/#HIRO/4/45,35/fit/33";
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/patch-digests.json", import.meta.url)), "utf8"),
);
const CASE = fixture.cases[0];
const [ONE_PACK, ACROSS] = fixture.sets;
const ADD = "add a level…";
const FILE = "a file…";
const WARNINGS = [
  "the image has 43 sectors, not the 109,607 of the disc",
  "19 of the 21 packs are missing",
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const file = (name, data) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(data),
});
const shownDraft = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return state.lvl.draft;
  });
const docOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/editor/drafts.js", location.href).href);
    return get(id)?.doc ?? null;
  }, id);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
/** Every draft this browser holds: its id, title, target and save, as the store lists them. */
const listed = (page) =>
  page.evaluate(async () => {
    const { list } = await import(new URL("js/editor/drafts.js", location.href).href);
    return list().map((d) => ({
      id: d.id,
      title: d.doc.title,
      into: d.doc.into ?? null,
      saved: d.saved,
      edits: d.edits,
    }));
  });
const pak = () =>
  writePak(
    ["LEVEL 1", "LEVEL 2", "LEVEL 3"],
    [1, 2, 3].map((n) => streamOf(synthetic(n, `LEVEL ${n}`), 1)),
  );
const openPatch = (page, id) =>
  page.evaluate(async (id) => {
    const { openPatchDialog } = await import(
      new URL("js/editor/patchdialog.js", location.href).href
    );
    await openPatchDialog(id);
  }, id);
const saved = async (page, locator) => {
  const [download] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
};
const rows = (dialog) => dialog.locator("#patchRows .level");
/** The level a slot of the patched image holds, read as the game reads it. */
const slotOf = async (image, pack, slot) => {
  const pak = readPak(await (await openDisc(new Blob([image]))).readFile(pack));
  return { names: pak.names, level: inflateSync(pak.streams[slot]) };
};
/** The key of the slot whose level the pause screen titles so. */
const keyOf = (title) => {
  const l = mapData.levels.find((l) => (l.shown || l.name) === title);
  return `${l.pack}#${l.index}`;
};

/** Open a project as a draft through the sidebar's file input, and give its id. */
async function opened(page, name, project) {
  await page.locator("#draftFile").setInputFiles(file(name, writeProject(project)));
  await expect(page.locator("#chipLine b")).toHaveText(project.title);
  return shownDraft(page);
}

/** The store as another tab would write it, once this tab's write of the draft has landed. */
async function stored(page, id) {
  await page.evaluate(async () => {
    const { flush } = await import(new URL("js/editor/drafts.js", location.href).href);
    flush();
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("kula.drafts")))
    .toContain(`"${id}":`);
  return page.evaluate(() => JSON.parse(localStorage.getItem("kula.drafts")));
}

/** Write the store from a second tab of the same browser, which reaches the first as a storage event. */
async function elsewhere(page, store) {
  const other = await page.context().newPage();
  await other.goto("/");
  await other.evaluate((s) => localStorage.setItem("kula.drafts", JSON.stringify(s)), store);
  await other.close();
}

test("the draft goes onto the disc as the fixture's bytes, the slot kept on the draft", async ({
  page,
}) => {
  test.slow();
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
  await page.keyboard.press("Tab");
  await expect(disc).toBeFocused();

  await disc.setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(disc).toHaveValue(/synthetic\.bin$/);
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
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
  await expect(play.nth(1)).toContainText("SLUS_007.24");
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
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
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
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
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
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
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
  await expect(dialog.locator("#patchStatus")).toHaveText("dropped.bin is read.");
  expect(
    await dialog.locator("#patchDisc").evaluate((i) => [...i.files].map((f) => f.name)),
  ).toEqual(["dropped.bin"]);
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("a draft whose id another tab takes while the box is opening is still the one the box shows", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const shown = await opened(page, "spiral.kula.json", synthetic(6));
  const store = await stored(page, shown);
  let held = null;
  await page.route("**/packs.json", (route) => {
    held = route;
  });
  const id = await page.evaluate(
    async ([project, store]) => {
      const drafts = await import(new URL("js/editor/drafts.js", location.href).href);
      const { openPatchDialog } = await import(
        new URL("js/editor/patchdialog.js", location.href).href
      );
      const id = drafts.create(project);
      openPatchDialog(id);
      store.drafts[id] = {
        doc: { ...project, title: "Theirs" },
        updated: Date.now(),
        saved: null,
        edits: 0,
      };
      store.next = id + 1;
      const text = JSON.stringify(store);
      localStorage.setItem("kula.drafts", text);
      dispatchEvent(
        new StorageEvent("storage", {
          key: "kula.drafts",
          newValue: text,
          storageArea: localStorage,
        }),
      );
      return id;
    },
    [synthetic(6, "Second"), store],
  );
  await expect.poll(() => held !== null).toBe(true);
  await held.continue();
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".name")).toHaveText("Second");
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  expect((await docOf(page, id + 1)).into).toBe("/HIRO/HIRO.PAK#1");
  expect((await docOf(page, id)).title).toBe("Theirs");
  expect(errors).toEqual([]);
});

test("a draft another tab repairs under the open box is written as it is now, not as it was", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const broken = { ...synthetic(6), hidden: true };
  delete broken.blocks[0].faces;
  const id = await opened(page, "spiral.kula.json", broken);
  const store = await stored(page, id);
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog.locator("#patchChecks .errors li")).toHaveText(["error: no start"]);
  await expect(dialog.locator("#patchPlays")).toHaveText(
    "Plays as a hidden level, with the glass ball on half-seen blocks.",
  );
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "A level with errors cannot go on the disc until they are fixed.",
  );
  await expect(dialog.locator("#patchPlaying")).toBeHidden();

  const repaired = await stored(page, id);
  repaired.drafts[id].doc = { ...synthetic(6), into: "/HIRO/HIRO.PAK#1" };
  repaired.drafts[id].updated = store.drafts[id].updated + 60000;
  await elsewhere(page, repaired);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  await expect(dialog.locator("#patchChecks details summary")).toHaveText("1 warning");
  await expect(dialog.locator("#patchPlays")).toHaveText("Plays as an arcade level.");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlaying")).toBeVisible();
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(sha256(patch.bytes)).toBe(CASE.ppf);

  const renamed = await stored(page, id);
  renamed.drafts[id].doc = { ...renamed.drafts[id].doc, title: "Helix" };
  renamed.drafts[id].updated += 60000;
  await elsewhere(page, renamed);
  await expect(dialog.locator(".name")).toHaveText("Helix");
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  await expect(dialog.locator("#patchPlays")).toHaveText("Plays as an arcade level.");
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"helix.xdelta" "helix.bin"');
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  const again = await saved(page, dialog.locator("#patchPpf"));
  expect(again.name).toBe("helix.ppf");
  expect(sha256(again.bytes)).not.toBe(CASE.ppf);
  expect(again.bytes.subarray(6, 56).toString("latin1").trimEnd()).toBe("Kula World Map: Helix");

  const deleted = await stored(page, id);
  delete deleted.drafts[id];
  await elsewhere(page, deleted);
  await expect(dialog).toBeHidden();
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "Another tab deleted Helix, so the box closed without a patch.",
  ]);
  expect(errors).toEqual([]);
});

test("without the disc's layout the fit waits for the image, whose own packs then fill the slot list", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.route("**/packs.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "hell.kula.json", {
    ...synthetic(6),
    into: "/HELL/HELL.PAK#3",
  });
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  const slot = dialog.locator("#patchSlot");
  await expect(slot.locator("option")).toHaveCount(1);
  await expect(slot).toHaveValue("/HELL/HELL.PAK#3");
  await expect(dialog.locator("#patchReach")).toHaveText(
    /^It takes .+'s place, reached with a save that has got that far in .+\.$/,
  );
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The disc's layout could not be loaded, so the fit waits for the image.",
  );
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Give the disc image above to make the patches.",
  );
  expect((await docOf(page, id)).into).toBe("/HELL/HELL.PAK#3");

  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(slot.locator("option")).toHaveText([
    "/HELL/HELL.PAK#3, which this image has not",
    "LEVEL 1",
    "LEVEL 2",
    "LEVEL 3",
    "FINAL 1",
    "FINAL 2",
  ]);
  await expect(slot).toHaveValue("");
  await expect(dialog.locator("#patchReach")).toHaveText("Choose a slot above.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  expect((await docOf(page, id)).into).toBe("/HELL/HELL.PAK#3");
  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(slot.locator("option")).toHaveCount(5);
  await expect(slot.locator("optgroup")).toHaveCount(1);
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(sha256(patch.bytes)).toBe(CASE.ppf);
  expect(errors).toEqual([
    "console: Failed to load resource: the server responded with a status of 404 (Not Found)",
  ]);
});

test("the fit from the layout says when the pack is recompressed or moved, and names the pack a level is too big for", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const bloated = structuredClone(packs);
  for (const p of bloated.packs)
    for (const s of p.slots) {
      s.size = p.path === "/HIRO/HIRO.PAK" ? 2000 : s.size;
      s.size9 = p.path === "/HIRO/HIRO.PAK" ? 1990 : s.size9;
    }
  await page.route("**/packs.json", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bloated) }),
  );
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "big.kula.json", synthetic(120));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  const slot = dialog.locator("#patchSlot");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The level is too big for the game to load from /HIRO/HIRO.PAK.",
  );
  const length = streamOf(synthetic(120)).length;
  const where = (path, recompressed) => {
    for (const p of packs.packs)
      for (let i = 0; i < p.slots.length; i++) {
        if (p.path.includes("COPYCAT") || p.path === "/HIRO/HIRO.PAK") continue;
        const f = fit(p, i, length, "Spiral");
        if (f.path === path && f.recompressed === recompressed) return `${p.path}#${i}`;
      }
    throw new Error(`no slot takes ${length} bytes by ${path}`);
  };
  await slot.selectOption(where(REBUILD, true));
  await expect(dialog.locator("#patchFit")).toHaveText(
    /^The pack is rebuilt with its other levels packed tighter, \d+ bytes to spare, so the patch carries them too\.$/,
  );
  await slot.selectOption(where(RELOCATE, false));
  await expect(dialog.locator("#patchFit")).toContainText(
    "The pack moves into the disc's free sectors, with",
  );
  await expect(dialog.locator("#patchFit")).toContainText(
    "bytes to spare, so the patch carries its other levels too.",
  );
  expect(errors).toEqual([]);
});

test("a write that fails once the file is chosen says so and shuts the writable, and the buttons follow the plan", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.picks = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({
      name: suggestedName.replace(".bin", "-copy.bin"),
      createWritable: async () => ({
        write: () =>
          new Promise((resolve, reject) => {
            window.picks.push({ resolve, reject, aborted: false });
          }),
        close: async () => {},
        abort: async () => {
          window.picks.at(-1).aborted = true;
        },
      }),
    });
  });
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchImage")).toBeEnabled();

  let downloads = 0;
  page.on("download", () => downloads++);
  await dialog.locator("#patchImage").click();
  await expect(dialog.locator("#patchImage")).toHaveText("writing…");
  await expect.poll(() => page.evaluate(() => window.picks.length)).toBe(1);
  await page.evaluate(() =>
    window.picks[0].reject(new DOMException("Disk full", "QuotaExceededError")),
  );
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Saving the patched disc failed: spiral-copy.bin could not be written: Disk full.",
  );
  await expect(dialog.locator("#patchImage")).toHaveText("the patched disc");
  await expect(dialog.locator("#patchImage")).toBeEnabled();
  expect(await page.evaluate(() => window.picks[0].aborted)).toBe(true);
  expect(downloads).toBe(0);
  const sheet = await saved(page, dialog.locator("#patchCue"));
  expect(sheet.bytes.toString("utf8").split("\n")[0]).toBe('FILE "spiral.bin" BINARY');

  await dialog.locator("#patchImage").click();
  await expect.poll(() => page.evaluate(() => window.picks.length)).toBe(2);
  await dialog.locator("#patchSlot").selectOption("/HELL/HELL.PAK#0");
  await expect(dialog.locator("#patchFit")).toContainText("no such pack on the disc");
  await page.evaluate(() => window.picks[1].resolve());
  await expect(dialog.locator("#patchImage")).toHaveText("the patched disc");
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("");
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchImage")).toBeEnabled();
  const named = await saved(page, dialog.locator("#patchCue"));
  expect(named.bytes.toString("utf8").split("\n")[0]).toBe('FILE "spiral-copy.bin" BINARY');
  expect(errors).toEqual([]);
});

test("a save that fails is said so, and the button comes back", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const read = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = function () {
      if (window.gone)
        return Promise.reject(new DOMException("The file moved", "NotReadableError"));
      return read.call(this);
    };
  });
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Save what your emulator wants.");
  await page.evaluate(() => {
    window.gone = true;
  });
  await dialog.locator("#patchPpf").click();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Saving the PPF patch failed: The file moved.",
  );
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPpf")).toHaveText("the PPF patch");
  expect(errors).toEqual([]);
});

test("a target the file names that is no slot is an error until a slot is chosen, the first included", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "simon.kula.json", {
    ...synthetic(6, "Simon"),
    into: "/HIRO/COPYCAT.PAK#10",
  });
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#patchChecks .errors li")).toHaveText([
    "error: the target '/HIRO/COPYCAT.PAK#10' is not a slot of a world pack, a finals pack or the Simon rooms' pack",
  ]);
  const slot = dialog.locator("#patchSlot");
  await expect(slot).toHaveValue("");
  await expect(slot.locator("option:checked")).toHaveText("/HIRO/COPYCAT.PAK#10, which is no slot");
  await expect(slot.locator("option:checked")).toHaveJSProperty("disabled", true);
  await expect(slot.locator("option")).toHaveCount(231);
  await expect(dialog.locator("#patchReach")).toHaveText("Choose a slot above.");
  await expect(dialog.locator("#patchFit")).toHaveText("");
  expect((await docOf(page, id)).into).toBe("/HIRO/COPYCAT.PAK#10");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Choose a slot above.");
  await slot.selectOption("/HIRO/HIRO.PAK#0");
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#0");
  expect((await steps(page, id)).past).toBe(1);
  await expect(slot.locator("option")).toHaveCount(230);
  await expect(dialog.locator("#patchReach")).toHaveText(
    "It takes LEVEL 1's place, where a new game starts.",
  );
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 122 bytes to spare.",
  );
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Save what your emulator wants.");
  expect(errors).toEqual([]);
});

test("a read that lands late for an image no longer current changes nothing, and one in flight while the box is closed and opened again lands", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const slow = syntheticImage();
  await page.addInitScript((slowSize) => {
    const read = Blob.prototype.arrayBuffer;
    const slice = Blob.prototype.slice;
    const dawdles = (blob) => blob.slow === true || blob.size === slowSize;
    Blob.prototype.slice = function (...args) {
      const out = slice.apply(this, args);
      if (dawdles(this)) out.slow = true;
      return out;
    };
    Blob.prototype.arrayBuffer = async function () {
      if (dawdles(this)) await new Promise((r) => setTimeout(r, 120));
      return read.call(this);
    };
  }, slow.length);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  const status = dialog.locator("#patchStatus");
  const quick = Buffer.concat([
    Buffer.from(slow),
    Buffer.from(sector(SYNTHETIC_SECTORS, new Uint8Array(USER), 0)),
  ]);
  await dialog.locator("#patchDisc").setInputFiles(file("slow.bin", slow));
  await expect(status).toHaveText("Reading slow.bin…");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("");
  await dialog.locator("#patchDisc").setInputFiles(file("quick.bin", quick));
  await expect(status).toHaveText("quick.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await page.waitForTimeout(2500);
  await expect(status).toHaveText("quick.bin is read.");
  await expect(dialog.locator("#patchWarnings li").first()).toHaveText(
    "the image has 44 sectors, not the 109,607 of the disc",
  );
  await expect(dialog.locator("#patchPlay li").first()).toContainText("quick.ppf");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlaying")).toBeVisible();

  await dialog.locator("#patchDisc").setInputFiles(file("slow.bin", slow));
  await expect(status).toHaveText("Reading slow.bin…");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openPatch(page, id);
  await expect(dialog).toBeVisible();
  await expect(status).toHaveText("slow.bin is read.");
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  await expect(dialog.locator("#patchPlay li").first()).toContainText("slow.ppf");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlaying")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the plan is read back from the patched image before the downloads are offered", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const image = syntheticImage();
  // The patched image is the one Blob of the image's size that is no File; the
  // ranges read from it are the verifier's walk.
  await page.addInitScript((size) => {
    const read = Blob.prototype.arrayBuffer;
    const slice = Blob.prototype.slice;
    window.readBack = [];
    Blob.prototype.slice = function (start, end, ...rest) {
      const out = slice.call(this, start, end, ...rest);
      if (this.patched === true || (!(this instanceof File) && this.size === size)) {
        out.patched = true;
        out.range = [start, end];
      }
      return out;
    };
    Blob.prototype.arrayBuffer = function () {
      if (this.range) window.readBack.push(this.range);
      return read.call(this);
    };
  }, image.length);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", image));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  const ranges = await page.evaluate(() => window.readBack);
  const sectorAt = (lba) => [lba * 2352, (lba + 1) * 2352];
  for (const lba of [16, 22, 24, 25]) expect(ranges).toContainEqual(sectorAt(lba));
  expect(ranges.every(([start, end]) => end - start === 2352)).toBe(true);
  expect(errors).toEqual([]);
});

test("a browser that cannot unpack the game's files is told the patch needs a newer one", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    delete window.DecompressionStream;
  });
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog.locator("#patchFit")).toContainText("to spare");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "Making the patch needs a newer browser, one that can unpack the game's files.",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Give the disc image above to make the patches.",
  );
  expect(errors).toEqual([]);
});

test("a file that is not a disc image is said so, and the patches stay back", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const id = await opened(page, "spiral.kula.json", synthetic(6));
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await dialog.locator("#patchDisc").setInputFiles(file("notes.bin", new Uint8Array(5000)));
  await expect(dialog.locator("#patchStatus")).toContainText(
    "notes.bin does not read as a disc image",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  const iso = new Uint8Array(2048 * 17);
  iso.set(Buffer.from("CD001"), 16 * 2048 + 1);
  await dialog.locator("#patchDisc").setInputFiles(file("rip.iso", iso));
  await expect(dialog.locator("#patchStatus")).toHaveText(
    "rip.iso is a disc image of 2048-byte sectors; the map reads the raw image of 2352-byte sectors, the .bin a .cue names.",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is rebuilt to make room, with 1127 bytes to spare, so the patch carries its other levels too.",
  );
  expect(errors).toEqual([]);
});

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
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
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
  await expect(status).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // opened again from the same card: the rows, the image and the downloads as they were left
  await openFrom(spiral);
  await expect(names).toHaveText(["Spiral", "Tower"]);
  await expect(status).toHaveText("synthetic.bin is read.");
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
  await expect(status).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();

  await clear.click();
  await expect(level).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(clear).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Add a level above to make the patches.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchPlaying")).toBeHidden();
  await expect(status).toHaveText("synthetic.bin is read.");
  expect((await add.locator("option").allTextContents()).sort()).toEqual(
    [ADD, "Spiral", "Third", FILE].sort(),
  );
  await add.selectOption(String(third));
  await expect(names).toHaveText(["Third"]);
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"third.xdelta"');
  expect(errors).toEqual([]);
});

test("a draft deleted while the box waits for the layout to open for it leaves without a word, and the box opens for another draft after", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const tower = await opened(page, "tower.kula.json", synthetic(30, "Tower"));
  const spiral = await opened(page, "spiral.kula.json", synthetic(6));
  let held = null;
  await page.route("**/packs.json", (route) => {
    held = route;
  });
  await page.evaluate(async (id) => {
    const { openPatchDialog } = await import(
      new URL("js/editor/patchdialog.js", location.href).href
    );
    window.opening = openPatchDialog(id);
  }, spiral);
  await expect.poll(() => held !== null).toBe(true);
  const del = page.locator("#draftCard button", { hasText: /^delete/ });
  await del.click();
  await expect(del).toHaveText("delete?");
  await del.click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await held.continue();
  await page.evaluate(() => window.opening);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeHidden();
  expect(await toasts(page)).toEqual([]);
  await openPatch(page, tower);
  await expect(dialog).toBeVisible();
  await expect(rows(dialog).locator(".name")).toHaveText(["Tower"]);
  await expect(dialog.locator("#patchAdd option")).toHaveText([ADD, FILE]);
  expect(errors).toEqual([]);
});
