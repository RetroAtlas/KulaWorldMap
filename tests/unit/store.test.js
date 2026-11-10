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
    bundles: null,
    unknown: Object.create(null),
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
  for (const t of [null, undefined, "", "not json", "[]", "[1,2]", "7", "null", "true"]) {
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

test("two spellings of one number are two keys: the number's own spelling is read, the other stays as it is", () => {
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
  assert.deepEqual(Object.keys(again), ["version", "next", "drafts", "bundles"]);
  assert.deepEqual(Object.keys(again.drafts).sort(), Object.keys(raw.drafts).sort());
  assert.deepEqual([again.version, again.next], [7, 7]);
  assert.deepEqual(again.drafts[1], store.drafts[1]);
  assert.deepEqual(again.drafts[4], raw.drafts[4]);
});

test("a higher version is kept, and a lower or missing one reads as this reader's version", () => {
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

test("the page's cheap test reads the drafts of a store carrying keys it does not know, as the reader does", () => {
  const t = `{"version":1,"next":2,"bundles":{"1":{"levels":[1]}},"tags":{"1":["set"]},"__proto__":{"drafts":{"9":${text(entry(good()))}}},"drafts":{"1":${text(entry(good()))}}}`;
  assert.deepEqual(heldIn(t), { named: [1], shaped: [1] });
  const { store } = parse(t);
  assert.deepEqual(Object.keys(store.drafts), ["1"]);
  assert.deepEqual(store.bundles, {
    1: { title: "", author: "", notes: "", levels: [1], updated: 0 },
  });
  assert.deepEqual(Object.keys(store.unknown).sort(), ["__proto__", "tags"]);
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
const table = (drafts, next = 10) => ({
  version: VERSION,
  next,
  drafts,
  bundles: {},
  unknown: Object.create(null),
});

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

test("two copies changed at the same time that write the same keep this tab's copy, whatever order its keys are in", () => {
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
  const low = table({}, 3);
  const high = { ...table({}, 9), version: 7 };
  assert.deepEqual(merge(low, high, marks()).store, high);
  assert.deepEqual(merge(high, low, marks()).store, high);
});

test("a merge returns a new table and leaves the two it was given as they were", () => {
  const mine = table({ 1: at("Mine", 5) });
  mine.bundles = { 4: set([1]) };
  mine.unknown.tags = { 3: { title: "Mine" } };
  const theirs = table({ 1: at("Theirs", 9), 2: at("New", 1) });
  theirs.bundles = { 4: set([1, 2], { updated: 9 }) };
  theirs.unknown.tags = { 3: { title: "Theirs" } };
  theirs.unknown.later = 1;
  const [before, after] = [text(mine), text(theirs)];
  const out = merge(mine, theirs, marks());
  assert.notEqual(out.store, mine);
  assert.notEqual(out.store.drafts, mine.drafts);
  assert.notEqual(out.store.unknown, mine.unknown);
  assert.notEqual(out.store.unknown, theirs.unknown);
  assert.notEqual(out.store.bundles, theirs.bundles);
  assert.notEqual(out.store.bundles[4], theirs.bundles[4]);
  assert.deepEqual([text(mine), text(theirs)], [before, after]);
});

test("a key the store does not know survives a parse, a write and a merge, a reserved name included", () => {
  const t = `{"version":1,"next":2,"drafts":{"1":${text(entry(good()))}},"tags":{"3":{"title":"Set"}},"__proto__":{"polluted":true},"constructor":"text"}`;
  const { store, unread } = parse(t);
  assert.deepEqual(Object.keys(store.unknown), ["tags", "__proto__", "constructor"]);
  assert.deepEqual(store.unknown.tags, { 3: { title: "Set" } });
  assert.deepEqual(store.unknown["__proto__"], { polluted: true });
  assert.equal(store.unknown.constructor, "text");
  assert.equal(Object.getPrototypeOf(store.unknown), null);
  assert.equal(Object.getPrototypeOf(store), Object.prototype);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
  const again = JSON.parse(serialize(store, unread));
  assert.deepEqual(Object.keys(again), [
    "version",
    "next",
    "drafts",
    "bundles",
    "tags",
    "__proto__",
    "constructor",
  ]);
  assert.deepEqual(again.tags, { 3: { title: "Set" } });
  assert.ok(Object.hasOwn(again, "__proto__"));
  assert.deepEqual(again["__proto__"], { polluted: true });
  assert.equal(again.constructor, "text");
  const theirs = parse(
    '{"version":1,"next":2,"drafts":{},"tags":{"3":{"title":"Theirs"}},"later":1}',
  ).store;
  const out = merge(store, theirs, marks());
  assert.deepEqual(Object.keys(out.store.unknown).sort(), [
    "__proto__",
    "constructor",
    "later",
    "tags",
  ]);
  assert.deepEqual(out.store.unknown.tags, { 3: { title: "Theirs" } });
  assert.equal(out.store.unknown.later, 1);
  assert.deepEqual(out.store.unknown["__proto__"], { polluted: true });
  assert.equal(out.store.unknown.constructor, "text");
  assert.equal(Object.getPrototypeOf(out.store.unknown), null);
  assert.deepEqual(Object.keys(JSON.parse(serialize(out.store, unread))).sort(), [
    "__proto__",
    "bundles",
    "constructor",
    "drafts",
    "later",
    "next",
    "tags",
    "version",
  ]);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
});

// --- the bundles --------------------------------------------------------------------

const set = (levels, more = {}) => ({
  title: "Set",
  author: "me",
  notes: "n",
  levels,
  updated: 1,
  ...more,
});
const two = () => ({ 1: entry(good()), 2: entry(good()) });
const read = (bundles, drafts = two(), more = {}) =>
  parse(text({ version: 1, next: 3, drafts, bundles, ...more }));
const bundled = (drafts, bundles, next = 10) => ({ ...table(drafts, next), bundles });
const bmarks = (m = {}) => ({
  ...marks(),
  bundles: { dirty: new Set(m.dirty), deleted: new Set(m.deleted), handed: new Set(m.handed) },
});

test("a bundle reads back with its texts, its levels in order and its time, writes as it was read and survives a merge", () => {
  const raw = set([2, 1], { updated: 5 });
  const { store, unread, unreadBundles } = read({ 4: raw });
  assert.deepEqual(store.bundles, { 4: raw });
  assert.deepEqual([Object.keys(unread), Object.keys(unreadBundles)], [[], []]);
  assert.equal(store.next, 5);
  const again = JSON.parse(serialize(store, unread, unreadBundles));
  assert.deepEqual(Object.keys(again), ["version", "next", "drafts", "bundles"]);
  assert.deepEqual(again.bundles, { 4: raw });
  const copy = parse(serialize(store, unread, unreadBundles)).store;
  assert.deepEqual(merge(store, copy, bmarks()).store.bundles, { 4: raw });
});

test("an empty store writes an empty table of bundles, a text without one reads as saying nothing of them, and one that is no table as none", () => {
  assert.deepEqual(empty().bundles, {});
  assert.deepEqual(JSON.parse(serialize(empty(), {})).bundles, {});
  const { store } = parse(text({ version: 1, next: 1, drafts: {} }));
  assert.equal(store.bundles, null);
  assert.deepEqual(JSON.parse(serialize(store, {})).bundles, {});
  for (const bundles of [null, 5, "text", true])
    assert.deepEqual(parse(text({ drafts: {}, bundles })).store.bundles, {}, String(bundles));
});

test("a bundle's texts are read under the level file's caps and a time that is not a number as none, and its list keeps the drafts the store holds, once each and in order", () => {
  const { store } = read(
    {
      4: set([2, 7, "1", 0, -1, 1.5, "__proto__", 3, 1, 2, Number.MAX_SAFE_INTEGER + 1], {
        title: "a".repeat(81),
        author: 5,
        notes: "c".repeat(2001),
        updated: "x",
      }),
    },
    { ...two(), 3: null },
  );
  assert.deepEqual(store.bundles[4], {
    title: "a".repeat(80),
    author: "",
    notes: "c".repeat(2000),
    levels: [2, 1],
    updated: 0,
  });
  assert.deepEqual(Object.keys(store.drafts), ["1", "2"]);
});

test("a draft listed in two bundles stays in the one changed last, and in the lower id where both changed at one time", () => {
  const { store } = read({ 3: set([1, 2], { updated: 5 }), 4: set([1], { updated: 9 }) });
  assert.deepEqual([store.bundles[3].levels, store.bundles[4].levels], [[2], [1]]);
  const tie = read({ 4: set([1], { updated: 5 }), 3: set([2, 1], { updated: 5 }) }).store;
  assert.deepEqual([tie.bundles[3].levels, tie.bundles[4].levels], [[2, 1], []]);
  assert.deepEqual(Object.keys(tie.bundles), ["3", "4"]);
  // past the ids the language orders itself, the keys come as written, so the id decides
  const high = read({
    4294967296: set([1], { updated: 5 }),
    4294967295: set([1], { updated: 5 }),
  }).store;
  assert.deepEqual([high.bundles[4294967295].levels, high.bundles[4294967296].levels], [[1], []]);
  assert.equal(high.next, 4294967297);
});

test("what cannot be read as a bundle stays under its key, a reserved name included, and keeps next past its id", () => {
  const t = `{"version":1,"next":1,"drafts":{"1":${text(entry(good()))}},"bundles":{"__proto__":{"levels":[1]},"constructor":5,"a":{"levels":[]},"2":{"title":"no list"},"3":null,"9":"text","4":{"levels":[1]}}}`;
  const { store, unread, unreadBundles } = parse(t);
  assert.deepEqual(Object.keys(store.bundles), ["4"]);
  assert.deepEqual(Object.keys(unreadBundles).sort(), [
    "2",
    "3",
    "9",
    "__proto__",
    "a",
    "constructor",
  ]);
  assert.ok(Object.hasOwn(unreadBundles, "__proto__"));
  assert.deepEqual(unreadBundles["__proto__"], { levels: [1] });
  assert.equal(Object.getPrototypeOf(unreadBundles), null);
  assert.deepEqual(Object.keys(unread), []);
  assert.equal(store.next, 10);
  const again = JSON.parse(serialize(store, unread, unreadBundles));
  assert.deepEqual(Object.keys(again.bundles).sort(), [
    "2",
    "3",
    "4",
    "9",
    "__proto__",
    "a",
    "constructor",
  ]);
  assert.deepEqual(again.bundles["__proto__"], { levels: [1] });
  assert.equal(again.bundles.constructor, 5);
  assert.deepEqual(again.bundles[4], { title: "", author: "", notes: "", levels: [1], updated: 0 });
  assert.deepEqual(heldIn(t), { named: [1], shaped: [1] });
  assert.equal(Object.hasOwn(Object.prototype, "levels"), false);
});

test("next passes every bundle's id as it passes every draft's id, read or not, where what is written is behind", () => {
  assert.equal(read({ 9: set([]) }, { 1: entry(good()) }, { next: 2 }).store.next, 10);
  assert.equal(read({ 12: null }, {}, { next: undefined }).store.next, 13);
  assert.equal(read({ 12: set([]) }, {}, { next: 20 }).store.next, 20);
});

test("per bundle the later change wins and theirs taking over clears the mark here, one deleted here is not taken back, one changed here is kept though theirs lacks it, and one neither goes", () => {
  const m = bmarks({ dirty: [1, 2, 4], deleted: [3] });
  const drafts = { 1: at("A", 1) };
  const out = merge(
    bundled(drafts, {
      1: set([], { title: "Mine", updated: 5 }),
      2: set([], { title: "Mine", updated: 5 }),
      4: set([], { title: "Kept" }),
      5: set([], { title: "Gone" }),
    }),
    bundled(drafts, {
      1: set([], { title: "Theirs", updated: 6 }),
      2: set([], { title: "Theirs", updated: 4 }),
      3: set([], { title: "Deleted" }),
    }),
    m,
  );
  assert.deepEqual(
    Object.entries(out.store.bundles).map(([id, b]) => [id, b.title]),
    [
      ["1", "Theirs"],
      ["2", "Mine"],
      ["4", "Kept"],
    ],
  );
  assert.deepEqual([[...m.bundles.dirty], [...m.bundles.deleted]], [[2, 4], [3]]);
});

test("two bundles changed at one time settle on the larger text, whichever side holds it, and the same copy keeps this tab's copy with its mark", () => {
  const drafts = { 1: at("A", 1) };
  const alpha = set([1], { title: "Alpha", updated: 5 });
  const beta = set([1], { title: "Beta", updated: 5 });
  const m = bmarks({ dirty: [1] });
  assert.equal(
    merge(bundled(drafts, { 1: alpha }), bundled(drafts, { 1: beta }), m).store.bundles[1].title,
    "Beta",
  );
  assert.deepEqual([...m.bundles.dirty], []);
  const n = bmarks({ dirty: [1] });
  assert.equal(
    merge(bundled(drafts, { 1: beta }), bundled(drafts, { 1: alpha }), n).store.bundles[1].title,
    "Beta",
  );
  assert.deepEqual([...n.bundles.dirty], [1]);
  const o = bmarks({ dirty: [1] });
  const same = merge(bundled(drafts, { 1: set([1]) }), bundled(drafts, { 1: set([1]) }), o);
  assert.deepEqual(same.store.bundles[1], set([1]));
  assert.deepEqual([...o.bundles.dirty], [1]);
});

test("a draft deleted in another tab leaves the bundle's list, and a copy without a table of bundles leaves this tab's bundles as they stand, where an empty table takes them", () => {
  const mine = bundled({ 1: at("A", 1), 2: at("B", 1) }, { 4: set([1, 2]) });
  const out = merge(mine, bundled({ 1: at("A", 1) }, { 4: set([1, 2]) }), bmarks());
  assert.deepEqual(Object.keys(out.store.drafts), ["1"]);
  assert.deepEqual(out.store.bundles, { 4: set([1]) });
  assert.deepEqual(merge(mine, bundled({ 1: at("A", 1) }, null), bmarks()).store.bundles, {
    4: set([1]),
  });
  assert.deepEqual(merge(mine, bundled({ 1: at("A", 1) }, {}), bmarks()).store.bundles, {});
  const older = parse(text({ version: 1, next: 10, drafts: { 1: at("A", 1) } })).store;
  assert.equal(older.bundles, null);
  assert.deepEqual(merge(mine, older, bmarks()).store.bundles, { 4: set([1]) });
});

test("a draft moved to a fresh id is followed into this tab's bundle and not into theirs, and a draft two bundles list is settled again after the merge", () => {
  const m = bmarks({ dirty: [7] });
  m.dirty.add(3);
  m.handed.add(3);
  const out = merge(
    bundled({ 3: at("Mine", 5) }, { 7: set([3], { updated: 9 }) }, 4),
    bundled({ 3: at("Theirs", 9) }, { 8: set([3], { updated: 5 }) }, 4),
    m,
  );
  assert.deepEqual(out.moved, [[3, 4]]);
  assert.deepEqual([out.store.bundles[7].levels, out.store.bundles[8].levels], [[4], [3]]);
  const drafts = { 1: at("A", 1) };
  const twice = merge(
    bundled(drafts, { 7: set([1], { updated: 9 }) }),
    bundled(drafts, { 8: set([1], { updated: 5 }) }),
    bmarks({ dirty: [7] }),
  );
  assert.deepEqual([twice.store.bundles[7].levels, twice.store.bundles[8].levels], [[1], []]);
});
