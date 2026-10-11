// The drafts' store as text and as a table, with nothing of the page or of storage in it.
import { WORLDS, writeKwl } from "./kwl.js";
import { readProject } from "./project.js";
import { draftShaped, idOf } from "./held.js";

export const VERSION = 1;

export const empty = () => ({ version: VERSION, next: 1, drafts: {} });

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
export function parse(text) {
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

/** The text a store is written as, the entries that could not be read carried as they are. */
export const serialize = (store, unread) =>
  JSON.stringify({ ...store, drafts: { ...unread, ...store.drafts } });

/** Another tab's copy folded into this one under the marks of what changed here, which follow a moved draft. */
export function merge(mine, theirs, { dirty, deleted, handed }) {
  const drafts = {};
  const taken = [];
  const moved = [];
  let next = Math.max(mine.next, theirs.next);
  for (const [key, d] of Object.entries(theirs.drafts)) {
    const id = Number(key);
    if (deleted.has(id)) continue;
    const own = mine.drafts[id];
    if (own && handed.has(id)) {
      drafts[id] = d;
      drafts[next] = own;
      moved.push([id, next++]);
    } else if (own && own.updated >= d.updated) drafts[id] = own;
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
  return {
    store: { version: Math.max(mine.version, theirs.version), next, drafts },
    taken,
    moved,
  };
}
