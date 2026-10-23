import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations, objects, levelKey } from "./fixtures.js";
import {
  setAnnotations,
  setObjects,
  markersOf,
  objectCount,
  blockCount,
  counted,
  platformCells,
  index,
  levelMarkers,
  blockMarkers,
  levelScore,
} from "../../public/js/viewer/data.js";
import { levelPoints, tallied, playsBonus } from "../../public/js/viewer/draw/points.js";
import { state } from "../../public/js/viewer/state.js";
import { SIDE } from "../../public/js/format/lattice.js";
import { FORMAT } from "../../public/js/format/kwl.js";
import { blank, counts, fromLevel, toLevel } from "../../public/js/format/project.js";

setAnnotations(annotations);
setObjects(objects);

const doc = readFileSync(
  fileURLToPath(new URL("../../docs/level-format.md", import.meta.url)),
  "utf8",
);
const reasons = readFileSync(
  fileURLToPath(new URL("../../docs/annotations.md", import.meta.url)),
  "utf8",
);
const editor = readFileSync(
  fileURLToPath(new URL("../../docs/editor.md", import.meta.url)),
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

test("the legend counts a block of a painted kind once, whether its cell or its record keeps the kind", () => {
  state.data = mapData;
  const painted = (k) => k > 0 && k < mapData.styles;
  for (const l of mapData.levels) {
    const want = new Map();
    const add = (k) => want.set(k, (want.get(k) || 0) + 1);
    for (let i = 3; i < l.cells.length; i += 4) if (painted(l.cells[i])) add(l.cells[i]);
    for (const r of l.records) if (painted(r.kind)) add(r.kind);
    const got = new Map();
    for (const m of blockMarkers(l)) got.set(m.kind, (got.get(m.kind) || 0) + 1);
    assert.deepEqual(got, want, l.name);
    const twice = levelMarkers(l).filter((m) => m.face === null && painted(m.kind));
    assert.deepEqual(twice, [], l.name);
  }
  assert.deepEqual(
    blockMarkers(level("LEVEL 94")).map((m) => m.id),
    ["k2"],
  );
});

// Two kinds' reasons say where the game puts them, counted as the legend
// counts, so the sentences hold the figures they rest on.
test("the kind sections' shares by world are what the data holds", () => {
  state.data = mapData;
  const byWorld = (kind) => {
    const out = new Map();
    for (const l of mapData.levels) {
      if (l.name === "OBJ LEVEL") continue;
      const n = blockMarkers(l).filter((m) => m.kind === kind).length;
      out.set(l.theme, (out.get(l.theme) || 0) + n);
    }
    return out;
  };
  const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
  const ice = byWorld(2);
  const most = /Most of the game's (\d+) are in Arctic and Hell, (\d+) and (\d+)\./.exec(reasons);
  assert.ok(most, "annotations.md has no sentence about where the ice blocks are");
  assert.deepEqual(most.slice(1).map(Number), [total(ice), ice.get("ARCTIC"), ice.get("HELL")]);
  assert.ok((ice.get("ARCTIC") + ice.get("HELL")) * 2 > total(ice));
  const invisible = byWorld(3);
  const half = /More than half of the game's (\d+) are in Haze, (\d+) of them\./.exec(reasons);
  assert.ok(half, "annotations.md has no sentence about where the invisible blocks are");
  assert.deepEqual(half.slice(1).map(Number), [total(invisible), invisible.get("HAZE")]);
  assert.ok(invisible.get("HAZE") * 2 > total(invisible));
});

// A level's section of annotations.md, from its heading to the next.
const section = (l) => {
  const at = reasons.indexOf(`### ${levelKey(l)}:`);
  const end = reasons.indexOf("\n#", at + 1);
  return at < 0 ? "" : reasons.slice(at, end < 0 ? undefined : end);
};
const figure = (s) => Number(s.replace(/,/g, ""));

test("a curated score's section says how much more the disc holds, and no other section does", () => {
  state.data = mapData;
  const curated = mapData.levels.filter((l) => levelScore(l) !== null);
  for (const l of curated) {
    const more = /The disc holds ([\d,]+) more/.exec(section(l));
    assert.ok(more, `annotations.md does not say how much more ${levelKey(l)} holds`);
    assert.equal(figure(more[1]), levelPoints(l) - levelScore(l), levelKey(l));
  }
  assert.equal(
    reasons.match(/The disc holds [\d,]+ more/g)?.length,
    curated.length,
    "annotations.md says how much more the disc holds where no score is curated",
  );
});

test("annotations.md's LEVEL 131 is collected for all the disc holds", () => {
  state.data = mapData;
  const l = level("LEVEL 131");
  const m = /for the level's full ([\d,]+), everything the disc holds/.exec(section(l));
  assert.ok(m, "annotations.md has no sentence giving LEVEL 131's total");
  assert.equal(figure(m[1]), levelPoints(l));
  assert.equal(levelScore(l), null);
});

test("a bonus level's tally reads a cell's kind off the record its value names, not off another on the cell", () => {
  state.data = mapData;
  const first = mapData.firstRecord;
  const record = (x, y, z, kind) => ({ x, y, z, kind, type: 0, f: [], on: [] });
  const l = {
    pack: "/HIRO/HIRO.PAK",
    cells: [10, 10, 17, first, 11, 10, 17, 0],
    records: [record(10, 10, 17, 3), record(10, 10, 17, 9)],
  };
  assert.equal(levelPoints(l), 50);
  l.records.reverse();
  l.cells[3] = first + 1;
  assert.equal(levelPoints(l), 50);
  const bonus = mapData.levels.find((l) => (l.shown || l.name) === "BONUS 7");
  assert.equal(levelPoints(bonus), 22900);
});

// The game scores the blocks it builds as it builds them, and whether a level
// plays by the bonus rules is a matter of its keys, not its slot.
test("a level with no key counts the blocks the game builds, and a key turns the count off", () => {
  state.data = mapData;
  const first = mapData.firstRecord;
  const { skins } = objects;
  const keyless = mapData.levels.filter((l) => playsBonus(l));
  assert.deepEqual(
    keyless.map((l) => l.name),
    mapData.levels
      .filter((l) => [15, 16, 17].includes(l.index) && !/FI\.PAK/.test(l.pack))
      .map((l) => l.name),
  );
  for (const l of keyless) {
    let seen = 0;
    for (let i = 3; i < l.cells.length; i += 4) {
      const v = l.cells[i];
      if ((v < first ? v : l.records[v - first].kind) !== 3) seen++;
    }
    assert.equal(tallied(l), seen, l.name);
  }
  const cell = (x, y, z, v = 0) => [x, y, z, v];
  const at = (cells, records = []) => ({ pack: "/HIRO/HIRO.PAK", cells: cells.flat(), records });
  const floor = [];
  for (let x = 10; x < 13; x++)
    for (let y = 10; y < 13; y++) for (let z = 16; z < 19; z++) floor.push(cell(x, y, z));
  assert.equal(tallied(at(floor)), 26, "the middle block of a solid cube has no face");
  assert.equal(tallied(at([cell(0, 10, 17), cell(10, 33, 17), cell(10, 10, 17)])), 1);
  const platform = {
    x: 10,
    y: 10,
    z: 17,
    kind: 5,
    type: 2,
    f: [2, 1, 10, 10, 17, 10, 14, 17],
    length: 2,
    on: [],
  };
  assert.equal(tallied(at([cell(10, 10, 17, first), cell(12, 12, 17)], [platform])), 1);
  const key = {
    x: 10,
    y: 10,
    z: 17,
    kind: 0,
    on: [{ face: 0, type: skins.keys.type, f: [], v: 0 }],
  };
  const keyedLevel = at([cell(10, 10, 17, first), cell(11, 10, 17)], [key]);
  assert.equal(playsBonus(keyedLevel), false);
  assert.equal(levelPoints(keyedLevel), 1000);
  assert.equal(playsBonus({ ...at([cell(10, 10, 17)]), pack: skins.copycat }), false);
});

// The loader stands a plain block at a beam's empty end and reads a laser's own
// cell as one, so the chip, the checks and the score tool count a laser's
// level the same way.
test("a keyless level with a laser counts its blocks the same way everywhere", () => {
  state.data = mapData;
  const ring = [
    [12, 10, 17],
    [11, 9, 17],
    [11, 11, 17],
    [11, 10, 16],
    [11, 10, 18],
  ];
  const p = {
    format: FORMAT,
    version: 1,
    title: "t",
    author: "",
    notes: "",
    world: "HIRO",
    time: 99,
    hidden: false,
    invisibleFromAfar: false,
    circuits: {},
    blocks: [
      { cell: [10, 10, 17], kind: 8, far: [10, 14, 17], colour: 0 },
      { cell: [11, 10, 17], kind: 0 },
      ...ring.map((cell) => ({ cell, kind: 0 })),
    ],
  };
  const l = toLevel(p, 1);
  assert.ok(playsBonus(l));
  assert.equal(tallied(l), 6);
  assert.equal(counts(p, objects.skins.hides).blocks, 6);
  assert.equal(levelPoints(l), 300);
});

test("editor.md's face count for HIDDEN 10 is the one the checks make", () => {
  const m = /HIDDEN 10 comes to (\d+) by that count/.exec(editor);
  assert.ok(m, "editor.md has no sentence giving HIDDEN 10's faces");
  assert.equal(Number(m[1]), counts(fromLevel(level("HIDDEN 10")), objects.skins.hides).faces);
});

test("a level of your own marked a Simon room scores by no bonus rule", () => {
  state.data = mapData;
  const p = blank("HIRO");
  const bonus = toLevel(p, 1);
  assert.ok(playsBonus(bonus));
  assert.equal(levelPoints(bonus), 50 * tallied(bonus));
  const room = toLevel({ ...p, simon: true }, 1);
  assert.ok(!playsBonus(room));
  assert.equal(levelPoints(room), 0);
});

test("a count of one takes the singular", () => {
  assert.equal(counted(1, "object"), "1 object");
  assert.equal(counted(0, "object"), "0 objects");
  assert.equal(counted(30, "object"), "30 objects");
});

test("a platform's blocks stop at the lattice's edge, however long its record says it is", () => {
  const r = {
    x: 10,
    y: 20,
    z: 17,
    kind: 5,
    type: 2,
    f: [2, 1, 10, 20, 17, 10, 24, 17],
    length: 32767,
    on: [],
  };
  assert.equal(platformCells(r).length, SIDE - 20);
  assert.deepEqual(platformCells(r).at(-1), [10, SIDE - 1, 17]);
  assert.deepEqual(platformCells({ ...r, length: 2 }), [
    [10, 20, 17],
    [10, 21, 17],
  ]);
  assert.equal(platformCells({ ...r, length: 0 }).length, 1);
  assert.equal(platformCells({ ...r, length: -5 }).length, 1);
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
