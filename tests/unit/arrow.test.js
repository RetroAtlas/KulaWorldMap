import { test } from "node:test";
import assert from "node:assert/strict";
import { bow, pointAt, fromEnd, cut } from "../../public/js/arrow.js";

const near = (a, b, eps = 1e-6) =>
  assert.ok(
    a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < eps),
    `${a} is not ${b}`,
  );

test("a curve runs from its start to its far end", () => {
  const c = bow(10, 20, 300, -40, { loop: 30 });
  near(pointAt(c, 0), [10, 20]);
  near(pointAt(c, 1), [300, -40]);
});

test("at a distance it is the quadratic bowed off the middle of the way", () => {
  // the control point stands 0.18 of 400 off the middle, to one side
  const c = bow(0, 0, 400, 0, { loop: 30 });
  const [cx, cy] = [200, 72];
  near(c, [0, 0, (2 / 3) * cx, (2 / 3) * cy, 400 - (2 / 3) * (400 - cx), (2 / 3) * cy, 400, 0]);
});

test("it bows to the same side of the way it goes, so a pair leading both ways draws apart", () => {
  const there = pointAt(bow(0, 0, 400, 0), 0.5);
  const back = pointAt(bow(400, 0, 0, 0), 0.5);
  assert.ok(there[1] > 0 && back[1] < 0);
});

test("the bow is held between its least and its most", () => {
  const off = (len) => pointAt(bow(0, 0, len, 0, { min: 24, max: 110 }), 0.5)[1];
  // the middle of a quadratic stands half as far off as its control point
  assert.equal(off(50), 12);
  assert.equal(off(5000), 55);
});

test("where the ends meet it loops about as tall as asked, and the head still has a way in", () => {
  const c = bow(50, 50, 50, 50, { loop: 30 });
  const reach = Math.max(
    ...Array.from({ length: 101 }, (_, i) => Math.hypot(...pointAt(c, i / 100).map((v) => v - 50))),
  );
  assert.ok(reach >= 30 && reach < 33, `reaches ${reach}`);
  const [bx, by] = pointAt(c, fromEnd(c, 12));
  assert.ok(Math.abs(Math.hypot(bx - 50, by - 50) - 12) < 1e-3);
});

test("the bow starts to swell into the loop only within twice the loop", () => {
  near(bow(0, 0, 60, 0, { loop: 30 }), bow(0, 0, 60, 0));
  const swells = bow(0, 0, 59, 0, { loop: 30 });
  assert.ok(swells.some((v, i) => Math.abs(v - bow(0, 0, 59, 0)[i]) > 1e-3));
});

test("as the ends close in, the curve goes over into the loop without a jump", () => {
  let last = bow(0, 0, 200, 0, { loop: 30 });
  for (let len = 199.5; len >= 0; len -= 0.5) {
    const c = bow(0, 0, len, 0, { loop: 30 });
    const moved = Math.max(...c.map((v, i) => Math.abs(v - last[i])));
    assert.ok(moved < 1.5, `jumps ${moved} at ${len}`);
    last = c;
  }
});

test("without a loop asked for, the ends meeting leave the quadratic", () => {
  near(bow(0, 0, 0, 0, { min: 24 }), [0, 0, 0, 16, 0, 16, 0, 0]);
});

test("fromEnd finds where the curve last stands that far from its end, or its start", () => {
  const c = bow(0, 0, 300, 100, { loop: 30 });
  for (const d of [3, 12, 90]) {
    const [x, y] = pointAt(c, fromEnd(c, d));
    assert.ok(Math.abs(Math.hypot(300 - x, 100 - y) - d) < 1e-3);
  }
  assert.equal(fromEnd([0, 0, 1, 0, 2, 0, 3, 0], 10), 0);
});

test("cut keeps the curve's own shape up to where it is cut", () => {
  const c = bow(0, 0, 300, 100, { loop: 30 });
  near(cut(c, 1), c);
  const part = cut(c, 0.7);
  for (const s of [0, 0.25, 0.5, 1]) near(pointAt(part, s), pointAt(c, 0.7 * s));
});
