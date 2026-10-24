import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { cellKey } from "../../public/js/format/lattice.js";
import {
  FALL,
  HOP,
  JUMP,
  PAD,
  REST,
  ROLLING,
  ballAt,
  blockUnder,
  cellOf,
  centreOf,
  clearance,
  faceUnder,
  heightOf,
  positionOf,
  progressOf,
  read,
  run as runFrame,
  step,
} from "../../public/js/play/ball.js";
import {
  JUMPS,
  RIDDEN,
  RIDE,
  RULES,
  TOP,
  UNIT,
  UP,
  carried,
  fallen,
  lattice,
  near,
  rest,
  row,
  run,
  table,
} from "./ball-lattice.js";

/** `probe` with the blocks given slick, as ice is. */
const slippery = (probe, ...cells) => {
  const ice = new Set(cells.map((c) => cellKey(...c)));
  return { ...probe, slick: (cell) => ice.has(cellKey(...cell)) };
};

/** `probe` with the blocks given brittle, as a crumbling block is. */
const brittle = (probe, ...cells) => {
  const set = new Set(cells.map((c) => cellKey(...c)));
  return { ...probe, brittle: (cell) => set.has(cellKey(...cell)) };
};

const EDGE = objects.motion.kinds["6"].edge;

const HELD = { ...RULES, edge: EDGE };

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

/** The body of `ridden()`'s platform: three blocks along x at home from (17, 15, 17). */
const RAIL = [
  [17, 15, 17],
  [18, 15, 17],
  [19, 15, 17],
];

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
