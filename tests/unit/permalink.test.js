import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { SIDE, PITCH_MAX, ZOOM_MIN, ZOOM_MAX, state, screen } from "../../public/js/state.js";
import { slotOf, formatHash, parseHash } from "../../public/js/permalink.js";

const cam = { yaw: 45, pitch: 35, zoom: 0.9, panX: 0, panY: 0 };

test("every level has a key of its own, and a link reads back the key it was written with", () => {
  const keys = mapData.levels.map(slotOf);
  assert.equal(new Set(keys).size, keys.length);
  for (const slot of keys) {
    const hash = formatHash({ slot, cam, target: [17, 17, 17], slice: SIDE - 1 });
    assert.equal(parseHash(hash).slot, slot);
  }
});

test("a view written into a link reads back as that view", () => {
  const hash = formatHash({
    slot: "INCA/11",
    cam: { yaw: 44.6, pitch: 35.2, zoom: 0.904, panX: 1.234, panY: -0.5 },
    target: [17.5, 12, 16.556],
    slice: 20,
    picked: [17, 12, 17],
  });
  assert.equal(hash, "#INCA/11/45,35/0.90/17.5,12,16.56/1.23,-0.5/20/17,12,17");
  assert.deepEqual(parseHash(hash), {
    slot: "INCA/11",
    turn: [45, 35],
    zoom: 0.9,
    target: [17.5, 12, 16.56],
    pan: [1.23, -0.5],
    slice: 20,
    picked: [17, 12, 17],
  });
});

test("a link names its level whatever its case", () => {
  assert.equal(parseHash("#copycat/4/30,20").slot, "COPYCAT/4");
});

test("a part a link leaves out, or that cannot be read, reads as not named", () => {
  assert.deepEqual(parseHash("#HIRO/0"), {
    slot: "HIRO/0",
    turn: null,
    zoom: null,
    target: null,
    pan: null,
    slice: null,
    picked: null,
  });
  const odd = parseHash("#HIRO/0/45/-1/1,2/x,y/3.5/1,2");
  for (const part of ["turn", "zoom", "target", "pan", "slice", "picked"])
    assert.equal(odd[part], null, part);
});

test("a slice past the top of the lattice is the whole level", () => {
  assert.equal(parseHash("#HIRO/0/45,35/1/17,17,17/0,0/99").slice, SIDE - 1);
  assert.equal(parseHash("#HIRO/0/45,35/1/17,17,17/0,0/0").slice, 0);
});

test("what follows the slice is read by its shape, and a segment the reader does not know is passed over", () => {
  const head = "#HIRO/11/45,35/1/21.5,13.5,18.5/0,0/33";
  for (const tail of ["/21,13,18", "/on=red/21,13,18", "/21,13,18/v2/-y", "/2.5,1,1/21,13,18"])
    assert.deepEqual(parseHash(head + tail).picked, [21, 13, 18], tail);
  for (const tail of ["", "/on=red", "/21,13", "/21.5,13,18", "/-21,13,18"])
    assert.equal(parseHash(head + tail).picked, null, tail);
});

test("a link escaped on its way reads as the link", () => {
  const link = parseHash("#INCA%2F11%2F45%2C35%2F0.90%2F17%2C17%2C17%2F0%2C0%2F33%2F17%2C12%2C17");
  assert.equal(link.slot, "INCA/11");
  assert.deepEqual(link.turn, [45, 35]);
  assert.deepEqual(link.picked, [17, 12, 17]);
  assert.equal(parseHash("#HIRO/0/45%2c35").turn[1], 35);
  assert.equal(parseHash("#HIRO/0/100%/1").slot, "HIRO/0");
});

test("a number past what the camera can reach is held where the camera stops", () => {
  const far = parseHash("#HIRO/0/400,170/1e6/99,-5,17/1e300,-1e300");
  assert.deepEqual(far.turn, [40, PITCH_MAX]);
  assert.equal(far.zoom, ZOOM_MAX);
  assert.deepEqual(far.target, [SIDE, 0, 17]);
  assert.deepEqual(far.pan, [SIDE / ZOOM_MIN, -SIDE / ZOOM_MIN]);
  assert.deepEqual(parseHash("#HIRO/0/45,35/0.08/17,17,17/150,-150").pan, [150, -150]);
  assert.equal(parseHash("#HIRO/0/45,35/0.0001").zoom, ZOOM_MIN);
  assert.deepEqual(parseHash("#HIRO/0/-137,35").turn, [223, 35]);
  const written = formatHash({
    slot: "HIRO/0",
    cam: { ...cam, panX: far.pan[0] },
    target: far.target,
    slice: 33,
  });
  assert.ok(/^#HIRO\/0\/45,35\/0\.90\/34,0,17\/425,0\/33$/.test(written), written);
});

test("a cell outside the lattice names nothing, and a slot is a number", () => {
  const head = "#HIRO/11/45,35/1/17,17,17/0,0/33";
  assert.equal(parseHash(`${head}/${SIDE},0,0`).picked, null);
  assert.deepEqual(parseHash(`${head}/${SIDE - 1},0,0`).picked, [SIDE - 1, 0, 0]);
  assert.equal(parseHash("#inca/011").slot, "INCA/11");
});

// Every later version reads the links already shared, so the zoom's scale and
// the camera's axes cannot move without moving every one of them.
test("a link puts the lattice where it always has on the screen", (t) => {
  const was = structuredClone({ cam: state.cam, target: state.target, view: state.view });
  t.after(() => {
    Object.assign(state.cam, was.cam);
    state.target = was.target;
    state.view = was.view;
  });
  const link = parseHash("#INCA/11/30,20/1.50/17,12,17/0.5,-0.25/33");
  [state.cam.yaw, state.cam.pitch] = link.turn;
  [state.cam.panX, state.cam.panY] = link.pan;
  state.cam.zoom = link.zoom;
  state.target = link.target;
  state.view = { w: 800, h: 600, dpr: 1 };
  for (const [cell, at] of [
    [
      [17, 12, 17],
      [374.5, 312.75],
    ],
    [
      [18, 12, 17],
      [418.667, 321.472],
    ],
    [
      [17, 13, 17],
      [349, 327.856],
    ],
    [
      [17, 12, 18],
      [374.5, 360.674],
    ],
  ]) {
    const [x, y] = screen(...cell);
    assert.ok(Math.abs(x - at[0]) < 1e-3 && Math.abs(y - at[1]) < 1e-3, `${cell}: ${x},${y}`);
  }
});

test("a fitted view's link says so in place of where the camera is", () => {
  const hash = formatHash({
    slot: "INCA/11",
    cam,
    target: [17.5, 12, 17],
    slice: 20,
    picked: [17, 12, 17],
    fitted: true,
  });
  assert.equal(hash, "#INCA/11/45,35/fit/20/17,12,17");
  for (const link of [parseHash(hash), parseHash(hash.replace("fit", "FIT"))]) {
    assert.deepEqual(link.turn, [45, 35]);
    assert.equal(link.zoom, null);
    assert.equal(link.target, null);
    assert.equal(link.pan, null);
    assert.equal(link.slice, 20);
    assert.deepEqual(link.picked, [17, 12, 17]);
  }
});
