// The sidebar's "Your levels": the drafts this browser holds, and the card
// that edits the shown one.
import { $, el, on } from "./dom.js";
import { state } from "./state.js";
import { worldName, levelTitle } from "./data.js";
import { selectLevel, showLevel } from "./navigate.js";
import { say, describeLevel } from "./a11y.js";
import { toast } from "./toast.js";
import { TIME_MAX, writeKwl } from "./kwl.js";
import { UNTITLED, blank, fromLevel, setMeta, toLevel, writeProject } from "./project.js";
import { download, readLevelFile, readLevelText, slug } from "./files.js";
import { pasteLevelLink } from "./importdialog.js";
import { openPatchDialog } from "./patchdialog.js";
import { edit as step } from "./trail.js";
import * as drafts from "./drafts.js";

const CONFIRM_MS = 4000;
const NOTE_MS = 2000;
const GAME_FILE = "application/octet-stream";
const nameOf = (doc) => doc.title || UNTITLED;

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
  $("draftNew").onclick = () => open(drafts.create(blank(state.lvl.theme)), "Made a new level");
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
  show(id, drafts.get(id).doc, { push: true });
  say(`${verb}. ${describeLevel(state.lvl)}`);
}

async function openFile() {
  const input = $("draftFile");
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  let read;
  try {
    read = await readLevelFile(bytes, file.name, state.lvl.theme);
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
  imported = { id, lines: read.report };
  open(id, `Opened ${nameOf(read.project)}`);
  const n = read.report.length;
  if (n) toast(n === 1 ? read.report[0] : `Read with ${n} repairs.`);
}

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
  $("draftEmpty").hidden = all.length > 0;
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

function reportFold(lines) {
  const n = lines.length;
  return el(
    "details",
    { className: "report" },
    el("summary", { textContent: `Read with ${n} repair${n === 1 ? "" : "s"}` }),
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
    if (d) step(id, setMeta(d.doc, meta), label, { merge });
  };
  const field = (text, control) => el("label", {}, el("span", { textContent: text }), control);

  const title = el("input", {
    id: "draftTitle",
    type: "text",
    placeholder: UNTITLED,
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
    max: TIME_MAX,
    step: 1,
    inputMode: "numeric",
    title: "The seconds the clock starts at",
  });
  time.onchange = () => {
    const v = Math.round(Number(time.value));
    if (time.value !== "" && v >= 1 && v <= TIME_MAX) edit({ time: v }, "changed the time");
    else time.value = drafts.get(id)?.doc.time ?? "";
  };

  const hidden = el("input", { id: "draftHidden", type: "checkbox" });
  hidden.onchange = () => edit({ hidden: hidden.checked }, "changed the hidden level setting");
  const afar = el("input", { id: "draftAfar", type: "checkbox" });
  afar.onchange = () =>
    edit({ invisibleFromAfar: afar.checked }, "changed the invisible blocks setting");

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

  const DELETE = "Delete this level from this browser";
  const del = el("button", { type: "button", textContent: "delete", title: DELETE });
  let armed = 0;
  const disarm = () => {
    clearTimeout(armed);
    armed = 0;
    del.textContent = "delete";
    del.title = DELETE;
    del.classList.remove("warn");
  };
  del.onclick = () => {
    if (!armed) {
      del.textContent = "delete?";
      del.title = "Press again to delete this level from this browser";
      del.classList.add("warn");
      armed = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    const name = nameOf(drafts.get(id).doc);
    $("draftNew").focus();
    drafts.remove(id);
    say(`Deleted ${name}. ${describeLevel(state.lvl)}`);
  };

  box.append(
    imported?.id === id && imported.lines.length ? reportFold(imported.lines) : [],
    el("h3", { textContent: "Level" }),
    field("Title", title),
    field("World", world),
    field("Time", time),
    el("label", { className: "check" }, hidden, " Hidden level"),
    el("label", { className: "check" }, afar, " Invisible blocks show from far away"),
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
      hidden.checked = !!d.doc.hidden;
      afar.checked = !!d.doc.invisibleFromAfar;
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
