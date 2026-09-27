import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { SIDE, PITCH_MAX, ZOOM_MIN, ZOOM_MAX } from "../../public/js/state.js";
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
  const far = parseHash("#HIRO/0/400,170/1e6/99,-5,17");
  assert.deepEqual(far.turn, [400, PITCH_MAX]);
  assert.equal(far.zoom, ZOOM_MAX);
  assert.deepEqual(far.target, [SIDE, 0, 17]);
  assert.equal(parseHash("#HIRO/0/45,35/0.0001").zoom, ZOOM_MIN);
});

test("a cell outside the lattice names nothing, and a slot is a number", () => {
  const head = "#HIRO/11/45,35/1/17,17,17/0,0/33";
  assert.equal(parseHash(`${head}/${SIDE},0,0`).picked, null);
  assert.deepEqual(parseHash(`${head}/${SIDE - 1},0,0`).picked, [SIDE - 1, 0, 0]);
  assert.equal(parseHash("#inca/011").slot, "INCA/11");
});
