import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, objects } from "./fixtures.js";
import {
  NAMES,
  OFF_LATTICE,
  index,
  markerCircuit,
  markerDestination,
  markerFacing,
  markerLabel,
  markerNumber,
  markerState,
} from "../../public/js/viewer/data.js";
import { hasFace } from "../../public/js/viewer/draw/blocks.js";
import { FACE_NORMAL, SIDE, cellKey } from "../../public/js/format/lattice.js";
import {
  CAPS,
  DISC_MAX,
  FORMAT,
  LASER_KIND,
  PLATFORM_KIND,
  SETTINGS_KIND,
  inner,
  writeKwl,
} from "../../public/js/format/kwl.js";
import { DRAFT_PACK, fromLevel, setBlock, toLevel } from "../../public/js/format/project.js";
import { COUNTERS, counts, describe, playsAs, validate } from "../../public/js/format/checks.js";
import {
  COIN,
  HIDES,
  START,
  SWITCH,
  TELEPORTER,
  WANDERING,
  coin,
  doc,
  errors,
  level,
  plain,
  project,
  start,
  texts,
  warnings,
} from "./project-doc.js";

// --- the shipped levels --------------------------------------------------------------

test("every shipped level validates with no error and plays as the game plays it", () => {
  const bonus = mapData.levels.filter(
    (l) => [15, 16, 17].includes(l.index) && !/FI\.PAK/.test(l.pack),
  );
  const hidden = mapData.levels.filter((l) =>
    l.records.some((r) => r.kind === SETTINGS_KIND && r.type === 1),
  );
  assert.deepEqual([bonus.length, hidden.length], [30, 10]);
  assert.ok(mapData.levels.some((l) => l.pack === objects.skins.copycat));
  for (const l of mapData.levels) {
    const p = fromLevel(l);
    assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), [], l.name);
    assert.equal(p.simon, l.pack === objects.skins.copycat, l.name);
    const plays = playsAs(p);
    if (hidden.includes(l))
      assert.equal(
        plays,
        "Plays as a hidden level, with the glass ball on half-seen blocks.",
        l.name,
      );
    else if (bonus.includes(l))
      assert.equal(plays, "Plays as a bonus level since it has no key.", l.name);
    else if (l.pack === objects.skins.copycat)
      assert.equal(plays, "Plays as a Simon room.", l.name);
    else assert.equal(plays, "Plays as an arcade level.", l.name);
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
  assert.ok(
    !texts(validate(h10, HIDES, NAMES), "warning").some((w) => w.includes("could not be read")),
  );
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
  // a far end off the lattice is the far end's error, not the length's error
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
    [],
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
  const findings = validate(project(blocks, { circuits: { 7: "off" } }), HIDES, NAMES);
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
    NAMES,
  ).map(describe);
  assert.deepEqual(findings, [
    "error: the world '' is not one of the disc's ten worlds",
    "error: the target '{\"pack\":1}' is not a slot of a world pack, a finals pack or the Simon rooms' pack",
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
  assert.deepEqual(validate(spelled, HIDES, NAMES).map(describe), [
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
    "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks.",
  );
});

test("the target's slot is a run of ASCII digits, and the world and the target are quoted as written", () => {
  const into = (text) => errors([plain([5, 5, 5], 0, { 0: start() })], { into: text });
  assert.deepEqual(into("/HIRO/HIRO.PAK#3"), []);
  for (const text of ["/HIRO/HIRO.PAK#٣", "/HIRO/HIRO.PAK#²", "/HIRO/HIRO.PAK#3 "])
    assert.deepEqual(into(text), [
      `the target '${text}' is not a slot of a world pack, a finals pack or the Simon rooms' pack`,
    ]);
  assert.deepEqual(errors([plain([5, 5, 5], 0, { 0: start() })], { world: "it's" }), [
    "the world 'it's' is not one of the disc's ten worlds",
  ]);
});

test("the face cap, with the level that sits under it", () => {
  const h10 = level("HIDDEN 10");
  const p = fromLevel(h10);
  assert.equal(counts(p, HIDES).faces, 766);
  assert.deepEqual(texts(validate(p, HIDES, NAMES), "error"), []);
  const free = [h10.min[0] - 2, h10.min[1], h10.min[2]];
  assert.ok(free.every(inner));
  const over = setBlock(p, free, { kind: 0 });
  assert.equal(counts(over, HIDES).faces, 772);
  assert.ok(
    texts(validate(over, HIDES, NAMES), "error").includes(
      "772 faces, over the 768 the game has room for",
    ),
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
