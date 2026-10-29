import { test } from "node:test";
import assert from "node:assert/strict";
import { annotations, mapData, objects } from "./fixtures.js";
import { NAMES, setAnnotations } from "../../public/js/viewer/data.js";
import { BONUS_UNDRAWN_KINDS, BONUS_UNDRAWN_TYPES, PLAYED } from "../../public/js/format/kwl.js";
import { fromLevel } from "../../public/js/format/project.js";
import {
  TIME_LIMIT,
  circuitMembers,
  describe,
  playsAs,
  playsRoom,
  timeOf,
  validate,
} from "../../public/js/format/checks.js";
import {
  COIN,
  GEM,
  HIDES,
  KEY,
  START,
  SWITCH,
  TELEPORTER,
  WANDERING,
  coin,
  errors,
  plain,
  project,
  start,
  texts,
  warnings,
} from "./project-doc.js";
import { KIND } from "../../public/js/format/lattice.js";

const EXIT = 7;

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
  assert.deepEqual(
    warned.filter((w) => w.includes("next fruit")),
    [],
  );
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
    kind: KIND.PLATFORM,
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
    errors(one, { world: "MOON" }).includes("the world 'MOON' is not one of the disc's ten worlds"),
  );
  for (const [into, ok] of [
    ["/HIRO/HIRO.PAK#0", true],
    ["/HELL/HELLFI.PAK#1", true],
    ["/HELL/HELLFI.PAK#2", false],
    ["/HIRO/COPYCAT.PAK#0", true],
    ["/HIRO/COPYCAT.PAK#9", true],
    ["/HIRO/COPYCAT.PAK#10", false],
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
  const rail = { cell: [10, 10, 17], kind: KIND.PLATFORM, far: [10, 14, 17], length: 5, speed: 20 };
  assert.deepEqual(errors([...one, rail]), []);
  assert.ok(warnings([...one, rail]).includes("a platform 5 blocks long"));
  assert.ok(warnings([...one, rail]).includes("a platform running at 20"));
});

test("a typed time yields the nearest whole second from 1 to the file's limit, and null off it", () => {
  assert.equal(TIME_LIMIT, 32767);
  assert.equal(timeOf("1"), 1);
  assert.equal(timeOf(String(TIME_LIMIT)), TIME_LIMIT);
  for (const off of ["0", "", "32768", "-5", "0.5", "32767.4"])
    assert.equal(timeOf(off), null, off);
  assert.deepEqual(["2.5", "4.5", "1.4", "99.4", "200"].map(timeOf), [3, 5, 1, 99, 200]);
  const one = [plain([5, 5, 5], 0, { 0: start() })];
  assert.deepEqual(errors(one, { time: 1 }), []);
  assert.deepEqual(errors(one, { time: TIME_LIMIT }), []);
});

test("an object looks into an empty cell", () => {
  const blocks = [
    plain([5, 5, 5], 0, { 0: start(), 1: coin, 2: { type: KEY }, 3: { type: GEM, variant: 0 } }),
    plain([6, 5, 5]),
    { cell: [5, 6, 5], kind: 6 },
    { cell: [5, 4, 4], kind: 7, phase: 0 },
    { cell: [5, 4, 5], kind: 7, phase: 0 },
    { cell: [5, 8, 7], kind: KIND.LASER, far: [5, 8, 3], colour: 0 },
    plain([6, 8, 5], 0, { 4: coin }),
  ];
  const warned = warnings(blocks);
  assert.ok(warned.includes("looks into the block at 6,5,5"));
  assert.ok(warned.includes("looks into a crumbling block"));
  assert.ok(warned.includes("looks into a vanishing block"));
  assert.ok(warned.includes("looks into a beam"));
  const findings = validate(project(blocks), HIDES, NAMES);
  const beam = findings.find((f) => f.text === "looks into a beam");
  assert.deepEqual(beam.at, { cell: [6, 8, 5], face: 4 });
  assert.equal(describe(beam), "warning at 6,8,5 face 4: looks into a beam");
  assert.equal(describe(validate(project([plain([5, 5, 5])]), HIDES, NAMES)[0]), "error: no start");
});

test("a circuit's members are counted on the faces the game walks, by colour", () => {
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: SWITCH, variant: 2 },
      2: { type: TELEPORTER, facing: 1, variant: 2 },
      3: { type: SWITCH },
    }),
    {
      cell: [7, 5, 5],
      kind: KIND.PLATFORM,
      far: [7, 9, 5],
      length: 2,
      speed: 30,
      faces: { 0: { type: SWITCH, variant: 2 } },
    },
    { cell: [9, 5, 5], kind: KIND.LASER, far: [9, 9, 5], colour: 2 },
    { cell: [11, 5, 5], kind: KIND.LASER, far: [11, 9, 5] },
    plain([13, 5, 5], 0, {
      0: { type: TELEPORTER, facing: 1, variant: 7 },
      1: { type: SWITCH, variant: -1 },
    }),
  ];
  assert.deepEqual(circuitMembers(project(blocks)), [
    { switches: 1, teleporters: 0, lasers: 1 },
    { switches: 0, teleporters: 0, lasers: 0 },
    { switches: 1, teleporters: 1, lasers: 1 },
    { switches: 0, teleporters: 0, lasers: 0 },
  ]);
});

test("the circuits' warnings", () => {
  const blocks = [
    plain([5, 5, 5], 0, {
      0: start(),
      1: { type: TELEPORTER, facing: 1, variant: 0 },
      2: { type: SWITCH, variant: 1 },
    }),
    { cell: [9, 9, 9], kind: KIND.LASER, far: [9, 12, 9], colour: 2 },
  ];
  const warned = warnings(blocks, { circuits: { 2: "off" } });
  assert.ok(warned.includes("the green circuit starts off and has no switch to turn it on"));
  assert.ok(warned.includes("the one yellow teleporter leads to itself"));
  assert.ok(warned.includes("the blue switches have nothing to switch"));
  setAnnotations({ ...annotations, types: { ...annotations.types, [SWITCH]: { name: "Switch" } } });
  try {
    const unnamed = warnings(blocks, { circuits: { 2: "off" } });
    for (const text of [
      "circuit 2 starts off and has no switch to turn it on",
      "the one teleporter of circuit 0 leads to itself",
      "the switches of circuit 1 have nothing to switch",
    ])
      assert.ok(unnamed.includes(text), text);
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
    { cell: [11, 5, 5], kind: KIND.PLATFORM, far: [11, 8, 5], length: 2, speed: 30 },
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
  assert.ok(!warnings(blocks, { simon: true }).some((w) => w.includes("bonus artwork")));
  blocks[0].faces[5] = { type: KEY };
  assert.ok(!warnings(blocks).some((w) => w.includes("bonus artwork")));
  assert.ok(
    !warnings([plain([5, 5, 5], 0, { 0: start(), 1: coin })]).some((w) =>
      w.includes("bonus artwork"),
    ),
  );
  for (const l of mapData.levels)
    assert.ok(
      !texts(validate(fromLevel(l), HIDES, NAMES), "warning").some((w) =>
        w.includes("bonus artwork"),
      ),
      l.name,
    );
});

test("how a level plays", () => {
  const keyed = project([plain([5, 5, 5], 0, { 0: start(), 1: { type: KEY } })]);
  assert.equal(playsAs(keyed), "Plays as an arcade level.");
  const keyless = project([plain([5, 5, 5], 0, { 0: start() })]);
  assert.equal(playsAs(keyless), "Plays as a bonus level since it has no key.");
  assert.equal(
    playsAs({ ...keyed, hidden: true }),
    "Plays as a hidden level, with the glass ball on half-seen blocks.",
  );
  assert.equal(
    playsAs({ ...keyless, hidden: true }),
    "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks.",
  );
  assert.equal(playsAs({ ...keyless, simon: true }), "Plays as a Simon room.");
  assert.equal(playsAs({ ...keyed, simon: true }), "Plays as an arcade level.");
  assert.equal(
    playsAs({ ...keyless, simon: true, hidden: true }),
    "Plays as a hidden Simon room, with the glass ball on half-seen blocks.",
  );
  assert.equal(
    playsAs({ ...keyed, simon: true, hidden: true }),
    "Plays as a hidden level, with the glass ball on half-seen blocks.",
  );
  assert.equal(playsRoom({ ...keyless, simon: true }), true);
  assert.equal(playsRoom(keyless), false);
  assert.equal(playsRoom({ ...keyed, simon: true }), false);
  assert.deepEqual(
    validate(keyed, HIDES, NAMES).map((f) => f.level),
    ["warning"],
  );
  assert.equal(validate(keyed, HIDES, NAMES)[0].at, null);
});
