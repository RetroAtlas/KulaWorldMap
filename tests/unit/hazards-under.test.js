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
  blockUnder,
  cellOf,
  faceUnder,
  positionOf,
  progressOf,
} from "../../public/js/play/ball.js";
import { frame } from "../../public/js/play/rules.js";
import { probeOf } from "../../public/js/play/world.js";
import {
  BEAM,
  CORKSCREW,
  HEAT,
  TOP,
  TOP_SPEED,
  UNIT,
  UP,
  dying,
  has,
  level,
  motion,
  object,
  on,
  platform,
  play,
  resting,
  row,
  slot,
  squared,
  standing,
  start,
  trace,
} from "./hazards-level.js";

const ICE = 2;

const CRUMBLING = 6;

const ARROW = 28;

const CHILL = motion.kinds[String(ICE)];

const ON_ICE = CHILL.standing;

const CRUMBLE = motion.kinds[String(CRUMBLING)];

const ROLL = motion.types["30"].rolling;

const WALL = motion.types["30"].jump.wall;

/** A crumbling block's record at the row's cell at `y`, whole. */
const crumbling = (y) => ({ x: 17, y, z: 17, kind: CRUMBLING, type: 1, f: Array(11).fill(0) });

test("on ice the ball slides on through every middle with Up released and stops at the middle of the first block that is not ice, a station said on each block passed", () => {
  const l = level([...row(12, 14), ...row(15, 17, ICE), [17, 18, 17]], [start()]);
  const live = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  frame(live, PAD.up);
  assert.equal(live.ball.state, ROLLING);
  const frames = trace(live, 300, 0, resting);
  assert.deepEqual(blockUnder(live.ball), [17, 14, 17]);
  assert.equal(progressOf(live.ball), ROLL.middle);
  assert.ok(
    frames.slice(0, -1).every((f) => f.state === ROLLING),
    "never at rest on the ice",
  );
  assert.ok(frames.some((f) => f.words.standing === ON_ICE));
  assert.deepEqual(
    frames.flatMap((f) => f.events.filter((e) => e.at)),
    Array(4).fill({ at: "middle" }),
    "a middle said on each ice block and on the stone one",
  );
  assert.ok(!frames.some((f) => has(f, "refused")));
});

test("over an edge beside a neighbour, which holds the ball on stone, ice slides it into the cell beyond, where it falls from 101 of progress", () => {
  const blocks = (kind) => [...row(15, 17, kind), [17, 18, 17], [18, 15, 17]];
  const at = { cell: [17, 18, 17], face: TOP, h: UP };
  const stone = standing(level(blocks(0), [start()]), at);
  frame(stone, PAD.up);
  trace(stone, 200, PAD.up, resting);
  assert.deepEqual(blockUnder(stone.ball), [17, 15, 17], "held at the last block's middle");
  const [held] = trace(stone, 1, PAD.up);
  assert.deepEqual(
    held.events.filter((e) => e.refused),
    [{ refused: "edge" }],
  );

  const ice = standing(level(blocks(ICE), [start()]), at);
  const frames = trace(ice, 200, PAD.up, (l) => l.ball.state === FALL);
  const fell = frames.at(-1);
  assert.equal(fell.state, FALL);
  assert.equal(cellOf(ice.ball)[1], 14, "in the cell beyond the edge");
  assert.ok(
    fell.before.progress >= ROLL.over[0] && fell.before.progress < ROLL.over[0] + ROLL.top,
    String(fell.before.progress),
  );
  assert.ok(!frames.some((f) => has(f, "face")), "nothing takes it round");
  assert.ok(!frames.some((f) => has(f, "refused")));
});

test("an ice patch on a plain block's face is ice to the roll as to the chill: over an edge beside a neighbour it slides the ball into the cell beyond, where it falls from 101 of progress, rolling onto it or from rest on it", () => {
  const l = level([...row(15, 17), [17, 18, 17], [18, 15, 17]], [start(), on(15, ICE)]);
  const rolled = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  const frames = trace(rolled, 200, PAD.up, (l) => l.ball.state === FALL);
  const fell = frames.at(-1);
  assert.equal(fell.state, FALL);
  assert.equal(cellOf(rolled.ball)[1], 14, "in the cell beyond the edge");
  assert.ok(
    fell.before.progress >= ROLL.over[0] && fell.before.progress < ROLL.over[0] + ROLL.top,
    String(fell.before.progress),
  );
  assert.ok(
    frames.some((f) => f.words.standing === ON_ICE),
    "read as ice",
  );
  assert.deepEqual(
    frames.flatMap((f) => f.events.filter((e) => e.at)),
    Array(3).fill({ at: "middle" }),
    "through the patch's middle as through the stone blocks' before it",
  );
  assert.ok(!frames.some((f) => f.state === REST), "never at rest");
  assert.ok(!frames.some((f) => has(f, "face")), "nothing takes it round");
  assert.ok(!frames.some((f) => has(f, "refused")));

  const rested = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  const [went] = trace(rested, 1, PAD.up);
  assert.equal(went.state, ROLLING, "from rest on the patch Up rolls the ball off");
  trace(rested, 60, PAD.up, (l) => l.ball.state === FALL);
  assert.equal(rested.ball.state, FALL);
});

test("the slide off the last ice block goes round the edge where nothing stands beside, and up a wall ahead, and ends on the first block that is not ice", () => {
  const at = { cell: [17, 18, 17], face: TOP, h: UP };
  const round = standing(level([...row(15, 17, ICE), [17, 18, 17]], [start()]), at);
  frame(round, PAD.up);
  const went = trace(round, 400, 0, resting);
  assert.deepEqual(
    went.flatMap((f) => f.events.filter((e) => e.face)),
    [{ face: "wrap" }, { face: "wrap" }],
    "round the end of the row and on under it",
  );
  assert.deepEqual([blockUnder(round.ball), faceUnder(round.ball)], [[17, 18, 17], 5]);
  assert.equal(progressOf(round.ball), ROLL.middle);

  const climb = standing(
    level([...row(15, 17, ICE), [17, 18, 17], [17, 14, 17], [17, 14, 16]], [start()]),
    at,
  );
  frame(climb, PAD.up);
  const up = trace(climb, 400, 0, resting);
  assert.deepEqual(
    up.flatMap((f) => f.events.filter((e) => e.face)),
    [{ face: "climb" }],
  );
  assert.deepEqual([blockUnder(climb.ball), faceUnder(climb.ball)], [[17, 14, 16], 2]);
  assert.equal(progressOf(climb.ball), ROLL.middle);
});

test("on ice a turn is never asked, Left held, and Cross is the forward jump", () => {
  const l = level([...row(6, 17, ICE), [17, 18, 17]], [start()]);
  const live = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  frame(live, PAD.up);
  trace(live, 100, 0, (l) => blockUnder(l.ball)[1] <= 16 && l.words.standing === ON_ICE);
  const held = trace(live, 30, PAD.left);
  assert.ok(held.every((f) => f.state === ROLLING && !has(f, "turned")));
  assert.deepEqual(live.ball.h, UP);
  assert.deepEqual([live.ball.turn, live.ball.waiting], [0, 0]);
  trace(live, 1, PAD.cross);
  assert.equal(live.ball.state, JUMP, "the forward jump, not the hop");
  assert.equal(live.ball.forward, true);
});

test("at rest on ice facing an edge beside a neighbour Up rolls the ball off, the request made again after the pad's reading refused it, and nothing is said", () => {
  const l = level([...row(15, 17, ICE), [17, 18, 17], [18, 15, 17]], [start()]);
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  const [went] = trace(live, 1, PAD.up);
  assert.equal(went.state, ROLLING);
  assert.ok(!has(went, "refused"));
  trace(live, 60, PAD.up, (l) => l.ball.state === FALL);
  assert.equal(live.ball.state, FALL, "over the edge into the fall");
});

test("on the ground on ice the cold grows by the gain a frame and is set back past its top, running 400, 440 and 480, the heat cooling by the chill besides, and off ice the cold wanes to nothing", () => {
  const l = level([...row(9, 11), ...row(12, 17, ICE), [17, 18, 17]], [start()]);
  const live = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  live.words.heat = 1000;
  frame(live, PAD.up);
  let heat = live.words.heat;
  const frames = trace(live, 200, 0);
  assert.deepEqual(blockUnder(live.ball), [17, 11, 17]);
  assert.equal(live.ball.state, REST);
  // the hazards read what the ball stood on as the last frame left it
  const iced = frames.map((f, i) => i > 0 && frames[i - 1].words.standing === ON_ICE);
  let cold = 0;
  const expected = iced.map((on) => {
    heat = Math.max(0, heat - HEAT.cool);
    if (on) {
      heat = Math.max(0, heat - CHILL.chill);
      cold += CHILL.cold.gain;
      if (cold > CHILL.cold.over) cold = CHILL.cold.back;
    } else cold = Math.max(0, cold - CHILL.cold.wane);
    return { cold, heat };
  });
  assert.deepEqual(
    frames.map((f) => ({ cold: f.words.cold, heat: f.words.heat })),
    expected,
  );
  const colds = frames.map((f) => f.words.cold);
  assert.ok(iced.filter(Boolean).length > 60, "long enough on the ice for the saw");
  assert.ok(colds.filter((c) => c === CHILL.cold.back).length >= 3, "set back more than once");
  assert.ok(colds.includes(480) && !colds.some((c) => c > CHILL.cold.over));
  assert.equal(colds.at(-1), 0, "waned to nothing at rest off the ice");
  assert.equal(frames.at(-1).words.heat, 0);
});

test("the cold is set back only once past its top: from 460 a frame on ice brings it to 500 and the next back to 400", () => {
  const l = level([...row(12, 17, ICE), [17, 18, 17]], [start()]);
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.cold = CHILL.cold.over - CHILL.cold.gain;
  frame(live, 0);
  assert.equal(live.words.cold, CHILL.cold.over);
  frame(live, 0);
  assert.equal(live.words.cold, CHILL.cold.back);
});

test("an arrow under the ball on the ground drops the forward request where the heading differs from its way, stopping a roll onto it at its middle and holding the ball at rest, said, while a turn is allowed, Cross with Up is the hop, unsaid, and along its way the roll goes", () => {
  const l = level(row(13, 18), [start(), on(16, ARROW, { facing: 1 })]);
  const live = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] === 16 && resting(l));
  assert.deepEqual(blockUnder(live.ball), [17, 16, 17], "stopped at the arrow's middle, Up held");
  assert.equal(progressOf(live.ball), ROLL.middle);
  const [held] = trace(live, 1, PAD.up);
  assert.deepEqual(
    held.events.filter((e) => e.refused),
    [{ refused: "arrow" }],
  );
  assert.equal(live.ball.state, REST);
  assert.equal(live.words.way, null, "no flag on the ground");
  const [turned] = trace(live, 1, PAD.left);
  assert.ok(has(turned, "turned"), "the turn is allowed");
  trace(live, 40, 0, resting);
  assert.deepEqual(live.ball.h, [-1, 0, 0]);
  const hop = frame(live, PAD.up | PAD.cross);
  assert.equal(live.ball.state, HOP, "the hop and not the forward jump");
  assert.ok(!hop.some((e) => e.refused), "nothing refused where the jump is asked");
  trace(live, 60, 0, resting);
  frame(live, PAD.left);
  trace(live, 40, 0, resting);
  assert.deepEqual(live.ball.h, [0, 1, 0], "turned to the arrow's way");
  const [rolled] = trace(live, 1, PAD.up);
  assert.equal(live.ball.state, ROLLING);
  assert.ok(!has(rolled, "refused"));
});

test("in the air the arrow drops the forward request as on the ground: a jump from a roll that comes down past the middle of an arrow against its way rests where it lands with Up held rather than rolling on", () => {
  const l = level(row(10, 18), [start(), on(16, ARROW, { facing: 1 })]);
  const live = standing(l, { cell: [17, 18, 17], face: TOP, h: UP });
  trace(live, 6, PAD.up);
  const from = live.ball.progress;
  assert.ok(from > ROLL.middle && from < WALL, String(from));
  trace(live, 1, PAD.up | PAD.cross);
  assert.equal(live.ball.state, JUMP);
  const flight = trace(live, 60, PAD.up, (l) => l.ball.state !== JUMP);
  assert.ok(has(flight.at(-1), "at"), "landed");
  assert.equal(live.ball.state, REST);
  assert.deepEqual(blockUnder(live.ball), [17, 16, 17]);
  assert.equal(progressOf(live.ball), from, "two blocks on, past the middle");
  trace(live, 40, PAD.up);
  assert.deepEqual([live.ball.state, blockUnder(live.ball)], [REST, [17, 16, 17]], "held with Up");
});

test("in the air over an arrow the jump's wall test throws the ball back from 412 of progress where the heading differs from the arrow's way, the flag standing, and clears the flag where it lies along", () => {
  const at = { cell: [17, 18, 17], face: TOP, h: UP };
  const rows = objects.jump.rows;
  // the first row that brings the centre past the wall's progress in the arrow's cell, a block on
  const first = rows.findIndex((r) => -r[2] - UNIT / 2 >= WALL);
  const jump = (facing) => {
    const live = standing(level(row(12, 18), [start(), on(17, ARROW, { facing })]), at);
    frame(live, PAD.up | PAD.cross);
    assert.equal(live.ball.state, JUMP);
    return { live, flight: trace(live, 40, 0, (l) => l.ball.state !== JUMP) };
  };
  const against = jump(1);
  assert.equal(
    against.flight.length,
    first,
    "thrown back on the first row past the wall's progress",
  );
  assert.equal(against.live.ball.state, FALL);
  assert.ok(against.live.ball.speed < 0);
  assert.deepEqual(against.flight.at(-1).words.way, [0, 1, 0], "the flag stands through a bounce");
  assert.ok(
    against.flight.slice(0, 5).every((f) => f.words.way === null),
    "not yet over the arrow",
  );
  trace(against.live, 100, 0, resting);
  frame(against.live, 0);
  assert.equal(
    against.live.words.way,
    null,
    "cleared by the air test on the frame after the landing",
  );
  assert.ok(blockUnder(against.live.ball)[1] >= 17, "down behind the arrow's far edge");

  const along = jump(3);
  assert.ok(along.flight.length > first, "no wall along the way");
  assert.deepEqual(along.flight[first - 2].words.way, UP, "the flag set over the arrow");
  assert.equal(
    along.flight[first - 1].words.way,
    null,
    "cleared on the row past the wall's progress",
  );
  assert.deepEqual(blockUnder(along.live.ball), [17, 16, 17], "down two blocks on");
});

test("a crumbling block under the ball scores the table's points once and is written broken on every frame the ball stands on it, breaking up at the frame's end, and is gone on the twentieth frame, the resting ball falling two frames after onto the block below, the first frame's read finding the cell empty and the next's rest state reading that", () => {
  const l = level([...row(15, 18), [17, 15, 19]], [start(), crumbling(15)]);
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  const key = cellKey(17, 15, 17);
  const block = live.world.crumbling.get(key);
  assert.deepEqual(block, { type: 1, size: CRUMBLE.size });
  assert.equal(live.words.standing, CRUMBLE.standing);
  const [first] = trace(live, 1, 0);
  assert.equal(live.words.score, CRUMBLE.points);
  assert.deepEqual(first.events, [{ broke: { key } }]);
  assert.equal(block.type, 3, "written broken by the hazards, breaking up by the frame's end");
  assert.equal(block.size, CRUMBLE.size - CRUMBLE.shrink, "shrunk on the frame it breaks");
  const stood = trace(live, 18, 0);
  assert.equal(live.words.score, CRUMBLE.points, "scored once");
  assert.ok(
    stood.every((f) => has(f, "broke") && !has(f, "fell")),
    "broken again on every frame the ball stands there",
  );
  assert.ok(stood.every((f) => f.state === REST));
  assert.equal(block.size, CRUMBLE.size - 19 * CRUMBLE.shrink);
  assert.ok(block.size >= 0, "still there after nineteen");
  const [twentieth] = trace(live, 1, 0);
  assert.deepEqual(twentieth.events, [{ broke: { key } }, { fell: { key } }]);
  assert.equal(twentieth.state, REST, "the ball at rest still as the frame ends");
  assert.equal(live.words.frame, 20);
  assert.ok(live.world.gone.has(key));
  assert.equal(live.world.crumbling.has(key), false);
  assert.equal(probeOf(live).solid([17, 15, 17]), false);
  const [read] = trace(live, 1, 0);
  assert.equal(read.state, REST, "at rest still on the frame whose read finds the cell empty");
  assert.equal(live.words.standing, -1, "nothing under the ball from that read");
  assert.ok(!has(read, "broke"));
  const [after] = trace(live, 1, 0);
  assert.equal(after.state, FALL, "dropped on the frame after that");
  assert.equal(live.words.frame, 22);
  assert.equal(live.ball.v, motion.types["30"].fall.start);
  assert.deepEqual(after.pos, twentieth.pos, "from where it rested");
  trace(live, 60, 0, resting);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 19]);
});

test("a ball rolling on crosses a crumbling block before it goes, and one on it as it goes falls from between the roll's bounds two frames after, by the word the read of the frame between left", () => {
  const l = level([...row(10, 18), [17, 15, 19]], [start(), crumbling(15)]);
  const across = standing(l, { cell: [17, 17, 17], face: TOP, h: UP });
  const frames = trace(across, 200, PAD.up, (l) => blockUnder(l.ball)[1] <= 12);
  const went = frames.find((f) => has(f, "fell"));
  assert.ok(went, "the block went");
  assert.ok(went.block[1] < 15, "with the ball past it");
  assert.ok(
    frames.every((f) => f.state === ROLLING),
    "the roll never broken",
  );
  assert.ok(
    frames.filter((f) => f.before.block[1] === 15).every((f) => f.speed === TOP_SPEED),
    "at the top speed over the block, the floor ahead there",
  );
  assert.equal(across.words.score, CRUMBLE.points);
  const broke = frames.filter((f) => has(f, "broke"));
  assert.ok(broke.length > 10, String(broke.length));
  assert.ok(
    broke.every((f) => f.before.block[1] === 15),
    "broken on the frames the ball stood on it as the last frame left it",
  );

  const on = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  trace(on, 14, 0);
  const rolled = trace(on, 40, PAD.up, (l) => l.ball.state === FALL);
  const dropped = rolled.at(-1);
  assert.equal(dropped.state, FALL);
  const fell = rolled.findIndex((f) => has(f, "fell"));
  assert.equal(rolled.length, fell + 3, "two frames after the block went");
  assert.deepEqual(dropped.before.block, [17, 15, 17]);
  assert.ok(
    dropped.before.progress >= ROLL.over[0] && dropped.before.progress <= ROLL.over[1],
    String(dropped.before.progress),
  );
  trace(on, 60, 0, resting);
  assert.deepEqual(blockUnder(on.ball), [17, 15, 19]);
});

test("a crumbling block at the end of a row holds the rolling ball short of its free edge, where stone would take it round, the request and the speed dropped from the hold's progress, until the block goes and the ball falls with it", () => {
  const at = { cell: [17, 16, 17], face: TOP, h: UP };
  const stone = standing(level(row(15, 18), [start()]), at);
  const round = trace(stone, 60, PAD.up, (l) => l.ball.state !== ROLLING && l.ball.state !== REST);
  assert.ok(
    round.at(-1).events.some((e) => e.face === "wrap"),
    "stone takes the ball round",
  );

  const live = standing(level([...row(15, 18), [17, 15, 19]], [start(), crumbling(15)]), at);
  const frames = trace(live, 80, PAD.up, (l) => l.ball.state === FALL);
  assert.ok(!frames.some((f) => has(f, "face")), "never round the edge");
  const on = frames.filter((f) => f.before.block[1] === 15 && f.state === ROLLING);
  assert.ok(on.every((f) => f.progress < ROLL.wrap));
  const held = on.filter((f) => f.before.progress >= CRUMBLE.edge.hold);
  assert.ok(held.length > 5, String(held.length));
  assert.ok(
    held.every((f) => !f.forward && f.speed === ROLL.gain),
    "the request dropped and the speed grown from nothing again",
  );
  assert.ok(
    on
      .filter((f) => f.before.progress < CRUMBLE.edge.hold && f.before.progress > 101)
      .every((f) => f.forward && f.speed === TOP_SPEED),
    "rolling at the top speed short of the hold",
  );
  const fell = frames.findIndex((f) => has(f, "fell"));
  assert.ok(fell >= 0);
  assert.equal(frames.length, fell + 3, "the ball falls two frames after the block goes");
  const between = frames[fell + 1];
  assert.deepEqual(
    [between.state, between.forward, between.speed],
    [ROLLING, false, ROLL.gain],
    "the hold standing on the frame after, by the last frame's read of the block under",
  );
  assert.deepEqual(frames.at(-1).before.block, [17, 15, 17]);
  trace(live, 60, 0, resting);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 19]);
});

test("a hop from a crumbling block comes down over nothing once the block has gone under it, the hazards leaving the block while the ball is in the air, and the ball falls", () => {
  const l = level([...row(15, 18), [17, 15, 19]], [start(), crumbling(15)]);
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  trace(live, 1, 0);
  assert.equal(live.words.score, CRUMBLE.points);
  const [hop] = trace(live, 1, PAD.cross);
  assert.equal(hop.state, HOP);
  assert.ok(has(hop, "broke"), "read on the ground as the hop was asked");
  const flight = trace(live, 60, 0, (l) => l.ball.state !== HOP);
  const fell = flight.findIndex((f) => has(f, "fell"));
  assert.ok(fell >= 0 && fell < flight.length - 1, "the block went while the ball was in the air");
  assert.ok(
    flight.every((f) => !has(f, "broke")),
    "left alone in the air",
  );
  assert.equal(flight.at(-1).state, FALL);
  assert.equal(live.ball.v, motion.types["30"].fall.hop);
  trace(live, 60, 0, resting);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 19]);
});

test("a lit beam kills a riding ball in the cell its platform has carried it to, read at the ball's cell in the level, while the cell its own position lies in holds no beam", () => {
  // a platform running two blocks along +x from (17, 15, 17), and a beam across its far end's
  // cell a block up, along y
  const ray = {
    x: 19,
    y: 13,
    z: 16,
    kind: 8,
    type: 2,
    colour: 2,
    f: [2, 1, 19, 13, 16, 19, 17, 16, -1, -1, -1],
  };
  const l = level(
    [
      [17, 17, 17],
      [17, 18, 17],
      [17, 15, 17],
    ],
    [start(), platform(17, 15, 17, [19, 15, 17]), ray],
  );
  const live = standing(l, { cell: [17, 17, 17], face: TOP, h: UP });
  const key = cellKey(17, 15, 17);
  const w = live.world.walkers.get(`${key}/null`);
  while (!(w.pos[0] === 17 * UNIT && w.dwell > 0)) frame(live, 0);
  frame(live, PAD.up | PAD.cross);
  const landing = trace(live, 40, 0, (l) => l.ball.riding !== null);
  assert.ok(has(landing.at(-1), "rode"));
  const b = live.ball;
  assert.ok(!landing.some((f) => has(f, "dying")));
  const carried = trace(live, 200, 0, dying);
  assert.ok(dying(live), "killed on the way");
  assert.deepEqual(
    carried.at(-1).events.filter((e) => e.dying),
    [{ dying: { cause: "laser", wait: play.wait.laser } }],
  );
  assert.deepEqual(cellOf(b), [19, 15, 16], "the ball's cell in the level is the beam's");
  assert.equal(live.world.probe.value(cellOf(b), live.words.frame), BEAM.cell);
  assert.deepEqual(cellOf(b, b.pos), [17, 15, 16], "while its own position lies clear of it");
  assert.equal(live.world.probe.value(cellOf(b, b.pos), live.words.frame), -1);
  assert.deepEqual(b.riding, { key }, "and it rides on through the countdown");
  assert.equal(live.words.heat, BEAM.heat - HEAT.cool, "the beam's heat, cooled off fire once");
  assert.ok(
    carried.slice(0, -1).every((f) => !has(f, "dying")),
    "and not before the platform carried it there",
  );
  assert.ok(carried.length > 40, String(carried.length));
  const entered = carried.findIndex((f) => f.cell.join() === "19,15,16");
  assert.equal(
    carried.length - 1,
    entered + 1,
    "on the frame after the platform carried the ball's cell into the beam, the hazards reading the travel the last frame left",
  );
});

test("the captivators' hit test takes the ball's position words as they stand, relative to the platform's position and biased by a block while it rides one, so a riding ball carried within a corkscrew's reach by its place in the level, or standing within one's reach by its place at the platform's home, is not caught, where a ball standing in that place is", () => {
  // a platform running three blocks along +x from (17, 15, 17), and a corkscrew on the +y face
  // of a block a block up beside the run at either end, each within reach of a ball on the
  // body's second block as the platform dwells at that end
  const PLUS_Y = 2;
  const corkscrew = (x) => ({ x, y: 14, z: 16, kind: 0, on: [object(PLUS_Y, CORKSCREW)] });
  const l = level(
    [
      [17, 17, 17],
      [17, 18, 17],
      [17, 15, 17],
      [18, 14, 16],
      [21, 14, 16],
    ],
    [start(), platform(17, 15, 17, [20, 15, 17]), corkscrew(18), corkscrew(21)],
  );
  const live = standing(l, { cell: [17, 17, 17], face: TOP, h: UP });
  const key = cellKey(17, 15, 17);
  const w = live.world.walkers.get(`${key}/null`);
  while (!(w.pos[0] === 17 * UNIT && w.dwell > 0)) frame(live, 0);
  frame(live, PAD.up | PAD.cross);
  const landing = trace(live, 40, 0, (l) => l.ball.riding !== null);
  assert.ok(has(landing.at(-1), "rode"));
  const b = live.ball;
  frame(live, PAD.right);
  trace(live, 40, 0, resting);
  assert.deepEqual(b.h, [1, 0, 0], "facing along the platform");
  trace(live, 60, PAD.up, (l) => l.ball.state === ROLLING);
  trace(live, 60, 0, resting);
  assert.deepEqual(
    cellOf(b, b.pos),
    [18, 15, 16],
    "over the body's second block, in the platform's coordinates",
  );
  const { home } = live.world.platforms.get(key);
  const { bias } = motion.kinds["5"].ride;
  const [near, far] = [18, 21].map((x) =>
    live.world.captivators.find((c) => c.slot === slot([x, 14, 16], PLUS_Y)),
  );
  const entry = (c) => live.world.walkers.get(c.slot)?.pos ?? c.at;
  const seen = [];
  while (!dying(live) && live.words.frame < 900) {
    frame(live, 0);
    const words = b.pos.map((v, i) => v - home[i] + bias);
    seen.push({
      dwell: w.dwell > 0 ? (w.pos[0] > home[0] ? "far" : "home") : null,
      level: [near, far].map((c) => squared(positionOf(b), entry(c))),
      relative: squared(b.pos, entry(near)),
      words: [near, far].map((c) => squared(words, entry(c))),
    });
  }
  assert.ok(!dying(live), "not caught while riding");
  assert.deepEqual(b.riding, { key });
  assert.ok(
    seen.some((s) => s.dwell === "far" && s.level[1] <= far.square),
    "though its place in the level came within the far corkscrew's reach as the platform dwelt at the far end",
  );
  assert.ok(
    seen.some((s) => s.dwell === "home" && s.level[0] <= near.square),
    "and within the near one's as it dwelt at home",
  );
  assert.ok(
    seen.every((s) => s.relative <= near.square),
    "and its position relative to the platform's home stood within the near one's reach throughout",
  );
  assert.ok(
    seen.every((s) => s.words.every((d2, i) => d2 > [near, far][i].square)),
    "while its words, relative to the platform and biased by a block, never came within either's",
  );
  const stood = standing(
    level(
      [
        [17, 17, 17],
        [17, 18, 17],
        [21, 15, 17],
        [21, 14, 16],
      ],
      [start(), corkscrew(21)],
    ),
    { cell: [21, 15, 17], face: TOP, h: UP },
  );
  const caught = trace(stood, 120, 0, dying);
  assert.ok(dying(stood), "a ball standing in that place is caught");
  assert.deepEqual(
    caught.at(-1).events.filter((e) => e.dying),
    [{ dying: { cause: "captivator", wait: play.wait.captivator } }],
  );
});
