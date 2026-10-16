import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { frameOf } from "../../public/js/viewer/state.js";
import { heading } from "../../public/js/viewer/travel.js";
import { probeOf } from "../../public/js/viewer/walk.js";
import {
  REST,
  HOP,
  JUMP,
  ROLLING,
  FALL,
  WRAPPING,
  LEFT,
  RIGHT,
  PAD,
  ballAt,
  step,
  read,
  run as runFrame,
  place,
  turned,
  offsetFrame,
  blockUnder,
  faceUnder,
  heightOf,
  centreOf,
  moving,
  clearance,
  cellOf,
  progressOf,
  acrossOf,
} from "../../public/js/play/ball.js";

const table = objects.motion.types[30];
const UNIT = objects.block;
const TURN = objects.motion.turn;
const QUARTER = TURN / 4;
const RULES = { table, turn: TURN, unit: UNIT, jump: objects.jump };
const JUMPS = objects.jump;
const neg = (v) => v.map((x) => -x || 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearly = (f, g) => f.forEach((v, i) => near(v, g[i], 1e-9));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const column = (f, k) => f.slice(3 * k, 3 * k + 3);
/** The frame `f` with its columns turned about the world's unit axis `u` by `t` turns. */
const aboutAxis = (f, u, t) => {
  const c = Math.cos(t * 2 * Math.PI);
  const s = Math.sin(t * 2 * Math.PI);
  return [0, 1, 2].flatMap((k) => {
    const v = column(f, k);
    const w = cross(u, v);
    const d = dot(v, u) * (1 - c);
    return v.map((x, i) => x * c + w[i] * s + u[i] * d);
  });
};
/** The body aligned with the ball's frame: the side, the heading and the normal its columns. */
const aligned = (b) => [...b.s, ...b.h, ...b.n];

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

test("the body spins by five times the speed a frame about its side, against the roll, and stands at rest", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const laid = aligned(b);
  assert.deepEqual(b.body, laid);
  run(b, probe, 3, PAD.up);
  nearly(b.body, turned(laid, 0, (table.spin * (6 + 12 + 18)) / TURN));
  rest(b, probe);
  const spun = [...b.body];
  run(b, probe, 5, 0);
  assert.deepEqual(b.body, spun);
});

test("a turn in place leaves the body where it stands in the world while the side changes, and the spin then turns it about the new side", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, PAD.up);
  rest(b, probe);
  const body = [...b.body];
  const side = [...b.s];
  assert.deepEqual(run(b, probe, 1, PAD.left), [{ turned: LEFT }]);
  assert.notDeepEqual(b.s, side);
  assert.deepEqual(b.body, body);
  run(b, probe, 19, 0);
  assert.equal(b.ramp, null);
  assert.deepEqual(b.body, body);
  run(b, probe, 3, PAD.up);
  const by = (table.spin * (6 + 12 + 18)) / TURN;
  nearly(b.body, aboutAxis(body, b.s, by));
  assert.ok(aboutAxis(body, side, by).some((v, i) => Math.abs(v - b.body[i]) > 1e-6));
});

test("round an edge the body takes the arc's four turns about the side a frame behind the arc, with no spin step on those frames, a quarter in all as the frame's own", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let before = null;
  let was = null;
  let wrapped = false;
  for (let f = 1; f <= 60 && !wrapped; f++) {
    before = [...b.body];
    was = aligned(b);
    b.pad = PAD.up;
    wrapped = step(b, probe).some((e) => e.face === "wrap");
  }
  assert.ok(wrapped);
  const side = [...b.s];
  const spinStep = () => (table.spin * b.spinSpeed) / TURN;
  // the frame turns a quarter about the side at the edge; the edge's frame and the arc's first
  // take their spin steps
  nearly(aligned(b), aboutAxis(was, side, -QUARTER / TURN));
  nearly(b.body, aboutAxis(before, side, spinStep()));
  let body = [...b.body];
  run(b, probe, 1, PAD.up);
  assert.equal(b.state, WRAPPING);
  nearly(b.body, aboutAxis(body, side, spinStep()));
  // the arc's second, third and fourth frames and the frame after each turn the body by the
  // arc's step, a quarter in all
  const spun = [...b.body];
  for (let f = 2; f <= 5; f++) {
    body = [...b.body];
    run(b, probe, 1, PAD.up);
    assert.equal(b.state, f <= 3 ? WRAPPING : ROLLING, `frame ${f}`);
    assert.deepEqual(b.s, side);
    nearly(b.body, aboutAxis(body, side, table.wrap.body / TURN));
  }
  assert.equal(4 * table.wrap.body, -QUARTER);
  nearly(b.body, aboutAxis(spun, side, -QUARTER / TURN));
  // then the spin goes on
  body = [...b.body];
  run(b, probe, 1, PAD.up);
  nearly(b.body, aboutAxis(body, side, spinStep()));
});

test("up a wall the body stands while the frame turns under it, the draw of the frame after taking no spin step", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let before = null;
  let climbed = false;
  for (let f = 1; f <= 60 && !climbed; f++) {
    before = [...b.body];
    b.pad = PAD.up;
    climbed = step(b, probe).some((e) => e.face === "climb");
  }
  assert.ok(climbed);
  const side = [...b.s];
  const spinStep = () => (table.spin * b.spinSpeed) / TURN;
  nearly(b.body, aboutAxis(before, side, spinStep()));
  const stood = [...b.body];
  run(b, probe, 1, PAD.up);
  assert.deepEqual(b.s, side);
  assert.deepEqual(b.body, stood);
  run(b, probe, 1, PAD.up);
  nearly(b.body, aboutAxis(stood, side, spinStep()));
});

test("the body stays a rotation, its columns unit, perpendicular and right-handed, over a long run of rolls, turns, edges and walls", () => {
  const cells = [[17, 14, 16]];
  for (let x = 14; x <= 20; x++) for (let y = 10; y <= 18; y++) cells.push([x, y, 17]);
  const probe = lattice(...cells);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const seen = new Set();
  const check = (at) => {
    const [x, y, z] = [0, 1, 2].map((k) => column(b.body, k));
    for (const v of [x, y, z]) near(Math.hypot(...v), 1);
    for (const [u, v] of [
      [x, y],
      [y, z],
      [z, x],
    ])
      near(dot(u, v), 0);
    assert.ok(Math.abs(dot(x, cross(y, z)) - 1) < 1e-9, `frame ${at}`);
  };
  for (let f = 1; f <= 1500; f++) {
    b.pad = f % 140 < 110 ? PAD.up : f % 140 === 110 ? PAD.left : 0;
    for (const e of step(b, probe)) if (e.face || e.turned) seen.add(e.face ?? "turn");
    if (f % 100 === 0) check(f);
  }
  check(1500);
  assert.deepEqual([...seen].sort(), ["climb", "turn", "wrap"]);
});

test("place lays the body aligned with the ball's new frame, whatever it had turned by", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, PAD.up);
  assert.notDeepEqual(b.body, aligned(b));
  const face = 1;
  const h = [0, 0, 1];
  place(b, [20, 12, 17], face, h);
  assert.deepEqual(b.body, [...cross(h, FACE_NORMAL[face]), ...h, ...FACE_NORMAL[face]]);
  assert.deepEqual(b.body, aligned(b));
  assert.equal(b.mark, null);
});

test("the roll is refused off an edge beside a neighbour, and a block ahead at the ball's level takes it up", () => {
  const probe = row(15, 18, [[18, 15, 17]]);
  const b = ballAt(RULES, [17, 15, 17], TOP, UP);
  const events = run(b, probe, 3, PAD.up);
  assert.deepEqual(events, [{ refused: "edge" }, { refused: "edge" }, { refused: "edge" }]);
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

test("run tells the probe the ball between its state and its move step, before a climb's or a wrap's swap, frozen or not", () => {
  const seen = [];
  const telling = (probe) => ({
    ...probe,
    stood: (b) => seen.push({ state: b.state, n: [...b.n], cell: cellOf(b) }),
  });
  const until = (b, probe, kind) => {
    let events = [];
    for (let f = 0; f < 60 && !events.some((e) => e.face); f++) {
      seen.length = 0;
      events = run(b, probe, 1, PAD.up);
    }
    assert.deepEqual(events, [{ face: kind }]);
    assert.equal(seen.length, 1, "told once a frame");
  };
  const wall = telling(
    row(15, 18, [
      [17, 14, 17],
      [17, 14, 16],
    ]),
  );
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  until(b, wall, "climb");
  assert.deepEqual(
    seen[0],
    { state: ROLLING, n: [0, 0, -1], cell: [17, 15, 16] },
    "on the floor's cell with the floor's normal, before the swap",
  );
  assert.deepEqual(b.n, [0, 1, 0]);
  const ridge = telling(row(15, 18));
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  until(c, ridge, "wrap");
  assert.deepEqual(
    seen[0],
    { state: ROLLING, n: [0, 0, -1], cell: [17, 14, 16] },
    "in the cell beyond the edge, still rolling",
  );
  assert.equal(c.state, WRAPPING);
  const d = ballAt(RULES, [17, 18, 17], TOP, UP);
  d.frozen = true;
  seen.length = 0;
  run(d, ridge, 1, 0);
  assert.deepEqual(
    seen,
    [{ state: REST, n: [0, 0, -1], cell: [17, 18, 16] }],
    "frozen, told all the same",
  );
  assert.deepEqual(run(d, row(15, 18), 1, 0), [], "a probe without stood is asked nothing");
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
    [18, { face: "climb" }],
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

test("Space at rest hops the ball in place over the table's rows, back at rest where it stood", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const heights = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = f === 1 ? PAD.cross : 0;
    step(b, probe);
    assert.equal(b.state, HOP, `frame ${f}`);
    heights.push(17 * UNIT - 356 - b.pos[2]);
  }
  assert.deepEqual(
    heights,
    JUMPS.rows.slice(1, 31).map((r) => r[0]),
  );
  assert.equal(Math.max(...heights), 458);
  run(b, probe, 1, 0);
  assert.equal(b.state, REST);
  assert.equal(b.pos[2], 17 * UNIT - 356 + 14);
  run(b, probe, 1, 0);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, 17 * UNIT - 356]);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
});

test("a held Cross starts the next hop on the frame after the end, each hop ending 14 lower, and over a lone block the eighth ends in a fall the landing takes on the next frame, the ninth from the radius", () => {
  const probe = lattice([17, 18, 17]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const rest = 17 * UNIT - 356;
  const ends = [];
  const rests = [];
  let was = b.state;
  for (let f = 1; f <= 31 * 8; f++) {
    assert.deepEqual(run(b, probe, 1, PAD.cross), [], `frame ${f}`);
    if (was === HOP && b.state !== HOP) ends.push([f, b.state, b.pos[2] - rest]);
    if (b.state === REST) rests.push(f);
    was = b.state;
  }
  assert.deepEqual(
    ends,
    [1, 2, 3, 4, 5, 6, 7].map((k) => [31 * k, REST, 14 * k]).concat([[31 * 8, FALL, 112]]),
  );
  assert.deepEqual(
    rests,
    [1, 2, 3, 4, 5, 6, 7].map((k) => 31 * k),
  );
  assert.equal(b.v, table.fall.hop);
  assert.equal(b.speed, 0);
  assert.deepEqual(run(b, probe, 1, PAD.cross), [{ at: "landed" }]);
  assert.equal(b.state, REST);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, rest]);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  run(b, probe, 1, PAD.cross);
  assert.equal(b.state, HOP);
  assert.equal(rest - b.pos[2], JUMPS.rows[1][0]);
});

test("Cross let go after eight hops leaves the ball at rest at its radius on its own block, over a lone block and over a two-deep floor", () => {
  const rest = [17 * UNIT, 18 * UNIT, 17 * UNIT - 356];
  const held = (probe) => {
    const b = ballAt(RULES, [17, 18, 17], TOP, UP);
    run(b, probe, 31 * 8, PAD.cross);
    assert.equal(b.pos[2] - rest[2], 112);
    return b;
  };
  const lone = lattice([17, 18, 17]);
  const b = held(lone);
  assert.equal(b.state, FALL);
  assert.deepEqual(run(b, lone, 1, 0), [{ at: "landed" }]);
  const deep = lattice([17, 18, 17], [17, 18, 18]);
  const c = held(deep);
  assert.equal(c.state, REST);
  assert.deepEqual(blockUnder(c), [17, 18, 18]);
  assert.deepEqual(run(c, deep, 1, 0), []);
  for (const [d, probe] of [
    [b, lone],
    [c, deep],
  ]) {
    assert.equal(d.state, REST);
    assert.deepEqual(d.pos, rest);
    assert.deepEqual(blockUnder(d), [17, 18, 17]);
    assert.equal(heightOf(d), 100);
    assert.deepEqual(run(d, probe, 3, 0), []);
    assert.deepEqual(d.pos, rest);
    assert.equal(moving(d), false);
  }
});

test("the spin's speed is nothing on every frame of a hop after a jump with Cross held on, so the body does not turn in the hop", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(b, probe, 1, PAD.cross), [{ at: "landed" }]);
  assert.equal(b.state, REST);
  // the landing writes the spin's speed nowhere, so the body turns on the landing frame too
  assert.equal(b.spinSpeed, table.jump.speed);
  const spun = [...b.body];
  nearly(spun, turned(aligned(b), 0, (31 * table.spin * table.jump.speed) / TURN));
  for (let f = 1; f <= 31 * 2 + 1; f++) {
    run(b, probe, 1, PAD.cross);
    assert.equal(b.state, f % 31 === 0 ? REST : HOP, `frame ${f}`);
    assert.equal(b.spinSpeed, 0, `frame ${f}`);
    assert.deepEqual(b.body, spun, `frame ${f}`);
  }
});

test("Up with Space jumps the ball along the rows, 458 up on the 15th and 16th frames, and lands two blocks on", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const heights = [];
  const along = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    assert.equal(b.state, JUMP, `frame ${f}`);
    heights.push(17 * UNIT - 356 - b.pos[2]);
    along.push(18 * UNIT - b.pos[1]);
  }
  assert.deepEqual([heights[14], heights[15]], [458, 458]);
  assert.equal(along[29], 986);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  assert.equal(heightOf(b), 100 + 41);
  assert.equal(b.spinSpeed, 33);
  const events = run(b, probe, 1, 0);
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(b.pos, [17 * UNIT, 16 * UNIT, 17 * UNIT - 356]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.deepEqual(b.rest.cell, [17, 16, 17]);
});

test("a jump taken early in a block lands short of the middle's third and rolls on to the middle", () => {
  const probe = row(8, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 11, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  assert.ok(b.progress < 180, String(b.progress));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  const frames = rest(b, probe);
  assert.ok(frames > 30 && frames < 45, String(frames));
  assert.deepEqual(b.pos, [17 * UNIT, 15 * UNIT, 17 * UNIT - 356]);
});

test("a jump over nothing falls at the last row's drop, 5 a frame faster to 66, straight down, and is lost past the lattice", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.v, -56);
  assert.equal(b.speed, 0);
  const drops = [];
  const y = b.pos[1];
  for (let f = 0; f < 4; f++) {
    run(b, probe, 1, 0);
    drops.push(b.v);
  }
  assert.deepEqual(drops, [-61, -66, -66, -66]);
  assert.equal(b.pos[1], y);
  assert.ok(b.look.word > 0);
  let frames = 0;
  let events = [];
  while (!events.some((e) => e.lost) && frames < 400) {
    events = run(b, probe, 1, 0);
    frames++;
  }
  assert.ok(
    events.some((e) => e.lost),
    "lost",
  );
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.equal(b.state, REST);
  assert.deepEqual(b.h, UP);
});

test("a jump's failed landing takes the last frame's change along the normal downward whichever way it went", () => {
  const rows = JUMPS.rows.map((r) => [...r]);
  rows[29][0] = rows[28][0] + 40;
  const probe = row(15, 18);
  const b = ballAt({ ...RULES, jump: { count: JUMPS.count, rows } }, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.v, -40);
});

test("a jump that finds no block two blocks on comes straight down in that cell, onto LEVEL 9's floor three blocks below, where a flat row lands two blocks on", () => {
  // LEVEL 9 at 23,13,21: the second block ahead is gone, and a floor stands three blocks down
  const shape = lattice(
    [23, 13, 21],
    [23, 12, 21],
    [23, 11, 24],
    [23, 12, 24],
    [23, 13, 24],
    [22, 11, 24],
    [22, 12, 21],
  );
  const b = ballAt(RULES, [23, 13, 21], TOP, UP);
  run(b, shape, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.deepEqual(b.pos, [23 * UNIT, 11 * UNIT, 21 * UNIT - 356]);
  let landed = null;
  for (let f = 32; f <= 80 && landed === null; f++) {
    const events = run(b, shape, 1, 0);
    assert.deepEqual(cellOf(b).slice(0, 2), [23, 11], `frame ${f}`);
    if (events.some((e) => e.at === "landed")) landed = f;
  }
  assert.equal(landed, 55);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [23, 11, 24]);
  assert.deepEqual(b.pos, [23 * UNIT, 11 * UNIT, 24 * UNIT - 356]);
  assert.equal(b.progress, 256);
  const flat = lattice(...[8, 9, 10, 11, 12, 13].map((y) => [23, y, 21]));
  const c = ballAt(RULES, [23, 13, 21], TOP, UP);
  run(c, flat, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(c, flat, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(blockUnder(c), [23, 11, 21]);
  assert.deepEqual(c.pos, [23 * UNIT, 11 * UNIT, 21 * UNIT - 356]);
});

test("a bounce's speed back decays by 6 a frame to nothing while the ball falls", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  for (let f = 1; f <= 31 && b.state !== FALL; f++) run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, -33);
  const speeds = [];
  for (let f = 0; f < 8 && b.state === FALL; f++) {
    run(b, probe, 1, 0);
    speeds.push(b.speed);
  }
  assert.deepEqual(speeds, [-27, -21, -15, -9, -3, 0, 0, 0]);
});

test("a forward speed left in a falling ball's word by whatever dropped it is gone on the next frame, the centre unmoved along the heading", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  b.speed = table.rolling.top;
  const y = b.pos[1];
  run(b, probe, 1, 0);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.pos[1], y);
});

test("a block met above drops the ball with no speed forward and no spin, straight down onto the floor beneath", () => {
  const probe = row(15, 18, [[17, 15, 15]]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(b, probe, 1, PAD.up | PAD.cross);
    if (b.state === FALL) hit = f;
  }
  assert.equal(hit, 7);
  assert.equal(b.speed, 0);
  assert.equal(b.spinSpeed, 0);
  assert.equal(b.v, -39);
  const y = b.pos[1];
  let events = [];
  for (let f = 0; f < 20 && !events.some((e) => e.at === "landed"); f++) {
    events = run(b, probe, 1, 0);
    assert.equal(b.pos[1], y);
  }
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
});

test("a wall met in the air throws the ball back and drops it, and it lands on the floor behind", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let bounced = null;
  for (let f = 1; f <= 31 && bounced === null; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    if (b.state === FALL) bounced = f;
  }
  assert.ok(bounced !== null && bounced < 31, String(bounced));
  assert.ok(b.speed < 0);
  rest(b, probe);
  assert.equal(b.state, REST);
  assert.ok([15, 16].includes(blockUnder(b)[1]), String(blockUnder(b)));
  assert.equal(heightOf(b), 100);
});

test("the view's word grows by a rate rising from 4 a frame over a fall, keeps its rate over a block met in the fall, and comes back by 18 once the ball is down", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 23, PAD.up | PAD.cross);
  assert.equal(b.look.word, 0);
  const words = [];
  for (let f = 0; f < 6; f++) {
    run(b, probe, 1, 0);
    words.push(b.look.word);
  }
  assert.deepEqual(words, [4, 9, 15, 22, 30, 39]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  c.look.word = 100;
  run(c, probe, 1, 0);
  assert.equal(c.look.word, 82);
  assert.ok(moving(c));
  rest(c, probe);
  assert.equal(c.look.word, 0);
  // a block two below the floor comes under the fall: the word comes back with the rate kept,
  // until the landing starts it over
  const lower = row(15, 18, [[17, 14, 19]]);
  const d = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(d, lower, 31, PAD.up | PAD.cross);
  assert.equal(d.state, FALL);
  const seen = [];
  for (let f = 0; f < 60 && d.state === FALL; f++) {
    const before = { word: d.look.word, rate: d.look.rate };
    run(d, lower, 1, 0);
    if (d.state === FALL && d.look.word < before.word)
      seen.push([before.word - d.look.word, d.look.rate === before.rate]);
  }
  assert.ok(seen.length > 0);
  assert.ok(seen.every(([back, kept]) => back === 18 && kept));
  assert.equal(d.state, REST);
  assert.deepEqual(blockUnder(d), [17, 14, 19]);
  assert.equal(d.look.rate, table.look.from);
});

test("a landing past the middle at an edge the side rule refuses rests where the ball came down", () => {
  const probe = row(15, 18, [[18, 15, 17]]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 19, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  const launched = b.progress;
  assert.ok(launched > 256, String(launched));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  let landed = null;
  for (let f = 0; f < 40 && landed === null; f++)
    if (run(b, probe, 1, PAD.up).some((e) => e.at === "landed")) landed = b.progress;
  assert.equal(landed, launched);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.state, ROLLING);
  run(b, probe, 5, PAD.up);
  assert.equal(b.state, REST);
  assert.equal(b.progress, launched);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
});

test("a landing at the climb's progress under a wall climbs on the frame after, not the landing's", () => {
  const probe = row(14, 18, [[17, 14, 16]]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 23, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  assert.ok(b.progress >= table.rolling.climb, String(b.progress));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  let events = [];
  for (let f = 0; f < 40 && !events.some((e) => e.at === "landed"); f++)
    events = run(b, probe, 1, PAD.up);
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.ramp, null);
  assert.deepEqual(run(b, probe, 1, PAD.up), [{ face: "climb" }]);
  assert.equal(b.ramp.kind, "climb");
  assert.deepEqual(blockUnder(b), [17, 14, 16]);
});

test("the shadow's height is the centre's off the block under it, and nothing over nothing", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  assert.equal(clearance(b, probe), 100);
  // over the hop the height is the centre's while the shadow could show, and nothing above a block's
  const seen = new Set();
  for (let f = 1; f <= 30; f++) {
    run(b, probe, 1, f === 1 ? PAD.cross : 0);
    assert.equal(b.state, HOP);
    const h = heightOf(b);
    assert.equal(clearance(b, probe), h <= UNIT ? h : Infinity, `frame ${f}`);
    seen.add(h <= UNIT);
  }
  assert.deepEqual([...seen].sort(), [false, true]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(c, probe, 31, PAD.up | PAD.cross);
  assert.equal(c.state, FALL);
  assert.equal(clearance(c, probe), Infinity);
  const lower = row(15, 18, [[17, 14, 19]]);
  const d = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(d, lower, 31, PAD.up | PAD.cross);
  let over = null;
  for (let f = 0; f < 60 && over === null; f++) {
    run(d, lower, 1, 0);
    if (d.state === FALL && clearance(d, lower) !== Infinity) over = clearance(d, lower);
  }
  assert.ok(over !== null && over > 0 && over < 2 * UNIT, String(over));
});

test("read then run is step, frame for frame, over a roll, two turns, two jumps and a turn about", () => {
  const probe = plate();
  const a = ballAt(RULES, [17, 18, 17], TOP, UP);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const padAt = (f) => {
    if (f <= 10) return PAD.up;
    if (f === 11) return PAD.up | PAD.left;
    if (f <= 18) return PAD.up;
    if (f === 38) return PAD.right;
    if (f >= 58 && f <= 90) return PAD.up | PAD.cross;
    return f === 91 ? PAD.down : 0;
  };
  const events = [];
  for (let f = 1; f <= 200; f++) {
    a.pad = b.pad = padAt(f);
    const out = [];
    read(b, probe, out);
    assert.equal(runFrame(b, probe, out), out);
    assert.deepEqual(out, step(a, probe), `frame ${f}`);
    assert.deepEqual(b, a, `frame ${f}`);
    events.push(...out);
  }
  assert.ok(events.some((e) => e.turned === LEFT));
  assert.ok(events.some((e) => e.turned === RIGHT));
  assert.equal(events.filter((e) => e.at === "landed").length, 2);
  assert.equal(a.state, REST);
  assert.equal(moving(a), false);
});

test("a landing stands between read and run, and run clears it as it begins", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 30, PAD.up | PAD.cross);
  assert.equal(b.landed, false);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.equal(b.landed, true);
  b.pad = 0;
  const out = [];
  read(b, probe, out);
  assert.equal(b.landed, true);
  runFrame(b, probe, out);
  assert.equal(b.landed, false);
  assert.deepEqual(out, []);
});

test("frozen, the ball's state, its move and its landing stand still while a ramp, the look and the spin go on", () => {
  const probe = row(10, 18);
  // a roll a frame short of the middle: the centre, the state and the speed hold, no stop, the
  // spin on by the speed's copy, and the middle comes on the frame after the freeze
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 17, PAD.up);
  assert.equal(b.state, ROLLING);
  const rolling = { pos: [...b.pos], speed: b.speed, body: [...b.body], spinSpeed: b.spinSpeed };
  b.frozen = true;
  assert.deepEqual(run(b, probe, 5, 0), []);
  assert.deepEqual(b.pos, rolling.pos);
  assert.equal(b.state, ROLLING);
  assert.equal(b.speed, rolling.speed);
  nearly(b.body, turned(rolling.body, 0, (5 * table.spin * rolling.spinSpeed) / TURN));
  b.frozen = false;
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "middle" }]);
  assert.equal(b.state, REST);
  // a turn's ramp runs to its end
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 1, PAD.left);
  c.frozen = true;
  run(c, probe, 17, 0);
  assert.equal(c.ramp.count, 18);
  run(c, probe, 1, 0);
  assert.equal(c.ramp, null);
  assert.deepEqual(c.frame, frameOf(c.h, c.n));
  // a fall hangs in the air while the look's word grows on
  const edge = row(15, 18);
  const d = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(d, edge, 33, PAD.up | PAD.cross);
  assert.equal(d.state, FALL);
  const aloft = [...d.pos];
  const word = d.look.word;
  d.frozen = true;
  run(d, edge, 5, 0);
  assert.deepEqual(d.pos, aloft);
  assert.equal(d.state, FALL);
  assert.ok(d.look.word > word);
  // a landing waits: hung over a block, the ball lands once let go
  const lower = row(15, 18, [[17, 14, 19]]);
  const e = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(e, lower, 31, PAD.up | PAD.cross);
  for (let f = 0; f < 100 && !(clearance(e, lower) < 2 * table.rolling.resume); f++)
    run(e, lower, 1, 0);
  assert.equal(e.state, FALL);
  const hung = [...e.pos];
  e.frozen = true;
  assert.deepEqual(run(e, lower, 20, 0), []);
  assert.deepEqual(e.pos, hung);
  assert.equal(e.state, FALL);
  assert.equal(e.landed, false);
  e.frozen = false;
  assert.ok(run(e, lower, 3, 0).some((ev) => ev.at === "landed"));
  assert.deepEqual(blockUnder(e), [17, 14, 19]);
});

test("a ball at rest whose block goes falls at the fall's start, and lands on the block below", () => {
  const gone = new Set();
  const base = row(15, 18, [[17, 18, 19]]);
  const probe = { solid: (c) => !gone.has(cellKey(...c)) && base.solid(c) };
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, 0);
  assert.equal(b.state, REST);
  gone.add(cellKey(17, 18, 17));
  const at = [...b.pos];
  assert.deepEqual(run(b, probe, 1, 0), []);
  assert.equal(b.state, FALL);
  assert.equal(b.v, table.fall.start);
  assert.equal(b.speed, 0);
  assert.deepEqual(b.pos, at);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  const events = [];
  for (let f = 0; f < 100 && b.state === FALL; f++) events.push(...run(b, probe, 1, 0));
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 18, 19]);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, 19 * UNIT - 356]);
  assert.equal(heightOf(b), 100);
});

test("place stands the ball at rest on a face, the ramp and the look gone and the frame cut", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, PAD.left);
  assert.equal(b.ramp.kind, "quarter");
  b.look.word = 100;
  const face = 1;
  const h = [0, 0, 1];
  place(b, [20, 12, 17], face, h);
  assert.equal(b.ramp, null);
  assert.deepEqual(b.look, { word: 0, rate: table.look.from });
  assert.deepEqual(b.frame, frameOf(h, FACE_NORMAL[face]));
  assert.equal(b.state, REST);
  assert.equal(b.speed, 0);
  assert.deepEqual(blockUnder(b), [20, 12, 17]);
  assert.equal(faceUnder(b), face);
  assert.deepEqual(b.h, h);
  assert.equal(heightOf(b), 100);
  assert.deepEqual(b.rest, { cell: [20, 12, 17], face, h });
  assert.equal(moving(b), false);
  assert.deepEqual(run(b, probe, 1, 0), []);
  assert.deepEqual(b.pos, [20 * UNIT + 356, 12 * UNIT, 17 * UNIT]);
});

test("a lost ball is left where it fell and says so each frame, and step alone puts it back where it last rested", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  let out = [];
  for (let f = 0; f < 400 && !out.some((e) => e.lost); f++) {
    b.pad = 0;
    out = [];
    read(b, probe, out);
    runFrame(b, probe, out);
  }
  assert.deepEqual(out, [{ lost: true }]);
  assert.equal(b.state, FALL);
  assert.ok(b.pos[2] >= table.fall.lost[1] * UNIT, String(b.pos[2]));
  assert.deepEqual(b.rest, { cell: [17, 16, 17], face: TOP, h: UP });
  const fell = [...b.pos];
  out = [];
  read(b, probe, out);
  runFrame(b, probe, out);
  assert.deepEqual(out, [{ lost: true }]);
  assert.notDeepEqual(b.pos, fell);
  assert.deepEqual(step(b, probe), [{ lost: true }]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.deepEqual(b.h, UP);
  assert.equal(moving(b), false);
});

test("progressOf and acrossOf measure the centre's way into its cell along the heading and along the side, and a quarter turn swaps them", () => {
  const b = ballAt(RULES, [17, 17, 17], TOP, UP);
  assert.equal(progressOf(b), UNIT / 2);
  assert.equal(acrossOf(b), UNIT / 2);
  b.pos = b.pos.map((v, i) => v + b.h[i] * 50);
  assert.equal(progressOf(b), UNIT / 2 + 50);
  assert.equal(acrossOf(b), UNIT / 2);
  b.pos = b.pos.map((v, i) => v + b.s[i] * 30);
  assert.equal(acrossOf(b), UNIT / 2 + 30);
  assert.equal(progressOf(b), UNIT / 2 + 50);
  b.pad = PAD.left;
  step(b, row(10, 18));
  assert.equal(progressOf(b), UNIT / 2 - 30);
  assert.equal(acrossOf(b), UNIT / 2 + 50);
  assert.equal(b.progress, progressOf(b), "the word run keeps is the same measure");
});

/** `probe` with the blocks given slick, as ice is. */
const slippery = (probe, ...cells) => {
  const ice = new Set(cells.map((c) => cellKey(...c)));
  return { ...probe, slick: (cell) => ice.has(cellKey(...cell)) };
};

test("where the probe says the block under is slick the roll goes on over an edge beside a neighbour, into the cell beyond, and falls from the roll's drop", () => {
  const stone = row(15, 18, [[18, 15, 17]]);
  const ice = slippery(stone, [17, 15, 17]);
  const b = ballAt(RULES, [17, 15, 17], TOP, UP);
  const events = [];
  // the input routine drops the request at such an edge whatever the block, as the game's does,
  // and the rules make it again on ice after it, which is what a frame with the request forced is
  const forced = (probe) => {
    const out = [];
    b.pad = PAD.up;
    read(b, probe, out);
    b.forward = true;
    runFrame(b, probe, out);
    events.push(...out);
  };
  forced(stone);
  assert.equal(b.state, REST, "stone refuses the edge");
  forced(ice);
  assert.equal(b.state, ROLLING);
  let dropped = null;
  for (let f = 0; f < 40 && dropped === null; f++) {
    const before = b.progress;
    forced(ice);
    if (b.state === FALL) dropped = { before, cell: cellOf(b) };
  }
  assert.ok(dropped, "the ball falls");
  assert.equal(dropped.cell[1], 14, "in the cell beyond the edge");
  const [from] = table.rolling.over;
  assert.ok(
    dropped.before >= from && dropped.before < from + table.rolling.top,
    String(dropped.before),
  );
  assert.ok(!events.some((e) => e.face), "nothing takes it round");
});

test("a way the caller sets throws the jump back as off a wall from the wall's progress where the heading differs from it, and is cleared where it lies along", () => {
  const probe = row(10, 18);
  const rows = JUMPS.rows;
  // the first row that brings the centre past the wall's progress in its own cell
  const first = rows.findIndex((r) => UNIT / 2 - r[2] >= table.jump.wall);
  const jump = (way) => {
    const b = ballAt(RULES, [17, 18, 17], TOP, UP);
    const ways = [];
    for (let f = 0; f <= first; f++) {
      b.pad = PAD.up | PAD.cross;
      b.way = way;
      step(b, probe);
      ways.push(b.way);
      if (b.state !== JUMP) break;
    }
    return { b, ways };
  };
  const against = jump([0, 1, 0]);
  assert.equal(against.b.state, FALL);
  assert.equal(
    against.ways.length,
    first + 1,
    "thrown back on the first row past the wall's progress",
  );
  assert.equal(against.b.speed, rows[first][2] - rows[first - 1][2], "back at the row's advance");
  assert.equal(against.b.v, table.jump.bounce, "dropped at the bounce's start while rising");
  assert.deepEqual(against.b.way, [0, 1, 0], "the way stands through a bounce");
  rest(against.b, probe);
  assert.deepEqual(blockUnder(against.b), [17, 18, 17]);

  const along = jump(UP);
  assert.equal(along.b.state, JUMP, "no wall along the way");
  assert.deepEqual(
    along.ways.slice(0, -1),
    Array(first).fill(UP),
    "kept short of the wall's progress",
  );
  assert.equal(along.ways.at(-1), null, "cleared on the row past it");
  for (let f = 0; f < 40 && along.b.state === JUMP; f++) {
    along.b.pad = 0;
    step(along.b, probe);
  }
  rest(along.b, probe);
  assert.deepEqual(blockUnder(along.b), [17, 16, 17], "down two blocks on");
});

/** `probe` with the blocks given brittle, as a crumbling block is. */
const brittle = (probe, ...cells) => {
  const set = new Set(cells.map((c) => cellKey(...c)));
  return { ...probe, brittle: (cell) => set.has(cellKey(...cell)) };
};
const EDGE = objects.motion.kinds["6"].edge;
const HELD = { ...RULES, edge: EDGE };

test("on a block the probe says is brittle, with the floor ahead empty and nothing beside, a rolling ball loses the forward request and its speed from the hold's progress and is set back from the push's, so it never goes round the edge it would on stone", () => {
  const stone = row(15, 18);
  const probe = brittle(stone, [17, 15, 17]);
  const rolled = (rules, probe) => {
    const b = ballAt(rules, [17, 16, 17], TOP, UP);
    const frames = [];
    for (let f = 1; f <= 120; f++) {
      const before = { progress: b.progress, speed: b.speed, block: blockUnder(b) };
      const events = run(b, probe, 1, PAD.up);
      frames.push({
        f,
        before,
        events,
        progress: b.progress,
        speed: b.speed,
        forward: b.forward,
        block: blockUnder(b),
      });
    }
    return { b, frames };
  };
  const wrapped = ({ frames }) => frames.some((s) => s.events.some((e) => e.face === "wrap"));
  assert.ok(wrapped(rolled(RULES, stone)), "stone takes the ball round the far edge");
  assert.ok(wrapped(rolled(HELD, stone)), "as does a probe that calls nothing brittle");
  assert.ok(wrapped(rolled(RULES, probe)), "and rules without the edge rule");
  const { b, frames } = rolled(HELD, probe);
  assert.ok(!wrapped({ frames }), "held, the ball never goes round");
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.state, ROLLING);
  const onBlock = (s) => s.before.block[1] === 15;
  const first = frames.find((s) => onBlock(s) && s.before.progress >= EDGE.hold);
  const i = frames.indexOf(first);
  assert.ok(frames[i - 1].before.progress < EDGE.hold);
  assert.ok(frames[i - 1].forward && frames[i - 1].speed === table.rolling.top);
  assert.equal(first.forward, false, "the request dropped");
  assert.equal(first.speed, table.rolling.gain, "the speed dropped, and grown by the gain alone");
  assert.equal(first.progress, first.before.progress + table.rolling.gain);
  const pushed = frames.find((s) => onBlock(s) && s.before.progress >= EDGE.back);
  assert.ok(pushed, "the push's progress reached by the creep");
  assert.equal(
    pushed.progress,
    pushed.before.progress - EDGE.push + table.rolling.gain,
    "set back along the heading, then on by the gain",
  );
  const after = frames.slice(i);
  assert.ok(after.every((s) => !s.forward && s.speed === table.rolling.gain));
  assert.ok(after.every((s) => s.progress >= EDGE.hold && s.progress < table.rolling.wrap));
  assert.ok(after.every((s) => s.block[1] === 15));
  assert.ok(
    after.filter((s) => s.before.progress >= EDGE.back).length > 1,
    "pushed back more than once",
  );
});

test("the hold asks a rolling ball with no jump asked: from rest past the hold's progress the roll starts and is held on the frame after, Cross with Up jumps off the block, with the floor ahead there the roll goes on at the top speed, and a block beside refuses the edge as on stone", () => {
  const probe = brittle(row(15, 18), [17, 15, 17]);
  const b = ballAt(HELD, [17, 15, 17], TOP, UP);
  b.pos = b.pos.map((v, i) => v + b.h[i] * 100);
  b.progress = progressOf(b);
  assert.ok(b.progress > EDGE.hold);
  assert.deepEqual(run(b, probe, 1, PAD.up), []);
  assert.equal(b.state, ROLLING);
  assert.equal(b.forward, true, "not held from rest, the speed being nothing");
  assert.equal(b.speed, table.rolling.gain);
  run(b, probe, 1, PAD.up);
  assert.equal(b.forward, false, "held once rolling");
  assert.equal(b.speed, table.rolling.gain);
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP, "the jump asked lets the request stand");

  const floor = brittle(row(14, 18), [17, 15, 17]);
  const c = ballAt(HELD, [17, 16, 17], TOP, UP);
  const speeds = new Set();
  for (let f = 0; f < 60 && blockUnder(c)[1] !== 14; f++) {
    run(c, floor, 1, PAD.up);
    if (blockUnder(c)[1] === 15) speeds.add(c.speed);
  }
  assert.deepEqual(blockUnder(c), [17, 14, 17]);
  assert.deepEqual([...speeds], [table.rolling.top]);
  assert.equal(c.forward, true);

  const beside = brittle(row(15, 18, [[18, 15, 17]]), [17, 15, 17]);
  const d = ballAt(HELD, [17, 15, 17], TOP, UP);
  assert.deepEqual(run(d, beside, 1, PAD.up), [{ refused: "edge" }]);
  assert.equal(d.state, REST);
});

test("the hold asks nothing of the forward request: with Up released past the middle of a brittle block at a row's end, where stone would take the ball round, it is held from the hold's progress as with Up held", () => {
  const stone = row(15, 18);
  const probe = brittle(stone, [17, 15, 17]);
  // Up held until the ball is past the middle of the row's last block, then released
  const released = (probe) => {
    const b = ballAt(HELD, [17, 16, 17], TOP, UP);
    const frames = [];
    let up = true;
    for (let f = 1; f <= 120; f++) {
      const before = { progress: b.progress, block: blockUnder(b) };
      if (before.block[1] === 15 && before.progress > table.rolling.middle) up = false;
      const events = run(b, probe, 1, up ? PAD.up : 0);
      frames.push({ before, events, up, progress: b.progress, speed: b.speed, forward: b.forward });
    }
    return { b, frames };
  };
  const wrapped = ({ frames }) => frames.some((s) => s.events.some((e) => e.face === "wrap"));
  const onStone = released(stone);
  assert.ok(
    onStone.frames.some((s) => !s.up),
    "Up released",
  );
  assert.ok(wrapped(onStone), "stone takes the ball round the far edge with Up released");
  const { b, frames } = released(probe);
  assert.ok(!wrapped({ frames }), "held, the ball never goes round");
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.state, ROLLING);
  const onBlock = frames.filter((s) => s.before.block[1] === 15 && !s.up);
  const held = onBlock.filter((s) => s.before.progress >= EDGE.hold);
  assert.ok(held.length > 5, String(held.length));
  assert.ok(
    held.every((s) => !s.forward && s.speed === table.rolling.gain),
    "the request dropped and the speed grown from nothing again, with Up released",
  );
  assert.ok(
    onBlock
      .filter((s) => s.before.progress < EDGE.hold)
      .every((s) => s.speed === table.rolling.top),
    "rolling on at the top speed to the hold",
  );
});
