// A draft onto the disc, in one scrolling box: the checks, the slot it takes,
// the fit, the image and the patches, then where each emulator wants them. The
// fit is worked out from the packs' layout until the image is given and read
// from the image after, and every byte of the patches is written here.
import { el, on } from "./dom.js";
import { state } from "./state.js";
import { levelTitle, loadJson, skinsTable, worldName } from "./data.js";
import { closeDialog, openDialog } from "./dialog.js";
import { toast } from "./toast.js";
import { writeKwl } from "./kwl.js";
import { deflate } from "./deflate.js";
import { ERROR, UNTITLED, describe, playsAs, setMeta, validate } from "./project.js";
import { RAW_ONLY, download, isIso, slug } from "./files.js";
import * as drafts from "./drafts.js";
import { edit } from "./trail.js";
import { IN_PLACE, REBUILD, fit } from "./pak.js";
import { openDisc } from "./iso.js";
import { PREFIX, cue, patchedImage, placements, plan, ppf, vcdiff, verify } from "./patch.js";
import { inflate } from "./inflate.js";

const FIRST = "/HIRO/HIRO.PAK#0";
const COPYCAT = "/HIRO/COPYCAT.PAK";
const LEVEL = 6;
const BINARY = "application/octet-stream";
const PRIVATE = "The image is read here in your browser and goes nowhere else.";
const OLDER = "Making the patch needs a newer browser, one that can unpack the game's files.";
const ERRORS = "A level with errors cannot go on the disc until they are fixed.";
const CLEAN = "The checks find nothing to say.";
const NO_LAYOUT = "The disc's layout could not be loaded, so the fit waits for the image.";
const TOO_BIG = "The level is too big for the game to load from any pack.";
const LAYOUT = "Worked out from the disc as pressed; the image will confirm it.";
const FROM_IMAGE = "Read from the image.";
const NO_IMAGE = "Give the disc image above to make the patches.";
const READY = "Save what your emulator wants.";
const NO_BLOB = "This browser cannot put the patched disc together; take a patch instead.";
const LATER = "Once the disc is given, this says where each emulator wants the patch.";
const INSTEAD = "Mednafen, Beetle and RetroArch apply no patch and play the patched disc instead.";
const gone = (name) => `Another tab deleted ${name}, so the box closed without a patch.`;

let layout = null;
let ui = null;
let d = null;
// Counts what the dialog asks for, so a read or a plan that lands for an
// earlier ask is dropped.
let turn = 0;

const split = (key) => {
  const hash = key.lastIndexOf("#");
  return [key.slice(0, hash), Number(key.slice(hash + 1))];
};
const themeOf = (pack) => pack.split("/")[1];
const nameOf = () => d.doc.title || UNTITLED;
const base = () => slug(nameOf());
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const showing = () => d !== null && !ui.overlay.hidden;

function fitText(f) {
  const spare = `with ${plural(f.room, "byte")} to spare`;
  if (f.path === IN_PLACE) return `It fits in the slot's own bytes, ${spare}.`;
  if (f.path === REBUILD)
    return f.recompressed
      ? `The pack is laid out again, with the other levels packed tighter, to make room, ${spare}.`
      : `The pack is laid out again to make room, ${spare}.`;
  return `The pack moves into the disc's free sectors, ${spare}.`;
}

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
    name: el("p", { className: "name" }),
    plays: el("p", { id: "patchPlays" }),
    checks: el("div", { id: "patchChecks" }),
    slot: el("select", { id: "patchSlot", title: "The slot the level takes on the disc" }),
    reach: el("p", { id: "patchReach" }),
    wear: el("p", { id: "patchWear", className: "sub" }),
    fit: el("p", { id: "patchFit" }),
    from: el("p", { id: "patchFrom", className: "sub" }),
    warnings: el("ul", { id: "patchWarnings", className: "warnings" }),
    disc: el("input", { id: "patchDisc", type: "file", accept: ".bin,.img,.iso" }),
    status: el("p", { id: "patchStatus" }),
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
      "Save a copy of the image with the level on it",
    ),
    cue: button(
      "patchCue",
      "its cue sheet",
      "Save the cue sheet that goes beside the patched disc",
    ),
    play: el("ul", { id: "patchPlay" }),
  };
  for (const live of [u.fit, u.status, u.ready]) live.setAttribute("aria-live", "polite");
  u.slot.onchange = () => choose(u.slot.value);
  u.disc.onchange = () => {
    const file = u.disc.files[0];
    u.disc.value = "";
    if (file) take(file);
  };
  u.ppf.onclick = () =>
    save(u.ppf, async () =>
      download(`${base()}.ppf`, await ppf(d.file, d.placed.writes, PREFIX + nameOf()), BINARY),
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
  const box = el(
    "div",
    { className: "box settings patch" },
    x,
    el("h3", { id: "patchTitle", textContent: "Put it on the disc" }),
    section("The level", u.name, u.plays, u.checks),
    section(
      "Where it goes",
      el("label", { className: "slot" }, el("span", { textContent: "Slot" }), u.slot),
      u.reach,
      u.wear,
    ),
    section("The fit", u.fit, u.from, u.warnings),
    section(
      "The disc",
      el("p", { textContent: PRIVATE }),
      drop,
      u.status,
      u.ready,
      el("div", { className: "row" }, u.ppf, u.xdelta, u.image, u.cue),
    ),
    section("Playing it", u.play, el("p", { className: "sub", textContent: INSTEAD })),
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
    if (file) take(file);
  };
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "patchTitle");
  document.body.append(u.overlay);
  on("drafts-moved", (pairs) => {
    const to = pairs.find(([from]) => from === d?.id)?.[1];
    if (to !== undefined) d.id = to;
  });
  on("drafts-merged", (ids) => {
    if (showing() && ids.includes(d.id)) refresh();
  });
  on("drafts-changed", () => {
    if (showing() && drafts.get(d.id)?.doc !== d.doc) refresh();
  });
  return u;
}

/** Open the dialog for the draft with this id. */
export async function openPatchDialog(id) {
  if (!drafts.get(id)) return;
  turn++;
  ui ??= build();
  // Only the id while the layout loads, so the drafts-moved handler can keep it current.
  d = { id };
  layout ??= await loadJson("packs.json");
  id = d.id;
  if (!drafts.get(id)) return;
  d = { id, file: null, disc: null, placed: null, image: null, imageName: null };
  ui.disc.value = "";
  ui.status.textContent = "";
  refresh();
  openDialog(ui.overlay);
}

// The box for the draft as the store holds it now, run again whenever the store replaces it.
function refresh() {
  const entry = drafts.get(d.id);
  if (!entry) {
    const name = nameOf();
    turn++;
    d = null;
    closeDialog();
    toast(gone(name));
    return;
  }
  d.doc = entry.doc;
  ui.name.textContent = nameOf();
  ui.plays.textContent = playsAs(d.doc);
  d.errors = checks();
  d.stream = null;
  try {
    d.stream = deflate(writeKwl(d.doc), LEVEL);
  } catch (e) {
    d.errors = true;
    ui.checks.append(
      el("p", { className: "errors", textContent: `The level cannot be written: ${e.message}.` }),
    );
  }
  slots();
  d.into = pick();
  ui.slot.value = d.into;
  target();
  if (d.disc) placed();
  else {
    downloads();
    play();
  }
}

function checks() {
  const box = ui.checks;
  box.textContent = "";
  const hides = skinsTable()?.hides;
  const findings = validate(d.doc, hides);
  const errors = findings.filter((f) => f.level === ERROR);
  const warnings = findings.filter((f) => f.level !== ERROR);
  const items = (fs) =>
    el(
      "ul",
      {},
      fs.map((f) => el("li", { textContent: describe(f) })),
    );
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
  if (!findings.length) box.append(el("p", { className: "sub", textContent: CLEAN }));
  return errors.length > 0;
}

function slots() {
  ui.slot.textContent = "";
  if (!layout) return;
  const titles = new Map(state.data.levels.map((l) => [`${l.pack}#${l.index}`, levelTitle(l)]));
  d.titles = titles;
  const copycat = skinsTable()?.copycat ?? COPYCAT;
  const groups = new Map();
  for (const p of layout.packs) {
    if (p.path === copycat) continue;
    const theme = themeOf(p.path);
    if (!groups.has(theme)) {
      groups.set(theme, el("optgroup", { label: worldName(theme) }));
      ui.slot.append(groups.get(theme));
    }
    p.slots.forEach((s, i) => {
      const key = `${p.path}#${i}`;
      groups
        .get(theme)
        .append(el("option", { value: key, textContent: titles.get(key) ?? s.name }));
    });
  }
}

function pick() {
  const options = new Set([...ui.slot.options].map((o) => o.value));
  for (const key of [d.doc.into, d.doc.from])
    if (key != null && options.has(String(key))) return String(key);
  return options.has(FIRST) || !options.size ? FIRST : ui.slot.options[0].value;
}

function choose(into) {
  const entry = drafts.get(d.id);
  if (entry) {
    d.doc = setMeta(entry.doc, { into });
    edit(d.id, d.doc, "changed the target slot");
  }
  refresh();
}

function target() {
  const [pack, index] = split(d.into);
  const theme = themeOf(pack);
  const title = d.titles?.get(d.into) ?? `slot ${index + 1}`;
  const world = worldName(theme);
  if (d.into === FIRST) ui.reach.textContent = `A new game starts here, at ${title}.`;
  else if (pack.endsWith("FI.PAK"))
    ui.reach.textContent = `The game reaches it where it reaches ${title}, once ${world} is finished.`;
  else
    ui.reach.textContent = `The game reaches it where it reaches ${title}, with a save that has got that far in ${world}.`;
  ui.wear.textContent = theme === d.doc.world ? "" : `It will wear ${world}'s artwork there.`;
  if (!d.placed) layoutFit();
}

function layoutFit() {
  ui.warnings.textContent = "";
  const [pack, index] = split(d.into);
  const p = layout?.packs.find((q) => q.path === pack);
  if (!layout || !p) {
    ui.fit.textContent = NO_LAYOUT;
    ui.from.textContent = "";
    return;
  }
  if (!d.stream) {
    ui.fit.textContent = "";
    ui.from.textContent = "";
    return;
  }
  try {
    ui.fit.textContent = fitText(fit(p, index, d.stream.length, d.doc.title));
    ui.from.textContent = LAYOUT;
  } catch {
    ui.fit.textContent = TOO_BIG;
    ui.from.textContent = LAYOUT;
  }
}

async function take(file) {
  if (typeof DecompressionStream !== "function") {
    ui.status.textContent = OLDER;
    return;
  }
  const mine = ++turn;
  d.file = file;
  d.disc = null;
  d.placed = null;
  d.image = null;
  d.imageName = null;
  ui.status.textContent = `Reading ${file.name}…`;
  downloads();
  play();
  let disc;
  try {
    if (await isIso(file)) throw new Error(RAW_ONLY);
    disc = await openDisc(file);
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
  ui.status.textContent = `${file.name} is read.`;
  await placed(mine);
}

// The plan for the chosen slot on the image, read back through the verifier
// over the patched image before the downloads are offered.
async function placed(mine = ++turn) {
  const { file, disc, stream, doc } = d;
  d.placed = null;
  d.image = null;
  ui.warnings.textContent = "";
  downloads();
  play();
  const [pack, index] = split(d.into);
  let planned;
  let image;
  try {
    if (!stream) throw new Error("the level cannot be written");
    planned = await plan(disc, pack, index, stream, doc.title, inflate);
    image = patchedImage(file, planned.writes);
    await verify(await openDisc(image), pack, index, stream, planned, inflate);
  } catch (e) {
    if (mine !== turn) return;
    ui.fit.textContent = `The level cannot be placed there: ${e.message}.`;
    ui.from.textContent = FROM_IMAGE;
    return;
  }
  if (mine !== turn) return;
  d.placed = planned;
  d.image = image;
  ui.fit.textContent = fitText(planned.fit);
  for (const w of planned.warnings) ui.warnings.append(el("li", { textContent: w }));
  ui.from.textContent = FROM_IMAGE;
  downloads();
  play();
}

function downloads() {
  const ready = !!d.placed && !d.errors;
  ui.ppf.disabled = !ready;
  ui.xdelta.disabled = !ready;
  const whole = ready && d.image?.size === d.file.size;
  ui.image.disabled = !whole;
  ui.cue.disabled = !whole;
  ui.ready.textContent = readiness(whole);
}

function readiness(whole) {
  if (!d.placed) return d.file ? "" : NO_IMAGE;
  if (d.errors) return ERRORS;
  return whole ? READY : NO_BLOB;
}

function play() {
  ui.play.textContent = "";
  if (d.file && d.placed)
    for (const line of placements(d.file.name, base()))
      ui.play.append(el("li", { textContent: line }));
  else ui.play.append(el("li", { className: "sub", textContent: LATER }));
}

async function save(control, write) {
  drafts.flush();
  const text = control.textContent;
  control.disabled = true;
  control.textContent = "writing…";
  try {
    await write();
  } catch (e) {
    ui.ready.textContent = `Saving ${text} failed: ${e.message}.`;
  } finally {
    control.textContent = text;
    control.disabled = false;
  }
}

async function saveImage() {
  const name = `${base()}.bin`;
  if (typeof showSaveFilePicker === "function") {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: name,
        types: [{ description: "Disc image", accept: { [BINARY]: [".bin"] } }],
      });
      const out = await handle.createWritable();
      await out.write(d.image);
      await out.close();
      d.imageName = handle.name;
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  download(name, d.image, BINARY);
  d.imageName = name;
}
