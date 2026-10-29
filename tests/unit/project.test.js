import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { levelKey, mapData, objects, releases } from "./fixtures.js";
import { NAMES, index, platformCells } from "../../public/js/viewer/data.js";
import { SIDE, KIND } from "../../public/js/format/lattice.js";
import { FORMAT, writeKwl } from "../../public/js/format/kwl.js";
import {
  DRAFT_PACK,
  UNTITLED,
  blank,
  blockAt,
  faceAt,
  fromLevel,
  moveBlocks,
  readProject,
  removeBlock,
  same,
  setBlock,
  setCircuit,
  setFace,
  setMeta,
  toLevel,
  writeProject,
} from "../../public/js/format/project.js";
import { playsAs, recordOverflow, validate } from "../../public/js/format/checks.js";
import {
  COIN,
  GEM,
  HIDES,
  KEY,
  START,
  SWITCH,
  TELEPORTER,
  WANDERING,
  WORLD,
  coin,
  doc,
  errors,
  level,
  plain,
  project,
  start,
  texts,
} from "./project-doc.js";

// The documents written to break a reader, with what the Python reader and writer gave for each.
const hostile = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../fixtures/hostile-projects.json", import.meta.url)),
    "utf8",
  ),
);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// --- the model ---------------------------------------------------------------------

test("a blank level has a start to build from and nothing the game would mishandle", () => {
  const p = blank("HAZE");
  assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), []);
  assert.deepEqual(
    [p.title, p.world, p.time, p.simon, p.blocks.length],
    [UNTITLED, "HAZE", 99, false, 1],
  );
  assert.deepEqual(faceAt(p, [17, 17, 17], 0), start());
  assert.equal(playsAs(p), "Plays as a bonus level since it has no key.");
});

test("every edit returns a new project and leaves the one it was given as it was", () => {
  const p = fromLevel(level("LEVEL 1"));
  const before = structuredClone(p);
  const cell = [17, 12, 17];
  const edits = [
    (q) => setBlock(q, [5, 5, 5], { kind: 2 }),
    (q) => setBlock(q, cell, { kind: 1, faces: { 1: coin } }),
    (q) => removeBlock(q, cell),
    (q) => setFace(q, cell, 3, { type: KEY }),
    (q) => setFace(q, cell, 0, null),
    (q) => setCircuit(q, 2, "off"),
    (q) => setCircuit(q, 2, "on"),
    (q) => setMeta(q, { title: "Spiral", time: 45, hidden: true, into: "/HIRO/HIRO.PAK#3" }),
  ];
  for (const edit of edits) {
    const after = edit(p);
    assert.notEqual(after, p);
    assert.deepEqual(p, before);
  }
});

test("two documents are the same where they hold the same, whatever order their keys were written in", () => {
  const p = fromLevel(level("LEVEL 1"));
  const cell = [17, 12, 17];
  assert.ok(same(p, structuredClone(p)));
  assert.ok(same(setMeta(p, { time: p.time }), p));
  assert.ok(!same(setMeta(p, { time: p.time + 1 }), p));
  assert.ok(
    same(
      setFace(p, cell, 1, { type: TELEPORTER, facing: 2, variant: 1 }),
      setFace(p, cell, 1, { type: TELEPORTER, variant: 1, facing: 2 }),
    ),
  );
  assert.ok(!same({ type: COIN }, { type: COIN, variant: 0 }));
  assert.ok(!same([1, 2], [2, 1]));
  assert.ok(!same([], {}));
  assert.ok(!same(null, {}));
  assert.ok(same(null, null));
});

test("the edits place, replace, remove and read blocks and faces, in lattice order", () => {
  let p = blank(WORLD);
  p = setBlock(p, [5, 5, 5], { kind: 2 });
  p = setBlock(p, [30, 1, 1], { kind: 7, phase: 1 });
  assert.deepEqual(
    p.blocks.map((b) => b.cell),
    [
      [5, 5, 5],
      [17, 17, 17],
      [30, 1, 1],
    ],
  );
  assert.deepEqual(blockAt(p, [5, 5, 5]), { cell: [5, 5, 5], kind: 2 });
  assert.equal(blockAt(p, [6, 6, 6]), null);
  p = setBlock(p, [5, 5, 5], { kind: 0, faces: { 2: coin } });
  assert.deepEqual(blockAt(p, [5, 5, 5]), { cell: [5, 5, 5], kind: 0, faces: { 2: coin } });
  p = setFace(p, [5, 5, 5], 5, { type: KEY });
  assert.deepEqual(faceAt(p, [5, 5, 5], 5), { type: KEY });
  assert.deepEqual(faceAt(p, [5, 5, 5], 2), coin);
  assert.equal(faceAt(p, [5, 5, 5], 0), null);
  p = setFace(p, [5, 5, 5], 2, null);
  p = setFace(p, [5, 5, 5], 5, null);
  assert.deepEqual(blockAt(p, [5, 5, 5]), { cell: [5, 5, 5], kind: 0 });
  assert.throws(() => setFace(p, [6, 6, 6], 0, coin), /no block at 6,6,6/);
  p = removeBlock(p, [5, 5, 5]);
  assert.equal(p.blocks.length, 2);
  p = setCircuit(p, 3, "off");
  assert.deepEqual(p.circuits, { 3: "off" });
  p = setCircuit(p, 3, "on");
  assert.deepEqual(p.circuits, {});
  p = setMeta(p, { title: "Spiral", into: "/HIRO/HIRO.PAK#0", author: "me", stray: 1 });
  assert.deepEqual(
    [p.title, p.into, p.author, "stray" in p],
    ["Spiral", "/HIRO/HIRO.PAK#0", "me", false],
  );
  p = setMeta(p, { into: null });
  assert.ok(!("into" in p));
});

test("a move lays the blocks named at their cells plus the delta, a span's far end and the faces along", () => {
  let p = blank(WORLD);
  p = setBlock(p, [19, 17, 17], { kind: 2, faces: { 0: coin } });
  p = setBlock(p, [20, 17, 17], { kind: 0 });
  p = setBlock(p, [19, 20, 17], { kind: KIND.PLATFORM, far: [21, 20, 17], length: 2, speed: 30 });
  p = setBlock(p, [25, 17, 17], { kind: 0 });
  const before = structuredClone(p);
  const cells = (q) => q.blocks.map((b) => b.cell);
  const q = moveBlocks(
    p,
    [
      [19, 17, 17],
      [20, 17, 17],
      [19, 20, 17],
    ],
    [1, 0, -1],
  );
  assert.notEqual(q, p);
  assert.deepEqual(p, before);
  assert.deepEqual(cells(q), [
    [17, 17, 17],
    [20, 17, 16],
    [20, 20, 16],
    [21, 17, 16],
    [25, 17, 17],
  ]);
  assert.deepEqual(blockAt(q, [20, 17, 16]), { cell: [20, 17, 16], kind: 2, faces: { 0: coin } });
  assert.deepEqual(blockAt(q, [20, 20, 16]), {
    cell: [20, 20, 16],
    kind: KIND.PLATFORM,
    far: [22, 20, 16],
    length: 2,
    speed: 30,
  });
  // a cell a moving block leaves is free for another; one that stays holds its cell
  assert.deepEqual(
    cells(
      moveBlocks(
        p,
        [
          [19, 17, 17],
          [20, 17, 17],
        ],
        [1, 0, 0],
      ),
    ),
    [
      [17, 17, 17],
      [19, 20, 17],
      [20, 17, 17],
      [21, 17, 17],
      [25, 17, 17],
    ],
  );
  assert.equal(moveBlocks(p, [[19, 17, 17]], [1, 0, 0]), null);
  // nothing lands past the edge, a span's far end included; where its run would, the checks say so
  assert.notEqual(moveBlocks(p, [[25, 17, 17]], [7, 0, 0]), null);
  assert.equal(moveBlocks(p, [[25, 17, 17]], [8, 0, 0]), null);
  assert.equal(moveBlocks(p, [[25, 17, 17]], [0, 0, -17]), null);
  assert.equal(moveBlocks(p, [[19, 20, 17]], [12, 0, 0]), null);
  const run = moveBlocks(p, [[19, 20, 17]], [11, 0, 0]);
  assert.deepEqual(blockAt(run, [30, 20, 17]).far, [32, 20, 17]);
  assert.ok(
    texts(validate(run, HIDES, NAMES), "error").includes(
      "the platform's run reaches past the edge",
    ),
  );
  // a cell with no block names nothing to move
  assert.deepEqual(moveBlocks(p, [[6, 6, 6]], [1, 1, 1]), p);
});

// --- the project file ---------------------------------------------------------------------

test("the reader refuses another format's file and nothing else", () => {
  assert.throws(
    () => readProject('{"format": "orbit", "blocks": []}'),
    /not a kula-world-level file/,
  );
  assert.throws(() => readProject({ version: 1, blocks: [] }), /not a kula-world-level file/);
  assert.throws(() => readProject("[]"), /not a kula-world-level file/);
  assert.throws(() => readProject("not even json"), SyntaxError);
  const { project: p, report } = readProject({ format: FORMAT });
  assert.deepEqual(report, ["no blocks"]);
  assert.deepEqual(p, {
    format: FORMAT,
    version: 1,
    title: "",
    author: "",
    notes: "",
    world: "",
    time: 99,
    hidden: false,
    invisibleFromAfar: false,
    simon: false,
    circuits: {},
    blocks: [],
  });
});

test("the Simon flag is read as hidden is, true or false, anything else said and taken as false, and written always", () => {
  const read = (more) => readProject({ format: FORMAT, world: WORLD, blocks: [], ...more });
  assert.equal(read({}).project.simon, false);
  assert.equal(read({ simon: true }).project.simon, true);
  assert.equal(read({ simon: false }).project.simon, false);
  for (const simon of [1, "yes", null, [true]]) {
    const { project: p, report, repairs } = read({ simon });
    assert.equal(p.simon, false, JSON.stringify(simon));
    assert.deepEqual(report, ["simon is neither true nor false; it is taken as false"]);
    assert.equal(repairs, 1);
  }
  const room = fromLevel(mapData.levels.find((l) => l.pack === objects.skins.copycat));
  assert.equal(room.simon, true);
  const text = writeProject(room);
  assert.ok(text.includes('\n  "invisibleFromAfar": false,\n  "simon": true,\n  "circuits"'));
  assert.deepEqual(readProject(text), { project: room, report: [], repairs: 0 });
  assert.ok(writeProject(setMeta(room, { simon: false })).includes('\n  "simon": false,\n'));
  assert.ok(writeProject(project([])).includes('\n  "simon": false,\n'));
});

test("the reader takes what it knows of a newer file, fills the defaults and drops what cannot be a block", () => {
  const {
    project: p,
    report,
    repairs,
  } = readProject({
    format: FORMAT,
    version: 7,
    world: "HAZE",
    weather: "rain",
    time: "soon",
    hidden: "yes",
    circuits: { 1: "off", 2: "on", 7: "off", 3: "maybe" },
    blocks: [
      {
        cell: [5, 5, 5],
        kind: 0,
        faces: { 0: { type: START, facing: 3, colour: 9 }, top: coin, 2: { kind: 1 } },
        mood: 2,
      },
      { cell: [5, 5], kind: 0 },
      { cell: [6, 5, 5] },
      "a block",
      { cell: [7, 5, 5], kind: KIND.PLATFORM, far: [7, 9, 5] },
      { cell: [9, 5, 5], kind: KIND.LASER, far: [9, 9, 5] },
      { cell: [11, 5, 5], kind: 7 },
      { cell: [5, 5, 5], kind: 2 },
      { cell: [40, 5, 5], kind: 0 },
    ],
  });
  assert.equal(p.version, 1);
  assert.ok(!("weather" in p));
  assert.deepEqual(
    [p.title, p.author, p.notes, p.world, p.time, p.hidden, p.invisibleFromAfar],
    ["", "", "", "HAZE", 99, false, false],
  );
  assert.deepEqual(p.circuits, { 1: "off" });
  assert.deepEqual(p.blocks, [
    { cell: [5, 5, 5], kind: 0, faces: { 0: { type: START, facing: 3 } } },
    { cell: [7, 5, 5], kind: KIND.PLATFORM, far: [7, 9, 5], length: 2, speed: 30 },
    { cell: [9, 5, 5], kind: KIND.LASER, far: [9, 9, 5], colour: 0 },
    { cell: [11, 5, 5], kind: 7, phase: 0 },
  ]);
  assert.ok(report.some((line) => line.startsWith("written as version 7")));
  assert.equal(report.length, 12);
  assert.equal(repairs, 11);
  assert.equal(report.filter((line) => line.includes("it is left out")).length, 8);
  assert.ok(report.some((line) => line.includes("block 1 ")));
  assert.ok(report.some((line) => line.includes("block 2 ")));
  assert.ok(report.some((line) => line.includes("block 3 ")));
  assert.ok(report.includes("block 7 at 5,5,5 stands on the cell of block 0; it is left out"));
  assert.ok(report.includes("block 8 at 40,5,5 stands outside the lattice; it is left out"));
  assert.ok(report.some((line) => line.includes('a face "top"')));
  assert.ok(report.some((line) => line.includes("face 2 holds nothing")));
  assert.ok(report.some((line) => line.includes("colour 7")));
  assert.ok(report.some((line) => line.includes("colour 3 is neither on nor off")));
  assert.ok(report.some((line) => line.includes("hidden")));
  assert.ok(report.some((line) => line.includes("time")));
  assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), []);
  assert.doesNotThrow(() => writeKwl(p));
});

test("the reader leaves out what the writer has no bytes for, and holds a word to the file's range", () => {
  const { project: p, report } = readProject({
    format: FORMAT,
    world: WORLD,
    time: -70000,
    blocks: [
      { cell: [5, 5, 5], kind: 12 },
      {
        cell: [5, 5, 5],
        kind: 0,
        faces: {
          0: { type: START, facing: 70000 },
          1: { type: 70000 },
          2: { type: KEY, variant: -70000 },
        },
      },
      { cell: [5, 5, 5], kind: 2 },
      { cell: [6, 5, 5], kind: KIND.SETTINGS },
      { cell: [7, 5, 5], kind: -1 },
      { cell: [8, 5, 5], kind: KIND.LASER, far: [10, 7, 5], colour: 0 },
      { cell: [9, 5, 5], kind: KIND.PLATFORM, far: [9, 9, 5], length: 2, speed: -70000 },
      { cell: [11, 5, 5], kind: 7, phase: 70000 },
      { cell: [0, 34, 5], kind: 0 },
      { cell: [12, 5, 5], kind: 0, faces: { 0: coin } },
      { cell: [12, 5, 5], kind: 0, faces: { 0: { type: KEY } } },
    ],
  });
  assert.deepEqual(p.blocks, [
    {
      cell: [5, 5, 5],
      kind: 0,
      faces: {
        0: { type: START, facing: 32767 },
        1: { type: 32767 },
        2: { type: KEY, variant: -32768 },
      },
    },
    { cell: [9, 5, 5], kind: KIND.PLATFORM, far: [9, 9, 5], length: 2, speed: -32768 },
    { cell: [11, 5, 5], kind: 7, phase: 32767 },
    { cell: [12, 5, 5], kind: 0, faces: { 0: coin } },
  ]);
  assert.equal(p.time, -32768);
  assert.deepEqual(report, [
    "a time of -70000 is outside the file's range; it is -32768",
    "block 0 at 5,5,5 has a kind of 12, which is not a kind of block; it is left out",
    "block 1 at 5,5,5 face 0 has a facing of 70000, outside the file's range; it is 32767",
    "block 1 at 5,5,5 face 1 has a type of 70000, outside the file's range; it is 32767",
    "block 1 at 5,5,5 face 2 has a variant of -70000, outside the file's range; it is -32768",
    "block 2 at 5,5,5 stands on the cell of block 1; it is left out",
    "block 3 at 6,5,5 has a kind of 9, which is not a kind of block; it is left out",
    "block 4 at 7,5,5 has a kind of -1, which is not a kind of block; it is left out",
    "block 5 at 8,5,5 spans to 10,7,5 along no one axis; it is left out",
    "block 6 at 9,5,5 has a speed of -70000, outside the file's range; it is -32768",
    "block 7 at 11,5,5 has a phase of 70000, outside the file's range; it is 32767",
    "block 8 at 0,34,5 stands outside the lattice; it is left out",
    "block 10 at 12,5,5 stands on the cell of block 9; it is left out",
  ]);
  // what is kept writes, and the checks name what the game would make of it
  assert.doesNotThrow(() => writeKwl(p));
  const found = texts(validate(p, HIDES, NAMES), "error");
  for (const text of [
    "a facing of 1 to 4 is needed",
    "type 32767 is nothing the game plays",
    "a phase of 32767",
    "a time of -32768 seconds",
  ])
    assert.ok(found.includes(text), text);
  assert.ok(texts(validate(p, HIDES, NAMES), "warning").includes("a platform running at -32768"));
  // the one project the reader hands on that the writer refuses: records enough to outrun a link word
  const crowd = Array.from({ length: 2049 }, (_, i) =>
    plain([1 + (i % 32), 1 + (Math.floor(i / 32) % 32), 1 + Math.floor(i / 1024)], 0, { 0: coin }),
  );
  crowd.find((b) => b.cell.join() === "32,32,2").faces[1] = { type: SWITCH, variant: 0 };
  const { project: q, report: lines } = readProject(project(crowd));
  assert.deepEqual(lines, []);
  assert.ok(errors(crowd).includes("2049 records, over the 123 the game has room for"));
  assert.equal(recordOverflow(q), "2049 records, over the 123 the game has room for");
  assert.equal(recordOverflow(p), null);
  // the settings record takes no link word, so a flagged crowd of 2048 writes
  const flagged = readProject(project(crowd.slice(0, 2048), { hidden: true })).project;
  assert.ok(
    errors(crowd.slice(0, 2048), { hidden: true }).includes(
      "2049 records, over the 123 the game has room for",
    ),
  );
  assert.equal(recordOverflow(flagged), null);
  assert.doesNotThrow(() => writeKwl(flagged));
  assert.equal(
    recordOverflow(readProject(project(crowd, { hidden: true })).project),
    "2050 records, over the 123 the game has room for",
  );
  assert.throws(
    () => writeKwl(q),
    (e) => e.message === "a word of the block at 32,32,2 is outside the file's range",
  );
  // the gate goes by the count alone, so a crowd with no device, which the writer writes, is refused too
  const { project: r } = readProject(project(crowd.map((b) => ({ ...b, faces: { 0: coin } }))));
  assert.equal(recordOverflow(r), "2049 records, over the 123 the game has room for");
  assert.ok(errors(r.blocks).includes("2049 records, over the 123 the game has room for"));
  assert.doesNotThrow(() => writeKwl(r));
});

test("the reader reports every default it takes, and repairs what the writer would refuse", () => {
  const { project: p, report } = readProject({
    format: FORMAT,
    version: "2",
    world: WORLD,
    into: 5,
    blocks: [
      {
        cell: [5, 5, 5],
        kind: 0,
        faces: {
          0: start(),
          1: { type: 0 },
          2: { type: COIN, variant: 9 },
          3: { type: TELEPORTER, facing: "north", variant: "red" },
          4: { type: KEY, variant: 2.5 },
          5: { type: GEM, variant: 1 },
          9: coin,
        },
      },
      { cell: [6, 5, 5], kind: 0, faces: "none" },
      { cell: [7, 5, 5], kind: KIND.PLATFORM, far: [7, 9, 5], length: "3", speed: 2.5 },
      { cell: [9, 5, 5], kind: KIND.LASER, far: [9, 9, 5], colour: 7 },
      { cell: [10, 5, 5], kind: KIND.LASER, far: [10, 9, 5], colour: "red" },
      { cell: [11, 5, 5], kind: 7, phase: "x" },
      { cell: [12, 5, 5], kind: KIND.LASER, far: [12, 5, 5], colour: 0 },
      { cell: [13, 5, 5], kind: KIND.LASER, far: [13, 5, 40], colour: 0 },
      { cell: [14, 5, 5], kind: KIND.LASER, colour: 0 },
      { cell: [15, 5, 5], kind: KIND.PLATFORM, far: [15, 5] },
      { cell: [16, 5, 5], kind: 0, faces: { 0: { type: COIN }, 1: { type: SWITCH } } },
    ],
  });
  assert.ok(!("into" in p));
  assert.deepEqual(p.blocks, [
    {
      cell: [5, 5, 5],
      kind: 0,
      faces: {
        0: start(),
        2: { type: COIN, variant: 0 },
        3: { type: TELEPORTER, facing: 1, variant: 0 },
        4: { type: KEY },
        5: { type: GEM, variant: 1 },
      },
    },
    { cell: [6, 5, 5], kind: 0 },
    { cell: [7, 5, 5], kind: KIND.PLATFORM, far: [7, 9, 5], length: 2, speed: 30 },
    { cell: [9, 5, 5], kind: KIND.LASER, far: [9, 9, 5], colour: 0 },
    { cell: [10, 5, 5], kind: KIND.LASER, far: [10, 9, 5], colour: 0 },
    { cell: [11, 5, 5], kind: 7, phase: 0 },
    {
      cell: [16, 5, 5],
      kind: 0,
      faces: { 0: { type: COIN, variant: 0 }, 1: { type: SWITCH, variant: 0 } },
    },
  ]);
  assert.deepEqual(report, [
    'a version of "2" is not a whole number; the file is read as version 1',
    "into is not text; it is left out",
    "block 0 at 5,5,5 face 1 has a type of 0, which is nothing standing there; it is left out",
    "block 0 at 5,5,5 face 2 has a variant of 9, which is not one of the three; it is 0",
    'block 0 at 5,5,5 face 3 has a facing of "north", which is not a whole number; it is left out',
    "block 0 at 5,5,5 face 3 has no facing, which the game heads as 1; it is 1",
    'block 0 at 5,5,5 face 3 has a variant of "red", which is not one of the four; it is 0',
    "block 0 at 5,5,5 face 4 has a variant of 2.5, which is not a whole number; it is left out",
    'block 0 at 5,5,5 names a face "9", which is not one of the six; it is left out',
    "block 1 at 6,5,5 has faces that are not a table of the six; they are left out",
    'block 2 at 7,5,5 has a length of "3", which is not a whole number; it is 2',
    "block 2 at 7,5,5 has a speed of 2.5, which is not a whole number; it is 30",
    "block 3 at 9,5,5 has a colour of 7, which is not one of the four; it is 0",
    'block 4 at 10,5,5 has a colour of "red", which is not one of the four; it is 0',
    'block 5 at 11,5,5 has a phase of "x", which is not a whole number; it is 0',
    "block 6 at 12,5,5 has its far end on its own cell; it is left out",
    "block 7 at 13,5,5 has its far end at 13,5,40, outside the lattice; it is left out",
    "block 8 at 14,5,5 is a span with no far end; it is left out",
    "block 9 at 15,5,5 has a far end that is not a cell of three whole numbers; it is left out",
  ]);
  assert.doesNotThrow(() => toLevel(p, 1));
  assert.deepEqual(readProject(writeProject(p)).report, []);
});

test("a platform's length that runs past the edge is cut on the way in, to a run the checks hold inside it", () => {
  const { project: p, report } = readProject(
    project([
      plain([5, 5, 5], 0, { 0: start() }),
      { cell: [10, 28, 17], kind: KIND.PLATFORM, far: [10, 30, 17], length: 32767, speed: 30 },
      { cell: [12, 10, 17], kind: KIND.PLATFORM, far: [12, 14, 17], length: 0, speed: 30 },
      { cell: [14, 10, 17], kind: KIND.PLATFORM, far: [14, 14, 17], length: 19, speed: 30 },
      { cell: [16, 31, 17], kind: KIND.PLATFORM, far: [16, 33, 17], length: 2, speed: 30 },
      { cell: [18, 33, 17], kind: KIND.PLATFORM, far: [18, 20, 17], length: 2, speed: 30 },
    ]),
  );
  assert.deepEqual(
    p.blocks.filter((b) => b.kind === KIND.PLATFORM).map((b) => b.length),
    [3, 1, 19, 1, 1],
  );
  assert.deepEqual(report, [
    "block 1 at 10,28,17 has a length of 32767, which runs past the edge; it is 3",
    "block 2 at 12,10,17 has a length of 0, which is less than one block; it is 1",
    "block 4 at 16,31,17 has a length of 2, which runs past the edge; it is 1",
    "block 5 at 18,33,17 has a length of 2, which runs past the edge; it is 1",
  ]);
  // the run's edge error stays only where the cell itself is past the edge
  assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), [
    "the game builds nothing past the edge",
    "a platform 19 blocks long, more than the 7 the game's grid holds",
    "the far end is past the edge",
    "the platform's run reaches past the edge",
  ]);
  const c = hostile.cases.find((c) => c.name === "two hundred platforms of length 32767");
  const { project: q, report: lines, repairs } = readProject(structuredClone(c.input));
  const platforms = q.blocks.filter((b) => b.kind === KIND.PLATFORM);
  assert.equal(platforms.length, 200);
  assert.deepEqual(
    platforms.map((b) => b.length),
    platforms.map((b) => SIDE - 1 - Math.max(b.cell[1], b.far[1])),
  );
  assert.equal(lines.length, 4);
  assert.equal(repairs, 200);
  assert.ok(
    !texts(validate(q, HIDES, NAMES), "error").includes("the platform's run reaches past the edge"),
  );
  const walked = toLevel(q, 1)
    .records.filter((r) => r.kind === KIND.PLATFORM)
    .reduce((n, r) => n + platformCells(r).length, 0);
  assert.equal(
    walked,
    platforms.reduce((n, b) => n + b.length, 0),
  );
});

test("a title, an author, notes, a world, a target or a source past their most are cut to it, counted in characters", () => {
  const title = `${"a".repeat(78)}\u{1F600}\u{1F600}\u{1F600}`;
  const { project: p, report } = readProject(
    project([plain([5, 5, 5], 0, { 0: start() })], {
      title,
      author: "b".repeat(2000),
      notes: "c".repeat(2001),
      world: `HIRO${"w".repeat(1997)}`,
      into: `/HIRO/HIRO.PAK#1${"x".repeat(2000)}`,
      from: `/HIRO/HIRO.PAK#3${"y".repeat(1984)}`,
    }),
  );
  assert.equal(p.title, `${"a".repeat(78)}\u{1F600}\u{1F600}`);
  assert.equal([...p.title].length, 80);
  assert.equal(p.author.length, 2000);
  assert.equal(p.notes.length, 2000);
  assert.equal(p.world, `HIRO${"w".repeat(1996)}`);
  assert.equal(p.into, `/HIRO/HIRO.PAK#1${"x".repeat(1984)}`);
  assert.equal(p.from, `/HIRO/HIRO.PAK#3${"y".repeat(1984)}`);
  assert.deepEqual(report, [
    "title is 81 characters long, more than the 80 kept; it is cut to 80",
    "notes is 2001 characters long, more than the 2000 kept; it is cut to 2000",
    "world is 2001 characters long, more than the 2000 kept; it is cut to 2000",
    "into is 2016 characters long, more than the 2000 kept; it is cut to 2000",
  ]);
  assert.deepEqual(readProject(writeProject(p)).report, []);
});

test("the disc a template came from is read and written after its source, cut as a text is, and absent by default", () => {
  const blocks = [plain([5, 5, 5], 0, { 0: start() })];
  const { project: p, report } = readProject(
    project(blocks, { from: "/HELL/HELL.PAK#17", fromRelease: "eu" }),
  );
  assert.deepEqual(report, []);
  assert.equal(p.fromRelease, "eu");
  const text = writeProject(p);
  assert.match(text, /\n {2}"from": "\/HELL\/HELL\.PAK#17",\n {2}"fromRelease": "eu",\n {2}"time"/);
  assert.deepEqual(readProject(text), { project: p, report: [], repairs: 0 });
  const plainRead = readProject(project(blocks));
  assert.ok(!("fromRelease" in plainRead.project));
  assert.ok(!writeProject(plainRead.project).includes("fromRelease"));
  const number = readProject(project(blocks, { fromRelease: 2 }));
  assert.ok(!("fromRelease" in number.project));
  assert.deepEqual(number.report, ["fromRelease is not text; it is left out"]);
  const long = readProject(project(blocks, { fromRelease: "e".repeat(2001) }));
  assert.equal(long.project.fromRelease, "e".repeat(2000));
  assert.deepEqual(long.report, [
    "fromRelease is 2001 characters long, more than the 2000 kept; it is cut to 2000",
  ]);
});

test("a template of another disc's level records its disc after its source, and a US template records none", () => {
  const [, ...others] = releases;
  for (const r of others)
    for (const [key, v] of Object.entries(r.levels)) {
      const p = fromLevel(v);
      const keys = Object.keys(p);
      const at = keys.indexOf("from");
      assert.deepEqual(keys.slice(at, at + 3), ["from", "fromRelease", "time"], key);
      assert.deepEqual([p.from, p.fromRelease], [key, r.id], key);
      assert.deepEqual(readProject(writeProject(p)).project, p, key);
      assert.ok(!("release" in toLevel(p, 1)), key);
    }
  for (const l of mapData.levels) assert.ok(!("fromRelease" in fromLevel(l)), l.name);
});

test("a whole number past 2^53 is no whole number, and is reported as the page parsed it", () => {
  const { project: p, report } = readProject(
    `{"format": "${FORMAT}", "world": "${WORLD}", "time": 9007199254740993, "blocks": [
      {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": 30, "facing": 3}}},
      {"cell": [7, 5, 5], "kind": 5, "far": [7, 9, 5], "length": 1e400, "speed": 1e16},
      {"cell": [9, 5, 5], "kind": 7, "phase": 1152921504606846976}
    ]}`,
  );
  assert.equal(p.time, 99);
  assert.deepEqual(p.blocks.slice(1), [
    { cell: [7, 5, 5], kind: KIND.PLATFORM, far: [7, 9, 5], length: 2, speed: 30 },
    { cell: [9, 5, 5], kind: 7, phase: 0 },
  ]);
  assert.deepEqual(report, [
    "a time of 9007199254740992 is not a whole number; it is 99",
    "block 1 at 7,5,5 has a length of null, which is not a whole number; it is 2",
    "block 1 at 7,5,5 has a speed of 10000000000000000, which is not a whole number; it is 30",
    "block 2 at 9,5,5 has a phase of 1152921504606847000, which is not a whole number; it is 0",
  ]);
});

test("the reader keeps three lines of a shape and counts the rest, where they fall", () => {
  const {
    project: p,
    report,
    repairs,
  } = readProject({
    format: FORMAT,
    world: WORLD,
    time: "x",
    blocks: [
      ...Array.from({ length: 5 }, (_, i) => ({ cell: [5 + i, 5, 5], kind: 7, phase: "x" })),
      {
        cell: [5, 9, 5],
        kind: 0,
        faces: { 0: start(), 6: coin, 7: coin, 8: coin, 9: coin },
      },
    ],
  });
  assert.equal(p.blocks.length, 6);
  assert.deepEqual(report, [
    'a time of "x" is not a whole number; it is 99',
    'block 0 at 5,5,5 has a phase of "x", which is not a whole number; it is 0',
    'block 1 at 6,5,5 has a phase of "x", which is not a whole number; it is 0',
    'block 2 at 7,5,5 has a phase of "x", which is not a whole number; it is 0',
    "2 more lines like the one above",
    'block 5 at 5,9,5 names a face "6", which is not one of the six; it is left out',
    'block 5 at 5,9,5 names a face "7", which is not one of the six; it is left out',
    'block 5 at 5,9,5 names a face "8", which is not one of the six; it is left out',
    "1 more line like the one above",
  ]);
  assert.equal(repairs, 10);
});

test("every hostile document reads to the project and the report the Python reader gave, and writes its bytes", () => {
  assert.ok(hostile.cases.length >= 30);
  for (const c of hostile.cases) {
    // the fixture holds the parsed document; a document that is itself text reaches the reader as its JSON
    const source = typeof c.input === "string" ? JSON.stringify(c.input) : structuredClone(c.input);
    if ("refusal" in c) {
      assert.throws(
        () => readProject(source),
        (e) => e.message === c.refusal,
        c.name,
      );
      continue;
    }
    const { project, report } = readProject(source);
    assert.deepEqual(project, c.project, c.name);
    assert.deepEqual(report, c.report, c.name);
    if ("kwl" in c.level) assert.equal(sha256(writeKwl(project)), c.level.kwl, c.name);
    else
      assert.throws(
        () => writeKwl(project),
        (e) => e.message === c.level.refusal,
        c.name,
      );
  }
});

test("a face key is read by its number, and a second spelling of one face is left out", () => {
  const { project: p, report } = readProject({
    format: FORMAT,
    world: WORLD,
    blocks: [{ cell: [5, 5, 5], kind: 0, faces: { "05": coin, 5: { type: KEY }, "00": start() } }],
  });
  assert.deepEqual(p.blocks[0].faces, { 0: start(), 5: { type: KEY } });
  assert.deepEqual(report, ['block 0 at 5,5,5 names face 5 again as "05"; it is left out']);
  assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), []);
  assert.ok(
    errors([plain([5, 5, 5], 0, { 0: start(), 5: coin, "05": coin })]).includes(
      "face 5 is named twice",
    ),
  );
  const ones = "1".repeat(4301);
  const zeros = `${"0".repeat(4300)}5`;
  const long = readProject({
    format: FORMAT,
    world: WORLD,
    circuits: { [ones]: "off" },
    blocks: [
      { cell: [5, 5, 5], kind: 0, faces: { 0: start(), [ones]: coin, [zeros]: { type: KEY } } },
    ],
  });
  assert.deepEqual(long.project.circuits, {});
  assert.deepEqual(long.project.blocks[0].faces, { 0: start(), 5: { type: KEY } });
  assert.deepEqual(long.report, [
    `colour ${ones} is not one of the four; it is left out`,
    `block 0 at 5,5,5 names a face "${ones}", which is not one of the six; it is left out`,
  ]);
});

test("the writer writes the document's keys in its order, one block a line, the same way every time", () => {
  const p = fromLevel(level("LEVEL 42"));
  const text = writeProject(setMeta(p, { into: "/INCA/INCA.PAK#4", author: "me", notes: "n" }));
  const keys = text
    .split("\n")
    .map((line) => /^ {2}"(\w+)":/.exec(line)?.[1])
    .filter(Boolean);
  assert.deepEqual(keys, [
    "format",
    "version",
    "title",
    "author",
    "notes",
    "world",
    "into",
    "from",
    "time",
    "hidden",
    "invisibleFromAfar",
    "simon",
    "circuits",
    "blocks",
  ]);
  assert.equal(text.split("\n").filter((line) => line.startsWith("    {")).length, p.blocks.length);
  const again = readProject(text);
  assert.deepEqual(again.report, []);
  assert.equal(writeProject(again.project), text);
  assert.deepEqual(
    again.project,
    setMeta(p, { into: "/INCA/INCA.PAK#4", author: "me", notes: "n" }),
  );
  for (const l of mapData.levels) {
    const q = fromLevel(l);
    const written = writeProject(q);
    assert.equal(writeProject(readProject(written).project), written, l.name);
    assert.deepEqual(readProject(written).project, q, l.name);
  }
});

test("the writer writes a block as the document shows one", () => {
  const example = /```json\n([\s\S]*?)```/.exec(doc)[1];
  const { project: p, report } = readProject(example);
  assert.deepEqual(report, []);
  const text = writeProject(p);
  const lines = (s) =>
    s
      .trim()
      .split("\n")
      .map((line) => line.replace(/,$/, ""));
  assert.deepEqual(lines(text).sort(), lines(example).sort());
  const sorted = text.split("\n").filter((line) => line.startsWith("    {"));
  assert.deepEqual(
    sorted.map((line) => JSON.parse(line.replace(/,$/, "")).cell),
    [...p.blocks].map((b) => b.cell),
  );
  assert.ok(
    text.includes(
      '{ "cell": [10, 12, 17], "kind": 5, "far": [10, 16, 17], "length": 2, "speed": 30 }',
    ),
  );
});

test("the writer keeps only what the game reads of a face, and only the colours that start off", () => {
  const p = project(
    [
      plain([5, 5, 5], 0, {
        0: { type: START, facing: 0 },
        1: { type: COIN, facing: 2, variant: 1 },
        2: { type: TELEPORTER, facing: 1 },
        3: { type: 0 },
      }),
      { cell: [7, 5, 5], kind: 7 },
      { cell: [9, 5, 5], kind: KIND.PLATFORM, far: [9, 8, 5] },
    ],
    { circuits: { 2: "on", 1: "off", 0: "off" } },
  );
  const { project: q, report } = readProject(writeProject(p));
  assert.deepEqual(report, [
    "block 0 at 5,5,5 face 0 has no facing, which the game heads as 1; it is 1",
  ]);
  assert.deepEqual(q.blocks[0].faces, {
    0: { type: START, facing: 1 },
    1: { type: COIN, variant: 1 },
    2: { type: TELEPORTER, facing: 1, variant: 0 },
  });
  const zero = readProject({
    format: FORMAT,
    world: WORLD,
    blocks: [
      {
        cell: [5, 5, 5],
        kind: 0,
        faces: { 0: { type: START, facing: 0 }, 1: { type: WANDERING } },
      },
    ],
  });
  assert.deepEqual(zero.project.blocks[0].faces, {
    0: { type: START, facing: 1 },
    1: { type: WANDERING },
  });
  assert.deepEqual(zero.report, [
    "block 0 at 5,5,5 face 0 has a facing of 0, which the game heads as 1; it is 1",
  ]);
  assert.deepEqual(texts(validate(zero.project, HIDES, NAMES), "error"), []);
  assert.deepEqual(q.blocks[1], { cell: [7, 5, 5], kind: 7, phase: 0 });
  assert.deepEqual(q.blocks[2], {
    cell: [9, 5, 5],
    kind: KIND.PLATFORM,
    far: [9, 8, 5],
    length: 2,
    speed: 30,
  });
  assert.deepEqual(q.circuits, { 0: "off", 1: "off" });
  assert.ok(writeProject(p).includes('"circuits": { "0": "off", "1": "off" }'));
});

test("a draft is drawn as the level the game would load", () => {
  const p = setBlock(blank("MARS"), [17, 18, 17], { kind: 0, faces: { 0: { type: KEY } } });
  const l = toLevel(p, 7);
  assert.deepEqual(
    [l.name, l.theme, l.pack, l.index, l.draft],
    [UNTITLED, "MARS", DRAFT_PACK, 7, 7],
  );
  assert.deepEqual([l.placed, l.header, l.time, l.records.length], [2, 2, 99, 2]);
  assert.ok(!("shown" in l));
  const idx = index(l);
  assert.equal(idx.cells.size, 2);
  assert.deepEqual(
    [...idx.markers.values()].flat().map((m) => m.id),
    ["t30", "t31"],
  );
  assert.deepEqual(fromLevel(l).blocks, p.blocks);
  assert.equal(levelKey(l), `${DRAFT_PACK}#7`);
  assert.equal(toLevel({ ...p, title: "" }, 7).name, UNTITLED);
  assert.equal(toLevel({ ...p, title: "Spiral" }, 7).name, "Spiral");
});

test("a draft marked a Simon room carries the mark onto the level drawn, and any other carries it false", () => {
  const p = blank("HIRO");
  assert.equal(toLevel(p, 7).simon, false);
  assert.equal(toLevel({ ...p, simon: true }, 7).simon, true);
  assert.equal(toLevel(setMeta(p, { simon: true }), 7).simon, true);
  assert.equal(toLevel(setMeta({ ...p, simon: true }, { simon: false }), 7).simon, false);
  const { simon, ...rest } = p;
  assert.equal(simon, false);
  assert.equal(toLevel(rest, 7).simon, false);
});
