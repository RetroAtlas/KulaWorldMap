import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
import { TANGENT, layHeading } from "../../public/js/viewer/data.js";
import {
  byLight,
  spin,
  faceAxes,
  frameAt,
  phasesOf,
  phaseField,
  pose,
  orbit,
  blockPhase,
  press,
  inReach,
  lightOn,
  glow,
  cornersLit,
  glowing,
  glintSteps,
  glints,
  lightShare,
} from "../../public/js/viewer/motion.js";

const table = objects.motion;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const still = [0, 0, 0];
const marker = (f3 = 0) => ({ f: [0, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1] });

test("a light scales each channel by its own in 4096ths, rounding down", () => {
  assert.deepEqual(byLight([100, 201, 255], [4096, 2048, 8192]), [100, 100, 510]);
  assert.deepEqual(byLight([4096, 4096, 4096], [6144, 6144, 5120]), [6144, 6144, 5120]);
});

test("a thing's axes lie on its face as the game's own matrix lays them, with no mirror in them", () => {
  // the matrices 0x80039ec0 builds for a thing facing the way the face's first tangent runs
  const game = [
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
    [
      [1, 0, 0],
      [0, 0, 1],
      [0, -1, 0],
    ],
    [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [0, 1, 0],
      [1, 0, 0],
    ],
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ];
  game.forEach((rows, face) =>
    assert.deepEqual(
      faceAxes(FACE_NORMAL[face], TANGENT[face]).map((r) => r.map((v) => v + 0)),
      rows,
      `face ${face}`,
    ),
  );
});

test("a facing turns a thing's axes a quarter at a step, from y to y × z, as the game's matrix does", () => {
  // 0x80039ec0's matrices for a thing on the top whose f2 is 2, 3 and 4
  const game = {
    2: [
      [0, -1, 0],
      [-1, 0, 0],
      [0, 0, -1],
    ],
    3: [
      [1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ],
    4: [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ],
  };
  // the corkscrew carries no facing for the panel to name, and is turned all the same
  for (const [f2, rows] of Object.entries(game)) {
    const corkscrew = { face: 0, type: 56, f: [Number(f2), 0, 0] };
    const laid = faceAxes(FACE_NORMAL[0], layHeading(corkscrew)).map((r) => r.map((v) => v + 0));
    assert.deepEqual(laid, rows, `f2 ${f2}`);
  }
});

test("a spin is the product the routine for its type makes, about z first or about z last", () => {
  // what 0x80060a38 and 0x80060cc8 build from the angles 300, 700 and 1100
  const angles = [300, 700, 1100].map((v) => v / 4096);
  const routines = {
    xyz: [
      [-0.055, -0.474, 0.879],
      [0.844, -0.492, -0.212],
      [0.532, 0.731, 0.427],
    ],
    zyx: [
      [-0.055, -0.935, 0.349],
      [0.473, 0.283, 0.833],
      [-0.879, 0.212, 0.427],
    ],
  };
  for (const [order, rows] of Object.entries(routines))
    spin(order, angles).forEach((row, r) => row.forEach((v, c) => near(v, rows[r][c], 0.002)));
});

test("a frame is a sixtieth of a second", () => {
  near(frameAt(table, 1000), 60);
  near(frameAt(table, 250), 15);
});

test("a thing the game starts at random starts the same way on every visit", () => {
  const a = phasesOf(table, 3, 4, 5, 0);
  assert.deepEqual(a, phasesOf(table, 3, 4, 5, 0));
  assert.equal(a.length, 3);
  for (const v of a) assert.ok(Number.isInteger(v) && v >= 0 && v < table.turn);
  assert.notDeepEqual(a, phasesOf(table, 3, 4, 5, 1));
  assert.notDeepEqual(a, phasesOf(table, 4, 4, 5, 0));
});

test("a turn is its rate in 4096ths of a turn a frame", () => {
  const coin = table.types[37];
  const p = pose(table, coin, marker(), 4096 / 75, still);
  near(p.about[1], -1);
  near(p.about[0], 0);
  near(p.about[2], 0);
  const gem = pose(table, table.types[36], marker(), 100, [1000, 0, 0]);
  near(gem.about[1], (1000 + 29 * 100) / 4096);
});

test("a bob is a sine of its reach, and a lift is the corkscrew's alone", () => {
  const coin = table.types[37];
  near(pose(table, coin, marker(), 0, still).bob, 0);
  near(pose(table, coin, marker(), 1024 / 58, still).bob, -20, 1e-6);
  near(pose(table, coin, marker(), 3072 / 58, still).bob, 20, 1e-6);
  assert.equal(pose(table, coin, marker(), 7, still).lift, 0);
});

test("a fruit tilts across the face and a pill flips along it while both turn", () => {
  const fruit = pose(table, table.types[46], marker(), 1024 / 66, [0, 0, 0]);
  near(Math.abs(fruit.about[0]), 150 / 4096, 1e-6);
  near(fruit.about[1], (20 * 1024) / 66 / 4096);
  near(fruit.about[2], 0);
  const pill = pose(table, table.types[32], marker(), 10, [0, 0, 0]);
  near(pill.about[2], (66 * 10) / 4096);
  near(pill.about[1], (20 * 10) / 4096);
  near(pill.about[0], 0);
});

test("the hourglass goes over and back, half a turn either way about a lean", () => {
  const h = table.types[35];
  near(pose(table, h, marker(), 0, still).about[2], 30 / 4096);
  near(pose(table, h, marker(), 1024 / 26, still).about[2], (2048 + 30) / 4096, 1e-6);
  near(pose(table, h, marker(), 3072 / 26, still).about[2], (-2048 + 30) / 4096, 1e-6);
});

test("the corkscrew rises a half sine from its phase and spins nearly three turns up, against its cosine", () => {
  const c = table.types[56];
  // the game takes the step from its angle
  assert.equal(c.bounce.spin, -400);
  assert.equal(phaseField(marker(3)), 3);
  const down = pose(table, c, marker(3), 0, still);
  near(down.lift, 0);
  near(down.about[1], 0);
  const top = pose(table, c, marker(3), 1024 / 23, still);
  near(top.lift, 400, 1e-6);
  near(top.about[1], -400 / (2 * Math.PI * 23), 1e-6);
  near(pose(table, c, marker(0), 0, still).lift, 400, 1e-6);
  near(
    pose(table, c, marker(3), 2048 / 23 + 1, still).lift,
    pose(table, c, marker(3), 1, still).lift,
  );
});

test("the moving spikes show the frame their phase's program gives", () => {
  const s = table.types[11];
  for (const f3 of [0, 1, 2, 3]) {
    const program = s.cycle[f3];
    assert.equal(pose(table, s, marker(f3), 5.7, still).frame, program[5]);
    assert.equal(pose(table, s, marker(f3), program.length + 5, still).frame, program[5]);
  }
  assert.notEqual(
    pose(table, s, marker(0), 70, still).frame,
    pose(table, s, marker(1), 70, still).frame,
  );
});

test("the moving spikes are deadly from two frames before they rise until eleven frames of the retraction remain", () => {
  const s = table.types[11];
  assert.equal(s.harm.flag, 1);
  for (const f3 of [0, 1, 2, 3]) {
    const program = s.cycle[f3];
    const deadly = s.deadly[f3];
    assert.equal(deadly.length, program.length);
    const rise = program.length + program.findIndex((f, k) => f === 6 && program[k - 1] === 0);
    const thrice = [...deadly, ...deadly, ...deadly];
    assert.deepEqual(thrice.slice(rise - 3, rise + 141), [
      false,
      ...Array(68).fill(true),
      ...Array(75).fill(false),
    ]);
    assert.deepEqual([...program, ...program, ...program].slice(rise + 65, rise + 67), [8, 8]);
  }
  assert.deepEqual(
    s.deadly.map((d) => [d.indexOf(true), d.indexOf(false)]),
    [
      [62, 0],
      [27, 0],
      [0, 58],
      [0, 23],
    ],
  );
});

test("the catalogue star circles fast in the brown form and slowly in the green", () => {
  const e = table.types[42];
  const key = "test";
  const first = orbit(table, e, key, 0, still);
  assert.equal(first.form, 0);
  near(first.offset[1], 100, 1e-6);
  const brown = orbit(table, e, key, 10, still);
  assert.equal(brown.form, 0);
  const later = orbit(table, e, key, 200, still);
  assert.equal(later.form, 1);
  const frames = Math.ceil(2049 / 13);
  near(orbit(table, e, key, frames, still).form, 1);
  const a = orbit(table, e, key, 300, still);
  const b = orbit(table, e, key, 301, still);
  for (const v of [a, b]) near(Math.hypot(...v.offset), 100, 1e-6);
});

test("a vanishing block is where its phase's cycle puts it, solid with its brightness", () => {
  const e = table.kinds[7];
  const record = (f2) => ({ f: [f2, -1, -1] });
  for (const f2 of [0, 1, 2, 3]) {
    const gone = e.cycle[f2].indexOf(0);
    assert.equal(blockPhase(e, record(f2), gone + 0.9).state, 0);
    const solid = e.cycle[f2].indexOf(3);
    assert.deepEqual(blockPhase(e, record(f2), solid), { state: 3, level: 128 });
    assert.deepEqual(blockPhase(e, record(f2), solid + 224), { state: 3, level: 128 });
  }
  assert.notEqual(blockPhase(e, record(0), 100).state, blockPhase(e, record(2), 100).state);
});

test("an exit turns at its open rate for the frames it has stood open, and on from where it was", () => {
  const exit = table.types[7];
  const at = (frame, open) => pose(table, exit, marker(), frame, [1000, 0, 0], 0, open).about[1];
  near(at(300, 0), (1000 - 20 * 300) / 4096);
  near(at(300, 200), (1000 - 20 * 100 - 45 * 200) / 4096);
  for (const open of [0, 0.5, 1]) near(at(100 + open, open) - at(100, 0), (-45 * open) / 4096);
});

test("the ball breathes, wider and shorter by turns, faster the less time the level gives", () => {
  const ball = table.types[30];
  const at = (frame, time) => pose(table, ball, marker(), frame, still, time).squash;
  near(at(0, 99), 0);
  const step = 40 + Math.trunc((6000 - 50 * 99) / 40);
  assert.equal(step, 66);
  near(at(1024 / step, 99), 200 / 4096, 1e-6);
  near(at(3072 / step, 99), -200 / 4096, 1e-6);
  near(at(1024 / (40 + 150), 0), 200 / 4096, 1e-6);
  assert.equal(pose(table, ball, marker(), 5, still, 99).about.join(), "0,0,0");
});

test("a boost button sinks a sixteenth a frame to flat, and springs back four at a time", () => {
  const e = table.types[10];
  const heights = (key, from, to, pressed) => {
    const out = [];
    for (let f = from; f <= to; f++) out.push(press(e, key, f, pressed).height);
    return out;
  };
  press(e, "sink", 0, false);
  const down = heights("sink", 1, 18, true);
  near(down[0], 15 / 16);
  near(down[15], 0);
  near(down[17], 0, 1e-12);
  assert.equal(press(e, "sink", 18, true).moving, false, "flat, it stays");
  assert.deepEqual(heights("sink", 19, 23, false), [4 / 16, 8 / 16, 12 / 16, 1, 1]);
  assert.equal(press(e, "sink", 23, false).moving, false);
});

test("a boost button risen from part way overshoots for one frame, then stands at full", () => {
  const e = table.types[10];
  press(e, "part", 0, false);
  for (let f = 1; f <= 3; f++) press(e, "part", f, true);
  const up = [];
  for (let f = 4; f <= 6; f++) up.push(press(e, "part", f, false).height);
  assert.deepEqual(up, [17 / 16, 1, 1]);
});

test("a press after a still spell starts from the frame it is seen", () => {
  const e = table.types[10];
  press(e, "late", 0, false);
  near(press(e, "late", 600, true).height, 15 / 16);
});

test("a ball is in a boost button's reach on its block or a block sharing a face", () => {
  const e = table.types[10];
  const button = [0, 0, -256];
  assert.ok(inReach(e, [0, 0, -256], button), "on it");
  assert.ok(inReach(e, [512, 0, -256], button), "on the block beside");
  assert.ok(!inReach(e, [512, 512, -256], button), "not on the one across a corner");
  assert.ok(!inReach(e, [512, 0, -256], [0, 0, 256]), "nor on the block beside, it being under");
});

const light = objects.motion.kinds[3].light;
const plain = { ...light, turned: false };
// the top face of the block at (x, 0, 5), and where the ball standing on the
// block at (0, 0, 5) touches it
const top = (x) =>
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([dx, dy]) => [(x + dx) * 512, dy * 512, 5 * 512]);
const ball = [256, 256, 5 * 512];

test("an invisible corner is full within 350 of the ball and fades to nothing at 512", () => {
  assert.equal(glow(plain, 350), 128);
  assert.equal(glow(plain, 351), 128, "the fade's fixed point takes nothing off a unit past");
  assert.equal(glow(plain, 450), 49);
  assert.equal(glow(plain, 512), 1);
  assert.equal(glow(plain, 513), 0);
});

test("a corner is measured by the game's own root, which runs short between powers of two", () => {
  // 418 squared is past 2^17, whose root the game rounds to 362, and it draws
  // a straight line from there to 512, which reaches 411
  assert.deepEqual(cornersLit(plain, [[0, 0, 0]], [0, 0, 0], [[418, 0, 0]], 512), [
    glow(plain, 411),
  ]);
  assert.notEqual(glow(plain, 411), glow(plain, 418));
  const close = [
    [10, 0, 0],
    [0, 0, 0],
  ];
  assert.deepEqual(
    cornersLit(plain, [[0, 0, 0]], [0, 0, 0], close, 512),
    [128, 128],
    "too near for a row",
  );
});

test("the ball lights the top it stands on and the near half of the next, and no further", () => {
  assert.deepEqual(cornersLit(plain, [ball], [0, 0, 5], top(0), 512), [119, 119, 119, 119]);
  assert.deepEqual(cornersLit(plain, [ball], [1, 0, 5], top(1), 512), [119, 0, 119, 0]);
  assert.equal(cornersLit(plain, [ball], [2, 0, 5], top(2), 512), null, "outside its box");
});

test("of the balls whose box holds a block, the nearest lights each corner", () => {
  const other = [256 + 2 * 512, 256, 5 * 512];
  assert.deepEqual(cornersLit(plain, [ball, other], [1, 0, 5], top(1), 512), [119, 119, 119, 119]);
  const far = [256 + 4 * 512, 256, 5 * 512];
  assert.equal(cornersLit(plain, [far], [1, 0, 5], top(1), 512), null);
});

test("the seven levels whose settings ask turn the light round, with distances of their own", () => {
  const turned = mapData.levels.filter((l) => lightOn(light, l).turned);
  assert.deepEqual(turned.map((l) => l.shown || l.name).sort(), [
    "HIDDEN 8",
    "LEVEL 106",
    "LEVEL 107",
    "LEVEL 108",
    "LEVEL 110",
    "LEVEL 111",
    "SIMON 9",
  ]);
  const round = lightOn(light, turned[0]);
  assert.deepEqual([round.near, round.far], [1280, 1792]);
  assert.deepEqual(cornersLit(round, [ball], [0, 0, 5], top(0), 512), [0, 0, 0, 0]);
  assert.deepEqual(cornersLit(round, [ball], [3, 0, 5], top(3), 512), [2, 126, 2, 126]);
  assert.equal(lightOn(light, mapData.levels[0]).near, 350);
});

test("a device on from the start is dark for 19 frames, then lit for 19 and dark for 19", () => {
  const every = table.glow.every;
  const lit = (frame) => glowing(every, true, [], frame);
  const frames = [0, 18, 19, 37, 38, 56, 57];
  assert.deepEqual(frames.map(lit), [false, false, true, true, false, false, true]);
  assert.equal(glowing(every, false, [], 100), false, "one that starts off never lights");
});

test("a device turned off loses its light at once and counts on from there once on again", () => {
  const every = table.glow.every;
  // on for frames 0 to 24, lit from 19; off from 25, dark from 26; on again
  // from 30, with the 6 frames it counted while lit to go on from
  const lit = (frame) => glowing(every, true, [25, 30], frame);
  assert.deepEqual([25, 26, 30, 42, 43].map(lit), [true, false, false, false, true]);
});

const glint = table.types[36].glint;
const cuts = [32, 32, 32].map((n) => Array(n).fill(18));
// a copy of the gem's entry glints from its generator's first value
const fresh = () => ({ ...glint });

test("a glinting facet is white on its second frame and back as it was on its 18th", () => {
  const seen = glintSteps(glint, [[0, 41, 101]]).map(([c]) => c);
  assert.equal(seen.length, 18);
  assert.deepEqual(seen.slice(0, 3), [
    [128, 169, 229],
    [254, 254, 254],
    [238, 238, 238],
  ]);
  // each channel stops at its own as the grey comes down to it, the strongest first
  assert.deepEqual(seen[11], [94, 94, 101]);
  assert.deepEqual(seen[15], [30, 41, 101]);
  assert.deepEqual(seen[17], [0, 41, 101]);
  // a channel past the top dips to it, and is its own again at the first fall
  assert.deepEqual(
    glintSteps(glint, [[0, 115, 255]]).map(([c]) => c[2]),
    [254, 254, ...Array(16).fill(255)],
  );
});

test("a glint lifts every corner it saves, and they fall only once all are at the top", () => {
  const seen = glintSteps(glint, [
    [0, 0, 0],
    [200, 200, 200],
  ]);
  assert.deepEqual(seen[0], [
    [128, 128, 128],
    [254, 254, 254],
  ]);
  assert.deepEqual(seen[2], [
    [238, 238, 238],
    [238, 238, 238],
  ]);
  assert.deepEqual(seen.at(-1), [
    [0, 0, 0],
    [200, 200, 200],
  ]);
  // a facet already white rises nowhere and holds its slot a frame more
  assert.deepEqual(glintSteps(glint, [[254, 254, 254]]), [[[254, 254, 254]], [[254, 254, 254]]]);
});

test("from the generator's first value the blue and the red cut start a glint on the first frame", () => {
  assert.deepEqual(glints(fresh(), cuts, 0), [[{ k: 15, at: 0 }], [], [{ k: 28, at: 0 }]]);
});

test("a frame draws once for every cut at every level of detail, the first level's three first", () => {
  const draws = [];
  let state = glint.dice.seed;
  for (let i = 0; i < 9 * 60; i++)
    draws.push((state = (Math.imul(state, glint.dice.times) + glint.dice.plus) >>> 0));
  const e = fresh();
  for (let f = 0; f < 60; f++) {
    const seen = glints(e, cuts, f);
    for (let c = 0; c < 3; c++) {
      const draw = draws[9 * f + c];
      const k = ((draw & 0xffff) * 32) >>> 16;
      const started = seen[c].find((g) => g.at === f);
      if (((draw >>> 16) * 3) >>> 16 !== 0) assert.equal(started, undefined);
      else if (started) assert.equal(started.k, k);
      else assert.ok(seen[c].some((g) => g.k === k) || seen[c].length === glint.slots);
    }
  }
});

test("a cut holds sixteen glints at most, a facet one at a time, each for its 18 frames", () => {
  const e = fresh();
  let shown = 0;
  const frames = 60 * 600;
  for (let f = 0; f < frames; f++) {
    for (const live of glints(e, cuts, f)) {
      assert.ok(live.length <= glint.slots);
      assert.equal(new Set(live.map((g) => g.k)).size, live.length);
      for (const g of live) assert.ok(f - g.at >= 0 && f - g.at < 18);
      // the 18th frame shows the facet as it was
      shown += live.filter((g) => f - g.at < 17).length;
    }
  }
  const mean = shown / frames / 3;
  assert.ok(mean > 4.5 && mean < 5.5, `about five of 32 glint at a time, not ${mean}`);
});

test("the glints are the same whatever frames they are drawn on, and start afresh when the frame goes back", () => {
  const stepped = fresh();
  for (let f = 0; f < 300; f++) glints(stepped, cuts, f);
  const at300 = structuredClone(glints(stepped, cuts, 300));
  assert.deepEqual(glints(fresh(), cuts, 300), at300);
  assert.deepEqual(glints(stepped, cuts, 0), glints(fresh(), cuts, 0));
});

test("the ball rolls a block from rest in 18 frames, at 33 a frame from the sixth", () => {
  const { rolling: roll } = table.types[30];
  const speeds = [];
  let speed = 0;
  let gone = 0;
  while (gone < 512) {
    speed = Math.min(speed + roll.gain, roll.top);
    speeds.push(speed);
    gone += speed;
  }
  assert.equal(speeds.length, 18);
  assert.deepEqual(speeds.slice(0, 7), [6, 12, 18, 24, 30, 33, 33]);
  assert.equal(roll.middle, 256);
  // rolling on, a block takes 15 or 16 frames by turns
  assert.ok(512 / roll.top > 15 && 512 / roll.top < 16);
});

test("round an edge the centre runs a quarter circle of the ball's radius in four frames", () => {
  const { wrap, rolling: roll } = table.types[30];
  assert.equal(wrap.arc.length, 4);
  let along = 0;
  let down = -roll.resume;
  for (const [n, h] of wrap.arc) {
    along += n;
    down += h;
    near(Math.hypot(along, down), roll.resume, 1.1);
  }
  assert.deepEqual([along, down], [roll.resume, 1]);
});

test("a turn shows 18 steps of 53 and snaps the 70 left on the 19th frame, and the face changes' ramps end the same way", () => {
  const { quarter: turn, wrap, climb } = table.types[30];
  const quarter = table.turn / 4;
  const shown = (ramp) => (ramp.frames - 1) * ramp.step;
  assert.equal(shown(turn), 954);
  assert.equal(quarter - shown(turn), 70);
  assert.equal(shown(wrap), 936);
  assert.equal(quarter - shown(wrap), 88);
  assert.equal(shown(climb), -960);
  assert.equal(-quarter - shown(climb), -64);
});

test("the fall, the landing's squash and the view's extra pitch ship their steps and marks", () => {
  const { fall, squash, look, spin } = table.types[30];
  assert.deepEqual(fall, {
    start: -10,
    hop: -30,
    gain: -5,
    top: -66,
    short: 180,
    wall: 409,
    behind: 103,
    hold: [411, 102],
    lost: [-2, 36],
  });
  // the squash rises for four frames and comes off by 90, 80 and on down to 20
  let word = 0;
  let step = squash.fall;
  const frames = [];
  for (let f = 0; f < squash.frames; f++) frames.push((word += squash.rise));
  while (word > 0) {
    step = Math.max(step - squash.ease, squash.least);
    frames.push((word = Math.max(word - step, 0)));
  }
  assert.equal(frames[3], 748);
  assert.deepEqual(frames.slice(4, 7), [658, 578, 508]);
  assert.equal(frames.length, 28);
  assert.deepEqual(look, {
    from: 3,
    to: 32,
    near: 550,
    far: 650,
    least: 10,
    back: 18,
    held: 21,
    pitch: 250,
    rows: 10,
  });
  assert.equal(spin, -5);
});

test("the jump's table holds a count of 33 and 32 rows that rise to 458 and reach 1023 along, 30 of them run", () => {
  const { jump } = objects;
  const rule = table.types[30].jump;
  assert.equal(jump.count, 33);
  assert.equal(jump.rows.length, 32);
  assert.deepEqual(jump.rows[0], [0, 0, -47]);
  assert.deepEqual(jump.rows.at(-1), [-24, 0, -1023]);
  const heights = jump.rows.map((r) => r[0]);
  assert.equal(Math.max(...heights), 458);
  assert.deepEqual([heights.indexOf(458), heights.lastIndexOf(458)], [14, 15]);
  assert.ok(jump.rows.every((r) => r[1] === 0 && r[2] < 0));
  // the count falls by one a frame and from one past the skip to nothing
  assert.equal(jump.count - rule.skip - 1, 30);
  assert.deepEqual(
    [rule.speed, rule.snap, rule.far, rule.long, rule.scale, rule.catch, rule.wall],
    [33, 1024, 1536, 3, [3, 2], 12, 412],
  );
});

test("a ball's corner shows 89 of 256 of its colour facing away from the light, and all of it facing it", () => {
  const light = table.types[30].light;
  assert.equal(lightShare(light, 0), 89);
  assert.equal(lightShare(light, 2048), 175);
  assert.equal(lightShare(light, 4096), 255);
  // full from nearly square on, past which the channel stands
  assert.equal(lightShare(light, 3912), 255);
  assert.equal(lightShare(light, 3911), 254);
});

// The ball's centre rests a radius off its face, 356 from the block's centre.
const centre = table.types[30].rolling.resume + 256;
const within = (take, bob) =>
  Math.sqrt(
    take.reach ** 2 + table.types[30].rolling.resume ** 2 - (take.stand + bob - centre) ** 2,
  );

test("a pickup is taken within its reach of the ball's centre, which stands short of its middle", () => {
  const take = (t) => table.types[t].take;
  assert.deepEqual(take(31), { reach: 150, stand: 386, points: 1000 });
  assert.deepEqual(take(37), { reach: 160, stand: 406, points: [750, 500, 250] });
  assert.deepEqual(take(36), { reach: 160, stand: [386, 436, 436], points: 2975 });
  assert.deepEqual(take(42), { reach: 160, stand: 416, points: 1550 });
  for (const t of [43, 44, 45, 46, 47])
    assert.deepEqual(take(t), { reach: 180, stand: 386, points: 2500 });
  for (const t of [32, 33, 34]) assert.deepEqual(take(t), { reach: 160, stand: 386 });
  assert.equal(centre, 356);
  assert.ok(within(take(37), 30) > 170 && within(take(37), -10) < 185);
  assert.ok(within(take(31), 30) >= 170 && within(take(31), -10) < 180);
  assert.ok(within(take(43), 30) > 196 && within(take(43), -10) < 206);
  assert.equal(Object.keys(table.types).filter((t) => table.types[t].take).length, 14);
});

test("the points the site counts are the ones the contact walk adds", () => {
  const types = annotations.types;
  for (const t of [31, 36, 38, 42, 43, 44, 45, 46, 47])
    assert.equal(types[t].points, table.types[t].take.points, `type ${t}`);
  for (const tier of [0, 1, 2])
    assert.equal(types[37].variants[tier].points, table.types[37].take.points[tier]);
  const h = table.types[35].take;
  assert.equal(types[35].points, h.points * Math.floor(h.clock.from / h.clock.second));
  assert.equal(annotations.kinds[6].points, table.kinds[6].points);
  for (const t of [32, 33, 34]) assert.equal(types[t].points, undefined);
});

test("the hourglass turns the clock round and scores ten a whole second of what it leaves", () => {
  const h = table.types[35].take;
  const taken = (ticks) => {
    const left = h.clock.from - ticks;
    return { left, points: h.points * Math.floor(left / h.clock.second) };
  };
  assert.deepEqual(taken(99 * 50), { left: 1049, points: 200 });
  assert.deepEqual(taken(50), { left: 5949, points: 1180 });
  assert.equal(taken(49).points, 1190);
  assert.equal(taken(1).points, 1190);
});

test("a pill's word runs down as the game runs it, and the bouncy pill's never", () => {
  const lasts = (t) => table.types[t].lasts;
  assert.deepEqual(lasts(32), { word: 360, step: 2, ticks: 4 });
  // the word is tested before it is counted down, so the frame it reaches nothing counts
  assert.equal(lasts(32).word / lasts(32).step + 1, 181);
  assert.equal((lasts(32).word / lasts(32).step + 1) * lasts(32).ticks, 724);
  assert.deepEqual(lasts(34), { word: 840, step: 1 });
  assert.deepEqual(lasts(33), { word: 840, hold: 839 });
  assert.deepEqual(lasts(38), { word: 840, step: 1, blink: { times: 21, frames: 9 } });
  assert.equal(lasts(38).blink.times * lasts(38).blink.frames, 189);
  assert.deepEqual(
    Object.keys(table.types).filter((t) => table.types[t].lasts),
    ["32", "33", "34", "38"],
  );
});

test("the exits are shut by the loader and opened by the last key", () => {
  assert.deepEqual(table.types[7].shut, { f3: 1 });
  assert.deepEqual(table.types[7].opened, { f3: 0, f4: 1 });
  assert.deepEqual(table.types[26].shut, { f4: 0 });
  assert.deepEqual(table.types[26].opened, { f4: 1 });
});

test("a teleporter sends on the sixteenth frame within 89 of its middle, and a switch throws within 59", () => {
  const { send } = table.types[5];
  assert.deepEqual(send, { wait: 15, band: [167, 345], hold: 15, rearm: [156, 356] });
  let count = -1;
  let frames = 0;
  do {
    if (count < 0) count = send.wait;
    count -= 1;
    frames += 1;
  } while (count >= 0);
  assert.equal(frames, 16);
  assert.deepEqual(table.types[9], { throw: { band: [197, 315], rearm: [156, 356] } });
  for (const [lo, hi] of [send.band, send.rearm, table.types[9].throw.band])
    assert.equal(lo + hi, 512);
});

test("the clock ticks once a frame, fifty to a shown second, and a level ends in a code", () => {
  const { play } = table;
  assert.deepEqual(play.clock, { tick: 1, second: 50, face: 8, out: -2 });
  assert.equal(play.clock.second, table.types[30].breathe.tick);
  assert.deepEqual(play.ending, {
    exit: 1,
    bonus: 2,
    hidden: 3,
    spikes: -1,
    time: -2,
    lost: -3,
    fire: -4,
    captivator: -5,
    acid: -6,
    laser: -7,
    simon: -8,
  });
  assert.deepEqual(play.wait, {
    exit: 5,
    hidden: 5,
    bonus: 5,
    spikes: 10,
    fire: 25,
    captivator: 10,
    acid: 6,
    laser: 4,
    simon: 25,
  });
  assert.deepEqual(play.bonus, { block: 50, skips: 3 });
  assert.equal((99 * play.clock.second) / play.clock.tick / table.hz, 82.5);
});

test("a level opens with the pad dead for 19 frames and the hazards off for 18", () => {
  const { start } = table.play;
  let countdown = start.wait;
  let guard = 1;
  let padFrom = null;
  let hazardsFrom = null;
  for (let frame = 1; frame <= 40; frame++) {
    if (guard) guard += 1;
    if (guard === start.guard) guard = 0;
    if (countdown) countdown -= 1;
    if (padFrom === null && countdown === 0) padFrom = frame;
    if (hazardsFrom === null && guard === 0) hazardsFrom = frame;
  }
  assert.deepEqual([padFrom, hazardsFrom], [20, 19]);
});

test("a death costs 50 times the level's number, at most 5000", () => {
  const { points } = table.play;
  assert.deepEqual(points, { each: 50, most: 5000, levels: 15 });
  const penalty = (level) => Math.min(points.each * level, points.most);
  assert.equal(penalty(1), 50);
  assert.equal(penalty(99), 4950);
  assert.equal(penalty(100), 5000);
  assert.equal(penalty(150), 5000);
});

test("fire kills a standing ball on its 51st frame, and the captivators reach 212 and 127 units", () => {
  const { heat } = table.kinds[1];
  let frames = 0;
  for (let h = 0; h <= heat.limit; frames++) h += heat.burn;
  assert.equal(frames, 51);
  assert.equal(heat.land, 600);
  assert.equal(heat.cool, 15);
  assert.equal(table.kinds[4].melt.top, heat.limit);
  assert.equal(table.kinds[8].harm.heat, 1900);
  const reach = (t) => Math.floor(Math.sqrt(table.types[t].catch.square));
  assert.deepEqual([50, 51, 52, 53, 56].map(reach), [212, 212, 212, 127, 212]);
  assert.equal(table.types[11].harm.standing, table.play.wait.spikes - 1);
});

test("the ending's view swings every 341 frames, and the dying ball flashes every four", () => {
  const { view } = table.play;
  assert.equal(Math.floor(table.turn / view.swing), 341);
  assert.equal(Math.floor(table.turn / view.bonus.swing), 70);
  assert.deepEqual(view.angles, [-8, 3, 10]);
  assert.equal(table.turn / table.types[30].dying.flash, 4);
});

test("ice runs the cold 400, 440, 480 and back, and cools the heat ten times as fast as stone", () => {
  const ice = table.kinds[2];
  assert.equal(ice.chill / table.kinds[1].heat.cool, 10);
  let cold = 0;
  const seen = [];
  for (let frame = 0; frame < 30; frame++) {
    cold += ice.cold.gain;
    if (cold > ice.cold.over) cold = ice.cold.back;
    seen.push(cold);
  }
  assert.deepEqual(seen.slice(-6), [400, 440, 480, 400, 440, 480]);
  // off ice it wanes to nothing in 48 frames
  let frames = 0;
  while (cold > 0) {
    cold = Math.max(cold - ice.cold.wane, 0);
    frames++;
  }
  assert.equal(frames, 48);
});

test("a crumbling block is gone on the twentieth frame after it breaks, and holds a ball off its free edge", () => {
  const crumble = table.kinds[6];
  let size = crumble.size;
  let frames = 0;
  while (size >= 0) {
    size -= crumble.shrink;
    frames++;
  }
  assert.equal(frames, 20);
  // a block takes fewer frames than that at the roll's top speed
  assert.ok(Math.ceil(crumble.size / table.types[30].rolling.top) < frames);
  assert.deepEqual(crumble.edge, { hold: 301, back: 401, push: 40 });
  assert.ok(crumble.edge.hold > table.types[30].rolling.middle);
});

test("a platform lands the ball at its rest height, keeps it a block off and rumbles the pad", () => {
  const { ride } = table.kinds[5];
  assert.equal(ride.land, table.types[30].rolling.resume);
  assert.equal(ride.bias, 512);
  assert.equal(ride.rumble, 70);
});
