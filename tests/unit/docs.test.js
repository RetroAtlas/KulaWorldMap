import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations } from "./fixtures.js";

const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");

const objectsOf = (levels) => levels.flatMap((l) => l.records.flatMap((r) => r.on));
// What the game has is counted over the levels the game plays: the catalogue is
// not one of them, and two of its types are placed nowhere else.
const played = mapData.levels.filter((l) => l.name !== "OBJ LEVEL");
const objects = objectsOf(played);
const cellValues = mapData.levels.flatMap((l) => l.cells.filter((_, i) => i % 4 === 3));
const count = (v) => cellValues.filter((c) => c === v).length;
const onFace = (test) => objectsOf(mapData.levels).filter((o) => test(o.face)).length;
const catalogue = mapData.levels.find(
  (l) => l.name === "OBJ LEVEL" && l.pack === "/HILLS/HILLS.PAK",
);
const types = new Set(objects.map((o) => o.type));
const here = new Set(objectsOf([catalogue]).map((o) => o.type));
const covered = [...types].filter((t) => here.has(t));
const number = (s) => Number(s.replace(/,/g, ""));

// The README argues from counts, and a rebuild can move any of them. Each row
// is the figure a sentence rests on, so a claim cannot go stale in silence.
const claims = [
  ["levels", mapData.levels.length, /All (\d+) levels are here/],
  ["lattice side", mapData.side, /fixed \*\*(\d+) x \d+ x \d+ lattice\*\*/],
  [
    "cell/record pairs",
    cellValues.filter((c) => c >= mapData.firstRecord).length,
    /all (\d+) pairs in the game agree/,
  ],
  [
    "cells by style",
    [count(0), count(3), count(2), count(1)],
    /(\d+) cells are plain, then (\d+) invisible, (\d+) ice and (\d+) fire/,
  ],
  [
    "objects by face",
    [onFace((f) => f === 0), onFace((f) => f === 5), onFace((f) => f > 0 && f < 5)],
    /(\d+) on tops, (\d+) on undersides and (\d+) on sides/,
  ],
  ["distinct types", types.size, /\*\*(\d+) distinct object types\*\*/],
  [
    "levels at time 99",
    mapData.levels.filter((l) => l.time === 99).length,
    /99 on (\d+) of the 230 levels/,
  ],
  ["catalogue objects", objectsOf([catalogue]).length, /object catalogue: (\d+) objects and/],
  [
    "types the catalogue covers",
    [covered.length, types.size],
    /covering \*\*(\d+) of the game's (\d+) object types\*\*/,
  ],
];

for (const [what, value, pattern] of claims) {
  test(`the README's ${what} is what the data holds`, () => {
    const m = pattern.exec(readme);
    assert.ok(m, `README has no sentence matching ${pattern}`);
    assert.deepEqual(m.slice(1).map(number), [].concat(value));
  });
}

test("the README's catalogue records are the nine that are their own thing", () => {
  const m =
    /object catalogue: \d+ objects and (\w+) records of the kinds that are their own thing/.exec(
      readme,
    );
  assert.ok(m, "README has no sentence about the catalogue's records");
  assert.equal(m[1], "nine");
  assert.equal(catalogue.records.filter((r) => "type" in r).length, 9);
});

test("the README's catalogue arithmetic adds up", () => {
  const missing = [...types].filter((t) => !here.has(t));
  const placed = (set) => objects.filter((o) => set.includes(o.type)).length;
  const m =
    /the (\w+) it misses are placed ([\d,]+) times between them against the \d+'s ([\d,]+)/.exec(
      readme,
    );
  assert.ok(m, "README has no sentence about what the catalogue misses");
  assert.equal(m[1], "seven");
  assert.equal(missing.length, 7);
  assert.equal(number(m[2]), placed(missing));
  assert.equal(number(m[3]), placed(covered));
});

// The points are curated rather than read, and the README's arithmetic is what
// they rest on, so neither can change without the other.
test("the README's points are the ones annotations.json scores", () => {
  const m =
    /coins worth (\d+), (\d+) or (\d+) by their colour field, gems (\d+), keys (\d+), fruit (\d+), an hourglass (\d+), sunglasses (\d+) and a crumbling block (\d+)/.exec(
      readme,
    );
  assert.ok(m, "README has no sentence giving the points");
  const type = (t) => annotations.types[t];
  const coin = (tier) => type(37).variants[tier].points;
  const fruit = new Set([43, 44, 45, 46, 47].map((t) => type(t).points));
  assert.equal(fruit.size, 1, "the five fruit score differently");
  assert.deepEqual(m.slice(1).map(number), [
    coin(2),
    coin(1),
    coin(0),
    type(36).points,
    type(31).points,
    [...fruit][0],
    type(35).points,
    type(38).points,
    annotations.kinds[6].points,
  ]);
  const star = /Type 42, which only the catalogue places, scores (\d+) while it is green/.exec(
    readme,
  );
  assert.ok(star, "README has no sentence giving the catalogue star's points");
  assert.equal(number(star[1]), type(42).points);
});
