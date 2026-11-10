import { test } from "node:test";
import assert from "node:assert/strict";
import { SORTS, matches, ordering } from "../../public/js/community/sort.js";

const WORLDS = ["HIRO", "INCA", "ATLANTIS"];
const record = (id, title, author, world) => ({ id, title, author, world });
const sorted = (records, sort) => [...records].sort(ordering(sort, WORLDS));
const titles = (records, sort) => sorted(records, sort).map((r) => r.title);
const ids = (records, sort) => sorted(records, sort).map((r) => r.id);

// two by one author, one by another and one that names none, sent in out of the worlds' order
const RECORDS = [
  record(1, "Level 10", "Bea", "ATLANTIS"),
  record(2, "Level 2", "Ada", "HIRO"),
  record(3, "Untitled level", "", "INCA"),
  record(4, "Alpha", "Ada", "INCA"),
];

test("the sorts are the newest, the title, the author and the world, the newest first", () => {
  assert.deepEqual(SORTS, ["newest", "title", "author", "world"]);
});

test("newest first is the highest id first, since the ids are given in order", () => {
  assert.deepEqual(ids(RECORDS, "newest"), [4, 3, 2, 1]);
});

test("by title, a number in a title counting as a number, one title's levels newest first", () => {
  assert.deepEqual(titles(RECORDS, "title"), ["Alpha", "Level 2", "Level 10", "Untitled level"]);
  const same = [record(1, "Same", "", "HIRO"), record(2, "Same", "", "HIRO")];
  assert.deepEqual(ids(same, "title"), [2, 1]);
});

test("by author, the levels that name none last, one author's levels newest first", () => {
  assert.deepEqual(titles(RECORDS, "author"), ["Alpha", "Level 2", "Level 10", "Untitled level"]);
  assert.deepEqual(ids(RECORDS, "author"), [4, 2, 1, 3]);
});

test("by world in the game's order, one world's levels newest first", () => {
  assert.deepEqual(titles(RECORDS, "world"), ["Level 2", "Alpha", "Untitled level", "Level 10"]);
});

test("a sort not known orders newest first, a name every object inherits among them", () => {
  assert.deepEqual(ids(RECORDS, "colour"), ids(RECORDS, "newest"));
  assert.deepEqual(ids(RECORDS, "constructor"), ids(RECORDS, "newest"));
  assert.deepEqual(ids(RECORDS, "__proto__"), ids(RECORDS, "newest"));
});

test("the filter holds a level whose title, author or world holds the text, whatever the case, and an empty text holds every level", () => {
  const r = record(1, "Spiral Up", "Ada Lovelace", "ATLANTIS");
  assert.equal(matches(r, "spiral"), true);
  assert.equal(matches(r, "RAL U"), true);
  assert.equal(matches(r, "lovelace"), true);
  assert.equal(matches(r, "atlant"), true);
  assert.equal(matches(r, "Hiro"), false);
  assert.equal(matches(r, "spiral up the wall"), false);
  assert.equal(matches(r, ""), true);
  assert.equal(matches(r, "   "), true);
  assert.equal(matches(record(2, "Plain", "", "HIRO"), "ada"), false);
});
