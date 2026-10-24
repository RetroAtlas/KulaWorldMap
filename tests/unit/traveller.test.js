import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "../../public/js/viewer/state.js";
import { index } from "../../public/js/viewer/data.js";
import { faceAxes } from "../../public/js/viewer/motion.js";
import { probeOf } from "../../public/js/viewer/walk.js";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
import { PAD, ROLLING } from "../../public/js/play/ball.js";
import {
  bodyOf,
  firstStandable,
  flashed,
  glowed,
  markersFor,
  startOf,
  tintOf,
} from "../../public/js/play/traveller.js";
import { INVINCIBLE, begin, level, row, start, steps, until } from "./rules-level.js";

const plus = (v) => v.map((x) => x + 0);
const round = (v) => v.map((x) => Math.round(x * 1e6) / 1e6 + 0);

/** The words of a run opened on a level with a start, as the tint reads them. */
const words = () => begin(level(row(10, 18), [start()])).words;

const PLAIN = [4096, 4096, 4096];

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
  const drawn = (live, n) => {
    for (let i = 0; i < n; i++) glowed(live, live.run.words);
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
