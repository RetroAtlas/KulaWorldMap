import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, PINNED_LINK, PINNED_CELLS } from "./fixtures.js";
import {
  ZOOM_MIN,
  FIT_MARGIN,
  FIT_ZOOM_MAX,
  state,
  basisAt,
  camera,
  frameOf,
  project,
  depth,
  facing,
  screen,
  retarget,
  pivot,
  fitLevel,
  levelCentre,
} from "../../public/js/viewer/state.js";
import { SIDE, cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { heading } from "../../public/js/viewer/travel.js";
import { parseHash } from "../../public/js/viewer/permalink.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** The pinned link's view on an 800 by 600 canvas, put back once the test is done. */
function pinnedView(t) {
  const was = structuredClone({ cam: state.cam, target: state.target, view: state.view });
  t.after(() => {
    Object.assign(state.cam, was.cam);
    state.target = was.target;
    state.view = was.view;
    state.frame = null;
  });
  const link = parseHash(PINNED_LINK);
  [state.cam.yaw, state.cam.pitch] = link.turn;
  [state.cam.panX, state.cam.panY] = link.pan;
  state.cam.zoom = link.zoom;
  state.target = link.target;
  state.view = { w: 800, h: 600, dpr: 1 };
}

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

test("under no frame the camera is the plain orbit, and the pinned link's cells stand where they always have", (t) => {
  pinnedView(t);
  state.frame = null;
  const { right, up, toward } = camera();
  assert.deepEqual({ right, up, toward }, basisAt(state.cam.yaw, state.cam.pitch));
  for (const [cell, at] of PINNED_CELLS) {
    const [x, y] = screen(...cell);
    assert.ok(Math.abs(x - at[0]) < 1e-3 && Math.abs(y - at[1]) < 1e-3, `${cell}: ${x},${y}`);
  }
});

test("a traveller's frame is a rotation on every face at every heading, and the world's own frame on the top face heading -y", () => {
  for (const [face, n] of FACE_NORMAL.entries())
    for (let k = 0; k < 4; k++) {
      const h = heading(face, k + 1).d;
      const f = frameOf(h, n);
      const [a, b, c] = [f.slice(0, 3), f.slice(3, 6), f.slice(6, 9)];
      const where = `face ${face} heading ${h}`;
      assert.deepEqual([dot(a, a), dot(b, b), dot(c, c)], [1, 1, 1], where);
      assert.deepEqual([dot(a, b), dot(b, c), dot(c, a)], [0, 0, 0], where);
      assert.equal(dot(a, cross(b, c)), 1, where);
    }
  assert.deepEqual(frameOf([0, -1, 0], FACE_NORMAL[0]), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test("the world's own frame draws as no frame does", (t) => {
  pinnedView(t);
  state.frame = null;
  const plain = PINNED_CELLS.map(([cell]) => screen(...cell));
  state.frame = frameOf([0, -1, 0], FACE_NORMAL[0]);
  PINNED_CELLS.forEach(([cell], i) => {
    const [x, y] = screen(...cell);
    near(x, plain[i][0]);
    near(y, plain[i][1]);
  });
});

test("under a frame the camera stands behind the traveller, its face's normal up the screen", (t) => {
  pinnedView(t);
  Object.assign(state.cam, { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 });
  state.target = [17, 17, 17];
  const h = [0, 1, 0];
  const n = [1, 0, 0];
  state.frame = frameOf(h, n);
  const { up, toward } = camera();
  for (const i of [0, 1, 2]) {
    near(up[i], n[i]);
    near(toward[i], -h[i]);
  }
  const [x0, y0] = screen(17, 17, 17);
  const [x1, y1] = screen(18, 17, 17);
  near(x1, x0);
  assert.ok(y1 < y0, "a step along the normal goes up the screen");
  state.cam.pitch = 22;
  const pitched = camera().toward;
  assert.ok(dot(pitched, h) < 0, "the camera stays behind the traveller");
  assert.ok(dot(pitched, n) > 0, "and looks down over it");
});

test("the camera follows the frame by its identity", (t) => {
  pinnedView(t);
  const f = frameOf([1, 0, 0], FACE_NORMAL[0]);
  state.frame = f;
  const first = camera();
  assert.equal(camera(), first);
  state.frame = [...f];
  const second = camera();
  assert.notEqual(second, first);
  assert.deepEqual([second.right, second.up, second.toward], [first.right, first.up, first.toward]);
  state.frame = null;
  assert.notEqual(camera(), second);
});

test("moving the orbit target moves nothing on screen under a frame either", (t) => {
  pinnedView(t);
  state.frame = frameOf([0, 0, 1], FACE_NORMAL[1]);
  const before = screen(5, 6, 7);
  retarget([3.5, 4.5, 5.5]);
  assert.deepEqual(state.target, [3.5, 4.5, 5.5]);
  const after = screen(5, 6, 7);
  near(after[0], before[0]);
  near(after[1], before[1]);
});

test("the target holds where it was put while anchored, whatever is selected", (t) => {
  pinnedView(t);
  t.after(() => {
    state.anchored = false;
    state.lvl = null;
  });
  state.lvl = { min: [10, 10, 15], max: [20, 20, 17] };
  state.selected = null;
  state.target = [12.5, 13.5, 16.5];
  state.anchored = true;
  pivot();
  assert.deepEqual(state.target, [12.5, 13.5, 16.5]);
  state.anchored = false;
  pivot();
  assert.deepEqual(state.target, levelCentre(state.lvl));
});
