import { test } from "node:test";
import assert from "node:assert/strict";
import { FACE_NORMAL, cellKey } from "../../public/js/format/lattice.js";
import { frameOf } from "../../public/js/viewer/state.js";
import { heading } from "../../public/js/viewer/travel.js";
import {
  FALL,
  HOP,
  LEFT,
  PAD,
  REST,
  RIGHT,
  ROLLING,
  WRAPPING,
  acrossOf,
  ballAt,
  blockUnder,
  cellOf,
  centreOf,
  clearance,
  faceUnder,
  heightOf,
  moving,
  offsetFrame,
  place,
  progressOf,
  read,
  run as runFrame,
  step,
  turned,
} from "../../public/js/play/ball.js";
import {
  RULES,
  TOP,
  TURN,
  UNIT,
  UP,
  aligned,
  lattice,
  near,
  nearly,
  rest,
  row,
  run,
  table,
} from "./ball-lattice.js";

const QUARTER = TURN / 4;

const neg = (v) => v.map((x) => -x || 0);

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

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

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A plate of blocks seven wide and nine long at z 17. */
const plate = () => {
  const cells = [];
  for (let x = 14; x <= 20; x++) for (let y = 10; y <= 18; y++) cells.push([x, y, 17]);
  return lattice(...cells);
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
