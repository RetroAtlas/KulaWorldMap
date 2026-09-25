import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/state.js";
import {
  setAnnotations,
  levelMarkers,
  beams,
  markerState,
  markerNow,
  markerCircuit,
  litNow,
  flip,
  isSwitch,
} from "../../public/js/data.js";

const levelNamed = (name, pack) =>
  mapData.levels.find((l) => l.name === name && (!pack || l.pack === pack));

test("a switch turns its colour over, and a second press turns it back", () => {
  setAnnotations(annotations);
  state.data = mapData;
  state.flipped = new Set();
  const l = levelNamed("OBJ LEVEL", "/HILLS/HILLS.PAK");
  const marks = levelMarkers(l);
  const red = marks.find((m) => isSwitch(m) && markerCircuit(m) === 3);
  const blue = marks.find((m) => isSwitch(m) && markerCircuit(m) === 1);
  const teleporter = marks.find((m) => !isSwitch(m) && markerCircuit(m) === 3);
  const laser = beams(l).find((r) => r.colour === 3);
  assert.ok(red && blue && teleporter && laser);
  for (const m of [red, blue, teleporter]) assert.equal(markerNow(m), markerState(m));
  assert.equal(litNow(laser), laser.lit);

  flip(markerCircuit(red));
  assert.equal(markerNow(red), "on");
  assert.equal(markerNow(teleporter), "on");
  assert.equal(litNow(laser), true);
  assert.equal(markerNow(blue), "off", "another colour stays as it was");
  assert.equal(markerState(red), "off", "and the start is still what the disc holds");

  flip(markerCircuit(red));
  assert.equal(markerNow(teleporter), "off");
  assert.equal(litNow(laser), false);
  state.flipped = new Set();
});

test("only a device a switch toggles is on a circuit", () => {
  setAnnotations(annotations);
  const marks = levelMarkers(levelNamed("LEVEL 1"));
  for (const m of marks) {
    assert.equal(markerCircuit(m), null);
    assert.equal(markerNow(m), null);
    assert.equal(isSwitch(m), false);
  }
});
