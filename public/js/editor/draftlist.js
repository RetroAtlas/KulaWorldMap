// The sidebar's "Your levels": the drafts this browser holds, and the box the
// Level card stands in for the shown one.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { tiles } from "../viewer/ui/tiles.js";
import { state } from "../viewer/state.js";
import { index, worldName } from "../viewer/data.js";
import { releaseOf } from "../viewer/release.js";
import { paintLevel } from "../viewer/draw/still.js";
import { selectLevel, showLevel } from "../viewer/chrome/navigate.js";
import { sidebarOverlays, yoursClosed } from "../viewer/chrome/sidebar.js";
import { say, describeLevel } from "../viewer/chrome/a11y.js";
import { blank, fromLevel, setMeta, toLevel } from "../format/project.js";
import { readLevelText } from "./files.js";
import { pasteLevelLink } from "./importdialog.js";
import { draftsOf, openedFrom, readLevel, readsOf } from "./intake.js";
import { heldImage } from "./patchdialog.js";
import { buildForm, nameOf, signed, twice } from "./levelcard.js";
import { SORTS, matches, ordering } from "./draftsort.js";
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
  wireView();
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

/** A level read from elsewhere becomes a draft marked saved, since the file is the record, shown with the reader's report on its card; the levels of one file become one each, the first shown, with the bundle's report where the file was a bundle. */
function openRead(read, name) {
  if (!read) return;
  const reads = readsOf(read);
  const ids = draftsOf(reads, name);
  if (!ids.length) return;
  const head = reads.bundle;
  const { report, repairs } = head ?? reads[0];
  imported = { id: ids[0], lines: report, repairs };
  open(
    ids[0],
    head || ids.length > 1
      ? openedFrom(ids.length, name, !!head)
      : `Opened ${nameOf(reads[0].project)}`,
  );
}

// --- the view, the sort and the filter -----------------------------------------------------
const VIEW_KEY = "kula.tiles";
const VIEWS = ["list", "tiles"];
const NO_MATCH = "Nothing matches.";
// The view and the sort chosen here, kept across visits; one not chosen takes its default.
const chosen = {};
// The tiles while the view is tiles, and the levels built for their pictures, by draft id.
let grid = null;
const built = new Map();
// The empty line's own words, put back once the filter lets a level through again.
let nothing = "";

const viewNow = () => chosen.view ?? (sidebarOverlays() ? "list" : "tiles");
const sortNow = () => chosen.sort ?? SORTS[0];

function restoreView() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    if (VIEWS.includes(v?.view)) chosen.view = v.view;
    if (SORTS.includes(v?.sort)) chosen.sort = v.sort;
  } catch {
    /* ignore */
  }
}

function keepView() {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(chosen));
  } catch {
    /* ignore */
  }
}

function wireView() {
  restoreView();
  nothing = $("draftEmpty").textContent;
  for (const b of $("draftView").querySelectorAll(".scope button"))
    b.onclick = () => {
      chosen.view = b.dataset.view;
      keepView();
      rows();
      $("draftView").querySelector("[aria-pressed=true]")?.focus();
    };
  $("draftSort").onchange = (e) => {
    chosen.sort = e.target.value;
    keepView();
    rows();
  };
  $("draftFilter").oninput = rows;
  on("atlas-loaded", (world) => {
    if (grid) for (const d of drafts.list()) if (d.doc.world === world) grid.repaint(d.id);
  });
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

/** A level's record for the order and the filter, its world by the name the map shows. */
const recordOf = (d) => ({
  id: d.id,
  title: nameOf(d.doc),
  world: worldName(d.doc.world),
  updated: d.updated,
  saved: d.saved,
  edits: d.edits,
  d,
});

function rows() {
  const box = $("draftRows");
  const all = drafts.list();
  const unread = drafts.unreadCount();
  $("yoursCount").textContent = all.length ? String(all.length) : "";
  const bar = $("draftView");
  bar.hidden = all.length < 2;
  if (bar.hidden) $("draftFilter").value = "";
  for (const b of bar.querySelectorAll(".scope button"))
    b.setAttribute("aria-pressed", String(b.dataset.view === viewNow()));
  $("draftSort").value = sortNow();
  const worlds = state.data.themes.map((t) => worldName(t.id));
  const listed = all
    .map(recordOf)
    .filter((r) => matches(r, $("draftFilter").value))
    .sort(ordering(sortNow(), worlds));
  const filtered = all.length > 0 && !listed.length;
  const empty = $("draftEmpty");
  empty.textContent = filtered ? NO_MATCH : nothing;
  empty.hidden = !filtered && (all.length > 0 || unread > 0);
  for (const id of built.keys()) if (!drafts.get(id)) built.delete(id);
  if (viewNow() === "tiles") tilesOf(box, listed);
  else rowsOf(box, listed);
  $("draftUnread")?.remove();
  if (unread) box.after(unreadRow(unread));
}

/** The list: a row a level, with a tile's words less its world. */
function rowsOf(box, listed) {
  grid?.destroy();
  grid = null;
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  box.textContent = "";
  for (const { d, title } of listed) {
    const b = el("button", { type: "button", title: `Show ${title}` });
    b.dataset.id = d.id;
    b.append(
      el("span", { className: "name", textContent: title }),
      el("span", { className: "tag", textContent: "Draft" }),
      el("span", { className: "state", textContent: status(d) }),
    );
    b.setAttribute("aria-current", state.lvl?.draft === d.id ? "true" : "false");
    b.onclick = () => show(d.id, drafts.get(d.id).doc, { push: true });
    box.append(b);
  }
  if (focused) box.querySelector(`[data-id="${focused}"]`)?.focus();
}

function tilesOf(box, listed) {
  const items = listed.map(itemOf);
  if (grid) grid.update(items);
  else {
    box.textContent = "";
    grid = tiles(box, items);
  }
}

// Two changes within a millisecond share a time, so the count of changes tells them apart.
const stampOf = (d) => `${d.updated}:${d.edits}`;

const itemOf = ({ d, title, world }) => ({
  key: d.id,
  stamp: stampOf(d),
  title,
  tag: "Draft",
  line: `${world} · ${status(d)}`,
  current: state.lvl?.draft === d.id,
  open: () => show(d.id, drafts.get(d.id).doc, { push: true }),
  paint: (canvas) => paintDraft(canvas, d.id),
});

/** Paint the draft's picture, the level built from its document once per change, flat until its world's textures have landed; whether they were drawn. */
function paintDraft(canvas, id) {
  const d = drafts.get(id);
  if (!d) return true;
  const stamp = stampOf(d);
  let b = built.get(id);
  if (b?.stamp !== stamp) {
    const l = toLevel(d.doc, id);
    built.set(id, (b = { stamp, l, idx: index(l) }));
  }
  return paintLevel(canvas, b.l, b.idx, { textures: !navigator.connection?.saveData }).textured;
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
