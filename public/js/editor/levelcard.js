// The Level card: the form that edits the shown draft and the box that adds
// it to a bundle, and beside them the name a draft shows, the author it
// remembers and the press-again confirm.
import { $, el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import {
  NAMES,
  worldName,
  markerColour,
  skinsTable,
  circuitPhrase,
  theCircuit,
  levelClock,
} from "../viewer/data.js";
import { releases, rulesOf } from "../viewer/release.js";
import { say, describeLevel } from "../viewer/chrome/a11y.js";
import { toast } from "../viewer/ui/toast.js";
import { closeDialog, openDialog } from "../viewer/ui/dialog.js";
import { download, slug } from "../viewer/ui/download.js";
import { COLOURS, facesOf, writeKwl } from "../format/kwl.js";
import { TEXT_MOST, UNTITLED, setCircuit, setMeta, writeProject } from "../format/project.js";
import { ERROR, TIME_LIMIT, circuitMembers, playsAs, timeOf, validate } from "../format/checks.js";
import { UNTITLED_BUNDLE, writeBundle } from "../format/bundle.js";
import { shareLevel } from "./sharedialog.js";
import { slotName } from "./shipped.js";
import { readWith } from "./intake.js";
import { openPatchDialog } from "./patchdialog.js";
import { edit as step } from "./trail.js";
import { placeLine, playsLine, stateLine } from "./draftwords.js";
import * as drafts from "./drafts.js";
import { TYPE } from "../format/lattice.js";

// --- the words and the constants -----------------------------------------------------------
const CONFIRM_MS = 4000;
const NOTE_MS = 2000;
const TITLE_LENGTH = 80;
const AUTHOR = "kula.author";
const HOW = "kula.plays";
const TIME_RANGE = `The time is from 1 to ${TIME_LIMIT}.`;
const GAME_FILE = "application/octet-stream";
const NO_KEY = "How the game plays the level while it has no key";
const HAS_KEY =
  "A level with a key plays as an arcade level. Take every key away to choose how it plays.";
const NO_MEMBERS = "nothing of this colour";
const ARCADE = [["arcade", "Arcade level"]];
const KEYLESS = [
  ["bonus", "Bonus level"],
  ["simon", "Simon room"],
];
const NEW_BUNDLE = "new";
const BUNDLE_NOTE = "A bundle is a set of your levels in play order, saved as one file.";
// What the card's button and its box say of a level in no bundle, and of a level in one.
const ADDING = {
  label: "add to a bundle…",
  tip: "Add this level to a bundle of your levels, or make one",
  heading: "Add to a bundle",
  act: "add",
  pick: "The bundle to add this level to",
};
const MOVING = {
  label: "move to another bundle…",
  tip: "Move this level to another bundle, or to a new one",
  heading: "Move to another bundle",
  act: "move",
  pick: "The bundle to move this level to",
};
const GONE = "That bundle is gone from this browser; choose another.";
const leaves = (level, bundle) => `${level} leaves ${bundle} when it is moved to another bundle.`;

// --- the helpers ---------------------------------------------------------------------------
export const nameOf = (doc) => doc.title || UNTITLED;
/** A step the card takes is not announced, and clears what the panel last said. */
const quietly = (id, next, label, opts) => {
  step(id, next, label, opts);
  say("");
};
const keyed = (doc) => doc.blocks.some((b) => facesOf(b).some(([, o]) => o.type === TYPE.KEY));
const startsOff = (doc, colour) => doc.circuits?.[String(colour)] === "off";
export const some = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
/** A labelled control of a card's form. */
export const field = (text, control) => el("label", {}, el("span", { textContent: text }), control);
const cut = (text) => [...text].slice(0, TITLE_LENGTH).join("");
const unsaved = (d) => d.saved === null || d.edits > 0;
export const bundleName = (b) => b.title || UNTITLED_BUNDLE;
/** How many levels of the bundle are not saved to a file: never saved, or changed since their save. */
export const unsavedIn = (b) =>
  b.levels.filter((l) => {
    const d = drafts.get(l);
    return d !== null && unsaved(d);
  }).length;

/** Make `button` ask to be pressed again within a moment before it does `act`, carrying what it reads while it asks; returns what disarms it. */
export function twice(button, label, title, act) {
  const asking = `${label}?`;
  let armed = 0;
  const disarm = () => {
    clearTimeout(armed);
    armed = 0;
    button.textContent = label;
    button.title = title;
    button.classList.remove("warn");
  };
  button.textContent = label;
  button.title = title;
  button.dataset.asking = asking;
  button.onclick = () => {
    if (!armed) {
      button.textContent = asking;
      button.title = `Press again to ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
      button.classList.add("warn");
      armed = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    act();
  };
  return disarm;
}

// --- the remembered author -----------------------------------------------------------------
/** The name typed last into an Author field in this browser, or nothing. */
function rememberedAuthor() {
  try {
    const v = localStorage.getItem(AUTHOR);
    return typeof v === "string" ? cut(v) : "";
  } catch {
    return "";
  }
}

function rememberAuthor(name) {
  try {
    if (name) localStorage.setItem(AUTHOR, cut(name));
    else localStorage.removeItem(AUTHOR);
  } catch {
    /* ignore */
  }
}

/** `doc` with the remembered name as its author where it names none. */
export function signed(doc) {
  const author = rememberedAuthor();
  return doc.author || !author ? doc : setMeta(doc, { author });
}

// --- the fold over how the level plays -----------------------------------------------------
/** Whether the fold was left open, by any card of this browser. */
function howKept() {
  try {
    return localStorage.getItem(HOW) === "open";
  } catch {
    return false;
  }
}

function keepHow(open) {
  try {
    localStorage.setItem(HOW, open ? "open" : "closed");
  } catch {
    /* ignore */
  }
}

// --- the form ------------------------------------------------------------------------------
/** Write the draft to a file, as the map's own file or as the game's level file, and mark it saved. */
function saveAs(id, game) {
  drafts.flush();
  const d = drafts.get(id);
  if (!d) return;
  const name = slug(nameOf(d.doc));
  if (game) download(`${name}.kwl`, writeKwl(d.doc), GAME_FILE);
  else download(`${name}.kula.json`, writeProject(d.doc), "application/json");
  drafts.markSaved(id);
}

/** The bundle the draft is in, with its id, or null where it is in none. */
const bundleOf = (id) => drafts.bundles().find((b) => b.levels.includes(id)) ?? null;

/** Write bundle `bid` to a file, its levels' documents in its order, and mark each of them saved. */
export function saveBundle(bid) {
  drafts.flush();
  const b = drafts.bundle(bid);
  if (!b) return;
  const { title, author, notes } = b;
  const levels = b.levels.map((l) => drafts.get(l).doc);
  download(
    `${slug(title, "bundle")}.kula-bundle.json`,
    writeBundle({ title, author, notes, levels }),
    "application/json",
  );
  for (const l of b.levels) drafts.markSaved(l);
}

/** What a copy's card says of its source: the level its slot holds on the disc it was read from. */
function copiedFrom(doc) {
  const name = slotName(doc.from, doc.fromRelease);
  return name && `Copied from ${name}`;
}

function reportFold({ lines, repairs }) {
  return el(
    "details",
    { className: "report" },
    el("summary", { textContent: readWith(repairs) }),
    el(
      "ul",
      {},
      lines.map((line) => el("li", { textContent: line })),
    ),
  );
}

/** A row of the card's buttons as a group named by its caption, which stands in the fields' own column. */
function captioned(id, caption, ...controls) {
  const row = el(
    "div",
    { className: "row named" },
    el("span", { id, className: "caption", textContent: caption }),
    el("div", { className: "acts" }, controls),
  );
  row.setAttribute("role", "group");
  row.setAttribute("aria-labelledby", id);
  return row;
}

/** The card's form for draft `id` in `box`, with the reader's report on it, if any, and `open`, which shows a draft the form makes. */
export function buildForm(id, box, { imported, open }) {
  box.textContent = "";
  const edit = (meta, label, merge = false) => {
    const d = drafts.get(id);
    if (d) quietly(id, setMeta(d.doc, meta), label, { merge });
  };
  /** Typing into `control` writes `key`, the letters of a moment as one step. */
  const typed = (control, key, label, then = () => {}) => {
    control.oninput = () => {
      edit({ [key]: control.value }, label, true);
      then(control.value);
    };
  };

  const title = el("input", {
    id: "draftTitle",
    type: "text",
    placeholder: UNTITLED,
    maxLength: TITLE_LENGTH,
    autocomplete: "off",
    spellcheck: false,
    title: "The level's title",
  });
  typed(title, "title", "changed the title");
  const source = el("p", { id: "draftFrom", className: "sub", hidden: true });
  const author = el("input", {
    id: "draftAuthor",
    type: "text",
    maxLength: TITLE_LENGTH,
    autocomplete: "off",
    spellcheck: false,
    title: "Your name, shown with the level wherever it goes",
  });
  typed(author, "author", "changed the author", rememberAuthor);
  const notes = el("textarea", {
    id: "draftNotes",
    rows: 3,
    maxLength: TEXT_MOST,
    title: "A few words about the level, shown with it wherever it goes",
  });
  typed(notes, "notes", "changed the notes");

  const world = el("select", {
    id: "draftWorld",
    title: "The world whose artwork the level wears",
  });
  for (const t of state.data.themes)
    world.append(el("option", { value: t.id, textContent: worldName(t.id) }));
  world.onchange = () => edit({ world: world.value }, "changed the world");

  const time = el("input", {
    id: "draftTime",
    type: "number",
    min: 1,
    max: TIME_LIMIT,
    step: 1,
    inputMode: "numeric",
    title: "The level's time as its file holds it, which each disc's clock counts its own way",
  });
  time.setAttribute("aria-describedby", "draftClock");
  time.onchange = () => {
    const v = timeOf(time.value);
    if (v !== null) {
      edit({ time: v }, "changed the time");
      time.value = String(v);
    } else {
      time.value = drafts.get(id)?.doc.time ?? "";
      toast(TIME_RANGE);
    }
  };

  // what each disc's clock starts at for the number the field holds
  const clock = el("p", { id: "draftClock", className: "sub" });
  const starts = (doc) =>
    releases()
      .filter((r) => rulesOf(r.id))
      .map((r) => `${levelClock(doc, r.id)} on ${r.label}`);
  const listed = (xs) =>
    xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs.join("");

  const mode = el("select", { id: "draftMode" });
  mode.onchange = () => edit({ simon: mode.value === "simon" }, "changed how the level plays");
  let offered = null;
  const offer = (key, value) => {
    if (offered === key) {
      set(mode, value);
      return;
    }
    offered = key;
    mode.replaceChildren(
      ...(key ? ARCADE : KEYLESS).map(([v, text]) => el("option", { value: v, textContent: text })),
    );
    mode.disabled = key;
    mode.title = key ? HAS_KEY : NO_KEY;
    mode.value = value;
  };
  const hidden = el("input", { id: "draftHidden", type: "checkbox" });
  hidden.onchange = () => edit({ hidden: hidden.checked }, "changed the hidden level setting");
  const afar = el("input", { id: "draftAfar", type: "checkbox" });
  afar.onchange = () =>
    edit({ invisibleFromAfar: afar.checked }, "changed the invisible blocks setting");
  const circuits = circuitRows(id);
  const plays = el("p", { id: "draftPlays", className: "plays" });
  const digest = el("span", { className: "digest" });
  const stateText = el("span", { id: "draftState" });
  const note = el("span", {
    className: "note",
    textContent: "Kept in this browser",
    hidden: true,
  });
  let noteTimer = 0;
  const errors = el("p", { id: "draftErrors", className: "errors", hidden: true });

  const saveJson = el("button", {
    id: "draftSaveJson",
    type: "button",
    textContent: "save as .json",
    title: "Save this level as the map's own .json file",
  });
  saveJson.onclick = () => saveAs(id, false);
  const saveKwl = el("button", {
    id: "draftSaveKwl",
    className: "quiet",
    type: "button",
    textContent: "save as .kwl",
    title: "Save this level as the .kwl file the game loads",
  });
  saveKwl.onclick = () => saveAs(id, true);
  const patch = el("button", {
    id: "draftPatch",
    type: "button",
    textContent: "patch the game's disc…",
    title: "Make a patch that puts this level on the game's disc",
  });
  patch.onclick = () => openPatchDialog(id);
  const share = el("button", {
    id: "draftShare",
    type: "button",
    textContent: "share…",
    title: "Share this level by a link that carries it whole",
  });
  share.onclick = () => shareLevel(id, () => saveAs(id, false));

  const place = el("span", { id: "draftPlace", className: "place", hidden: true });
  const toBundle = el("button", {
    id: "draftBundle",
    className: "quiet",
    type: "button",
    textContent: ADDING.label,
    title: ADDING.tip,
  });
  toBundle.onclick = () => addToBundle(id);
  const unbundle = el("button", {
    id: "draftUnbundle",
    className: "quiet",
    type: "button",
    textContent: "take out",
    title: "Take this level out of its bundle; the level stays",
    hidden: true,
  });
  unbundle.onclick = () => {
    const b = bundleOf(id);
    if (!b) return;
    toBundle.focus();
    drafts.updateBundle(b.id, { levels: b.levels.filter((l) => l !== id) });
    say(`Took ${nameOf(drafts.get(id).doc)} out of ${bundleName(b)}.`);
  };

  const duplicate = el("button", {
    className: "quiet",
    type: "button",
    textContent: "duplicate",
    title: "Make a copy of this level",
  });
  duplicate.onclick = () => open(drafts.duplicate(id), "Copied the level");

  const del = el("button", { className: "quiet far", type: "button" });
  const disarm = twice(del, "delete", "Delete this level from this browser", () => {
    const name = nameOf(drafts.get(id).doc);
    drafts.remove(id);
    $("draftNew").focus();
    say(`Deleted ${name}. ${describeLevel(state.lvl)}`);
  });

  // A card is built for each level, so each reads how the fold was left.
  const how = el(
    "details",
    { id: "draftHow", className: "how", open: howKept() },
    el("summary", {}, "How it plays ", digest),
    field("Time", time),
    clock,
    field("Plays as", mode),
    plays,
    el("label", { className: "check" }, hidden, " Hidden level"),
    el("label", { className: "check" }, afar, " Invisible blocks show from afar"),
    circuits.box,
  );
  how.addEventListener("toggle", () => keepHow(how.open));

  box.append(
    imported?.id === id && imported.lines.length ? reportFold(imported) : [],
    el("h3", { id: "draftHeading", textContent: "Level" }),
    field("Title", title),
    source,
    el("p", { className: "state" }, stateText, note),
    errors,
    captioned("draftFileCaption", "File", saveJson, saveKwl),
    captioned("draftShareCaption", "Share", share),
    captioned("draftGameCaption", "Game", patch),
    captioned("draftBundleCaption", "Bundle", place, unbundle, toBundle),
    el("div", { className: "row last" }, duplicate, del),
    field("Author", author),
    field("Notes", notes),
    field("World", world),
    how,
  );

  const set = (control, value) => {
    if (document.activeElement !== control) control.value = value;
  };
  return {
    id,
    sync(d) {
      set(title, d.doc.title);
      source.textContent = copiedFrom(d.doc);
      source.hidden = !source.textContent;
      set(author, d.doc.author ?? "");
      set(notes, d.doc.notes ?? "");
      set(world, d.doc.world);
      set(time, String(d.doc.time));
      const at = starts(d.doc);
      clock.hidden = !at.length;
      clock.textContent = at.length ? `The clock starts at ${listed(at)}.` : "";
      const key = keyed(d.doc);
      const kind = key ? "arcade" : d.doc.simon ? "simon" : "bonus";
      offer(key, kind);
      digest.textContent = playsLine(
        kind,
        !!d.doc.hidden,
        d.doc.time === undefined ? null : levelClock(d.doc),
      );
      hidden.checked = !!d.doc.hidden;
      afar.checked = !!d.doc.invisibleFromAfar;
      circuits.sync(d.doc);
      plays.textContent = playsAs(d.doc);
      stateText.textContent = stateLine(worldName(d.doc.world), d);
      const n = validate(d.doc, skinsTable()?.hides, NAMES).filter((f) => f.level === ERROR).length;
      errors.hidden = n === 0;
      errors.textContent = n ? `${n} error${n === 1 ? "" : "s"}, listed under the level line` : "";
      saveJson.classList.toggle("unsaved", unsaved(d));
      const b = bundleOf(id);
      const words = b ? MOVING : ADDING;
      toBundle.textContent = words.label;
      toBundle.title = words.tip;
      unbundle.hidden = !b;
      place.hidden = !b;
      place.textContent = b
        ? placeLine(bundleName(b), b.levels.indexOf(id) + 1, b.levels.length)
        : "";
    },
    wrote() {
      note.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => (note.hidden = true), NOTE_MS);
    },
    drop() {
      disarm();
      clearTimeout(noteTimer);
    },
  };
}

// --- the add-to-a-bundle box ---------------------------------------------------------------
let adding = null;

function buildAdd() {
  const x = el("button", {
    className: "x",
    type: "button",
    title: "Close (Esc)",
    textContent: "×",
  });
  x.setAttribute("aria-label", "Close");
  const u = {
    heading: el("h3", { id: "bundleHeading" }),
    pick: el("select", { id: "bundlePick" }),
    title: el("input", {
      id: "bundleTitle",
      type: "text",
      placeholder: UNTITLED_BUNDLE,
      maxLength: TITLE_LENGTH,
      autocomplete: "off",
      spellcheck: false,
      title: "The new bundle's title",
    }),
    says: el("p", { id: "bundleSays", className: "says" }),
    add: el("button", { id: "bundleAdd", type: "button" }),
    cancel: el("button", { id: "bundleCancel", type: "button", textContent: "cancel" }),
    titleRow: null,
    id: 0,
  };
  u.titleRow = el("label", { className: "field" }, el("span", { textContent: "Title" }), u.title);
  u.says.setAttribute("aria-live", "polite");
  u.pick.onchange = () => (u.titleRow.hidden = u.pick.value !== NEW_BUNDLE);
  u.add.onclick = () => addTo(u);
  u.cancel.onclick = closeDialog;
  const enter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTo(u);
    }
  };
  u.pick.onkeydown = enter;
  u.title.onkeydown = enter;
  const box = el(
    "div",
    { className: "box settings bundle" },
    x,
    u.heading,
    el("p", { id: "bundleNote", textContent: BUNDLE_NOTE }),
    el("label", { className: "field" }, el("span", { textContent: "Bundle" }), u.pick),
    u.titleRow,
    u.says,
    el("div", { className: "row" }, u.add, u.cancel),
  );
  u.overlay = el("div", { id: "bundle", className: "modal", hidden: true }, box);
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "bundleHeading");
  document.body.append(u.overlay);
  return u;
}

/** Offer the bundles the level is not in, by title, and a new bundle, whose title field shows while it is the choice. */
function offer(u, own) {
  const others = drafts.bundles().filter((b) => b.id !== own?.id);
  u.pick.replaceChildren(
    ...others.map((b) => el("option", { value: String(b.id), textContent: bundleName(b) })),
    el("option", { value: NEW_BUNDLE, textContent: "a new bundle" }),
  );
  u.pick.selectedIndex = 0;
  u.titleRow.hidden = u.pick.value !== NEW_BUNDLE;
}

/** Open the box for draft `id`, worded as an add or, where it is in a bundle, as a move that says which bundle it leaves: which bundle it goes to, or the title of a new one. */
function addToBundle(id) {
  const d = drafts.get(id);
  if (!d) return;
  adding ??= buildAdd();
  const u = adding;
  u.id = id;
  const own = bundleOf(id);
  const words = own ? MOVING : ADDING;
  u.heading.textContent = words.heading;
  u.add.textContent = words.act;
  u.pick.title = words.pick;
  offer(u, own);
  u.title.value = "";
  u.says.textContent = own ? leaves(nameOf(d.doc), bundleName(own)) : "";
  openDialog(u.overlay, $("draftBundle"));
  (u.titleRow.hidden ? u.pick : u.title).focus();
}

// The level goes last in the bundle chosen, or alone into a fresh one with the
// remembered name as its author, and leaves the bundle it is in.
function addTo(u) {
  const d = drafts.get(u.id);
  if (!d) {
    closeDialog();
    return;
  }
  const from = bundleOf(u.id);
  const fresh = u.pick.value === NEW_BUNDLE;
  let to = fresh ? null : drafts.bundle(Number(u.pick.value));
  if (fresh) {
    const bid = drafts.createBundle({
      title: cut(u.title.value),
      author: rememberedAuthor(),
      levels: [u.id],
    });
    to = bid === null ? null : drafts.bundle(bid);
  } else if (to) {
    drafts.updateBundle(Number(u.pick.value), { levels: [...to.levels, u.id] });
  } else {
    offer(u, from);
    u.says.textContent = GONE;
    return;
  }
  closeDialog();
  if (!to) return;
  const name = nameOf(d.doc);
  const into = fresh ? `a new bundle, ${bundleName(to)}` : bundleName(to);
  say(from ? `Moved ${name} from ${bundleName(from)} to ${into}.` : `Added ${name} to ${into}.`);
}

// --- the circuits --------------------------------------------------------------------------
/** The four circuits: each colour's lamp, whether it starts on, as a toggle, and what it has. */
function circuitRows(id) {
  const box = el("div", { className: "circuits" });
  box.setAttribute("role", "group");
  box.setAttribute("aria-labelledby", "draftCircuits");
  box.append(el("span", { id: "draftCircuits", textContent: "Circuits" }));
  const rows = [];
  for (let colour = 0; colour < COLOURS; colour++) {
    const lamp = el("span", { className: "lamp" });
    lamp.style.setProperty(
      "--lamp",
      markerColour({ type: TYPE.SWITCH, face: 0, variant: String(colour) }),
    );
    lamp.setAttribute("aria-hidden", "true");
    const toggle = el("button", {
      id: `draftCircuit${colour}`,
      className: "quiet",
      type: "button",
    });
    toggle.setAttribute("aria-label", circuitPhrase(colour));
    toggle.onclick = () => {
      const d = drafts.get(id);
      if (!d) return;
      const off = startsOff(d.doc, colour);
      quietly(
        id,
        setCircuit(d.doc, colour, off ? "on" : "off"),
        `turned ${theCircuit(colour)} ${off ? "on" : "off"}`,
      );
    };
    const members = el("span", { className: "members" });
    const row = el("div", { className: "circuit" }, lamp, toggle, members);
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "Circuit");
    box.append(row);
    rows.push({ colour, toggle, members });
  }
  return {
    box,
    sync(doc) {
      const tally = membersOf(doc);
      for (const { colour, toggle, members } of rows) {
        const off = startsOff(doc, colour);
        toggle.textContent = `starts ${off ? "off" : "on"}`;
        toggle.title = `Turn ${theCircuit(colour)} ${off ? "on" : "off"}`;
        toggle.setAttribute("aria-pressed", String(!off));
        members.textContent = tally[colour];
      }
    },
  };
}

/** What each colour has, as a line: its switches, teleporters and lasers, or that it has none. */
function membersOf(doc) {
  return circuitMembers(doc).map(
    ({ switches, teleporters, lasers }) =>
      [
        switches && some(switches, "switch", "switches"),
        teleporters && some(teleporters, "teleporter"),
        lasers && some(lasers, "laser"),
      ]
        .filter(Boolean)
        .join(", ") || NO_MEMBERS,
  );
}
