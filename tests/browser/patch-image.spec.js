import { expect, test } from "@playwright/test";
import { settle, steps, trackErrors } from "./helpers.js";
import { SYNTHETIC_SECTORS, streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { USER, sector } from "../../public/js/format/sectors.js";
import { packs } from "../unit/fixtures.js";
import { REBUILD, RELOCATE, fit } from "../../public/js/format/pak.js";
import {
  CASE,
  EDIT,
  WARNINGS,
  docOf,
  elsewhere,
  file,
  openPatch,
  opened,
  saved,
  sha256,
  stored,
} from "./patchhelpers.js";

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
  // A file of the slow size, and whatever is sliced from it, is read once __release
  // opens its gate; __release returns when no such read is left in flight.
  await page.addInitScript((slowSize) => {
    const read = Blob.prototype.arrayBuffer;
    const slice = Blob.prototype.slice;
    const gates = [];
    let pending = 0;
    const gateOf = (blob) => {
      if (blob.gate) return blob.gate;
      if (!(blob instanceof File) || blob.size !== slowSize) return null;
      const gate = {};
      gate.held = new Promise((open) => (gate.open = open));
      gates.push(gate);
      return (blob.gate = gate);
    };
    Blob.prototype.slice = function (...args) {
      const out = slice.apply(this, args);
      const gate = gateOf(this);
      if (gate) out.gate = gate;
      return out;
    };
    Blob.prototype.arrayBuffer = async function () {
      const gate = gateOf(this);
      if (!gate) return read.call(this);
      pending++;
      try {
        await gate.held;
        return await read.call(this);
      } finally {
        pending--;
      }
    };
    window.__release = async () => {
      for (const gate of gates) gate.open();
      do await new Promise((r) => setTimeout(r));
      while (pending);
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
  await page.evaluate(() => window.__release());
  await expect(status).toHaveText("quick.bin is read.");
  await expect(dialog.locator("#patchWarnings li").first()).toHaveText(
    "the image has 44 sectors, not the 109,607 of the Roll Away disc",
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
  await page.evaluate(() => window.__release());
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
