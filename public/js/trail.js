// The steps each draft took this session, kept in memory alone: a document is
// never changed in place, so a step is the document before it.
import { emit, on } from "./dom.js";
import * as drafts from "./drafts.js";
import { same } from "./project.js";

const CAP = 200;
const COALESCE_MS = 1000;
const trails = new Map();

function of(id) {
  let t = trails.get(id);
  if (!t) trails.set(id, (t = { past: [], future: [] }));
  return t;
}

/** Make `next` the draft's document as one step, labelled as its announcement
    reads in lower case; with `merge`, a step like the one just taken within a
    moment joins it, and a join back to its start drops it. False where nothing would change. */
export function edit(id, next, label, { merge = false } = {}) {
  const d = drafts.get(id);
  if (!d || same(next, d.doc)) return false;
  const t = of(id);
  const last = t.past.at(-1);
  const now = performance.now();
  const joined = merge && last?.label === label && now - last.at < COALESCE_MS;
  if (joined && same(next, last.doc)) {
    t.past.pop();
    drafts.update(id, last.doc, -1);
    emit("trail-changed", id);
    return true;
  }
  if (joined) last.at = now;
  else {
    t.past.push({ doc: d.doc, label, at: now });
    if (t.past.length > CAP) t.past.shift();
  }
  t.future = [];
  drafts.update(id, next, joined ? 0 : 1);
  emit("trail-changed", id);
  return true;
}

/** Take the last step back; its label, or null where there is none. */
export function undo(id) {
  const t = trails.get(id);
  const d = drafts.get(id);
  if (!t?.past.length || !d) return null;
  const step = t.past.pop();
  t.future.push({ doc: d.doc, label: step.label });
  drafts.update(id, step.doc, -1);
  emit("trail-changed", id);
  return step.label;
}

/** Take the last step taken back again; its label, or null where there is none. */
export function redo(id) {
  const t = trails.get(id);
  const d = drafts.get(id);
  if (!t?.future.length || !d) return null;
  const step = t.future.pop();
  t.past.push({ doc: d.doc, label: step.label, at: -Infinity });
  drafts.update(id, step.doc);
  emit("trail-changed", id);
  return step.label;
}

export const canUndo = (id) => (trails.get(id)?.past.length ?? 0) > 0;
export const canRedo = (id) => (trails.get(id)?.future.length ?? 0) > 0;
export const steps = (id) => ({
  past: trails.get(id)?.past.length ?? 0,
  future: trails.get(id)?.future.length ?? 0,
});

function drop(id) {
  if (!trails.delete(id)) return;
  emit("trail-changed", id);
}

// A draft gone from the store, or replaced by another tab's copy, takes its
// trail with it, and one moved to a fresh id takes it along.
on("drafts-changed", () => {
  for (const id of [...trails.keys()]) if (!drafts.get(id)) drop(id);
});
on("drafts-merged", (ids) => ids.forEach(drop));
on("drafts-moved", (pairs) => {
  for (const [from, to] of pairs) {
    const t = trails.get(from);
    trails.delete(from);
    if (t) trails.set(to, t);
    emit("trail-changed", to);
  }
});
