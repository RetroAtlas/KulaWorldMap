// Your levels onto the disc, in one scrolling box: a row for each level, with
// its checks, the slot it takes and its fit, then the disc the patch is for,
// the image and the patches, then where each emulator wants them. The fits are
// worked out from the chosen disc's layout until the image is given and read
// from the image after, and from the layout again while the rows cannot be
// placed as they stand; every byte of the patches is written here.
import { $, el, on } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { NAMES, skinsTable } from "../viewer/data.js";
import { current, layoutOf, releaseOf, releases } from "../viewer/release.js";
import { closeDialog, openDialog } from "../viewer/ui/dialog.js";
import { toast } from "../viewer/ui/toast.js";
import { writeKwl } from "../format/kwl.js";
import { deflate } from "../format/deflate.js";
import { UNTITLED, setMeta } from "../format/project.js";
import { ERROR, describe, playsAs, validate } from "../format/checks.js";
import { RAW_ONLY, download, isIso, slug } from "./files.js";
import { draftOf, readLevel } from "./intake.js";
import { CHOOSE, keyShaped, retarget, split } from "./patchslots.js";
import { discBar, readAs, reflectDiscs } from "./discbar.js";
import * as drafts from "./drafts.js";
import { edit } from "./trail.js";
import { IN_PLACE, REBUILD, RECOMPRESS, fitAll, readPak } from "../format/pak.js";
import { openDisc } from "../format/iso.js";
import {
  PACKS,
  cue,
  description,
  identify,
  patchedImage,
  placements,
  planAll,
  ppf,
  vcdiff,
  verifyAll,
} from "../format/patch.js";
import { inflate } from "../format/inflate.js";

// --- the words and the constants -----------------------------------------------------------

const LEVEL = 6;
const BINARY = "application/octet-stream";
const PRIVATE = "Read in your browser; nothing is uploaded.";
const OLDER = "Making the patch needs a newer browser, one that can unpack the game's files.";
const ERRORS = "A level with errors cannot go on the disc until they are fixed.";
const NO_TABLE =
  "The game's face table could not be loaded, so the checks cannot run in full and the level cannot go on the disc from here.";
const CLEAN = "no warnings";
const NO_LAYOUT = "The disc's layout could not be loaded, so the fit waits for the image.";
const CLASHED = "Give each level a slot of its own above.";
const NO_LEVELS = "Add a level above to make the patches.";
const NO_IMAGE = "Give the disc image above to make the patches.";
const READY = "Save what your emulator wants.";
const INSTEAD = "Mednafen, Beetle and RetroArch apply no patch and play the patched disc instead.";
const ADD = "add a level…";
const FILE = "a file…";
const PICKER = "file";
const UNWRITTEN = "the level cannot be written";
const gone = (name) => `Another tab deleted ${name}, so the box closed without a patch.`;
const left = (name) => `Another tab deleted ${name}, so the patch goes on without it.`;
const tooBig = (pack, several) =>
  `The level${several ? "s together are" : " is"} too big for the game to load from ${pack}.`;
const cannot = (why) => `The level cannot be placed there: ${why}.`;

// --- the dialog's state and the helpers ----------------------------------------------------

let ui = null;
// The rows, the image and its plan, kept while the page lives, so the box
// opened again holds what it held when it was closed.
let d = null;
// Counts what the dialog asks for, so a read or a plan that lands for an
// earlier ask is dropped.
let turn = 0;

const nameOf = (row) => row.doc?.title || UNTITLED;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const showing = () => d !== null && !ui.overlay.hidden;
const blocked = () => d.rows.map((row) => row.blocked).find(Boolean) ?? null;
const offered = () => !!d.placed && !blocked();
/** The layout of the disc the patch is for, or null where its file did not load. */
const discLayout = () => layoutOf(d.chosen);

/** What the downloads are called: the first level's slug, and how many more there are. */
function base() {
  const stem = slug(nameOf(d.rows[0]));
  const more = d.rows.length - 1;
  return more ? `${stem}-and-${more}-more` : stem;
}

function fitText(f) {
  const spare = `${plural(f.room, "byte")} to spare`;
  if (f.path === IN_PLACE) return `It fits in the slot's own bytes, with ${spare}.`;
  if (f.path === REBUILD)
    return f.recompressed
      ? `The pack is rebuilt with its other levels packed tighter, ${spare}, so the patch carries them too.`
      : `The pack is rebuilt to make room, with ${spare}, so the patch carries its other levels too.`;
  return `The pack moves into the disc's free sectors, with ${spare}, so the patch carries its other levels too.`;
}

// --- building the box ----------------------------------------------------------------------

const section = (title, ...kids) => el("section", {}, el("h4", { textContent: title }), ...kids);
const button = (id, text, title) => el("button", { id, type: "button", textContent: text, title });

function build() {
  const x = el("button", {
    className: "x",
    type: "button",
    title: "Close (Esc)",
    textContent: "×",
  });
  x.setAttribute("aria-label", "Close");
  const u = {
    rows: el("div", { id: "patchRows" }),
    clash: el("div", { id: "patchClash", className: "errors" }),
    add: el("select", {
      id: "patchAdd",
      title: "Add another level to the patch, one of yours or one from a file",
    }),
    clear: el("button", {
      id: "patchClear",
      className: "out",
      type: "button",
      textContent: "take all out",
      title: "Take every level out of the patch",
    }),
    file: el("input", {
      id: "patchFile",
      type: "file",
      accept: $("draftFile").accept,
      hidden: true,
    }),
    bar: discBar(chooseDisc),
    disc: el("input", { id: "patchDisc", type: "file", accept: ".bin,.img,.iso" }),
    status: el("p", { id: "patchStatus" }),
    warnings: el("ul", { id: "patchWarnings", className: "warnings" }),
    ready: el("p", { id: "patchReady", className: "sub" }),
    ppf: button("patchPpf", "the PPF patch", "Save the patch most PlayStation emulators apply"),
    xdelta: button(
      "patchXdelta",
      "the xdelta patch",
      "Save the patch xdelta3 and Rom Patcher apply",
    ),
    image: button(
      "patchImage",
      "the patched disc",
      "Save a copy of the image with the levels on it",
    ),
    cue: button(
      "patchCue",
      "its cue sheet",
      "Save the cue sheet that goes beside the patched disc",
    ),
    play: el("ul", { id: "patchPlay" }),
  };
  for (const live of [u.status, u.ready]) live.setAttribute("aria-live", "polite");
  u.add.onchange = () => {
    const { value } = u.add;
    u.add.selectedIndex = 0;
    if (value === PICKER) u.file.click();
    else if (value) add(Number(value));
  };
  u.clear.onclick = takeAllOut;
  u.file.onchange = () => {
    const file = u.file.files[0];
    u.file.value = "";
    if (file) fromFile(file);
  };
  // Cleared before the picker opens, so that choosing the same image again fires change.
  u.disc.onclick = () => (u.disc.value = "");
  u.disc.onchange = () => {
    const file = u.disc.files[0];
    if (file) take(file);
  };
  u.ppf.onclick = () =>
    save(u.ppf, async () =>
      download(
        `${base()}.ppf`,
        await ppf(d.file, d.placed.writes, description(d.rows.map(nameOf))),
        BINARY,
      ),
    );
  u.xdelta.onclick = () =>
    save(u.xdelta, async () =>
      download(`${base()}.xdelta`, await vcdiff(d.file, d.placed.writes), BINARY),
    );
  u.image.onclick = () => save(u.image, saveImage);
  u.cue.onclick = () =>
    save(u.cue, async () =>
      download(`${base()}.cue`, cue(d.imageName ?? `${base()}.bin`), "text/plain"),
    );
  const drop = el(
    "label",
    { className: "drop" },
    el("span", { textContent: "Drop the disc image here, or choose it" }),
    u.disc,
  );
  u.playing = section("Playing it", u.play, el("p", { className: "sub", textContent: INSTEAD }));
  u.playing.id = "patchPlaying";
  const box = el(
    "div",
    { className: "box settings patch" },
    x,
    el("h3", { id: "patchTitle", textContent: "Put it on the disc" }),
    section("The levels", u.rows, u.clash, el("div", { className: "add" }, u.add, u.clear, u.file)),
    section(
      "The disc",
      u.bar.group,
      u.bar.note,
      el("p", { id: "patchPrivate", textContent: PRIVATE }),
      drop,
      u.status,
      u.warnings,
      u.ready,
      el("div", { className: "row" }, u.ppf, u.xdelta, u.image, u.cue),
    ),
    u.playing,
  );
  u.overlay = el("div", { id: "patch", className: "modal", hidden: true }, box);
  u.overlay.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("over");
  };
  u.overlay.ondragleave = () => drop.classList.remove("over");
  u.overlay.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    u.disc.files = e.dataTransfer.files;
    take(file);
  };
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "patchTitle");
  document.body.append(u.overlay);
  on("drafts-moved", (pairs) => {
    for (const row of d?.rows ?? []) {
      const to = pairs.find(([from]) => from === row.id)?.[1];
      if (to !== undefined) row.id = to;
    }
  });
  on("drafts-merged", (ids) => {
    if (showing() && d.rows.some((row) => ids.includes(row.id))) refresh();
  });
  on("drafts-changed", () => {
    if (!showing()) return;
    if (d.rows.some((row) => drafts.get(row.id)?.doc !== row.doc)) refresh();
    else additions();
  });
  return u;
}

// --- the rows ------------------------------------------------------------------------------

/** A row for the draft with this id, put under the others: its parts, and what the box works out for it. */
function newRow(id) {
  const u = {
    name: el("p", { className: "name" }),
    out: el("button", {
      className: "out",
      type: "button",
      textContent: "take out",
      title: "Take this level out of the patch",
    }),
    plays: el("p", { className: "plays" }),
    checks: el("div", { className: "checks" }),
    slot: el("select", { title: "The slot the level takes on the disc" }),
    reach: el("p", { className: "reach" }),
    mode: el("p", { className: "sub" }),
    wear: el("p", { className: "sub" }),
    fit: el("p", { className: "room" }),
  };
  u.fit.setAttribute("aria-live", "polite");
  u.box = el(
    "div",
    { className: "level" },
    u.name,
    u.out,
    u.plays,
    u.checks,
    el("label", { className: "slot" }, el("span", { textContent: "Slot" }), u.slot),
    u.reach,
    u.mode,
    u.wear,
    u.fit,
  );
  const row = { id, doc: null, blocked: null, stream: null, size9: 0, into: null, u };
  u.slot.onchange = () => choose(row, u.slot.value);
  u.out.onclick = () => takeOut(row);
  d.rows.push(row);
  ui.rows.append(u.box);
  return row;
}

/** Open the dialog for the draft with this id, with a row for it where none holds it, the bar on the disc the map shows until one is pressed or an image locks it. */
export function openPatchDialog(id) {
  if (!drafts.get(id)) return;
  ui ??= build();
  d ??= {
    rows: [],
    titles: null,
    themes: null,
    chosen: null,
    picked: false,
    clashed: false,
    file: null,
    disc: null,
    packs: null,
    release: null,
    placed: null,
    image: null,
    imageName: null,
  };
  if (d.release === null && !d.picked) d.chosen = current();
  if (!d.rows.some((row) => row.id === id)) newRow(id);
  refresh();
  openDialog(ui.overlay, $("draftPatch"));
}

function add(id) {
  if (!drafts.get(id) || d.rows.some((row) => row.id === id)) return;
  newRow(id);
  refresh();
}

function takeOut(row) {
  d.rows = d.rows.filter((r) => r !== row);
  row.u.box.remove();
  refresh();
  ui.add.focus();
}

function takeAllOut() {
  d.rows = [];
  ui.rows.textContent = "";
  refresh();
  ui.add.focus();
}

// A level from a file, read as the sidebar reads one and made a draft; a pack
// or an image asks its question in the box's place, and the box comes back
// once it is answered, brought up to date, with the new row where there is one.
async function fromFile(file) {
  const read = await readLevel(file, state.lvl.theme);
  const id = read ? draftOf(read) : null;
  const back = ui.overlay.hidden;
  if (back) openDialog(ui.overlay, $("draftPatch"));
  if (id !== null) add(id);
  else if (back) refresh();
  ui.add.focus();
}

// The box for the drafts as the store holds them now, run again whenever the
// store replaces one and when the box opens. A row whose draft is gone goes:
// with a word while the box is open, the box closing when the last goes that
// way, and without one when the draft went while the box was closed.
function refresh() {
  const open = showing();
  const kept = [];
  const deleted = [];
  for (const row of d.rows) {
    const entry = drafts.get(row.id);
    if (entry) {
      row.doc = entry.doc;
      kept.push(row);
    } else {
      row.u.box.remove();
      deleted.push(nameOf(row));
    }
  }
  d.rows = kept;
  for (const row of d.rows) load(row);
  retarget(d, discLayout(), ui.clash);
  if (!d.disc) layoutFits();
  additions();
  ui.clear.disabled = !d.rows.length;
  reflectDiscs(ui.bar, d);
  if (d.disc) placed();
  else {
    downloads();
    play();
  }
  if (!open) return;
  if (deleted.length && !kept.length) {
    closeDialog();
    toast(gone(deleted[0]));
  } else for (const name of deleted) toast(left(name));
}

// What a row shows of its level and what the placer takes of it: its name, how
// it plays, its checks, and its stream at the disc's level and its length at
// the recompressing one.
function load(row) {
  row.u.name.textContent = nameOf(row);
  row.u.plays.textContent = playsAs(row.doc);
  row.blocked = checks(row);
  row.stream = null;
  try {
    const level = writeKwl(row.doc);
    row.stream = deflate(level, LEVEL);
    row.size9 = deflate(level, RECOMPRESS).length;
  } catch (e) {
    row.blocked = ERRORS;
    row.u.checks.append(
      el("p", { className: "errors", textContent: `The level cannot be written: ${e.message}.` }),
    );
  }
}

/** The other drafts this browser holds, for the select that adds a row, and a file after them. */
function additions() {
  const taken = new Set(d.rows.map((row) => row.id));
  const others = drafts.list().filter((entry) => !taken.has(entry.id));
  ui.add.textContent = "";
  ui.add.append(
    el("option", { value: "", textContent: ADD, disabled: true }),
    ...others.map((entry) =>
      el("option", { value: String(entry.id), textContent: entry.doc.title || UNTITLED }),
    ),
    el("option", { value: PICKER, textContent: FILE }),
  );
  ui.add.selectedIndex = 0;
}

/** The checks' findings in the row, and the sentence that keeps the patches back, or null. */
function checks(row) {
  const box = row.u.checks;
  box.textContent = "";
  const hides = skinsTable()?.hides;
  const findings = validate(row.doc, hides, NAMES);
  const errors = findings.filter((f) => f.level === ERROR);
  const warnings = findings.filter((f) => f.level !== ERROR);
  const items = (fs) =>
    el(
      "ul",
      {},
      fs.map((f) => el("li", { textContent: describe(f) })),
    );
  if (!hides) box.append(el("p", { className: "errors", textContent: NO_TABLE }));
  if (errors.length)
    box.append(
      el("div", { className: "errors" }, items(errors)),
      el("p", { className: "errors", textContent: ERRORS }),
    );
  if (warnings.length)
    box.append(
      el(
        "details",
        { className: "warnings" },
        el("summary", { textContent: plural(warnings.length, "warning") }),
        items(warnings),
      ),
    );
  if (!findings.length && hides) box.append(el("p", { className: "sub", textContent: CLEAN }));
  if (errors.length) return ERRORS;
  return hides ? null : NO_TABLE;
}

// --- the slot chosen -----------------------------------------------------------------------

function choose(row, into) {
  if (!into) return;
  const entry = drafts.get(row.id);
  if (entry && entry.doc.into !== into) {
    row.doc = setMeta(entry.doc, { into });
    edit(row.id, row.doc, "changed the target slot", { merge: true });
  }
  refresh();
}

// --- the disc chosen -----------------------------------------------------------------------

function chooseDisc(id) {
  if (id === d.chosen || d.release !== null) return;
  d.chosen = id;
  d.picked = true;
  refresh();
}

// --- the fits from the layout --------------------------------------------------------------

// The fits from the packs' layout, each pack's rows fitted in order; a row on a
// slot an earlier row takes is not fitted and shows none.
function layoutFits() {
  const layout = discLayout();
  const byPack = new Map();
  const taken = new Set();
  for (const row of d.rows) {
    if (row.into === null) continue;
    const later = taken.has(row.into);
    taken.add(row.into);
    row.u.fit.textContent = layout || later ? "" : NO_LAYOUT;
    if (!layout || !row.stream || later) continue;
    const [pack] = split(row.into);
    if (!byPack.has(pack)) byPack.set(pack, []);
    byPack.get(pack).push(row);
  }
  for (const [pack, rows] of byPack) {
    const p = layout.packs.find((q) => q.path === pack);
    if (!p) {
      for (const row of rows) row.u.fit.textContent = NO_LAYOUT;
      continue;
    }
    try {
      const fits = fitAll(
        p,
        rows.map((row) => ({
          slot: split(row.into)[1],
          size: row.stream.length,
          size9: row.size9,
          title: row.doc.title,
        })),
      );
      rows.forEach((row, i) => (row.u.fit.textContent = fitText(fits[i])));
    } catch {
      for (const row of rows) row.u.fit.textContent = tooBig(pack, rows.length > 1);
    }
  }
}

// --- the image -----------------------------------------------------------------------------

// The packs of the image's own directory, which stand in for the layout where it could not be loaded.
async function packsOf(disc) {
  const out = [];
  for (const path of PACKS) {
    if (!keyShaped(`${path}#0`) || !disc.files.has(path)) continue;
    try {
      const pak = readPak(await disc.readFile(path));
      out.push({ path, slots: pak.names.map((name) => ({ name })) });
    } catch {
      continue;
    }
  }
  return out;
}

async function take(file) {
  if (typeof DecompressionStream !== "function") {
    ui.status.textContent = OLDER;
    return;
  }
  const mine = ++turn;
  d.file = file;
  d.disc = null;
  d.packs = null;
  d.release = null;
  d.placed = null;
  d.image = null;
  d.imageName = null;
  ui.status.textContent = `Reading ${file.name}…`;
  downloads();
  play();
  reflectDiscs(ui.bar, d);
  let disc;
  let known;
  let packs = null;
  try {
    if (await isIso(file)) throw new Error(RAW_ONLY);
    disc = await openDisc(file);
    known = await identify(disc, releases());
    if (!layoutOf(known.release ?? d.chosen)) packs = await packsOf(disc);
  } catch (e) {
    if (mine !== turn) return;
    ui.status.textContent =
      e.message === RAW_ONLY
        ? `${file.name} ${RAW_ONLY}.`
        : `${file.name} does not read as a disc image: ${e.message}.`;
    return;
  }
  if (mine !== turn) return;
  d.disc = disc;
  d.packs = packs;
  d.release = known.release;
  if (d.release) d.chosen = d.release;
  ui.status.textContent = readAs(file.name, releaseOf(d.release));
  retarget(d, discLayout(), ui.clash);
  reflectDiscs(ui.bar, d);
  await placed(mine);
}

const itemOf = (row) => {
  const [pack, slot] = split(row.into);
  return { pack, slot, stream: row.stream, title: row.doc.title };
};

// The fits of the rows above the first the image refuses, planned in order.
async function before(file, items) {
  let fits = [];
  for (let n = 1; n < items.length; n++) {
    try {
      fits = (await planAll(file, items.slice(0, n), inflate, releases())).placed.map((p) => p.fit);
    } catch {
      break;
    }
  }
  return fits;
}

// The plan for the rows on the image, each level placed over it as the rows
// above leave it, read back through the verifier over the patched image before
// the downloads are offered; a refusal lands on the row of the first level the
// image will not take, and while the rows cannot be placed as they stand the
// fits come from the layout.
async function placed(mine = ++turn) {
  const { file, rows } = d;
  d.placed = null;
  d.image = null;
  ui.warnings.textContent = "";
  downloads();
  play();
  if (!rows.length || d.clashed || rows.some((row) => row.into === null || !row.stream)) {
    layoutFits();
    for (const row of rows)
      if (row.into !== null && !row.stream) row.u.fit.textContent = cannot(UNWRITTEN);
    return;
  }
  const items = rows.map(itemOf);
  let planned;
  let image;
  try {
    planned = await planAll(file, items, inflate, releases());
    image = patchedImage(file, planned.writes);
    await verifyAll(await openDisc(image), items, planned, inflate);
  } catch (e) {
    const fits = await before(file, items);
    if (mine !== turn) return;
    rows.forEach((row, i) => {
      row.u.fit.textContent =
        i < fits.length ? fitText(fits[i]) : i === fits.length ? cannot(e.message) : "";
    });
    return;
  }
  if (mine !== turn) return;
  d.placed = planned;
  d.image = image;
  rows.forEach((row, i) => (row.u.fit.textContent = fitText(planned.placed[i].fit)));
  for (const w of planned.warnings) ui.warnings.append(el("li", { textContent: w }));
  downloads();
  play();
}

// --- the downloads and the saving ----------------------------------------------------------

function downloads() {
  const ready = offered();
  for (const control of [ui.ppf, ui.xdelta, ui.image, ui.cue]) control.disabled = !ready;
  ui.ready.textContent = readiness();
}

function readiness() {
  if (!d.rows.length) return NO_LEVELS;
  if (!d.placed) {
    if (!d.file) return NO_IMAGE;
    if (d.clashed) return CLASHED;
    return d.rows.some((row) => row.into === null) ? CHOOSE : "";
  }
  return blocked() ?? READY;
}

function play() {
  const lines = offered() ? placements(d.file.name, base(), releaseOf(d.chosen)?.boot ?? null) : [];
  ui.play.textContent = "";
  for (const line of lines) ui.play.append(el("li", { textContent: line }));
  ui.playing.hidden = !lines.length;
}

async function save(control, write) {
  drafts.flush();
  const text = control.textContent;
  control.disabled = true;
  control.textContent = "writing…";
  let failed = null;
  try {
    await write();
  } catch (e) {
    failed = `Saving ${text} failed: ${e.message}.`;
  }
  control.textContent = text;
  if (!showing()) return;
  downloads();
  if (failed) ui.ready.textContent = failed;
}

// The patched disc through the browser's own picker where it has one, else as
// a download; a write that fails once the file is chosen says so.
async function saveImage() {
  const name = `${base()}.bin`;
  const image = d.image;
  const fallback = () => {
    download(name, image, BINARY);
    d.imageName = name;
  };
  if (typeof showSaveFilePicker !== "function") return fallback();
  let handle;
  try {
    handle = await showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "Disc image", accept: { [BINARY]: [".bin"] } }],
    });
  } catch (e) {
    if (e.name !== "AbortError") fallback();
    return;
  }
  let out = null;
  try {
    out = await handle.createWritable();
    await out.write(image);
    await out.close();
  } catch (e) {
    await out?.abort().catch(() => {});
    throw new Error(`${handle.name} could not be written: ${e.message}`);
  }
  d.imageName = handle.name;
}
