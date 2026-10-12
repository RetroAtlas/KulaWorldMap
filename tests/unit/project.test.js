import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations, objects, levelKey } from "./fixtures.js";
import {
  OFF_LATTICE,
  index,
  markerCircuit,
  markerDestination,
  markerFacing,
  markerLabel,
  markerNumber,
  markerState,
  platformCells,
  setAnnotations,
  setObjects,
} from "../../public/js/data.js";
import { hasFace } from "../../public/js/blocks.js";
import { FACE_NORMAL } from "../../public/js/faces.js";
import { state, cellKey, SIDE } from "../../public/js/state.js";
import {
  BONUS_UNDRAWN_KINDS,
  BONUS_UNDRAWN_TYPES,
  CAPS,
  DISC_MAX,
  FORMAT,
  PLAYED,
  LASER_KIND,
  PLATFORM_KIND,
  SETTINGS_KIND,
  inner,
  writeKwl,
} from "../../public/js/kwl.js";
import {
  COUNTERS,
  DRAFT_PACK,
  UNTITLED,
  blank,
  blockAt,
  counts,
  describe,
  faceAt,
  fromLevel,
  moveBlocks,
  playsAs,
  readProject,
  removeBlock,
  setBlock,
  setCircuit,
  setFace,
  setMeta,
  toLevel,
  validate,
  writeProject,
} from "../../public/js/project.js";

setAnnotations(annotations);
setObjects(objects);
state.data = mapData;

const HIDES = objects.skins.hides;
const START = 30;
const EXIT = 7;
const KEY = 31;
const COIN = 37;
const GEM = 36;
const TELEPORTER = 5;
const SWITCH = 9;
const WANDERING = 53;
const WORLD = "HIRO";

const project = (blocks, more = {}) => ({
  format: FORMAT,
  version: 1,
  title: "t",
  author: "",
  notes: "",
  world: WORLD,
  time: 99,
  hidden: false,
  invisibleFromAfar: false,
  circuits: {},
  blocks,
  ...more,
});
const plain = (cell, kind = 0, faces = null) => (faces ? { cell, kind, faces } : { cell, kind });
const start = (facing = 3) => ({ type: START, facing });
const coin = { type: COIN, variant: 0 };
const texts = (findings, level) => findings.filter((f) => f.level === level).map((f) => f.text);
const errors = (blocks, more) => texts(validate(project(blocks, more), HIDES), "error");
const warnings = (blocks, more) => texts(validate(project(blocks, more), HIDES), "warning");
const level = (title) => mapData.levels.find((l) => (l.shown || l.name) === title);

const doc = readFileSync(fileURLToPath(new URL("../../docs/editor.md", import.meta.url)), "utf8");
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
  assert.deepEqual(texts(validate(p, HIDES), "error"), []);
  assert.deepEqual([p.title, p.world, p.time, p.blocks.length], [UNTITLED, "HAZE", 99, 1]);
  assert.deepEqual(faceAt(p, [17, 17, 17], 0), start());
  assert.ok(playsAs(p).startsWith("Plays as a bonus level:"));
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
  p = setBlock(p, [19, 20, 17], { kind: PLATFORM_KIND, far: [21, 20, 17], length: 2, speed: 30 });
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
    kind: PLATFORM_KIND,
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
    texts(validate(run, HIDES), "error").includes("the platform's run reaches past the edge"),
  );
  // a cell with no block names nothing to move
  assert.deepEqual(moveBlocks(p, [[6, 6, 6]], [1, 1, 1]), p);
});

// --- the shipped levels --------------------------------------------------------------

test("every shipped level validates with no error and plays as the game plays it", () => {
  const bonus = mapData.levels.filter(
    (l) => [15, 16, 17].includes(l.index) && !/FI\.PAK/.test(l.pack),
  );
  const hidden = mapData.levels.filter((l) =>
    l.records.some((r) => r.kind === SETTINGS_KIND && r.type === 1),
  );
  assert.deepEqual([bonus.length, hidden.length], [30, 10]);
  for (const l of mapData.levels) {
    const p = fromLevel(l);
    assert.deepEqual(texts(validate(p, HIDES), "error"), [], l.name);
    const plays = playsAs(p);
    if (hidden.includes(l))
      assert.equal(
        plays,
        "Plays as a hidden level, with the glass ball on half-seen blocks.",
        l.name,
      );
    else if (bonus.includes(l))
      assert.ok(plays.startsWith("Plays as a bonus level: it has no key"), l.name);
    else if (l.pack !== objects.skins.copycat)
      assert.equal(plays, "Plays as an arcade level.", l.name);
  }
});

test("the face count is the renderer's rule, replayed over every shipped level", () => {
  for (const l of mapData.levels) {
    const p = fromLevel(l);
    const drawn = toLevel(p, 1);
    const idx = index(drawn);
    let faces = 0;
    for (const c of idx.cells.values()) {
      if (!inner(c.x) || !inner(c.y) || !inner(c.z)) continue;
      const r = c.v === OFF_LATTICE ? null : idx.records.get(cellKey(c.x, c.y, c.z))?.[0];
      if (r?.kind === PLATFORM_KIND) {
        faces += 4 * r.length + 2;
        continue;
      }
      faces += FACE_NORMAL.filter((_, g) => hasFace(idx, c, g)).length;
    }
    assert.equal(counts(p, HIDES).faces, faces, l.name);
  }
});

test("the disc's maxima are the most any shipped level counts, counter by counter", () => {
  const most = Object.fromEntries(COUNTERS.map((what) => [what, 0]));
  for (const l of mapData.levels) {
    const n = counts(fromLevel(l), HIDES);
    for (const what of COUNTERS) most[what] = Math.max(most[what], n[what]);
  }
  assert.deepEqual(DISC_MAX, most);
});

test("the document's counter table gives the caps, the disc's maxima and a level that counts each", () => {
  const rows = [...doc.matchAll(/^\| (\w+) \|[^|]*\|([^|]*)\| (\d+)(?:, ([^|]+?))? \|$/gm)];
  assert.deepEqual(
    rows.map((m) => m[1]),
    COUNTERS,
  );
  for (const [, what, cap, most, title] of rows) {
    assert.equal(cap.trim(), what in CAPS ? String(CAPS[what]) : "", what);
    assert.equal(Number(most), DISC_MAX[what], what);
    if (!title) continue;
    const named = level(title);
    assert.ok(named, title);
    assert.equal(counts(fromLevel(named), HIDES)[what], DISC_MAX[what], title);
  }
});

test("a template drawn as the game would load it shows the shipped level's markers", () => {
  // The one level whose pickups the disc left unnumbered; the writer numbers them.
  const UNNUMBERED = new Set(["BONUS 30"]);
  const unnumbered = [];
  const seen = (m, l) => ({
    id: m.id,
    face: m.face,
    label: markerLabel(m),
    facing: m.face === null ? null : markerFacing(m),
    state: m.face === null ? null : markerState(m),
    circuit: m.face === null ? null : markerCircuit(m),
    to: m.face === null ? null : markerDestination(m, l),
    span:
      m.face === null && (m.kind === PLATFORM_KIND || m.kind === LASER_KIND)
        ? m.f.slice(0, 8)
        : null,
    phase: m.face === null && m.kind === 7 ? m.f[0] : null,
  });
  for (const l of mapData.levels) {
    const p = fromLevel(l);
    const drawn = toLevel(p, 3);
    assert.deepEqual(
      [drawn.pack, drawn.index, drawn.draft, drawn.theme],
      [DRAFT_PACK, 3, 3, l.theme],
    );
    const want = index(l);
    const got = index(drawn);
    const keep = (m) => m.face !== null || m.kind !== SETTINGS_KIND;
    const cells = [...want.markers.keys()].filter((k) => want.markers.get(k).some(keep)).sort();
    const drawnCells = [...got.markers.keys()].filter((k) => got.markers.get(k).some(keep)).sort();
    assert.deepEqual(drawnCells, cells, l.name);
    let numbersDiffer = false;
    for (const k of cells) {
      const a = want.markers.get(k).filter(keep);
      const b = got.markers.get(k).filter(keep);
      assert.deepEqual(
        b.map((m) => seen(m, drawn)),
        a.map((m) => seen(m, l)),
        `${l.name} at ${k}`,
      );
      a.forEach((m, i) => {
        if (m.face !== null && markerNumber(m) !== markerNumber(b[i])) numbersDiffer = true;
      });
    }
    if (numbersDiffer) unnumbered.push(l.name);
    assert.deepEqual([...got.beamCells.keys()].sort(), [...want.beamCells.keys()].sort(), l.name);
    assert.deepEqual([...got.railCells.keys()].sort(), [...want.railCells.keys()].sort(), l.name);
  }
  assert.deepEqual(new Set(unnumbered), UNNUMBERED);
});

// --- the rules, one case each ------------------------------------------------------------

test("without the skins table the checks run every rule but the face count, and say so", () => {
  const blocks = [plain([5, 5, 5], 0, { 0: coin }), plain([40, 5, 5])];
  const n = counts(project(blocks), undefined);
  assert.deepEqual([n.faces, n.blocks, n.cells, n.objects], [null, null, 2, 1]);
  const found = validate(project(blocks), undefined);
  assert.deepEqual(texts(found, "error"), ["the game builds nothing past the edge", "no start"]);
  assert.ok(
    texts(found, "warning").includes(
      "the face count could not be read, so the faces and the blocks are not counted",
    ),
  );
  const h10 = fromLevel(level("HIDDEN 10"));
  assert.deepEqual(texts(validate(h10, undefined), "error"), []);
  assert.ok(!texts(validate(h10, HIDES), "warning").some((w) => w.includes("could not be read")));
});

test("a level needs one start, and says which of several the game takes", () => {
  assert.ok(errors([plain([5, 5, 5], 0, { 0: coin })]).includes("no start"));
  const several = [
    plain([5, 5, 5], 0, { 0: start() }),
    plain([7, 5, 5], 0, { 2: start(1), 5: start(2) }),
  ];
  assert.deepEqual(errors(several), []);
  assert.ok(
    warnings(several).includes("3 starts; the game takes the one on face 5 of the block at 7,5,5"),
  );
});

test("a device works on a plain block only", () => {
  const blocks = [
    plain([5, 5, 5], 0, { 0: start() }),
    plain([7, 5, 5], 2, { 0: { type: TELEPORTER, facing: 1, variant: 0 } }),
  ];
  assert.ok(errors(blocks).includes("a device works on a plain block only"));
  blocks[1].kind = 0;
  assert.deepEqual(errors(blocks), []);
  const hidden = [plain([5, 5, 5], 0, { 0: start() }), plain([7, 5, 5], 2, { 0: { type: 26 } })];
  assert.deepEqual(errors(hidden), []);
  assert.ok(
    warnings(hidden).includes(
      "the game has not been seen to take a hidden exit on a block that is not plain",
    ),
  );
  hidden[1].kind = 0;
  assert.ok(!warnings(hidden).some((w) => w.includes("hidden exit")));
});

test("the game builds nothing past the edge", () => {
  for (const cell of [
    [0, 5, 5],
    [5, 33, 5],
  ])
    assert.ok(
      errors([plain([5, 5, 5], 0, { 0: start() }), plain(cell)]).includes(
        "the game builds nothing past the edge",
      ),
    );
  assert.deepEqual(errors([plain([1, 32, 1], 0, { 0: start() })]), []);
});

test("a platform runs over empty cells", () => {
  const rail = { cell: [10, 10, 17], kind: PLATFORM_KIND, far: [10, 14, 17], length: 3, speed: 30 };
  const base = [plain([5, 5, 5], 0, { 0: start() }), rail];
  assert.deepEqual(errors(base), []);
  for (const cell of [
    [10, 12, 17],
    [10, 14, 17],
    [10, 16, 17],
  ])
    assert.deepEqual(errors([...base, plain(cell)]), [
      `the platform's run crosses the block at ${cell.join(",")}`,
    ]);
  assert.deepEqual(errors([...base, plain([10, 17, 17])]), []);
  const edge = { cell: [30, 10, 17], kind: PLATFORM_KIND, far: [31, 10, 17], length: 2, speed: 30 };
  assert.deepEqual(errors([base[0], edge]), []);
  for (const over of [
    { ...edge, far: [32, 10, 17] },
    { ...edge, length: 3 },
  ])
    assert.deepEqual(errors([base[0], over]), ["the platform's run reaches past the edge"]);
  assert.ok(
    errors([base[0], { ...edge, length: 30000 }]).includes(
      "a platform 30000 blocks long, which the lattice cannot hold",
    ),
  );
});

test("every length the writer refuses is an error of its own text, whatever else the platform has", () => {
  const rail = (upper, length, far = upper) => [
    plain([5, 5, 5], 0, { 0: start() }),
    { cell: [10, upper - 1, 17], kind: PLATFORM_KIND, far: [10, far, 17], length, speed: 30 },
  ];
  const held = (upper, length) => `a platform ${length} blocks long, which the lattice cannot hold`;
  for (const upper of [30, 31, 32, 33])
    for (const length of [1, 2, 3, 4, 5]) {
      const blocks = rail(upper, length);
      const refused = length > SIDE - upper;
      assert.equal(errors(blocks).includes(held(upper, length)), refused, `${upper} ${length}`);
      if (refused) assert.throws(() => writeKwl(project(blocks)), `${upper} ${length}`);
      else assert.doesNotThrow(() => writeKwl(project(blocks)), `${upper} ${length}`);
    }
  // a run that ends on cell 33 is past the edge and the writer still has bytes for it
  assert.deepEqual(errors(rail(31, 3)), ["the platform's run reaches past the edge"]);
  assert.deepEqual(errors(rail(31, 4)), [held(31, 4)]);
  // a far end on the lattice's last cell says so, and hides nothing of the length
  assert.deepEqual(errors(rail(33, 1)), ["the far end is past the edge"]);
  assert.deepEqual(errors(rail(33, 2)), [held(33, 2)]);
  // a far end off the lattice is the far end's error, not the length's
  assert.deepEqual(errors(rail(31, 2, 40)), ["the far end is past the edge"]);
});

test("a beam ends on nothing, a plain block or another laser, and crosses nothing", () => {
  const beam = { cell: [10, 10, 17], kind: LASER_KIND, far: [14, 10, 17], colour: 0 };
  const base = [plain([5, 5, 5], 0, { 0: start() }), beam];
  assert.deepEqual(errors(base), []);
  assert.deepEqual(errors([...base, plain([14, 10, 17])]), []);
  assert.deepEqual(
    errors([...base, { cell: [14, 10, 17], kind: LASER_KIND, far: [14, 14, 17], colour: 1 }]),
    [],
  );
  assert.ok(
    errors([...base, plain([14, 10, 17], 2)]).includes(
      "a beam ends on an empty cell, a plain block or another laser's block",
    ),
  );
  assert.ok(
    errors([...base, plain([12, 10, 17])]).includes("the beam crosses the block at 12,10,17"),
  );
  const carrying = [...base, plain([14, 10, 17], 0, { 0: coin })];
  assert.deepEqual(errors(carrying), []);
  assert.ok(
    warnings(carrying).some((w) => w.startsWith("the beam's end makes a bare plain block")),
  );
  assert.ok(
    errors([...base, { ...beam, cell: [20, 20, 17], far: [24, 20, 17], colour: 7 }]).includes(
      "a colour of 7",
    ),
  );
});

test("the cells the loaders fill are checked against each other", () => {
  const base = plain([5, 5, 5], 0, { 0: start() });
  const beam = { cell: [10, 10, 17], kind: LASER_KIND, far: [10, 16, 17], colour: 0 };
  const across = { cell: [8, 13, 17], kind: LASER_KIND, far: [12, 13, 17], colour: 1 };
  assert.deepEqual(errors([base, beam, across]), []);
  assert.deepEqual(
    warnings([base, beam, across]).filter((w) => w.includes("crosses the beam")),
    [
      "the beam crosses the beam from 10,10,17; where two cross, the lit one fills the cell",
      "the beam crosses the beam from 8,13,17; where two cross, the lit one fills the cell",
    ],
  );
  const into = { cell: [8, 13, 17], kind: LASER_KIND, far: [10, 13, 17], colour: 1 };
  assert.deepEqual(errors([base, beam, into]), ["the beam ends in the beam from 10,10,17"]);
  const rail = { cell: [8, 13, 17], kind: PLATFORM_KIND, far: [12, 13, 17], length: 2, speed: 30 };
  assert.deepEqual(errors([base, beam, rail]), [
    "the platform's run crosses the beam from 10,10,17",
    "the beam crosses the platform's run from 8,13,17",
  ]);
  const overEnd = {
    cell: [8, 16, 17],
    kind: PLATFORM_KIND,
    far: [12, 16, 17],
    length: 2,
    speed: 30,
  };
  assert.deepEqual(errors([base, beam, overEnd]), [
    "the platform's run crosses the end of the beam from 10,10,17",
  ]);
  const clear = { cell: [8, 18, 17], kind: PLATFORM_KIND, far: [12, 18, 17], length: 2, speed: 30 };
  assert.deepEqual(errors([base, beam, clear]), []);
});

test("a span lies along one axis inside the edge", () => {
  for (const [far, text] of [
    [[10, 10, 17], "the far end is the block's own cell"],
    [[12, 12, 17], "the far end is not along one axis from the block"],
    [[10, 33, 17], "the far end is past the edge"],
    [[10, 32767, 17], "the far end is past the edge"],
  ]) {
    const beam = { cell: [10, 10, 17], kind: LASER_KIND, far, colour: 0 };
    assert.ok(errors([plain([5, 5, 5], 0, { 0: start() }), beam]).includes(text), text);
  }
  // the walk over a span's cells never leaves the lattice, however far the end lies
  const far = Array.from({ length: 1000 }, (_, i) => ({
    cell: [1 + (i % 32), 1 + Math.floor(i / 32), 5],
    kind: LASER_KIND,
    far: [1 + (i % 32), 1 + Math.floor(i / 32), 32767],
    colour: 0,
  }));
  const found = errors([plain([5, 5, 5], 0, { 0: start() }), ...far]);
  assert.equal(found.filter((e) => e === "the far end is past the edge").length, 1000);
  const long = {
    cell: [10, 10, 17],
    kind: PLATFORM_KIND,
    far: [10, 12, 17],
    length: 32000,
    speed: 30,
  };
  assert.ok(
    errors([plain([5, 5, 5], 0, { 0: start() }), long]).includes(
      "a platform 32000 blocks long, which the lattice cannot hold",
    ),
  );
  assert.ok(
    errors([
      plain([5, 5, 5], 0, { 0: start() }),
      { cell: [10, 10, 17], kind: LASER_KIND, colour: 0 },
    ]).includes("a span needs a far end"),
  );
});

test("a keyless level with a laser counts the blocks the loader makes", () => {
  const ring = [
    [12, 10, 17],
    [11, 9, 17],
    [11, 11, 17],
    [11, 10, 16],
    [11, 10, 18],
  ];
  const blocks = [
    { cell: [10, 10, 17], kind: LASER_KIND, far: [10, 14, 17], colour: 0 },
    plain([11, 10, 17]),
    ...ring.map((cell) => plain(cell)),
  ];
  assert.equal(counts(project(blocks), HIDES).blocks, 6);
});

test("the record cap", () => {
  const blocks = Array.from({ length: 123 }, (_, i) =>
    plain([1 + (i % 32), 1 + Math.floor(i / 32), 5], 0, { 0: coin }),
  );
  blocks[0].faces = { 0: start() };
  assert.deepEqual(errors(blocks), []);
  blocks.push(plain([1, 10, 5], 0, { 0: coin }));
  assert.ok(errors(blocks).includes("124 records, over the 123 the game has room for"));
});

test("the block cap", () => {
  const blocks = [];
  for (let x = 1; x <= 16; x++) for (let y = 1; y <= 16; y++) blocks.push(plain([x, y, 17]));
  blocks[0].faces = { 0: start() };
  const n = counts(project(blocks), HIDES);
  assert.deepEqual([n.blocks, n.faces], [256, 576]);
  assert.deepEqual(errors(blocks), []);
  assert.ok(warnings(blocks).includes("256 blocks, more than any level on the disc"));
  blocks.push(plain([17, 1, 17]));
  assert.ok(errors(blocks).includes("257 blocks, over the 256 the game has room for"));
});

test("a bad colour or variant is a finding and leaves the circuits pass alone", () => {
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: TELEPORTER, facing: 1, variant: 7 },
      2: { type: SWITCH, variant: -1 },
      3: { type: COIN, variant: "gold" },
    }),
    { cell: [9, 9, 9], kind: LASER_KIND, far: [9, 12, 9], colour: 7 },
    { cell: [9, 9, 12], kind: LASER_KIND, far: [9, 12, 12] },
  ];
  const findings = validate(project(blocks, { circuits: { 7: "off" } }), HIDES);
  const found = texts(findings, "error");
  for (const text of [
    "a variant of 7",
    "a variant of -1",
    "a variant of gold",
    "a colour of 7",
    "a colour of none",
  ])
    assert.ok(found.includes(text), text);
  assert.ok(!texts(findings, "warning").some((w) => w.includes(" 7 ") || w.includes(" -1 ")));
  assert.equal(counts(project(blocks), HIDES).lasers, 2);
});

test("a document that bypassed the reader is checked alike on both sides", () => {
  const findings = validate(
    {
      format: FORMAT,
      world: null,
      into: { pack: 1 },
      time: true,
      circuits: {},
      blocks: [
        {
          cell: [5, 5, 5],
          kind: 0,
          faces: { 0: { type: START, facing: true }, 1: { type: COIN, variant: true } },
        },
        { cell: [6, 5, 5], kind: true },
        { cell: [7, 5, 5], kind: 7, phase: true },
        { cell: [8, 5, 5], kind: LASER_KIND, far: [8, 5, 50], colour: false },
        { cell: [10, 5, 5], kind: PLATFORM_KIND, far: [10, 9, 5], length: false, speed: true },
      ],
    },
    HIDES,
  ).map(describe);
  assert.deepEqual(findings, [
    "error: the world '' is not one of the disc's ten",
    "error: the target '{\"pack\":1}' is not a slot of a world or a finals pack",
    "error: a time of true seconds, outside the file's range",
    "error at 5,5,5 face 0: a facing of 1 to 4 is needed",
    "error at 5,5,5 face 1: a variant of true",
    "error at 6,5,5: kind true is not a kind of block",
    "error at 7,5,5: a phase of true",
    "error at 8,5,5: a colour of false",
    "error at 8,5,5: the far end is past the edge",
    "error at 10,5,5: a length of false, outside the file's range",
    "warning at 5,5,5 face 1: looks into the block at 6,5,5",
    "warning: with no key the game draws the bonus artwork, which has no picture for the moving platform",
  ]);

  // JSON spelled otherwise than the readers spell it: whole numbers with a point, null where a
  // key is missing, a list for a table, a boolean or text for a number
  const spelled = JSON.parse(`{
  "format": "kula-world-level", "world": "HIRO", "time": false, "hidden": [], "circuits": ["off"],
  "blocks": [
    {"cell": [5.0, 5, 5], "kind": 0.0, "faces": {"0": {"type": 30.0, "facing": 3.0}, "1": {"type": 37.0, "variant": 1.0}}},
    {"cell": [6, 5, 5], "kind": null},
    {"cell": [7, 5, 5], "kind": 7, "phase": 0.0},
    {"cell": [8, 5, 5], "kind": 8, "far": null, "colour": 0},
    {"cell": [9, 5, 5], "kind": 8, "far": {}, "colour": 0},
    {"cell": [10, 5, 5], "kind": 8, "far": [10, 9, 5], "colour": null},
    {"cell": [12, 5, 5], "kind": 0, "faces": [{"type": 30, "facing": 3}]},
    {"cell": [10, 10, 17], "kind": 5, "far": [10, 12, 17], "length": "2", "speed": 30.0},
    {"cell": [8, 13, 17], "kind": 8, "far": [12, 13, 17], "colour": 1},
    {"cell": [14, 5, 5], "kind": 5, "far": [14, 9, 5], "length": 2.0, "speed": 30, "faces": 5}
  ]
}`);
  assert.deepEqual(validate(spelled, HIDES).map(describe), [
    "error: a time of false seconds, outside the file's range",
    "error at 6,5,5: kind null is not a kind of block",
    "error at 8,5,5: a span needs a far end",
    "error at 8,13,17: the beam crosses the platform's run from 10,10,17",
    "error at 9,5,5: the far end is not along one axis from the block",
    "error at 10,5,5: a colour of none",
    "error at 10,10,17: a length of 2, outside the file's range",
    "warning at 5,5,5 face 1: looks into the block at 6,5,5",
    "warning: 2 starts; the game takes the one on face 0 of the block at 12,5,5",
    "warning: the yellow circuit starts off and has no switch to turn it on",
  ]);
  assert.deepEqual(counts(spelled, HIDES), {
    records: 10,
    cells: 10,
    faces: 75,
    blocks: 5,
    objects: 1,
    platforms: 2,
    lasers: 4,
    vanishing: 1,
    crumbling: 0,
    captivators: 0,
    keys: 0,
    lights: 0,
    spikes: 0,
  });
  assert.equal(
    playsAs(spelled),
    "Plays as a hidden bonus level, with the glass ball on half-seen blocks: it has no key, so every block scores 50 the first time the ball rolls onto it, the level ends once every block has been rolled, and an exit stands open from the start.",
  );
});

test("the target's slot is a run of ASCII digits, and the world and the target are quoted as written", () => {
  const into = (text) => errors([plain([5, 5, 5], 0, { 0: start() })], { into: text });
  assert.deepEqual(into("/HIRO/HIRO.PAK#3"), []);
  for (const text of ["/HIRO/HIRO.PAK#٣", "/HIRO/HIRO.PAK#²", "/HIRO/HIRO.PAK#3 "])
    assert.deepEqual(into(text), [
      `the target '${text}' is not a slot of a world or a finals pack`,
    ]);
  assert.deepEqual(errors([plain([5, 5, 5], 0, { 0: start() })], { world: "it's" }), [
    "the world 'it's' is not one of the disc's ten",
  ]);
});

test("the face cap, with the level that sits under it", () => {
  const h10 = level("HIDDEN 10");
  const p = fromLevel(h10);
  assert.equal(counts(p, HIDES).faces, 766);
  assert.deepEqual(texts(validate(p, HIDES), "error"), []);
  const free = [h10.min[0] - 2, h10.min[1], h10.min[2]];
  assert.ok(free.every(inner));
  const over = setBlock(p, free, { kind: 0 });
  assert.equal(counts(over, HIDES).faces, 772);
  assert.ok(
    texts(validate(over, HIDES), "error").includes("772 faces, over the 768 the game has room for"),
  );
});

test("the object cap counts what the loader numbers", () => {
  const blocks = [plain([5, 5, 5], 0, { 0: start() })];
  const six = Object.fromEntries([0, 1, 2, 3, 4, 5].map((j) => [j, coin]));
  for (let i = 0; i < 42; i++)
    blocks.push(plain([1 + (i % 32), 20 + Math.floor(i / 32), 5], 0, six));
  blocks.push(plain([20, 25, 5], 0, { 0: coin, 1: coin, 2: coin }));
  assert.equal(counts(project(blocks), HIDES).objects, 255);
  assert.deepEqual(errors(blocks), []);
  assert.ok(
    warnings(blocks).includes("255 objects the loader numbers, more than any level on the disc"),
  );
  blocks.push(plain([22, 25, 5], 0, { 0: coin }));
  assert.ok(
    errors(blocks).includes("256 objects the loader numbers, over the 255 the game has room for"),
  );
});

test("the platform, vanishing, crumbling and captivator caps", () => {
  const withStart = (more) => [plain([5, 5, 5], 0, { 0: start() }), ...more];
  const rail = (i) => ({
    cell: [1 + 2 * i, 10, 5],
    kind: PLATFORM_KIND,
    far: [1 + 2 * i, 12, 5],
    length: 2,
    speed: 30,
  });
  const rails = Array.from({ length: 8 }, (_, i) => rail(i));
  assert.deepEqual(errors(withStart(rails)), []);
  assert.ok(warnings(withStart(rails)).includes("8 platforms, more than any level on the disc"));
  assert.ok(
    errors(withStart([...rails, rail(8)])).includes(
      "9 platforms, over the 8 the game has room for",
    ),
  );

  const vanishing = Array.from({ length: 64 }, (_, i) => ({
    cell: [1 + (i % 32), 20 + 2 * Math.floor(i / 32), 5],
    kind: 7,
    phase: 0,
  }));
  const n = counts(project(withStart(vanishing)), HIDES);
  assert.deepEqual([n.vanishing, n.records, n.blocks], [64, 65, 65]);
  assert.deepEqual(errors(withStart(vanishing)), []);
  assert.ok(
    warnings(withStart(vanishing)).includes("64 vanishing blocks, more than any level on the disc"),
  );
  assert.ok(
    !warnings(withStart(vanishing.slice(0, 14))).some((w) => w.includes("vanishing, more")),
  );
  assert.ok(
    warnings(withStart(vanishing.slice(0, 15))).includes(
      "15 vanishing blocks, more than any level on the disc",
    ),
  );
  assert.ok(
    errors(withStart([...vanishing, { cell: [1, 24, 5], kind: 7, phase: 0 }])).includes(
      "65 vanishing blocks, over the 64 the game has room for",
    ),
  );

  const crumbling = Array.from({ length: 64 }, (_, i) => ({
    cell: [1 + (i % 32), 20 + 2 * Math.floor(i / 32), 5],
    kind: 6,
  }));
  assert.deepEqual(errors(withStart(crumbling)), []);
  assert.ok(
    !warnings(withStart(crumbling.slice(0, 33))).some((w) => w.includes("crumbling, more")),
  );
  assert.ok(
    warnings(withStart(crumbling.slice(0, 34))).includes(
      "34 crumbling blocks, more than any level on the disc",
    ),
  );
  assert.ok(
    errors(withStart([...crumbling, { cell: [1, 24, 5], kind: 6 }])).includes(
      "65 crumbling blocks, over the 64 the game has room for",
    ),
  );

  const wandering = { type: WANDERING };
  const six = Object.fromEntries([0, 1, 2, 3, 4, 5].map((j) => [j, wandering]));
  const captive = Array.from({ length: 5 }, (_, i) => plain([1 + 2 * i, 20, 5], 0, six));
  captive.push(plain([12, 20, 5], 0, { 0: wandering, 1: wandering }));
  assert.equal(counts(project(withStart(captive)), HIDES).captivators, 32);
  assert.deepEqual(errors(withStart(captive)), []);
  assert.ok(
    warnings(withStart(captive)).includes("32 captivators, more than any level on the disc"),
  );
  captive[5].faces[2] = wandering;
  assert.ok(
    errors(withStart(captive)).includes("33 captivators, over the 32 the game has room for"),
  );
});

test("the light and the moving spikes caps", () => {
  const blocks = [plain([5, 5, 5], 0, { 0: start() })];
  const six = Object.fromEntries(
    [0, 1, 2, 3, 4, 5].map((j) => [j, { type: SWITCH, variant: j % 4 }]),
  );
  for (let i = 0; i < 5; i++) blocks.push(plain([1 + 2 * i, 20, 5], 0, six));
  blocks.push(
    plain([12, 20, 5], 0, { 0: { type: SWITCH, variant: 0 }, 1: { type: SWITCH, variant: 1 } }),
  );
  assert.equal(counts(project(blocks), HIDES).lights, 32);
  assert.deepEqual(errors(blocks), []);
  assert.ok(
    warnings(blocks).includes("32 devices that cast a light, more than any level on the disc"),
  );
  blocks[6].faces[2] = { type: SWITCH, variant: 2 };
  assert.ok(
    errors(blocks).includes("33 devices that cast a light, over the 32 the game has room for"),
  );

  const spiked = Object.fromEntries([0, 1, 2, 3, 4, 5].map((j) => [j, { type: 11, variant: 0 }]));
  const spikes = [plain([5, 5, 5], 0, { 0: start() })];
  for (let i = 0; i < 10; i++) spikes.push(plain([1 + 2 * i, 20, 5], 0, spiked));
  spikes.push(
    plain([22, 20, 5], 0, {
      0: { type: 11, variant: 0 },
      1: { type: 11, variant: 0 },
      2: { type: 11, variant: 0 },
      3: { type: 11, variant: 0 },
    }),
  );
  assert.equal(counts(project(spikes), HIDES).spikes, 64);
  assert.deepEqual(errors(spikes), []);
  assert.ok(warnings(spikes).includes("64 moving spikes, more than any level on the disc"));
  assert.ok(!warnings(spikes.slice(0, 4)).some((w) => w.includes("moving spikes, more")));
  assert.ok(
    warnings(spikes.slice(0, 5)).includes("24 moving spikes, more than any level on the disc"),
  );
  spikes[11].faces[4] = { type: 11, variant: 0 };
  assert.ok(errors(spikes).includes("65 moving spikes, over the 64 the game has room for"));
});

test("a platform longer than the ride's grid", () => {
  const rail = (length) => [
    plain([5, 5, 5], 0, { 0: start() }),
    { cell: [10, 10, 17], kind: PLATFORM_KIND, far: [10, 14, 17], length, speed: 30 },
  ];
  assert.deepEqual(errors(rail(7)), []);
  assert.ok(warnings(rail(7)).includes("a platform 7 blocks long"));
  assert.deepEqual(errors(rail(8)), [
    "a platform 8 blocks long, more than the 7 the game's grid holds",
  ]);
  assert.ok(!warnings(rail(8)).some((w) => w.includes("blocks long")));
});

test("a platform shorter than one block", () => {
  const rail = (length) => [
    plain([5, 5, 5], 0, { 0: start() }),
    { cell: [10, 10, 17], kind: PLATFORM_KIND, far: [10, 14, 17], length, speed: 30 },
  ];
  assert.deepEqual(errors(rail(0)), ["a platform 0 blocks long, which is less than one block"]);
  assert.deepEqual(errors(rail(-3)), ["a platform -3 blocks long, which is less than one block"]);
  assert.ok(!warnings(rail(0)).some((w) => w.includes("blocks long")));
});

test("what the format takes, and what it warns about", () => {
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: 3 },
      2: { type: COIN, variant: 7 },
      3: { type: START },
      4: { type: 42 },
      5: { type: 46 },
    }),
  ];
  const found = errors(blocks);
  assert.ok(found.includes("type 3 is nothing the game plays"));
  assert.ok(found.includes("a variant of 7"));
  assert.ok(found.includes("a facing of 1 to 4 is needed"));
  const turned = [
    plain([5, 5, 5], 0, { 0: start(), 1: { type: WANDERING, facing: 7 }, 2: { type: 56 } }),
  ];
  assert.deepEqual(errors(turned), ["a facing of 1 to 4, or none"]);
  const warned = warnings(blocks);
  assert.ok(warned.includes("the star is untested in play"));
  assert.ok(warned.includes("the game shows the player's next fruit, whichever is placed"));
  const one = [plain([5, 5, 5], 0, { 0: start() })];
  assert.ok(errors(one, { time: 0 }).includes("a time of 0 seconds"));
  assert.ok(
    warnings(one, { time: 120 }).includes(
      "a time of 120 seconds, above the 99 the game's levels keep to",
    ),
  );
  assert.ok(
    errors(one, { time: 40000 }).includes("a time of 40000 seconds, outside the file's range"),
  );
  const wide = {
    cell: [10, 10, 17],
    kind: PLATFORM_KIND,
    far: [10, 14, 17],
    length: 2,
    speed: 65566,
  };
  assert.ok(errors([...one, wide]).includes("a speed of 65566, outside the file's range"));
  assert.ok(
    errors([...one, { ...wide, length: 40000, speed: 30 }]).includes(
      "a length of 40000, outside the file's range",
    ),
  );
  assert.ok(
    errors(one, { world: "MOON" }).includes("the world 'MOON' is not one of the disc's ten"),
  );
  for (const [into, ok] of [
    ["/HIRO/HIRO.PAK#0", true],
    ["/HELL/HELLFI.PAK#1", true],
    ["/HELL/HELLFI.PAK#2", false],
    ["/HIRO/COPYCAT.PAK#0", false],
    ["HIRO#0", false],
  ])
    assert.equal(
      errors(one, { into }).some((e) => e.includes("is not a slot of")),
      !ok,
      into,
    );
  assert.ok(
    errors([...one, { cell: [7, 5, 5], kind: 6, faces: { 0: { type: COIN } } }]).includes(
      "nothing stands on a platform's, laser's, crumbling or vanishing block's faces",
    ),
  );
  assert.ok(
    warnings([...one, { cell: [7, 5, 5], kind: 7, phase: 4 }]).includes(
      "a phase of 4 dims at once",
    ),
  );
  assert.ok(errors([...one, { cell: [7, 5, 5], kind: 7, phase: 9 }]).includes("a phase of 9"));
  assert.ok(
    errors([...one, { cell: [7, 5, 5], kind: 12 }]).includes("kind 12 is not a kind of block"),
  );
  assert.ok(
    errors([...one, plain([7, 5, 5], 0, { 9: coin })]).includes("face 9 is not one of the six"),
  );
  assert.ok(
    errors([...one, plain([7, 5, 5], 0, { top: coin })]).includes(
      'face "top" is not one of the six',
    ),
  );
  assert.ok(errors([...one, plain([5, 5, 5])]).includes("two blocks on one cell"));
  const rail = { cell: [10, 10, 17], kind: PLATFORM_KIND, far: [10, 14, 17], length: 5, speed: 20 };
  assert.deepEqual(errors([...one, rail]), []);
  assert.ok(warnings([...one, rail]).includes("a platform 5 blocks long"));
  assert.ok(warnings([...one, rail]).includes("a platform running at 20"));
});

test("an object looks into an empty cell", () => {
  const blocks = [
    plain([5, 5, 5], 0, { 0: start(), 1: coin, 2: { type: KEY }, 3: { type: GEM, variant: 0 } }),
    plain([6, 5, 5]),
    { cell: [5, 6, 5], kind: 6 },
    { cell: [5, 4, 4], kind: 7, phase: 0 },
    { cell: [5, 4, 5], kind: 7, phase: 0 },
    { cell: [5, 8, 7], kind: LASER_KIND, far: [5, 8, 3], colour: 0 },
    plain([6, 8, 5], 0, { 4: coin }),
  ];
  const warned = warnings(blocks);
  assert.ok(warned.includes("looks into the block at 6,5,5"));
  assert.ok(warned.includes("looks into a crumbling block"));
  assert.ok(warned.includes("looks into a vanishing block"));
  assert.ok(warned.includes("looks into a beam"));
  const findings = validate(project(blocks), HIDES);
  const beam = findings.find((f) => f.text === "looks into a beam");
  assert.deepEqual(beam.at, { cell: [6, 8, 5], face: 4 });
  assert.equal(describe(beam), "warning at 6,8,5 face 4: looks into a beam");
  assert.equal(describe(validate(project([plain([5, 5, 5])]), HIDES)[0]), "error: no start");
});

test("the circuits' warnings", () => {
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: TELEPORTER, facing: 1, variant: 0 },
      2: { type: SWITCH, variant: 1 },
    }),
    { cell: [9, 9, 9], kind: LASER_KIND, far: [9, 12, 9], colour: 2 },
  ];
  const warned = warnings(blocks, { circuits: { 2: "off" } });
  assert.ok(warned.includes("the green circuit starts off and has no switch to turn it on"));
  assert.ok(warned.includes("the one yellow teleporter leads to itself"));
  assert.ok(warned.includes("the blue switches have nothing to switch"));
  setAnnotations({ ...annotations, types: { ...annotations.types, [SWITCH]: { name: "Switch" } } });
  try {
    assert.ok(
      warnings(blocks, { circuits: { 2: "off" } }).includes(
        "the 2 circuit starts off and has no switch to turn it on",
      ),
    );
  } finally {
    setAnnotations(annotations);
  }
  assert.ok(
    warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY } })]).includes("a key and no exit"),
  );
  assert.ok(
    !warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY }, 2: { type: EXIT } })]).includes(
      "a key and no exit",
    ),
  );
  assert.ok(
    !warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY }, 2: { type: 26 } })]).includes(
      "a key and no exit",
    ),
  );
});

// The bonus artwork is the second model set, whose only picture for several kinds
// and types is the placeholder texture; the two lists are what the shipped table says.
test("a keyless level is warned of what the bonus artwork has no picture for", () => {
  const { bonus } = objects.skins.sets;
  const placeholder = (models) => models.every((m) => m.length === 1 && m[0] === 8);
  assert.deepEqual(BONUS_UNDRAWN_KINDS, [
    ...Object.keys(bonus.kinds)
      .filter((k) => placeholder([bonus.kinds[k]]))
      .map(Number),
    ...(placeholder(bonus.platform) ? [5] : []),
  ]);
  assert.deepEqual(
    BONUS_UNDRAWN_TYPES,
    Object.keys(bonus.types)
      .map(Number)
      .filter((t) => PLAYED.has(t) && placeholder([bonus.types[t]])),
  );
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: 8 },
      2: { type: 46 },
      3: { type: 43 },
      4: { type: EXIT },
    }),
    plain([7, 5, 5], 1),
    plain([9, 5, 5], 2),
    { cell: [11, 5, 5], kind: PLATFORM_KIND, far: [11, 8, 5], length: 2, speed: 30 },
  ];
  assert.ok(
    warnings(blocks).includes(
      "with no key the game draws the bonus artwork, which has no picture for the clock, the fruit, the exit, the fire block, the ice block or the moving platform",
    ),
  );
  assert.ok(
    warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: 1 } })]).includes(
      "with no key the game draws the bonus artwork, which has no picture for the fire",
    ),
  );
  assert.ok(!warnings(blocks, { hidden: true }).some((w) => w.includes("bonus artwork")));
  blocks[0].faces[5] = { type: KEY };
  assert.ok(!warnings(blocks).some((w) => w.includes("bonus artwork")));
  assert.ok(
    !warnings([plain([5, 5, 5], 0, { 0: start(), 1: coin })]).some((w) =>
      w.includes("bonus artwork"),
    ),
  );
  for (const l of mapData.levels)
    assert.ok(
      !texts(validate(fromLevel(l), HIDES), "warning").some((w) => w.includes("bonus artwork")),
      l.name,
    );
});

test("how a level plays", () => {
  const keyed = project([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY } })]);
  assert.equal(playsAs(keyed), "Plays as an arcade level.");
  const keyless = project([plain([5, 5, 5], 0, { 0: start() })]);
  assert.ok(
    playsAs(keyless).startsWith("Plays as a bonus level: it has no key, so every block scores 50"),
  );
  assert.equal(
    playsAs({ ...keyed, hidden: true }),
    "Plays as a hidden level, with the glass ball on half-seen blocks.",
  );
  assert.ok(playsAs({ ...keyless, hidden: true }).startsWith("Plays as a hidden bonus level"));
  assert.deepEqual(
    validate(keyed, HIDES).map((f) => f.level),
    ["warning"],
  );
  assert.equal(validate(keyed, HIDES)[0].at, null);
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
    circuits: {},
    blocks: [],
  });
});

test("the reader takes what it knows of a newer file, fills the defaults and drops what cannot be a block", () => {
  const { project: p, report } = readProject({
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
      { cell: [7, 5, 5], kind: PLATFORM_KIND, far: [7, 9, 5] },
      { cell: [9, 5, 5], kind: LASER_KIND, far: [9, 9, 5] },
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
    { cell: [5, 5, 5], kind: 2 },
    { cell: [7, 5, 5], kind: PLATFORM_KIND, far: [7, 9, 5], length: 2, speed: 30 },
    { cell: [9, 5, 5], kind: LASER_KIND, far: [9, 9, 5], colour: 0 },
    { cell: [11, 5, 5], kind: 7, phase: 0 },
    { cell: [40, 5, 5], kind: 0 },
  ]);
  assert.ok(report.some((line) => line.startsWith("written as version 7")));
  assert.equal(report.filter((line) => line.includes("it is left out")).length, 6);
  assert.ok(report.some((line) => line.includes("block 1 ")));
  assert.ok(report.some((line) => line.includes("block 2 ")));
  assert.ok(report.some((line) => line.includes("block 3 ")));
  assert.ok(report.some((line) => line.includes('a face "top"')));
  assert.ok(report.some((line) => line.includes("face 2 holds nothing")));
  assert.ok(report.some((line) => line.includes("colour 7")));
  assert.ok(report.some((line) => line.includes("colour 3 is neither on nor off")));
  assert.ok(report.some((line) => line.includes("hidden")));
  assert.ok(report.some((line) => line.includes("time")));
  const found = texts(validate(p, HIDES), "error");
  assert.ok(found.includes("two blocks on one cell"));
  assert.ok(found.includes("the game builds nothing past the edge"));
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
      { cell: [7, 5, 5], kind: PLATFORM_KIND, far: [7, 9, 5], length: "3", speed: 2.5 },
      { cell: [9, 5, 5], kind: LASER_KIND, far: [9, 9, 5], colour: 7 },
      { cell: [10, 5, 5], kind: LASER_KIND, far: [10, 9, 5], colour: "red" },
      { cell: [11, 5, 5], kind: 7, phase: "x" },
      { cell: [12, 5, 5], kind: LASER_KIND, far: [12, 5, 5], colour: 0 },
      { cell: [13, 5, 5], kind: LASER_KIND, far: [13, 5, 40], colour: 0 },
      { cell: [14, 5, 5], kind: LASER_KIND, colour: 0 },
      { cell: [15, 5, 5], kind: PLATFORM_KIND, far: [15, 5] },
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
    { cell: [7, 5, 5], kind: PLATFORM_KIND, far: [7, 9, 5], length: 2, speed: 30 },
    { cell: [9, 5, 5], kind: LASER_KIND, far: [9, 9, 5], colour: 0 },
    { cell: [10, 5, 5], kind: LASER_KIND, far: [10, 9, 5], colour: 0 },
    { cell: [11, 5, 5], kind: 7, phase: 0 },
  ]);
  assert.deepEqual(report, [
    'a version of "2" is not a whole number; the file is read as version 1',
    "into is not text; it is left out",
    "block 0 at 5,5,5 face 1 has a type of 0, which is nothing standing there; it is left out",
    "block 0 at 5,5,5 face 2 has a variant of 9, which is not one of the 3; it is 0",
    'block 0 at 5,5,5 face 3 has a facing of "north", which is not a whole number; it is left out',
    "block 0 at 5,5,5 face 3 has no facing, which the game heads as 1; it is 1",
    'block 0 at 5,5,5 face 3 has a variant of "red", which is not one of the 4; it is 0',
    "block 0 at 5,5,5 face 4 has a variant of 2.5, which is not a whole number; it is left out",
    'block 0 at 5,5,5 names a face "9", which is not one of the six; it is left out',
    "block 1 at 6,5,5 has faces that are not a table of the six; they are left out",
    'block 2 at 7,5,5 has a length of "3", which is not a whole number; it is 2',
    "block 2 at 7,5,5 has a speed of 2.5, which is not a whole number; it is 30",
    "block 3 at 9,5,5 has a colour of 7, which is not one of the 4; it is 0",
    'block 4 at 10,5,5 has a colour of "red", which is not one of the 4; it is 0',
    'block 5 at 11,5,5 has a phase of "x", which is not a whole number; it is 0',
    "block 6 at 12,5,5 has its far end on its own cell; it is left out",
    "block 7 at 13,5,5 has its far end at 13,5,40, outside the lattice; it is left out",
    "block 8 at 14,5,5 is a span with no far end; it is left out",
    "block 9 at 15,5,5 has a far end that is not a cell of three whole numbers; it is left out",
  ]);
  assert.doesNotThrow(() => toLevel(p, 1));
  assert.deepEqual(readProject(writeProject(p)).report, []);
});

test("a platform's length the lattice cannot hold is cut on the way in, so a file of long runs draws small", () => {
  const { project: p, report } = readProject(
    project([
      plain([5, 5, 5], 0, { 0: start() }),
      { cell: [10, 10, 17], kind: PLATFORM_KIND, far: [10, 14, 17], length: 32767, speed: 30 },
      { cell: [12, 10, 17], kind: PLATFORM_KIND, far: [12, 14, 17], length: 0, speed: 30 },
      { cell: [14, 10, 17], kind: PLATFORM_KIND, far: [14, 14, 17], length: 20, speed: 30 },
    ]),
  );
  assert.deepEqual(
    p.blocks.filter((b) => b.kind === PLATFORM_KIND).map((b) => b.length),
    [20, 1, 20],
  );
  assert.deepEqual(report, [
    "block 1 at 10,10,17 has a length of 32767, which the lattice cannot hold; it is 20",
    "block 2 at 12,10,17 has a length of 0, which the lattice cannot hold; it is 1",
  ]);
  const c = hostile.cases.find((c) => c.name === "two hundred platforms of length 32767");
  const { project: q, report: lines } = readProject(structuredClone(c.input));
  const platforms = q.blocks.filter((b) => b.kind === PLATFORM_KIND);
  assert.equal(platforms.length, 200);
  const held = platforms.reduce((n, b) => n + b.length, 0);
  assert.equal(
    held,
    platforms.reduce((n, b) => n + SIDE - Math.max(b.cell[1], b.far[1]), 0),
  );
  assert.equal(lines.length, 4);
  const walked = toLevel(q, 1)
    .records.filter((r) => r.kind === PLATFORM_KIND)
    .reduce((n, r) => n + platformCells(r).length, 0);
  assert.equal(walked, held);
});

test("a title, an author, notes, a target or a source past their most are cut to it, counted in characters", () => {
  const title = `${"a".repeat(78)}\u{1F600}\u{1F600}\u{1F600}`;
  const { project: p, report } = readProject(
    project([plain([5, 5, 5], 0, { 0: start() })], {
      title,
      author: "b".repeat(2000),
      notes: "c".repeat(2001),
      into: `/HIRO/HIRO.PAK#1${"x".repeat(2000)}`,
      from: `/HIRO/HIRO.PAK#3${"y".repeat(1984)}`,
    }),
  );
  assert.equal(p.title, `${"a".repeat(78)}\u{1F600}\u{1F600}`);
  assert.equal([...p.title].length, 80);
  assert.equal(p.author.length, 2000);
  assert.equal(p.notes.length, 2000);
  assert.equal(p.into, `/HIRO/HIRO.PAK#1${"x".repeat(1984)}`);
  assert.equal(p.from, `/HIRO/HIRO.PAK#3${"y".repeat(1984)}`);
  assert.deepEqual(report, [
    "title is 81 characters long, more than the 80 kept; it is cut to 80",
    "notes is 2001 characters long, more than the 2000 kept; it is cut to 2000",
    "into is 2016 characters long, more than the 2000 kept; it is cut to 2000",
  ]);
  assert.deepEqual(readProject(writeProject(p)).report, []);
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
    { cell: [7, 5, 5], kind: PLATFORM_KIND, far: [7, 9, 5], length: 2, speed: 30 },
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
  const { project: p, report } = readProject({
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
  assert.deepEqual(texts(validate(p, HIDES), "error"), []);
  assert.ok(
    errors([plain([5, 5, 5], 0, { 0: start(), 5: coin, "05": coin })]).includes(
      "face 5 is named twice",
    ),
  );
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
      { cell: [9, 5, 5], kind: PLATFORM_KIND, far: [9, 8, 5] },
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
  assert.deepEqual(texts(validate(zero.project, HIDES), "error"), []);
  assert.deepEqual(q.blocks[1], { cell: [7, 5, 5], kind: 7, phase: 0 });
  assert.deepEqual(q.blocks[2], {
    cell: [9, 5, 5],
    kind: PLATFORM_KIND,
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
