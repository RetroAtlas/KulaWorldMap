import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData } from "./fixtures.js";
import { setObjects, index, markersOf } from "../../public/js/data.js";
import { heading, probe, walkers, advance, place, dice, under } from "../../public/js/travel.js";

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
  assert.deepEqual(heading(0, 0), heading(0, 1), "a facing the game does not turn for heads as 1");
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

test("a lit beam's cells are filled, and a dark one's are empty, as the game writes them", () => {
  const beam = (y, lit) => ({
    x: 10,
    y,
    z: 17,
    kind: 8,
    type: 1,
    f: [1, lit, 10, y, 17, 14, y, 17, -1, -1, -1],
  });
  const l = level(
    [
      [10, 10, 17],
      [14, 10, 17],
      [10, 12, 17],
      [14, 12, 17],
    ],
    [beam(10, 1), beam(12, 0)],
  );
  const p = probe(l);
  assert.equal(p.empty([12, 10, 17], 0), false);
  assert.equal(p.empty([12, 12, 17], 0), true);
  assert.equal(p.empty([14, 12, 17], 0), false);
});

test("a thing on its way stands over the block it leaves and the one it comes onto", () => {
  const w = { c: { x: 12, y: 10, z: 17 }, face: 0 };
  assert.deepEqual(under(w, [0, 0, 0])[0], [12, 10, 17], "at rest, its own block first");
  const between = under(w, [0.5, 0, 0]);
  assert.ok(
    between.some((c) => c.join() === "12,10,17"),
    "the block it leaves",
  );
  assert.ok(
    between.some((c) => c.join() === "13,10,17"),
    "and the one it comes onto",
  );
  const side = under({ c: { x: 6, y: 21, z: 20 }, face: 3 }, [0, 0, 0.5]);
  assert.ok(
    side.every((c) => c[1] === 21),
    "on a side face, across that face alone",
  );
  assert.ok(side.some((c) => c.join() === "6,21,21"));
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
    advance([w], p, f, table);
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
    advance([w], p, f, table);
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
    advance([w], p, f, table);
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
    advance([w], p, f, table);
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
    advance([w], p, f, table);
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

test("the game's dice give the same draws every time they are seeded", () => {
  const draws = (roll) => Array.from({ length: 11 }, () => roll(4));
  assert.deepEqual(draws(dice(table.dice)), [1, 2, 3, 2, 3, 1, 2, 2, 2, 3, 0]);
  assert.deepEqual(draws(dice(table.dice)), draws(dice(table.dice)));
});

test("the wandering ball shakes toward its way for 76 frames, then dashes a block onto the grid", () => {
  const l = level(row(10, 14, 10, 17), [{ x: 12, y: 10, z: 17, kind: 0, on: [object(0, 53, 4)] }]);
  const w = [...walkers(l, index(l), table).values()][0];
  const p = probe(l);
  const xs = [];
  for (let f = 1; f <= 86 * 3 + 1; f++) {
    advance([w], p, f, table);
    xs.push(w.pos[0]);
    assert.equal(w.pos[1], 10 * UNIT, "it keeps to its row");
  }
  const home = 12 * UNIT;
  for (let f = 0; f < 76; f++)
    assert.ok(xs[f] >= home && xs[f] <= home + 130, `frame ${f} at ${xs[f]}`);
  assert.equal(xs[75], home, "and comes back to rest before it goes");
  assert.equal(xs[76], home + 53);
  assert.equal(xs[85], home + 530);
  assert.equal(xs[86], home + UNIT, "on, its side being shut, settled on the grid");
  assert.equal(xs[86 * 2], home + 2 * UNIT, "and on again");
  assert.equal(xs[86 * 3], home + UNIT, "then back, the row ending");
  assert.deepEqual(place(w).offset, [1, 0, 0], "and is drawn a block from where it started");
  assert.deepEqual(place(w).fwd, [1, 0, 0], "facing as it did at the start");
});

test("a second ball deciding in the same frame draws on from where the first stopped", () => {
  const rows = [...row(10, 14, 10, 17), ...row(10, 14, 20, 17)];
  const ball = (y) => ({ x: 12, y, z: 17, kind: 0, on: [object(0, 53, 4)] });
  const first = (records) => {
    const l = level(rows, records);
    const ws = [...walkers(l, index(l), table).values()];
    advance(ws, probe(l), 86, table);
    return ws.map((w) => w.d[0]);
  };
  assert.deepEqual(first([ball(20)]), [1], "alone, it draws 1, shut, then 2, on");
  assert.deepEqual(first([ball(10), ball(20)]), [1, -1], "second, it draws 3, back");
});

test("OBJ LEVEL's two wandering balls walk the walk the game walks them", () => {
  const l = mapData.levels.find((l) => l.name === "OBJ LEVEL" && l.pack.includes("HILLS"));
  const ws = [...walkers(l, index(l), table).values()];
  const balls = ws.filter((w) => w.type === 53);
  const p = probe(l);
  const at = (w) => [0, 1].map((i) => Math.floor((w.pos[i] + 256) / UNIT)).join(",");
  const trails = balls.map((w) => [at(w)]);
  for (let f = 86; f <= 86 * 16; f += 86) {
    advance(ws, p, f, table);
    balls.forEach((w, k) => trails[k].push(at(w)));
  }
  assert.deepEqual(
    trails,
    [
      "24,21 25,21 26,21 27,21 26,21 25,21 24,21 24,22 24,23 24,24 25,24 26,24 27,24 27,23 27,22 27,21 26,21",
      "24,24 23,24 24,24 23,24 22,24 23,24 22,24 21,24 22,24 21,24 22,24 21,24 22,24 23,24 22,24 23,24 24,24",
    ].map((t) => t.split(" ")),
  );
});

test("every wandering ball on the disc walks over blocks, never shut in", () => {
  let balls = 0;
  for (const l of mapData.levels) {
    const idx = index(l);
    const ws = [...walkers(l, idx, table).values()];
    const mine = ws.filter((w) => w.type === 53);
    if (!mine.length) continue;
    balls += mine.length;
    const p = probe(l);
    for (let f = 1; f <= 3000; f++) {
      advance(ws, p, f, table);
      for (const w of mine) {
        const under = w.pos.map((v, i) => Math.floor((v - w.n[i] * 400 + 256) / UNIT));
        assert.ok(p.value(under, f) >= 0, `${l.name}: over no block at ${under}`);
        assert.ok(!w.stuck, `${l.name}: a ball with every way shut`);
      }
    }
  }
  assert.equal(balls, 46);
});

test("a star keeps its bearing through a turn, and only the wheel swings its nose round", () => {
  const corner = [...row(10, 12, 10, 17), [12, 11, 17], [12, 12, 17]];
  for (const [type, fixed] of [
    [50, true],
    [51, false],
  ]) {
    const l = level(corner, [{ x: 10, y: 10, z: 17, kind: 0, on: [object(0, type, 4)] }]);
    const w = [...walkers(l, index(l), table).values()][0];
    const p = probe(l);
    const headings = new Set();
    let far = 0;
    for (let f = 1; f <= 400; f++) {
      advance([w], p, f, table);
      headings.add(place(w).fwd.join());
      far = Math.max(far, w.pos[1]);
    }
    assert.ok(far > 11 * UNIT, "it went round the corner");
    assert.equal(headings.size === 1, fixed);
  }
});
