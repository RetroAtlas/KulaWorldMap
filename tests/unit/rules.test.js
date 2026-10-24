import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { index } from "../../public/js/viewer/data.js";
import { dice } from "../../public/js/viewer/travel.js";
import {
  FALL,
  HOP,
  JUMP,
  LEFT,
  PAD,
  REST,
  ROLLING,
  blockUnder,
  faceUnder,
} from "../../public/js/play/ball.js";
import { end, frame, heeds, relevel, restart, revive, stand } from "../../public/js/play/rules.js";
import { FORM } from "../../public/js/play/game.js";
import { probeOf } from "../../public/js/play/world.js";
import { recorder, replayDriver } from "../../public/js/play/drive.js";
import {
  ROLL,
  SIMON,
  TOP,
  UP,
  begin,
  level,
  motion,
  object,
  play,
  row,
  settings,
  start,
  steps,
} from "./rules-level.js";

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

test("a run keeps the game's mode word by the level's pack or its mark as a room and the level's mode word by its keys, its settings record and that mode, and the clock stands in the Simon rooms", () => {
  const full = 99 * play.clock.second;
  const keyed = begin(level(row(10, 18), [start()]));
  assert.deepEqual(
    [keyed.words.mode, keyed.words.form, keyed.words.bonus],
    [0, FORM.arcade, false],
  );
  const none = begin(level(row(10, 18), [start()], 99, false));
  assert.deepEqual([none.words.mode, none.words.form, none.words.bonus], [0, FORM.bonus, true]);
  const hidden = begin(level(row(10, 18), [start(), settings(objects.skins.hidden.type)]));
  assert.equal(hidden.words.keys, 1);
  assert.deepEqual([hidden.words.form, hidden.words.bonus], [FORM.hidden, false]);
  const keyless = begin(
    level(row(10, 18), [start(), settings(objects.skins.hidden.type)], 99, false),
  );
  assert.deepEqual(
    [keyless.words.form, keyless.words.bonus],
    [FORM.hidden, true],
    "the flag stands over the key count, which the bonus flag keeps",
  );
  const unflagged = begin(level(row(10, 18), [start(), settings(0)], 99, false));
  assert.equal(unflagged.words.form, FORM.bonus, "a settings record without the flag");
  const room = begin({ ...level(row(10, 18), [start()], 99, false), pack: objects.skins.copycat });
  assert.deepEqual(
    [room.words.mode, room.words.form, room.words.bonus, room.words.keys],
    [SIMON, FORM.arcade, false, 0],
  );
  steps(room, 60, PAD.up);
  assert.equal(room.words.clock, full, "the clock stands in the Simon rooms");
  assert.equal(room.world.marked.size, 0, "and no block is marked");
  assert.equal(room.words.outcome, 0);
  const marked = begin({ ...level(row(10, 18), [start()], 99, false), simon: true });
  assert.deepEqual(
    [marked.words.mode, marked.words.form, marked.words.bonus, marked.words.keys],
    [SIMON, FORM.arcade, false, 0],
    "a level marked a room plays in the rooms' mode",
  );
  steps(marked, 60, PAD.up);
  assert.equal(marked.words.clock, full);
  assert.equal(marked.world.marked.size, 0);
  const inert = begin({ ...level(row(10, 18), [start()]), simon: true });
  assert.deepEqual(
    [inert.words.mode, inert.words.form, inert.words.bonus],
    [0, FORM.arcade, false],
    "which a key makes an arcade level all the same",
  );
  const arcade = begin(level(row(10, 18), [start()]));
  steps(arcade, 60, PAD.up);
  assert.equal(arcade.words.clock, full - 60 * play.clock.tick, "the arcade's clock falls");
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

test("Left held from a level's first frame turns on the 26th frame, the opening's wait plus the repeat count, the frames before having seen it held", () => {
  const live = begin(level(row(10, 18), [start()]));
  const turns = play.start.wait + ROLL.repeat;
  assert.equal(turns, 26);
  assert.deepEqual(
    steps(live, turns - 1, PAD.left).filter((e) => e.turned),
    [],
  );
  assert.equal(live.ball.turn, 0);
  assert.equal(live.ball.since, ROLL.repeat, "the count stepped on each frame that read");
  assert.deepEqual(
    frame(live, PAD.left).filter((e) => e.turned),
    [{ turned: LEFT }],
  );
  assert.equal(live.words.frame, turns);
});

test("a Left pressed on a frame the pad is not read for, and still held as reading resumes, turns only once the repeat count has passed", () => {
  const live = begin(level(row(10, 18), [start()]));
  steps(live, play.start.wait);
  assert.deepEqual(
    frame(live, PAD.left).filter((e) => e.turned),
    [{ turned: LEFT }],
  );
  frame(live, 0);
  // a wait set as a teleporter sets one, from the turn's ramp to past its end
  live.words.wait = motion.types["30"].quarter.frames + 2;
  const unread = [];
  while (!heeds(live)) unread.push(...frame(live, PAD.left));
  assert.deepEqual(
    unread.filter((e) => e.turned),
    [],
  );
  assert.equal(live.ball.ramp, null);
  assert.deepEqual(
    steps(live, ROLL.repeat, PAD.left).filter((e) => e.turned),
    [],
    "held on the frame before, Left is no press",
  );
  assert.deepEqual(
    frame(live, PAD.left).filter((e) => e.turned),
    [{ turned: LEFT }],
    "until the count has passed the repeat",
  );
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
  held.words.pad = PAD.up;
  held.ball.since = 3;
  frame(held, PAD.cross);
  assert.equal(held.words.guard, 2, "Cross held reads nothing and leaves the guard counting");
  assert.equal(held.ball.state, REST);
  assert.deepEqual(
    [held.words.pad, held.ball.since],
    [PAD.cross, 3],
    "the frame's word kept, read or not, and the count untouched",
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
  const { value } = live.world.probe;
  live.world.probe = {
    ...live.world.probe,
    value(...cell) {
      log.push("ball");
      return value(...cell);
    },
  };
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
  // the captivators on blocks of their own, out of the ball's way and reach
  const l = level(
    [...row(10, 18), [20, 10, 17], [20, 14, 17]],
    [
      start(),
      { x: 20, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] },
      { x: 20, y: 14, z: 17, kind: 0, on: [object(0, 53, 4)] },
    ],
  );
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
