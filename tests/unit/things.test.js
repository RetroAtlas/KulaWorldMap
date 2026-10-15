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
} from "../../public/js/viewer/data.js";
import { thingDisc, ballsFor, ballsWith, restOf } from "../../public/js/viewer/draw/things.js";

setObjects(objects);
state.data = mapData;

const levelNamed = (name) => mapData.levels.find((l) => l.name === name);
const unit = modelUnit();
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
