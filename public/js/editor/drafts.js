// The levels of your own this browser keeps, and the bundles they are gathered
// in, written to localStorage a moment after each change.
import { emit } from "../viewer/ui/dom.js";
import { toast } from "../viewer/ui/toast.js";
import { UNTITLED } from "../format/project.js";
import { KEY } from "../format/held.js";
import { empty, heldLevels, merge, parse, serialize } from "../format/store.js";

const SAID = "kula.drafts.said";
const SETTLE = 300;
const FULL = "This browser cannot hold more drafts; save them to files and delete some.";
const NO_ROOM =
  "This browser gives the map no room to keep levels, so they will live only until the page is closed.";
const FLEETING =
  "This browser cannot keep your levels, so they will live only until the page is closed.";
const REFUSED = "This browser could not keep your levels just now. Save them to files to be safe.";
const NUMBERED_OUT =
  "This browser has run out of numbers for its levels, so no more can be made here.";
const QUOTA = ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"];
const noRoom = (e) => QUOTA.includes(e?.name);
const displaced = (name) =>
  `Another tab's level took the place of ${name}, which stays in the list under a new link.`;

let store = empty();
// Entries that could not be read, written back as they are until removed here.
let unread = Object.create(null);
let unreadBundles = Object.create(null);
let forgotten = false;
let memoryOnly = false;
let timer = 0;
let refused = false;
// The store's text as last read or written here; another in storage is a tab's copy.
let known = null;
// What changed here since the last write, which another tab's copy may lack:
// the drafts changed, the ids deleted, and the ids handed out, which another
// tab may hand out too until they reach storage; the bundles keep the same marks.
const dirty = new Set();
const deleted = new Set();
const handed = new Set();
const bundleMarks = { dirty: new Set(), deleted: new Set(), handed: new Set() };

/** Read the store once, saying what could not be kept. */
export function load() {
  let text = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    memoryOnly = true;
    toast(FLEETING);
    return;
  }
  known = text;
  const read = parse(text);
  store = read.store;
  store.bundles ??= {};
  unread = read.unread;
  unreadBundles = read.unreadBundles;
  const n = unreadCount();
  if (n && !saidBefore())
    toast(
      `${n} draft${n === 1 ? "" : "s"} in this browser could not be read and ${n === 1 ? "is" : "are"} kept as ${n === 1 ? "it is" : "they are"}.`,
    );
}

/** Whether this session has been told of the entries that could not be read. */
function saidBefore() {
  try {
    if (sessionStorage.getItem(SAID)) return true;
    sessionStorage.setItem(SAID, "1");
  } catch {
    return false;
  }
  return false;
}

export const unreadCount = () => Object.keys(unread).length;

/** Let the entries that could not be read go. */
export function removeUnread() {
  if (!unreadCount()) return;
  unread = Object.create(null);
  unreadBundles = Object.create(null);
  forgotten = true;
  changed();
}

/** Every draft, the one changed last first. */
export const list = () =>
  Object.entries(store.drafts)
    .map(([id, d]) => ({ id: Number(id), ...d }))
    .sort((a, b) => b.updated - a.updated || b.id - a.id);

export const get = (id) => store.drafts[id] ?? null;

/** A new draft's id, or null where the store has none left to give; one read from a file names the file as `saved`, since the file is the record. */
export function create(project, { saved = null } = {}) {
  if (!Number.isSafeInteger(store.next)) {
    toast(NUMBERED_OUT);
    return null;
  }
  const id = store.next++;
  store.drafts[id] = { doc: project, updated: Date.now(), saved, edits: 0 };
  handed.add(id);
  touched(id);
  return id;
}

/** Make `project` the draft's document, counting `step` changes since its save. */
export function update(id, project, step = 1) {
  const d = store.drafts[id];
  if (!d) return;
  d.doc = project;
  d.updated = Date.now();
  d.edits = Math.max(0, d.edits + step);
  touched(id);
}

export function markSaved(id) {
  const d = store.drafts[id];
  if (!d) return;
  d.saved = d.updated = Date.now();
  d.edits = 0;
  touched(id);
}

/** Forget a draft, taking it out of its bundle. */
export function remove(id) {
  if (!store.drafts[id]) return;
  delete store.drafts[id];
  dirty.delete(id);
  if (!handed.delete(id)) deleted.add(id);
  takeOut([id]);
  changed();
}

export const duplicate = (id) =>
  store.drafts[id] ? create(structuredClone(store.drafts[id].doc)) : null;

function touched(id) {
  dirty.add(id);
  deleted.delete(id);
  changed();
}

// --- bundles -------------------------------------------------------------------

/** Every bundle, the lowest id first, each with its id. */
export const bundles = () =>
  Object.entries(store.bundles)
    .map(([id, b]) => ({ id: Number(id), ...b }))
    .sort((a, b) => a.id - b.id);

export const bundle = (id) => store.bundles[id] ?? null;

/** A new bundle's id, or null where the store has none left to give; its levels leave any other bundle. */
export function createBundle({ title = "", author = "", notes = "", levels = [] } = {}) {
  if (!Number.isSafeInteger(store.next)) {
    toast(NUMBERED_OUT);
    return null;
  }
  const id = store.next++;
  store.bundles[id] = { title, author, notes, levels: claimed(id, levels), updated: Date.now() };
  bundleMarks.handed.add(id);
  touchedBundle(id);
  return id;
}

/** Give the bundle the title, author, notes or levels `patch` carries; a level added leaves any other bundle. */
export function updateBundle(id, patch) {
  const b = store.bundles[id];
  if (!b) return;
  for (const key of ["title", "author", "notes"]) if (patch[key] !== undefined) b[key] = patch[key];
  if (patch.levels !== undefined) b.levels = claimed(id, patch.levels);
  b.updated = Date.now();
  touchedBundle(id);
}

/** Forget a bundle; its levels stay. */
export function removeBundle(id) {
  if (!store.bundles[id]) return;
  delete store.bundles[id];
  bundleMarks.dirty.delete(id);
  if (!bundleMarks.handed.delete(id)) bundleMarks.deleted.add(id);
  changed();
}

/** `levels` as bundle `id` keeps them: each a draft the store holds, named once and in no other bundle. */
function claimed(id, levels) {
  const kept = heldLevels(store.drafts, levels);
  takeOut(kept, id);
  return kept;
}

/** Take `levels` out of every bundle but `keeping`, marking each that loses one. */
function takeOut(levels, keeping = null) {
  for (const [key, b] of Object.entries(store.bundles)) {
    const id = Number(key);
    if (id === keeping || !b.levels.some((l) => levels.includes(l))) continue;
    b.levels = b.levels.filter((l) => !levels.includes(l));
    b.updated = Date.now();
    bundleMarks.dirty.add(id);
    bundleMarks.deleted.delete(id);
  }
}

function touchedBundle(id) {
  bundleMarks.dirty.add(id);
  bundleMarks.deleted.delete(id);
  changed();
}

// --- the write -----------------------------------------------------------------

function changed() {
  clearTimeout(timer);
  timer = setTimeout(write, SETTLE);
  emit("drafts-changed");
}

function write() {
  clearTimeout(timer);
  timer = 0;
  if (memoryOnly) return;
  let text = null;
  try {
    if (absorb(localStorage.getItem(KEY))) emit("drafts-changed");
    text = serialize(store, unread, unreadBundles);
    localStorage.setItem(KEY, text);
  } catch (e) {
    if (!refused) toast(!noRoom(e) ? REFUSED : known === null ? NO_ROOM : FULL);
    refused = true;
    return;
  }
  known = text;
  refused = false;
  for (const set of [dirty, deleted, handed, ...Object.values(bundleMarks)]) set.clear();
  forgotten = false;
  emit("drafts-written");
}

const pending = (marks) => marks.dirty.size > 0 || marks.deleted.size > 0;
const waiting = () => pending({ dirty, deleted }) || pending(bundleMarks) || forgotten;

/** Write what waits now, a write the browser refused included. */
export function flush() {
  if (timer || waiting()) write();
}

/** Merge the store's text, another tab's copy, where it is not the one last read or written here. */
function absorb(text) {
  if (text === known) return false;
  known = text;
  const read = parse(text);
  if (!forgotten) {
    unread = read.unread;
    unreadBundles = read.unreadBundles;
  }
  const out = merge(store, read.store, { dirty, deleted, handed, bundles: bundleMarks });
  store = out.store;
  if (out.moved.length) emit("drafts-moved", out.moved);
  emit("drafts-merged", out.taken);
  for (const [, to] of out.moved) toast(displaced(store.drafts[to].doc.title || UNTITLED));
  return true;
}

function take(text) {
  absorb(text);
  if (waiting()) changed();
  else emit("drafts-changed");
}

// A page back from the cache, or thawed, may have missed another tab's writes.
function reread() {
  if (memoryOnly) return;
  let text = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return;
  }
  take(text);
}

export function wireStore() {
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== null) return;
    if (e.storageArea && e.storageArea !== localStorage) return;
    take(e.key === null ? null : e.newValue);
  });
  addEventListener("pageshow", (e) => e.persisted && reread());
  document.addEventListener("resume", reread);
}
