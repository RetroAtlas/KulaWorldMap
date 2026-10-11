// The levels of your own this browser keeps, written to localStorage a moment
// after each change.
import { emit } from "./dom.js";
import { toast } from "./toast.js";
import { WORLDS, writeKwl } from "./kwl.js";
import { UNTITLED, readProject } from "./project.js";
import { KEY, draftShaped, idOf } from "./held.js";

const SAID = "kula.drafts.said";
const VERSION = 1;
const SETTLE = 300;
const FULL = "This browser cannot hold more drafts; save them to files and delete some.";
const NO_ROOM =
  "This browser gives the map no room to keep levels, so they will live only until the page is closed.";
const FLEETING =
  "This browser cannot keep your levels, so they will live only until the page is closed.";
const displaced = (name) =>
  `Another tab's level took the place of ${name}, which stays in the list under a new link.`;

const empty = () => ({ version: VERSION, next: 1, drafts: {} });

let store = empty();
// Entries that could not be read, written back as they are until removed here.
let unread = Object.create(null);
let forgotten = false;
let memoryOnly = false;
let timer = 0;
let refused = false;
// The store's text as last read or written here; another in storage is a tab's copy.
let known = null;
// What changed here since the last write, which another tab's copy may lack:
// the drafts changed, the ids deleted, and the ids handed out, which another
// tab may hand out too until they reach storage.
const dirty = new Set();
const deleted = new Set();
const handed = new Set();

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

/** The store `text` holds, and the entries of it that could not be read. */
function parse(text) {
  const out = empty();
  const left = Object.create(null);
  let raw = null;
  try {
    raw = JSON.parse(text ?? "null");
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return { store: out, unread: left };
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
  out.next = Math.max(Number.isInteger(raw.next) ? raw.next : 1, 1, ...ids.map((id) => id + 1));
  return { store: out, unread: left };
}

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
  unread = read.unread;
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
  forgotten = true;
  changed();
}

/** Every draft, the one changed last first. */
export const list = () =>
  Object.entries(store.drafts)
    .map(([id, d]) => ({ id: Number(id), ...d }))
    .sort((a, b) => b.updated - a.updated || b.id - a.id);

export const get = (id) => store.drafts[id] ?? null;

/** A new draft; one read from a file names the file as `saved`, since the file is the record. */
export function create(project, { saved = null } = {}) {
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

export function remove(id) {
  if (!store.drafts[id]) return;
  delete store.drafts[id];
  dirty.delete(id);
  if (!handed.delete(id)) deleted.add(id);
  changed();
}

export const duplicate = (id) =>
  store.drafts[id] ? create(structuredClone(store.drafts[id].doc)) : null;

function touched(id) {
  dirty.add(id);
  deleted.delete(id);
  changed();
}

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
    text = JSON.stringify({ ...store, drafts: { ...unread, ...store.drafts } });
    localStorage.setItem(KEY, text);
  } catch {
    if (!refused) toast(known === null ? NO_ROOM : FULL);
    refused = true;
    return;
  }
  known = text;
  refused = false;
  dirty.clear();
  deleted.clear();
  handed.clear();
  forgotten = false;
  emit("drafts-written");
}

const waiting = () => dirty.size > 0 || deleted.size > 0 || forgotten;

/** Write what waits now, a write the browser refused included. */
export function flush() {
  if (timer || waiting()) write();
}

addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => document.hidden && flush());

// Another tab's copy of the store: the draft changed later wins, and what
// changed here since the last write is kept until that write. A level of
// theirs under an id handed out here, which never reached them, is a level of
// its own, so the draft of this tab's moves to a fresh id.
function merge(theirs) {
  const drafts = {};
  const taken = [];
  const moved = [];
  let next = Math.max(store.next, theirs.next);
  for (const [key, d] of Object.entries(theirs.drafts)) {
    const id = Number(key);
    if (deleted.has(id)) continue;
    const mine = store.drafts[id];
    if (mine && handed.has(id)) {
      drafts[id] = d;
      drafts[next] = mine;
      moved.push([id, next++]);
    } else if (mine && mine.updated >= d.updated) drafts[id] = mine;
    else {
      drafts[id] = d;
      dirty.delete(id);
      if (mine) taken.push(id);
    }
  }
  for (const [key, d] of Object.entries(store.drafts)) {
    const id = Number(key);
    if (!(id in drafts) && dirty.has(id)) drafts[id] = d;
  }
  for (const [from, to] of moved)
    for (const set of [dirty, handed]) if (set.delete(from)) set.add(to);
  store = { version: Math.max(store.version, theirs.version), next, drafts };
  if (moved.length) emit("drafts-moved", moved);
  emit("drafts-merged", taken);
  for (const [, to] of moved) toast(displaced(drafts[to].doc.title || UNTITLED));
}

/** Merge the store's text where it is not the one last read or written here. */
function absorb(text) {
  if (text === known) return false;
  known = text;
  const read = parse(text);
  if (!forgotten) unread = read.unread;
  merge(read.store);
  return true;
}

function take(text) {
  absorb(text);
  if (waiting()) changed();
  else emit("drafts-changed");
}

addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return;
  if (e.storageArea && e.storageArea !== localStorage) return;
  take(e.key === null ? null : e.newValue);
});

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

addEventListener("pageshow", (e) => e.persisted && reread());
document.addEventListener("resume", reread);
