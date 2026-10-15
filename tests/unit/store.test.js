import { test } from "node:test";
import assert from "node:assert/strict";
import { heldIn, idOf } from "../../public/js/format/held.js";
import { VERSION, empty, merge, parse, serialize } from "../../public/js/format/store.js";
import { blank, readProject } from "../../public/js/format/project.js";

const entry = (doc, more = {}) => ({ doc, updated: 1, saved: null, edits: 0, ...more });
const good = (world = "HIRO", more = {}) => ({ ...blank(world), ...more });
const text = (raw) => JSON.stringify(raw);
// A level the writer refuses: so many pickups that a link word runs past the file's range.
const crowd = () => {
  const blocks = Array.from({ length: 2049 }, (_, i) => ({
    cell: [1 + (i % 32), 1 + (Math.floor(i / 32) % 32), 1 + Math.floor(i / 1024)],
    kind: 0,
    faces: { 0: { type: 37, variant: 0 } },
  }));
  blocks.find((b) => b.cell.join() === "32,32,2").faces[1] = { type: 9, variant: 0 };
  return blocks;
};
// A store mixing one draft with entries that cannot be read, under keys of every kind.
const mixed = () => {
  const doc = good();
  return {
    version: 1,
    next: 2,
    drafts: {
      1: entry(doc),
      2: null,
      3: entry({ format: "something-else", blocks: [] }),
      4: entry({ ...doc, world: "NOWHERE" }),
      5: entry({ ...doc, blocks: crowd() }),
      6: "text",
      a: entry(doc),
      0: entry(doc),
    },
  };
};

// --- the store's text -------------------------------------------------------------

test("a store reads back its drafts, each document through the file's reader and the writer", () => {
  const doc = good("HAZE", { title: "Kept", time: 50 });
  const { store, unread } = parse(
    text({ version: 1, next: 3, drafts: { 2: entry(doc, { updated: 5, saved: 4, edits: 2 }) } }),
  );
  assert.deepEqual(store, {
    version: 1,
    next: 3,
    drafts: { 2: { doc: readProject(doc).project, updated: 5, saved: 4, edits: 2 } },
  });
  assert.deepEqual(Object.keys(unread), []);
});

test("an entry's times and count that are not numbers read as none", () => {
  const { store } = parse(
    text({ drafts: { 1: { doc: good(), updated: "x", saved: "y", edits: -1 } } }),
  );
  const d = store.drafts[1];
  assert.deepEqual([d.updated, d.saved, d.edits], [0, null, 0]);
});

test("text that is not a store is an empty one", () => {
  for (const t of [null, undefined, "", "not json", "[]", "7", "null", "true"]) {
    const { store, unread } = parse(t);
    assert.deepEqual(store, empty(), String(t));
    assert.deepEqual(Object.keys(unread), [], String(t));
  }
});

test("what cannot be read stays under its key, and the ids it names stay out of next's way", () => {
  const raw = mixed();
  const { store, unread } = parse(text(raw));
  assert.deepEqual(Object.keys(store.drafts), ["1"]);
  assert.deepEqual(Object.keys(unread).sort(), ["0", "2", "3", "4", "5", "6", "a"]);
  for (const key of Object.keys(unread)) assert.deepEqual(unread[key], raw.drafts[key], key);
  assert.equal(store.next, 7);
});

test("two spellings of one number are two keys: the number's own is read, the other stays as it is", () => {
  const raw = {
    version: 1,
    next: 2,
    drafts: { 1: entry(good()), "01": entry(good("MARS"), { updated: 2 }) },
  };
  const { store, unread } = parse(text(raw));
  assert.deepEqual(Object.keys(store.drafts), ["1"]);
  assert.equal(store.drafts[1].doc.world, "HIRO");
  assert.deepEqual(Object.keys(unread), ["01"]);
  const again = JSON.parse(serialize(store, unread));
  assert.deepEqual(Object.keys(again.drafts).sort(), ["01", "1"]);
  assert.deepEqual(again.drafts["01"], raw.drafts["01"]);
});

test("a key the language reserves is kept like any other, through a write", () => {
  const t = `{"version":1,"next":1,"drafts":{"__proto__":{"doc":1},"1":${text(entry(good()))}}}`;
  const { store, unread } = parse(t);
  assert.ok(Object.hasOwn(unread, "__proto__"));
  assert.deepEqual(unread["__proto__"], { doc: 1 });
  assert.deepEqual(Object.keys(store.drafts), ["1"]);
  const again = JSON.parse(serialize(store, unread));
  assert.ok(Object.hasOwn(again.drafts, "__proto__"));
  assert.deepEqual(Object.keys(again.drafts).sort(), ["1", "__proto__"]);
  assert.deepEqual(again.drafts["__proto__"], { doc: 1 });
});

test("a write carries the drafts and what could not be read, under the store's version and next", () => {
  const raw = { ...mixed(), version: 7 };
  const { store, unread } = parse(text(raw));
  const again = JSON.parse(serialize(store, unread));
  assert.deepEqual(Object.keys(again.drafts).sort(), Object.keys(raw.drafts).sort());
  assert.deepEqual([again.version, again.next], [7, 7]);
  assert.deepEqual(again.drafts[1], store.drafts[1]);
  assert.deepEqual(again.drafts[4], raw.drafts[4]);
});

test("a higher version is kept, and a lower or missing one reads as this one's", () => {
  assert.equal(parse(text({ version: 7, drafts: {} })).store.version, 7);
  for (const v of [undefined, 0, 1, -3, "7", 1.5])
    assert.equal(parse(text({ version: v, drafts: {} })).store.version, VERSION, String(v));
});

test("next is the largest of what is written, one, and one past every id named", () => {
  assert.equal(parse(text({ next: 9, drafts: { 1: entry(good()) } })).store.next, 9);
  assert.equal(parse(text({ next: 1, drafts: { 1: entry(good()), 7: null } })).store.next, 8);
  assert.equal(parse(text({ next: "x", drafts: {} })).store.next, 1);
  assert.equal(parse(text({ next: 4, drafts: 5 })).store.next, 4);
  assert.equal(parse(text({ next: 0, drafts: { a: null } })).store.next, 1);
});

test("the page's cheap test and the reader agree: every draft read is counted, every id named is read or kept", () => {
  const t = text(mixed());
  const { store, unread } = parse(t);
  const { named, shaped } = heldIn(t);
  for (const id of Object.keys(store.drafts).map(Number)) assert.ok(shaped.includes(id), id);
  const seen = [...Object.keys(store.drafts), ...Object.keys(unread)]
    .map(idOf)
    .filter((id) => id !== null)
    .sort((a, b) => a - b);
  assert.deepEqual(
    [...named].sort((a, b) => a - b),
    seen,
  );
});

// --- the merge ----------------------------------------------------------------------

const marks = (m = {}) => ({
  dirty: new Set(m.dirty),
  deleted: new Set(m.deleted),
  handed: new Set(m.handed),
});
const at = (title, updated) => entry(good("HIRO", { title }), { updated });
const table = (drafts, next = 10) => ({ version: VERSION, next, drafts });

test("per draft the later change wins, and theirs taking over clears the mark here", () => {
  const m = marks({ dirty: [1, 2] });
  const out = merge(
    table({ 1: at("Mine", 5), 2: at("Mine", 5) }),
    table({ 1: at("Theirs", 6), 2: at("Theirs", 4) }),
    m,
  );
  assert.deepEqual(
    Object.values(out.store.drafts).map((d) => d.doc.title),
    ["Theirs", "Mine"],
  );
  assert.deepEqual(out.taken, [1]);
  assert.deepEqual(out.moved, []);
  assert.deepEqual([...m.dirty], [2]);
});

test("two copies changed at the same time settle on the larger text, whichever side holds it", () => {
  const m = marks({ dirty: [1] });
  const out = merge(table({ 1: at("Mine", 5) }), table({ 1: at("Theirs", 5) }), m);
  assert.equal(out.store.drafts[1].doc.title, "Theirs");
  assert.deepEqual(out.taken, [1]);
  assert.deepEqual([...m.dirty], []);
  const n = marks({ dirty: [1] });
  const back = merge(table({ 1: at("Theirs", 5) }), table({ 1: at("Mine", 5) }), n);
  assert.equal(back.store.drafts[1].doc.title, "Theirs");
  assert.deepEqual(back.taken, []);
  assert.deepEqual([...n.dirty], [1]);
});

test("two copies changed at the same time that write the same keep this tab's, whatever order its keys are in", () => {
  const m = marks({ dirty: [1] });
  const mine = at("Same", 5);
  mine.doc = Object.fromEntries(Object.entries(mine.doc).reverse());
  const out = merge(table({ 1: mine }), table({ 1: at("Same", 5) }), m);
  assert.equal(out.store.drafts[1], mine);
  assert.deepEqual(out.taken, []);
  assert.deepEqual([...m.dirty], [1]);
});

test("two copies at one time alike in all but their marks settle on the larger text from both sides", () => {
  const more = entry(good(), { updated: 5, saved: 4, edits: 9 });
  const fewer = entry(good(), { updated: 5, saved: 4, edits: 1 });
  const m = marks({ dirty: [1] });
  const out = merge(table({ 1: fewer }), table({ 1: more }), m);
  assert.equal(out.store.drafts[1], more);
  assert.deepEqual(out.taken, [1]);
  assert.deepEqual([...m.dirty], []);
  const n = marks({ dirty: [1] });
  const back = merge(table({ 1: more }), table({ 1: fewer }), n);
  assert.equal(back.store.drafts[1], more);
  assert.deepEqual(back.taken, []);
  assert.deepEqual([...n.dirty], [1]);
});

test("a draft deleted here is not taken back, one changed here is kept though theirs lacks it, and one neither goes", () => {
  const m = marks({ dirty: [2], deleted: [1] });
  const out = merge(
    table({ 2: at("Changed", 5), 3: at("Unchanged", 5) }),
    table({ 1: at("Deleted", 9) }),
    m,
  );
  assert.deepEqual(Object.keys(out.store.drafts), ["2"]);
  assert.deepEqual(out.taken, []);
  assert.deepEqual([[...m.dirty], [...m.deleted]], [[2], [1]]);
});

test("a level of theirs under an id handed out here keeps the id, and this tab's draft moves on with its marks", () => {
  const m = marks({ dirty: [3], handed: [3] });
  const out = merge(table({ 3: at("Mine", 5) }, 4), table({ 3: at("Theirs", 9) }, 4), m);
  assert.deepEqual(out.moved, [[3, 4]]);
  assert.equal(out.store.drafts[3].doc.title, "Theirs");
  assert.equal(out.store.drafts[4].doc.title, "Mine");
  assert.equal(out.store.next, 5);
  assert.deepEqual([[...m.dirty], [...m.handed]], [[4], [4]]);
  assert.deepEqual(out.taken, []);
});

test("where the store has no id left to give, a clash of ids is settled as any other, by the later change", () => {
  const m = marks({ dirty: [3], handed: [3] });
  const spent = Number.MAX_SAFE_INTEGER + 1;
  const out = merge(table({ 3: at("Mine", 5) }, spent), table({ 3: at("Theirs", 9) }, spent), m);
  assert.deepEqual(out.moved, []);
  assert.deepEqual(Object.keys(out.store.drafts), ["3"]);
  assert.equal(out.store.drafts[3].doc.title, "Theirs");
  assert.deepEqual(out.taken, [3]);
  assert.equal(out.store.next, spent);
  assert.deepEqual([[...m.dirty], [...m.handed]], [[], [3]]);
});

test("a draft handed out here that theirs has not seen stays where it is", () => {
  const m = marks({ dirty: [3], handed: [3] });
  const out = merge(table({ 3: at("Mine", 5) }, 4), table({}, 3), m);
  assert.deepEqual(Object.keys(out.store.drafts), ["3"]);
  assert.deepEqual(out.moved, []);
  assert.equal(out.store.next, 4);
  assert.deepEqual([...m.handed], [3]);
});

test("next and version are the larger of the two, whichever side holds it", () => {
  const low = { version: 1, next: 3, drafts: {} };
  const high = { version: 7, next: 9, drafts: {} };
  assert.deepEqual(merge(low, high, marks()).store, high);
  assert.deepEqual(merge(high, low, marks()).store, high);
});

test("a merge returns a new table and leaves the two it was given as they were", () => {
  const mine = table({ 1: at("Mine", 5) });
  const theirs = table({ 1: at("Theirs", 9), 2: at("New", 1) });
  const [before, after] = [text(mine), text(theirs)];
  const out = merge(mine, theirs, marks());
  assert.notEqual(out.store, mine);
  assert.notEqual(out.store.drafts, mine.drafts);
  assert.deepEqual([text(mine), text(theirs)], [before, after]);
});
