import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import {
  setAnnotations,
  markersOf,
  kindBlocks,
  levelMarkers,
  blockMarkers,
  kindName,
} from "../../public/js/data.js";
import { state } from "../../public/js/state.js";
import { parseQuery, queryTerms } from "../../public/js/searchquery.js";
import { matchObjects, objectCandidates, rowOf } from "../../public/js/objectsearch.js";

setAnnotations(annotations);

const find = (q) => {
  const groups = parseQuery(q);
  return matchObjects(mapData, groups, queryTerms(groups));
};
const blocks = mapData.levels.flatMap((l) => kindBlocks(l, mapData.firstRecord));
const placed =
  mapData.levels.reduce((n, l) => n + l.records.flatMap(markersOf).length, 0) + blocks.length;
const ofKind = (kind) => blocks.filter((b) => b.marker.kind === kind).length;

test("every marker the game places, and every block of a kind of its own, is a candidate, once, in the disc's order", () => {
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
  assert.ok(bronze.every((c) => c.name === "Coin (bronze)"));
  assert.ok(find("coin").length > bronze.length);
});

test("a decoded field is a pair the row shows, and a term can name it", () => {
  const off = find("starts=off");
  assert.ok(off.length > 0);
  assert.ok(off.every((c) => c.shown.includes("starts=off")));
  const east = find("arrow facing=+x");
  assert.ok(east.length > 0);
  assert.ok(east.every((c) => c.shown.includes("facing=+x")));
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
  for (const c of find("coin")) assert.equal(c.rank, c.name === "Coin" ? 0 : 1);
  for (const c of find("bronze")) assert.equal(c.rank, 2);
  for (const c of find("starts=off")) assert.equal(c.rank, 3);
});

test("a block of a kind of its own answers to its name, its kind and its number", () => {
  for (const kind of [1, 2, 3, 4]) {
    const byName = find(kindName(kind));
    assert.ok(byName.length > 0, kindName(kind));
    assert.ok(byName.every((c) => c.marker.face === null && c.marker.kind === kind));
    assert.equal(byName.length, ofKind(kind), kindName(kind));
    assert.equal(find(`kind=${kind}`).length, ofKind(kind));
    const bare = find(String(kind)).filter((c) => c.marker.face === null && c.marker.type === null);
    assert.equal(bare.length, ofKind(kind));
    assert.ok(bare.every((c) => c.marker.kind === kind));
  }
  assert.equal(find("invisible").length, ofKind(3));
  assert.equal(find("acid").length, ofKind(4));
  // a single face of ice is an object, and the whole block is not
  const ice = find("ice");
  assert.ok(ice.some((c) => c.marker.face !== null));
  assert.equal(ice.filter((c) => c.marker.face === null).length, ofKind(2));
});

test("block alone finds every block named for its kind, and no plain one", () => {
  const hits = find("block");
  assert.ok(hits.every((c) => c.marker.face === null && / block$/.test(c.name)));
  const kinds = new Set(hits.map((c) => c.marker.kind));
  assert.deepEqual([...kinds].sort(), [1, 2, 3, 4, 6, 7]);
  assert.equal(find("kind=0").length, 0);
});

test("a block's row carries no type, since a block has none", () => {
  for (const c of objectCandidates(mapData).filter((c) => c.marker.type === null))
    assert.ok(!c.tokens.includes("null") && !c.more.some((s) => s.startsWith("type=")));
  assert.equal(find("null").length, 0);
});

test("the search finds in a level what the legend counts there", () => {
  state.data = mapData;
  const tally = (markers) => {
    const n = new Map();
    for (const m of markers) n.set(m.id, (n.get(m.id) || 0) + 1);
    return n;
  };
  const byLevel = Map.groupBy(objectCandidates(mapData), (c) => c.li);
  mapData.levels.forEach((l, li) => {
    const legend = tally([...levelMarkers(l), ...blockMarkers(l)]);
    assert.deepEqual(tally((byLevel.get(li) ?? []).map((c) => c.marker)), legend, l.name);
  });
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
  const rows = rowFor("2");
  assert.ok(rows.some((row) => row.includes("kind=2")));
  for (const row of rows)
    assert.ok(row.includes("type=2") || row.includes("kind=2"), row.join(" "));
});

test("a raw pair a term named joins the row, once", () => {
  for (const row of rowFor("f3=2")) assert.equal(row.filter((s) => s === "f3=2").length, 1);
  for (const row of rowFor("starts=off"))
    assert.equal(row.filter((s) => s === "starts=off").length, 1);
});
