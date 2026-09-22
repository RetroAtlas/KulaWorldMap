import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { setAnnotations } from "../../public/js/data.js";
import { parseQuery, queryTerms } from "../../public/js/searchquery.js";
import { matchPlaces, placeCandidates } from "../../public/js/placesearch.js";

setAnnotations(annotations);

const find = (q, current = -1) => {
  const groups = parseQuery(q);
  return matchPlaces(mapData, groups, queryTerms(groups), current);
};
const names = (hits) => hits.map((c) => c.name);

test("a world and every level are candidates, each once", () => {
  const rows = placeCandidates(mapData);
  assert.equal(rows.length, mapData.themes.length + mapData.levels.length);
  assert.equal(placeCandidates(mapData), rows);
});

test("a number in a query is a whole word: level 45 is not also LEVEL 145", () => {
  assert.deepEqual(names(find("level 45")), ["LEVEL 45"]);
});

test("a final answers to its number counted on from 150", () => {
  assert.deepEqual(names(find("level 157")), ["FINAL 7"]);
  assert.deepEqual(names(find("final 7")), ["FINAL 7"]);
});

test("a world's name finds the world and its levels, the level in hand first among them", () => {
  const hits = find("hiro", 3);
  assert.ok(hits[0].world, "the world ranks first by its name");
  assert.equal(hits[1].li, 3);
  const levels = hits.filter((c) => c.level);
  assert.equal(levels.length, mapData.themes.find((t) => t.id === "HIRO").levels.length);
});

test("a word is a substring, so inc finds Inca", () => {
  assert.ok(find("inc").some((c) => c.world?.id === "INCA"));
});

test("the ranks run exact, prefix, substring, then a match outside the name", () => {
  const hits = find("bonus, hiro", 3);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].rank <= hits[i].rank);
  assert.ok(hits[0].world, "HIRO is the world's own name");
  assert.equal(hits[0].rank, 0);
  assert.ok(hits.find((c) => c.level).name.startsWith("BONUS"));
  assert.equal(hits.find((c) => c.rank === 3).li, 3, "the level in hand leads its rank");
});
