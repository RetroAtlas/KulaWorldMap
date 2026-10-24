import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, PINNED_LINK, PINNED_CELLS } from "./fixtures.js";
import { PITCH_MAX, ZOOM_MIN, ZOOM_MAX, state, screen } from "../../public/js/viewer/state.js";
import { SIDE } from "../../public/js/format/lattice.js";
import { slotOf, formatHash, parseHash } from "../../public/js/viewer/permalink.js";

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
    tails: [],
  });
});

test("a level from elsewhere keys itself as a pack no disc holds, and its link reads back", () => {
  const slot = slotOf({ pack: "/DRAFT/DRAFT.PAK", index: 7 });
  assert.equal(slot, "DRAFT/7");
  const hash = formatHash({ slot, cam, target: [17, 17, 17], slice: SIDE - 1 });
  assert.equal(parseHash(hash).slot, slot);
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
    tails: [],
  });
  const odd = parseHash("#HIRO/0/45/-1/1,2/x,y/3.5/1,2");
  for (const part of ["turn", "zoom", "target", "pan", "slice", "picked"])
    assert.equal(odd[part], null, part);
  assert.deepEqual(odd.tails, []);
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

test("a lettered segment at the tail is a module's own segment, read beside the cell in either order", () => {
  const head = "#HIRO/11/45,35/1/21.5,13.5,18.5/0,0/33";
  for (const tail of ["/rAbc-_9/21,13,18", "/21,13,18/rAbc-_9"]) {
    const link = parseHash(head + tail);
    assert.deepEqual(link.picked, [21, 13, 18], tail);
    assert.deepEqual(link.tails, ["rAbc-_9"], tail);
  }
  assert.deepEqual(parseHash(`${head}/rAbc/21,13,18/p_-9Z`).tails, ["rAbc", "p_-9Z"]);
  assert.deepEqual(parseHash("#HIRO/11/45,35/fit/33/rAbc-_9").tails, ["rAbc-_9"]);
  // a cell, the fit flag, a segment too short or of another shape is no module's segment
  for (const segment of [
    "21,13,18",
    "fit",
    "FIT",
    "rab",
    "Rabc",
    "1abc",
    "r=12",
    "on=red",
    "r.abc",
  ])
    assert.deepEqual(parseHash(`${head}/${segment}`).tails, [], segment);
});

test("a module's segments are written after the cell, and read back in the written and the fitted form", () => {
  const tails = ["rAbc-_9", "p0_-"];
  for (const fitted of [false, true])
    for (const picked of [null, [17, 12, 17]]) {
      const hash = formatHash({
        slot: "INCA/11",
        cam,
        target: [17.5, 12, 17],
        slice: 20,
        picked,
        fitted,
        tails,
      });
      const link = parseHash(hash);
      assert.deepEqual(link.tails, tails, hash);
      assert.deepEqual(link.picked, picked, hash);
      assert.equal(link.slice, 20, hash);
      assert.deepEqual(link.turn, [45, 35], hash);
      assert.equal(link.zoom, fitted ? null : 0.9, hash);
    }
  const written = (picked, fitted) =>
    formatHash({ slot: "INCA/11", cam, target: [17.5, 12, 17], slice: 20, picked, fitted, tails });
  assert.equal(written([17, 12, 17], true), "#INCA/11/45,35/fit/20/17,12,17/rAbc-_9/p0_-");
  assert.equal(written(null, false), "#INCA/11/45,35/0.90/17.5,12,17/0,0/20/rAbc-_9/p0_-");
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
  assert.deepEqual(far.pan, [(8 * SIDE) / ZOOM_MIN, (-8 * SIDE) / ZOOM_MIN]);
  assert.deepEqual(parseHash("#HIRO/0/45,35/0.08/17,17,17/150,-150").pan, [150, -150]);
  assert.equal(parseHash("#HIRO/0/45,35/0.0001").zoom, ZOOM_MIN);
  assert.deepEqual(parseHash("#HIRO/0/-137,35").turn, [223, 35]);
  const written = formatHash({
    slot: "HIRO/0",
    cam: { ...cam, panX: far.pan[0] },
    target: far.target,
    slice: 33,
  });
  assert.ok(/^#HIRO\/0\/45,35\/0\.90\/34,0,17\/3400,0\/33$/.test(written), written);
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
  const link = parseHash(PINNED_LINK);
  [state.cam.yaw, state.cam.pitch] = link.turn;
  [state.cam.panX, state.cam.panY] = link.pan;
  state.cam.zoom = link.zoom;
  state.target = link.target;
  state.view = { w: 800, h: 600, dpr: 1 };
  for (const [cell, at] of PINNED_CELLS) {
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

test("a yaw is written as the reader brings it round", () => {
  for (const [yaw, round] of [
    [-98, 262],
    [-5, 355],
    [405, 45],
    [360, 0],
  ]) {
    const written = formatHash({
      slot: "HIRO/0",
      cam: { ...cam, yaw },
      target: [17, 17, 17],
      slice: 33,
    });
    assert.match(written, new RegExp(`^#HIRO/0/${round},`));
    assert.deepEqual(parseHash(written).turn, [round, cam.pitch]);
  }
});
