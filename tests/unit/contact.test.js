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
  LAST_KEY,
} from "../../public/js/viewer/data.js";
import { PAD, REST, blockUnder } from "../../public/js/play/ball.js";
import { startRun, frame } from "../../public/js/play/rules.js";
import { viewOf } from "../../public/js/play/world.js";

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
const KEY = 31;
const LETHARGY = 32;
const HOURGLASS = 35;
const COIN = 37;
const SUNGLASSES = 38;
const STAR = 42;
const take = (type) => motion.types[String(type)].take;
const lasts = (type) => motion.types[String(type)].lasts;

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

const object = (face, type, f3 = 0, facing = 0) => ({
  face,
  type,
  f: [facing, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1],
  v: 0,
});
// A key far from anything the ball reaches, so a level plays as an arcade one.
const FAR = [25, 25, 25];
const FAR_KEY = { x: 25, y: 25, z: 25, kind: 0, on: [object(0, KEY)] };
/** A level of plain blocks, some carrying a record, with `time` seconds and a key far off unless
    `keyed` is false. */
function level(blocks, records = [], time = 99, keyed = true) {
  const all = keyed ? [...records, FAR_KEY] : records;
  const cells = [];
  const placed = new Map(all.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z] of keyed ? [...blocks, FAR] : blocks) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? 0 : mapData.firstRecord + i);
  }
  return { cells, records: all.map((r) => ({ on: [], ...r })), time };
}
/** A row of blocks along y at x 17, z 17. */
const row = (y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17]);
/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's does. */
const start = () => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(0, 30, 0, 3)] });
/** A thing of `type` on a face of the row's block at `y`. */
const on = (y, type, f3 = 0, face = TOP) => ({
  x: 17,
  y,
  z: 17,
  kind: 0,
  on: [object(face, type, f3)],
});
const begin = (l, at = null) => startRun(l, index(l), TABLES, circuits(), at);
/** Up to `n` frames with `pad` held, stopping once `until` says so: each frame's events with the
    frame count, the progress and the block under the ball it left. */
function trace(live, n, pad, until = () => false) {
  const out = [];
  for (let i = 0; i < n && !until(live); i++) {
    const events = frame(live, pad);
    out.push({
      frame: live.words.frame,
      events,
      progress: live.ball.progress,
      block: blockUnder(live.ball),
    });
  }
  return out;
}
const taken = (live) => live.world.taken.size;
const slot = (y, face = TOP) => `${cellKey(17, y, 17)}/${face}`;

test("a coin on the ball's own face is taken as its centre comes within reach, between 70 and 85 of progress coming in, and never from the block before", () => {
  const live = begin(level(row(10, 18), [start(), on(16, COIN)]));
  const frames = trace(live, 120, PAD.up);
  const takes = frames.filter((f) => f.events.some((e) => e.took));
  assert.equal(takes.length, 1);
  const [at] = takes;
  assert.deepEqual(at.block, [17, 16, 17], "on the coin's own block");
  assert.ok(at.progress >= 70 && at.progress <= 85, String(at.progress));
  assert.ok(
    frames.some((f) => f.frame < at.frame && f.block[1] === 17 && f.progress > 400),
    "the ball came near on the block before and took nothing",
  );
  const { took } = at.events.find((e) => e.took);
  const coin = take(COIN);
  assert.deepEqual(
    { ...took, at: null },
    {
      key: cellKey(17, 16, 17),
      face: TOP,
      type: COIN,
      variant: "0",
      points: coin.points[0],
      at: null,
    },
  );
  assert.deepEqual(took.at.slice(0, 2), [17 * UNIT, 16 * UNIT]);
  assert.ok(
    Math.abs(took.at[2] - (17 * UNIT - coin.stand)) <= motion.types[String(COIN)].bob.reach,
    "where it stands, bobbing",
  );
  assert.equal(live.words.score, coin.points[0]);
  assert.ok(live.world.taken.has(slot(16)));
  assert.deepEqual(
    viewOf(live).markers.get(cellKey(17, 16, 17)),
    [],
    "gone from the frame's index",
  );
  trace(live, 40, 0, (l) => l.ball.state === REST);
  frame(live, PAD.down);
  const back = trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] >= 18);
  assert.ok(
    back.length < 200 && !back.some((f) => f.events.some((e) => e.took)),
    "rolled back over, it is not taken again",
  );
  assert.equal(live.words.score, coin.points[0]);
});

test("a fruit sets its own bit in the pickups' word as it is taken, beside the bits already set, and a coin sets none", () => {
  const taken = (type, fruit) => {
    const live = begin(level(row(10, 18), [start(), on(16, type)]));
    live.words.fruit = fruit;
    trace(live, 120, PAD.up, (l) => l.world.taken.size > 0);
    assert.equal(live.world.taken.size, 1, `type ${type} taken`);
    return live.words.fruit;
  };
  for (const [i, type] of [43, 44, 45, 46, 47].entries()) {
    assert.equal(take(type).fruit, 1 << i);
    assert.equal(taken(type, 0), take(type).fruit);
    assert.equal(taken(type, 1 << ((i + 1) % 5)), (1 << ((i + 1) % 5)) | take(type).fruit);
  }
  assert.equal(take(COIN).fruit, undefined);
  assert.equal(taken(COIN, 0), 0);
});

test("a thing out of reach is left, and one the ball rests over is taken on the first frame", () => {
  const aside = begin(level(row(10, 18), [start(), on(18, COIN, 0, 1), on(17, COIN)]));
  trace(aside, 30, 0);
  assert.equal(taken(aside), 0, "neither the coin on the side nor the one on the block ahead");
  const over = begin(level(row(10, 18), [start(), on(16, COIN)]), {
    cell: [17, 16, 17],
    face: TOP,
    h: UP,
  });
  const frames = trace(over, 5, 0, taken);
  assert.equal(frames.length, 1);
  assert.equal(over.words.score, take(COIN).points[0]);
});

test("a key takes one off the keys left, and the last flips the exits' circuit exactly once", () => {
  const live = begin(level(row(10, 18), [start(), on(16, KEY), on(13, KEY)], 99, false));
  assert.equal(live.words.keys, 2);
  const frames = trace(live, 200, PAD.up);
  const keys = frames.flatMap((f) =>
    f.events.filter((e) => e.keys).map((e) => [f.frame, e.keys.left]),
  );
  assert.deepEqual(
    keys.map(([, left]) => left),
    [1, 0],
  );
  const opened = frames.flatMap((f) => f.events.filter((e) => e.opened).map(() => f.frame));
  assert.deepEqual(opened, [keys[1][0]], "the exits open with the last key alone");
  assert.deepEqual(
    live.circuits.presses.get(LAST_KEY),
    [keys[1][0] - 1],
    "flipped once, stamped with the frame",
  );
  assert.equal(live.words.keys, 0);
  assert.equal(live.words.score, 2 * take(KEY).points);
});

test("the hourglass turns the clock round to 5999 less what it reads, and scores 10 for each whole second of the new clock", () => {
  const live = begin(level(row(10, 18), [start(), on(16, HOURGLASS)]));
  const frames = trace(live, 120, PAD.up, taken);
  const at = frames.at(-1);
  const { clock, points } = take(HOURGLASS);
  const turned = at.events.find((e) => e.clock).clock;
  assert.equal(
    turned.from,
    99 * play.clock.second - at.frame,
    "the clock as this frame's tick left it",
  );
  assert.equal(turned.to, clock.from - turned.from);
  assert.equal(live.words.clock, turned.to);
  const scored = points * Math.trunc(turned.to / clock.second);
  assert.equal(at.events.find((e) => e.took).took.points, scored);
  assert.equal(live.words.score, scored);
  assert.ok(at.events.findIndex((e) => e.took) < at.events.findIndex((e) => e.clock));

  const long = begin(level(row(10, 18), [start(), on(16, HOURGLASS)], 200));
  const more = trace(long, 120, PAD.up, taken);
  const back = more.at(-1).events.find((e) => e.clock).clock;
  assert.ok(back.to < 0, "a clock past the hourglass's turns negative");
  assert.equal(long.words.score, points * Math.trunc(back.to / clock.second));
  const out = frame(long, PAD.up);
  assert.deepEqual(
    out.filter((e) => e.ended).map((e) => e.ended.code),
    [play.clock.out],
    "and the next tick ends the level",
  );
});

test("a pill sets the word its type keeps, which the next frame runs down, and the sunglasses score as they set theirs", () => {
  const live = begin(level(row(10, 18), [start(), on(16, LETHARGY), on(13, SUNGLASSES)]));
  const first = trace(live, 200, PAD.up, taken).at(-1);
  assert.deepEqual(first.events.find((e) => e.pill).pill, {
    type: LETHARGY,
    frames: lasts(LETHARGY).word,
  });
  assert.equal(live.words.pills[String(LETHARGY)], lasts(LETHARGY).word);
  const clock = live.words.clock;
  frame(live, PAD.up);
  assert.equal(live.words.pills[String(LETHARGY)], lasts(LETHARGY).word - lasts(LETHARGY).step);
  assert.equal(live.words.clock, clock - play.clock.tick - lasts(LETHARGY).ticks);
  assert.equal(live.words.score, 0, "a pill scores nothing");
  const second = trace(live, 200, PAD.up, (l) => taken(l) > 1).at(-1);
  assert.deepEqual(second.events.find((e) => e.pill).pill, {
    type: SUNGLASSES,
    frames: lasts(SUNGLASSES).word,
  });
  assert.equal(live.words.pills[String(SUNGLASSES)], lasts(SUNGLASSES).word);
  assert.equal(live.words.score, take(SUNGLASSES).points);
});

test("the catalogue star is taken in its green form, where it circles, and in its brown form catches the ball as a captivator does and is kept", () => {
  const l = level(row(10, 18), [start(), on(16, STAR)]);
  const { form, orbit, take: t, harm } = motion.types[String(STAR)];
  assert.equal(harm.form, 0);
  const green = begin(l, { cell: [17, 16, 17], face: TOP, h: UP });
  green.world.pickups.get(slot(16)).phase = [form.past, 0, 0];
  const frames = trace(green, 5, 0, taken);
  assert.equal(frames.length, 1, "taken on the first frame of the green form");
  const { took } = frames.at(-1).events.find((e) => e.took);
  assert.equal(took.points, t.points);
  assert.equal(green.words.score, t.points);
  const off = Math.hypot(took.at[0] - 17 * UNIT, took.at[1] - 16 * UNIT);
  assert.ok(
    Math.abs(off - orbit.radius) < 1e-6,
    "taken where it circles, its radius off the middle",
  );
  assert.equal(took.at[2], 17 * UNIT - t.stand);

  const brown = begin(l, { cell: [17, 16, 17], face: TOP, h: UP });
  brown.world.pickups.get(slot(16)).phase = [0, 0, 0];
  brown.words.wait = 0;
  const [caught] = trace(brown, 1, 0);
  assert.deepEqual(
    caught.events.filter((e) => e.dying),
    [{ dying: { cause: "captivator", wait: play.wait.captivator } }],
  );
  assert.equal(taken(brown), 0, "the star is kept");
  assert.deepEqual(
    [brown.words.ending, brown.words.wait, brown.words.frozen, brown.words.dying],
    [play.ending.captivator, play.wait.captivator, 1, 1],
  );
  assert.equal(brown.words.score, 0);
  const guarded = begin(l, { cell: [17, 16, 17], face: TOP, h: UP });
  guarded.world.pickups.get(slot(16)).phase = [0, 0, 0];
  guarded.words.wait = 0;
  guarded.words.pills["34"] = 10;
  const safe = trace(guarded, 3, 0);
  assert.ok(
    !safe.some((f) => f.events.some((e) => e.dying)),
    "refused while the invincibility pill stands",
  );
  assert.equal(taken(guarded), 0);
});
