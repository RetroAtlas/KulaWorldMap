import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { frameAt, phasesOf, phaseField, pose, orbit } from "../../public/js/motion.js";

const table = objects.motion;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const still = [0, 0, 0];
const marker = (f6 = 0) => ({ f: [0, f6, 1, 0, -1, -1, -1, 386, 1, -1, -1] });

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

test("a bob is a sine of its reach along the vertical, a lift stays on the normal", () => {
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
  for (const f6 of [0, 1, 2, 3]) {
    const program = s.cycle[f6];
    assert.equal(pose(table, s, marker(f6), 5.7, still).frame, program[5]);
    assert.equal(pose(table, s, marker(f6), program.length + 5, still).frame, program[5]);
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
