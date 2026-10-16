import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { cellKey } from "../../public/js/format/lattice.js";
import {
  setObjects,
  setAnnotations,
  index,
  markerState,
  markerCircuit,
} from "../../public/js/viewer/data.js";
import { dice } from "../../public/js/viewer/travel.js";
import {
  REST,
  HOP,
  JUMP,
  FALL,
  ROLLING,
  PAD,
  blockUnder,
  faceUnder,
} from "../../public/js/play/ball.js";
import {
  startRun,
  frame,
  heeds,
  restart,
  revive,
  stand,
  relevel,
  end,
} from "../../public/js/play/rules.js";
import { probeOf, standingOf, viewOf } from "../../public/js/play/world.js";
import { recorder, replayDriver } from "../../public/js/play/drive.js";

setObjects(objects);
setAnnotations(annotations);
state.data = mapData;
const motion = objects.motion;
const { play } = motion;
const UNIT = objects.block;
const TABLES = {
  motion,
  jump: objects.jump,
  unit: UNIT,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
};
const UP = [0, -1, 0];
const TOP = 0;
const EXIT = 7;
const KEY = 31;
const LETHARGY = "32";
const BOUNCY = "33";
const INVINCIBLE = "34";
const SUNGLASSES = "38";

/** The circuits as a parity map, turned over by each press. */
function circuits() {
  const presses = new Map();
  const turned = (c) => (presses.get(c) ?? []).length % 2 === 1;
  return {
    presses,
    on: (m) => (markerState(m) === "on") !== turned(markerCircuit(m)),
    lit: (ray) => ray.lit !== turned(ray.colour),
    flip: (c, at) => presses.set(c, [...(presses.get(c) ?? []), at]),
  };
}

const object = (face, type, facing = 0, f3 = 0) => ({
  face,
  type,
  f: [facing, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1],
  v: 0,
});
// A key far from anything the ball reaches, so a level plays as an arcade one.
const FAR = [25, 25, 25];
const FAR_KEY = { x: 25, y: 25, z: 25, kind: 0, on: [object(0, KEY)] };
/** A level of blocks of the kinds given, some carrying a record, laid out to order, with `time`
    seconds, and a key far off unless `keyed` is false. */
function level(blocks, records = [], time = 99, keyed = true) {
  const all = keyed ? [...records, FAR_KEY] : records;
  const cells = [];
  const placed = new Map(all.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z, kind = 0] of keyed ? [...blocks, FAR] : blocks) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? kind : mapData.firstRecord + i);
  }
  return { cells, records: all.map((r) => ({ on: [], ...r })), time };
}
/** A row of blocks along y at x 17, z 17. */
const row = (y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17]);
/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's does. */
const start = (type = 30) => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(0, type, 3)] });
const begin = (l, at = null) => startRun(l, index(l), TABLES, circuits(), at);
/** Run `n` frames with `pad` held: the events, each with the frame count it left. */
function steps(live, n, pad = 0) {
  const out = [];
  for (let i = 0; i < n; i++)
    for (const e of frame(live, pad)) out.push({ at: live.words.frame, ...e });
  return out;
}
const PILLS = Object.keys(motion.types).filter((t) => motion.types[t].lasts);

test("a run opens as the level's start sets the words: the clock full, the pad dead, the keys counted", () => {
  const l = level(row(10, 18), [start(), { x: 17, y: 12, z: 17, kind: 0, on: [object(0, 31)] }]);
  const live = begin(l);
  const w = live.words;
  assert.equal(w.clock, 99 * play.clock.second);
  assert.equal(w.wait, play.start.wait);
  assert.equal(w.guard, 0);
  assert.equal(w.frame, 0);
  assert.equal(w.keys, 2);
  assert.equal(w.bonus, false);
  assert.equal(w.unmarked, live.world.counted.size);
  assert.equal(w.mode, 0);
  assert.deepEqual([w.score, w.outcome, w.result, w.ending, w.frozen, w.dying], [0, 0, 0, 0, 0, 0]);
  assert.equal(w.send, -1);
  assert.deepEqual(w.pills, Object.fromEntries(PILLS.map((t) => [t, -1])));
  assert.equal(w.standing, 30, "the start's own slot under the ball");
  assert.deepEqual(blockUnder(live.ball), [17, 18, 17]);
  assert.equal(faceUnder(live.ball), TOP);
  assert.deepEqual(
    live.ball.h.map((v) => v + 0),
    UP,
  );
  assert.equal(live.level, l);
  assert.equal(live.at, null);

  const bonus = begin(level(row(10, 18), [start()], 99, false));
  assert.equal(bonus.words.keys, 0);
  assert.equal(bonus.words.bonus, true, "a level with no key plays as a bonus level");

  const at = { cell: [17, 12, 17], face: TOP, h: [1, 0, 0] };
  const placed = begin(l, at);
  assert.deepEqual(blockUnder(placed.ball), [17, 12, 17]);
  assert.deepEqual(placed.ball.h, [1, 0, 0]);
  assert.equal(placed.at, at);
  assert.throws(() => begin(level(row(10, 18))), /no start/);
});

test("the clock ticks once a frame and the level ends with the clock's code as it reaches nothing", () => {
  const l = level(row(10, 18), [start()], 1);
  const live = begin(l);
  const ticks = play.clock.second;
  assert.deepEqual(steps(live, ticks - 1), []);
  assert.equal(live.words.clock, play.clock.tick);
  assert.equal(live.words.outcome, 0);
  const last = frame(live, 0);
  assert.deepEqual(last, [{ ended: { code: play.clock.out, score: 0, clock: 0 } }]);
  assert.equal(play.clock.out, play.ending.time);
  assert.equal(live.words.outcome, play.clock.out);
  assert.equal(live.words.frame, ticks, "the frame the clock ran out on ran to its end");
  assert.deepEqual(frame(live, PAD.up), [], "and nothing runs after");
  assert.equal(live.words.frame, ticks);
  assert.equal(live.ball.state, REST);
});

test("the clock stands while the ball is on a clock face and runs again as it rolls off", () => {
  const l = level(row(10, 18), [start(29)]);
  const live = begin(l);
  assert.equal(live.words.standing, play.clock.face);
  const full = 99 * play.clock.second;
  steps(live, 30, PAD.up);
  assert.equal(live.words.clock, full, "the ball still over the clock");
  assert.equal(live.ball.state, ROLLING);
  assert.deepEqual(
    blockUnder(live.ball),
    [17, 17, 17],
    "its centre over the next block as the frame ends",
  );
  frame(live, PAD.up);
  assert.equal(live.words.clock, full - play.clock.tick, "which the next frame's tick reads");
  steps(live, 10, PAD.up);
  assert.equal(live.words.clock, full - 11 * play.clock.tick);
});

test("a level opens with the pad dead for 19 frames, read from the 20th", () => {
  const live = begin(level(row(10, 18), [start()]));
  const at = [...live.ball.pos];
  const dead = play.start.wait - 1;
  const heeded = [];
  for (let f = 1; f <= dead; f++) {
    heeded.push(heeds(live));
    assert.deepEqual(frame(live, PAD.up), []);
  }
  assert.deepEqual(heeded, Array(dead).fill(false));
  assert.equal(live.ball.state, REST);
  assert.deepEqual(live.ball.pos, at);
  assert.equal(live.ball.forward, false);
  assert.equal(live.words.wait, 1);
  assert.equal(heeds(live), true, "the frame the wait runs out on reads the pad");
  frame(live, PAD.up);
  assert.equal(heeds(live), true);
  assert.equal(live.words.wait, 0);
  assert.equal(live.ball.state, ROLLING);
  assert.equal(live.ball.speed, motion.types["30"].rolling.gain);
  assert.equal(live.words.frame, play.start.wait);
});

test("the guard a restart sets holds for 18 frames and clears on the 19th, and Cross held keeps it standing", () => {
  const l = level(row(10, 18), [start()]);
  const live = restart(begin(l));
  assert.equal(live.words.guard, 1);
  const seen = [];
  for (let f = 1; f <= play.start.guard - 1; f++) {
    frame(live, 0);
    seen.push(live.words.guard);
  }
  assert.deepEqual(
    seen,
    Array.from({ length: play.start.guard - 1 }, (_, i) => (i + 2) % play.start.guard),
  );
  assert.equal(seen.at(-1), 0);

  const held = restart(begin(l));
  held.words.wait = 0;
  held.ball.previous = PAD.up;
  held.ball.since = 3;
  frame(held, PAD.cross);
  assert.equal(held.words.guard, 2, "Cross held reads nothing and leaves the guard counting");
  assert.equal(held.ball.state, REST);
  assert.deepEqual(
    [held.ball.previous, held.ball.since],
    [PAD.up, 3],
    "the last frame's pad and the count untouched",
  );
  frame(held, 0);
  assert.equal(held.words.guard, 0, "Cross up clears it as the pad is read");
  frame(held, PAD.cross);
  assert.equal(held.ball.state, HOP);
});

test("a wait holds the pad off and clears the ball's requests, and its ending becomes the result as it runs out", () => {
  const live = begin(level(row(10, 18), [start()]));
  Object.assign(live.words, { ending: play.ending.exit, wait: play.wait.exit });
  assert.deepEqual(steps(live, play.wait.exit - 1, PAD.up), []);
  assert.equal(live.ball.state, REST);
  assert.equal(live.ball.forward, false);
  assert.equal(live.words.result, 0);
  const last = frame(live, PAD.up);
  assert.deepEqual(
    last.filter((e) => e.ended),
    [
      {
        ended: {
          code: play.ending.exit,
          score: 0,
          clock: 99 * play.clock.second - play.wait.exit * play.clock.tick,
        },
      },
    ],
  );
  assert.equal(live.words.result, play.ending.exit);
  assert.equal(live.words.outcome, play.ending.exit);
  assert.deepEqual(frame(live, PAD.up), []);
});

test("the spikes' ending becomes the outcome a frame before its wait runs out", () => {
  const live = begin(level(row(10, 18), [start()]));
  Object.assign(live.words, { ending: play.ending.spikes, wait: play.wait.spikes });
  assert.deepEqual(steps(live, play.wait.spikes - 2), []);
  const early = frame(live, 0);
  assert.equal(live.words.wait, 1);
  assert.deepEqual(
    early.map((e) => e.ended?.code),
    [play.ending.spikes],
  );
  assert.equal(live.words.result, 0, "written into the outcome and not the result");
  assert.equal(live.words.outcome, play.ending.spikes);
  assert.deepEqual(frame(live, 0), []);
});

test("a pill that hurries the clock ticks it more from the hazards' slot, which the guard holds off", () => {
  const hurry = PILLS.find((t) => motion.types[t].lasts.ticks);
  const extra = motion.types[hurry].lasts.ticks;
  const full = 99 * play.clock.second;
  const live = begin(level(row(10, 18), [start()]));
  live.words.pills[hurry] = 0;
  frame(live, 0);
  assert.equal(live.words.clock, full - play.clock.tick - extra);
  const guarded = restart(begin(level(row(10, 18), [start()])));
  guarded.words.pills[hurry] = 0;
  frame(guarded, 0);
  assert.equal(
    guarded.words.clock,
    full - play.clock.tick,
    "the hazards stand off under the guard",
  );
});

test("a frame runs in the game's order: the pad read, the walkers stepped, then the ball run", () => {
  const l = level(row(10, 18), [start(), { x: 17, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] }]);
  const live = begin(l);
  live.words.wait = 0;
  const log = [];
  live.world.cells = new (class extends Map {
    has(key) {
      log.push("ball");
      return super.has(key);
    }
  })(live.world.cells);
  live.world.walkers = new (class extends Map {
    values() {
      log.push("walkers");
      return super.values();
    }
  })(live.world.walkers);
  frame(live, PAD.up);
  assert.equal(log[0], "ball", "the pad's read asks the lattice first");
  assert.ok(log.includes("walkers"));
  assert.ok(
    log.lastIndexOf("ball") > log.lastIndexOf("walkers"),
    "and the ball runs after the walkers",
  );
  assert.equal(live.ball.state, ROLLING);
});

test("a frame leaves the words the game's order implies: the clock ticked, the wait counted, the star stepped and the ball still", () => {
  const l = level(row(10, 18), [start(), { x: 17, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] }]);
  const live = begin(l);
  const star = [...live.world.walkers.values()][0];
  const home = [...star.pos];
  const at = [...live.ball.pos];
  assert.deepEqual(frame(live, PAD.up), []);
  const w = live.words;
  assert.equal(w.frame, 1);
  assert.equal(w.clock, 99 * play.clock.second - play.clock.tick);
  assert.equal(w.wait, play.start.wait - 1);
  assert.equal(w.guard, 0);
  assert.equal(star.at, 1);
  assert.notDeepEqual(star.pos, home, "the star has taken its first step");
  assert.deepEqual(live.ball.pos, at, "the ball has not, the pad being dead");
  assert.equal(w.standing, 30);
});

test("restart puts every word back, the ball on the start, the walkers laid anew and the dice reseeded", () => {
  const l = level(row(10, 18), [
    start(),
    { x: 17, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] },
    { x: 17, y: 14, z: 17, kind: 0, on: [object(0, 53, 4)] },
  ]);
  const live = begin(l);
  steps(live, 120, PAD.up);
  assert.notDeepEqual(blockUnder(live.ball), [17, 18, 17]);
  assert.ok(live.words.clock < 99 * play.clock.second);
  live.world.roll(4);
  const fresh = begin(l);
  const again = restart(live);
  assert.deepEqual(again.words, { ...fresh.words, guard: 1 });
  assert.deepEqual(again.ball.pos, fresh.ball.pos);
  assert.deepEqual(again.ball.h, fresh.ball.h);
  assert.deepEqual(blockUnder(again.ball), [17, 18, 17]);
  const walkers = (run) =>
    [...run.world.walkers.values()].map((w) => ({ at: w.at, pos: [...w.pos] }));
  assert.deepEqual(walkers(again), walkers(fresh));
  assert.equal(walkers(again)[0].at, 0);
  assert.equal(again.world.roll(4), dice(motion.dice)(4), "the first draw is a fresh seed's");
  assert.equal(again.level, l);
  assert.equal(again.idx, live.idx);
  assert.notEqual(again.world, live.world);
  assert.equal(again.world.taken.size, 0);
  assert.equal(live.words.frame, 120, "the run restarted from is left as it was");
});

test("restart stands the ball at the station it is given once the level's start has been edited away", () => {
  const l = level(row(10, 18), [start()]);
  const live = begin(l);
  steps(live, 30, PAD.up);
  const bare = level(row(10, 18));
  relevel(live, bare, index(bare));
  assert.throws(() => restart(live), /no start/);
  const at = { cell: [17, 15, 17], face: TOP, h: [1, 0, 0] };
  const again = restart(live, at);
  assert.deepEqual(blockUnder(again.ball), [17, 15, 17]);
  assert.deepEqual(again.ball.h, [1, 0, 0]);
  assert.equal(again.at, at);
  assert.equal(again.level, bare);
  assert.deepEqual([again.words.guard, again.words.wait], [1, play.start.wait]);
});

test("a lost ball ends the run with the lattice's code, and revive puts it back on its last rest", () => {
  const live = begin(level([[17, 18, 17]], [start()]));
  const events = steps(live, 400, PAD.up | PAD.cross);
  const ended = events.find((e) => e.ended);
  assert.ok(ended, "the jump off the block fell off the lattice");
  assert.equal(ended.ended.code, play.ending.lost);
  assert.ok(
    events.some((e) => e.lost && e.at === ended.at),
    "in the frame the ball was lost",
  );
  assert.equal(events.filter((e) => e.ended).length, 1);
  assert.equal(live.words.outcome, play.ending.lost);
  assert.equal(live.ball.state, FALL, "left where it fell");
  const before = live.words.frame;
  revive(live);
  assert.equal(live.words.outcome, 0);
  assert.deepEqual(blockUnder(live.ball), [17, 18, 17]);
  assert.equal(live.ball.state, REST);
  assert.equal(live.words.standing, 30);
  assert.equal(live.words.frame, before, "the frame count runs on");
  frame(live, 0);
  assert.equal(live.words.frame, before + 1);
});

test("a run ends once, by the first code that reaches it", () => {
  const live = begin(level(row(10, 18), [start()]));
  const out = [];
  end(live, play.ending.exit, out);
  end(live, play.ending.lost, out);
  assert.deepEqual(out, [{ ended: { code: play.ending.exit, score: 0, clock: live.words.clock } }]);
  assert.equal(live.words.outcome, play.ending.exit);
});

test("stand puts the ball on a station with the words running on, and relevel lays the world anew", () => {
  const l = level(row(10, 18), [start(), { x: 17, y: 12, z: 17, kind: 0, on: [object(0, 31)] }]);
  const live = begin(l);
  steps(live, 25, PAD.up);
  const { frame: at, clock } = live.words;
  stand(live, { cell: [17, 12, 17], face: TOP, h: [1, 0, 0] });
  assert.deepEqual(blockUnder(live.ball), [17, 12, 17]);
  assert.deepEqual(live.ball.h, [1, 0, 0]);
  assert.equal(live.ball.state, REST);
  assert.equal(live.words.standing, 31);
  assert.deepEqual([live.words.frame, live.words.clock], [at, clock]);

  const shorter = level(row(13, 18), [start()]);
  const probe = probeOf(live);
  relevel(live, shorter, index(shorter));
  assert.equal(live.level, shorter);
  assert.equal(probe.solid([17, 12, 17]), false, "the block under the ball is gone");
  assert.equal(live.words.keys, 1, "and the key on it with it");
  assert.equal(live.words.standing, -1);
  assert.equal(live.words.frame, at);
  assert.deepEqual(
    [...live.world.walkers.values()].map((w) => w.at),
    [],
  );
  const walked = level(row(10, 18), [
    start(),
    { x: 17, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] },
  ]);
  relevel(live, walked, index(walked));
  assert.deepEqual(
    [...live.world.walkers.values()].map((w) => w.at),
    [at],
    "the walkers laid at the run's frame",
  );
});

test("a run recorded replays frame for frame from a fresh start", () => {
  const l = level(row(10, 18), [
    start(),
    { x: 17, y: 14, z: 17, kind: 0, on: [object(0, 53, 4)] },
    { x: 17, y: 12, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const scripted = {
    pad: ({ words: { frame: f } }) =>
      (f >= 30 && f <= 70) || (f >= 131 && f <= 200)
        ? PAD.up
        : f === 90
          ? PAD.left
          : f === 220
            ? PAD.up | PAD.cross
            : 0,
    done: () => false,
  };
  const wanderer = (live) => [...live.world.walkers.values()].find((w) => w.type === 53);
  const trace = (live, driver, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const pad = driver.pad(live);
      const events = frame(live, pad);
      out.push({
        pad,
        events,
        pos: [...live.ball.pos],
        h: [...live.ball.h],
        state: live.ball.state,
        wanderer: [...wanderer(live).pos],
        clock: live.words.clock,
      });
    }
    return out;
  };
  const rec = recorder(scripted);
  const first = trace(begin(l), rec, 260);
  assert.equal(rec.pads.length, 260);
  assert.ok(rec.pads.includes(PAD.left) && rec.pads.includes(PAD.up | PAD.cross));
  assert.ok(
    first.some((t) => t.events.some((e) => e.turned)),
    "the turn happened",
  );
  assert.ok(
    first.some((t) => t.state === JUMP),
    "and the jump",
  );
  assert.ok(new Set(first.map((t) => t.wanderer.join())).size > 3, "the wandering ball wandered");
  const second = trace(begin(l), replayDriver(rec.pads), 260);
  assert.deepEqual(second, first);
});

test("the word for what the ball stands on is read between its state and its move step: a climb's frame reads under the face being left and a wrap's the cell beyond the edge", () => {
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
  const marked = bonus.world.marked.size;
  assert.ok(marked >= 2);
  const shorter = level(row(14, 18), [start()], 99, false);
  relevel(bonus, shorter, index(shorter));
  assert.equal(bonus.world.counted.size, 5);
  assert.equal(bonus.world.marked.size, marked, "the marked blocks still stand");
  assert.equal(bonus.words.unmarked, 5 - marked);
});
