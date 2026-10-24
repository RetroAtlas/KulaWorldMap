import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { FACE_NORMAL, cellKey } from "../../public/js/format/lattice.js";
import { index } from "../../public/js/viewer/data.js";
import {
  FALL,
  HOP,
  JUMP,
  PAD,
  REST,
  ROLLING,
  blockUnder,
  cellOf,
  positionOf,
} from "../../public/js/play/ball.js";
import { frame, relevel, restart, seeing } from "../../public/js/play/rules.js";
import { probeOf, shiftOf, standingOf, viewOf } from "../../public/js/play/world.js";
import { blockPhase } from "../../public/js/viewer/motion.js";
import {
  BOUNCY,
  HOURGLASS,
  INVINCIBLE,
  KEY,
  LETHARGY,
  ROLL,
  TOP,
  UNIT,
  UP,
  begin,
  level,
  motion,
  object,
  play,
  row,
  start,
  steps,
} from "./rules-level.js";

const CRUMBLING = 6;

const VANISHING = 7;

const EXIT = 7;

const SUNGLASSES = "38";

/** A crumbling block's record at (17, `y`, 17), whole. */
const crumbling = (y) => ({ x: 17, y, z: 17, kind: CRUMBLING, type: 1, f: Array(11).fill(0) });

/** A vanishing block's record at (17, `y`, 17) in `phase`. */
const vanishing = (y, phase) => ({
  x: 17,
  y,
  z: 17,
  kind: VANISHING,
  type: 0,
  f: [phase, ...Array(10).fill(0)],
});

/** Frames with nothing held until the level ends: the frame counts of the landing and the
    ending, and the ending's code. */
function flown(live) {
  const out = { landed: null, ended: null, code: null };
  for (let f = 0; f < 60 && out.ended === null; f++)
    for (const e of frame(live, 0)) {
      if (e.at === "landed") out.landed = live.words.frame;
      if (e.ended) Object.assign(out, { ended: live.words.frame, code: e.ended.code });
    }
  return out;
}

const PLATFORM = motion.kinds["5"];

const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);

/** A platform's record at (x, y, z), `length` blocks long, its run from its cell to `far` along
    one axis, setting off toward `far`. */
function platform(x, y, z, far, length = 2) {
  const cell = [x, y, z];
  const axis = [0, 1, 2].find((i) => far[i] !== cell[i]);
  const step = [0, 0, 0];
  step[axis] = far[axis] > cell[axis] ? 1 : -1;
  const type = FACE_NORMAL.findIndex((n) => n.every((v, i) => v === step[i]));
  const [lower, upper] = far[axis] > cell[axis] ? [cell, far] : [far, cell];
  const f = [[1, 2, 5][axis], lower === cell ? 0 : 1, ...lower, ...upper, -1, -1, -1];
  return { x, y, z, kind: 5, type, f, length };
}

/** A level of two blocks before a platform two blocks long that runs two blocks along +x from
    (17, 15, 17), with `records` on blocks of their own besides, the ball at rest on the top of
    (17, 17, 17) facing it. */
function docked(records = [], keyed = true) {
  const l = level(
    [[17, 17, 17], [17, 18, 17], [17, 15, 17], ...records.map((r) => [r.x, r.y, r.z])],
    [start(), platform(17, 15, 17, [19, 15, 17]), ...records],
    99,
    keyed,
  );
  const live = begin(l, { cell: [17, 17, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const key = cellKey(17, 15, 17);
  return { l, live, key, w: live.world.walkers.get(`${key}/null`), home: 17 * UNIT };
}

/** The ball jumped onto the platform as it dwells at its cell again, riding it. */
function riding(records = [], keyed = true) {
  const d = docked(records, keyed);
  const { live, w, home } = d;
  while (!(w.pos[0] === home && w.dwell > 0)) frame(live, 0);
  const arrived = live.words.frame;
  frame(live, PAD.up | PAD.cross);
  const seen = steps(live, 40, 0);
  return { ...d, arrived, seen };
}

test("the word for what the ball stands on is read between its state and its move step: a climb's frame reads under the face being left and a wrap's frame the cell beyond the edge", () => {
  const wall = level([...row(16, 18), [17, 15, 17, 2], [17, 14, 17], [17, 14, 16]], [start()]);
  const live = begin(wall);
  live.words.wait = 0;
  let events = [];
  while (!events.some((e) => e.face) && live.words.frame < 200) events = frame(live, PAD.up);
  assert.deepEqual(
    events.filter((e) => e.face),
    [{ face: "climb" }],
  );
  assert.equal(live.words.standing, 2, "the ice the ball is leaving");
  assert.equal(standingOf(live), -1, "where a read as the frame ends gives the wall's bare face");
  frame(live, PAD.up);
  assert.equal(live.words.standing, -1, "which the next frame reads");

  const ridge = level([...row(10, 18), [17, 11, 16, 2]], [start()]);
  const wrap = begin(ridge, { cell: [17, 10, 17], face: TOP, h: UP });
  wrap.words.wait = 0;
  events = [];
  while (!events.some((e) => e.face) && wrap.words.frame < 200) events = frame(wrap, PAD.up);
  assert.deepEqual(
    events.filter((e) => e.face),
    [{ face: "wrap" }],
  );
  assert.equal(wrap.words.standing, -1, "nothing under the cell beyond the edge");
  assert.equal(standingOf(wrap), 2, "where a read as the frame ends gives the ice behind the edge");
});

test("the ball leaves by the exit it stands on with no key left, five frames after the hazards find it there, and never while a key is left", () => {
  const exit = { x: 17, y: 12, z: 17, kind: 0, on: [object(0, EXIT)] };
  const key = { x: 17, y: 16, z: 17, kind: 0, on: [object(0, KEY)] };
  const live = begin(level(row(10, 18), [start(), key, exit], 99, false));
  let onExit = null;
  let ended = null;
  for (let f = 1; f <= 400 && !ended; f++) {
    const out = frame(live, PAD.up);
    if (onExit === null && live.words.standing === EXIT) onExit = live.words.frame;
    ended = out.find((e) => e.ended) ?? null;
  }
  assert.ok(onExit !== null && ended, "the ball reached the exit and the level ended");
  assert.equal(ended.ended.code, play.ending.exit);
  assert.equal(live.words.outcome, play.ending.exit);
  assert.equal(live.words.keys, 0);
  assert.equal(live.words.frame, onExit + 1 + play.wait.exit, "the hazards' frame and the wait");
  assert.equal(live.words.result, play.ending.exit, "by the wait's result");

  const aside = { x: 17, y: 16, z: 17, kind: 0, on: [object(1, KEY)] };
  const kept = begin(level(row(10, 18), [start(), aside, exit], 99, false));
  const events = steps(kept, 150, PAD.up);
  assert.equal(kept.words.keys, 1, "the key on the side is out of reach");
  assert.ok(!events.some((e) => e.ended));
  assert.deepEqual([kept.words.ending, kept.words.result], [0, 0]);
});

test("a landing on the exit writes the result at once, where a roll onto it takes the wait", () => {
  const key = { x: 17, y: 17, z: 17, kind: 0, on: [object(0, KEY)] };
  const exit = { x: 17, y: 15, z: 17, kind: 0, on: [object(0, EXIT)] };
  const live = begin(level(row(10, 18), [start(), key, exit], 99, false));
  while (live.ball.state !== ROLLING) frame(live, PAD.up);
  while (!(live.ball.state === REST && blockUnder(live.ball)[1] === 17)) frame(live, 0);
  assert.equal(live.words.keys, 0, "the key taken on the way");
  frame(live, PAD.up | PAD.cross);
  assert.equal(live.ball.state, JUMP);
  const { landed, ended, code } = flown(live);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 17]);
  assert.equal(code, play.ending.exit);
  assert.equal(ended, landed + 2, "the hazards' frame after the landing, then the result's");
  assert.equal(live.words.result, play.ending.exit, "written as the result at once");
});

test("a level with no key marks the block under the ball once, skips the invisible block and ends with the last marked, the climb marking the block under the wall it takes", () => {
  const l = level([...row(10, 13), [17, 14, 17, 3], ...row(15, 18)], [start()], 99, false);
  const live = begin(l);
  assert.equal(live.words.unmarked, 8, "the invisible block is not counted");
  const events = steps(live, 400, PAD.up);
  const marked = events.filter((e) => e.marked);
  assert.equal(marked[0].at, 1, "the block under the start, on the first frame");
  assert.deepEqual(
    marked.map((e) => e.marked.left),
    [7, 6, 5, 4, 3, 2, 1, 0],
  );
  assert.ok(!marked.some((e) => e.marked.key === cellKey(17, 14, 17)));
  assert.deepEqual(
    marked.map((e) => live.world.marked.get(e.marked.key)),
    marked.map((e) => e.at - 1),
    "each mark stamped with the frame the draw shows after the frame that made it",
  );
  assert.deepEqual([...viewOf(live).marked], [...live.world.marked]);
  assert.equal(live.words.score, 8 * play.bonus.block);
  const ended = events.find((e) => e.ended);
  assert.equal(ended.ended.code, play.ending.bonus);
  assert.equal(ended.at, marked.at(-1).at + play.wait.bonus, "as an ending with its wait");
  assert.equal(live.words.result, play.ending.bonus);

  const two = begin(
    level(
      [
        [17, 18, 17],
        [17, 16, 17],
      ],
      [start()],
      99,
      false,
    ),
  );
  two.words.wait = 0;
  frame(two, 0);
  assert.equal(two.words.unmarked, 1);
  frame(two, PAD.up | PAD.cross);
  assert.equal(two.ball.state, JUMP);
  const flight = flown(two);
  assert.equal(flight.code, play.ending.bonus);
  assert.equal(flight.ended, flight.landed + 1, "at once, on the hazards' frame after the landing");
  assert.equal(two.words.result, 0, "written as the outcome and not the result");

  const wall = level([...row(15, 18), [17, 14, 17], [17, 14, 16]], [start()], 99, false);
  const climbing = begin(wall);
  climbing.words.wait = 0;
  let out = [];
  while (!out.some((e) => e.face) && climbing.words.frame < 200) out = frame(climbing, PAD.up);
  assert.ok(out.some((e) => e.face === "climb"));
  assert.deepEqual(
    out.filter((e) => e.marked).map((e) => e.marked.key),
    [cellKey(17, 14, 17)],
    "the block under the wall marked on the climb's own frame",
  );
  out = frame(climbing, PAD.up);
  assert.deepEqual(
    out.filter((e) => e.marked).map((e) => e.marked.key),
    [cellKey(17, 14, 16)],
    "and the wall on the next, as the ball stands on it",
  );
});

test("the pills' words run down in the hazards' order: the lethargy pill hurries the clock, the invincibility pill cuts the bouncy and lethargy pills short, and the bouncy pill asks the jump every frame", () => {
  const live = begin(level(row(10, 18), [start()]));
  live.words.wait = 0;
  const full = 99 * play.clock.second;
  const lasts = (t) => motion.types[t].lasts;
  Object.assign(live.words.pills, { [LETHARGY]: 4, [BOUNCY]: lasts(BOUNCY).word, [SUNGLASSES]: 2 });
  frame(live, 0);
  assert.equal(live.words.pills[SUNGLASSES], 2 - lasts(SUNGLASSES).step);
  assert.equal(live.words.pills[LETHARGY], 4 - lasts(LETHARGY).step);
  assert.equal(live.words.clock, full - play.clock.tick - lasts(LETHARGY).ticks);
  assert.equal(live.words.pills[BOUNCY], lasts(BOUNCY).word, "nothing counts the bouncy pill down");
  assert.equal(live.ball.state, HOP, "the jump asked with the ball at rest is a hop");
  steps(live, 3, 0);
  assert.equal(
    live.words.pills[LETHARGY],
    -2,
    "tested before it is counted, so it runs one frame at nothing",
  );
  assert.equal(live.words.clock, full - 4 * play.clock.tick - 3 * lasts(LETHARGY).ticks);
  frame(live, 0);
  assert.equal(live.words.pills[LETHARGY], -2);
  assert.equal(
    live.words.clock,
    full - 5 * play.clock.tick - 3 * lasts(LETHARGY).ticks,
    "and ticks the clock no more",
  );

  const guarded = begin(level(row(10, 18), [start()]));
  guarded.words.wait = 0;
  Object.assign(guarded.words.pills, { [INVINCIBLE]: 1, [BOUNCY]: 500, [LETHARGY]: 100 });
  frame(guarded, 0);
  assert.equal(guarded.words.pills[INVINCIBLE], 0);
  assert.equal(guarded.words.pills[BOUNCY], -1, "put back while the invincibility stands");
  assert.equal(
    guarded.words.pills[LETHARGY],
    -lasts(LETHARGY).step,
    "cut to nothing and counted once more",
  );
  assert.equal(guarded.words.clock, full - play.clock.tick - lasts(LETHARGY).ticks);
  frame(guarded, 0);
  assert.equal(guarded.words.pills[INVINCIBLE], -1);
  assert.equal(
    guarded.words.clock,
    full - 2 * play.clock.tick - lasts(LETHARGY).ticks,
    "the lethargy pill's word negative, its case is passed",
  );
  assert.equal(guarded.ball.state, HOP, "the jump asked before the hazards put the word back");

  const passed = begin(level(row(10, 18), [start()]));
  passed.words.wait = 0;
  Object.assign(passed.words.pills, { [INVINCIBLE]: 2, [LETHARGY]: -1 });
  steps(passed, 2, 0);
  assert.equal(passed.words.pills[INVINCIBLE], 0);
  assert.equal(passed.words.pills[LETHARGY], -1, "left negative while the invincibility stands");
  assert.equal(passed.words.clock, full - 2 * play.clock.tick, "and the clock not hurried");
});

test("the sunglasses show every invisible block while their word stands, blink it off and on in the table's spells as the word runs out, off first and the first spell the table's shorter one, and hide it after, the invincibility pill leaving them and a restart clearing them", () => {
  const { word, step, blink } = motion.types[SUNGLASSES].lasts;
  const live = begin(level(row(10, 18), [start()]));
  live.words.wait = 0;
  assert.equal(seeing(live), false);
  assert.equal(live.words.blink, null);
  live.words.pills[SUNGLASSES] = word;
  assert.equal(seeing(live), true, "shown from the frame of the take");
  // the frames the word is not negative on after the take's own frame, then the blink's frames
  const standing = Math.floor(word / step);
  const lengths = [blink.first, ...Array(blink.times - 1).fill(blink.frames)];
  const blinking = lengths.reduce((a, b) => a + b, 0);
  const shown = [];
  const spell = [];
  for (let i = 0; i < standing + blinking + 3; i++) {
    frame(live, 0);
    shown.push(seeing(live));
    spell.push(live.words.blink?.spell ?? null);
  }
  assert.deepEqual(shown.slice(0, standing), Array(standing).fill(true));
  const spells = lengths.flatMap((n, s) => Array(n).fill(s % 2 === 1));
  assert.deepEqual(shown.slice(standing, standing + blinking), spells, "off first, then by turns");
  assert.equal(
    shown.indexOf(true, standing),
    standing + blink.first,
    "the first spell the table's own",
  );
  assert.deepEqual(shown.slice(standing + blinking), [false, false, false], "and hidden after");
  assert.deepEqual(
    spell,
    [
      ...Array(standing).fill(null),
      ...lengths.flatMap((n, s) => Array(n).fill(s)),
      null,
      null,
      null,
    ],
    "each spell running its frames, the last to its end",
  );
  assert.equal(live.words.blink, null);
  assert.equal(live.words.pills[SUNGLASSES], -1);

  const guarded = begin(level(row(10, 18), [start()]));
  guarded.words.wait = 0;
  Object.assign(guarded.words.pills, { [INVINCIBLE]: word, [SUNGLASSES]: 0 });
  assert.equal(seeing(guarded), true);
  frame(guarded, 0);
  assert.equal(guarded.words.pills[SUNGLASSES], -step, "counted down under the invincibility pill");
  assert.deepEqual(guarded.words.blink, { spell: 0, left: blink.first }, "and the blink started");
  assert.equal(seeing(guarded), false);
  frame(guarded, 0);
  assert.deepEqual(guarded.words.blink, { spell: 0, left: blink.first - 1 }, "and running");
  guarded.words.pills[SUNGLASSES] = word;
  frame(guarded, 0);
  assert.equal(guarded.words.blink, null, "a second pair drops the blink");
  assert.equal(seeing(guarded), true, "and shows every block from its own word");

  const again = restart(guarded);
  assert.equal(again.words.pills[SUNGLASSES], -1);
  assert.equal(again.words.blink, null);
  assert.equal(seeing(again), false);
});

test("relevel carries what was taken where the level still holds it, and counts the keys and the blocks less what is taken and marked", () => {
  const coin = { x: 17, y: 16, z: 17, kind: 0, on: [object(0, 37)] };
  const key = { x: 17, y: 14, z: 17, kind: 0, on: [object(0, KEY)] };
  const l = level(row(10, 18), [start(), coin, key]);
  const live = begin(l);
  const events = steps(live, 120, PAD.up);
  assert.equal(events.filter((e) => e.took).length, 2);
  assert.equal(live.words.keys, 1, "the far key alone is left");
  const slots = [...live.world.taken];
  relevel(live, l, index(l));
  assert.deepEqual(
    [...live.world.taken],
    slots,
    "carried where the slots still hold the same things",
  );
  assert.equal(live.words.keys, 1);
  assert.equal(
    viewOf(live).markers.get(cellKey(17, 16, 17)).length,
    0,
    "and still gone from the frame",
  );
  const swapped = level(row(10, 18), [start(), { ...coin, on: [object(0, KEY)] }, key]);
  relevel(live, swapped, index(swapped));
  assert.deepEqual(
    [...live.world.taken],
    [`${cellKey(17, 14, 17)}/0`],
    "a slot that holds another thing is let go",
  );
  assert.equal(live.words.keys, 2, "the new key counted, the taken one not");

  const bonus = begin(level(row(10, 18), [start()], 99, false));
  steps(bonus, 60, PAD.up);
  const marked = [...bonus.world.marked];
  assert.ok(marked.length >= 2);
  const shorter = level(row(14, 18), [start()], 99, false);
  relevel(bonus, shorter, index(shorter));
  assert.equal(bonus.world.counted.size, 5);
  assert.deepEqual(
    [...bonus.world.marked],
    marked,
    "the marked blocks still stand, stamped as they were",
  );
  assert.deepEqual([...viewOf(bonus).marked], marked);
  assert.equal(bonus.words.unmarked, 5 - marked.length);
});

test("a vanishing block drops the ball at rest on it two frames after the first its cycle has it absent: the read of the frame after finds the cell empty, as the game's read sees the step before, the map having drawn it absent the frame before, and the rest state of the frame after that reads that word, the word under the ball reading nothing from the read on", () => {
  const l = level([...row(10, 18), [17, 15, 19]], [start(), vanishing(15, 2)]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const entry = motion.kinds[String(VANISHING)];
  const r = l.records.find((r) => r.kind === VANISHING);
  const absent = entry.cycle[2].indexOf(0);
  assert.ok(absent > 30, "solid as the level opens");
  assert.equal(live.words.standing, entry.standing);
  let dropped = null;
  while (dropped === null && live.words.frame < 400) {
    frame(live, 0);
    if (live.ball.state === FALL) dropped = live.words.frame - 1;
  }
  assert.equal(dropped, absent + 2, "the frame after the one whose read finds the cell empty");
  assert.equal(
    blockPhase(entry, r, dropped - 2).state,
    0,
    "the step before that took the block out",
  );
  assert.notEqual(blockPhase(entry, r, dropped - 3).state, 0);
  assert.equal(live.ball.v, motion.types["30"].fall.start);
  assert.equal(live.words.standing, -1, "nothing under the ball since that read");
  while (live.ball.state === FALL && live.words.frame < 400) frame(live, 0);
  assert.equal(live.ball.state, REST);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 19], "down on the block below");
  const back = entry.cycle[2].findIndex((s, i) => i > absent && s !== 0);
  while (live.words.frame < back) frame(live, 0);
  assert.equal(probeOf(live).solid([17, 15, 17]), false, "absent to the frame drawn absent last");
  frame(live, 0);
  assert.equal(probeOf(live).solid([17, 15, 17]), true, "in the lattice again as it fades in");
});

test("nothing refuses a roll onto a vanishing block about to go: the ball rolls onto one flashing out and falls from between the roll's bounds once it is absent", () => {
  const l = level([...row(10, 18), [17, 14, 19]], [start(), vanishing(14, 2)]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const cycle = motion.kinds[String(VANISHING)].cycle[2];
  const absent = cycle.indexOf(0);
  // a roll from rest enters the next cell on its eleventh frame
  while (live.words.frame < absent - 12) frame(live, 0);
  let entered = null;
  const events = [];
  while (live.ball.state !== FALL && live.words.frame < absent + 40) {
    events.push(...frame(live, PAD.up));
    if (entered === null && blockUnder(live.ball)[1] === 14) entered = live.words.frame - 1;
  }
  assert.ok(entered !== null, "the ball rolled onto the block");
  assert.equal(cycle[entered], 5, "flashing out as the ball came onto it");
  assert.ok(!events.some((e) => e.refused || e.face));
  assert.equal(live.ball.state, FALL);
  const dropped = live.words.frame - 1;
  assert.equal(
    cycle[dropped - 2],
    0,
    "absent to the read before the roll's drop, by the step before that",
  );
  assert.ok(
    live.ball.progress >= ROLL.over[0] && live.ball.progress <= ROLL.over[1],
    String(live.ball.progress),
  );
  while (live.ball.state === FALL && live.words.frame < 400) frame(live, 0);
  assert.deepEqual(blockUnder(live.ball), [17, 14, 19]);
});

test("relevel carries a gone block where the level still holds a crumbling block there, and lets it go where it does not", () => {
  const l = level([...row(10, 18), [17, 15, 19]], [start(), crumbling(15)]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const events = steps(live, 20, 0);
  const key = cellKey(17, 15, 17);
  assert.ok(events.some((e) => e.fell?.key === key));
  assert.ok(live.world.gone.has(key));
  relevel(live, l, index(l));
  assert.ok(live.world.gone.has(key), "carried");
  assert.equal(live.world.cells.has(key), false);
  assert.equal(live.world.crumbling.has(key), false);
  assert.equal(viewOf(live).cells.has(key), false);
  assert.equal(probeOf(live).solid([17, 15, 17]), false);
  const plain = level([...row(10, 18), [17, 15, 19]], [start()]);
  relevel(live, plain, index(plain));
  assert.equal(live.world.gone.size, 0, "let go where a plain block stands there");
  assert.equal(probeOf(live).solid([17, 15, 17]), true);
});

test("the landings try a platform before a block: a jump that comes down on a platform's body where it stands rides it at rest, the standing word the platform's word, and one that comes down on its home cell while the body is away falls through", () => {
  const { live, key, w, arrived, seen } = riding();
  assert.equal(w.dwell <= PLATFORM.dwell && w.dwell > 0, true);
  const rode = seen.find((e) => e.rode);
  assert.ok(rode, "the ball rode");
  assert.equal(rode.at, arrived + 31, "on the frame the jump comes down");
  assert.deepEqual(rode.rode, { key });
  assert.ok(seen.some((e) => e.at === "landed"));
  assert.ok(!seen.some((e) => e.ended || e.dying || e.lost));
  const b = live.ball;
  assert.deepEqual(b.riding, { key });
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(live.words.standing, PLATFORM.standing, "the platform's word under the ball");
  assert.equal(probeOf(live).solid([17, 15, 17]), true);
  assert.equal(probeOf(live).solid([17, 17, 17]), false, "the level's blocks are not the rider's");

  const away = docked();
  while (!(away.w.pos[0] > away.home + UNIT && away.w.dwell > 0)) frame(away.live, 0);
  const p = probeOf(away.live);
  assert.equal(
    p.value([17, 15, 17]),
    mapData.firstRecord + 1,
    "the lattice's word at the home cell",
  );
  assert.equal(p.solid([17, 15, 17]), false, "with nothing to land on there");
  assert.equal(p.solid([19, 15, 17]), true, "the body where it stands");
  assert.equal(p.solid([20, 15, 17]), true);
  frame(away.live, PAD.up | PAD.cross);
  assert.equal(away.live.ball.state, JUMP);
  const fell = steps(away.live, 400, 0);
  assert.ok(!fell.some((e) => e.rode));
  assert.ok(
    fell.some((e) => e.ended?.code === play.ending.lost),
    "fallen through and lost",
  );
  assert.equal(away.live.ball.riding, null);
});

test("riding, the ball's travel is its platform's position less its home, taken afresh each frame after the walkers step, so the block under it in the level follows the platform, which reverses under it at the run's ends while it rides on at rest where it is", () => {
  const { live, key, w } = riding();
  const b = live.ball;
  const { home } = live.world.platforms.get(key);
  const rel = [...b.pos];
  const seen = [];
  for (let f = 0; f < 180; f++) {
    frame(live, 0);
    seen.push({
      travel: [...b.travel],
      pos: [...w.pos],
      block: blockUnder(b).join(","),
      state: b.state,
      dir: w.dir[0],
      centre: positionOf(b),
    });
  }
  assert.ok(
    seen.every((s) => s.travel.every((v, i) => v === s.pos[i] - home[i])),
    "the travel is the platform's shift as the walkers left it",
  );
  assert.ok(seen.every((s) => s.state === REST));
  assert.deepEqual(b.riding, { key });
  assert.deepEqual(b.pos, rel, "the position stands while the platform carries it");
  assert.ok(
    seen.every((s) => s.centre.every((v, i) => v === rel[i] + s.travel[i])),
    "the centre in the level is the position with the travel added",
  );
  const runs = seen.map((s) => s.block).filter((v, i, a) => i === 0 || v !== a[i - 1]);
  assert.deepEqual(runs, ["17,15,17", "18,15,17", "19,15,17", "18,15,17", "17,15,17"]);
  assert.ok(seen.some((s) => s.dir > 0) && seen.some((s) => s.dir < 0), "reversed under the ball");
  assert.ok(!seen.some((s) => s.block === "20,15,17"), "the far end is the first block's");
});

test("the contact walk takes nothing while the ball rides, the cells about it being the platform's cells: an hourglass beside the body's second block, within reach by the table's measure of the ball rolled onto that block at home, is left", () => {
  const face = FACE_NORMAL.findIndex((n) => n[1] === 1);
  const beside = { x: 18, y: 14, z: 16, kind: 0, on: [object(face, HOURGLASS)] };
  const { live, w, home } = riding([beside]);
  const b = live.ball;
  const seen = [];
  for (let f = 0; f < 400 && !b.travel.some((v) => v !== 0); f++) seen.push(...frame(live, 0));
  for (let f = 0; f < 400 && !(w.pos[0] === home && w.dwell > 0); f++) seen.push(...frame(live, 0));
  assert.ok(w.pos[0] === home && w.dwell > 0 && b.riding, "back home from its run, dwelling");
  seen.push(...frame(live, PAD.right));
  assert.deepEqual(b.h, [1, 0, 0], "facing along the body");
  for (let f = 0; f < 60 && !(cellOf(b, b.pos)[0] === 18 && b.state === REST); f++)
    seen.push(...frame(live, cellOf(b, b.pos)[0] === 18 ? 0 : PAD.up));
  assert.ok(w.dwell > 0 && b.state === REST && b.riding, "at rest on the second block, still home");
  assert.deepEqual(cellOf(b, b.pos), [18, 15, 16]);
  const p = live.world.pickups.get(`${cellKey(18, 14, 16)}/${face}`);
  assert.ok(p);
  assert.ok(
    squared(b.pos, p.at) < p.take.reach ** 2 + b.radius ** 2,
    "within reach of the centre, as the walk measures it",
  );
  for (; w.dwell > 0;) seen.push(...frame(live, 0));
  assert.ok(!seen.some((e) => e.took || e.clock), "nothing taken");
  assert.equal(live.world.taken.size, 0);
});

test("a level with no key marks no block under the riding ball, the cells about it being the platform's cells, so the count stands and the level does not end while it rides", () => {
  const { live, key } = riding([], false);
  const b = live.ball;
  assert.deepEqual(b.riding, { key });
  assert.equal(live.words.unmarked, 1, "the launch block marked, the start's never reached");
  const seen = steps(live, 120, 0);
  assert.ok(!seen.some((e) => e.marked), "nothing marked while riding");
  assert.ok(!seen.some((e) => e.ended));
  assert.equal(live.words.unmarked, 1);
  assert.deepEqual(b.riding, { key });
});

test("relevel keeps a riding ball on its platform where the edited level still holds it, its travel the new world's shift, and sets it down in the level where it does not", () => {
  const { l, live, key } = riding();
  const b = live.ball;
  for (let f = 0; f < 200 && !b.travel.some((v) => v !== 0); f++) frame(live, 0);
  assert.ok(
    b.travel.some((v) => v !== 0),
    "carried off home",
  );
  const rel = [...b.pos];
  relevel(live, l, index(l));
  assert.deepEqual(b.riding, { key });
  assert.deepEqual(b.travel, shiftOf(live.world, key), "the travel the new world's shift");
  assert.deepEqual(b.pos, rel, "the position the platform's still");
  const here = positionOf(b);
  const without = level(
    [
      [17, 17, 17],
      [17, 18, 17],
    ],
    [start()],
  );
  relevel(live, without, index(without));
  assert.equal(b.riding, null);
  assert.equal(b.travel, null);
  assert.deepEqual(b.pos, here, "set down where it was in the level");
  assert.deepEqual(positionOf(b), here);
});
