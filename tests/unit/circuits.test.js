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
  markerDestination,
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

test("a teleporter leads to one of its own colour, and nothing else leads anywhere", () => {
  setAnnotations(annotations);
  let led = 0;
  for (const l of mapData.levels) {
    const marks = new Map();
    for (const r of l.records) for (const m of levelMarkers({ records: [r] })) marks.set(m, r);
    for (const [m, r] of marks) {
      const to = markerDestination(m, l);
      if (m.face === null || m.type !== 5) {
        assert.equal(to, null);
        continue;
      }
      const there = [...marks].find(
        ([n, s]) => n.face === to.face && s.x === to.x && s.y === to.y && s.z === to.z,
      );
      assert.ok(there, `${l.name}: the teleporter at ${r.x},${r.y},${r.z} leads nowhere`);
      assert.equal(there[0].type, 5);
      assert.equal(markerCircuit(there[0]), markerCircuit(m));
      led++;
    }
  }
  assert.equal(led, 147);
});
