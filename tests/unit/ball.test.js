import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { frameOf } from "../../public/js/viewer/state.js";
import { heading } from "../../public/js/viewer/travel.js";
import { probeOf } from "../../public/js/viewer/walk.js";
import {
  REST,
  ROLLING,
  WRAPPING,
  LEFT,
  RIGHT,
  PAD,
  ballAt,
  step,
  turned,
  offsetFrame,
  blockUnder,
  faceUnder,
  heightOf,
  centreOf,
  moving,
} from "../../public/js/play/ball.js";

const table = objects.motion.types[30];
const UNIT = objects.block;
const TURN = objects.motion.turn;
const QUARTER = TURN / 4;
const RULES = { table, turn: TURN, unit: UNIT };
const neg = (v) => v.map((x) => -x || 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearly = (f, g) => f.forEach((v, i) => near(v, g[i], 1e-9));

/** A lattice of the cells given, probed as the planner probes a level. */
const lattice = (...cells) =>
  probeOf({
    records: new Map(),
    cells: new Map(cells.map((c) => [cellKey(...c), { x: c[0], y: c[1], z: c[2] }])),
  });
/** A row of blocks along y at x 17, z 17, from `from` to `to`. */
const row = (from, to, more = []) => {
  const cells = [];
  for (let y = from; y <= to; y++) cells.push([17, y, 17]);
  return lattice(...cells, ...more);
};
/** A plate of blocks seven wide and nine long at z 17. */
const plate = () => {
  const cells = [];
  for (let x = 14; x <= 20; x++) for (let y = 10; y <= 18; y++) cells.push([x, y, 17]);
  return lattice(...cells);
};
const UP = [0, -1, 0];
const TOP = 0;
/** Run `n` frames with `pad` held, collecting the events. */
function run(b, probe, n, pad) {
  const out = [];
  for (let i = 0; i < n; i++) {
    b.pad = pad;
    out.push(...step(b, probe));
  }
  return out;
}
const rest = (b, probe) => {
  let n = 0;
  while (moving(b) && n < 1000) {
    b.pad = 0;
    step(b, probe);
    n++;
  }
  return n;
};

test("a ball stands at rest 100 off its face at the middle of its cell", () => {
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, 17 * UNIT - 356]);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  assert.equal(faceUnder(b), TOP);
  assert.equal(heightOf(b), 100);
  assert.deepEqual(centreOf(b), [17.5, 18.5, 17.5 - 356 / UNIT]);
  assert.deepEqual(b.s, [1, 0, 0]);
  assert.deepEqual(b.frame, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(moving(b), false);
  step(b, row(12, 18));
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, 17 * UNIT - 356]);
});

test("with Up held the ball reaches the next middle on the 18th frame and rolls on a block in 15 or 16", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const speeds = [];
  const events = [];
  for (let f = 1; f <= 18; f++) {
    b.pad = PAD.up;
    events.push(...step(b, probe).map((e) => [f, e]));
    speeds.push(b.speed);
  }
  assert.deepEqual(speeds.slice(0, 7), [6, 12, 18, 24, 30, 33, 33]);
  assert.equal(b.state, ROLLING);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  assert.deepEqual(events, [[18, { at: "middle" }]]);
  const middles = [];
  for (let f = 19; f <= 18 + 16 * 3; f++) {
    b.pad = PAD.up;
    if (step(b, probe).some((e) => e.at === "middle")) middles.push(f);
  }
  assert.deepEqual(middles, [34, 49, 65]);
  assert.equal(heightOf(b), 100);
  assert.equal(b.pos[0], 17 * UNIT);
});

test("Up released stops the ball at the next middle, laid exactly there", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 5, PAD.up);
  assert.equal(b.state, ROLLING);
  const frames = rest(b, probe);
  assert.equal(frames, 13);
  assert.deepEqual(b.pos, [17 * UNIT, 17 * UNIT, 17 * UNIT - 356]);
  assert.equal(b.speed, 0);
  assert.equal(b.state, REST);
  assert.deepEqual(run(b, probe, 1, PAD.up), []);
  assert.equal(b.state, ROLLING);
});

test("the body spins by five times the speed a frame about its across axis, against the roll", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, PAD.up);
  assert.equal(b.spin, -5 * (6 + 12 + 18));
  rest(b, probe);
  const spun = b.spin;
  run(b, probe, 5, 0);
  assert.equal(b.spin, spun);
});

test("the roll is refused off an edge beside a neighbour, and a block ahead at the ball's level takes it up", () => {
  const probe = row(15, 18, [[18, 15, 17]]);
  const b = ballAt(RULES, [17, 15, 17], TOP, UP);
  const events = run(b, probe, 3, PAD.up);
  assert.deepEqual(events, [{ refused: true }, { refused: true }, { refused: true }]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  for (let f = 0; f < 200 && !(c.state === REST && blockUnder(c)[1] === 15); f++) {
    c.pad = PAD.up;
    step(c, probe);
  }
  assert.deepEqual(c.pos, [17 * UNIT, 15 * UNIT, 17 * UNIT - 356]);
  assert.equal(c.speed, 0);
});

test("a wall ahead takes the ball up it from progress 413 with no arc, the frame swapped at once", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let swapped = null;
  for (let f = 1; f <= 60 && swapped === null; f++) {
    b.pad = PAD.up;
    if (step(b, probe).some((e) => e.face)) swapped = f;
  }
  assert.ok(swapped !== null);
  // up the wall: the heading is the old normal and the normal the old heading turned round
  assert.deepEqual(b.h, [0, 0, -1]);
  assert.deepEqual(b.n, [0, 1, 0]);
  assert.deepEqual(b.s, [1, 0, 0]);
  assert.equal(faceUnder(b), 2);
  assert.deepEqual(blockUnder(b), [17, 14, 16]);
  // laid 100 short of the wall, 100 off the floor: a progress of 100 up the wall's face
  assert.equal(b.pos[1], 15 * UNIT - 156);
  assert.equal(heightOf(b), 100);
  assert.equal(b.ramp.kind, "climb");
  const middle = [];
  for (let f = 1; f <= 6; f++) {
    b.pad = 0;
    if (step(b, probe).some((e) => e.at === "middle")) middle.push(f);
    if (f === 1) assert.equal(b.progress, 100 + 33);
  }
  assert.deepEqual(middle, [5]);
  assert.equal(b.state, REST);
  assert.deepEqual(b.pos, [17 * UNIT, 14 * UNIT + 356, 16 * UNIT]);
});

test("past the far edge of a ridge the ball goes round it in four frames and rolls on down the side", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let swapped = null;
  for (let f = 1; f <= 60 && swapped === null; f++) {
    b.pad = PAD.up;
    if (step(b, probe).some((e) => e.face)) swapped = f;
  }
  assert.ok(swapped !== null);
  assert.equal(b.state, WRAPPING);
  // down the far side: the normal is the old heading and the heading the old normal turned round
  assert.deepEqual(b.n, [0, -1, 0]);
  assert.deepEqual(b.h, [0, 0, 1]);
  assert.deepEqual(b.s, [1, 0, 0]);
  assert.equal(faceUnder(b), 3);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  // laid at the edge: in the new face's plane, 100 above the block's top
  assert.deepEqual(b.pos, [17 * UNIT, 15 * UNIT - 256, 17 * UNIT - 356]);
  assert.equal(b.ramp.kind, "wrap");
  const speed = b.speed;
  for (let f = 0; f < 4; f++) {
    b.pad = PAD.up;
    step(b, probe);
    assert.equal(b.state, f < 3 ? WRAPPING : ROLLING);
  }
  // 100 off the side and 1 past its near edge, the speed kept
  assert.deepEqual(b.pos, [17 * UNIT, 15 * UNIT - 356, 17 * UNIT - 255]);
  assert.equal(heightOf(b), 100);
  assert.equal(b.progress, 1);
  assert.equal(b.speed, speed);
  const frames = rest(b, probe);
  assert.equal(frames, 8);
  assert.deepEqual(b.pos, [17 * UNIT, 15 * UNIT - 356, 17 * UNIT]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
});

test("the lattice's edge is empty, so a row to its last cell ends in a wrap", () => {
  const cells = [];
  for (let x = 30; x <= 32; x++) cells.push([x, 17, 17]);
  const probe = lattice(...cells);
  const b = ballAt(RULES, [30, 17, 17], TOP, [1, 0, 0]);
  let wrapped = false;
  for (let f = 0; f < 80 && !wrapped; f++) {
    b.pad = PAD.up;
    wrapped = step(b, probe).some((e) => e.face);
  }
  assert.ok(wrapped);
  assert.deepEqual(blockUnder(b), [32, 17, 17]);
  assert.equal(faceUnder(b), 1);
});

test("a turn at rest swaps the frame at once and the view ramps 18 steps of 53, snapping the 70 left on the 19th", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const from = b.frame;
  const events = run(b, probe, 1, PAD.left);
  assert.deepEqual(events, [{ turned: LEFT }]);
  assert.deepEqual(b.h, [-1, 0, 0]);
  assert.deepEqual(b.s, [0, -1, 0]);
  assert.deepEqual(b.n, [0, 0, -1]);
  const to = frameOf(b.h, b.n);
  nearly(b.frame, offsetFrame(from, 2, 53, TURN));
  for (let f = 2; f <= 18; f++) {
    run(b, probe, 1, 0);
    nearly(b.frame, offsetFrame(from, 2, 53 * f, TURN));
  }
  assert.equal(b.ramp.count, 18);
  run(b, probe, 1, 0);
  assert.equal(b.ramp, null);
  assert.deepEqual(b.frame, to);
  run(b, probe, 1, PAD.right);
  assert.deepEqual(b.h, UP);
  rest(b, probe);
  assert.deepEqual(b.frame, from);
});

test("Down turns the ball about as two lefts, and a turn pressed during a turn waits for its end", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const events = run(b, probe, 1, PAD.down);
  assert.deepEqual(events, [{ turned: LEFT }]);
  const more = run(b, probe, 19, 0);
  assert.deepEqual(more, [{ turned: LEFT }]);
  assert.deepEqual(b.h, [0, 1, 0]);
  rest(b, probe);
  assert.deepEqual(b.frame, frameOf([0, 1, 0], FACE_NORMAL[TOP]));
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 1, PAD.left);
  run(c, probe, 5, 0);
  assert.deepEqual(run(c, probe, 1, PAD.right), []);
  assert.deepEqual(run(c, probe, 13, 0), [{ turned: RIGHT }]);
  assert.deepEqual(c.h, UP);
});

test("a held Left turns again from the seventh frame after a turn ends, and a roll during a turn is slowed to 10", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const turns = [];
  for (let f = 1; f <= 60; f++) {
    b.pad = PAD.left;
    if (step(b, probe).some((e) => e.turned)) turns.push(f);
  }
  assert.deepEqual(turns, [1, 1 + 19 + 6, 1 + 2 * (19 + 6)]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 1, PAD.left);
  run(c, probe, 3, PAD.up);
  assert.equal(c.state, ROLLING);
  assert.equal(c.speed, 10);
});

test("a turn pressed while rolling stops the ball at the next middle, where it turns before rolling on", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 4, PAD.up);
  assert.deepEqual(run(b, probe, 1, PAD.up | PAD.left), []);
  assert.equal(b.turn, LEFT);
  const events = run(b, probe, 20, PAD.up);
  assert.deepEqual(events, [{ at: "middle" }, { turned: LEFT }]);
  assert.deepEqual(b.h, [-1, 0, 0]);
  assert.equal(b.state, ROLLING);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
});

test("a ramp's quarter lands on the new frame exactly, for every face and heading and each of the four moves", () => {
  for (const [face, n] of FACE_NORMAL.entries())
    for (let k = 0; k < 4; k++) {
      const h = heading(face, k + 1).d;
      const s = cross(h, n);
      const f = frameOf(h, n);
      const where = `face ${face} heading ${h}`;
      // a turn left and right: the yaw offsets the game adds, 53 a frame
      nearly(offsetFrame(f, 2, QUARTER, TURN), frameOf(neg(s), n));
      nearly(offsetFrame(f, 2, -QUARTER, TURN), frameOf(s, n));
      // round an edge the pitch grows by 78s; up a wall it falls by 64s
      nearly(offsetFrame(f, 0, QUARTER, TURN), frameOf(neg(n), h));
      nearly(offsetFrame(f, 0, -QUARTER, TURN), frameOf(n, neg(h)));
      const g = turned(f, 2, 0.1);
      const col = (j) => g.slice(3 * j, 3 * j + 3);
      for (let j = 0; j < 3; j++) near(Math.hypot(...col(j)), 1, 1e-9);
      near(
        col(0).reduce((sum, v, i) => sum + v * col(1)[i], 0),
        0,
        1e-9,
      );
      assert.ok(where);
    }
});

test("a turn pressed during a turn whose ramp a climb replaces fires as the climb's ramp ends, and one asked meanwhile keeps it waiting", () => {
  const probe = row(15, 18, [[17, 15, 16]]);
  /** Left at rest, Up held through the quarter's ramp with a Right tapped on its eighth frame,
      the wall ahead climbed on the 18th, `later` pressed on the 26th and nothing after. */
  const played = (later) => {
    const b = ballAt(RULES, [17, 16, 17], TOP, [1, 0, 0]);
    const events = [];
    for (let f = 1; f <= 80; f++) {
      const pad =
        f === 1
          ? PAD.left
          : f <= 18
            ? f === 8
              ? PAD.up | PAD.right
              : PAD.up
            : f === 26
              ? later
              : 0;
      events.push(...run(b, probe, 1, pad).map((e) => [f, e]));
      if (f === 1) assert.deepEqual(b.h, UP);
      if (f === 8) assert.equal(b.waiting, RIGHT);
      if (f === 18) {
        assert.equal(b.ramp.kind, "climb");
        assert.equal(b.ramp.count, 1);
        assert.equal(faceUnder(b), 2);
        assert.deepEqual(b.h, [0, 0, -1]);
        assert.equal(b.waiting, RIGHT);
      }
      if (f === 33) assert.equal(b.ramp, null);
    }
    return { b, events };
  };
  const { b, events } = played(0);
  assert.deepEqual(events, [
    [1, { turned: LEFT }],
    [18, { face: true }],
    [24, { at: "middle" }],
    [34, { turned: RIGHT }],
  ]);
  assert.deepEqual(b.h, [1, 0, 0]);
  assert.deepEqual(b.n, [0, 1, 0]);
  assert.equal(moving(b), false);
  // a Left asked during the climb's ramp is taken at its end, and the Right waits for the Left's
  const { b: c, events: more } = played(PAD.left);
  assert.deepEqual(more.slice(3), [
    [34, { turned: LEFT }],
    [53, { turned: RIGHT }],
  ]);
  assert.deepEqual(c.h, [0, 0, -1]);
  assert.equal(moving(c), false);
});
