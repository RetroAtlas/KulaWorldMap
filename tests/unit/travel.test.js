import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { setObjects, index, markersOf } from "../../public/js/data.js";
import { heading, probe, walkers, advance, place } from "../../public/js/travel.js";

setObjects(objects);
const table = objects.motion;
const UNIT = 512;

/** A level of plain blocks, some carrying a record, laid out to order. */
function level(blocks, records = []) {
  const cells = [];
  const placed = new Map(records.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z] of blocks) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? 0 : 5 + i);
  }
  return { cells, records: records.map((r) => ({ on: [], ...r })) };
}
const object = (face, type, facing = 0) => ({
  face,
  type,
  f: [facing, 0, 1, 0, -1, -1, -1, 386, 1, -1, -1],
  v: 0,
});
const row = (x0, x1, y, z) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, z]);

test("a facing heads along the game's second tangent and turns a quarter at a time", () => {
  assert.deepEqual(heading(0, 1), { d: [0, 1, 0], s: [-1, 0, 0] });
  assert.deepEqual(heading(0, 2), { d: [-1, 0, 0], s: [0, -1, 0] });
  assert.deepEqual(heading(0, 3), { d: [0, -1, 0], s: [1, 0, 0] });
  assert.deepEqual(heading(0, 4), { d: [1, 0, 0], s: [0, 1, 0] });
  assert.deepEqual(heading(3, 1).d, [0, 0, 1]);
  assert.deepEqual(heading(2, 1).d, [0, 0, -1]);
});

test("the lattice answers as the game reads it: a coin blocks, fire and a star do not", () => {
  const l = level(row(10, 14, 10, 17), [
    { x: 11, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
    { x: 12, y: 10, z: 17, kind: 0, on: [object(0, 1)] },
    { x: 13, y: 10, z: 17, kind: 0, on: [object(0, 50, 4), object(2, 37)] },
    {
      x: 14,
      y: 10,
      z: 17,
      kind: 5,
      type: 1,
      f: [1, 1, 14, 10, 17, 16, 10, 17, -1, -1, -1],
      length: 2,
    },
  ]);
  const p = probe(l);
  assert.equal(p.free([10, 10, 17], 0, 0), true);
  assert.equal(p.free([11, 10, 17], 0, 0), false);
  assert.equal(p.free([11, 10, 17], 2, 0), true);
  assert.equal(p.free([12, 10, 17], 0, 0), true);
  assert.equal(p.free([13, 10, 17], 0, 0), true);
  assert.equal(p.free([13, 10, 17], 2, 0), false);
  assert.equal(p.free([14, 10, 17], 0, 0), false);
  assert.equal(p.free([15, 10, 17], 0, 0), false);
  assert.equal(p.empty([10, 10, 16], 0), true);
  assert.equal(p.empty([10, 10, 17], 0), false);
  assert.equal(p.empty([0, 10, 17], 0), true, "outside the lattice is air to the game");
  assert.equal(p.free([0, 10, 17], 0, 0), false, "and nothing to stand over");
});

test("a slow star walks its corridor and turns back at each end", () => {
  const l = level(row(10, 15, 10, 17), [{ x: 12, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] }]);
  const idx = index(l);
  const ws = walkers(l, idx, table);
  assert.equal(ws.size, 1);
  const w = [...ws.values()][0];
  const p = probe(l);
  assert.deepEqual(w.pos, [12 * UNIT, 10 * UNIT, 17 * UNIT - 456]);
  const xs = [];
  for (let f = 1; f <= 600; f++) {
    advance(w, p, f);
    xs.push(w.pos[0]);
    assert.equal(w.pos[1], 10 * UNIT, "it keeps to its row");
  }
  assert.ok(Math.max(...xs) <= 15 * UNIT + 12 && Math.max(...xs) >= 15 * UNIT - 13);
  assert.ok(Math.min(...xs) >= 10 * UNIT - 12 && Math.min(...xs) <= 10 * UNIT + 13);
  const steps = xs.slice(1).map((x, i) => Math.sign(x - xs[i]));
  const turns = steps.filter((s, i) => i && s !== steps[i - 1]).length;
  assert.ok(turns >= 2, `${turns} turns`);
  const { offset } = place(w);
  assert.equal(offset[1], 0);
  assert.equal(offset[2], 0);
});

test("a slow star turns toward a block beside it before going on, and a coin stops it", () => {
  const blocks = [...row(10, 15, 10, 17), [12, 11, 17], [12, 12, 17]];
  const l = level(blocks, [
    { x: 10, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] },
    { x: 14, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const w = [...walkers(l, index(l), table).values()][0];
  const p = probe(l);
  const seen = new Set();
  for (let f = 1; f <= 400; f++) {
    advance(w, p, f);
    const cell = w.pos.map((v) => Math.round(v / UNIT));
    seen.add(`${cell[0]},${cell[1]}`);
  }
  assert.ok(seen.has("12,12"), "it went up the branch");
  assert.ok(!seen.has("14,10"), "and never reached the coin's block");
});

test("a wheel rolls straight until the way ends, then turns over 77 frames toward a side", () => {
  const ring = [
    ...row(10, 13, 10, 17),
    ...row(10, 13, 13, 17),
    [10, 11, 17],
    [10, 12, 17],
    [13, 11, 17],
    [13, 12, 17],
  ];
  const l = level(ring, [{ x: 10, y: 10, z: 17, kind: 0, on: [object(0, 51, 4)] }]);
  const w = [...walkers(l, index(l), table).values()][0];
  const p = probe(l);
  const cells = [];
  const turns = [];
  for (let f = 1; f <= 1400; f++) {
    advance(w, p, f);
    if (w.state && turns[turns.length - 1]?.until !== f - 1) turns.push({ from: f, until: f });
    if (w.state) turns[turns.length - 1].until = f;
    cells.push(
      w.pos
        .slice(0, 2)
        .map((v) => Math.round(v / UNIT))
        .join(","),
    );
  }
  const corners = ["13,10", "13,13", "10,13", "10,10"];
  for (const c of corners) assert.ok(cells.includes(c), `it reached ${c}`);
  assert.ok(!cells.includes("11,11") && !cells.includes("14,10"));
  assert.ok(turns.length >= 3, `${turns.length} turns`);
  for (const t of turns.slice(0, -1)) assert.equal(t.until - t.from + 1, 77);
  assert.ok(w.roll < 0, "it rolled");
});

test("a fast star sways six hundred units either way along its heading", () => {
  const l = level(row(8, 16, 10, 17), [{ x: 12, y: 10, z: 17, kind: 0, on: [object(0, 52, 4)] }]);
  const w = [...walkers(l, index(l), table).values()][0];
  const p = probe(l);
  const xs = [];
  for (let f = 1; f <= 160; f++) {
    advance(w, p, f);
    xs.push(w.pos[0] - 12 * UNIT);
  }
  assert.ok(Math.abs(Math.max(...xs) - 600) <= 1);
  assert.ok(Math.abs(Math.min(...xs) + 600) <= 1);
  assert.ok(Math.abs(xs[Math.round(4096 / 53) - 1]) < 20, "and is back near home after a swing");
});

test("a platform runs its rail at 25 a frame and waits 48 at each end", () => {
  const l = level(
    [[22, 18, 17]],
    [
      {
        x: 22,
        y: 18,
        z: 17,
        kind: 5,
        type: 3,
        f: [2, 1, 22, 14, 17, 22, 18, 17, -1, -1, -1],
        length: 2,
      },
    ],
  );
  const idx = index(l);
  const w = [...walkers(l, idx, table).values()][0];
  const marks = [...idx.markers.values()][0];
  assert.equal(markersOf(l.records[0]).length, marks.length);
  const p = probe(l);
  const ys = [];
  for (let f = 1; f <= 400; f++) {
    advance(w, p, f);
    ys.push(w.pos[1]);
  }
  assert.equal(ys[0], 18 * UNIT - 25);
  assert.equal(ys[81], 14 * UNIT - 2, "it overshoots the end by what a step leaves");
  assert.equal(ys[81 + 47], 14 * UNIT - 2, "and waits there");
  assert.equal(ys[81 + 48], 14 * UNIT - 2 + 25, "then comes back");
  assert.equal(ys[81 + 48 + 81], 18 * UNIT);
  assert.deepEqual(place(w).offset, [0, (ys[399] - 18 * UNIT) / UNIT, 0]);
  assert.equal(w.length, 2);
  assert.equal(w.axis, 1);
});
