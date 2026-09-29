import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import {
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
} from "../../public/js/motion.js";

const table = objects.motion;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const still = [0, 0, 0];
const marker = (f3 = 0) => ({ f: [0, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1] });

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

test("the corkscrew rises a half sine from its phase and spins nearly three turns up", () => {
  const c = table.types[56];
  assert.equal(phaseField(marker(3)), 3);
  const down = pose(table, c, marker(3), 0, still);
  near(down.lift, 0);
  near(down.about[1], 0);
  const top = pose(table, c, marker(3), 1024 / 23, still);
  near(top.lift, 400, 1e-6);
  near(top.about[1], 400 / (2 * Math.PI * 23), 1e-6);
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
  assert.ok(inReach(e, [0, 0, -356], button), "on it");
  assert.ok(inReach(e, [512, 0, -356], button), "on the block beside");
  assert.ok(!inReach(e, [512, 512, -356], button), "not on the one across a corner");
  assert.ok(!inReach(e, [512, 0, -356], [0, 0, 256]), "nor on the block beside, it being under");
});

const light = objects.motion.kinds[3].light;
const plain = { ...light, turned: false };
// the top face of the block at (x, 0, 5), which the ball standing on the
// block at (0, 0, 5) has its middle 100 off
const top = (x) =>
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ].map(([dx, dy]) => [(x + dx) * 512, dy * 512, 5 * 512]);
const ball = [256, 256, 5 * 512 - 100];

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
  assert.deepEqual(cornersLit(plain, [ball], [0, 0, 5], top(0), 512), [110, 110, 110, 110]);
  assert.deepEqual(cornersLit(plain, [ball], [1, 0, 5], top(1), 512), [110, 0, 110, 0]);
  assert.equal(cornersLit(plain, [ball], [2, 0, 5], top(2), 512), null, "outside its box");
});

test("of the balls whose box holds a block, the nearest lights each corner", () => {
  const other = [256 + 2 * 512, 256, 5 * 512 - 100];
  assert.deepEqual(cornersLit(plain, [ball, other], [1, 0, 5], top(1), 512), [110, 110, 110, 110]);
  const far = [256 + 4 * 512, 256, 5 * 512 - 100];
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
  assert.deepEqual(cornersLit(round, [ball], [3, 0, 5], top(3), 512), [3, 127, 3, 127]);
  assert.equal(lightOn(light, mapData.levels[0]).near, 350);
});
