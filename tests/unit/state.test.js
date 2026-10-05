import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import {
  SIDE,
  ZOOM_MIN,
  FIT_MARGIN,
  FIT_ZOOM_MAX,
  state,
  camera,
  project,
  depth,
  facing,
  screen,
  retarget,
  pivot,
  fitLevel,
  levelCentre,
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
  assert.ok(facing([0, 0, -1]), "looking down, the top face shows");
  assert.ok(!facing([0, 0, 1]), "and the underside does not");
});

test("projection is linear, which is what makes a face a parallelogram", () => {
  Object.assign(state.cam, { yaw: 31, pitch: 17 });
  const a = project(3, 5, 7);
  const b = project(11, 2, 1);
  const sum = project(14, 7, 8);
  for (const i of [0, 1]) near(a[i] + b[i], sum[i]);
});

test("moving the orbit target moves nothing on screen", () => {
  Object.assign(state.cam, { yaw: 30, pitch: 20, zoom: 1.5, panX: 0.3, panY: -0.2 });
  state.target = [17, 17, 17];
  state.view = { w: 800, h: 600, dpr: 1 };
  const before = screen(5, 6, 7);
  retarget([3.5, 4.5, 5.5]);
  assert.deepEqual(state.target, [3.5, 4.5, 5.5]);
  const after = screen(5, 6, 7);
  near(after[0], before[0], 1e-9);
  near(after[1], before[1], 1e-9);
});

test("the orbit target lands in the middle of the view", () => {
  Object.assign(state.cam, { yaw: 45, pitch: 35, zoom: 1, panX: 0, panY: 0 });
  state.target = [17, 17, 17];
  state.view = { w: 800, h: 600, dpr: 1 };
  const [x, y] = screen(17, 17, 17);
  near(x, 400, 1e-6);
  near(y, 300, 1e-6);
});

test("the view turns about a selected cell only while it is centred on that cell", () => {
  Object.assign(state.cam, { yaw: 30, pitch: 20, zoom: 1, panX: 0, panY: 0 });
  state.view = { w: 800, h: 600, dpr: 1 };
  state.lvl = { min: [10, 10, 15], max: [20, 20, 17] };
  const centre = [15.5, 15.5, 16.5];

  state.target = [12.5, 13.5, 16.5];
  state.selected = { x: 12, y: 13, z: 16 };
  pivot();
  assert.deepEqual(state.target, [12.5, 13.5, 16.5]);

  state.selected = { x: 11, y: 13, z: 16 };
  const before = screen(4, 5, 6);
  pivot();
  assert.deepEqual(state.target, centre);
  near(screen(4, 5, 6)[0], before[0]);
  near(screen(4, 5, 6)[1], before[1]);

  state.target = [12.5, 13.5, 16.5];
  state.selected = null;
  pivot();
  assert.deepEqual(state.target, centre);
  state.lvl = null;
});

test("a fitted level has every corner of every block inside the view, with the margin, at any turn", () => {
  state.view = { w: 800, h: 600, dpr: 1 };
  const m = FIT_MARGIN / 2;
  const edge = (v, size) => Math.min(v - m, size - m - v);
  for (const [yaw, pitch] of [
    [45, 35],
    [0, 0],
    [135, 50],
    [315, -30],
    [10, 84],
    [200, -84],
  ]) {
    Object.assign(state.cam, { yaw, pitch });
    for (const l of mapData.levels) {
      fitLevel(l);
      const where = `${l.name} at ${yaw},${pitch}`;
      assert.deepEqual(state.target, levelCentre(l), where);
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (let i = 0; i < l.cells.length; i += 4) {
        const [x, y, z] = l.cells.slice(i, i + 3);
        for (const dx of [0, 1])
          for (const dy of [0, 1])
            for (const dz of [0, 1]) {
              const [sx, sy] = screen(x + dx, y + dy, z + dz);
              x0 = Math.min(x0, sx);
              x1 = Math.max(x1, sx);
              y0 = Math.min(y0, sy);
              y1 = Math.max(y1, sy);
            }
      }
      const room = Math.min(edge(x0, 800), edge(x1, 800), edge(y0, 600), edge(y1, 600));
      assert.ok(room > -1e-6, `${where}: ${[x0, y0, x1, y1]}`);
      // the blocks reach the margin on one axis, unless the zoom stopped first
      const { zoom } = state.cam;
      if (zoom > ZOOM_MIN && zoom < FIT_ZOOM_MAX) assert.ok(room < 1e-6, `${where}: ${room}`);
      near(x0 - m, 800 - m - x1, 1e-6);
      near(y0 - m, 600 - m - y1, 1e-6);
    }
  }
});
