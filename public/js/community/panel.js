// The community levels: the catalogue of the levels players sent in, listed as tiles once the
// sidebar's fold is opened or a link names one of them, each shown through the viewer's funnel.
import { $, el, on } from "../viewer/ui/dom.js";
import { tiles } from "../viewer/ui/tiles.js";
import { download, slug } from "../viewer/ui/download.js";
import { state } from "../viewer/state.js";
import { index, loadJson, skinsTable, worldName } from "../viewer/data.js";
import { paintLevel } from "../viewer/draw/still.js";
import { parseHash } from "../viewer/permalink.js";
import { noteWith, provideLevels, showLevel } from "../viewer/chrome/navigate.js";
import { COMMUNITY_PACK, readCatalogue } from "../format/catalogue.js";
import { UNTITLED, toLevel, writeProject } from "../format/project.js";
import { SORTS, matches, ordering } from "./sort.js";

/** Where the page reads the catalogue from. */
export const INDEX_URL = "community/index.json";
export const TAKEN_DOWN = "That level was taken down.";
export const NO_SUCH = "The community levels hold no such level.";
export const UNLOADED =
  "The community's levels could not be loaded, so that link could not be followed.";
const TAG = "Community";
// a slot of the community's pack: a record's id, and a level's place in a bundle after a dash
const SLOT = /^COMMUNITY\/(\d+)(?:-(\d+))?$/;
const NO_MATCH = "Nothing matches.";

// The catalogue as read, held for the visit once the index has arrived, and the fetch under way.
let catalogue = null;
let loading = null;
// The levels built from the entries, by the slot key each opens under, with the index of each.
const built = new Map();
let grid = null;
// The sort chosen, which starts afresh on every visit.
let sort = SORTS[0];
// The empty line's own words, put back once the filter lets a level through again.
let nothing = "";

// --- the index ---------------------------------------------------------------------------
/** The catalogue, fetched once and held; null where the index did not arrive, so the next call fetches again. */
function load() {
  if (catalogue) return Promise.resolve(catalogue);
  return (loading ??= loadJson(INDEX_URL, null).then((raw) => {
    loading = null;
    if (raw === null) return null;
    try {
      catalogue = readCatalogue(raw, { hides: skinsTable()?.hides }).catalogue;
    } catch {
      return null;
    }
    return catalogue;
  }));
}

/** Fill the fold: fetch the index where none is held, say so in the fold where it did not arrive, list the levels. */
export async function openPanel() {
  const failed = $("communityFailed");
  failed.hidden = true;
  const got = await load();
  failed.hidden = got !== null;
  if (got) sync();
}

/** Hold the level a link to the community's pack names, fetching the index where none is held; throws the toast's sentence where the link cannot be followed. */
export async function prepare(hash) {
  const got = await load();
  if (!got) throw new Error(UNLOADED);
  const at = placeOf(parseHash(hash).slot);
  if (at && got.retired.includes(at[0])) throw new Error(TAKEN_DOWN);
  if (!at || !levelAt(...at)) throw new Error(NO_SUCH);
}

// --- the levels ---------------------------------------------------------------------------
/** The record's id a slot names and, after the dash, the level's place in its bundle, or null. */
function placeOf(slot) {
  const m = SLOT.exec(slot);
  return m && [Number(m[1]), m[2] === undefined ? undefined : Number(m[2])];
}

/** The document of record `id`, or with `n` the level at that place in its bundle; null where the catalogue holds none. */
function documentAt(id, n) {
  const entry = catalogue?.entries.find((e) => e.id === id);
  if (!entry) return null;
  if (entry.kind === "bundle") return n === undefined ? null : (entry.levels[n - 1] ?? null);
  return n === undefined ? entry.level : null;
}

/** The level of record `id`, or with `n` of the level at that place in its bundle, built once with its index; null where the catalogue holds none. */
function heldAt(id, n) {
  const key = n === undefined ? id : `${id}-${n}`;
  let held = built.get(key);
  if (held) return held;
  const doc = documentAt(id, n);
  if (!doc) return null;
  const l = toLevel(doc, key, { pack: COMMUNITY_PACK, tag: TAG });
  l.project = doc;
  built.set(key, (held = { l, idx: index(l) }));
  return held;
}

const levelAt = (id, n) => heldAt(id, n)?.l ?? null;

provideLevels((slot) => {
  const at = placeOf(slot);
  return at ? levelAt(...at) : null;
});

// --- the tiles ----------------------------------------------------------------------------
/** A level's record for the order and the filter, its world by the name the map shows. */
const recordOf = (e) => ({
  id: e.id,
  title: e.title || UNTITLED,
  author: e.author,
  world: worldName(e.world),
  e,
});

const onScreen = (id) => state.lvl?.pack === COMMUNITY_PACK && state.lvl.index === id;

const itemOf = ({ e, title, author, world }) => ({
  key: e.id,
  stamp: 0,
  title,
  tag: TAG,
  line: author ? `by ${author} · ${world}` : world,
  current: onScreen(e.id),
  open: () => {
    const l = levelAt(e.id);
    if (l) showLevel(l, { push: true });
  },
  paint: (canvas) => paint(canvas, e.id),
});

/** Paint the record's picture, flat until its world's textures have landed; whether they were drawn. */
function paint(canvas, id) {
  const held = heldAt(id);
  if (!held) return true;
  return paintLevel(canvas, held.l, held.idx, { textures: !navigator.connection?.saveData })
    .textured;
}

/** List the entries as tiles in the order and under the filter chosen, with the count and the lines. */
function sync() {
  const entries = catalogue.entries;
  $("communityCount").textContent = entries.length ? String(entries.length) : "";
  const bar = $("communityView");
  bar.hidden = entries.length < 2;
  if (bar.hidden) $("communityFilter").value = "";
  $("communitySort").value = sort;
  const query = $("communityFilter").value;
  const worlds = state.data.themes.map((t) => worldName(t.id));
  const shown = entries
    .map(recordOf)
    .filter((r) => matches(r, query))
    .sort(ordering(sort, worlds));
  const filtered = entries.length > 0 && shown.length === 0;
  const empty = $("communityEmpty");
  empty.textContent = filtered ? NO_MATCH : nothing;
  empty.hidden = !filtered && entries.length > 0;
  const items = shown.map(itemOf);
  if (grid) grid.update(items);
  else grid = tiles($("communityTiles"), items);
}

nothing = $("communityEmpty").textContent;
$("communitySort").onchange = (e) => {
  sort = SORTS.includes(e.target.value) ? e.target.value : SORTS[0];
  sync();
};
$("communityFilter").oninput = () => sync();
on("atlas-loaded", (world) => {
  if (!grid) return;
  for (const e of catalogue.entries) if (e.world === world) grid.repaint(e.id);
});
// One of its levels coming on screen opens the fold, as a world's fold opens for its level.
on("level-changed", () => {
  if (state.lvl?.pack === COMMUNITY_PACK) $("communityFold").open = true;
  if (grid) sync();
});

// --- the note -----------------------------------------------------------------------------
noteWith((l) => {
  if (l.pack !== COMMUNITY_PACK || !l.project) return null;
  const { title, author, notes } = l.project;
  const copy = el("button", {
    type: "button",
    className: "linkish",
    textContent: "copy this level",
    title: "Make a level of your own out of this one",
  });
  copy.onclick = () => $("draftCopy").click();
  const save = el("button", {
    type: "button",
    className: "linkish",
    textContent: "save the file",
    title: "Save this level as the map's own .json file",
  });
  save.onclick = () =>
    download(`${slug(title || UNTITLED)}.kula.json`, writeProject(l.project), "application/json");
  return el(
    "div",
    { className: "shared" },
    author ? el("p", { textContent: `By ${author}.` }) : [],
    notes ? el("p", { className: "notes", textContent: notes }) : [],
    el("p", {}, "One of the community levels, not kept in this browser. ", copy, " · ", save),
  );
});
