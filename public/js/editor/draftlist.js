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
import { buildForm, bundleName, nameOf, signed, twice } from "./levelcard.js";
import { buildBundleCard } from "./bundlecard.js";
import { SORTS, grouping, matches, ordering } from "./draftsort.js";
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
    unfold();
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
const ARRANGE = "Set the bundle's title, author and notes, and the order of its levels";
// The view and the sort chosen here, kept across visits; one not chosen takes its default.
const chosen = {};
// The tiles of the levels in no bundle while the view is tiles, and the levels built for the
// pictures, by draft id.
let grid = null;
const built = new Map();
// Each bundle's group, by the bundle's id, kept through every rebuild so its fold stays as left.
const folds = new Map();
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
    for (const d of drafts.list())
      if (d.doc.world === world) for (const g of grids()) g.repaint(d.id);
  });
}

const grids = () => [grid, ...[...folds.values()].map((g) => g.grid)].filter(Boolean);

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
  const query = $("draftFilter").value;
  const worlds = state.data.themes.map((t) => worldName(t.id));
  const records = new Map(all.map((d) => [d.id, recordOf(d)]));
  const { groups, grouped } = grouping(drafts.bundles(), records, query);
  const loose = [...records.values()]
    .filter((r) => !grouped.has(r.id) && matches(r, query))
    .sort(ordering(sortNow(), worlds));
  const shown = loose.length + groups.reduce((n, g) => n + g.kept.length, 0);
  const filtered = all.length > 0 && shown === 0;
  const empty = $("draftEmpty");
  empty.textContent = filtered ? NO_MATCH : nothing;
  empty.hidden = !filtered && (all.length > 0 || unread > 0);
  for (const id of built.keys()) if (!drafts.get(id)) built.delete(id);
  layout(box, groups, loose);
  $("draftUnread")?.remove();
  if (unread) box.after(unreadRow(unread));
}

/** Lay the groups out first, in the bundles' order, and the levels in no bundle under them, each as tiles or as rows. */
function layout(box, groups, loose) {
  const asTiles = viewNow() === "tiles";
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  groups.forEach(({ b, kept, hidden }, i) => {
    const g = foldOf(b);
    g.fold.hidden = hidden;
    if (box.children[i] !== g.fold) box.insertBefore(g.fold, box.children[i] ?? null);
    fill(g, kept, asTiles);
    g.form?.sync(b);
  });
  for (const [id, g] of folds)
    if (!drafts.bundle(id)) {
      g.grid?.destroy();
      g.form?.drop();
      g.fold.remove();
      folds.delete(id);
    }
  if (asTiles) {
    const items = loose.map(itemOf);
    if (grid) grid.update(items);
    else {
      for (const row of box.querySelectorAll(":scope > button")) row.remove();
      grid = tiles(box, items);
    }
  } else {
    grid?.destroy();
    grid = null;
    for (const row of box.querySelectorAll(":scope > button")) row.remove();
    box.append(...loose.map(rowOf));
  }
  if (focused) box.querySelector(`[data-id="${focused}"]`)?.focus();
}

/** The group of bundle `b`, made once and worded afresh: its title, its author and how many levels it holds, with the button that opens its card, and opened as it comes to hold the level on screen. */
function foldOf(b) {
  let g = folds.get(b.id);
  if (!g) {
    const name = el("span", { className: "name" });
    const by = el("span", { className: "by" });
    const n = el("span", { className: "n" });
    const arrange = el("button", {
      className: "arrange",
      type: "button",
      textContent: "arrange…",
      title: ARRANGE,
    });
    arrange.setAttribute("aria-expanded", "false");
    const members = el("div", { className: "members" });
    const card = el("div", { className: "card", hidden: true });
    const fold = el(
      "details",
      { className: "bundle" },
      el("summary", {}, name, by, n, arrange),
      members,
      card,
    );
    fold.dataset.bundle = b.id;
    g = { fold, name, by, n, members, card, form: null, grid: null, levels: [] };
    arrange.onclick = (e) => {
      e.preventDefault();
      toggleCard(g, b.id, arrange);
    };
    fold.addEventListener("toggle", () => {
      if (!fold.open) putAway(g, arrange);
    });
    folds.set(b.id, g);
  }
  const shown = state.lvl?.draft;
  if (shown !== undefined && b.levels.includes(shown) && !g.levels.includes(shown))
    g.fold.open = true;
  g.levels = [...b.levels];
  g.name.textContent = bundleName(b);
  g.by.textContent = b.author;
  g.by.hidden = !b.author;
  g.n.textContent = `${b.levels.length} level${b.levels.length === 1 ? "" : "s"}`;
  return g;
}

/** Show the bundle's card under its levels, built on the first press and the group opened with it, or put it away again. */
function toggleCard(g, id, button) {
  const b = drafts.bundle(id);
  if (!b) return;
  if (!g.card.hidden) {
    putAway(g, button);
    return;
  }
  g.form ??= buildBundleCard(id, g.card);
  g.form.sync(b);
  g.card.hidden = false;
  button.setAttribute("aria-expanded", "true");
  g.fold.open = true;
}

/** Put the card away, as the group's closing does too, since the card lives inside the fold. */
function putAway(g, button) {
  g.card.hidden = true;
  button.setAttribute("aria-expanded", "false");
}

/** Put the levels the filter keeps inside the group, as tiles or as rows. */
function fill(g, kept, asTiles) {
  if (asTiles) {
    const items = kept.map(itemOf);
    if (g.grid) g.grid.update(items);
    else {
      g.members.textContent = "";
      g.grid = tiles(g.members, items);
    }
  } else {
    g.grid?.destroy();
    g.grid = null;
    g.members.replaceChildren(...kept.map(rowOf));
  }
}

/** Open the group of the bundle the level on screen is in, as a world's fold opens for its level. */
function unfold() {
  const id = state.lvl?.draft;
  if (id === undefined) return;
  for (const [bid, g] of folds) if (drafts.bundle(bid)?.levels.includes(id)) g.fold.open = true;
}

/** A level's row for the list: a tile's words less its world. */
function rowOf({ d, title }) {
  const b = el("button", { type: "button", title: `Show ${title}` });
  b.dataset.id = d.id;
  b.append(
    el("span", { className: "name", textContent: title }),
    el("span", { className: "tag", textContent: "Draft" }),
    el("span", { className: "state", textContent: status(d) }),
  );
  b.setAttribute("aria-current", state.lvl?.draft === d.id ? "true" : "false");
  b.onclick = () => show(d.id, drafts.get(d.id).doc, { push: true });
  return b;
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
