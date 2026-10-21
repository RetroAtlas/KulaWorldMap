import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { cellKey } from "../../public/js/format/lattice.js";
import { setObjects, setAnnotations, index } from "../../public/js/viewer/data.js";
import {
  JUMP,
  jumpAt,
  probeOf as planProbe,
  shortestWalk,
  step as planStep,
  tangent,
} from "../../public/js/viewer/walk.js";
import {
  FALL,
  PAD,
  REST,
  aloft,
  ballAt,
  blockUnder,
  faceUnder,
  place,
  step,
} from "../../public/js/play/ball.js";
import { probeOf, worldOf } from "../../public/js/play/world.js";
import {
  courseDriver,
  keyPad,
  recorder,
  replayDriver,
  pack,
  unpack,
} from "../../public/js/play/drive.js";

setObjects(objects);
setAnnotations(annotations);
state.data = mapData;
const at = (frame) => ({ words: { frame } });
const table = objects.motion.types[30];
const TABLES = {
  motion: objects.motion,
  jump: objects.jump,
  unit: objects.block,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
};
const RULES = { table, turn: objects.motion.turn, unit: objects.block, jump: objects.jump };
const TOP = 0;
const BLOCK = objects.block;
/** A run over a level of the cells given, bare blocks all, its ball still to be stood: the world
    the rules hold, at its first frame, and the planner's probe over the same blocks. */
function runOver(...cells) {
  const l = { cells: cells.flatMap(([x, y, z]) => [x, y, z, 0]), records: [], time: 99 };
  const circuits = { on: () => true, lit: () => true, flip: () => {} };
  return {
    ball: null,
    words: { frame: 0 },
    world: worldOf(l, index(l), TABLES, circuits, 0),
    planned: planProbe({
      records: new Map(),
      cells: new Map(cells.map((c) => [cellKey(...c), { x: c[0], y: c[1], z: c[2] }])),
    }),
  };
}
const top = (x, y, z) => ({ cell: [x, y, z], face: TOP });
const toward = (face, d) => [0, 1, 2, 3].find((k) => tangent(face, k).join() === d.join());
const same = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);
const stationOf = (b) => ({ cell: blockUnder(b), face: faceUnder(b) });
/** The frames a roll from `speed`, rest unless given, takes to carry the centre `units` on, by
    the table: the speed grows by the gain to the top each frame. */
function framesTo(units, speed = 0) {
  let gone = 0;
  let frames = 0;
  while (gone < units) {
    speed = Math.min(speed + table.rolling.gain, table.rolling.top);
    gone += speed;
    frames += 1;
  }
  return frames;
}
const blockFrames = framesTo(BLOCK);
/** The frames from rest until the centre has crossed into the next cell, from which the driver
    reads the ball on the next station. */
const crossing = framesTo(BLOCK / 2);
const QUARTER = table.quarter.frames;
const A = top(17, 18, 17);
const B = top(17, 17, 17);
const C = top(18, 17, 17);
const D = top(17, 16, 17);
const E = top(17, 15, 17);
const Y = [0, 1, 0];
const MINUS_Y = [0, -1, 0];
const X = [1, 0, 0];
const SOUTH = toward(TOP, MINUS_Y);

/** Drive `run`'s ball by `driver` until it is done or `most` frames have run: the pad words
    given, the stations the ball rested at in order, each frame's events and the state it left
    the ball in, and why the driver is done. */
function driven(driver, run, most = 400) {
  const b = run.ball;
  const probe = probeOf(run);
  const pads = [];
  const rests = [];
  const frames = [];
  const states = [];
  const rested = () => {
    const last = rests.at(-1);
    if (b.state === REST && !(last && same(last, stationOf(b)))) rests.push(stationOf(b));
  };
  let why = false;
  rested();
  for (let f = 0; f < most && !why; f++) {
    b.pad = driver.pad(run);
    pads.push(b.pad);
    frames.push(step(b, probe));
    states.push(b.state);
    rested();
    why = driver.done();
  }
  return { pads, rests, frames, states, why };
}
/** The frame whose events hold a landing, the ball's first since frame `after`. */
const landing = (frames, after = -1) =>
  frames.findIndex((out, f) => f > after && out.some((e) => e.at === "landed"));
/** Whether a ball left in state `s` is in the air. */
const flying = (s) => aloft({ state: s });
/** The pad words as runs, each a word and the frames it held for. */
const runs = (pads) =>
  pads.reduce((out, w) => {
    const last = out.at(-1);
    if (last && last[0] === w) last[1] += 1;
    else out.push([w, 1]);
    return out;
  }, []);
const refused = (frames) => frames.flat().some((e) => e.refused);
/** A key pressed and let go before a frame reads it. */
const tap = (keys, bit) => {
  keys.down(bit);
  keys.up(bit);
};
/** The words the next `n` frames that read the pad take from `keys`. */
const padsOf = (keys, n) => Array.from({ length: n }, () => keys.pad(true));

test("a course driver turns about, holds the roll to the next station, turns the shorter way and rolls on, and is done at the end", () => {
  const run = runOver(A.cell, B.cell, C.cell);
  const course = shortestWalk(run.planned, A, C, [SOUTH]);
  assert.deepEqual(course.stations, [A, B, C]);
  run.ball = ballAt(RULES, A.cell, TOP, Y);
  const driver = courseDriver(course);
  assert.equal(driver.done(), false);
  const { pads, rests, why } = driven(driver, run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [A, B, C]);
  assert.deepEqual(stationOf(run.ball), C);
  assert.deepEqual(run.ball.h, X);
  assert.equal(run.ball.state, REST);
  // Left, and Left again on the frame the quarter's ramp has run out and the ball has settled; Up
  // is held until the ball is read on B, whose step turns, and let go there so the ball rests at
  // B's middle; the one quarter that faces +x; Up held until the ball is read on C, the end
  const up = 2 * QUARTER;
  const right = up + blockFrames;
  const on = right + QUARTER;
  assert.deepEqual(runs(pads), [
    [PAD.left, 1],
    [0, QUARTER - 1],
    [PAD.left, 1],
    [0, QUARTER - 1],
    [PAD.up, crossing],
    [0, blockFrames - crossing],
    [PAD.right, 1],
    [0, QUARTER - 1],
    [PAD.up, crossing],
    [0, blockFrames - crossing + 1],
  ]);
  assert.equal(pads.length, on + blockFrames + 1);
  assert.equal(driver.pad(run), 0);
  assert.equal(driver.done(), "end");
});

test("a course driver holds Up through the stations a straight run of the course passes, the ball resting at its end alone, a block in the table's frames rolling on", () => {
  const run = runOver(A.cell, B.cell, D.cell, E.cell);
  const course = shortestWalk(run.planned, A, E, [SOUTH]);
  assert.deepEqual(course.stations, [A, B, D, E]);
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  const { pads, rests, frames, why } = driven(courseDriver(course), run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [A, E]);
  assert.deepEqual(stationOf(run.ball), E);
  // held until the ball is read on E, two blocks and a half on, and let go for the roll to its middle
  const read = framesTo((5 * BLOCK) / 2);
  const arrived = framesTo(3 * BLOCK);
  assert.deepEqual(runs(pads), [
    [PAD.up, read],
    [0, arrived - read + 1],
  ]);
  assert.ok(!refused(frames));
  // rolling on through a middle, a block takes the frames its length makes of the top speed, one more or one less by turns
  const two = framesTo(2 * BLOCK);
  assert.deepEqual([two - blockFrames, arrived - two].sort(), [
    Math.floor(BLOCK / table.rolling.top),
    Math.ceil(BLOCK / table.rolling.top),
  ]);
});

test("a course driver holds Up up an inner corner and round an edge, lets go as the ball is read on the last station and is done once the wrap's ramp has run out", () => {
  const wall = [17, 16, 16];
  const run = runOver(A.cell, B.cell, D.cell, wall);
  const course = shortestWalk(run.planned, A, top(...wall), [SOUTH]);
  assert.deepEqual(
    course.steps.map((s) => s.o),
    [0, 1, 2],
  );
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  const { pads, rests, frames, why } = driven(courseDriver(course), run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [A, top(...wall)]);
  assert.deepEqual(stationOf(run.ball), top(...wall));
  assert.deepEqual(run.ball.h, MINUS_Y);
  const climbed = frames.findIndex((out) => out.some((e) => e.face === "climb"));
  const wrapped = frames.findIndex((out) => out.some((e) => e.face === "wrap"));
  assert.ok(climbed > 0 && wrapped > climbed, `${climbed} ${wrapped}`);
  // the wrap's frame reads the ball on the wall's top, where Up is let go
  assert.deepEqual(runs(pads), [
    [PAD.up, wrapped + 1],
    [0, pads.length - wrapped - 1],
  ]);
  assert.ok(pads.length - 1 >= wrapped + table.wrap.frames, `${pads.length}`);
  assert.equal(run.ball.ramp, null);
});

test("a course driver stops at a leap and says so, Up let go as the ball is read on the station before it, and gives nothing after", () => {
  const far = top(19, 17, 17);
  const run = runOver(A.cell, B.cell, far.cell);
  const course = {
    stations: [A, B, far],
    steps: [{ k: SOUTH, o: 0 }, null],
    marks: new Set([0, 2]),
  };
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  const driver = courseDriver(course);
  const { pads, rests, why } = driven(driver, run);
  assert.equal(why, "leap");
  assert.deepEqual(rests, [A, B]);
  assert.deepEqual(stationOf(run.ball), B);
  assert.deepEqual(runs(pads), [
    [PAD.up, crossing],
    [0, blockFrames - crossing + 1],
  ]);
  assert.equal(driver.pad(run), 0);
  assert.equal(driver.done(), "leap");
});

test("a roll the lattice no longer allows is a leap, as the planner draws it: refused where a block has come beside the edge, changed where one has come up ahead, and let go of before the middle where it is read from the station before", () => {
  // planned round A's -y edge over A alone; a block has since come beside A
  const round = {
    stations: [A, { cell: A.cell, face: 3 }],
    steps: [{ k: SOUTH, o: 2 }],
    marks: new Set([0, 1]),
  };
  let run = runOver(A.cell, [16, 18, 17]);
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  let driver = courseDriver(round);
  let out = driven(driver, run);
  assert.equal(out.why, "leap");
  assert.deepEqual(out.pads, [0]);
  assert.deepEqual(out.rests, [A]);
  assert.ok(!refused(out.frames));
  assert.equal(driver.pad(run), 0);
  // planned straight on to B; a block has since come up on B
  const straight = { stations: [A, B], steps: [{ k: SOUTH, o: 0 }], marks: new Set([0, 1]) };
  run = runOver(A.cell, B.cell, [17, 17, 16]);
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  out = driven(courseDriver(straight), run);
  assert.equal(out.why, "leap");
  assert.deepEqual(out.pads, [0]);
  assert.deepEqual(stationOf(run.ball), A);
  // planned on to D over B; D is gone and a block stands beside B, so the roll on from B is
  // refused: Up is let go as the ball is read on B and it rests at B's middle, nothing refused
  const course = {
    stations: [A, B, D],
    steps: [
      { k: SOUTH, o: 0 },
      { k: SOUTH, o: 0 },
    ],
    marks: new Set([0, 2]),
  };
  run = runOver(A.cell, B.cell, [16, 17, 17]);
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  driver = courseDriver(course);
  out = driven(driver, run);
  assert.equal(out.why, "leap");
  assert.deepEqual(out.rests, [A, B]);
  assert.deepEqual(runs(out.pads), [
    [PAD.up, crossing],
    [0, blockFrames - crossing + 1],
  ]);
  assert.ok(!refused(out.frames));
});

test("a course driver is strayed where the ball stands on no station of the course's", () => {
  const course = {
    stations: [A, B, C],
    steps: [
      { k: SOUTH, o: 0 },
      { k: toward(TOP, X), o: 0 },
    ],
    marks: new Set([0, 2]),
  };
  // displaced onto a block the course never visits
  const beside = [16, 17, 17];
  const run = runOver(A.cell, B.cell, C.cell, beside);
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  const driver = courseDriver(course);
  run.ball.pad = driver.pad(run);
  assert.equal(run.ball.pad, PAD.up);
  place(run.ball, beside, TOP, MINUS_Y);
  assert.equal(driver.pad(run), 0);
  assert.equal(driver.done(), "strayed");
  assert.equal(driver.pad(run), 0);
});

test("a course driver may start from a later station, takes the one after as reached, and from one further on is strayed at once", () => {
  const run = runOver(A.cell, B.cell, C.cell);
  const course = shortestWalk(run.planned, A, C, [SOUTH]);
  run.ball = ballAt(RULES, B.cell, TOP, MINUS_Y);
  const { pads, rests, why } = driven(courseDriver(course, 1), run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [B, C]);
  assert.deepEqual(runs(pads), [
    [PAD.right, 1],
    [0, QUARTER - 1],
    [PAD.up, crossing],
    [0, blockFrames - crossing + 1],
  ]);
  const ahead = courseDriver(course);
  run.ball = ballAt(RULES, B.cell, TOP, MINUS_Y);
  assert.equal(ahead.pad(run), PAD.right);
  assert.equal(ahead.done(), false);
  const wrong = courseDriver(course);
  run.ball = ballAt(RULES, C.cell, TOP, MINUS_Y);
  assert.equal(wrong.pad(run), 0);
  assert.equal(wrong.done(), "strayed");
});

test("a course driver jumps the ball over a gap, or down onto a lower block: Up and Cross together for one frame from rest, nothing while the ball is in the air, and the landing read as the next station, which here is the end, the ball at rest at its middle", () => {
  for (const d of [0, 1, 3]) {
    const landed = top(D.cell[0], D.cell[1], D.cell[2] + d);
    const run = runOver(A.cell, landed.cell);
    const course = {
      stations: [A, landed],
      steps: [{ k: SOUTH, o: JUMP, d }],
      marks: new Set([0, 1]),
    };
    assert.equal(jumpAt(run.planned, A, SOUTH), d);
    run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
    const driver = courseDriver(course);
    const { pads, rests, frames, states, why } = driven(driver, run);
    assert.equal(why, "end", `${d} down`);
    assert.deepEqual(rests, [A, landed], `${d} down`);
    assert.deepEqual(stationOf(run.ball), landed);
    assert.deepEqual(run.ball.h, MINUS_Y);
    assert.equal(run.ball.state, REST);
    assert.equal(run.ball.progress, table.rolling.middle, `${d} down: at the middle`);
    const down = landing(frames);
    assert.ok(down > 1, `${down}`);
    assert.ok(states.slice(0, down).every(flying), `${d} down: in the air until the landing`);
    assert.equal(states.slice(0, down).includes(FALL), d > 0, `${d} down: a fall past the arc`);
    assert.deepEqual(runs(pads), [
      [PAD.up | PAD.cross, 1],
      [0, down + 1],
    ]);
    assert.equal(driver.pad(run), 0);
    assert.equal(driver.done(), "end");
  }
});

test("a course driver lets go of Up as the ball is read on the station it jumps from, so the ball rests at the middle before the jump, and rolls on from the landing as from any station", () => {
  const F = top(17, 14, 17);
  const run = runOver(A.cell, B.cell, E.cell, F.cell);
  const course = {
    stations: [A, B, E, F],
    steps: [
      { k: SOUTH, o: 0 },
      { k: SOUTH, o: JUMP, d: 0 },
      { k: SOUTH, o: 0 },
    ],
    marks: new Set([0, 3]),
  };
  run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
  const { pads, rests, frames, states, why } = driven(courseDriver(course), run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [A, B, E, F]);
  assert.deepEqual(stationOf(run.ball), F);
  assert.ok(!refused(frames));
  const off = pads.indexOf(PAD.up | PAD.cross);
  assert.equal(off, blockFrames, "the jump asked on the frame the ball has settled at B");
  const down = landing(frames, off);
  assert.ok(states.slice(off, down).every(flying));
  // Up until the ball is read on B, let go for the roll to B's middle, the jump, nothing in the
  // air, Up again from the landing until the ball is read on F, and let go for the roll to its
  // middle, the end; the landing leaves the ball the jump's speed for the roll asked next, so
  // that roll crosses sooner than one from rest
  const quick = framesTo(BLOCK / 2, table.jump.speed);
  assert.deepEqual(runs(pads), [
    [PAD.up, crossing],
    [0, blockFrames - crossing],
    [PAD.up | PAD.cross, 1],
    [0, down - off],
    [PAD.up, quick],
    [0, framesTo(BLOCK, table.jump.speed) - quick + 1],
  ]);
});

test("a course driver turns before a jump as before a roll, and jumps on the frame the quarter has run out and the ball has settled", () => {
  const run = runOver(A.cell, D.cell);
  const course = { stations: [A, D], steps: [{ k: SOUTH, o: JUMP, d: 0 }], marks: new Set([0, 1]) };
  run.ball = ballAt(RULES, A.cell, TOP, X);
  const { pads, rests, frames, why } = driven(courseDriver(course), run);
  assert.equal(why, "end");
  assert.deepEqual(rests, [A, D]);
  assert.deepEqual(run.ball.h, MINUS_Y);
  const down = landing(frames);
  assert.deepEqual(runs(pads), [
    [PAD.left, 1],
    [0, QUARTER - 1],
    [PAD.up | PAD.cross, 1],
    [0, down - QUARTER + 1],
  ]);
});

test("a jump the lattice no longer allows is a leap, as the planner draws it: the landing gone, with a block below it or none, or a block come into the arc, the ball still at rest on its station and asked nothing", () => {
  const course = { stations: [A, D], steps: [{ k: SOUTH, o: JUMP, d: 0 }], marks: new Set([0, 1]) };
  for (const [label, cells] of [
    ["the landing a block lower", [A.cell, [17, 16, 18]]],
    ["nothing to come down on", [A.cell]],
    ["a block come into the arc", [A.cell, D.cell, [17, 17, 16]]],
  ]) {
    const run = runOver(...cells);
    assert.notEqual(jumpAt(run.planned, A, SOUTH), 0, label);
    run.ball = ballAt(RULES, A.cell, TOP, MINUS_Y);
    const driver = courseDriver(course);
    const out = driven(driver, run);
    assert.equal(out.why, "leap", label);
    assert.deepEqual(out.pads, [0], label);
    assert.deepEqual(out.rests, [A], label);
    assert.deepEqual(stationOf(run.ball), A, label);
    assert.equal(run.ball.state, REST, label);
    assert.equal(driver.pad(run), 0, label);
  }
});

test("the planner's jump is the stepper's: over a plate, with the landing gone and a block one, two or three below or none, and with a block in each of the five cells the arc flies through, jumpAt lands the ball where Up and Cross from rest bring it to rest", () => {
  const C = A.cell;
  const at = (up, on, side = 0) => [C[0] + side, C[1] - on, C[2] - up];
  const plate = [-1, 0, 1].flatMap((side) => [0, 1, 2, 3].map((on) => at(0, on, side)));
  const landing = at(0, 2);
  const lessLanding = plate.filter((c) => c.join() !== landing.join());
  const rested = (run) => {
    const b = run.ball;
    const probe = probeOf(run);
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    b.pad = 0;
    for (let f = 1; f < 400; f++) {
      const out = step(b, probe);
      if (out.some((e) => e.lost)) return null;
      if (b.state === REST) return stationOf(b);
    }
    return assert.fail("the ball never rests");
  };
  const dropOf = (rest) => {
    if (!rest || rest.face !== TOP) return null;
    const [dx, dy, dz] = rest.cell.map((v, i) => v - landing[i]);
    return dx === 0 && dy === 0 && dz >= 0 ? dz : null;
  };
  const agree = (cells, label) => {
    const run = runOver(...cells);
    run.ball = ballAt(RULES, C, TOP, MINUS_Y);
    const rest = rested(run);
    const d = jumpAt(run.planned, A, SOUTH);
    assert.equal(d, dropOf(rest), `${label}: the ball rests on ${rest?.cell}`);
    if (d !== null) assert.deepEqual(planStep(A, SOUTH, JUMP, d), rest, label);
    return d;
  };
  assert.equal(agree(plate, "the plate"), 0);
  for (const d of [1, 2, 3])
    assert.equal(agree([...lessLanding, at(-d, 2)], `a block ${d} below`), d);
  assert.equal(agree(lessLanding, "nothing below"), null);
  for (const [label, c] of [
    ["ahead", at(1, 1)],
    ["over the landing", at(1, 2)],
    ["over the ball", at(2, 0)],
    ["high ahead", at(2, 1)],
    ["high over the landing", at(2, 2)],
  ])
    assert.equal(agree([...plate, c], `a block ${label}`), null);
  for (const [label, c] of [
    ["beside the path", at(1, 1, 1)],
    ["behind", at(1, -1)],
    ["three up", at(3, 0)],
    ["three on", at(1, 3)],
  ])
    assert.equal(agree([...plate, c], `a block ${label}`), 0);
});

test("the keys read a tap down on the frame that reads it and up after, and a held key down on every frame until it is let go, another key's tap beside it", () => {
  const keys = keyPad();
  assert.equal(keys.busy(), false);
  tap(keys, PAD.left);
  assert.equal(keys.busy(), true);
  assert.deepEqual(padsOf(keys, 2), [PAD.left, 0]);
  assert.equal(keys.busy(), false);
  keys.down(PAD.up);
  assert.deepEqual(padsOf(keys, 2), [PAD.up, PAD.up]);
  tap(keys, PAD.left);
  assert.deepEqual(padsOf(keys, 2), [PAD.up | PAD.left, PAD.up]);
  keys.up(PAD.up);
  assert.deepEqual(padsOf(keys, 1), [0]);
  assert.equal(keys.busy(), false);
});

test("two presses of a key, however close, read up between them: two taps before a frame reads either, a tap before the frame after the one that read the last, and a held key let go and pressed again between two frames", () => {
  let keys = keyPad();
  tap(keys, PAD.left);
  tap(keys, PAD.left);
  assert.deepEqual(padsOf(keys, 4), [PAD.left, 0, PAD.left, 0]);
  keys = keyPad();
  tap(keys, PAD.right);
  assert.deepEqual(padsOf(keys, 1), [PAD.right]);
  tap(keys, PAD.right);
  assert.deepEqual(padsOf(keys, 3), [0, PAD.right, 0]);
  keys = keyPad();
  keys.down(PAD.up);
  assert.deepEqual(padsOf(keys, 1), [PAD.up]);
  keys.up(PAD.up);
  keys.down(PAD.up);
  assert.deepEqual(padsOf(keys, 3), [0, PAD.up, PAD.up]);
});

test("a key tapped over frames that do not read the pad is kept for the first frame that does, once a key however many taps are made over them", () => {
  const keys = keyPad();
  tap(keys, PAD.right);
  assert.deepEqual([keys.pad(false), keys.pad(false)], [0, 0]);
  assert.equal(keys.busy(), true);
  assert.deepEqual([keys.pad(true), keys.pad(true)], [PAD.right, 0]);
  for (let i = 0; i < 3; i++) tap(keys, PAD.left);
  assert.equal(keys.pad(false), 0);
  assert.deepEqual(padsOf(keys, 3), [PAD.left, 0, 0]);
  assert.equal(keys.busy(), false);
});

test("a key tapped over frames that do not read the pad is dropped by one told not to keep it, a key held through that frame still sampled and read on, and a tap over frames that keep again kept", () => {
  const keys = keyPad();
  tap(keys, PAD.right);
  assert.equal(keys.pad(false, 0, false), 0);
  assert.equal(keys.busy(), false, "the tap dropped");
  assert.deepEqual(padsOf(keys, 2), [0, 0]);
  keys.down(PAD.left);
  assert.equal(keys.pad(false, 0, false), PAD.left, "a held key sampled");
  assert.deepEqual(padsOf(keys, 1), [PAD.left]);
  keys.up(PAD.left);
  tap(keys, PAD.up);
  assert.equal(keys.pad(false), 0);
  assert.deepEqual(padsOf(keys, 2), [PAD.up, 0], "kept again");
});

test("a key down as a frame that does not read the pad runs is sampled by it: it stands in the frame's word, waits no longer, and let go before the pad is read again is nothing", () => {
  const keys = keyPad();
  keys.down(PAD.up);
  assert.equal(keys.pad(false), PAD.up);
  assert.deepEqual([keys.pad(true), keys.pad(true)], [PAD.up, PAD.up]);
  keys.up(PAD.up);
  assert.equal(keys.pad(true), 0);
  keys.down(PAD.left);
  assert.equal(keys.pad(false), PAD.left);
  keys.up(PAD.left);
  assert.equal(keys.busy(), false, "sampled, the press waits for no frame");
  assert.deepEqual(padsOf(keys, 2), [0, 0]);
});

test("a key down on the frame before, let go and pressed again over frames that do not read the pad, reads as held on, and tapped over them reads as pressed on the first frame that reads it, those frames having read it up", () => {
  const keys = keyPad();
  keys.down(PAD.left);
  assert.deepEqual(padsOf(keys, 1), [PAD.left]);
  keys.up(PAD.left);
  keys.down(PAD.left);
  assert.equal(keys.pad(false), PAD.left);
  assert.deepEqual(padsOf(keys, 2), [PAD.left, PAD.left]);
  keys.up(PAD.left);
  tap(keys, PAD.left);
  assert.equal(keys.pad(false), 0);
  assert.deepEqual(padsOf(keys, 3), [PAD.left, 0, 0]);
  assert.equal(keys.busy(), false);
});

test("another source's bits join the keys', and a key it gave down reads up before a press of it", () => {
  const keys = keyPad();
  assert.equal(keys.pad(true, PAD.left), PAD.left);
  tap(keys, PAD.left);
  assert.deepEqual(padsOf(keys, 3), [0, PAD.left, 0]);
});

test("the keys let every key go where none is named, the presses still waiting, and clear drops both and the frame they were last read on", () => {
  const keys = keyPad();
  keys.down(PAD.up);
  keys.down(PAD.left);
  keys.up();
  assert.equal(keys.busy(), true);
  assert.deepEqual(padsOf(keys, 2), [PAD.up | PAD.left, 0]);
  keys.down(PAD.up);
  keys.clear();
  assert.equal(keys.busy(), false);
  assert.equal(keys.pad(true), 0);
  keys.down(PAD.left);
  assert.deepEqual(padsOf(keys, 1), [PAD.left]);
  keys.clear();
  tap(keys, PAD.left);
  assert.deepEqual(padsOf(keys, 2), [PAD.left, 0]);
});

test("two taps of Left, the second before the frame after the one that read the first, turn the ball about", () => {
  const run = runOver(B.cell);
  run.ball = ballAt(RULES, B.cell, TOP, MINUS_Y);
  const b = run.ball;
  const probe = probeOf(run);
  const keys = keyPad();
  const frame = () => {
    b.pad = keys.pad(true);
    return step(b, probe);
  };
  tap(keys, PAD.left);
  frame();
  assert.deepEqual(b.h, [-1, 0, 0]);
  tap(keys, PAD.left);
  for (let f = 0; f < 2 * QUARTER; f++) frame();
  assert.deepEqual(b.h, Y);
});

test("a recorder answers as its driver does and keeps the word it gave each frame", () => {
  const script = [0, 16, 16, 16, 128, 0, 16384];
  const driver = {
    pad: (live) => script[live.words.frame] ?? 0,
    done: (live) => live.words.frame > 6,
  };
  const rec = recorder(driver);
  const given = script.map((_, f) => rec.pad(at(f)));
  assert.deepEqual(given, script);
  assert.deepEqual(rec.pads, script);
  assert.equal(rec.done(at(3)), false);
  assert.equal(rec.done(at(7)), true);
});

test("a replay gives the recording's word for each frame and nothing past its end", () => {
  const replay = replayDriver([16, 16, 128]);
  assert.deepEqual(
    [0, 1, 2, 3, 9].map((f) => replay.pad(at(f))),
    [16, 16, 128, 0, 0],
  );
  assert.equal(replay.done(at(2)), false);
  assert.equal(replay.done(at(3)), true);
});

test("a recording packs into runs and unpacks to the same words", () => {
  const pads = [0, 0, 0, 16, 16, 128, 0, 0, 16384];
  const packed = pack({ slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(packed, {
    v: 1,
    slot: "HIRO/0",
    seed: 1,
    pads: [
      [0, 3],
      [16, 2],
      [128, 1],
      [0, 2],
      [16384, 1],
    ],
  });
  assert.deepEqual(unpack(packed), { slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(packed))), { slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(pack({ slot: "x", seed: 1, pads: [] }), { v: 1, slot: "x", seed: 1, pads: [] });
  assert.deepEqual(pack({ slot: "x", seed: 1, pads: [16, undefined, 16] }).pads, [
    [16, 1],
    [0, 1],
    [16, 1],
  ]);
  assert.equal(unpack({ v: 2, slot: "x", seed: 1, pads: [] }), null);
  assert.equal(unpack(null), null);
  assert.equal(unpack({ v: 1, slot: "x", seed: 1 }), null);
});
