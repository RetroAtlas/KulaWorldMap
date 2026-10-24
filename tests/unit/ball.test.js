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
  positionOf,
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
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

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

test("round an edge the body takes the arc's four turns about the side a frame behind the arc, with no spin step on those frames, a quarter in all as the frame's own turn", () => {
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
  // frame take their spin steps
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

test("place with the body kept carries its turn within the frame onto the new footing, the body in the world turned with the frame, and lays an aligned body aligned", () => {
  const probe = plate();
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, PAD.up);
  /** The body's columns along the side, the heading and the normal. */
  const within = (b) =>
    [0, 1, 2].flatMap((k) => {
      const v = column(b.body, k);
      return [dot(b.s, v), dot(b.h, v), dot(b.n, v)];
    });
  const before = { body: [...b.body], within: within(b) };
  assert.ok(before.within.some((v, i) => Math.abs(v - IDENTITY[i]) > 1e-6));
  place(b, [20, 12, 17], 1, [0, 0, 1], { kept: true });
  nearly(within(b), before.within);
  assert.ok(b.body.some((v, i) => Math.abs(v - before.body[i]) > 1e-6));
  assert.equal(b.state, REST);
  place(b, [17, 18, 17], TOP, UP);
  place(b, [20, 12, 17], 1, [0, 0, 1], { kept: true });
  assert.deepEqual(b.body, aligned(b));
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

test("a Down bit is not read as a press, play asking nothing of Down, and a turn pressed during a turn waits for its end", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  assert.deepEqual(run(b, probe, 1, PAD.down), []);
  assert.deepEqual(run(b, probe, 40, 0), []);
  assert.deepEqual([b.h, b.turn, b.waiting, b.frame], [UP, 0, 0, IDENTITY]);
  assert.equal(moving(b), false);
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
  // a Left asked during the climb's ramp is taken at its end, and the Right waits for the Left's ramp
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

test("a forward jump on a face whose normal points the positive way along its axis, +x or the underside, fails the snap's landing, the point the radius under the centre rounding into the cell beyond the block, and lands on the frame after where the snap left it", () => {
  for (const face of [1, 5]) {
    const probe = lattice([17, 18, 17], [17, 16, 17]);
    const b = ballAt(RULES, [17, 18, 17], face, UP);
    const snapped = [17 * UNIT, 16 * UNIT, 17 * UNIT].map((c, i) => c + FACE_NORMAL[face][i] * 356);
    run(b, probe, 30, PAD.up | PAD.cross);
    assert.equal(b.state, JUMP, `face ${face}`);
    assert.deepEqual(run(b, probe, 1, 0), [], `face ${face}: the snap lands nothing`);
    assert.deepEqual([b.state, b.pos], [FALL, snapped], `face ${face}`);
    assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }], `face ${face}: the fall lands`);
    assert.deepEqual([b.state, b.pos], [REST, snapped], `face ${face}`);
    assert.deepEqual(blockUnder(b), [17, 16, 17], `face ${face}`);
    assert.equal(heightOf(b), 100, `face ${face}`);
  }
});

test("a jump taken early in a block lands short of the middle's third at rest with the roll asked, which the pad's reading drops, so with Up released the ball rests where it landed and with Up held it rolls on, from the speed the air left it", () => {
  const probe = row(8, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 11, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  const from = b.progress;
  assert.ok(from < table.fall.short, String(from));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  run(b, probe, 29, PAD.up);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.progress, from);
  assert.deepEqual([b.state, b.forward, b.speed], [REST, true, table.rolling.top]);
  assert.deepEqual(run(b, probe, 1, 0), [], "the pad's reading drops the request");
  assert.deepEqual([b.state, b.forward, b.progress], [REST, false, from]);
  assert.equal(b.speed, table.rolling.top, "the speed stands as the landing left it");
  assert.equal(rest(b, probe), 0);
  run(b, probe, 1, PAD.up);
  assert.equal(b.state, ROLLING);
  assert.equal(b.progress, from + table.rolling.top, "off at the top speed from the first frame");

  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 11, PAD.up);
  run(c, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(c, probe, 1, PAD.up), [{ at: "landed" }]);
  assert.deepEqual(
    [c.state, c.forward, c.speed, c.progress],
    [REST, true, table.rolling.top, from],
  );
  run(c, probe, 1, PAD.up);
  assert.equal(c.state, ROLLING);
  assert.equal(c.progress, from + table.rolling.top);
  rest(c, probe);
  assert.deepEqual(c.pos, [17 * UNIT, 15 * UNIT, 17 * UNIT - 356], "on to the middle, Up let go");
});

test("a jump landing leaves the speed at the top for the roll asked next, where a fall's landing leaves it at nothing, so a ball that rests after a jump rolls off at the top speed and one that rests after a fall grows its speed from the roll's gain", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual([b.state, b.speed], [REST, table.jump.speed]);
  run(b, probe, 3, 0);
  assert.deepEqual([b.state, b.speed], [REST, table.jump.speed]);
  run(b, probe, 1, PAD.up);
  assert.deepEqual([b.state, b.speed], [ROLLING, table.rolling.top]);

  const fallen = lattice([17, 18, 17], [17, 17, 17], [17, 16, 18]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, fallen, 30, PAD.up | PAD.cross);
  let landed = null;
  for (let f = 31; f <= 80 && landed === null; f++)
    if (run(c, fallen, 1, 0).some((e) => e.at === "landed")) landed = f;
  assert.ok(landed !== null, "down onto the block below");
  assert.deepEqual([c.state, c.speed], [REST, 0]);
  run(c, fallen, 1, PAD.up);
  assert.deepEqual([c.state, c.speed], [ROLLING, table.rolling.gain]);
});

test("the long jump's word scales every row's three halfwords three halves over, the odd half dropped toward nothing, counts the rows to 31 and lands three blocks on, 687 up at its apex and 1536 along, the landing clearing the word", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const j = table.jump;
  b.long = j.arm;
  const [over, under] = j.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  const heights = [];
  const along = [];
  const words = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    assert.equal(b.state, JUMP, `frame ${f}`);
    const [height, right, back] = JUMPS.rows[f - 1].map(scaled);
    assert.deepEqual(
      b.pos,
      [17 * UNIT + right, 18 * UNIT + back, 17 * UNIT - 356 - height],
      `frame ${f}`,
    );
    heights.push(17 * UNIT - 356 - b.pos[2]);
    along.push(18 * UNIT - b.pos[1]);
    words.push(b.long);
  }
  assert.deepEqual([heights[14], heights[15]], [687, 687]);
  assert.equal(along[29], scaled(986));
  assert.deepEqual(
    words,
    Array.from({ length: 30 }, (_, i) => j.arm + i + 1),
  );
  assert.ok(b.long >= j.long);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT - j.far, 17 * UNIT - 356]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.long, 0);
  assert.equal(b.state, REST);
  // with the word at nothing the same rows run unscaled and land two blocks on
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 30, PAD.up | PAD.cross);
  assert.equal(c.long, 0);
  run(c, probe, 1, 0);
  assert.deepEqual(blockUnder(c), [17, 16, 17]);
});

test("the long jump's failed landing comes straight down three blocks on at the scaled last drop, with the word cleared", () => {
  const probe = row(16, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  b.long = table.jump.arm;
  const [over, under] = table.jump.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.v, -(scaled(JUMPS.rows[28][0]) - scaled(JUMPS.rows[29][0])));
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT - table.jump.far, 17 * UNIT - 356]);
  assert.equal(b.long, 0);
});

test("a wall met in the air and a block met above clear the long jump's word with the bounce and the drop, and a landing on a platform clears it as it rides", () => {
  const j = table.jump;
  const [over, under] = j.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  const walled = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
    [17, 14, 14],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  b.long = j.arm;
  run(b, walled, 1, PAD.up | PAD.cross);
  for (let f = 2; f <= 31 && b.state === JUMP; f++) run(b, walled, 1, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.ok(b.speed < 0, "thrown back");
  assert.equal(b.long, 0);

  const roofed = row(15, 18, [
    [17, 16, 15],
    [17, 15, 15],
  ]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  c.long = j.arm;
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(c, roofed, 1, PAD.up | PAD.cross);
    if (c.state === FALL) hit = f;
  }
  assert.equal(hit, 5, "the scaled rows lift the ball past the wall's height sooner");
  assert.deepEqual([c.speed, c.spinSpeed], [0, 0]);
  assert.equal(c.v, -(scaled(JUMPS.rows[4][0]) - scaled(JUMPS.rows[3][0])));
  assert.equal(c.long, 0);

  const d = ballAt(RIDDEN, [17, 17, 17], TOP, UP);
  d.long = j.arm;
  const at = { travel: [-300, 0, 0] };
  const body = [
    [17, 14, 17],
    [18, 14, 17],
    [19, 14, 17],
  ];
  const probe = carried(row(17, 18), body, () => at.travel, d);
  run(d, probe, 1, PAD.up | PAD.cross);
  for (let f = 1; f <= 40 && !d.riding; f++) run(d, probe, 1, 0);
  assert.deepEqual(d.riding, { key: "rail" }, "three blocks on, onto the body");
  assert.deepEqual(blockUnder(d), [17, 14, 17]);
  assert.equal(d.long, 0);
});

test("outside the jump's state the frame clears a long word that has counted past its arming and keeps one armed, so a word armed at rest waits for the jump", () => {
  const probe = row(10, 18);
  const j = table.jump;
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  b.long = j.keep;
  run(b, probe, 1, 0);
  assert.equal(b.long, 0);
  b.long = j.keep + 5;
  run(b, probe, 1, PAD.up);
  assert.deepEqual([b.state, b.long], [ROLLING, 0]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  c.long = j.arm;
  run(c, probe, 3, 0);
  assert.equal(c.long, j.arm, "kept at rest");
  run(c, probe, 1, PAD.cross);
  assert.deepEqual([c.state, c.long], [HOP, j.arm], "kept through a hop");
  run(c, probe, 30, 0);
  assert.equal(c.state, REST);
  run(c, probe, 1, PAD.up | PAD.cross);
  assert.deepEqual([c.state, c.long], [JUMP, j.arm + 1], "and counted from the jump's first row");
});

test("a hop's end over a block sets the landing flag as a landing does, seen between read and run on the frame after, and a hop's end over nothing does not", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 1, PAD.cross);
  run(b, probe, 29, 0);
  assert.deepEqual([b.state, b.landed], [HOP, false]);
  assert.deepEqual(run(b, probe, 1, 0), []);
  assert.deepEqual([b.state, b.landed], [REST, true]);
  b.pad = 0;
  const out = [];
  read(b, probe, out);
  assert.equal(b.landed, true);
  runFrame(b, probe, out);
  assert.equal(b.landed, false);

  const lone = lattice([17, 18, 17]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, lone, 31 * 8, PAD.cross);
  assert.deepEqual([c.state, c.landed], [FALL, false], "the eighth hop ends over nothing");
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

test("a block met above sets the ball back by twice its rise and drops it with no speed forward and no spin, straight down onto the floor beneath, from a jump and from a hop", () => {
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
  // the seventh row, 317 up and 284 on, the centre set back by twice the row's rise of 39
  assert.deepEqual(b.pos, [17 * UNIT, 16 * UNIT - 284, 17 * UNIT - 356 - 317 + 78]);
  const y = b.pos[1];
  let events = [];
  for (let f = 0; f < 20 && !events.some((e) => e.at === "landed"); f++) {
    events = run(b, probe, 1, 0);
    assert.equal(b.pos[1], y);
  }
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  // the hop's frames run from the second row, so it meets the block over it a frame sooner
  const over = row(15, 18, [[17, 16, 15]]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  let hop = null;
  for (let f = 1; f <= 31 && hop === null; f++) {
    run(c, over, 1, PAD.cross);
    if (c.state === FALL) hop = f;
  }
  assert.equal(hop, 6);
  assert.equal(c.v, -39);
  assert.deepEqual(c.pos, [17 * UNIT, 16 * UNIT, 17 * UNIT - 356 - 317 + 78]);
  rest(c, over);
  assert.deepEqual(blockUnder(c), [17, 16, 17]);
  assert.equal(heightOf(c), 100);
});

test("a wall met in the air throws the ball back and drops it with the spin's speed at nothing, and it lands on the floor behind", () => {
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
  // the jump's spin speed goes with the bounce, so the body stands from that frame on
  assert.equal(b.spinSpeed, 0);
  const body = [...b.body];
  run(b, probe, 1, 0);
  assert.equal(b.state, FALL);
  assert.equal(b.spinSpeed, 0);
  assert.deepEqual(b.body, body);
  rest(b, probe);
  assert.equal(b.state, REST);
  assert.ok([15, 16].includes(blockUnder(b)[1]), String(blockUnder(b)));
  assert.equal(heightOf(b), 100);
});

test("a block above and the floor ahead are asked about the cell the centre lies in, so a jump under a block three above its floor lands two blocks on, a hop under one rests, and a block two above still drops the ball on the seventh frame", () => {
  // OBJ LEVEL's floor along y, with the laser's far end three above the second block of the jump's way
  const floor = [];
  for (let y = 15; y <= 19; y++) floor.push([15, y, 17]);
  const high = lattice(...floor, [15, 18, 14]);
  const b = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  const events = [];
  for (let f = 1; f <= 31; f++) {
    events.push(...run(b, high, 1, PAD.up | PAD.cross).map((e) => [f, e]));
    assert.notEqual(b.state, FALL, `frame ${f}`);
  }
  assert.deepEqual(events, [[31, { at: "landed" }]]);
  assert.deepEqual([b.state, blockUnder(b), b.progress], [REST, [15, 19, 17], 256]);
  const over = lattice(...floor, [15, 17, 14]);
  const c = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  for (let f = 1; f <= 31; f++) {
    run(c, over, 1, PAD.cross);
    assert.notEqual(c.state, FALL, `frame ${f}`);
  }
  assert.equal(c.state, REST, "the hop's end");
  run(c, over, 1, 0);
  assert.deepEqual([blockUnder(c), heightOf(c)], [[15, 17, 17], 100]);
  const low = lattice(...floor, [15, 18, 15]);
  const d = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(d, low, 1, PAD.up | PAD.cross);
    if (d.state === FALL) hit = f;
  }
  assert.equal(hit, 7);
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
  assert.deepEqual([b.state, b.speed], [REST, table.rolling.top]);
  assert.deepEqual(run(b, probe, 1, PAD.up), [{ refused: "edge" }]);
  run(b, probe, 4, PAD.up);
  assert.equal(b.state, REST);
  assert.equal(b.progress, launched);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
});

test("a landing at the climb's progress under a wall climbs on the frame after, not the landing's frame", () => {
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

test("the shadow's height is the centre's height off the block under it, and nothing over nothing", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  assert.equal(clearance(b, probe), 100);
  // over the hop the height is the centre's height while the shadow could show, and nothing above a block's height
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

test("over a block the probe no longer holds a ball at rest has no shadow's height, on the frames before its drop as after", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  rest(b, probe);
  assert.equal(clearance(b, probe), 100);
  const gone = row(15, 17);
  assert.equal(b.state, REST);
  assert.equal(clearance(b, gone), Infinity);
  // the rest state drops the ball by the last frame's read, so it stands a frame over the gap
  run(b, gone, 1, 0);
  assert.equal(b.state, REST);
  assert.equal(clearance(b, gone), Infinity);
  run(b, gone, 1, 0);
  assert.equal(b.state, FALL);
  assert.equal(clearance(b, gone), Infinity);
});

test("read then run is step, frame for frame, over a roll, two turns, two jumps and a turn about as two Lefts, the second pressed during the first", () => {
  const probe = plate();
  const a = ballAt(RULES, [17, 18, 17], TOP, UP);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const padAt = (f) => {
    if (f <= 10) return PAD.up;
    if (f === 11) return PAD.up | PAD.left;
    if (f <= 18) return PAD.up;
    if (f === 38) return PAD.right;
    if (f >= 58 && f <= 90) return PAD.up | PAD.cross;
    return f === 91 || f === 95 ? PAD.left : 0;
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

test("a ball at rest whose block goes falls at the fall's start on the frame after the one whose read finds the block gone, and lands on the block below", () => {
  const gone = new Set();
  const base = row(15, 18, [[17, 18, 19]]);
  const probe = { solid: (c) => !gone.has(cellKey(...c)) && base.solid(c) };
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 3, 0);
  assert.equal(b.state, REST);
  gone.add(cellKey(17, 18, 17));
  const at = [...b.pos];
  assert.deepEqual(run(b, probe, 1, 0), []);
  assert.equal(b.state, REST, "at rest by the last frame's read, this frame's finding it gone");
  assert.equal(b.floor, false);
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
  // the input routine drops the request at such an edge whatever the block, as the game's routine
  // does, and the rules make it again on ice after it, which is what a frame with the request
  // forced is
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

test("on a block the probe says is brittle, with the floor ahead empty and nothing beside, a rolling ball loses the forward request and its speed from the hold's progress and is set back from the push's progress, so it never goes round the edge it would on stone", () => {
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

const RIDE = objects.motion.kinds["5"].ride;
const RIDDEN = { ...RULES, ride: RIDE };
/** `lattice` with a platform whose blocks stand on the `body` cells at home, laid along one axis
    from the first, and are carried `travel()` units from them: solid where the lattice is or
    where the body stands now, and to the ball `b` while it rides the body at home alone;
    `platform` names the body's cells now, with the run's axis, the first block's centre as
    carried and the count of blocks. */
function carried(lattice, body, travel, b, key = "rail") {
  const same = (a, c) => a.every((v, i) => v === c[i]);
  const axis = body.length > 1 ? body[1].findIndex((v, i) => v !== body[0][i]) : 0;
  const now = () => {
    const by = travel().map((v) => Math.floor((v + UNIT / 2) / UNIT));
    return body.map((c) => c.map((v, i) => v + by[i]));
  };
  const on = (cells, cell) => cells.some((c) => same(c, cell));
  const named = () => ({
    key,
    travel: travel(),
    axis,
    at: body[0].map((v, i) => v * UNIT + travel()[i]),
    count: body.length,
  });
  return {
    ...lattice,
    solid: (cell) => (b.riding ? on(body, cell) : lattice.solid(cell) || on(now(), cell)),
    platform: (cell) => (on(now(), cell) ? named() : null),
  };
}
/** A ball jumped from the top of (17, 17, 17) onto a platform three blocks long along x, at home
    from (17, 15, 17) and carried 300 toward -x, until it rides. */
function ridden() {
  const b = ballAt(RIDDEN, [17, 17, 17], TOP, UP);
  const at = { travel: [-300, 0, 0] };
  const body = [
    [17, 15, 17],
    [18, 15, 17],
    [19, 15, 17],
  ];
  const probe = carried(row(17, 18), body, () => at.travel, b);
  run(b, probe, 1, PAD.up | PAD.cross);
  const frames = [];
  for (let f = 1; f <= 40 && !b.riding; f++) frames.push(run(b, probe, 1, 0));
  return { b, probe, at, frames };
}

test("a landing on a platform's body rides it: the position made relative to the platform, the block under and the centre in the level, the platform's own blocks alone solid to the ball, and the forward jump leaves it with the position no longer relative to the platform", () => {
  const { b, probe, at, frames } = ridden();
  assert.equal(frames.length, 30, "on the frame the jump comes down");
  assert.deepEqual(frames.at(-1), [{ rode: { key: "rail" } }, { at: "landed" }]);
  assert.deepEqual(b.riding, { key: "rail" });
  assert.deepEqual(b.travel, [-300, 0, 0]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 15, 17], "the block under in the level");
  assert.deepEqual(positionOf(b), [17 * UNIT, 15 * UNIT, 17 * UNIT - 356]);
  assert.deepEqual(b.pos, [17 * UNIT + 300, 15 * UNIT, 17 * UNIT - 356], "the platform's");
  assert.deepEqual(cellOf(b, b.pos), [18, 15, 16], "over the body's second block at home");
  assert.deepEqual(cellOf(b), [17, 15, 16], "over the landing's cell in the level");
  assert.deepEqual(centreOf(b), [17.5, 15.5, 17.5 - 356 / UNIT]);
  assert.equal(heightOf(b), 100);
  assert.equal(clearance(b, probe), 100);
  assert.equal(probe.solid([18, 15, 17]), true, "the platform's blocks at home are solid");
  assert.equal(probe.solid([17, 15, 17]), true);
  assert.equal(probe.solid([17, 17, 17]), false, "the level's are not");
  run(b, probe, 30, 0);
  assert.equal(b.state, REST, "at rest over a cell of the level's that holds no block");
  assert.deepEqual(b.rest, { cell: [17, 15, 17], face: TOP, h: UP });
  at.travel = [-800, 0, 0];
  b.travel = at.travel;
  assert.deepEqual(blockUnder(b), [16, 15, 17], "carried with the platform");
  assert.deepEqual(positionOf(b), [17 * UNIT - 500, 15 * UNIT, 17 * UNIT - 356]);
  near(centreOf(b)[0], 17.5 - 500 / UNIT);
  run(b, probe, 5, 0);
  assert.equal(b.state, REST, "and never dropped");
  assert.deepEqual(b.rest.cell, [16, 15, 17]);
  const left = run(b, probe, 1, PAD.up | PAD.cross);
  assert.deepEqual(left, [{ alit: { key: "rail" } }]);
  assert.equal(b.riding, null);
  assert.equal(b.travel, null);
  assert.equal(b.state, JUMP);
  assert.deepEqual(
    b.saved,
    [17 * UNIT - 500 - table.jump.recentre, 15 * UNIT, 17 * UNIT - 356],
    "the jump from where the ball is in the level, drawn toward the middle by the jump's step",
  );
  assert.deepEqual(positionOf(b), b.pos);
});

test("the block landing refuses a platform's cell: a body slid into the arc's way at head height during the landings' rows, the point under the centre lying in it, lands nothing, and the snap over nothing falls on through the body", () => {
  const b = ballAt(RIDDEN, [17, 17, 17], TOP, UP);
  const at = { travel: [0, 0, 0] };
  const body = [
    [19, 15, 16],
    [20, 15, 16],
  ];
  const probe = carried(row(17, 18), body, () => at.travel, b);
  run(b, probe, 1, PAD.up | PAD.cross);
  const before = run(b, probe, 20, 0);
  assert.equal(b.state, JUMP);
  assert.ok(!before.some((e) => e.at), "nothing met before the body comes");
  at.travel = [-2 * UNIT, 0, 0];
  const under = () =>
    cellOf(
      b,
      b.pos.map((c, i) => c - b.n[i] * b.radius),
    );
  const rows = [];
  for (let f = 21; f <= 29; f++)
    rows.push({
      events: run(b, probe, 1, 0),
      cell: cellOf(b, b.pos),
      under: probe.platform(under()),
    });
  assert.ok(
    rows.every((r) => r.cell.join() === "17,15,16"),
    "the rows run inside the body's cell",
  );
  assert.ok(
    rows.every((r) => r.under),
    "the point under the centre in the body",
  );
  assert.ok(!rows.some((r) => r.events.length), "no landing and no bounce");
  assert.equal(b.state, JUMP);
  assert.deepEqual(run(b, probe, 1, 0), [], "the snap");
  assert.equal(b.state, FALL, "nothing under the snapped centre but the body, which is no landing");
  assert.deepEqual(cellOf(b, b.pos), [17, 15, 16]);
  assert.equal(b.speed, 0);
  const fell = run(b, probe, 200, 0);
  assert.ok(!fell.some((e) => e.at || e.rode), "through the body");
  assert.ok(
    fell.some((e) => e.lost),
    "and lost",
  );
});

test("riding, the ball will not roll off the platform's side where a block of its body stands beside, and rolls along it and round its ends and sides as round a free block, never falling", () => {
  const { b, probe } = ridden();
  assert.deepEqual(run(b, probe, 1, PAD.up), [{ refused: "edge" }]);
  assert.equal(b.state, REST);
  run(b, probe, 1, PAD.right);
  assert.deepEqual(b.h, [1, 0, 0], "facing along the platform");
  rest(b, probe);
  const faces = new Set();
  const blocks = new Set();
  let wraps = 0;
  for (let f = 0; f < 300; f++) {
    const events = run(b, probe, 1, PAD.up);
    assert.notEqual(b.state, FALL, `frame ${f}`);
    assert.ok(!events.some((e) => e.refused || e.lost || e.alit), `frame ${f}`);
    wraps += events.filter((e) => e.face === "wrap").length;
    if (b.state === REST || b.state === ROLLING) {
      faces.add(faceUnder(b));
      blocks.add(blockUnder(b).join(","));
    }
  }
  assert.ok(wraps >= 4, String(wraps));
  assert.deepEqual([...faces].sort(), [0, 1, 4, 5], "the top, both ends and the underside");
  assert.deepEqual(b.riding, { key: "rail" }, "riding throughout");
  assert.deepEqual([...blocks].sort(), ["16,15,17", "17,15,17", "18,15,17"]);
});

test("a hop while riding leaves the platform and comes down on its body as on stone, not riding, so the body moving on from under it drops the ball, and where the body has moved on by the hop's end it falls at the hop's drop", () => {
  const { b, probe, at } = ridden();
  assert.deepEqual(run(b, probe, 1, PAD.cross), [{ alit: { key: "rail" } }]);
  assert.equal(b.state, HOP);
  assert.equal(b.riding, null);
  assert.deepEqual(
    b.saved,
    [17 * UNIT, 15 * UNIT, 17 * UNIT - 356],
    "the hop from where the ball is in the level",
  );
  const events = [];
  for (let f = 0; f < 30 && b.state === HOP; f++) events.push(...run(b, probe, 1, 0));
  assert.deepEqual(events, [], "no landing is said");
  assert.equal(b.state, REST);
  assert.equal(b.riding, null, "down on the body as on stone");
  assert.equal(b.travel, null);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.deepEqual(
    probe.platform([17, 15, 17]),
    {
      key: "rail",
      travel: [-300, 0, 0],
      axis: 0,
      at: [17 * UNIT - 300, 15 * UNIT, 17 * UNIT],
      count: 3,
    },
    "the body still under it",
  );
  run(b, probe, 1, 0);
  assert.equal(heightOf(b), 100, "laid at rest again");
  at.travel = [-700, 0, 0];
  run(b, probe, 5, 0);
  assert.equal(b.state, REST, "standing while the body still fills its cell");
  at.travel = [-1500, 0, 0];
  run(b, probe, 1, 0);
  assert.equal(b.state, REST, "standing on the frame whose read finds the body gone from under it");
  run(b, probe, 1, 0);
  assert.equal(b.state, FALL, "dropped on the frame after, by that read");
  assert.equal(b.v, table.fall.start);
  const again = ridden();
  assert.deepEqual(run(again.b, again.probe, 1, PAD.cross), [{ alit: { key: "rail" } }]);
  again.at.travel = [-2000, 0, 0];
  for (let f = 0; f < 30 && again.b.state === HOP; f++) run(again.b, again.probe, 1, 0);
  assert.equal(again.b.state, FALL);
  assert.equal(again.b.v, table.fall.hop);
  assert.equal(again.b.riding, null);
});

/** The body of `ridden()`'s platform: three blocks along x at home from (17, 15, 17). */
const RAIL = [
  [17, 15, 17],
  [18, 15, 17],
  [19, 15, 17],
];
/** A ball with its normal out of `face`, heading `h`, let fall from `pos` over `lattice` and the
    platform whose blocks stand on `body` at home, carried `travel`: the ball, its probe and each
    frame's events, run while it falls, for at most `n` frames. */
function fallen(lattice, face, h, body, travel, pos, n = 60) {
  const b = ballAt(RIDDEN, [17, 17, 17], face, h);
  const probe = carried(lattice, body, () => travel, b);
  b.pos = pos;
  b.state = FALL;
  b.v = table.fall.start;
  const frames = [];
  for (let f = 0; f < n && b.state === FALL; f++) frames.push(run(b, probe, 1, 0));
  return { b, probe, frames };
}
/** A ball let fall from 300 over its rest on the top of `RAIL`, carried `travel`, with its centre
    at `x` along the run and `y` across it, until it rides, lands or has passed the body. */
function letFall(x, travel, y = 15 * UNIT) {
  const bottom = 17 * UNIT + UNIT / 2 + table.rolling.resume;
  const out = fallen(row(17, 18), TOP, UP, RAIL, travel, [x, y, 17 * UNIT - 356 - 300], 0);
  for (let f = 0; f < 60 && out.b.state === FALL && out.b.pos[2] < bottom; f++)
    out.frames.push(run(out.b, out.probe, 1, 0));
  return out;
}
const RODE = [{ rode: { key: "rail" } }, { at: "landed" }];

test("the body landing measures the centre along the run alone, against the platform's position: a ball coming down on the top of a platform's body rides with its centre between the end faces or at either, where it stands, and falls through the body's cell as drawn with its centre a unit past either end face, while a landing on a block is as it was", () => {
  const { ends } = RIDE.body;
  // carried 300 toward -x the body's cells are drawn a block before their home, so the first
  // cell as drawn reaches past the near end face
  const near = 17 * UNIT - 300 - ends;
  const onNear = letFall(near, [-300, 0, 0]);
  assert.deepEqual(onNear.frames.at(-1), RODE);
  assert.deepEqual(onNear.b.riding, { key: "rail" });
  assert.equal(positionOf(onNear.b)[0], near, "the centre keeps its place along the run");
  assert.ok(heightOf(onNear.b) <= RIDE.body.off, "at the height it came within");
  const pastNear = letFall(near - 1, [-300, 0, 0]);
  assert.ok(
    pastNear.probe.platform(cellOf(pastNear.b, [near - 1, 15 * UNIT, 17 * UNIT])),
    "over the body's cell as drawn",
  );
  assert.equal(pastNear.b.riding, null);
  assert.equal(pastNear.b.state, FALL);
  assert.ok(!pastNear.frames.flat().some((e) => e.at || e.rode), "no landing of any kind");
  assert.ok(pastNear.b.pos[2] >= 17 * UNIT + UNIT / 2 + table.rolling.resume, "through the body");
  // carried 300 toward +x the cells as drawn reach past the far end face
  const far = 17 * UNIT + 300 + 2 * UNIT + ends;
  const onFar = letFall(far, [300, 0, 0]);
  assert.deepEqual(onFar.frames.at(-1), RODE);
  assert.equal(positionOf(onFar.b)[0], far);
  const pastFar = letFall(far + 1, [300, 0, 0]);
  assert.ok(pastFar.probe.platform(cellOf(pastFar.b, [far + 1, 15 * UNIT, 17 * UNIT])));
  assert.equal(pastFar.b.riding, null);
  assert.ok(!pastFar.frames.flat().some((e) => e.at || e.rode));
  const between = letFall(17 * UNIT + 300, [-300, 0, 0]);
  assert.deepEqual(between.frames.at(-1), RODE);
  const onStone = letFall(17 * UNIT, [-300, 0, 0], 17 * UNIT);
  assert.deepEqual(onStone.frames.at(-1), [{ at: "landed" }]);
  assert.equal(onStone.b.riding, null);
  assert.equal(onStone.b.state, REST);
  assert.deepEqual(blockUnder(onStone.b), [17, 17, 17]);
  assert.equal(heightOf(onStone.b), table.rolling.resume);
});

test("the end landing takes a ball coming down on the top of a platform that runs up and down, a face along the run the body landing refuses: within the table's slack past the end face it rides, laid the rest height off the face along the run, and a unit beyond the slack it falls on and rides on the frame after", () => {
  const tower = [
    [17, 15, 17],
    [17, 15, 18],
  ];
  const travel = [0, 0, -300];
  const top = 17 * UNIT - 300 - RIDE.body.ends;
  const rest = table.rolling.resume;
  const { tolerance } = RIDE.end;
  const high = fallen(lattice(), TOP, UP, tower, travel, [17 * UNIT, 15 * UNIT, top - 400]);
  assert.deepEqual(high.frames.at(-1), RODE);
  assert.deepEqual(high.b.riding, { key: "rail" });
  assert.deepEqual(high.b.travel, travel);
  assert.equal(positionOf(high.b)[2], top - rest, "laid the rest height off the top face");
  assert.equal(heightOf(high.b), rest);
  assert.deepEqual(
    positionOf(high.b).slice(0, 2),
    [17 * UNIT, 15 * UNIT],
    "and moved on no other axis",
  );
  const edge = [17 * UNIT, 15 * UNIT, top - tolerance - 15];
  const within = fallen(lattice(), TOP, UP, tower, travel, edge, 1);
  assert.deepEqual(within.frames, [RODE], "at the slack exactly, after the frame's fall");
  assert.equal(positionOf(within.b)[2], top - rest);
  const beyond = fallen(lattice(), TOP, UP, tower, travel, [...edge.slice(0, 2), edge[2] - 1], 1);
  assert.deepEqual(beyond.frames, [[]], "a unit beyond it, nothing");
  assert.equal(beyond.b.state, FALL);
  assert.equal(beyond.b.riding, null);
  assert.deepEqual(run(beyond.b, beyond.probe, 1, 0), RODE);
  assert.equal(positionOf(beyond.b)[2], top - rest);
});

test("the end landing lays the centre the rest height off the end face along the run on either end, by the way the normal points: up the axis against the far end and down it against the near end, the cell a block under the centre along the normal naming the platform", () => {
  const travel = [-300, 0, 0];
  const at = 17 * UNIT - 300;
  const rest = table.rolling.resume;
  const farFace = at + 2 * UNIT + RIDE.body.ends;
  const up = fallen(lattice(), 1, UP, RAIL, travel, [farFace + 200, 15 * UNIT, 17 * UNIT]);
  assert.deepEqual(up.frames.at(-1), RODE);
  assert.equal(faceUnder(up.b), 1);
  assert.equal(positionOf(up.b)[0], farFace + rest);
  assert.equal(heightOf(up.b), rest);
  assert.deepEqual(blockUnder(up.b), [18, 15, 17], "the last block as drawn");
  const nearFace = at - RIDE.body.ends;
  const down = fallen(lattice(), 4, UP, RAIL, travel, [nearFace - 200, 15 * UNIT, 17 * UNIT]);
  assert.deepEqual(down.frames.at(-1), RODE);
  assert.equal(faceUnder(down.b), 4);
  assert.equal(positionOf(down.b)[0], nearFace - rest);
  assert.equal(heightOf(down.b), rest);
  assert.deepEqual(blockUnder(down.b), [16, 15, 17], "the first block as drawn");
  const tooFar = fallen(
    lattice(),
    1,
    UP,
    RAIL,
    travel,
    [farFace + rest + 16, 15 * UNIT, 17 * UNIT],
    1,
  );
  assert.deepEqual(tooFar.frames, [[]], "a unit beyond the slack, nothing");
  assert.deepEqual(run(tooFar.b, tooFar.probe, 1, 0), RODE);
  assert.equal(positionOf(tooFar.b)[0], farFace + rest);
});
