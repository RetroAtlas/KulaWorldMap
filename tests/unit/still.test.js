import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import { SIDE, TYPE } from "../../public/js/format/lattice.js";
import { state } from "../../public/js/viewer/state.js";
import { setObjects } from "../../public/js/viewer/data.js";
import { press } from "../../public/js/viewer/motion.js";
import { ballsFor, ballsWith } from "../../public/js/viewer/draw/things.js";
import { stilled } from "../../public/js/viewer/draw/still.js";

setObjects(objects);
state.data = mapData;

const SWAPPED = [
  "cam",
  "target",
  "frame",
  "view",
  "slice",
  "show",
  "hiddenKinds",
  "presses",
  "selected",
  "hover",
];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

/** The frame's fields set to objects of this test's own, every one unlike the fields a still
    installs, so a swap and its undoing show by identity; what each holds, with the index beside
    them. */
function framed() {
  Object.assign(state, {
    cam: { yaw: 10, pitch: 20, zoom: 2, panX: 1, panY: -1 },
    target: [1, 2, 3],
    frame: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    view: { w: 800, h: 600, dpr: 2 },
    slice: 12,
    show: { ...state.show, outlines: false, labels: true, base: true, camera: true, through: true },
    hiddenKinds: new Set([3]),
    presses: new Map([["red", 7]]),
    selected: { x: 1, y: 2, z: 3, key: 1 },
    hover: { x: 4, y: 5, z: 6, key: 2 },
    idx: { cells: new Map() },
  });
  return Object.fromEntries([...SWAPPED, "idx"].map((k) => [k, state[k]]));
}

const same = (was) => Object.fromEntries(Object.keys(was).map((k) => [k, state[k] === was[k]]));
const every = (was, v) => Object.fromEntries(Object.keys(was).map((k) => [k, v]));

test("inside stilled the frame's fields are a still's own, the whole level in the slice, turned about no frame, with every circuit as the level starts and nothing selected or hovered, and the index is untouched", () => {
  const was = framed();
  const seen = stilled(() => ({
    fresh: same(was),
    frame: state.frame,
    slice: state.slice,
    show: state.show,
    hidden: state.hiddenKinds.size,
    presses: state.presses.size,
    selected: state.selected,
    hover: state.hover,
    view: state.view,
  }));
  assert.deepEqual(seen.fresh, { ...every(was, false), idx: true });
  assert.equal(seen.frame, null);
  assert.equal(seen.slice, SIDE - 1);
  for (const k of ["outlines", "objects", "models"]) assert.equal(seen.show[k], true, k);
  for (const k of ["labels", "base", "camera", "through"]) assert.equal(seen.show[k], false, k);
  assert.equal(seen.hidden, 0);
  assert.equal(seen.presses, 0);
  assert.equal(seen.selected, null);
  assert.equal(seen.hover, null);
  assert.deepEqual(seen.view, { w: 0, h: 0, dpr: 1 });
});

test("after stilled every swapped field is the frame's own again, by reference, with fn's result given back", () => {
  const was = framed();
  assert.equal(
    stilled(() => "painted"),
    "painted",
  );
  assert.deepEqual(same(was), every(was, true));
  assert.deepEqual(state.show, was.show);
  assert.equal(state.hiddenKinds.has(3), true);
  assert.equal(state.presses.get("red"), 7);
});

test("the frame's fields come back when fn throws too", () => {
  const was = framed();
  assert.throws(
    () =>
      stilled(() => {
        state.cam.zoom = 9;
        state.show.labels = true;
        throw new Error("mid-paint");
      }),
    /mid-paint/,
  );
  assert.deepEqual(same(was), every(was, true));
  assert.equal(state.cam.zoom, 2);
});

test("a paint inside stilled reads the level's own starts whatever a module stands and steps stores of its own", () => {
  framed();
  const l = mapData.levels.find((x) => x.name === "LEVEL 1");
  ballsWith(null);
  const starts = stilled(() => ballsFor(l, 0));
  ballsWith(() => [[9, 9, 9]]);
  assert.notDeepEqual(ballsFor(l, 0), starts);
  assert.deepEqual(
    stilled(() => ballsFor(l, 0)),
    starts,
  );
  ballsWith(null);
  const e = objects.motion.types[String(TYPE.BOOST_BUTTON)];
  press(e, "still", 0, false);
  for (let f = 1; f <= 4; f++) press(e, "still", f, true);
  const was = press(e, "still", 4, true).height;
  assert.notEqual(was, 1);
  assert.equal(
    stilled(() => press(e, "still", 10, true).height),
    1,
  );
  near(press(e, "still", 4, true).height, was);
});
