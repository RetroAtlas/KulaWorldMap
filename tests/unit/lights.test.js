import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import { cellKey } from "../../public/js/format/lattice.js";
import { state } from "../../public/js/viewer/state.js";
import { setObjects, index, flip, LAST_KEY } from "../../public/js/viewer/data.js";
import { deviceLights, lightsWith } from "../../public/js/viewer/draw/lights.js";

setObjects(objects);
state.data = mapData;

// LEVEL 1's one device is its exit, which casts its light from the 19th frame
// after the panel opens the exits.
const EXIT = 7;
const glow = objects.motion.glow;
const level = mapData.levels.find((l) => l.name === "LEVEL 1");
const idx = index(level);
const [key, exit] = [...idx.markers].flatMap(([k, ms]) =>
  ms.filter((m) => m.face !== null && m.type === EXIT).map((m) => [k, m]),
)[0];
const home = idx.cells.get(key);
const world = mapData.themes.findIndex((t) => t.id === level.theme);
const green = glow.colours[EXIT][world][0];
const LIT = glow.every;
const full = green.map((v) => v & ~1);
const part = green.map((v) => Math.floor((v * glow.part[0]) / glow.part[1]) & ~1);
const dark = [0, 0, 0];

const shut = () => {
  state.presses = new Map();
};
const opened = () => {
  shut();
  flip(LAST_KEY, 0);
};
const faceOf = (lit, g) => lit.get(`${key}/${g}`);

let cast = null;
const asked = [];
lightsWith((...args) => {
  asked.push(args);
  return cast;
});

test("the devices alone light the faces, the exit's own all over and those past its edges at the corners on the edge", () => {
  shut();
  assert.deepEqual(deviceLights(level, idx, LIT), { lit: new Map(), on: false });
  opened();
  assert.deepEqual(deviceLights(level, idx, LIT - 1).lit, new Map());
  const { lit, on } = deviceLights(level, idx, LIT);
  assert.ok(on);
  assert.deepEqual(faceOf(lit, exit.face), [full, full, full, full]);
  assert.ok(lit.size > 1);
  for (const [k, corners] of lit) {
    if (k === `${key}/${exit.face}`) continue;
    assert.equal(corners.length, 4);
    for (const c of corners)
      assert.ok(
        [full, part, dark].some((s) => s.join() === c.join()),
        `${k}`,
      );
    assert.ok(
      corners.some((c) => c.join() !== dark.join()),
      `${k}`,
    );
  }
});

test("a module's light from a cell and a face lights the faces a device there lights, at the same corners", () => {
  opened();
  const device = deviceLights(level, idx, LIT).lit;
  shut();
  cast = [{ x: home.x, y: home.y, z: home.z, face: exit.face, colour: green }];
  const { lit, on } = deviceLights(level, idx, 0);
  assert.deepEqual(lit, device);
  assert.ok(on);
  assert.deepEqual(asked.at(-1), [level, idx, 0]);
  // from another face of the block, that face is the one lit all over
  const side = [1, 2, 3, 4].find((g) => faceOf(device, g));
  cast = [{ x: home.x, y: home.y, z: home.z, face: side, colour: green }];
  const other = deviceLights(level, idx, 0).lit;
  assert.deepEqual(faceOf(other, side), [full, full, full, full]);
  assert.notDeepEqual(other, device);
  cast = null;
});

test("a module's light sums with a device's where they share a face, and one from a cell with no block casts nothing", () => {
  opened();
  const device = deviceLights(level, idx, LIT).lit;
  cast = [{ x: home.x, y: home.y, z: home.z, face: exit.face, colour: green }];
  const both = deviceLights(level, idx, LIT).lit;
  assert.equal(both.size, device.size);
  for (const [k, corners] of device)
    assert.deepEqual(
      both.get(k),
      corners.map((c) => c.map((v) => v * 2)),
    );
  shut();
  const empty = [0, 0, 0];
  assert.ok(!idx.cells.has(cellKey(...empty)));
  cast = [{ x: empty[0], y: empty[1], z: empty[2], face: 0, colour: green }];
  assert.deepEqual(deviceLights(level, idx, 0), { lit: new Map(), on: false });
  cast = null;
  opened();
  assert.deepEqual(deviceLights(level, idx, LIT).lit, device);
  shut();
});
