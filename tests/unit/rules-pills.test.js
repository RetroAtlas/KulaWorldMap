import { test } from "node:test";
import assert from "node:assert/strict";
import { cellKey } from "../../public/js/format/lattice.js";
import {
  HOP,
  JUMP,
  LEFT,
  PAD,
  REST,
  ROLLING,
  blockUnder,
  cellOf,
  progressOf,
} from "../../public/js/play/ball.js";
import { drives, frame, heeds, latched } from "../../public/js/play/rules.js";
import {
  BOUNCY,
  INVINCIBLE,
  ROLL,
  TOP,
  UP,
  begin,
  landed,
  level,
  motion,
  object,
  pill,
  row,
  start,
  steps,
  taken,
  until,
} from "./rules-level.js";

const BUTTON = 10;

const LEAP = motion.types["30"].jump;

/** A boost button on the top of the row's block at `y`. */
const button = (y) => ({ x: 17, y, z: 17, kind: 0, on: [object(0, BUTTON)] });

const BOUND = motion.types[BOUNCY].lasts;

test("the pad is dead while a self-roll's count runs, the roll asked and a turn dropped, and read again on the frame the count reaches nothing", () => {
  const live = begin(level(row(10, 18), [start()]));
  live.words.wait = 0;
  live.words.rolled = 3;
  assert.equal(drives(live), true);
  const heeded = [];
  for (let f = 1; f <= 2; f++) {
    heeded.push(heeds(live));
    frame(live, PAD.left);
    assert.deepEqual([live.ball.state, live.ball.turn, live.ball.forward], [ROLLING, 0, true]);
    assert.equal(live.words.rolled, 3 - f);
  }
  assert.deepEqual(heeded, [false, false]);
  assert.equal(live.ball.speed, 2 * ROLL.gain);
  assert.equal(heeds(live), true, "the frame the count runs out on reads the pad");
  frame(live, PAD.left);
  assert.equal(live.words.rolled, 0);
  assert.deepEqual(
    [live.ball.turn, live.ball.forward],
    [0, false],
    "Up not held, and Left held on the frame before no press",
  );
  assert.equal(drives(live), false);
  frame(live, 0);
  frame(live, PAD.left);
  assert.equal(live.ball.turn, LEFT, "pressed afresh, Left is");
});

test("on a boost button the pad is not read, and the game moves the ball of itself", () => {
  const live = begin(level(row(10, 18), [start(), button(16)]), {
    cell: [17, 16, 17],
    face: TOP,
    h: UP,
  });
  live.words.wait = 0;
  live.words.guard = 1;
  assert.equal(live.words.standing, BUTTON);
  assert.equal(heeds(live), false);
  assert.equal(drives(live), true);
  steps(live, 3, PAD.left | PAD.up);
  assert.deepEqual([live.ball.state, live.ball.turn, live.ball.forward], [REST, 0, false]);
  assert.deepEqual(blockUnder(live.ball), [17, 16, 17]);
});

test("rolled onto a boost button the ball is taken from the keys, rolled on by the game from the roll's progress with the count written on every ground frame, and launched as the long jump on the first frame its progress is the fire's progress or more, landing three blocks on at that progress and resting there with Up released", () => {
  const live = begin(level(row(5, 18), [start(), button(16)]));
  live.words.wait = 0;
  const { boost } = LEAP;
  let f = 0;
  while (!(blockUnder(live.ball)[1] === 16 && live.ball.progress > 0) && f < 100) {
    frame(live, PAD.up);
    f++;
  }
  assert.deepEqual(blockUnder(live.ball), [17, 16, 17]);
  assert.equal(live.words.standing, BUTTON, "the read of the frame that crossed onto it");
  assert.equal(heeds(live), false, "and the pad is dead from the frame after");
  const frames = [];
  let launched = null;
  for (let g = 1; g <= 40 && launched === null; g++) {
    const before = live.ball.progress;
    const heard = heeds(live);
    const events = frame(live, 0);
    frames.push({ before, heard, rolled: live.words.rolled, state: live.ball.state });
    if (events.some((e) => e.boosted)) launched = { before, events, frame: live.words.frame };
  }
  assert.ok(launched, "launched");
  assert.ok(
    frames.every((x) => !x.heard),
    "the pad dead on every frame on the button",
  );
  assert.ok(
    frames.slice(0, -1).every((x) => x.state === ROLLING),
    "rolled on with Up released",
  );
  assert.ok(
    frames.every((x) => x.before >= boost.roll || x.rolled === 0),
    "no count short of the roll's progress",
  );
  assert.ok(
    frames.slice(0, -1).every((x) => x.before < boost.roll || x.rolled === boost.frames),
    "the count written on every ground frame from it",
  );
  assert.ok(
    frames.slice(0, -1).every((x) => x.before < boost.fire),
    "no launch short of the fire's progress",
  );
  assert.ok(launched.before >= boost.fire && launched.before < boost.fire + ROLL.top);
  assert.deepEqual(
    launched.events.filter((e) => e.boosted),
    [{ boosted: { key: cellKey(17, 16, 17), face: TOP } }],
  );
  assert.deepEqual(
    [live.ball.state, live.ball.long, live.words.rolled],
    [JUMP, LEAP.arm + 1, 0],
    "the launch's frame runs the first row and counts it",
  );
  const landing = [];
  for (let g = 1; g <= 40 && !landing.length; g++)
    landing.push(...frame(live, 0).filter((e) => e.at === "landed"));
  assert.equal(live.words.frame, launched.frame + 30, "29 rows more and the landing's frame");
  assert.deepEqual(blockUnder(live.ball), [17, 13, 17], "three blocks on");
  assert.equal(live.ball.progress, launched.before, "at the progress the launch found");
  assert.equal(live.ball.long, 0);
  steps(live, 5, 0);
  assert.deepEqual([live.ball.state, blockUnder(live.ball)], [REST, [17, 13, 17]]);
  assert.equal(live.ball.progress, launched.before, "at rest where it landed");
});

test("a landing on a boost button short of the fire's progress launches the ball on the frame after, by the landing's flag, whatever the keys", () => {
  const live = begin(level(row(5, 18), [start(), button(15)]));
  live.words.wait = 0;
  steps(live, 11, PAD.up);
  assert.deepEqual(blockUnder(live.ball), [17, 17, 17]);
  const from = live.ball.progress;
  assert.ok(from < ROLL.middle, String(from));
  frame(live, PAD.up | PAD.cross);
  assert.equal(live.ball.state, JUMP);
  let landed = false;
  for (let g = 1; g <= 40 && !landed; g++) landed = frame(live, 0).some((e) => e.at === "landed");
  assert.ok(landed);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 17]);
  assert.equal(live.ball.progress, from);
  assert.ok(from < LEAP.boost.fire);
  assert.deepEqual([live.ball.state, live.ball.landed, live.words.standing], [REST, true, BUTTON]);
  const events = frame(live, PAD.left | PAD.cross);
  assert.deepEqual(
    events.filter((e) => e.boosted),
    [{ boosted: { key: cellKey(17, 15, 17), face: TOP } }],
  );
  assert.deepEqual([live.ball.state, live.ball.turn, live.ball.long], [JUMP, 0, LEAP.arm + 1]);
  assert.equal(live.words.rolled, 0);
});

test("two boost buttons three blocks apart send the ball from one to the next: the first launch comes down on the second button and the frame after launches again", () => {
  const live = begin(level(row(5, 18), [start(), button(15), button(12)]));
  live.words.wait = 0;
  const launches = [];
  const landings = [];
  for (let g = 1; g <= 200 && landings.length < 2; g++) {
    const pad = launches.length ? 0 : PAD.up;
    for (const e of frame(live, pad)) {
      if (e.boosted) launches.push({ frame: live.words.frame, key: e.boosted.key });
      if (e.at === "landed")
        landings.push({ frame: live.words.frame, block: blockUnder(live.ball) });
    }
  }
  assert.deepEqual(
    launches.map((x) => x.key),
    [cellKey(17, 15, 17), cellKey(17, 12, 17)],
  );
  assert.deepEqual(
    landings.map((x) => x.block),
    [
      [17, 12, 17],
      [17, 9, 17],
    ],
  );
  assert.equal(landings[0].frame, launches[0].frame + 30);
  assert.equal(launches[1].frame, landings[0].frame + 1, "the frame after the landing");
  assert.equal(landings[1].frame, launches[1].frame + 30);
  steps(live, 5, 0);
  assert.deepEqual([live.ball.state, blockUnder(live.ball)], [REST, [17, 9, 17]]);
});

test("a jump over a boost button onto a laser's block lands on a bare block, which the loader lays at a beam's end, and is not launched", () => {
  const laser = {
    x: 17,
    y: 14,
    z: 17,
    kind: 8,
    type: 1,
    f: [1, 1, 17, 14, 17, 21, 14, 17, -1, -1, -1],
  };
  const live = begin(level(row(10, 18), [start(), button(15), laser]), {
    cell: [17, 16, 17],
    face: TOP,
    h: UP,
  });
  live.words.wait = 0;
  const seen = [];
  for (let g = 1; g <= 41; g++) {
    const events = frame(live, g === 1 ? PAD.up | PAD.cross : 0);
    seen.push({
      cell: cellOf(live.ball),
      under: blockUnder(live.ball),
      standing: live.words.standing,
      events,
    });
  }
  const over = (y) => seen.filter((s) => s.cell[1] === y && s.cell[2] === 16);
  assert.ok(
    over(15).length && over(15).every((s) => s.standing === BUTTON),
    "the button's type while the centre's cell lies above the button",
  );
  assert.ok(
    over(14).length && over(14).every((s) => s.standing === -1),
    "a bare block's word from the first row the centre's cell lies above the laser's block",
  );
  const landed = seen.findIndex((s) => s.events.some((e) => e.at === "landed"));
  assert.equal(landed + 1, 31);
  assert.deepEqual(seen[landed].under, [17, 14, 17]);
  const after = seen.slice(landed + 1);
  assert.equal(after.length, 10);
  assert.ok(
    after.every((s) => !s.events.some((e) => e.boosted)),
    "no launch on the frames after",
  );
  assert.deepEqual(
    [live.ball.state, blockUnder(live.ball), live.words.standing],
    [REST, [17, 14, 17], -1],
  );
});

test("the bouncy pill taken rolling holds the jump off: the word grows by one on each rolling frame, the ball rolls on to the middle and rests with the requests gone, and the frame after starts a hop in place with Up released", () => {
  const live = begin(level(row(2, 18), [start(), pill(16)]));
  live.words.wait = 0;
  const b = live.ball;
  const w = live.words;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(BOUNCY))));
  assert.equal(b.state, ROLLING);
  assert.equal(w.pills[BOUNCY], BOUND.word);
  let rolled = 0;
  while (b.state === ROLLING) {
    const events = frame(live, 0);
    rolled += 1;
    assert.notEqual(b.state, JUMP, "no jump starts while the ball rolls");
    assert.ok(!landed(events));
  }
  assert.ok(rolled > 1, "the roll runs on past the pill");
  assert.equal(w.pills[BOUNCY], BOUND.word + rolled, "the word grows by one on each rolling frame");
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.equal(progressOf(b), ROLL.middle, "rests at the middle");
  assert.deepEqual([b.forward, b.wantJump], [false, false], "the requests gone");
  frame(live, 0);
  assert.equal(b.state, HOP, "the frame after starts a hop in place");
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
});

test("Up held from the bouncy pill on bounds the ball forward two blocks at a time, each landing followed on the frame after by the next forward jump, with no roll between", () => {
  const live = begin(level(row(2, 18), [start(), pill(16)]));
  live.words.wait = 0;
  const b = live.ball;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(BOUNCY))));
  assert.ok(until(live, PAD.up, () => b.state === REST));
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  const seen = [];
  while (seen.filter((s) => s.landed).length < 3) {
    const events = frame(live, PAD.up);
    seen.push({ state: b.state, block: blockUnder(b), landed: landed(events) });
  }
  seen.push({ state: (frame(live, PAD.up), b.state) });
  assert.equal(seen[0].state, JUMP, "the frame after the rest starts the forward jump");
  assert.ok(
    seen.every((s) => s.state !== ROLLING),
    "no roll between",
  );
  const landings = seen.map((s, i) => [s, i]).filter(([s]) => s.landed);
  assert.deepEqual(
    landings.map(([s]) => s.block),
    [
      [17, 14, 17],
      [17, 12, 17],
      [17, 10, 17],
    ],
    "two blocks on each",
  );
  for (const [s, i] of landings) {
    assert.equal(s.state, REST, "at rest on the landing's frame");
    assert.equal(seen[i + 1].state, JUMP, "and in the next forward jump on the frame after");
  }
});

test("Up and Cross held under the bouncy pill arm the long jump, which lands three blocks on, armed again after each landing clears it", () => {
  const live = begin(level(row(2, 18), [start(), pill(16)]));
  live.words.wait = 0;
  const b = live.ball;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(BOUNCY))));
  assert.ok(until(live, PAD.up | PAD.cross, () => b.state === REST));
  assert.equal(b.long, LEAP.arm, "armed as the ball rolled on, both latches standing at the count");
  const seen = [];
  while (seen.filter((s) => s.landed).length < 3) {
    const events = frame(live, PAD.up | PAD.cross);
    seen.push({ state: b.state, long: b.long, block: blockUnder(b), landed: landed(events) });
  }
  seen.push({ state: (frame(live, PAD.up | PAD.cross), b.state), long: b.long });
  const landings = seen.map((s, i) => [s, i]).filter(([s]) => s.landed);
  assert.deepEqual(
    landings.map(([s]) => s.block),
    [
      [17, 13, 17],
      [17, 10, 17],
      [17, 7, 17],
    ],
    "three blocks on each",
  );
  for (const [s, i] of landings) {
    assert.equal(s.long, 0, "the landing clears the long jump's word");
    assert.equal(seen[i + 1].state, JUMP);
    assert.equal(
      seen[i + 1].long,
      LEAP.arm + 1,
      "armed again on the frame after, and counted by the jump's first row",
    );
  }
});

test("the latch: Up held gives the roll's request from the fourth frame on every frame, a tap gives it once on the fourth frame counting its own frame and the count starts over on the first frame after that with neither latch set, and both held arm the long jump once per landing", () => {
  const n = BOUND.latch;
  const ball = { long: 0, state: REST };
  const fresh = () => ({ up: 0, cross: 0, count: 0 });
  const held = fresh();
  const asked = Array.from({ length: n + 3 }, () => latched(held, PAD.up, BOUND, ball));
  assert.deepEqual(
    asked.map((a) => a.forward),
    asked.map((_, i) => i >= n - 1),
    "the roll from the fourth frame on",
  );
  assert.ok(
    asked.every((a) => a.jump),
    "the jump asked whatever the keys",
  );
  assert.ok(asked.every((a) => !a.arm));
  assert.deepEqual(held, { up: 0, cross: 0, count: n + 3 }, "cleared each frame, the count kept");

  const tapped = fresh();
  const tap = [latched(tapped, PAD.up, BOUND, ball)];
  for (let i = 1; i < n; i++) {
    tap.push(latched(tapped, 0, BOUND, ball));
    assert.equal(tapped.count, i + 1, "the latch stands while the count is under the latch's");
  }
  assert.deepEqual(
    tap.map((a) => a.forward),
    tap.map((_, i) => i === n - 1),
    "the roll once, on the fourth frame counting the tap's own",
  );
  assert.equal(latched(tapped, 0, BOUND, ball).forward, false);
  assert.equal(tapped.count, 0, "the count starts over with neither latch set");

  const both = fresh();
  const long = { long: 0, state: REST };
  const armed = [];
  for (let i = 0; i < n + 2; i++) {
    const a = latched(both, PAD.up | PAD.cross, BOUND, long);
    if (a.arm) long.long = LEAP.arm;
    armed.push(a.arm);
  }
  assert.deepEqual(
    armed,
    armed.map((_, i) => i === n - 1),
    "armed once, the word standing after",
  );
  long.long = 0;
  long.state = JUMP;
  assert.equal(latched(both, PAD.up | PAD.cross, BOUND, long).arm, false, "not in the jump");
  long.state = REST;
  assert.equal(latched(both, PAD.up | PAD.cross, BOUND, long).arm, true, "armed again cleared");
  assert.equal(latched(both, PAD.up, BOUND, long).arm, false, "not with Up alone");
});

test("a landing on the bouncy pill with the latch's count at nothing hops first, Up held from the landing on, and with a count one under the latch's frames left by an earlier pill Up held jumps the ball forward at once", () => {
  const l = level(row(2, 18), [start(), pill(16)]);
  const live = begin(l);
  live.words.wait = 0;
  const b = live.ball;
  frame(live, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  // Up released through the jump, so the pill, taken on the way down, steps no latch
  assert.ok(until(live, 0, (_, events) => landed(events)));
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.ok(live.words.pills[BOUNCY] >= 0, "the pill taken");
  assert.equal(live.words.latch.count, 0);
  frame(live, PAD.up);
  assert.equal(b.state, HOP, "hops first");
  assert.equal(live.words.latch.count, 1, "Up held steps the count there");
  assert.ok(until(live, PAD.up, () => b.state === REST));
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  frame(live, PAD.up);
  assert.equal(b.state, JUMP, "the forward jump follows the hop's end");

  const again = begin(l);
  again.words.wait = 0;
  again.words.latch.count = BOUND.latch - 1;
  frame(again, PAD.up | PAD.cross);
  assert.ok(until(again, PAD.up, (_, events) => landed(events)));
  assert.deepEqual(blockUnder(again.ball), [17, 16, 17]);
  frame(again, PAD.up);
  assert.equal(again.ball.state, JUMP, "jumps forward at once");
});

test("an invincibility pill ends the bounding: the bouncy pill's word is put back on the frame after it is taken, and the pad reads plainly again, Up alone rolling the ball", () => {
  const live = begin(level(row(2, 18), [start(), pill(16), pill(14, Number(INVINCIBLE))]));
  live.words.wait = 0;
  const b = live.ball;
  const w = live.words;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(INVINCIBLE))));
  assert.equal(b.state, JUMP, "taken on the bound's way down");
  assert.ok(w.pills[BOUNCY] >= 0, "the word stands until the hazards run");
  frame(live, PAD.up);
  assert.equal(w.pills[BOUNCY], -1, "put back on the frame after");
  assert.ok(until(live, PAD.up, (_, events) => landed(events)));
  assert.deepEqual(blockUnder(b), [17, 14, 17]);
  frame(live, PAD.up);
  assert.equal(b.state, ROLLING, "Up alone rolls");
});
