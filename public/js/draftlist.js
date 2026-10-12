// The sidebar's "Your levels": the drafts this browser holds, and the card
// that edits the shown one.
import { $, el, emit, on } from "./dom.js";
import { state } from "./state.js";
import {
  worldName,
  levelTitle,
  markerColour,
  skinsTable,
  circuitPhrase,
  theCircuit,
} from "./data.js";
import { selectLevel, showLevel } from "./navigate.js";
import { say, describeLevel } from "./a11y.js";
import { toast } from "./toast.js";
import { COLOURS, KEY, SWITCH, facesOf, writeKwl } from "./kwl.js";
import {
  ERROR,
  UNTITLED,
  blank,
  circuitMembers,
  fromLevel,
  playsAs,
  setCircuit,
  setMeta,
  toLevel,
  validate,
  writeProject,
} from "./project.js";
import { download, readLevelFile, readLevelText, slug } from "./files.js";
import { pasteLevelLink } from "./importdialog.js";
import { openPatchDialog } from "./patchdialog.js";
import { edit as step } from "./trail.js";
import * as drafts from "./drafts.js";

const CONFIRM_MS = 4000;
const NOTE_MS = 2000;
const TITLE_LENGTH = 80;
const TIME_LIMIT = 2 ** 15 - 1;
const TIME_RANGE = `The time is a whole number of seconds from 1 to ${TIME_LIMIT}.`;
const GAME_FILE = "application/octet-stream";
const NO_KEY =
  "The level has no key, so the game plays it as a bonus level. Place a key to make it an arcade level.";
const HAS_KEY =
  "This level has a key, so the game plays it as an arcade level. Take every key away to make it a bonus level.";
const nameOf = (doc) => doc.title || UNTITLED;
/** A step the card takes is not announced, and clears what the panel last said. */
const quietly = (id, next, label, opts) => {
  step(id, next, label, opts);
  say("");
};
const keyed = (doc) => doc.blocks.some((b) => facesOf(b).some(([, o]) => o.type === KEY));
const NO_MEMBERS = "nothing of this colour";
const startsOff = (doc, colour) => doc.circuits?.[String(colour)] === "off";
const some = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

// The disc's level shown last, which deleting the shown draft returns to.
let lastDisc = 0;
// The document the level on screen was drawn from, where it is a draft.
let drawn = null;
let form = null;
// What the reader repaired in the file the shown draft was opened from.
let imported = null;

/** The level a link to a draft names, or null where this browser has none. */
export function levelFor(slot) {
  const m = /^DRAFT\/(\d+)$/.exec(slot);
  const d = m && drafts.get(Number(m[1]));
  if (!d) return null;
  drawn = d.doc;
  return toLevel(d.doc, Number(m[1]));
}

export function wireDrafts() {
  $("yours").hidden = false;
  if (state.li >= 0) lastDisc = state.li;
  $("draftNew").onclick = () => {
    const id = drafts.create(blank(state.lvl.theme));
    open(id, "Made a new level");
    if (id !== null) emit("edit-wanted");
  };
  $("draftCopy").onclick = copyShown;
  $("draftOpen").onclick = () => $("draftFile").click();
  $("draftFile").onchange = openFile;
  $("draftPaste").onclick = async () =>
    openRead(await pasteLevelLink(state.lvl.theme, readLevelText));
  $("draftExport").onclick = () => {
    const l = state.lvl;
    if (l.draft !== undefined) saveAs(l.draft, true);
    else download(`${slug(levelTitle(l))}.kwl`, writeKwl(fromLevel(l)), GAME_FILE);
  };
  on("drafts-moved", (pairs) => {
    const to = pairs.find(([from]) => from === state.lvl?.draft)?.[1];
    const d = to === undefined ? null : drafts.get(to);
    if (d) show(to, d.doc, { keepView: true, push: false, keep: state.selected?.key ?? null });
  });
  on("drafts-changed", sync);
  on("drafts-written", () => form?.wrote());
  on("level-changed", (i) => {
    if (i >= 0) lastDisc = i;
    sync();
  });
  on("level-updated", sync);
  sync();
}

function show(id, doc, opts) {
  drawn = doc;
  showLevel(toLevel(doc, id), opts);
}

/** Open a copy of the level on screen, a shipped level as the game loads it or a draft as it is. */
export function copyShown() {
  const l = state.lvl;
  if (l.draft !== undefined) open(drafts.duplicate(l.draft), "Copied the level");
  else open(drafts.create(fromLevel(l)), `Copied ${levelTitle(l)}`);
}

function open(id, verb) {
  if (id === null) return;
  show(id, drafts.get(id).doc, { push: true });
  say(`${verb}. ${describeLevel(state.lvl)}`);
}

async function openFile() {
  const input = $("draftFile");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  let read;
  try {
    read = await readLevelFile(file, file.name, state.lvl.theme);
  } catch (e) {
    toast(e.message);
    return;
  }
  openRead(read);
}

/** A level read from elsewhere becomes a draft marked saved, since the file is the record. */
function openRead(read) {
  if (!read) return;
  const id = drafts.create(read.project, { saved: Date.now() });
  if (id === null) return;
  imported = { id, lines: read.report, repairs: read.repairs };
  open(id, `Opened ${nameOf(read.project)}`);
  const { report, repairs } = read;
  if (report.length) toast(report.length === 1 ? report[0] : `${readWith(repairs)}.`);
}

/** "Read with 3 repairs", or "Read with notes" where every line is on a value kept as it was. */
const readWith = (repairs) =>
  repairs ? `Read with ${some(repairs, "repair")}` : "Read with notes";

/** Write the draft to a file, as the map's or as the game's, and mark it saved. */
function saveAs(id, game) {
  drafts.flush();
  const d = drafts.get(id);
  if (!d) return;
  const name = slug(nameOf(d.doc));
  if (game) download(`${name}.kwl`, writeKwl(d.doc), GAME_FILE);
  else download(`${name}.kula.json`, writeProject(d.doc), "application/json");
  drafts.markSaved(id);
}

// The shown draft is drawn again whenever the store's copy of it is not the
// one on screen, whichever tab changed it, and gives way to the disc's level
// once it is gone.
function sync() {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : drafts.get(id);
  if (id !== undefined && !d) {
    selectLevel(lastDisc);
    return;
  }
  if (d && d.doc !== drawn) {
    show(id, d.doc, { keepView: true, push: false, keep: state.selected?.key ?? null });
    return;
  }
  if (state.lvl)
    $("draftExport").title = `Save ${levelTitle(state.lvl)} as the file the game loads`;
  rows();
  card(id, d);
}

const unsaved = (d) => d.saved === null || d.edits > 0;

const status = (d) => {
  const base = d.saved === null ? "not saved to a file" : "saved to a file";
  if (!d.edits) return base;
  return `${base} · ${d.edits} change${d.edits === 1 ? "" : "s"}${d.saved === null ? "" : " since"}`;
};

function rows() {
  const box = $("draftRows");
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  box.textContent = "";
  const all = drafts.list();
  const unread = drafts.unreadCount();
  $("draftEmpty").hidden = all.length > 0 || unread > 0;
  for (const d of all) {
    const name = nameOf(d.doc);
    const b = el("button", { type: "button", title: `Show ${name}` });
    b.dataset.id = d.id;
    b.append(
      el("span", { className: "name", textContent: name }),
      el("span", { className: "tag", textContent: "Draft" }),
      el("span", { className: "state", textContent: status(d) }),
    );
    b.setAttribute("aria-current", state.lvl?.draft === d.id ? "true" : "false");
    b.onclick = () => show(d.id, drafts.get(d.id).doc, { push: true });
    box.append(b);
  }
  if (focused) box.querySelector(`[data-id="${focused}"]`)?.focus();
  $("draftUnread")?.remove();
  if (unread) box.after(unreadRow(unread));
}

/** Make `button` ask to be pressed again within a moment before it does `act`; returns what disarms it. */
function twice(button, label, title, act) {
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

function unreadRow(n) {
  const plural = n === 1 ? "" : "s";
  const remove = el("button", { type: "button" });
  twice(remove, "remove", "Remove what could not be read from this browser", () => {
    drafts.removeUnread();
    say(`Removed ${n} draft${plural} that could not be read.`);
  });
  return el(
    "div",
    { id: "draftUnread", className: "unread" },
    el("span", {
      className: "state",
      textContent: `${n} draft${plural} in this browser could not be read`,
    }),
    remove,
  );
}

function card(id, d) {
  const box = $("draftCard");
  if (!d) {
    form?.drop();
    form = null;
    box.textContent = "";
    box.hidden = true;
    return;
  }
  if (form?.id !== id) {
    form?.drop();
    if (imported && imported.id !== id) imported = null;
    form = buildForm(id, box);
  }
  form.sync(d);
  box.hidden = false;
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

function buildForm(id, box) {
  box.textContent = "";
  const edit = (meta, label, merge = false) => {
    const d = drafts.get(id);
    if (d) quietly(id, setMeta(d.doc, meta), label, { merge });
  };
  const field = (text, control) => el("label", {}, el("span", { textContent: text }), control);

  const title = el("input", {
    id: "draftTitle",
    type: "text",
    placeholder: UNTITLED,
    maxLength: TITLE_LENGTH,
    autocomplete: "off",
    spellcheck: false,
    title: "The level's title",
  });
  title.oninput = () => edit({ title: title.value }, "changed the title", true);

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
    title: "The seconds the clock starts at",
  });
  time.onchange = () => {
    const v = Math.round(Number(time.value));
    if (time.value !== "" && v >= 1 && v <= TIME_LIMIT) edit({ time: v }, "changed the time");
    else {
      time.value = drafts.get(id)?.doc.time ?? "";
      toast(TIME_RANGE);
    }
  };

  const bonus = el("input", { id: "draftBonus", type: "checkbox", disabled: true });
  bonus.setAttribute("aria-describedby", "draftBonusSays");
  const bonusSays = el("p", { id: "draftBonusSays", hidden: true });
  const bonusLabel = el("label", { className: "check" }, bonus, " Bonus level");
  bonusLabel.onclick = () => toast(bonusSays.textContent);
  const bonusWhy = el("button", {
    id: "draftBonusWhy",
    type: "button",
    className: "why",
    textContent: "why",
    title: "Why the box is greyed",
  });
  bonusWhy.setAttribute("aria-label", "Why the box is greyed");
  bonusWhy.setAttribute("aria-describedby", "draftBonusSays");
  bonusWhy.onclick = () => toast(bonusSays.textContent);
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
    textContent: "save to a file",
    title: "Save this level as the map's own file",
  });
  saveJson.onclick = () => saveAs(id, false);
  const saveKwl = el("button", {
    id: "draftSaveKwl",
    type: "button",
    textContent: "save as the game's level",
    title: "Save this level as the file the game loads",
  });
  saveKwl.onclick = () => saveAs(id, true);
  const patch = el("button", {
    id: "draftPatch",
    type: "button",
    textContent: "put it on the disc…",
    title: "Make a patch that puts this level on the game's disc",
  });
  patch.onclick = () => openPatchDialog(id);
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
    field("World", world),
    field("Time", time),
    el("div", { className: "bonus" }, bonusLabel, bonusWhy),
    bonusSays,
    el("label", { className: "check" }, hidden, " Hidden level"),
    el("label", { className: "check" }, afar, " Invisible blocks show from far away"),
    circuits.box,
    plays,
    errors,
    el("div", { className: "row" }, saveJson, saveKwl, patch, note),
    el("div", { className: "row" }, duplicate, del),
  );

  const set = (control, value) => {
    if (document.activeElement !== control) control.value = value;
  };
  return {
    id,
    sync(d) {
      set(title, d.doc.title);
      set(world, d.doc.world);
      set(time, String(d.doc.time));
      const key = keyed(d.doc);
      bonus.checked = !key;
      bonusLabel.title = bonusSays.textContent = key ? HAS_KEY : NO_KEY;
      hidden.checked = !!d.doc.hidden;
      afar.checked = !!d.doc.invisibleFromAfar;
      circuits.sync(d.doc);
      plays.textContent = playsAs(d.doc);
      const n = validate(d.doc, skinsTable()?.hides).filter((f) => f.level === ERROR).length;
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
      markerColour({ type: SWITCH, face: 0, variant: String(colour) }),
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
