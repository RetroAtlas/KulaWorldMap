import { test } from "node:test";
import assert from "node:assert/strict";
import { blank } from "../../public/js/format/project.js";
import { KEY } from "../../public/js/format/held.js";
import { parse } from "../../public/js/format/store.js";

// The page the module expects: a storage that keeps what it is given, holding
// a store from before bundles, and a document and a window that take listeners
// and hold a toast.
const kept = new Map();
kept.set(
  KEY,
  JSON.stringify({
    version: 1,
    next: 2,
    drafts: { 1: { doc: blank("HIRO"), updated: 1, saved: null, edits: 0 } },
  }),
);
globalThis.localStorage = {
  getItem: (key) => kept.get(key) ?? null,
  setItem: (key, value) => void kept.set(key, String(value)),
};
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
const element = () => ({
  style: { setProperty() {} },
  classList: { add() {}, remove() {} },
  append() {},
  prepend() {},
  remove() {},
  setAttribute() {},
});
globalThis.document = {
  addEventListener() {},
  getElementById: element,
  createElement: element,
  hidden: false,
};
globalThis.addEventListener = () => {};
const drafts = await import("../../public/js/editor/drafts.js");
const { on } = await import("../../public/js/viewer/ui/dom.js");

let said = 0;
on("drafts-changed", () => said++);
const levelsOf = (id) => drafts.bundle(id).levels;
const made = (...worlds) => worlds.map((world) => drafts.create(blank(world)));

test("a store from before bundles loads with none, and a bundle is made over the drafts the store holds, each named once, with its id from the drafts' count", () => {
  drafts.load();
  assert.deepEqual(drafts.bundles(), []);
  assert.ok(drafts.get(1));
  const [a, b] = made("HIRO", "INCA");
  const id = drafts.createBundle({
    title: "Set",
    author: "me",
    notes: "n",
    levels: [b, a, a, 999, "x", 0],
  });
  assert.equal(id, b + 1);
  const { updated } = drafts.bundle(id);
  assert.ok(Number.isFinite(updated) && updated > 0);
  assert.deepEqual(drafts.bundle(id), {
    title: "Set",
    author: "me",
    notes: "n",
    levels: [b, a],
    updated,
  });
  assert.equal(made("HAZE")[0], id + 1);
  const other = drafts.createBundle({ title: "Other" });
  assert.deepEqual(
    drafts.bundles().map((x) => x.id),
    [id, other],
  );
  assert.deepEqual(drafts.bundles()[1], {
    id: other,
    title: "Other",
    author: "",
    notes: "",
    levels: [],
    updated: drafts.bundle(other).updated,
  });
  assert.equal(drafts.bundle(999), null);
});

test("a level put in a bundle leaves the one it was in, on making a bundle and on changing one, and a change to the texts leaves the levels alone", () => {
  const [a, b, c] = made("HIRO", "INCA", "MARS");
  const x = drafts.createBundle({ levels: [a, b] });
  const y = drafts.createBundle({ levels: [b] });
  assert.deepEqual([levelsOf(x), levelsOf(y)], [[a], [b]]);
  drafts.updateBundle(x, { levels: [a, b, c] });
  assert.deepEqual([levelsOf(x), levelsOf(y)], [[a, b, c], []]);
  drafts.updateBundle(y, { title: "Renamed", levels: [c, c] });
  drafts.updateBundle(y, { author: "me", notes: "n" });
  assert.deepEqual(drafts.bundle(y), {
    title: "Renamed",
    author: "me",
    notes: "n",
    levels: [c],
    updated: drafts.bundle(y).updated,
  });
  assert.deepEqual(levelsOf(x), [a, b]);
  drafts.updateBundle(999, { title: "None" });
  assert.equal(drafts.bundle(999), null);
});

test("deleting a draft takes it out of its bundle, and forgetting a bundle leaves its drafts", () => {
  const [a, b] = made("HIRO", "INCA");
  const x = drafts.createBundle({ levels: [a, b] });
  drafts.remove(a);
  assert.deepEqual([drafts.get(a), levelsOf(x)], [null, [b]]);
  drafts.removeBundle(x);
  assert.equal(drafts.bundle(x), null);
  assert.ok(drafts.get(b));
  drafts.removeBundle(x);
  assert.ok(drafts.get(b));
});

test("every change to a bundle says so once, and the write that waits carries the bundles as the store reads them", () => {
  drafts.flush();
  const [a, b] = made("HIRO", "INCA");
  const before = said;
  const x = drafts.createBundle({ title: "Set", levels: [a] });
  const y = drafts.createBundle({ levels: [a, b] });
  drafts.updateBundle(x, { notes: "n" });
  drafts.remove(b);
  drafts.removeBundle(y);
  assert.equal(said - before, 5);
  drafts.flush();
  const store = parse(kept.get(KEY)).store;
  assert.deepEqual(store.bundles[x], drafts.bundle(x));
  assert.equal(store.bundles[y], undefined);
  assert.deepEqual(
    Object.keys(store.bundles).map(Number),
    drafts.bundles().map((z) => z.id),
  );
  assert.deepEqual(
    Object.keys(store.drafts).map(Number),
    drafts
      .list()
      .map((d) => d.id)
      .sort((p, q) => p - q),
  );
});

// --- another tab's copy ----------------------------------------------------------
// A store as another tab or an earlier visit left it, read afresh; the tests above have
// written what they changed, so no mark waits.
const entry = (doc) => ({ doc, updated: 1, saved: null, edits: 0 });
const set = (levels, more = {}) => ({
  title: "",
  author: "",
  notes: "",
  levels,
  updated: 1,
  ...more,
});
function seeded(store) {
  drafts.flush();
  kept.set(KEY, JSON.stringify(store));
  drafts.load();
}
const written = () => JSON.parse(kept.get(KEY));
/** Another tab's copy of the store, `change` applied, put into storage ahead of this tab's write. */
function elsewhere(change) {
  const copy = written();
  change(copy);
  kept.set(KEY, JSON.stringify(copy));
}

test("bundles lists the lowest id first, also past the ids the language keeps in order for itself", () => {
  seeded({
    version: 1,
    next: 4294967297,
    drafts: { 1: entry(blank("HIRO")) },
    bundles: { 4294967296: set([], { updated: 9 }), 4294967295: set([1]) },
  });
  assert.deepEqual(
    drafts.bundles().map((b) => b.id),
    [4294967295, 4294967296],
  );
});

test("a change to a bundle's texts or its levels sets the time of its last change", () => {
  seeded({
    version: 1,
    next: 4,
    drafts: { 1: entry(blank("HIRO")), 2: entry(blank("INCA")) },
    bundles: { 3: set([1]) },
  });
  drafts.updateBundle(3, { title: "Renamed" });
  const renamed = drafts.bundle(3).updated;
  assert.ok(renamed > 1);
  drafts.updateBundle(3, { levels: [1, 2] });
  assert.ok(drafts.bundle(3).updated >= renamed);
});

test("a bundle forgotten here stays forgotten through another tab's copy that still carries it, and comes back once the write has landed and a copy carries it again", () => {
  seeded({ version: 1, next: 3, drafts: { 1: entry(blank("HIRO")) }, bundles: { 2: set([1]) } });
  drafts.removeBundle(2);
  elsewhere((copy) => (copy.bundles[2].notes = "theirs"));
  drafts.flush();
  assert.equal(drafts.bundle(2), null);
  assert.deepEqual(written().bundles, {});
  elsewhere((copy) => (copy.bundles[2] = set([1], { title: "Back", updated: 5 })));
  drafts.update(1, blank("INCA"));
  drafts.flush();
  assert.deepEqual(drafts.bundle(2), set([1], { title: "Back", updated: 5 }));
});

test("a bundle that lost a level to a new bundle is written with a later time, and kept through another tab's copy that lacks it", () => {
  seeded({
    version: 1,
    next: 4,
    drafts: { 1: entry(blank("HIRO")), 2: entry(blank("INCA")) },
    bundles: { 3: set([1, 2], { title: "Old" }) },
  });
  const y = drafts.createBundle({ levels: [2] });
  assert.equal(y, 4);
  elsewhere((copy) => (copy.bundles = {}));
  drafts.flush();
  const { bundles } = written();
  assert.deepEqual(bundles[3].levels, [1]);
  assert.ok(bundles[3].updated > 1);
  assert.deepEqual(bundles[4].levels, [2]);
});

test("a bundle handed out here and forgotten before the write leaves another tab's bundle under its id standing", () => {
  seeded({ version: 1, next: 5, drafts: { 1: entry(blank("HIRO")) }, bundles: {} });
  const x = drafts.createBundle({ title: "Mine", levels: [1] });
  assert.equal(x, 5);
  drafts.removeBundle(x);
  elsewhere((copy) => {
    copy.next = 6;
    copy.bundles[5] = set([1], { title: "Theirs", updated: 2 });
  });
  drafts.flush();
  assert.deepEqual(drafts.bundle(5), set([1], { title: "Theirs", updated: 2 }));
});

test("an entry of bundles that could not be read is written back as it is, found at the load or in another tab's copy, and goes with the removal of the drafts that could not be read", () => {
  const odd = { 7: "text", 8: { title: "No list" } };
  seeded({ version: 1, next: 9, drafts: { 1: entry(blank("HIRO")) }, bundles: odd });
  assert.deepEqual(drafts.bundles(), []);
  drafts.update(1, blank("INCA"));
  drafts.flush();
  assert.deepEqual(written().bundles, odd);
  elsewhere((copy) => (copy.bundles[5] = null));
  drafts.update(1, blank("MARS"));
  drafts.flush();
  assert.deepEqual(written().bundles, { ...odd, 5: null });
  seeded({ version: 1, next: 9, drafts: { 1: entry(blank("HIRO")), 2: "text" }, bundles: odd });
  assert.equal(drafts.unreadCount(), 1);
  drafts.removeUnread();
  drafts.flush();
  assert.deepEqual([Object.keys(written().drafts), written().bundles], [["1"], {}]);
});
