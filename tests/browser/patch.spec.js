import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { writeProject } from "../../public/js/project.js";
import { SLUG_MOST } from "../../public/js/files.js";
import { SYNTHETIC_SECTORS, synthetic, syntheticImage } from "../unit/synthetic.js";
import { USER, sector } from "../../public/js/sectors.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/patch-digests.json", import.meta.url)), "utf8"),
);
const CASE = fixture.cases[0];
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
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.lvl.draft;
  });
const docOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/drafts.js", location.href).href);
    return get(id)?.doc ?? null;
  }, id);
const steps = (page, id) =>
  page.evaluate(async (id) => {
    const { steps } = await import(new URL("js/trail.js", location.href).href);
    return steps(id).past;
  }, id);
const openPatch = (page, id) =>
  page.evaluate(async (id) => {
    const { openPatchDialog } = await import(new URL("js/patchdialog.js", location.href).href);
    await openPatchDialog(id);
  }, id);
const saved = async (page, locator) => {
  const [download] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
};

/** Open a project as a draft through the sidebar's file input, and give its id. */
async function opened(page, name, project) {
  await page.locator("#draftFile").setInputFiles(file(name, writeProject(project)));
  await expect(page.locator("#chipLine b")).toHaveText(project.title);
  return shownDraft(page);
}

/** The store as another tab would write it, once this tab's write of the draft has landed. */
async function stored(page, id) {
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
  await expect(options).toHaveCount(220);
  expect(
    await options.evaluateAll((os) => os.filter((o) => o.value.includes("COPYCAT")).length),
  ).toBe(0);
  expect(await slot.locator("optgroup").count()).toBe(10);
  await expect(slot).toHaveValue("/HIRO/HIRO.PAK#0");
  await expect(options.first()).toHaveText("LEVEL 1");
  await expect(dialog.locator("#patchReach")).toHaveText("A new game starts here, at LEVEL 1.");
  await expect(dialog.locator("#patchWear")).toHaveText("");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is laid out again to make room, with 1127 bytes to spare.",
  );
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchPlay li")).toHaveCount(1);
  expect((await docOf(page, id)).into).toBeUndefined();
  expect(await steps(page, id)).toBe(0);

  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 93 bytes to spare.",
  );
  await expect(dialog.locator("#patchReach")).toContainText(
    "where it reaches LEVEL 2, with a save",
  );
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  await slot.selectOption("/MARS/MARSFI.PAK#1");
  await expect(dialog.locator("#patchReach")).toContainText("where it reaches FINAL 18, once");
  await expect(dialog.locator("#patchWear")).toContainText("artwork there.");
  await slot.selectOption("/HIRO/HIRO.PAK#1");
  await expect(dialog.locator("#patchWear")).toHaveText("");
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  expect(await steps(page, id)).toBe(1);

  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  await expect(dialog.locator("#patchFrom")).toHaveText("Read from the image.");
  await expect(dialog.locator("#patchWarnings li")).toHaveText(WARNINGS);
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeEnabled();
  const play = dialog.locator("#patchPlay li");
  await expect(play).toHaveCount(3);
  await expect(play.nth(0)).toContainText("synthetic.ppf");
  await expect(play.nth(1)).toContainText("SLUS_007.24");
  await expect(play.nth(2)).toContainText(
    'xdelta3 -d -s "synthetic.bin" "spiral.xdelta" "spiral.bin"',
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
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchFrom")).toContainText("Worked out from the disc as pressed");
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
  await expect(dialog.locator("#patchChecks .errors li")).toHaveCount(0);
  await expect(dialog.locator("#patchChecks")).toContainText(missing);
  await dialog.locator("#patchSlot").selectOption("/HIRO/HIRO.PAK#1");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 179 bytes to spare.",
  );
  for (const b of ["#patchPpf", "#patchXdelta", "#patchImage", "#patchCue"])
    await expect(dialog.locator(b)).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(missing);
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
  const title = `E\u0301pe\u0301e, a\u0300 la mode!! ${"x".repeat(80)}`;
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
      const drafts = await import(new URL("js/drafts.js", location.href).href);
      const { openPatchDialog } = await import(new URL("js/patchdialog.js", location.href).href);
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
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(sha256(patch.bytes)).toBe(CASE.ppf);

  const renamed = await stored(page, id);
  renamed.drafts[id].doc = { ...renamed.drafts[id].doc, title: "Helix" };
  renamed.drafts[id].updated += 60000;
  await elsewhere(page, renamed);
  await expect(dialog.locator(".name")).toHaveText("Helix");
  await expect(dialog.locator("#patchPlay li").nth(2)).toContainText('"helix.xdelta" "helix.bin"');
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
  await expect(dialog.locator("#patchReach")).toContainText("with a save that has got that far in");
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
  await expect(dialog.locator("#patchFrom")).toHaveText("Read from the image.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#1");
  const patch = await saved(page, dialog.locator("#patchPpf"));
  expect(sha256(patch.bytes)).toBe(CASE.ppf);
  expect(errors).toEqual([
    "console: Failed to load resource: the server responded with a status of 404 (Not Found)",
  ]);
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
    into: "/HIRO/COPYCAT.PAK#0",
  });
  await openPatch(page, id);
  const dialog = page.locator("#patch");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#patchChecks .errors li")).toHaveText([
    "error: the target '/HIRO/COPYCAT.PAK#0' is not a slot of a world or a finals pack",
  ]);
  const slot = dialog.locator("#patchSlot");
  await expect(slot).toHaveValue("");
  await expect(slot.locator("option:checked")).toHaveText("/HIRO/COPYCAT.PAK#0, which is no slot");
  await expect(slot.locator("option:checked")).toHaveJSProperty("disabled", true);
  await expect(slot.locator("option")).toHaveCount(221);
  await expect(dialog.locator("#patchReach")).toHaveText("Choose a slot above.");
  await expect(dialog.locator("#patchFit")).toHaveText("");
  expect((await docOf(page, id)).into).toBe("/HIRO/COPYCAT.PAK#0");
  await dialog.locator("#patchDisc").setInputFiles(file("synthetic.bin", syntheticImage()));
  await expect(dialog.locator("#patchStatus")).toHaveText("synthetic.bin is read.");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Choose a slot above.");
  await slot.selectOption("/HIRO/HIRO.PAK#0");
  await expect(dialog.locator("#patchChecks .errors")).toHaveCount(0);
  expect((await docOf(page, id)).into).toBe("/HIRO/HIRO.PAK#0");
  expect(await steps(page, id)).toBe(1);
  await expect(slot.locator("option")).toHaveCount(220);
  await expect(dialog.locator("#patchReach")).toHaveText("A new game starts here, at LEVEL 1.");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "It fits in the slot's own bytes, with 122 bytes to spare.",
  );
  await expect(dialog.locator("#patchFrom")).toHaveText("Read from the image.");
  await expect(dialog.locator("#patchPpf")).toBeEnabled();
  await expect(dialog.locator("#patchReady")).toHaveText("Save what your emulator wants.");
  expect(errors).toEqual([]);
});

test("a read that lands late, for an image or a box no longer current, changes nothing", async ({
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

  await dialog.locator("#patchDisc").setInputFiles(file("slow.bin", slow));
  await expect(status).toHaveText("Reading slow.bin…");
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openPatch(page, id);
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(status).toHaveText("");
  await expect(dialog.locator("#patchFrom")).toContainText("Worked out from the disc as pressed");
  await expect(dialog.locator("#patchFit")).toHaveText(
    "The pack is laid out again to make room, with 1127 bytes to spare.",
  );
  await expect(dialog.locator("#patchPpf")).toBeDisabled();
  await expect(dialog.locator("#patchReady")).toHaveText(
    "Give the disc image above to make the patches.",
  );
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
    "The pack is laid out again to make room, with 1127 bytes to spare.",
  );
  expect(errors).toEqual([]);
});
