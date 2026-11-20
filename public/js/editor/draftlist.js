// The sidebar's "Your levels": the list of the drafts this browser holds, the
// Level card of the shown one, the card of one bundle, and which of the three
// stands.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { tiles } from "../viewer/ui/tiles.js";
import { state } from "../viewer/state.js";
import { index, worldName } from "../viewer/data.js";
import { releaseOf } from "../viewer/release.js";
import { paintLevel } from "../viewer/draw/still.js";
import { selectLevel, showLevel, stepWith } from "../viewer/chrome/navigate.js";
import { sidebarOverlays, yoursClosed } from "../viewer/chrome/sidebar.js";
import { say, describeLevel } from "../viewer/chrome/a11y.js";
import { blank, fromLevel, setMeta, toLevel } from "../format/project.js";
import { readLevelText } from "./files.js";
import { pasteLevelLink } from "./importdialog.js";
import { draftsOf, openedFrom, readLevel, readsOf } from "./intake.js";
import { heldImage } from "./patchdialog.js";
import { buildForm, bundleName, nameOf, signed, twice, unsavedIn } from "./levelcard.js";
import { buildBundleCard, saveButton } from "./bundlecard.js";
import { SORTS, grouping, listed, matches, ordering, stepFrom } from "./draftsort.js";
import {
  ASKED,
  BACK,
  BUNDLE,
  CHOSEN,
  GONE,
  LEVEL,
  LIST,
  MOVED,
  SHOWN,
  STEPPED,
  partAfter,
} from "./draftparts.js";
import { bundleCardName, savedWords, stateLine } from "./draftwords.js";
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
// The part that stands, and the road a draft shown here comes by, read as the change is heard.
let part = LIST;
let road = SHOWN;
// The bundle whose card was asked for last, and the card's form while it stands.
let asked = null;
let bundleForm = null;

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
  $("draftBack").onclick = () => turn(BACK);
  $("bundleBack").onclick = () => turn(BACK);
  $("draftOnScreen").onclick = () => turn(CHOSEN);
  wireView();
  on("drafts-moved", (pairs) => {
    const to = pairs.find(([from]) => from === state.lvl?.draft)?.[1];
    const d = to === undefined ? null : drafts.get(to);
    const opts = { keepView: true, push: false, keep: state.selected?.key ?? null };
    if (d) show(to, d.doc, opts, MOVED);
  });
  on("drafts-changed", sync);
  on("drafts-written", () => form?.wrote());
  on("level-changed", (i) => {
    if (i >= 0) lastDisc = i;
    else if (state.lvl.draft !== undefined && (shownBefore || !yoursClosed()))
      $("yoursFold").open = true;
    shownBefore = true;
    part = partAfter(part, road, onOwn());
    sync();
    unfold();
  });
  on("level-updated", sync);
  on("release-changed", sync);
  on("link-opening", sync);
  stepWith(stepDraft);
  sync();
}

// --- showing and opening a draft -----------------------------------------------------------
function show(id, doc, opts, by = SHOWN) {
  drawn = doc;
  road = by;
  showLevel(toLevel(doc, id), opts);
  road = SHOWN;
}

/** Show draft `id` as a press on its tile or row does, which stands its card where it was on screen already too. */
function choose(id) {
  show(id, drafts.get(id).doc, { push: true });
  turn(CHOSEN);
}

/** Step from the draft on screen to the draft `delta` places on in the list's order, its tile or row brought into the sidebar's view and the keyboard kept on the Level card where it was there; whether a draft was on screen. */
function stepDraft(delta, push) {
  const id = state.lvl?.draft;
  if (id === undefined) return false;
  const { groups, loose } = arranged(drafts.list());
  const to = stepFrom(listed(groups, loose), id, delta);
  if (to === null) return true;
  const card = $("draftCard");
  const held = card.contains(document.activeElement) ? document.activeElement.id : null;
  show(to, drafts.get(to).doc, { push }, STEPPED);
  marked()?.scrollIntoView({ block: "nearest" });
  // the form is built afresh for each level, which takes the control that held the focus with it
  if (held !== null && !card.contains(document.activeElement)) {
    if (held) $(held)?.focus();
    if (!card.contains(document.activeElement)) card.focus({ preventScroll: true });
  }
  return true;
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
const EDIT_BUNDLE =
  "Set the bundle's title, author and notes and the order of its levels, or take it apart";
const NOT_ALL_SAVED = ", not all saved to a file";
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

// --- the part that stands ------------------------------------------------------------------
const BOXES = { [LIST]: "draftList", [LEVEL]: "draftCard", [BUNDLE]: "bundleCard" };

const onOwn = () => state.lvl?.draft !== undefined;
const marked = () => $("draftRows").querySelector('[aria-current="true"]');

function turn(what) {
  part = partAfter(part, what, onOwn());
  stand();
}

/** Stand the card of bundle `id`, saying which bundle's card it is, which the card's own name leaves out. */
function editBundle(id) {
  asked = id;
  turn(ASKED);
  if (part === BUNDLE) say(`${bundleCardName(bundleName(drafts.bundle(id)))}.`);
}

/** The bundle whose card stands, the card's form built for it and brought up to date, or null where no bundle's card stands, as none does once its bundle is gone. */
function bundled() {
  if (part !== BUNDLE) return null;
  const b = drafts.bundle(asked);
  if (!b) {
    part = partAfter(part, GONE, onOwn());
    return null;
  }
  if (bundleForm?.id !== asked) {
    bundleForm?.drop();
    bundleForm = buildBundleCard(asked, $("bundleForm"));
  }
  bundleForm.sync(b);
  return b;
}

/** Stand the part that stands, a bundle's card with its form up to date, and empty that form once the card stands no more. */
function stand() {
  const b = bundled();
  swap();
  // only after the swap, until which a control of the form may hold the focus
  if (b || !bundleForm) return;
  bundleForm.drop();
  bundleForm = null;
  $("bundleForm").textContent = "";
}

/** Show the part that stands and no other, and where that hides what held the keyboard's focus, bring the part into the sidebar's view and give it the focus. */
function swap() {
  const active = document.activeElement;
  let from = null;
  for (const [name, id] of Object.entries(BOXES)) {
    if (name !== part && $(id).contains(active)) from = name;
    $(id).hidden = name !== part;
  }
  if (from === null) return;
  const box = $(BOXES[part]);
  // by its nearest edge, as a level's button is, or from its top where it is taller than the view
  const tall = box.offsetHeight > $("sidebar").clientHeight;
  box.scrollIntoView({ block: tall ? "start" : "nearest" });
  if (part === LIST) seat(from).focus();
  else box.focus({ preventScroll: true });
}

/** What takes the focus in the list: from a bundle's card the opener of that card, else the level on screen, either with its group opened for it, else the On screen line, else the first opener. */
function seat(from) {
  const g = from === BUNDLE ? folds.get(asked) : null;
  if (g && !g.fold.hidden) {
    g.fold.open = true;
    return g.edit;
  }
  unfold();
  const line = $("draftOnScreen");
  return marked() ?? (line.hidden ? $("draftNew") : line);
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

/** The bundles' groups and the levels in no bundle as the list shows `all`, under the sort chosen and the filter typed. */
function arranged(all) {
  const query = $("draftFilter").value;
  const worlds = state.data.themes.map((t) => worldName(t.id));
  const records = new Map(all.map((d) => [d.id, recordOf(d)]));
  const { groups, grouped } = grouping(drafts.bundles(), records, query);
  const loose = [...records.values()]
    .filter((r) => !grouped.has(r.id) && matches(r, query))
    .sort(ordering(sortNow(), worlds));
  return { groups, loose };
}

function rows() {
  const box = $("draftRows");
  const all = drafts.list();
  const unread = drafts.unreadCount();
  $("yoursCount").textContent = all.length ? String(all.length) : "";
  const here = all.find((d) => d.id === state.lvl?.draft);
  const line = $("draftOnScreen");
  line.hidden = !here;
  line.querySelector(".name").textContent = here ? nameOf(here.doc) : "";
  const bar = $("draftView");
  bar.hidden = all.length < 2;
  if (bar.hidden) $("draftFilter").value = "";
  for (const b of bar.querySelectorAll(".scope button"))
    b.setAttribute("aria-pressed", String(b.dataset.view === viewNow()));
  $("draftSort").value = sortNow();
  const { groups, loose } = arranged(all);
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
  });
  for (const [id, g] of folds)
    if (!drafts.bundle(id)) {
      g.grid?.destroy();
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

/** The group of bundle `b`, made once and worded afresh: its title, how many levels it holds and whether all of them are saved to a file, its author, and under them the bar that saves the bundle and stands its card; opened as it comes to hold the level on screen. */
function foldOf(b) {
  let g = folds.get(b.id);
  if (!g) {
    const name = el("span", { className: "name" });
    const n = el("span", { className: "n" });
    const note = el("span", { className: "sr" });
    const by = el("span", { className: "by" });
    const save = saveButton(b.id);
    const edit = el("button", {
      type: "button",
      textContent: "edit the bundle",
      title: EDIT_BUNDLE,
    });
    const members = el("div", { className: "members" });
    const fold = el(
      "details",
      { className: "bundle" },
      el("summary", {}, name, n, note, by),
      el("div", { className: "bar" }, save.button, edit),
      members,
    );
    fold.dataset.bundle = b.id;
    g = { fold, name, n, note, by, save, edit, members, grid: null, levels: [] };
    edit.onclick = () => editBundle(b.id);
    folds.set(b.id, g);
  }
  const shown = state.lvl?.draft;
  if (shown !== undefined && b.levels.includes(shown) && !g.levels.includes(shown))
    g.fold.open = true;
  g.levels = [...b.levels];
  const unsaved = unsavedIn(b) > 0;
  g.name.textContent = bundleName(b);
  g.n.textContent = `${b.levels.length} level${b.levels.length === 1 ? "" : "s"}`;
  g.n.classList.toggle("unsaved", unsaved);
  g.note.textContent = unsaved ? NOT_ALL_SAVED : "";
  g.by.textContent = b.author ? `by ${b.author}` : "";
  g.by.hidden = !b.author;
  g.save.sync(b);
  return g;
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
    el("span", { className: "state", textContent: savedWords(d) }),
  );
  b.setAttribute("aria-current", state.lvl?.draft === d.id ? "true" : "false");
  b.onclick = () => choose(d.id);
  return b;
}

// Two changes within a millisecond share a time, so the count of changes tells them apart.
const stampOf = (d) => `${d.updated}:${d.edits}`;

const itemOf = ({ d, title, world }) => ({
  key: d.id,
  stamp: stampOf(d),
  title,
  line: stateLine(world, d),
  current: state.lvl?.draft === d.id,
  open: () => choose(d.id),
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

/** Bring the Level card's form up to date with the shown draft, stand the part that stands, and empty the form once no draft is shown. */
function card(id, d) {
  const box = $("draftForm");
  if (d) {
    if (form?.id !== id) {
      form?.drop();
      if (imported && imported.id !== id) imported = null;
      form = buildForm(id, box, { imported, open });
    }
    form.sync(d);
  }
  // before the form is emptied, while a control of it may still hold the focus
  stand();
  if (d) return;
  form?.drop();
  form = null;
  box.textContent = "";
}
