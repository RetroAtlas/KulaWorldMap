import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
import { state, screen } from "../../public/js/viewer/state.js";
import {
  setObjects,
  startsOf,
  markerModel,
  motionOf,
  modelUnit,
  TANGENT,
} from "../../public/js/viewer/data.js";
import { spin, times, faceAxes } from "../../public/js/viewer/motion.js";
import {
  thingDisc,
  ballsFor,
  ballsWith,
  restOf,
  squashed,
  shadowStrength,
} from "../../public/js/viewer/draw/things.js";

setObjects(objects);
state.data = mapData;

const levelNamed = (name) => mapData.levels.find((l) => l.name === name);
const unit = modelUnit();
const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lifted = (c, face, by) =>
  [c.x, c.y, c.z].map((v, i) => v + 0.5 + FACE_NORMAL[face][i] * (0.5 + by));

test("a thing with no entry of its own stands its reach below its origin off the face, and its disc with it", () => {
  const l = levelNamed("LEVEL 1");
  const [m] = startsOf(l);
  const model = markerModel(m, l);
  assert.equal(motionOf(m).entry, undefined);
  const reach = -model.box[0][1] * unit;
  const rest = restOf(motionOf(m), model, unit);
  assert.ok(rest > reach && rest < reach + 0.05, `${rest}`);
  const [x, y, r] = thingDisc(m, m, l);
  assert.deepEqual([x, y], screen(...lifted(m, m.face, rest)));
  assert.ok(r > 0);
});

test("a thing the game keeps an entry for stands where the entry puts it", () => {
  const l = levelNamed("LEVEL 1");
  const model = markerModel(startsOf(l)[0], l);
  const wheel = objects.motion.types[51];
  assert.equal(restOf(wheel, model, unit), wheel.entry.stand * unit);
});

test("a module may stand its ball's points in place of the level's starts, and null leaves them", () => {
  const l = levelNamed("LEVEL 1");
  const half = 0.5 / unit;
  const starts = startsOf(l).map((s) =>
    [s.x, s.y, s.z].map((v, i) => (v + 0.5) / unit + FACE_NORMAL[s.face][i] * half),
  );
  assert.ok(starts.length > 0);
  assert.deepEqual(ballsFor(l, 0), starts);
  const asked = [];
  ballsWith((level, face) => {
    asked.push([level, face]);
    return [[1, 2, 3]];
  });
  assert.deepEqual(ballsFor(l, 2), [[1, 2, 3]]);
  assert.deepEqual(asked, [[l, 2]]);
  ballsWith(() => null);
  assert.deepEqual(ballsFor(l, 0), starts);
  // the balls stood on the pointed-at blocks come after either
  state.hover = { x: 1, y: 2, z: 3, key: 0 };
  ballsWith(() => [[9, 9, 9]]);
  const [own, pointed] = ballsFor(l, 0);
  assert.deepEqual(own, [9, 9, 9]);
  assert.deepEqual(pointed, [1.5 / unit, 2.5 / unit, 3.5 / unit - half]);
  state.hover = null;
  ballsWith(null);
  assert.deepEqual(ballsFor(l, 0), starts);
});

test("the ball's shadow is full at rest, fades as the ball rises and is gone a block up, and the corkscrew's thins by its bounce", () => {
  const ball = objects.motion.types[30].shadow;
  assert.equal(shadowStrength(ball, 0, 100), 128);
  assert.equal(shadowStrength(ball, 0, 306), 64);
  assert.equal(shadowStrength(ball, 0, 512), 0);
  assert.equal(shadowStrength(objects.motion.types[56].shadow, 1, 0), 80);
  assert.equal(shadowStrength(objects.motion.types[50].shadow, 0, 0), 128);
});

test("a squash lies along the face however the body has rolled, and at rest as the vertices were squashed", () => {
  const face = faceAxes(FACE_NORMAL[0], TANGENT[0]);
  const up = FACE_NORMAL[0];
  const wide = 1.05;
  const tall = 0.9;
  // a quarter roll about the across axis turns the model's forward out of
  // the face, where the body is short, not wide
  const rolled = times(squashed(face, wide, tall), spin("xyz", [0.25, 0, 0]));
  const forward = [0, 1, 2].map((i) => rolled[i][1]);
  near(Math.abs(dot(forward, up)), tall);
  near(Math.hypot(...forward), tall);
  const across = [0, 1, 2].map((i) => rolled[i][0]);
  near(Math.hypot(...across), wide);
  near(dot(across, up), 0);
  // the half turn the ball takes ahead of its spin leaves the squash where
  // the vertices had it
  const before = spin("xyz", [0.5, 0, 0]);
  const laid = times(face, before);
  const rest = times(squashed(face, wide, tall), before);
  for (const [x, y, z] of [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.3, -0.4, 0.5],
  ]) {
    const was = laid.map((row) => row[0] * x * wide + row[1] * y * wide + row[2] * z * tall);
    const now = rest.map((row) => row[0] * x + row[1] * y + row[2] * z);
    was.forEach((v, i) => near(v, now[i], 1e-15));
  }
});
