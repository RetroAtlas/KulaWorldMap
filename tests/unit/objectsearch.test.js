import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { setAnnotations, markersOf } from "../../public/js/data.js";
import { parseQuery, queryTerms } from "../../public/js/searchquery.js";
import { matchObjects, objectCandidates, rowOf } from "../../public/js/objectsearch.js";

setAnnotations(annotations);

const find = (q) => {
  const groups = parseQuery(q);
  return matchObjects(mapData, groups, queryTerms(groups));
};
const placed = mapData.levels.reduce((n, l) => n + l.records.flatMap(markersOf).length, 0);

test("every marker the game places is a candidate, once, in the disc's order", () => {
  const rows = objectCandidates(mapData);
  assert.equal(rows.length, placed);
  assert.equal(objectCandidates(mapData), rows);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].li <= rows[i].li);
});

test("a name, its type number and the bare number find the same things", () => {
  const byName = find("key");
  assert.ok(byName.length > 100);
  assert.ok(byName.every((c) => c.marker.type === 31));
  assert.equal(find("type 31").length, byName.length);
  assert.equal(find("31").length, byName.length);
});

test("a variant answers to its own name and to its type's", () => {
  const bronze = find("bronze");
  assert.ok(bronze.length > 0);
  assert.ok(bronze.every((c) => c.name === "Bronze coin"));
  assert.ok(find("coin").length > bronze.length);
});

test("a decoded field is a pair the row shows, and a term can name it", () => {
  const off = find("starts=off");
  assert.ok(off.length > 0);
  assert.ok(off.every((c) => c.shown.includes("starts=off")));
  const second = find("key number=1");
  assert.ok(second.length > 0);
  assert.ok(second.every((c) => c.marker.type === 31 && c.shown.includes("number=1")));
});

test("a raw field is a whole word, so f3=2 is not also f3=20", () => {
  const hits = find("f3=2");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((c) => c.marker.f[1] === 2));
  assert.ok(hits.every((c) => c.more.includes("f3=2")));
});

test("the value word is searched by the name the panel gives it", () => {
  const hits = find("f14=30");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((c) => c.marker.v === 30 && c.more.includes("f14=30")));
  assert.equal(find("v=30").length, 0);
});

test("a record that is its own thing answers to its kind", () => {
  const hits = find("kind 6");
  assert.ok(hits.length > 0);
  assert.ok(hits.every((c) => c.marker.face === null && c.marker.kind === 6));
  assert.ok(hits.every((c) => c.face === null));
});

test("the name's rank: exact, prefix, substring, then a match outside the name", () => {
  for (const c of find("coin")) assert.equal(c.rank, c.name === "Coin" ? 0 : 2);
  for (const c of find("bronze")) assert.equal(c.rank, 1);
  for (const c of find("starts=off")) assert.equal(c.rank, 3);
});

const rowFor = (q) => {
  const groups = parseQuery(q);
  const terms = queryTerms(groups);
  return matchObjects(mapData, groups, terms).map((h) => rowOf(h, terms));
};

test("a row names the face and cell, and nothing more where the name says why", () => {
  for (const row of rowFor("key")) {
    assert.match(row[0], /^(top|[+-][xy] side|underside)$/);
    assert.match(row[1], /^\d+,\d+,\d+$/);
    assert.ok(!row.some((s) => s.startsWith("type=")));
  }
});

test("a bare number says on every row which type or kind it named", () => {
  for (const row of rowFor("31")) assert.ok(row.includes("type=31"), row.join(" "));
  for (const row of rowFor("kind 6")) assert.ok(row.includes("kind=6"), row.join(" "));
});

test("a raw pair a term named joins the row, once", () => {
  for (const row of rowFor("f3=2")) assert.equal(row.filter((s) => s === "f3=2").length, 1);
  for (const row of rowFor("starts=off"))
    assert.equal(row.filter((s) => s === "starts=off").length, 1);
});
