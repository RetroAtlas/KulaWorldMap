import { test } from "node:test";
import assert from "node:assert/strict";
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
  setAnnotations,
  setObjects,
} from "../../public/js/data.js";
import { hasFace } from "../../public/js/blocks.js";
import { FACE_NORMAL } from "../../public/js/faces.js";
import { state, cellKey } from "../../public/js/state.js";
import { FORMAT, LASER_KIND, PLATFORM_KIND, SETTINGS_KIND, inner } from "../../public/js/kwl.js";
import {
  DRAFT_PACK,
  UNTITLED,
  blank,
  blockAt,
  counts,
  describe,
  faceAt,
  fromLevel,
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
      "the platform's run reaches past the edge",
    ),
  );
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

test("a span lies along one axis inside the edge", () => {
  for (const [far, text] of [
    [[10, 10, 17], "the far end is the block's own cell"],
    [[12, 12, 17], "the far end is not along one axis from the block"],
    [[10, 33, 17], "the far end is past the edge"],
  ]) {
    const beam = { cell: [10, 10, 17], kind: LASER_KIND, far, colour: 0 };
    assert.ok(errors([plain([5, 5, 5], 0, { 0: start() }), beam]).includes(text), text);
  }
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
  assert.ok(warnings(blocks).includes("255 objects, more than any level on the disc"));
  blocks.push(plain([22, 25, 5], 0, { 0: coin }));
  assert.ok(errors(blocks).includes("256 objects, over the 255 the game has room for"));
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
    errors(withStart([...vanishing, { cell: [1, 24, 5], kind: 7, phase: 0 }])).includes(
      "65 vanishing, over the 64 the game has room for",
    ),
  );

  const crumbling = Array.from({ length: 64 }, (_, i) => ({
    cell: [1 + (i % 32), 20 + 2 * Math.floor(i / 32), 5],
    kind: 6,
  }));
  assert.deepEqual(errors(withStart(crumbling)), []);
  assert.ok(
    errors(withStart([...crumbling, { cell: [1, 24, 5], kind: 6 }])).includes(
      "65 crumbling, over the 64 the game has room for",
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

test("more devices that cast a light than the game lights at once", () => {
  const blocks = [plain([5, 5, 5], 0, { 0: start() })];
  const six = Object.fromEntries(
    [0, 1, 2, 3, 4, 5].map((j) => [j, { type: SWITCH, variant: j % 4 }]),
  );
  for (let i = 0; i < 5; i++) blocks.push(plain([1 + 2 * i, 20, 5], 0, six));
  blocks.push(
    plain([12, 20, 5], 0, { 0: { type: SWITCH, variant: 0 }, 1: { type: SWITCH, variant: 1 } }),
  );
  assert.deepEqual(errors(blocks), []);
  assert.ok(!warnings(blocks).some((w) => w.includes("cast a light, over")));
  blocks[6].faces[2] = { type: SWITCH, variant: 2 };
  assert.ok(
    warnings(blocks).includes("33 devices that cast a light, over the 32 the game lights at once"),
  );
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
  assert.ok(warned.includes("colour 2 starts off and has no switch to turn it on"));
  assert.ok(warned.includes("the one teleporter of colour 0 leads to itself"));
  assert.ok(warned.includes("the switches of colour 1 have nothing to switch"));
  assert.ok(
    warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY } })]).includes("a key and no exit"),
  );
  assert.ok(
    !warnings([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY }, 2: { type: EXIT } })]).includes(
      "a key and no exit",
    ),
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
  const { project: q } = readProject(writeProject(p));
  assert.deepEqual(q.blocks[0].faces, {
    0: { type: START },
    1: { type: COIN, variant: 1 },
    2: { type: TELEPORTER, facing: 1, variant: 0 },
  });
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
