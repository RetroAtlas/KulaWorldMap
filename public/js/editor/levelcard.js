// The Level card: the form that edits the shown draft, and beside it the
// name a draft shows, the author it remembers and the press-again confirm.
import { $, el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import {
  NAMES,
  worldName,
  levelTitle,
  markerColour,
  skinsTable,
  circuitPhrase,
  theCircuit,
  levelClock,
} from "../viewer/data.js";
import { BASE, discWord, levelOn, releaseOf, releases, rulesOf } from "../viewer/release.js";
import { say, describeLevel } from "../viewer/chrome/a11y.js";
import { toast } from "../viewer/ui/toast.js";
import { COLOURS, facesOf, levelKey, writeKwl } from "../format/kwl.js";
import { TEXT_MOST, UNTITLED, setCircuit, setMeta, writeProject } from "../format/project.js";
import { ERROR, TIME_LIMIT, circuitMembers, playsAs, timeOf, validate } from "../format/checks.js";
import { download, slug } from "./files.js";
import { shareLevel } from "./sharedialog.js";
import { readWith } from "./intake.js";
import { openPatchDialog } from "./patchdialog.js";
import { edit as step } from "./trail.js";
import * as drafts from "./drafts.js";
import { TYPE } from "../format/lattice.js";

// --- the words and the constants -----------------------------------------------------------
const CONFIRM_MS = 4000;
const NOTE_MS = 2000;
const TITLE_LENGTH = 80;
const AUTHOR = "kula.author";
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

// --- the helpers ---------------------------------------------------------------------------
export const nameOf = (doc) => doc.title || UNTITLED;
/** A step the card takes is not announced, and clears what the panel last said. */
const quietly = (id, next, label, opts) => {
  step(id, next, label, opts);
  say("");
};
const keyed = (doc) => doc.blocks.some((b) => facesOf(b).some(([, o]) => o.type === TYPE.KEY));
const startsOff = (doc, colour) => doc.circuits?.[String(colour)] === "off";
const some = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
const cut = (text) => [...text].slice(0, TITLE_LENGTH).join("");
const unsaved = (d) => d.saved === null || d.edits > 0;

/** Make `button` ask to be pressed again within a moment before it does `act`; returns what disarms it. */
export function twice(button, label, title, act) {
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
  button.onclick = () => {
    if (!armed) {
      button.textContent = `${label}?`;
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

/** What a copy's card says of its source: the level its slot holds on the disc it was read from. */
function copiedFrom(doc) {
  const slot = state.data.levels.find((l) => levelKey(l.pack, l.index) === doc.from);
  if (!slot) return "";
  const disc = releaseOf(doc.fromRelease) ? doc.fromRelease : BASE;
  const title = levelTitle(levelOn(slot, disc));
  return disc === BASE
    ? `Copied from ${title}`
    : `Copied from ${title} on the ${discWord(disc)} disc`;
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

/** The card's form for draft `id` in `box`, with the reader's report on it, if any, and `open`, which shows a draft the form makes. */
export function buildForm(id, box, { imported, open }) {
  box.textContent = "";
  const edit = (meta, label, merge = false) => {
    const d = drafts.get(id);
    if (d) quietly(id, setMeta(d.doc, meta), label, { merge });
  };
  const field = (text, control) => el("label", {}, el("span", { textContent: text }), control);
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
    type: "button",
    textContent: "save as .kwl",
    title: "Save this level as the .kwl file the game loads",
  });
  saveKwl.onclick = () => saveAs(id, true);
  const patch = el("button", {
    id: "draftPatch",
    type: "button",
    textContent: "put it on the disc…",
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
  const note = el("span", {
    className: "note",
    textContent: "Saved in this browser",
    hidden: true,
  });
  let noteTimer = 0;

  const duplicate = el("button", {
    type: "button",
    textContent: "duplicate",
    title: "Make a copy of this level",
  });
  duplicate.onclick = () => open(drafts.duplicate(id), "Copied the level");

  const del = el("button", { type: "button" });
  const disarm = twice(del, "delete", "Delete this level from this browser", () => {
    const name = nameOf(drafts.get(id).doc);
    $("draftNew").focus();
    drafts.remove(id);
    say(`Deleted ${name}. ${describeLevel(state.lvl)}`);
  });

  box.append(
    imported?.id === id && imported.lines.length ? reportFold(imported) : [],
    el("h3", { textContent: "Level" }),
    field("Title", title),
    source,
    field("Author", author),
    field("Notes", notes),
    field("World", world),
    field("Time", time),
    clock,
    field("Plays as", mode),
    el("label", { className: "check" }, hidden, " Hidden level"),
    el("label", { className: "check" }, afar, " Invisible blocks show from afar"),
    circuits.box,
    plays,
    errors,
    el("div", { className: "row" }, saveJson, saveKwl, share, patch, note),
    el("div", { className: "row" }, duplicate, del),
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
      offer(key, key ? "arcade" : d.doc.simon ? "simon" : "bonus");
      hidden.checked = !!d.doc.hidden;
      afar.checked = !!d.doc.invisibleFromAfar;
      circuits.sync(d.doc);
      plays.textContent = playsAs(d.doc);
      const n = validate(d.doc, skinsTable()?.hides, NAMES).filter((f) => f.level === ERROR).length;
      errors.hidden = n === 0;
      errors.textContent = n ? `${n} error${n === 1 ? "" : "s"}, listed under the level line` : "";
      saveJson.classList.toggle("unsaved", unsaved(d));
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
    const toggle = el("button", { id: `draftCircuit${colour}`, type: "button" });
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
