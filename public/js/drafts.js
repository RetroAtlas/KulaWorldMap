// The levels of your own this browser keeps, written to localStorage a moment
// after each change.
import { emit } from "./dom.js";
import { toast } from "./toast.js";
import { WORLDS } from "./kwl.js";
import { readProject } from "./project.js";

export const KEY = "kula.drafts";
const VERSION = 1;
const SETTLE = 300;
const FULL = "This browser cannot hold more drafts; save them to files and delete some.";
const FLEETING =
  "This browser cannot keep your levels, so they will live only until the page is closed.";

const empty = () => ({ version: VERSION, next: 1, drafts: {} });

let store = empty();
// Entries that could not be read, written back as they are.
let unread = {};
let memoryOnly = false;
let timer = 0;
let refused = false;
// What changed here since the last write, which another tab's copy may lack.
const dirty = new Set();
const deleted = new Set();

function entryOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  let project;
  try {
    ({ project } = readProject(raw.doc));
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
  const left = {};
  let raw = null;
  try {
    raw = JSON.parse(text ?? "null");
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return { store: out, unread: left };
  const drafts = raw.drafts && typeof raw.drafts === "object" ? raw.drafts : {};
  const ids = [];
  for (const [key, d] of Object.entries(drafts)) {
    const id = Number(key);
    const named = Number.isInteger(id) && id > 0;
    if (named) ids.push(id);
    const entry = named ? entryOf(d) : null;
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
  const read = parse(text);
  store = read.store;
  unread = read.unread;
  const n = Object.keys(unread).length;
  if (n)
    toast(
      `${n} draft${n === 1 ? "" : "s"} in this browser could not be read and ${n === 1 ? "is" : "are"} kept as ${n === 1 ? "it is" : "they are"}.`,
    );
}

/** Every draft, the one changed last first. */
export const list = () =>
  Object.entries(store.drafts)
    .map(([id, d]) => ({ id: Number(id), ...d }))
    .sort((a, b) => b.updated - a.updated || b.id - a.id);

export const get = (id) => store.drafts[id] ?? null;

export function create(project) {
  const id = store.next++;
  store.drafts[id] = { doc: project, updated: Date.now(), saved: null, edits: 0 };
  touched(id);
  return id;
}

export function update(id, project) {
  const d = store.drafts[id];
  if (!d) return;
  d.doc = project;
  d.updated = Date.now();
  d.edits += 1;
  touched(id);
}

export function remove(id) {
  if (!store.drafts[id]) return;
  delete store.drafts[id];
  dirty.delete(id);
  deleted.add(id);
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
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...store, drafts: { ...unread, ...store.drafts } }));
  } catch {
    if (!refused) toast(FULL);
    refused = true;
    return;
  }
  refused = false;
  dirty.clear();
  deleted.clear();
}

/** Write what waits now. */
export function flush() {
  if (timer) write();
}

addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => document.hidden && flush());

// Another tab's copy of the store: the draft changed later wins, and what
// changed here since the last write is kept until that write.
function merge(theirs) {
  const drafts = {};
  for (const [key, d] of Object.entries(theirs.drafts)) {
    const id = Number(key);
    if (deleted.has(id)) continue;
    const mine = store.drafts[id];
    if (mine && mine.updated >= d.updated) drafts[id] = mine;
    else {
      drafts[id] = d;
      dirty.delete(id);
    }
  }
  for (const [key, d] of Object.entries(store.drafts)) {
    const id = Number(key);
    if (!(id in drafts) && dirty.has(id)) drafts[id] = d;
  }
  store = { version: VERSION, next: Math.max(store.next, theirs.next), drafts };
  emit("drafts-changed");
}

addEventListener("storage", (e) => {
  if (e.key !== KEY && e.key !== null) return;
  if (e.storageArea && e.storageArea !== localStorage) return;
  const read = parse(e.key === null ? null : e.newValue);
  unread = read.unread;
  merge(read.store);
});
