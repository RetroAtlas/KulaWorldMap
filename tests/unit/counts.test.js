import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations } from "./fixtures.js";
import {
  setAnnotations,
  markersOf,
  objectCount,
  blockCount,
  counted,
  platformCells,
  index,
} from "../../public/js/data.js";

setAnnotations(annotations);

const doc = readFileSync(
  fileURLToPath(new URL("../../docs/level-format.md", import.meta.url)),
  "utf8",
);
const level = (title) => mapData.levels.find((l) => (l.shown || l.name) === title);

test("a level's objects are the markers that stand on a face", () => {
  for (const l of mapData.levels) {
    const onFaces = l.records.flatMap(markersOf).filter((m) => m.face !== null).length;
    assert.equal(objectCount(l), onFaces, l.name);
  }
  const atlantis = level("LEVEL 94");
  assert.equal(atlantis.records.flatMap(markersOf).length, 20);
  assert.equal(objectCount(atlantis), 10);
});

// The ends of a laser and of a platform's run are read straight off the
// record here, and a platform's axis is the one its two ends differ on.
const ends = (r) => [r.f.slice(2, 5), r.f.slice(5, 8)];

test("a level's blocks are the lattice's and the ones the game adds on its empty cells", () => {
  let beamEnds = 0,
    emptyEnds = 0,
    carried = 0,
    along = 0;
  for (const l of mapData.levels) {
    const lattice = new Set();
    for (let i = 0; i < l.cells.length; i += 4) lattice.add(l.cells.slice(i, i + 3).join());
    const inPlay = new Set(lattice);
    for (const r of l.records.filter((r) => r.kind === 8))
      for (const end of ends(r)) {
        beamEnds++;
        if (!lattice.has(end.join())) emptyEnds++;
        inPlay.add(end.join());
      }
    let rest = 0;
    for (const r of l.records.filter((r) => r.kind === 5)) {
      const [lo, hi] = ends(r);
      const axis = [0, 1, 2].find((i) => lo[i] !== hi[i]);
      const laid = Array.from({ length: r.length }, (_, k) => {
        const at = [r.x, r.y, r.z];
        at[axis] += k;
        return at;
      });
      assert.deepEqual(platformCells(r), laid, `${l.name}: platform at ${r.x},${r.y},${r.z}`);
      for (const at of laid.slice(1)) {
        assert.ok(!inPlay.has(at.join()), `${l.name}: ${at}`);
        inPlay.add(at.join());
        rest++;
      }
    }
    carried += rest;
    if (rest) along++;
    assert.equal(blockCount(l), inPlay.size, l.name);
  }
  const beam = /\*\*(\d+) of the (\d+) ends are cells the lattice leaves empty\*\*/.exec(doc);
  assert.ok(beam, "level-format.md has no sentence about a beam's empty ends");
  assert.deepEqual([Number(beam[1]), Number(beam[2])], [emptyEnds, beamEnds]);
  const platform = /the other (\d+), on (\d+) levels, stand on cells the file leaves empty/.exec(
    doc,
  );
  assert.ok(platform, "level-format.md has no sentence about a platform's other blocks");
  assert.deepEqual([Number(platform[1]), Number(platform[2])], [carried, along]);
  assert.equal(blockCount(level("LEVEL 94")), 19);
});

test("a count of one takes the singular", () => {
  assert.equal(counted(1, "object"), "1 object");
  assert.equal(counted(0, "object"), "0 objects");
  assert.equal(counted(30, "object"), "30 objects");
});

test("a platform's route is laid a cell at a time, from the cell at one end to the other's", () => {
  let routes = 0;
  for (const l of mapData.levels) {
    const { railCells } = index(l);
    const laid = new Map();
    for (const r of l.records.filter((r) => r.kind === 5)) {
      const [a, b] = ends(r);
      const axis = [0, 1, 2].find((i) => a[i] !== b[i]);
      for (let t = Math.min(a[axis], b[axis]); t <= Math.max(a[axis], b[axis]); t++) {
        const cell = [...a];
        cell[axis] = t;
        const key = cell.join();
        laid.set(key, (laid.get(key) || 0) + 1);
      }
      routes++;
    }
    const got = new Map(
      [...railCells.values()].map((c) => [[c.x, c.y, c.z].join(), c.rails.length]),
    );
    assert.deepEqual(got, laid, l.name);
  }
  assert.equal(routes, 37);
});
