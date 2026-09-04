import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData } from "./fixtures.js";

const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");

const objects = mapData.levels.flatMap((l) => l.objects);
const cellValues = mapData.levels.flatMap((l) => l.cells.filter((_, i) => i % 4 === 3));
const count = (v) => cellValues.filter((c) => c === v).length;
const catalogue = mapData.levels.find(
  (l) => l.name === "OBJ LEVEL" && l.pack === "/HILLS/HILLS.PAK",
);
const types = new Set(objects.map((o) => o.type));
const here = new Set(catalogue.objects.map((o) => o.type));

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
  ["style 0 cells", count(0), /(\d+) cells are style 0/],
  ["distinct types", types.size, /\*\*(\d+) distinct types\*\*/],
  [
    "kind/type pairs",
    new Set(objects.map((o) => `${o.kind}/${o.type}`)).size,
    /for (\d+) pairs in all/,
  ],
  [
    "trailing groups",
    mapData.levels.reduce((n, l) => n + l.records * 7, 0),
    /the game's ([\d,]+) of them/,
  ],
  [
    "levels at time 99",
    mapData.levels.filter((l) => l.start.time === 99).length,
    /99 on (\d+) of the 230 levels/,
  ],
  ["catalogue objects", catalogue.objects.length, /catalogue: (\d+) objects on a flat floor/],
  ["types the catalogue covers", here.size, /covering \*\*(\d+) of the game's \d+ types\*\*/],
];

for (const [what, value, pattern] of claims) {
  test(`the README's ${what} is what the data holds`, () => {
    const m = pattern.exec(readme);
    assert.ok(m, `README has no sentence matching ${pattern}`);
    assert.equal(Number(m[1].replace(/,/g, "")), value);
  });
}

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
  assert.equal(Number(m[2].replace(/,/g, "")), placed(missing));
  assert.equal(Number(m[3].replace(/,/g, "")), placed([...here]));
});
