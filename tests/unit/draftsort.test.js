import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SORTS, matches, ordering } from "../../public/js/editor/draftsort.js";

const WORLDS = ["HIRO", "INCA", "ATLANTIS"];
const record = (id, title, world, updated, { saved = null, edits = 0 } = {}) => ({
  id,
  title,
  world,
  updated,
  saved,
  edits,
});
const sorted = (records, sort) => [...records].sort(ordering(sort, WORLDS));
const titles = (records, sort) => sorted(records, sort).map((r) => r.title);
const ids = (records, sort) => sorted(records, sort).map((r) => r.id);

// never saved, saved and unchanged since, changed since its save, and saved and unchanged
const RECORDS = [
  record(1, "Level 10", "ATLANTIS", 300),
  record(2, "Level 2", "HIRO", 500, { saved: 500 }),
  record(3, "Untitled level", "INCA", 500, { saved: 100, edits: 2 }),
  record(4, "Alpha", "INCA", 100, { saved: 50 }),
];

test("the sorts are the change, the title, the world and the unsaved, the change first", () => {
  assert.deepEqual(SORTS, ["changed", "title", "world", "unsaved"]);
});

test("by the change, the latest first, the higher id first among levels changed at one time", () => {
  assert.deepEqual(titles(RECORDS, "changed"), ["Untitled level", "Level 2", "Level 10", "Alpha"]);
});

test("by title, a number in a title counting as a number, one title's levels by the change", () => {
  assert.deepEqual(titles(RECORDS, "title"), ["Alpha", "Level 2", "Level 10", "Untitled level"]);
  const same = [record(1, "Same", "HIRO", 100), record(2, "Same", "HIRO", 200)];
  assert.deepEqual(ids(same, "title"), [2, 1]);
});

test("by world in the game's order, one world's levels by the change", () => {
  assert.deepEqual(titles(RECORDS, "world"), ["Level 2", "Untitled level", "Alpha", "Level 10"]);
});

test("with the levels not saved to a file first, one changed since its save among them, each group by the change", () => {
  assert.deepEqual(titles(RECORDS, "unsaved"), ["Untitled level", "Level 10", "Level 2", "Alpha"]);
});

test("a sort not known orders by the change, a name every object inherits among them", () => {
  assert.deepEqual(titles(RECORDS, "colour"), titles(RECORDS, "changed"));
  assert.deepEqual(titles(RECORDS, "constructor"), titles(RECORDS, "changed"));
});

test("the filter holds a level whose title or world holds the text, whatever the case, and an empty text holds every level", () => {
  const r = record(1, "Spiral Up", "ATLANTIS", 1);
  assert.equal(matches(r, "spiral"), true);
  assert.equal(matches(r, "RAL U"), true);
  assert.equal(matches(r, "atlant"), true);
  assert.equal(matches(r, "Hiro"), false);
  assert.equal(matches(r, "spiral up the wall"), false);
  assert.equal(matches(r, ""), true);
  assert.equal(matches(r, "   "), true);
});

test("the sort control offers the sorts the module knows, in its order", () => {
  const page = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
  const select = /<select id="draftSort"[^>]*>([\s\S]*?)<\/select>/.exec(page);
  assert.ok(select, "no #draftSort in the page");
  const offered = [...select[1].matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(offered, SORTS);
});
