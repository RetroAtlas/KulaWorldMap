import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { setAnnotations } from "../../public/js/viewer/data.js";
import { startCamera } from "../../public/js/viewer/draw/overlays.js";

setAnnotations(annotations);
state.data = mapData;

const levelNamed = (name) => mapData.levels.find((l) => l.name === name);
const near = (a, b, what) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1 / 512, `${what}: ${a} against ${b}`));
const minus = (a, b) => a.map((v, i) => v - b[i]);
const length = (v) => Math.hypot(...v);

test("the start camera stands 648 units behind the ball's centre and 531 above it, the centre 100 off its face", () => {
  // LEVEL 1's ball faces -y from the top of its block, HIDDEN 10's ball faces
  // +z from its -y side
  for (const [name, centre, offset] of [
    ["LEVEL 1", [17.5, 18.5, 17 - 100 / 512], [0, 648, -531]],
    ["HIDDEN 10", [17.5, 15 - 100 / 512, 10.5], [0, -531, -648]],
  ]) {
    const { eye } = startCamera(levelNamed(name));
    near(
      minus(eye, centre),
      offset.map((v) => v / 512),
      name,
    );
  }
});

test("at the ball the start camera sees a block's width three times over and two and a half blocks high, the ball 47 lines below the middle", () => {
  const { eye, sees } = startCamera(levelNamed("LEVEL 1"));
  const across = length(minus(sees[1], sees[0]));
  const high = length(minus(sees[3], sees[0]));
  assert.ok(Math.abs(across - 3.125) < 1e-9, `${across}`);
  assert.ok(Math.abs(high - 2.5) < 1e-9, `${high}`);
  const middle = sees.reduce((m, p) => m.map((v, i) => v + p[i] / 4), [0, 0, 0]);
  const centre = [17.5, 18.5, 17 - 100 / 512];
  const lines = (length(minus(centre, middle)) / (high / 2)) * 120;
  assert.ok(Math.abs(lines - 46.875) < 1e-9, `${lines}`);
  assert.ok(Math.abs(length(minus(middle, eye)) - 800 / 512) < 1e-9);
});

// The loader takes the last start it meets, so a level with several starts
// opens behind that one.
test("the start camera stands behind the last start, where the game puts the ball", () => {
  const start = (x, y, z, facing) => ({
    x,
    y,
    z,
    kind: 0,
    on: [{ face: 0, type: 30, f: [facing, 0, 1, 0, -1, -1, -1, 386, 1, -1, -1], v: 0 }],
  });
  const l = { records: [start(3, 3, 3, 1), start(8, 8, 8, 3)] };
  const { eye } = startCamera(l);
  near(
    minus(eye, [8.5, 8.5, 8 - 100 / 512]),
    [0, 648 / 512, -531 / 512],
    "the last start, facing -y",
  );
});
