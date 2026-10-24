import { test } from "node:test";
import assert from "node:assert/strict";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
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
  heightOf,
  moving,
  read,
  run as runFrame,
  step,
  turned,
} from "../../public/js/play/ball.js";
import {
  JUMPS,
  RIDDEN,
  RULES,
  TOP,
  TURN,
  UNIT,
  UP,
  aligned,
  carried,
  lattice,
  nearly,
  rest,
  row,
  run,
  table,
} from "./ball-lattice.js";

test("Space at rest hops the ball in place over the table's rows, back at rest where it stood", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const heights = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = f === 1 ? PAD.cross : 0;
    step(b, probe);
    assert.equal(b.state, HOP, `frame ${f}`);
    heights.push(17 * UNIT - 356 - b.pos[2]);
  }
  assert.deepEqual(
    heights,
    JUMPS.rows.slice(1, 31).map((r) => r[0]),
  );
  assert.equal(Math.max(...heights), 458);
  run(b, probe, 1, 0);
  assert.equal(b.state, REST);
  assert.equal(b.pos[2], 17 * UNIT - 356 + 14);
  run(b, probe, 1, 0);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, 17 * UNIT - 356]);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
});

test("a held Cross starts the next hop on the frame after the end, each hop ending 14 lower, and over a lone block the eighth ends in a fall the landing takes on the next frame, the ninth from the radius", () => {
  const probe = lattice([17, 18, 17]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const rest = 17 * UNIT - 356;
  const ends = [];
  const rests = [];
  let was = b.state;
  for (let f = 1; f <= 31 * 8; f++) {
    assert.deepEqual(run(b, probe, 1, PAD.cross), [], `frame ${f}`);
    if (was === HOP && b.state !== HOP) ends.push([f, b.state, b.pos[2] - rest]);
    if (b.state === REST) rests.push(f);
    was = b.state;
  }
  assert.deepEqual(
    ends,
    [1, 2, 3, 4, 5, 6, 7].map((k) => [31 * k, REST, 14 * k]).concat([[31 * 8, FALL, 112]]),
  );
  assert.deepEqual(
    rests,
    [1, 2, 3, 4, 5, 6, 7].map((k) => 31 * k),
  );
  assert.equal(b.v, table.fall.hop);
  assert.equal(b.speed, 0);
  assert.deepEqual(run(b, probe, 1, PAD.cross), [{ at: "landed" }]);
  assert.equal(b.state, REST);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT, rest]);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  run(b, probe, 1, PAD.cross);
  assert.equal(b.state, HOP);
  assert.equal(rest - b.pos[2], JUMPS.rows[1][0]);
});

test("Cross let go after eight hops leaves the ball at rest at its radius on its own block, over a lone block and over a two-deep floor", () => {
  const rest = [17 * UNIT, 18 * UNIT, 17 * UNIT - 356];
  const held = (probe) => {
    const b = ballAt(RULES, [17, 18, 17], TOP, UP);
    run(b, probe, 31 * 8, PAD.cross);
    assert.equal(b.pos[2] - rest[2], 112);
    return b;
  };
  const lone = lattice([17, 18, 17]);
  const b = held(lone);
  assert.equal(b.state, FALL);
  assert.deepEqual(run(b, lone, 1, 0), [{ at: "landed" }]);
  const deep = lattice([17, 18, 17], [17, 18, 18]);
  const c = held(deep);
  assert.equal(c.state, REST);
  assert.deepEqual(blockUnder(c), [17, 18, 18]);
  assert.deepEqual(run(c, deep, 1, 0), []);
  for (const [d, probe] of [
    [b, lone],
    [c, deep],
  ]) {
    assert.equal(d.state, REST);
    assert.deepEqual(d.pos, rest);
    assert.deepEqual(blockUnder(d), [17, 18, 17]);
    assert.equal(heightOf(d), 100);
    assert.deepEqual(run(d, probe, 3, 0), []);
    assert.deepEqual(d.pos, rest);
    assert.equal(moving(d), false);
  }
});

test("the spin's speed is nothing on every frame of a hop after a jump with Cross held on, so the body does not turn in the hop", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(b, probe, 1, PAD.cross), [{ at: "landed" }]);
  assert.equal(b.state, REST);
  // the landing writes the spin's speed nowhere, so the body turns on the landing frame too
  assert.equal(b.spinSpeed, table.jump.speed);
  const spun = [...b.body];
  nearly(spun, turned(aligned(b), 0, (31 * table.spin * table.jump.speed) / TURN));
  for (let f = 1; f <= 31 * 2 + 1; f++) {
    run(b, probe, 1, PAD.cross);
    assert.equal(b.state, f % 31 === 0 ? REST : HOP, `frame ${f}`);
    assert.equal(b.spinSpeed, 0, `frame ${f}`);
    assert.deepEqual(b.body, spun, `frame ${f}`);
  }
});

test("Up with Space jumps the ball along the rows, 458 up on the 15th and 16th frames, and lands two blocks on", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const heights = [];
  const along = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    assert.equal(b.state, JUMP, `frame ${f}`);
    heights.push(17 * UNIT - 356 - b.pos[2]);
    along.push(18 * UNIT - b.pos[1]);
  }
  assert.deepEqual([heights[14], heights[15]], [458, 458]);
  assert.equal(along[29], 986);
  assert.deepEqual(blockUnder(b), [17, 18, 17]);
  assert.equal(heightOf(b), 100 + 41);
  assert.equal(b.spinSpeed, 33);
  const events = run(b, probe, 1, 0);
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(b.pos, [17 * UNIT, 16 * UNIT, 17 * UNIT - 356]);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.deepEqual(b.rest.cell, [17, 16, 17]);
});

test("a forward jump on a face whose normal points the positive way along its axis, +x or the underside, fails the snap's landing, the point the radius under the centre rounding into the cell beyond the block, and lands on the frame after where the snap left it", () => {
  for (const face of [1, 5]) {
    const probe = lattice([17, 18, 17], [17, 16, 17]);
    const b = ballAt(RULES, [17, 18, 17], face, UP);
    const snapped = [17 * UNIT, 16 * UNIT, 17 * UNIT].map((c, i) => c + FACE_NORMAL[face][i] * 356);
    run(b, probe, 30, PAD.up | PAD.cross);
    assert.equal(b.state, JUMP, `face ${face}`);
    assert.deepEqual(run(b, probe, 1, 0), [], `face ${face}: the snap lands nothing`);
    assert.deepEqual([b.state, b.pos], [FALL, snapped], `face ${face}`);
    assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }], `face ${face}: the fall lands`);
    assert.deepEqual([b.state, b.pos], [REST, snapped], `face ${face}`);
    assert.deepEqual(blockUnder(b), [17, 16, 17], `face ${face}`);
    assert.equal(heightOf(b), 100, `face ${face}`);
  }
});

test("a jump taken early in a block lands short of the middle's third at rest with the roll asked, which the pad's reading drops, so with Up released the ball rests where it landed and with Up held it rolls on, from the speed the air left it", () => {
  const probe = row(8, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 11, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  const from = b.progress;
  assert.ok(from < table.fall.short, String(from));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  run(b, probe, 29, PAD.up);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.progress, from);
  assert.deepEqual([b.state, b.forward, b.speed], [REST, true, table.rolling.top]);
  assert.deepEqual(run(b, probe, 1, 0), [], "the pad's reading drops the request");
  assert.deepEqual([b.state, b.forward, b.progress], [REST, false, from]);
  assert.equal(b.speed, table.rolling.top, "the speed stands as the landing left it");
  assert.equal(rest(b, probe), 0);
  run(b, probe, 1, PAD.up);
  assert.equal(b.state, ROLLING);
  assert.equal(b.progress, from + table.rolling.top, "off at the top speed from the first frame");

  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 11, PAD.up);
  run(c, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(c, probe, 1, PAD.up), [{ at: "landed" }]);
  assert.deepEqual(
    [c.state, c.forward, c.speed, c.progress],
    [REST, true, table.rolling.top, from],
  );
  run(c, probe, 1, PAD.up);
  assert.equal(c.state, ROLLING);
  assert.equal(c.progress, from + table.rolling.top);
  rest(c, probe);
  assert.deepEqual(c.pos, [17 * UNIT, 15 * UNIT, 17 * UNIT - 356], "on to the middle, Up let go");
});

test("a jump landing leaves the speed at the top for the roll asked next, where a fall's landing leaves it at nothing, so a ball that rests after a jump rolls off at the top speed and one that rests after a fall grows its speed from the roll's gain", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual([b.state, b.speed], [REST, table.jump.speed]);
  run(b, probe, 3, 0);
  assert.deepEqual([b.state, b.speed], [REST, table.jump.speed]);
  run(b, probe, 1, PAD.up);
  assert.deepEqual([b.state, b.speed], [ROLLING, table.rolling.top]);

  const fallen = lattice([17, 18, 17], [17, 17, 17], [17, 16, 18]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, fallen, 30, PAD.up | PAD.cross);
  let landed = null;
  for (let f = 31; f <= 80 && landed === null; f++)
    if (run(c, fallen, 1, 0).some((e) => e.at === "landed")) landed = f;
  assert.ok(landed !== null, "down onto the block below");
  assert.deepEqual([c.state, c.speed], [REST, 0]);
  run(c, fallen, 1, PAD.up);
  assert.deepEqual([c.state, c.speed], [ROLLING, table.rolling.gain]);
});

test("the long jump's word scales every row's three halfwords three halves over, the odd half dropped toward nothing, counts the rows to 31 and lands three blocks on, 687 up at its apex and 1536 along, the landing clearing the word", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  const j = table.jump;
  b.long = j.arm;
  const [over, under] = j.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  const heights = [];
  const along = [];
  const words = [];
  for (let f = 1; f <= 30; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    assert.equal(b.state, JUMP, `frame ${f}`);
    const [height, right, back] = JUMPS.rows[f - 1].map(scaled);
    assert.deepEqual(
      b.pos,
      [17 * UNIT + right, 18 * UNIT + back, 17 * UNIT - 356 - height],
      `frame ${f}`,
    );
    heights.push(17 * UNIT - 356 - b.pos[2]);
    along.push(18 * UNIT - b.pos[1]);
    words.push(b.long);
  }
  assert.deepEqual([heights[14], heights[15]], [687, 687]);
  assert.equal(along[29], scaled(986));
  assert.deepEqual(
    words,
    Array.from({ length: 30 }, (_, i) => j.arm + i + 1),
  );
  assert.ok(b.long >= j.long);
  assert.deepEqual(run(b, probe, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT - j.far, 17 * UNIT - 356]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.long, 0);
  assert.equal(b.state, REST);
  // with the word at nothing the same rows run unscaled and land two blocks on
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, probe, 30, PAD.up | PAD.cross);
  assert.equal(c.long, 0);
  run(c, probe, 1, 0);
  assert.deepEqual(blockUnder(c), [17, 16, 17]);
});

test("the long jump's failed landing comes straight down three blocks on at the scaled last drop, with the word cleared", () => {
  const probe = row(16, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  b.long = table.jump.arm;
  const [over, under] = table.jump.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.v, -(scaled(JUMPS.rows[28][0]) - scaled(JUMPS.rows[29][0])));
  assert.deepEqual(b.pos, [17 * UNIT, 18 * UNIT - table.jump.far, 17 * UNIT - 356]);
  assert.equal(b.long, 0);
});

test("a wall met in the air and a block met above clear the long jump's word with the bounce and the drop, and a landing on a platform clears it as it rides", () => {
  const j = table.jump;
  const [over, under] = j.scale;
  const scaled = (v) => Math.trunc((v * over) / under);
  const walled = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
    [17, 14, 14],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  b.long = j.arm;
  run(b, walled, 1, PAD.up | PAD.cross);
  for (let f = 2; f <= 31 && b.state === JUMP; f++) run(b, walled, 1, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.ok(b.speed < 0, "thrown back");
  assert.equal(b.long, 0);

  const roofed = row(15, 18, [
    [17, 16, 15],
    [17, 15, 15],
  ]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  c.long = j.arm;
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(c, roofed, 1, PAD.up | PAD.cross);
    if (c.state === FALL) hit = f;
  }
  assert.equal(hit, 5, "the scaled rows lift the ball past the wall's height sooner");
  assert.deepEqual([c.speed, c.spinSpeed], [0, 0]);
  assert.equal(c.v, -(scaled(JUMPS.rows[4][0]) - scaled(JUMPS.rows[3][0])));
  assert.equal(c.long, 0);

  const d = ballAt(RIDDEN, [17, 17, 17], TOP, UP);
  d.long = j.arm;
  const at = { travel: [-300, 0, 0] };
  const body = [
    [17, 14, 17],
    [18, 14, 17],
    [19, 14, 17],
  ];
  const probe = carried(row(17, 18), body, () => at.travel, d);
  run(d, probe, 1, PAD.up | PAD.cross);
  for (let f = 1; f <= 40 && !d.riding; f++) run(d, probe, 1, 0);
  assert.deepEqual(d.riding, { key: "rail" }, "three blocks on, onto the body");
  assert.deepEqual(blockUnder(d), [17, 14, 17]);
  assert.equal(d.long, 0);
});

test("outside the jump's state the frame clears a long word that has counted past its arming and keeps one armed, so a word armed at rest waits for the jump", () => {
  const probe = row(10, 18);
  const j = table.jump;
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  b.long = j.keep;
  run(b, probe, 1, 0);
  assert.equal(b.long, 0);
  b.long = j.keep + 5;
  run(b, probe, 1, PAD.up);
  assert.deepEqual([b.state, b.long], [ROLLING, 0]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  c.long = j.arm;
  run(c, probe, 3, 0);
  assert.equal(c.long, j.arm, "kept at rest");
  run(c, probe, 1, PAD.cross);
  assert.deepEqual([c.state, c.long], [HOP, j.arm], "kept through a hop");
  run(c, probe, 30, 0);
  assert.equal(c.state, REST);
  run(c, probe, 1, PAD.up | PAD.cross);
  assert.deepEqual([c.state, c.long], [JUMP, j.arm + 1], "and counted from the jump's first row");
});

test("a hop's end over a block sets the landing flag as a landing does, seen between read and run on the frame after, and a hop's end over nothing does not", () => {
  const probe = row(10, 18);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 1, PAD.cross);
  run(b, probe, 29, 0);
  assert.deepEqual([b.state, b.landed], [HOP, false]);
  assert.deepEqual(run(b, probe, 1, 0), []);
  assert.deepEqual([b.state, b.landed], [REST, true]);
  b.pad = 0;
  const out = [];
  read(b, probe, out);
  assert.equal(b.landed, true);
  runFrame(b, probe, out);
  assert.equal(b.landed, false);

  const lone = lattice([17, 18, 17]);
  const c = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(c, lone, 31 * 8, PAD.cross);
  assert.deepEqual([c.state, c.landed], [FALL, false], "the eighth hop ends over nothing");
});

test("a jump over nothing falls at the last row's drop, 5 a frame faster to 66, straight down, and is lost past the lattice", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.v, -56);
  assert.equal(b.speed, 0);
  const drops = [];
  const y = b.pos[1];
  for (let f = 0; f < 4; f++) {
    run(b, probe, 1, 0);
    drops.push(b.v);
  }
  assert.deepEqual(drops, [-61, -66, -66, -66]);
  assert.equal(b.pos[1], y);
  assert.ok(b.look.word > 0);
  let frames = 0;
  let events = [];
  while (!events.some((e) => e.lost) && frames < 400) {
    events = run(b, probe, 1, 0);
    frames++;
  }
  assert.ok(
    events.some((e) => e.lost),
    "lost",
  );
  assert.deepEqual(blockUnder(b), [17, 16, 17]);
  assert.equal(b.state, REST);
  assert.deepEqual(b.h, UP);
});

test("a jump's failed landing takes the last frame's change along the normal downward whichever way it went", () => {
  const rows = JUMPS.rows.map((r) => [...r]);
  rows[29][0] = rows[28][0] + 40;
  const probe = row(15, 18);
  const b = ballAt({ ...RULES, jump: { count: JUMPS.count, rows } }, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.v, -40);
});

test("a jump that finds no block two blocks on comes straight down in that cell, onto LEVEL 9's floor three blocks below, where a flat row lands two blocks on", () => {
  // LEVEL 9 at 23,13,21: the second block ahead is gone, and a floor stands three blocks down
  const shape = lattice(
    [23, 13, 21],
    [23, 12, 21],
    [23, 11, 24],
    [23, 12, 24],
    [23, 13, 24],
    [22, 11, 24],
    [22, 12, 21],
  );
  const b = ballAt(RULES, [23, 13, 21], TOP, UP);
  run(b, shape, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.deepEqual(b.pos, [23 * UNIT, 11 * UNIT, 21 * UNIT - 356]);
  let landed = null;
  for (let f = 32; f <= 80 && landed === null; f++) {
    const events = run(b, shape, 1, 0);
    assert.deepEqual(cellOf(b).slice(0, 2), [23, 11], `frame ${f}`);
    if (events.some((e) => e.at === "landed")) landed = f;
  }
  assert.equal(landed, 55);
  assert.equal(b.state, REST);
  assert.deepEqual(blockUnder(b), [23, 11, 24]);
  assert.deepEqual(b.pos, [23 * UNIT, 11 * UNIT, 24 * UNIT - 356]);
  assert.equal(b.progress, 256);
  const flat = lattice(...[8, 9, 10, 11, 12, 13].map((y) => [23, y, 21]));
  const c = ballAt(RULES, [23, 13, 21], TOP, UP);
  run(c, flat, 30, PAD.up | PAD.cross);
  assert.deepEqual(run(c, flat, 1, 0), [{ at: "landed" }]);
  assert.deepEqual(blockUnder(c), [23, 11, 21]);
  assert.deepEqual(c.pos, [23 * UNIT, 11 * UNIT, 21 * UNIT - 356]);
});

test("a bounce's speed back decays by 6 a frame to nothing while the ball falls", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  for (let f = 1; f <= 31 && b.state !== FALL; f++) run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, -33);
  const speeds = [];
  for (let f = 0; f < 8 && b.state === FALL; f++) {
    run(b, probe, 1, 0);
    speeds.push(b.speed);
  }
  assert.deepEqual(speeds, [-27, -21, -15, -9, -3, 0, 0, 0]);
});

test("a forward speed left in a falling ball's word by whatever dropped it is gone on the next frame, the centre unmoved along the heading", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 31, PAD.up | PAD.cross);
  assert.equal(b.state, FALL);
  b.speed = table.rolling.top;
  const y = b.pos[1];
  run(b, probe, 1, 0);
  assert.equal(b.state, FALL);
  assert.equal(b.speed, 0);
  assert.equal(b.pos[1], y);
});

test("a block met above sets the ball back by twice its rise and drops it with no speed forward and no spin, straight down onto the floor beneath, from a jump and from a hop", () => {
  const probe = row(15, 18, [[17, 15, 15]]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(b, probe, 1, PAD.up | PAD.cross);
    if (b.state === FALL) hit = f;
  }
  assert.equal(hit, 7);
  assert.equal(b.speed, 0);
  assert.equal(b.spinSpeed, 0);
  assert.equal(b.v, -39);
  // the seventh row, 317 up and 284 on, the centre set back by twice the row's rise of 39
  assert.deepEqual(b.pos, [17 * UNIT, 16 * UNIT - 284, 17 * UNIT - 356 - 317 + 78]);
  const y = b.pos[1];
  let events = [];
  for (let f = 0; f < 20 && !events.some((e) => e.at === "landed"); f++) {
    events = run(b, probe, 1, 0);
    assert.equal(b.pos[1], y);
  }
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  // the hop's frames run from the second row, so it meets the block over it a frame sooner
  const over = row(15, 18, [[17, 16, 15]]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  let hop = null;
  for (let f = 1; f <= 31 && hop === null; f++) {
    run(c, over, 1, PAD.cross);
    if (c.state === FALL) hop = f;
  }
  assert.equal(hop, 6);
  assert.equal(c.v, -39);
  assert.deepEqual(c.pos, [17 * UNIT, 16 * UNIT, 17 * UNIT - 356 - 317 + 78]);
  rest(c, over);
  assert.deepEqual(blockUnder(c), [17, 16, 17]);
  assert.equal(heightOf(c), 100);
});

test("a wall met in the air throws the ball back and drops it with the spin's speed at nothing, and it lands on the floor behind", () => {
  const probe = row(15, 18, [
    [17, 14, 17],
    [17, 14, 16],
    [17, 14, 15],
  ]);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  let bounced = null;
  for (let f = 1; f <= 31 && bounced === null; f++) {
    b.pad = PAD.up | PAD.cross;
    step(b, probe);
    if (b.state === FALL) bounced = f;
  }
  assert.ok(bounced !== null && bounced < 31, String(bounced));
  assert.ok(b.speed < 0);
  // the jump's spin speed goes with the bounce, so the body stands from that frame on
  assert.equal(b.spinSpeed, 0);
  const body = [...b.body];
  run(b, probe, 1, 0);
  assert.equal(b.state, FALL);
  assert.equal(b.spinSpeed, 0);
  assert.deepEqual(b.body, body);
  rest(b, probe);
  assert.equal(b.state, REST);
  assert.ok([15, 16].includes(blockUnder(b)[1]), String(blockUnder(b)));
  assert.equal(heightOf(b), 100);
});

test("a block above and the floor ahead are asked about the cell the centre lies in, so a jump under a block three above its floor lands two blocks on, a hop under one rests, and a block two above still drops the ball on the seventh frame", () => {
  // OBJ LEVEL's floor along y, with the laser's far end three above the second block of the jump's way
  const floor = [];
  for (let y = 15; y <= 19; y++) floor.push([15, y, 17]);
  const high = lattice(...floor, [15, 18, 14]);
  const b = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  const events = [];
  for (let f = 1; f <= 31; f++) {
    events.push(...run(b, high, 1, PAD.up | PAD.cross).map((e) => [f, e]));
    assert.notEqual(b.state, FALL, `frame ${f}`);
  }
  assert.deepEqual(events, [[31, { at: "landed" }]]);
  assert.deepEqual([b.state, blockUnder(b), b.progress], [REST, [15, 19, 17], 256]);
  const over = lattice(...floor, [15, 17, 14]);
  const c = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  for (let f = 1; f <= 31; f++) {
    run(c, over, 1, PAD.cross);
    assert.notEqual(c.state, FALL, `frame ${f}`);
  }
  assert.equal(c.state, REST, "the hop's end");
  run(c, over, 1, 0);
  assert.deepEqual([blockUnder(c), heightOf(c)], [[15, 17, 17], 100]);
  const low = lattice(...floor, [15, 18, 15]);
  const d = ballAt(RULES, [15, 17, 17], TOP, [0, 1, 0]);
  let hit = null;
  for (let f = 1; f <= 31 && hit === null; f++) {
    run(d, low, 1, PAD.up | PAD.cross);
    if (d.state === FALL) hit = f;
  }
  assert.equal(hit, 7);
});

test("the view's word grows by a rate rising from 4 a frame over a fall, keeps its rate over a block met in the fall, and comes back by 18 once the ball is down", () => {
  const probe = row(15, 18);
  const b = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(b, probe, 23, PAD.up | PAD.cross);
  assert.equal(b.look.word, 0);
  const words = [];
  for (let f = 0; f < 6; f++) {
    run(b, probe, 1, 0);
    words.push(b.look.word);
  }
  assert.deepEqual(words, [4, 9, 15, 22, 30, 39]);
  const c = ballAt(RULES, [17, 16, 17], TOP, UP);
  c.look.word = 100;
  run(c, probe, 1, 0);
  assert.equal(c.look.word, 82);
  assert.ok(moving(c));
  rest(c, probe);
  assert.equal(c.look.word, 0);
  // a block two below the floor comes under the fall: the word comes back with the rate kept,
  // until the landing starts it over
  const lower = row(15, 18, [[17, 14, 19]]);
  const d = ballAt(RULES, [17, 16, 17], TOP, UP);
  run(d, lower, 31, PAD.up | PAD.cross);
  assert.equal(d.state, FALL);
  const seen = [];
  for (let f = 0; f < 60 && d.state === FALL; f++) {
    const before = { word: d.look.word, rate: d.look.rate };
    run(d, lower, 1, 0);
    if (d.state === FALL && d.look.word < before.word)
      seen.push([before.word - d.look.word, d.look.rate === before.rate]);
  }
  assert.ok(seen.length > 0);
  assert.ok(seen.every(([back, kept]) => back === 18 && kept));
  assert.equal(d.state, REST);
  assert.deepEqual(blockUnder(d), [17, 14, 19]);
  assert.equal(d.look.rate, table.look.from);
});

test("a landing past the middle at an edge the side rule refuses rests where the ball came down", () => {
  const probe = row(15, 18, [[18, 15, 17]]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 19, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  const launched = b.progress;
  assert.ok(launched > 256, String(launched));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  let landed = null;
  for (let f = 0; f < 40 && landed === null; f++)
    if (run(b, probe, 1, PAD.up).some((e) => e.at === "landed")) landed = b.progress;
  assert.equal(landed, launched);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.deepEqual([b.state, b.speed], [REST, table.rolling.top]);
  assert.deepEqual(run(b, probe, 1, PAD.up), [{ refused: "edge" }]);
  run(b, probe, 4, PAD.up);
  assert.equal(b.state, REST);
  assert.equal(b.progress, launched);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
});

test("a landing at the climb's progress under a wall climbs on the frame after, not the landing's frame", () => {
  const probe = row(14, 18, [[17, 14, 16]]);
  const b = ballAt(RULES, [17, 18, 17], TOP, UP);
  run(b, probe, 23, PAD.up);
  assert.deepEqual(blockUnder(b), [17, 17, 17]);
  assert.ok(b.progress >= table.rolling.climb, String(b.progress));
  run(b, probe, 1, PAD.up | PAD.cross);
  assert.equal(b.state, JUMP);
  let events = [];
  for (let f = 0; f < 40 && !events.some((e) => e.at === "landed"); f++)
    events = run(b, probe, 1, PAD.up);
  assert.deepEqual(events, [{ at: "landed" }]);
  assert.deepEqual(blockUnder(b), [17, 15, 17]);
  assert.equal(b.ramp, null);
  assert.deepEqual(run(b, probe, 1, PAD.up), [{ face: "climb" }]);
  assert.equal(b.ramp.kind, "climb");
  assert.deepEqual(blockUnder(b), [17, 14, 16]);
});
