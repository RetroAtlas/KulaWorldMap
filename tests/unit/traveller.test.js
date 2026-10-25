import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../public/js/viewer/state.js";
import { index } from "../../public/js/viewer/data.js";
import { faceAxes } from "../../public/js/viewer/motion.js";
import { probeOf } from "../../public/js/viewer/walk.js";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
import { LEFT, PAD, REST, ROLLING } from "../../public/js/play/ball.js";
import { frame } from "../../public/js/play/rules.js";
import { glowOf, glowStep } from "../../public/js/play/passes.js";
import {
  bodyOf,
  firstStandable,
  flashed,
  glowed,
  markersFor,
  startOf,
  tintOf,
} from "../../public/js/play/traveller.js";
import {
  INVINCIBLE,
  begin,
  level,
  motion,
  pill,
  row,
  start,
  steps,
  taken,
  until,
} from "./rules-level.js";

const plus = (v) => v.map((x) => x + 0);
const round = (v) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);

/** The words of a run opened on a level with a start, as the tint reads them. */
const words = () => begin(level(row(10, 18), [start()])).words;

const PLAIN = [4096, 4096, 4096];

const GLOW = motion.types[INVINCIBLE].lasts.glow;

// the glow counter the module keeps, tracked beside it since nothing puts it back
let counter = 0;

/** `n` frames drawn under `live`, the counter stepped where the module steps it. */
function drawn(live, n) {
  for (let i = 0; i < n; i++) {
    const w = live.run.words;
    glowed(live, w);
    if (!live.ended && w.pills[INVINCIBLE] >= 0) counter = glowStep(counter, GLOW);
  }
}

test("the tint raises a channel by the ball's heat, melt or cold and lowers the other two, and is nothing while no word stands and no pill glows", () => {
  const live = { flash: 0 };
  const w = words();
  assert.equal(tintOf(live, w), undefined);
  w.heat = 100;
  assert.deepEqual(tintOf(live, w), [5120, 3892, 3892]);
  w.heat = 400;
  assert.deepEqual(tintOf(live, w), [8192, 3277, 3277]);
  const melting = words();
  melting.melt = 100;
  assert.deepEqual(tintOf(live, melting), [3892, 5120, 3892]);
  const chilled = words();
  chilled.cold = 100;
  assert.deepEqual(tintOf(live, chilled), [3892, 3892, 5120]);
});

test("marked dying, the ball flashes between white and black by an angle that steps each frame the mark stands and starts over as it clears", () => {
  const live = { flash: 0 };
  const w = words();
  w.heat = 100;
  w.dying = 1;
  flashed(live, w);
  assert.equal(live.flash, 1024);
  assert.deepEqual(tintOf(live, w), [8192, 8192, 8192]);
  flashed(live, w);
  flashed(live, w);
  assert.equal(live.flash, 3072);
  assert.deepEqual(tintOf(live, w), [0, 0, 0]);
  flashed(live, w);
  assert.equal(live.flash, 0);
  flashed(live, w);
  w.dying = 0;
  flashed(live, w);
  assert.equal(live.flash, 0);
  assert.deepEqual(tintOf(live, w), [5120, 3892, 3892]);
});

test("the glow lifts the channels in turn by a counter that steps on each frame the ball is drawn under the pill, holds while the level has ended or the word is negative, and runs on across a leave and an enter", () => {
  const glowing = () => {
    const w = words();
    w.pills[INVINCIBLE] = 0;
    return { ended: null, flash: 0, run: { words: w } };
  };
  const first = glowing();
  assert.deepEqual(tintOf(first, first.run.words), PLAIN);
  drawn(first, 10);
  assert.deepEqual(tintOf(first, first.run.words), [16375, 4096, 4096]);
  first.ended = {};
  drawn(first, 5);
  first.ended = null;
  first.run.words.pills[INVINCIBLE] = -1;
  drawn(first, 5);
  first.run.words.pills[INVINCIBLE] = 0;
  assert.deepEqual(tintOf(first, first.run.words), [16375, 4096, 4096]);
  const second = glowing();
  drawn(second, 20);
  assert.deepEqual(tintOf(second, second.run.words), [0, 16309, 4096]);
  drawn(second, 20);
  assert.deepEqual(tintOf(second, second.run.words), [4096, 0, 16177]);
});

test("rolled onto the invincibility pill, the ball's light is the plain light raised by the glow at the counter, stepped on the pill's own frame and each frame after, a channel below nothing held at nothing and each taking its turn, through every frame the word stands and on none after, and a run begun after carries the counter on", () => {
  const { word, step } = motion.types[INVINCIBLE].lasts;
  /** A run rolled onto the pill: on each frame the word stands, the light and the glow at the
      counter, and the light on the three frames after. */
  const lit = () => {
    const run = begin(level(row(2, 18), [start(), pill(16, Number(INVINCIBLE))]));
    const live = { ended: null, flash: 0, run };
    const w = run.words;
    assert.ok(until(run, PAD.up, (_, events) => taken(events, Number(INVINCIBLE))));
    const seen = [];
    while (w.pills[INVINCIBLE] >= 0) {
      drawn(live, 1);
      seen.push({ tint: tintOf(live, w), lift: glowOf(counter, GLOW, motion.turn) });
      frame(run, 0);
    }
    const after = [];
    for (let i = 0; i < 3; i++) {
      drawn(live, 1);
      after.push(tintOf(live, w));
      frame(run, 0);
    }
    return { seen, after };
  };
  const raised = ({ seen, after }, what) => {
    seen.forEach(({ tint, lift }, k) =>
      assert.deepEqual(
        tint,
        PLAIN.map((v, ch) => Math.max(0, v + lift[ch])),
        `${what}frame ${k}`,
      ),
    );
    assert.deepEqual(after, [undefined, undefined, undefined], `${what}after the word`);
  };
  const first = lit();
  assert.equal(first.seen.length, word / step + 1);
  raised(first, "the first run, ");
  for (const ch of [0, 1, 2])
    assert.ok(
      first.seen.some((s) => s.lift[ch] > PLAIN[ch]),
      `channel ${ch} has its turn`,
    );
  const second = lit();
  assert.equal(second.seen.length, first.seen.length);
  assert.notDeepEqual(second.seen[0].tint, first.seen[0].tint, "carried on from the last run");
  raised(second, "the second run, ");
});

test("the body lies along the face's axes at rest, and mid-roll its rows read back from their components along those axes, the across axis unturned", () => {
  const live = begin(level(row(10, 18), [start()]));
  assert.deepEqual(bodyOf(live.ball).map(plus), [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  assert.ok(until(live, PAD.up, (l) => l.ball.state === ROLLING));
  steps(live, 3, PAD.up);
  const b = live.ball;
  assert.equal(b.state, ROLLING);
  const body = bodyOf(b);
  const f = faceAxes(b.n, b.h);
  const axis = (k) => f.map((r) => r[k]);
  for (let j = 0; j < 3; j++) {
    const back = [0, 1, 2].map((i) => body.reduce((sum, r, k) => sum + r[j] * axis(k)[i], 0));
    assert.deepEqual(round(back), round(b.body.slice(3 * j, 3 * j + 3)), `row ${j}`);
  }
  assert.deepEqual(round(body[0]), [1, 0, 0]);
  assert.notDeepEqual(round(body[1]), [0, 1, 0]);
});

test("a turn in place leaves the body handed to the frame standing through the turn's ramp, other than it was before the turn, and the body in the world as it was", () => {
  const live = begin(level(row(10, 18), [start()]));
  const b = live.ball;
  // a roll turns the body, so that the turn has a turn to keep
  assert.ok(until(live, PAD.up, (l) => l.ball.state === ROLLING));
  assert.ok(until(live, 0, (l) => l.ball.state === REST));
  const before = bodyOf(b).map(round);
  const world = [...b.body];
  assert.notDeepEqual(before, [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  assert.deepEqual(
    frame(live, PAD.left).filter((e) => e.turned),
    [{ turned: LEFT }],
  );
  assert.ok(b.ramp);
  const held = bodyOf(b).map(round);
  assert.notDeepEqual(held, before);
  let frames = 0;
  while (b.ramp) {
    frame(live, 0);
    frames++;
    assert.deepEqual(bodyOf(b).map(round), held, `frame ${frames}`);
  }
  assert.ok(frames > 1);
  assert.deepEqual(b.body, world);
});

test("the start the game takes is the level's last, as the ball stands on it, and null where the level has none or a block stands over it", () => {
  const l = level(row(10, 18), [start()]);
  const s = startOf(l, probeOf(index(l)));
  assert.deepEqual(
    { ...s, h: plus(s.h) },
    {
      cell: [17, 18, 17],
      face: 0,
      h: [0, -1, 0],
      marker: { x: 17, y: 18, z: 17, face: 0, type: 30, f: l.records[0].on[0].f },
    },
  );
  const bare = level(row(10, 18));
  assert.equal(startOf(bare, probeOf(index(bare))), null);
  const roofed = level([...row(10, 18), [17, 18, 16]], [start()]);
  assert.equal(startOf(roofed, probeOf(index(roofed))), null);
});

test("the first face the ball could stand on is the first cell's first free face, the top where nothing stands over it, else the next round", () => {
  const l = level(row(10, 18));
  state.idx = index(l);
  const first = firstStandable(probeOf(state.idx));
  assert.deepEqual({ ...first, h: plus(first.h) }, { cell: [17, 10, 17], face: 0, h: [0, 1, 0] });
  const roofed = level([
    [17, 10, 17],
    [17, 10, 16],
  ]);
  state.idx = index(roofed);
  const side = firstStandable(probeOf(state.idx));
  assert.deepEqual({ ...side, h: plus(side.h) }, { cell: [17, 10, 17], face: 1, h: [0, 1, 0] });
});

test("the ball's six markers take the start's type and fields, or the ball's own where the level has no start, keyed as the frame's traveller", () => {
  const l = level(row(10, 18), [start()]);
  const s = startOf(l, probeOf(index(l)));
  const six = (base) => FACE_NORMAL.map((_, face) => ({ ...base, id: "ball", face }));
  assert.deepEqual(
    markersFor(s),
    six({ type: 30, f: l.records[0].on[0].f, v: undefined, variant: null }),
  );
  assert.deepEqual(markersFor(null), six({ type: 30, f: [], v: undefined, variant: null }));
});
