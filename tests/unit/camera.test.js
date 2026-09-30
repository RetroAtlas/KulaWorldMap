import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/state.js";
import { setAnnotations } from "../../public/js/data.js";
import { startCamera } from "../../public/js/overlays.js";

setAnnotations(annotations);
state.data = mapData;

const levelNamed = (name) => mapData.levels.find((l) => l.name === name);
const near = (a, b, what) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1 / 512, `${what}: ${a} against ${b}`));
const minus = (a, b) => a.map((v, i) => v - b[i]);
const length = (v) => Math.hypot(...v);

test("the start camera stands 648 units behind the face under the ball and 531 above it", () => {
  // LEVEL 1's ball faces -y from the top of its block, HIDDEN 10's faces +z
  // from its -y side
  for (const [name, under, offset] of [
    ["LEVEL 1", [17.5, 18.5, 17], [0, 648, -531]],
    ["HIDDEN 10", [17.5, 15, 10.5], [0, -531, -648]],
  ]) {
    const { eye } = startCamera(levelNamed(name));
    near(
      minus(eye, under),
      offset.map((v) => v / 512),
      name,
    );
  }
});

test("at the ball the start camera sees a block's width three times over, the ball below the middle", () => {
  const { eye, sees } = startCamera(levelNamed("LEVEL 1"));
  const across = length(minus(sees[1], sees[0]));
  const high = length(minus(sees[3], sees[0]));
  assert.ok(Math.abs(across - 3.125) < 1e-9, `${across}`);
  assert.ok(Math.abs(high / across - 0.75) < 1e-9, `${high}`);
  const middle = sees.reduce((m, p) => m.map((v, i) => v + p[i] / 4), [0, 0, 0]);
  const under = [17.5, 18.5, 17];
  const drop = length(minus(under, middle)) / (high / 2);
  assert.ok(Math.abs(drop - 50 / 120) < 1e-9, `${drop}`);
  assert.ok(Math.abs(length(minus(middle, eye)) - 800 / 512) < 1e-9);
});
