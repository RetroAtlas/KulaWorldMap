// The sidebar's "Your levels": the drafts this browser holds, and the box the
// Level card stands in for the shown one.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { releaseOf } from "../viewer/release.js";
import { selectLevel, showLevel } from "../viewer/chrome/navigate.js";
import { yoursClosed } from "../viewer/chrome/sidebar.js";
import { say, describeLevel } from "../viewer/chrome/a11y.js";
import { blank, fromLevel, setMeta, toLevel } from "../format/project.js";
import { readLevelText } from "./files.js";
import { pasteLevelLink } from "./importdialog.js";
import { draftsOf, readLevel } from "./intake.js";
import { heldImage } from "./patchdialog.js";
import { buildForm, nameOf, signed, twice } from "./levelcard.js";
import * as drafts from "./drafts.js";

// --- the state and the wiring --------------------------------------------------------------
// The disc's level shown last, which deleting the shown draft returns to.
let lastDisc = 0;
// Whether a level was shown before this one; a page's first draft leaves a fold closed on purpose.
let shownBefore = false;
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
  shownBefore = state.lvl !== null;
  if (state.li >= 0) lastDisc = state.li;
  $("draftNew").onclick = () => {
    const id = drafts.create(signed(blank(state.lvl.theme)));
    open(id, "Made a new level");
    if (id !== null) emit("edit-wanted");
  };
  $("draftCopy").onclick = copyShown;
  $("draftOpen").onclick = () => $("draftFile").click();
  $("draftFile").onchange = openFile;
  $("draftPaste").onclick = async () =>
    openRead(await pasteLevelLink(state.lvl.theme, readLevelText));
  on("drafts-moved", (pairs) => {
    const to = pairs.find(([from]) => from === state.lvl?.draft)?.[1];
    const d = to === undefined ? null : drafts.get(to);
    if (d) show(to, d.doc, { keepView: true, push: false, keep: state.selected?.key ?? null });
  });
  on("drafts-changed", sync);
  on("drafts-written", () => form?.wrote());
  on("level-changed", (i) => {
    if (i >= 0) lastDisc = i;
    else if (state.lvl.draft !== undefined && (shownBefore || !yoursClosed()))
      $("yoursFold").open = true;
    shownBefore = true;
    sync();
  });
  on("level-updated", sync);
  sync();
}

// --- showing and opening a draft -----------------------------------------------------------
function show(id, doc, opts) {
  drawn = doc;
  showLevel(toLevel(doc, id), opts);
}

/** Open a copy of the level on screen: a draft as it is, a level that came with its document as that document, author and notes kept, or a shipped level as the game loads it, a copy of another disc's own level carrying that disc's label in its title. */
export function copyShown() {
  const l = state.lvl;
  if (l.draft !== undefined) {
    open(drafts.duplicate(l.draft), "Copied the level");
    return;
  }
  const doc = l.project ? structuredClone(l.project) : shipped(l);
  open(drafts.create(doc), `Copied ${nameOf(doc)}`);
}

function shipped(l) {
  const template = fromLevel(l);
  const disc = releaseOf(l.release);
  return signed(
    disc ? setMeta(template, { title: `${template.title} (${disc.label})` }) : template,
  );
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
  if (file) openRead(await readLevel(file, state.lvl.theme, heldImage()), file.name);
}

/** A level read from elsewhere becomes a draft marked saved, since the file is the record, shown with the reader's report on its card; the levels of one file become one each, the first shown. */
function openRead(read, name) {
  if (!read) return;
  const reads = [read].flat();
  const ids = draftsOf(reads, name);
  if (!ids.length) return;
  imported = { id: ids[0], lines: reads[0].report, repairs: reads[0].repairs };
  open(
    ids[0],
    ids.length > 1
      ? `Opened ${ids.length} levels from ${name}`
      : `Opened ${nameOf(reads[0].project)}`,
  );
}

// --- the rows and the card -----------------------------------------------------------------
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
  rows();
  card(id, d);
}

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
  $("yoursCount").textContent = all.length ? String(all.length) : "";
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
    form = buildForm(id, box, { imported, open });
  }
  form.sync(d);
  box.hidden = false;
}
