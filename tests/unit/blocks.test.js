import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import { state, facing, screen } from "../../public/js/viewer/state.js";
import { setObjects, blockUnits } from "../../public/js/viewer/data.js";
import { cellKey, KIND } from "../../public/js/format/lattice.js";
import {
  FACES,
  boxOf,
  covers,
  cube,
  faceAt,
  facePoints,
} from "../../public/js/viewer/draw/blocks.js";

setObjects(objects);
state.data = mapData;
state.view = { w: 800, h: 600, dpr: 1 };

const unit = blockUnits();
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

/** How many faces cube() draws of the block at `c`, of `kind`, over `idx`. */
function drawn(c, idx, kind) {
  let faces = 0;
  const g = {
    beginPath: () => faces++,
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
  };
  cube(g, c, idx, () => "#fff", null, 1, null, kind);
  return faces;
}

/** An index of `cells`, each a cell with its kind, and the cells `breaking` up at a size. */
function indexOf(cells, breaking = []) {
  const idx = { cells: new Map(), records: new Map() };
  for (const [c, kind] of cells) {
    const key = cellKey(c.x, c.y, c.z);
    idx.cells.set(key, { ...c, v: kind === KIND.PLAIN ? kind : mapData.firstRecord });
    if (kind !== KIND.PLAIN) idx.records.set(key, [{ kind }]);
  }
  if (breaking.length) idx.breaking = new Map(breaking.map((c) => [cellKey(c.x, c.y, c.z), 300]));
  return idx;
}

test("a cell is drawn as the unit cube at it, and one carrying its size as the cube of that side, in blocks, about the cell's middle", () => {
  assert.deepEqual(boxOf({ x: 3, y: 4, z: 5 }, unit), { at: [3, 4, 5], side: 1 });
  assert.deepEqual(boxOf({ x: 3, y: 4, z: 5, size: unit }, unit), { at: [3, 4, 5], side: 1 });
  assert.deepEqual(boxOf({ x: 3, y: 4, z: 5, size: unit / 2 }, unit), {
    at: [3.25, 4.25, 5.25],
    side: 0.5,
  });
  assert.deepEqual(boxOf({ x: 3, y: 4, z: 5, size: 0 }, unit), { at: [3.5, 4.5, 5.5], side: 0 });
  // a breaking block ten frames on, by the table's figures
  const { size, shrink } = objects.motion.kinds[6];
  const { at, side } = boxOf({ x: 0, y: 0, z: 0, size: size - 10 * shrink }, unit);
  assert.equal(side, (size - 10 * shrink) / unit);
  at.forEach((v) => near(v, 0.5 - side / 2));
});

test("a shrunk cube's faces are the whole cube's pulled toward the projected middle, and the faces a point lies on follow them", () => {
  const c = { x: 17, y: 17, z: 17 };
  const half = { ...c, size: unit / 2 };
  const [mx, my] = screen(17.5, 17.5, 17.5);
  for (const game of [0, 1, 2]) {
    const whole = facePoints(c, game);
    facePoints(half, game).forEach(([x, y], k) => {
      near(x, mx + (whole[k][0] - mx) / 2);
      near(y, my + (whole[k][1] - my) / 2);
    });
  }
  // the middle of the shrunk top lies on the top of both
  const [tx, ty] = screen(17.5, 17.5, 17.25);
  assert.equal(faceAt(c, tx, ty), 0);
  assert.equal(faceAt(half, tx, ty), 0);
  // a point of the top near its corner lies on the whole block alone
  const [cx, cy] = screen(17.1, 17.1, 17);
  assert.equal(covers(c, cx, cy), true);
  assert.equal(covers(half, cx, cy), false);
});

test("a face toward a crumbling block is left out until the block breaks up, when it is drawn, a platform's apart, and a breaking block's own face toward a plain block, left out while it stands whole, is drawn as it shrinks", () => {
  const seen = FACES.filter((f) => facing(f.n)).length;
  const side = FACES.find((f) => facing(f.n) && f.n[2] === 0).d;
  const c = { x: 10, y: 10, z: 10 };
  const n = { x: c.x + side[0], y: c.y + side[1], z: c.z + side[2] };
  const whole = indexOf([
    [c, KIND.PLAIN],
    [n, KIND.CRUMBLING],
  ]);
  const breaking = indexOf(
    [
      [c, KIND.PLAIN],
      [n, KIND.CRUMBLING],
    ],
    [n],
  );
  assert.equal(drawn(c, whole, KIND.PLAIN), seen - 1, "the face toward a whole crumbling block");
  assert.equal(drawn(c, breaking, KIND.PLAIN), seen, "drawn once the block breaks up");
  assert.equal(drawn(c, breaking, KIND.PLATFORM), seen - 1, "a platform's never");
  const beyond = indexOf([
    [c, KIND.CRUMBLING],
    [n, KIND.PLAIN],
  ]);
  assert.equal(
    drawn(c, beyond, KIND.CRUMBLING),
    seen - 1,
    "the whole block's face toward a plain one",
  );
  assert.equal(
    drawn(
      { ...c, size: 300 },
      { ...beyond, breaking: new Map([[cellKey(c.x, c.y, c.z), 300]]) },
      KIND.CRUMBLING,
    ),
    seen,
    "every face turned to the camera as it shrinks",
  );
});
