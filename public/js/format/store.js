// The drafts' store as text and as a table, with nothing of the page or of storage in it.
import { WORLDS, writeKwl } from "./kwl.js";
import { TEXT_MOST, TITLE_MOST, readProject, text, writeProject } from "./project.js";
import { draftShaped, idOf } from "./held.js";

export const VERSION = 1;
const KNOWN = new Set(["version", "next", "drafts", "bundles"]);

export const empty = () => ({
  version: VERSION,
  next: 1,
  drafts: {},
  bundles: {},
  unknown: table(),
});

/** A table whose keys are text alone, a key in two sources taking the later source's value. */
function table(...sources) {
  const out = Object.create(null);
  for (const source of sources) for (const [key, value] of Object.entries(source)) out[key] = value;
  return out;
}

function entryOf(raw) {
  let project;
  try {
    ({ project } = readProject(raw.doc));
    writeKwl(project);
  } catch {
    return null;
  }
  if (!WORLDS.includes(project.world)) return null;
  return {
    doc: project,
    updated: Number.isFinite(raw.updated) ? raw.updated : 0,
    saved: Number.isFinite(raw.saved) ? raw.saved : null,
    edits: Number.isInteger(raw.edits) && raw.edits >= 0 ? raw.edits : 0,
  };
}

// --- bundles -------------------------------------------------------------------

/** Whether an entry, as the store holds it, has a bundle's shape: an object listing its levels. */
const bundleShaped = (entry) => !!entry && typeof entry === "object" && Array.isArray(entry.levels);

const bundle = (title, author, notes, levels, updated) => ({
  title,
  author,
  notes,
  levels,
  updated,
});

/** A bundle's texts under the level file's caps, its lines dropped, since a stored repair is silent. */
function bundleOf(raw) {
  const lines = [];
  return bundle(
    text(raw, "title", TITLE_MOST, lines),
    text(raw, "author", TEXT_MOST, lines),
    text(raw, "notes", TEXT_MOST, lines),
    raw.levels,
    Number.isFinite(raw.updated) ? raw.updated : 0,
  );
}

/** The ids among `levels` that name a draft `drafts` holds, each once, in their order. */
export const heldLevels = (drafts, levels) =>
  [...new Set(levels)].filter(
    (id) => Number.isSafeInteger(id) && id > 0 && Object.hasOwn(drafts, id),
  );

/** The table with every list cut to the drafts held and every draft in one bundle at most, the one changed last keeping it and the lower id at a tie. */
function settled(bundles, drafts) {
  const order = Object.keys(bundles)
    .map(Number)
    .sort((a, b) => bundles[b].updated - bundles[a].updated || a - b);
  const taken = new Set();
  const out = {};
  for (const id of order) {
    const b = bundles[id];
    const levels = heldLevels(drafts, b.levels).filter((l) => !taken.has(l));
    for (const l of levels) taken.add(l);
    out[id] = bundle(b.title, b.author, b.notes, levels, b.updated);
  }
  return out;
}

// --- the text -----------------------------------------------------------------

/** The store `text` holds, every key of it this version does not know kept as it is, and the drafts and the bundles that could not be read; `bundles` is null where the text has none. */
export function parse(text) {
  const out = empty();
  const left = Object.create(null);
  const leftBundles = Object.create(null);
  let raw = null;
  try {
    raw = JSON.parse(text ?? "null");
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { store: out, unread: left, unreadBundles: leftBundles };
  if (Number.isInteger(raw.version) && raw.version > VERSION) out.version = raw.version;
  const drafts = raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {};
  const ids = [];
  for (const [key, d] of Object.entries(drafts)) {
    const id = idOf(key);
    if (id !== null) ids.push(id);
    const entry = id !== null && draftShaped(d) ? entryOf(d) : null;
    if (entry) out.drafts[id] = entry;
    else left[key] = d;
  }
  if (raw.bundles === undefined) out.bundles = null;
  else {
    const bundles = raw.bundles && typeof raw.bundles === "object" ? raw.bundles : {};
    for (const [key, b] of Object.entries(bundles)) {
      const id = idOf(key);
      if (id !== null) ids.push(id);
      if (id !== null && bundleShaped(b)) out.bundles[id] = bundleOf(b);
      else leftBundles[key] = b;
    }
    out.bundles = settled(out.bundles, out.drafts);
  }
  out.next = Math.max(Number.isInteger(raw.next) ? raw.next : 1, 1, ...ids.map((id) => id + 1));
  for (const [key, value] of Object.entries(raw)) if (!KNOWN.has(key)) out.unknown[key] = value;
  return { store: out, unread: left, unreadBundles: leftBundles };
}

/** The text a store is written as, the drafts and the bundles that could not be read and the keys not known carried as they are. */
export const serialize = (store, unread, unreadBundles = {}) =>
  JSON.stringify({
    version: store.version,
    next: store.next,
    drafts: { ...unread, ...store.drafts },
    bundles: { ...unreadBundles, ...store.bundles },
    ...store.unknown,
  });

// --- the merge ------------------------------------------------------------------

// Of two copies of a draft the later change stands, and at one time the larger
// text, so that two tabs settle on the same one; copies that are the same are
// told so without the writer.
const same = (a, b) =>
  a === b ||
  (!!a &&
    !!b &&
    typeof a === "object" &&
    typeof b === "object" &&
    Array.isArray(a) === Array.isArray(b) &&
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((k) => Object.hasOwn(b, k) && same(a[k], b[k])));
const alike = (a, b) => a.saved === b.saved && a.edits === b.edits && same(a.doc, b.doc);
const textOf = (d) => JSON.stringify([writeProject(d.doc), d.saved, d.edits]);
const later = (a, b) =>
  a.updated > b.updated || (a.updated === b.updated && (alike(a, b) || textOf(a) >= textOf(b)));
const bundleText = (b) => JSON.stringify([b.title, b.author, b.notes, b.levels]);
const laterBundle = (a, b) =>
  a.updated > b.updated || (a.updated === b.updated && bundleText(a) >= bundleText(b));

/** This tab's bundles with the drafts moved to fresh ids followed into their lists. */
function followed(bundles, moved) {
  const to = new Map(moved);
  const out = {};
  for (const [id, b] of Object.entries(bundles ?? {}))
    out[id] = bundle(
      b.title,
      b.author,
      b.notes,
      b.levels.map((l) => to.get(l) ?? l),
      b.updated,
    );
  return out;
}

/** Another tab's bundles folded into this tab's table under the marks of what changed here; a copy without a table says nothing of them. */
function mergeBundles(own, theirs, { dirty, deleted }) {
  if (theirs === null) return own;
  const out = {};
  for (const [key, b] of Object.entries(theirs)) {
    const id = Number(key);
    if (deleted.has(id)) continue;
    const o = own[id];
    if (o && laterBundle(o, b)) out[id] = o;
    else {
      out[id] = b;
      dirty.delete(id);
    }
  }
  for (const [key, b] of Object.entries(own)) {
    const id = Number(key);
    if (!(id in out) && dirty.has(id)) out[id] = b;
  }
  return out;
}

const none = () => ({ dirty: new Set(), deleted: new Set() });

/** Another tab's copy folded into this one under the marks of what changed here, which follow a moved draft, as do the bundles' lists; of a key this version does not know, theirs stands where both carry it. */
export function merge(mine, theirs, { dirty, deleted, handed, bundles: marks = none() }) {
  const drafts = {};
  const taken = [];
  const moved = [];
  let next = Math.max(mine.next, theirs.next);
  for (const [key, d] of Object.entries(theirs.drafts)) {
    const id = Number(key);
    if (deleted.has(id)) continue;
    const own = mine.drafts[id];
    if (own && handed.has(id) && Number.isSafeInteger(next)) {
      drafts[id] = d;
      drafts[next] = own;
      moved.push([id, next++]);
    } else if (own && later(own, d)) drafts[id] = own;
    else {
      drafts[id] = d;
      dirty.delete(id);
      if (own) taken.push(id);
    }
  }
  for (const [key, d] of Object.entries(mine.drafts)) {
    const id = Number(key);
    if (!(id in drafts) && dirty.has(id)) drafts[id] = d;
  }
  for (const [from, to] of moved)
    for (const set of [dirty, handed]) if (set.delete(from)) set.add(to);
  const bundles = mergeBundles(followed(mine.bundles, moved), theirs.bundles, marks);
  return {
    store: {
      version: Math.max(mine.version, theirs.version),
      next,
      drafts,
      bundles: settled(bundles, drafts),
      unknown: table(mine.unknown, theirs.unknown),
    },
    taken,
    moved,
  };
}
