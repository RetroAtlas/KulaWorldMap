import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIDE,
  state,
  camera,
  project,
  depth,
  facing,
  screen,
  cellKey,
} from "../../public/js/state.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("a cell key is the lattice index the game walks", () => {
  assert.equal(cellKey(0, 0, 0), 0);
  assert.equal(cellKey(0, 0, 1), 1);
  assert.equal(cellKey(0, 1, 0), SIDE);
  assert.equal(cellKey(1, 0, 0), SIDE * SIDE);
  const keys = new Set();
  for (let x = 0; x < SIDE; x++)
    for (let y = 0; y < SIDE; y++) for (let z = 0; z < SIDE; z++) keys.add(cellKey(x, y, z));
  assert.equal(keys.size, SIDE ** 3);
});

test("the camera basis is orthonormal at any yaw and pitch", () => {
  for (const [yaw, pitch] of [
    [0, 0],
    [45, 35],
    [-137, 84],
    [212, -84],
  ]) {
    Object.assign(state.cam, { yaw, pitch });
    const { right, up, toward } = camera();
    for (const v of [right, up, toward]) near(Math.hypot(...v), 1);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    near(dot(right, up), 0);
    near(dot(right, toward), 0);
    near(dot(up, toward), 0);
  }
});

test("depth orders a face's own side of the lattice toward the camera", () => {
  Object.assign(state.cam, { yaw: 45, pitch: 35 });
  const { toward } = camera();
  const far = [17 - toward[0], 17 - toward[1], 17 - toward[2]];
  assert.ok(depth(...far) > depth(17, 17, 17));
});

test("a face is drawn when its normal turns toward the camera", () => {
  Object.assign(state.cam, { yaw: 0, pitch: 90 });
  assert.ok(facing([0, 0, 1]), "looking down, the top face shows");
  assert.ok(!facing([0, 0, -1]), "and the bottom does not");
});

test("projection is linear, which is what makes a face a parallelogram", () => {
  Object.assign(state.cam, { yaw: 31, pitch: 17 });
  const a = project(3, 5, 7);
  const b = project(11, 2, 1);
  const sum = project(14, 7, 8);
  for (const i of [0, 1]) near(a[i] + b[i], sum[i]);
});

test("the orbit target lands in the middle of the view", () => {
  Object.assign(state.cam, { yaw: 45, pitch: 35, zoom: 1, panX: 0, panY: 0 });
  state.target = [17, 17, 17];
  state.view = { w: 800, h: 600, dpr: 1 };
  const [x, y] = screen(17, 17, 17);
  near(x, 400, 1e-6);
  near(y, 300, 1e-6);
});
