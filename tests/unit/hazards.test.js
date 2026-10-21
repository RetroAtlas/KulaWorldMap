import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state, frameOf } from "../../public/js/viewer/state.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import {
  setObjects,
  setAnnotations,
  index,
  framesOn,
  markerState,
  markerCircuit,
} from "../../public/js/viewer/data.js";
import {
  PAD,
  REST,
  HOP,
  JUMP,
  ROLLING,
  FALL,
  aloft,
  blockUnder,
  cellOf,
  faceUnder,
  acrossOf,
  progressOf,
  positionOf,
} from "../../public/js/play/ball.js";
import { startRun, frame, heeds, restart, revive, stand } from "../../public/js/play/rules.js";
import { frameShown, probeOf } from "../../public/js/play/world.js";
import { faceAxes, glowing } from "../../public/js/viewer/motion.js";

setObjects(objects);
setAnnotations(annotations);
state.data = mapData;
const motion = objects.motion;
const UNIT = objects.block;
const TABLES = {
  motion,
  jump: objects.jump,
  unit: UNIT,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
};
const { play } = motion;
const UP = [0, -1, 0];
const TOP = 0;
const FIRE = 1;
const ACID = 4;
const KEY = 31;
const SWITCH = 9;
const TELEPORTER = 5;
const MOVING_SPIKES = 11;
const SPIKES = 12;
const ICE = 2;
const CRUMBLING = 6;
const ARROW = 28;
const SLOW_STAR = 50;
const WANDERER = 53;
const CORKSCREW = 56;
const BOUNCE = motion.types[String(CORKSCREW)];
/** The f3 that starts a corkscrew at a landing, and the one that starts it at the top. */
const LANDED = BOUNCE.phases.indexOf(0);
const RISEN = BOUNCE.phases.indexOf(BOUNCE.bounce.wrap / 2);
const INVINCIBLE = "34";
const THROW = motion.types[String(SWITCH)].throw;
const SEND = motion.types[String(TELEPORTER)].send;
const TOP_SPEED = motion.types["30"].rolling.top;
const HEAT = motion.kinds[String(FIRE)].heat;
const MELT = motion.kinds[String(ACID)].melt;
const BEAM = motion.kinds["8"].harm;
const DEADLY = motion.types[String(MOVING_SPIKES)].deadly;
const CHILL = motion.kinds[String(ICE)];
const ON_ICE = CHILL.standing;
const CRUMBLE = motion.kinds[String(CRUMBLING)];
const ROLL = motion.types["30"].rolling;
const WALL = motion.types["30"].jump.wall;
const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const nearly = (f, g) => f.forEach((v, i) => near(v, g[i]));
const differs = (f, g) => f.some((v, i) => Math.abs(v - g[i]) > 1e-6);
/** The body relative to the axes the frame lays the ball on, as the frame is handed it. */
function bodyWithin(b) {
  const f = faceAxes(b.n, b.h);
  const [x, y, z] = [0, 1, 2].map((j) => b.body.slice(3 * j, 3 * j + 3));
  const along = (k, v) => f[0][k] * v[0] + f[1][k] * v[1] + f[2][k] * v[2];
  return [0, 1, 2].flatMap((k) => [along(k, x), along(k, y), along(k, z)]);
}
/** The body aligned with the ball's frame: the side, the heading and the normal its columns. */
const aligned = (b) => [...b.s, ...b.h, ...b.n];

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

/** A thing on `face`: its facing, its circuit, whether it starts on and the link its f7 holds. */
const object = (face, type, { facing = 0, colour = 0, on = true, link = -1 } = {}) => ({
  face,
  type,
  f: [facing, colour, on ? 1 : 2, 0, -1, link, -1, 386, 1, -1, -1],
  v: 0,
});
// A key far from anything the ball reaches, so a level plays as an arcade one.
const FAR = [25, 25, 25];
const FAR_KEY = { x: 25, y: 25, z: 25, kind: 0, on: [object(0, KEY)] };
/** A level of blocks of the kinds given, plain unless one is, some carrying a record, with a key
    far off. */
function level(blocks, records = []) {
  const all = [...records, FAR_KEY];
  const cells = [];
  const placed = new Map(all.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z, kind = 0] of [...blocks, FAR]) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? kind : mapData.firstRecord + i);
  }
  return { cells, records: all.map((r) => ({ on: [], ...r })), time: 99 };
}
/** A row of blocks along y at x 17, z 17, of `kind` from `y0` to `y1`. */
const row = (y0, y1, kind = 0) =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17, kind]);
/** A laser's record at (15, 15, z) whose beam runs along x to (19, 15, z), crossing the row. */
const beam = (z, lit = true) => ({
  x: 15,
  y: 15,
  z,
  kind: 8,
  type: 1,
  colour: 2,
  f: [1, lit ? 1 : 0, 15, 15, z, 19, 15, z, -1, -1, -1],
});
/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's does. */
const start = () => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(TOP, 30, { facing: 3 })] });
/** A thing of `type` on the top of the row's block at `y`. */
const on = (y, type, opts) => ({ x: 17, y, z: 17, kind: 0, on: [object(TOP, type, opts)] });
/** A crumbling block's record at the row's cell at `y`, whole. */
const crumbling = (y) => ({ x: 17, y, z: 17, kind: CRUMBLING, type: 1, f: Array(11).fill(0) });
/** The link word for `face` of the record at `i`. */
const link = (i, face = TOP) => i * 16 + face;
const slot = (cell, face = TOP) => `${cellKey(...cell)}/${face}`;
const begin = (l, at = null) => startRun(l, index(l), TABLES, circuits(), at);
/** Up to `n` frames with `pad` held, stopping once `until` says so, each with what the hazards
    read before it and what it left. */
function trace(live, n, pad, until = () => false) {
  const out = [];
  for (let i = 0; i < n && !until(live); i++) {
    const before = { block: blockUnder(live.ball), progress: live.ball.progress };
    const heard = heeds(live);
    const events = frame(live, pad);
    out.push({
      frame: live.words.frame,
      heard,
      before,
      events,
      progress: live.ball.progress,
      block: blockUnder(live.ball),
      marker: live.words.marker,
      state: live.ball.state,
      speed: live.ball.speed,
      forward: live.ball.forward,
      pos: [...live.ball.pos],
      cell: cellOf(live.ball),
      words: { ...live.words },
    });
  }
  return out;
}
const has = (f, name) => f.events.some((e) => e[name]);
const dying = (l) => l.words.ending !== 0;
const over = (l) => l.words.outcome !== 0;
const resting = (l) => l.ball.state === REST && l.ball.turn === 0 && !l.ball.ramp;
/** The ball at rest on `at`, the opening wait over. */
function standing(l, at) {
  const live = begin(l, at);
  live.words.wait = 0;
  return live;
}

test("a switch is thrown as the progress word the hazards read enters the band, its circuit turned over once, not again until the ball has left the middle by more than the band's reach, and again as it rolls back", () => {
  const live = begin(level(row(10, 18), [start(), on(15, SWITCH, { colour: 2 })]));
  const sw = live.world.devices.get(slot([17, 15, 17]));
  assert.equal(live.circuits.on(sw), true);
  const frames = trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] <= 13);
  const threw = frames.filter((f) => has(f, "threw"));
  assert.equal(threw.length, 1);
  const [at] = threw;
  const i = frames.indexOf(at);
  assert.deepEqual(at.before.block, [17, 15, 17], "read on the switch's block");
  assert.ok(at.before.progress >= THROW.band[0], String(at.before.progress));
  assert.ok(
    frames[i - 1].before.progress < THROW.band[0] || frames[i - 1].before.block[1] !== 15,
    "on the first frame the word is in the band",
  );
  assert.ok(at.before.progress < THROW.band[0] + TOP_SPEED);
  assert.deepEqual(
    at.events.filter((e) => e.threw),
    [{ threw: { key: cellKey(17, 15, 17), face: TOP, circuit: 2 } }],
  );
  assert.deepEqual(
    live.circuits.presses.get(2),
    [at.frame - 1],
    "flipped once, stamped with the frame",
  );
  assert.equal(live.circuits.on(sw), false);
  assert.equal(at.marker, SWITCH, "the marker is the switch's type");
  const cleared = frames.find((f) => f.frame > at.frame && f.marker === 0);
  assert.ok(cleared, "the marker clears");
  const held = frames[frames.indexOf(cleared) - 1];
  assert.deepEqual([held.marker, held.block], [SWITCH, [17, 15, 17]]);
  assert.ok(held.progress <= THROW.rearm[1], String(held.progress));
  assert.ok(cleared.progress > THROW.rearm[1], "on the frame the word leaves the band");
  assert.deepEqual(cleared.block, [17, 15, 17], "still on the switch's block");

  trace(live, 40, 0, resting);
  for (let i = 0; i < 2; i++) {
    frame(live, PAD.left);
    trace(live, 80, 0, resting);
  }
  assert.deepEqual(live.ball.h, [0, 1, 0], "turned about");
  const back = trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] >= 17);
  assert.equal(back.filter((f) => has(f, "threw")).length, 1, "thrown again on the way back");
  assert.equal(live.circuits.presses.get(2).length, 2);
  assert.equal(live.circuits.on(sw), true);
});

test("a switch thrown on the run's frame n is stamped n, and the frame the map draws at after that frame is n, so the flip shows as the game's draw of frame n shows it: the device it turns on has moved nothing yet and its light counts from there, dark through the eighteenth frame drawn after and lit on the nineteenth, and the one it turns off keeps its light for that frame alone", () => {
  const live = begin(level(row(10, 18), [start(), on(15, SWITCH, { colour: 2 })]));
  const frames = trace(live, 200, PAD.up, (l) => l.circuits.presses.has(2));
  const [stamp] = live.circuits.presses.get(2);
  const n = frames.at(-1).frame - 1;
  assert.equal(stamp, n, "stamped with the frame the hazards ran in");
  assert.equal(frameShown(live), n, "which is the frame the map draws at after it");
  const { every } = motion.glow;
  assert.equal(framesOn(false, [stamp], frameShown(live)), 0, "turned on, moved nothing yet");
  assert.equal(framesOn(true, [stamp], frameShown(live)), n, "turned off, moved to this frame");
  assert.equal(
    glowing(every, true, [stamp], frameShown(live)),
    glowing(every, true, [], frameShown(live)),
    "its light unchanged this frame",
  );
  const lit = [];
  for (let k = 0; k <= every; k++) {
    frame(live, 0);
    assert.equal(frameShown(live), n + 1 + k, "the drawn frame runs on with the frames run");
    lit.push(glowing(every, false, [stamp], frameShown(live)));
  }
  assert.deepEqual(
    lit,
    [...Array(every - 1).fill(false), true, true],
    "dark for the count, then lit",
  );
  assert.equal(framesOn(false, [stamp], frameShown(live)), every + 1, "on since the throw");
  assert.equal(glowing(every, true, [stamp], frameShown(live)), false, "turned off, dark since");
});

test("a switch is left while the ball stands more than the band's reach off the middle across, and thrown as it is drawn back within it", () => {
  const l = level(row(10, 18), [start(), on(15, SWITCH)]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const b = live.ball;
  const reach = THROW.band[1] - UNIT / 2;
  const shift = (by) => {
    b.pos = b.pos.map((v, i) => v + b.s[i] * by);
  };
  shift(reach + 1);
  assert.equal(acrossOf(b), THROW.band[1] + 1);
  const off = trace(live, 5, 0);
  assert.ok(!off.some((f) => has(f, "threw")));
  assert.equal(live.words.marker, 0);
  assert.equal(live.circuits.presses.size, 0);
  shift(-1);
  assert.equal(acrossOf(b), THROW.band[1]);
  const [within] = trace(live, 1, 0);
  assert.ok(has(within, "threw"), "thrown at the band's edge");
  assert.equal(live.words.marker, SWITCH);
});

test("a hop clears the marker in the air, so the switch is thrown again as the ball comes down on it", () => {
  const l = level(row(10, 18), [start(), on(15, SWITCH)]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const [first] = trace(live, 1, 0);
  assert.ok(has(first, "threw"));
  assert.equal(live.words.marker, SWITCH);
  const hop = trace(live, 60, PAD.cross, (l) => l.words.marker === 0);
  assert.equal(hop.at(-1).state, HOP, "cleared in the air");
  const down = trace(live, 60, 0, (l) => l.words.marker === SWITCH);
  assert.ok(
    down.slice(0, -2).every((f) => f.state === HOP && f.marker === 0),
    "left clear through the hop",
  );
  assert.deepEqual(
    [down.at(-2).state, down.at(-2).marker],
    [REST, 0],
    "down, read in the air still",
  );
  assert.ok(has(down.at(-1), "threw"), "and thrown again on the first frame read on the ground");
  assert.equal(live.circuits.presses.get(0).length, 2);
});

test("an on teleporter sends the ball on the sixteenth frame the progress word stands within its band, the pad dead meanwhile, to the far end its slot names, at rest and facing as that one faces, its frame cut", () => {
  const near = {
    x: 17,
    y: 15,
    z: 17,
    kind: 0,
    on: [object(TOP, TELEPORTER, { colour: 1, link: link(2) })],
  };
  const far = {
    x: 20,
    y: 12,
    z: 17,
    kind: 0,
    on: [object(TOP, TELEPORTER, { colour: 1, facing: 1, link: link(1) })],
  };
  const l = level([...row(10, 18), [20, 12, 17], [20, 13, 17], [20, 14, 17]], [start(), near, far]);
  const live = begin(l);
  const roll = trace(live, 200, PAD.up, (l) => l.words.send >= 0);
  const started = roll.at(-1);
  assert.deepEqual(
    started.events.filter((e) => e.sending),
    [{ sending: { key: cellKey(17, 15, 17), face: TOP } }],
  );
  assert.deepEqual(started.before.block, [17, 15, 17]);
  assert.ok(started.before.progress >= SEND.band[0], String(started.before.progress));
  assert.ok(started.before.progress < SEND.band[0] + TOP_SPEED, "the first frame in the band");
  assert.equal(live.words.send, SEND.wait - 1);
  assert.equal(live.words.wait, SEND.hold);
  assert.equal(live.ball.forward, false, "the roll's request dropped");
  const count = trace(live, 40, PAD.up | PAD.left, (l) => l.words.marker === TELEPORTER);
  assert.equal(count.length, SEND.wait, "sent on the sixteenth frame");
  assert.ok(
    count.every((f) => !f.heard),
    "the pad unread through the count",
  );
  assert.ok(!count.some((f) => has(f, "turned")));
  assert.equal(live.ball.turn, 0);
  assert.equal(count.at(-2).state, REST, "stopped at the middle");
  assert.deepEqual(count.at(-2).block, [17, 15, 17]);
  assert.ok(!count.slice(0, -1).some((f) => has(f, "sent")));
  const sent = count.at(-1);
  assert.deepEqual(
    sent.events.filter((e) => e.sent),
    [{ sent: { from: { cell: [17, 15, 17], face: TOP }, to: { cell: [20, 12, 17], face: TOP } } }],
  );
  const b = live.ball;
  assert.deepEqual(blockUnder(b), [20, 12, 17]);
  assert.equal(faceUnder(b), TOP);
  assert.deepEqual(b.h, [0, 1, 0], "facing by the far teleporter's f2");
  assert.equal(b.state, REST);
  assert.equal(b.ramp, null, "no ramp");
  assert.deepEqual(b.frame, frameOf([0, 1, 0], [0, 0, -1]), "the frame cut");
  assert.deepEqual(b.rest.cell, [20, 12, 17]);
  assert.ok(progressOf(b) <= SEND.rearm[1], "laid within the marker's band");
  assert.equal(live.words.marker, TELEPORTER);
  assert.equal(live.words.send, -1);
  assert.equal(live.words.wait, SEND.hold, "the wait written again");
  assert.equal(live.words.standing, TELEPORTER, "the far teleporter read under the ball");
  const dead = trace(live, SEND.hold - 1, 0);
  assert.ok(
    dead.every((f) => !f.heard),
    "the pad dead for the hold less one",
  );
  assert.equal(heeds(live), true);
  const idle = trace(live, 40, 0);
  assert.ok(!idle.some((f) => has(f, "sending")), "the far teleporter does not send the ball back");
  assert.equal(live.words.marker, TELEPORTER);
  const away = trace(live, 5, PAD.up);
  assert.ok(away.at(-1).progress <= SEND.rearm[1]);
  assert.equal(live.words.marker, TELEPORTER, "kept within the band");
  const [out] = trace(live, 1, PAD.up);
  assert.ok(out.progress > SEND.rearm[1]);
  assert.equal(live.words.marker, 0, "cleared on the frame the word leaves it");
});

test("a turn pressed on the frame the count starts is dropped with the roll's request", () => {
  const l = level(row(10, 18), [
    start(),
    on(15, TELEPORTER, { colour: 1, on: false, link: link(1) }),
  ]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  trace(live, 1, 0);
  live.circuits.flip(1, live.words.frame);
  const [started] = trace(live, 1, PAD.left);
  assert.ok(has(started, "sending"));
  assert.ok(!has(started, "turned"), "the turn's request dropped as the count starts");
  assert.equal(live.ball.turn, 0);
  assert.equal(live.ball.ramp, null);
});

test("an off teleporter never sends, a count is dropped where the teleporter goes off or the ball leaves it, and runs afresh once it is on again", () => {
  const l = level(row(10, 18), [
    start(),
    on(15, TELEPORTER, { colour: 1, on: false, link: link(1) }),
  ]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const idle = trace(live, 60, 0);
  assert.ok(!idle.some((f) => has(f, "sending")));
  assert.deepEqual([live.words.send, live.words.marker], [-1, 0]);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 17]);
  live.circuits.flip(1, live.words.frame);
  const [started] = trace(live, 1, 0);
  assert.ok(has(started, "sending"), "turned on, the count starts");
  trace(live, 4, 0);
  assert.equal(live.words.send, SEND.wait - 5);
  live.circuits.flip(1, live.words.frame);
  const [dropped] = trace(live, 1, 0);
  assert.equal(live.words.send, -1, "dropped as the teleporter goes off");
  assert.ok(!has(dropped, "sent"));
  trace(live, 20, 0);
  assert.deepEqual(blockUnder(live.ball), [17, 15, 17]);
  live.circuits.flip(1, live.words.frame);
  const [again] = trace(live, 1, 0);
  assert.ok(has(again, "sending"), "and starts afresh once it is on");
  assert.equal(live.words.send, SEND.wait - 1);
  stand(live, { cell: [17, 12, 17], face: TOP, h: UP });
  const [left] = trace(live, 1, 0);
  assert.equal(live.words.send, -1, "dropped as the ball leaves the teleporter");
  assert.ok(!has(left, "sent") && !has(left, "sending"));
  assert.deepEqual(blockUnder(live.ball), [17, 12, 17]);
});

test("a count stands where the progress word is off the band with the ball still on the teleporter, and runs on as the word comes back", () => {
  const l = level(row(10, 18), [start(), on(15, TELEPORTER, { colour: 1, link: link(1) })]);
  const live = begin(l, { cell: [17, 15, 17], face: TOP, h: UP });
  live.words.wait = 0;
  const [started] = trace(live, 1, 0);
  assert.ok(has(started, "sending"));
  trace(live, 3, 0);
  assert.equal(live.words.send, SEND.wait - 4);
  live.ball.progress = SEND.band[1] + 1;
  const [off] = trace(live, 1, 0);
  assert.equal(live.words.send, SEND.wait - 4, "kept off the band");
  assert.ok(!has(off, "sent") && !has(off, "sending"));
  assert.deepEqual(blockUnder(live.ball), [17, 15, 17]);
  const [back] = trace(live, 1, 0);
  assert.equal(live.words.send, SEND.wait - 5, "and run on");
  assert.ok(!has(back, "sending"), "without starting again");
});

/** The row with a teleporter at its middle whose far end stands on the +x side of a block off
    the row, facing along that side, so that the send stands the ball on a wall. */
function walled() {
  const near = {
    x: 17,
    y: 15,
    z: 17,
    kind: 0,
    on: [object(TOP, TELEPORTER, { colour: 1, link: link(2, 1) })],
  };
  const far = {
    x: 20,
    y: 12,
    z: 17,
    kind: 0,
    on: [object(1, TELEPORTER, { colour: 1, facing: 1, link: link(1) })],
  };
  return level([...row(10, 18), [20, 12, 17]], [start(), near, far]);
}

test("the send keeps the body's turn within its frame: a ball that has rolled, its body turned by the spin, is laid on a face of another orientation with the same body along its side, its heading and its normal as before, and its body in the world turned with the frame", () => {
  const live = begin(walled());
  trace(live, 200, PAD.up, (l) => l.words.send === 0);
  assert.equal(live.words.send, 0, "the count at its last frame");
  const b = live.ball;
  const before = { body: [...b.body], within: bodyWithin(b) };
  assert.ok(differs(before.body, aligned(b)), "turned by the roll");
  assert.ok(differs(before.within, [1, 0, 0, 0, 1, 0, 0, 0, 1]));
  const [sent] = trace(live, 1, PAD.up);
  assert.ok(has(sent, "sent"));
  assert.deepEqual([blockUnder(b), faceUnder(b), b.h], [[20, 12, 17], 1, [0, 1, 0]]);
  nearly(bodyWithin(b), before.within);
  assert.ok(differs(b.body, before.body), "turned with the frame in the world");
  const [x, y, z] = [0, 1, 2].map((k) => b.body.slice(3 * k, 3 * k + 3));
  for (const v of [x, y, z]) near(Math.hypot(...v), 1);
  near(x[0] * y[0] + x[1] * y[1] + x[2] * y[2], 0);
  near(y[0] * z[0] + y[1] * z[1] + y[2] * z[2], 0);
  const idle = trace(live, 10, 0);
  assert.ok(idle.every((f) => !has(f, "sent")));
  nearly(bodyWithin(b), before.within);
});

test("a ball sent without having rolled is laid with its body aligned with its new frame, as the level's start and a restart lay it", () => {
  const l = walled();
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  assert.deepEqual(live.ball.body, aligned(live.ball));
  trace(live, 40, 0, (l) => l.words.marker === TELEPORTER);
  assert.equal(live.words.marker, TELEPORTER, "sent");
  assert.deepEqual([blockUnder(live.ball), faceUnder(live.ball)], [[20, 12, 17], 1]);
  nearly(live.ball.body, aligned(live.ball));
  const run = begin(l);
  assert.deepEqual(run.ball.body, aligned(run.ball), "the start lays it aligned");
  trace(run, 30, PAD.up);
  assert.ok(differs(run.ball.body, aligned(run.ball)), "the roll turns it");
  const again = restart(run);
  assert.deepEqual(again.ball.body, aligned(again.ball), "and a restart lays it aligned again");
});

test("a lit beam in the ball's own cell kills it in four frames, on the ground or in the air, its speeds dropped and its heat set but the ball not frozen, and a dark beam does nothing", () => {
  const ends = (z) => [
    [15, 15, z],
    [19, 15, z],
  ];
  const ground = begin(level([...row(10, 18), ...ends(16)], [start(), beam(16)]));
  const frames = trace(ground, 200, PAD.up, dying);
  const at = frames.at(-1);
  assert.deepEqual(
    at.events.filter((e) => e.dying),
    [{ dying: { cause: "laser", wait: play.wait.laser } }],
  );
  assert.equal(cellOf(ground.ball)[1], 15, "the centre's cell the beam crosses");
  assert.equal(
    ground.words.heat,
    BEAM.heat - HEAT.cool,
    "the heat set, and cooled by the same frame's cooling off fire",
  );
  assert.equal(ground.words.frozen, 0, "stopped but not frozen");
  assert.equal(ground.words.dying, 0);
  assert.equal(ground.ball.state, ROLLING);
  assert.ok(ground.ball.speed < TOP_SPEED, "the speed dropped before the state grew it again");
  const rest = trace(ground, 10, PAD.up, over);
  assert.equal(rest.length, play.wait.laser, "four frames");
  assert.ok(
    rest.slice(0, -1).every((f) => !f.heard),
    "the pad unread until the frame the wait runs out on",
  );
  assert.deepEqual(
    rest
      .at(-1)
      .events.filter((e) => e.ended)
      .map((e) => e.ended.code),
    [play.ending.laser],
  );
  assert.equal(ground.words.result, play.ending.laser);
  assert.ok(squared(rest.at(-1).pos, at.pos) > 0, "rolling on a little");

  const air = standing(level([...row(10, 18), ...ends(15)], [start(), beam(15)]), {
    cell: [17, 15, 17],
    face: TOP,
    h: UP,
  });
  const hop = trace(air, 60, PAD.cross, dying);
  assert.ok(hop.length < 60 && has(hop.at(-1), "dying"), "killed in the air");
  assert.ok(aloft(air.ball));
  assert.equal(cellOf(air.ball)[2], 15, "the hop's centre a cell up, in the beam");
  assert.equal(air.words.heat, BEAM.heat - HEAT.cool);

  const dark = begin(level([...row(10, 18), ...ends(16)], [start(), beam(16, false)]));
  const through = trace(dark, 200, PAD.up, (l) => blockUnder(l.ball)[1] <= 12);
  assert.ok(!through.some((f) => has(f, "dying")), "a dark beam reads as empty");
  const off = begin(level([...row(10, 18), ...ends(16)], [start(), beam(16)]));
  off.circuits.flip(2, 0);
  const switched = trace(off, 200, PAD.up, (l) => blockUnder(l.ball)[1] <= 12);
  assert.ok(!switched.some((f) => has(f, "dying")), "nor a beam switched off");
});

test("a beam switched on about the ball at rest kills it on the frame after the switch and not on its own, the hazards testing the word the last frame's read of the cells about the ball left", () => {
  const live = standing(
    level([...row(10, 18), [15, 15, 16], [19, 15, 16]], [start(), beam(16, false)]),
    { cell: [17, 15, 17], face: TOP, h: UP },
  );
  const dark = trace(live, 3, 0);
  assert.ok(!dark.some((f) => has(f, "dying")), "nothing while the beam is dark");
  live.circuits.flip(2, live.words.frame);
  const lit = trace(live, 5, 0, dying);
  assert.equal(lit.length, 2, "the switch's frame tests the last read's word, the next the beam");
  assert.deepEqual(
    lit.at(-1).events.filter((e) => e.dying),
    [{ dying: { cause: "laser", wait: play.wait.laser } }],
  );
});

test("fire heats the ball by the burn a frame on the ground and kills it on the 51st frame from cold, frozen with the fire's wait and swelling meanwhile, heats it by the landing's measure more on the frame after a landing, not in the air, and the heat cools off fire to nothing", () => {
  const l = level([...row(15, 18), ...row(10, 14, FIRE)], [start()]);
  const live = standing(l, { cell: [17, 12, 17], face: TOP, h: UP });
  assert.equal(live.words.standing, motion.kinds[String(FIRE)].standing);
  const frames = trace(live, 100, 0, dying);
  assert.equal(frames.length, 51);
  assert.deepEqual(
    frames.slice(0, 50).map((f) => f.words.heat),
    Array.from({ length: 50 }, (_, i) => (i + 1) * HEAT.burn),
  );
  assert.equal(frames[49].words.heat, HEAT.limit, "at the limit and alive");
  assert.deepEqual(
    frames.at(-1).events.filter((e) => e.dying),
    [{ dying: { cause: "fire", wait: play.wait.fire } }],
  );
  assert.deepEqual(
    [live.words.frozen, live.words.dying, live.words.swell],
    [1, 0, 0],
    "frozen and not marked dying",
  );
  const burning = trace(live, 30, 0, over);
  assert.equal(burning.length, play.wait.fire);
  assert.deepEqual(
    burning.map((f) => f.words.swell),
    burning.map((_, i) => (i + 1) * HEAT.swell),
    "the swell grows a frame while the countdown runs",
  );
  assert.deepEqual(
    burning
      .at(-1)
      .events.filter((e) => e.ended)
      .map((e) => e.ended.code),
    [play.ending.fire],
  );

  const landing = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  frame(landing, PAD.up | PAD.cross);
  assert.equal(landing.ball.state, JUMP);
  const flight = trace(landing, 60, 0, (l) => l.ball.landed);
  assert.deepEqual(blockUnder(landing.ball), [17, 13, 17], "down on fire two blocks on");
  assert.ok(
    flight.every((f) => f.words.heat === 0),
    "no heat in the air over the fire",
  );
  frame(landing, 0);
  assert.equal(
    landing.words.heat,
    HEAT.burn + HEAT.land,
    "the landing's measure on the frame after",
  );
  frame(landing, 0);
  assert.equal(landing.words.heat, 2 * HEAT.burn + HEAT.land);

  const cooling = standing(l, { cell: [17, 16, 17], face: TOP, h: UP });
  cooling.words.heat = 100;
  const cooled = trace(cooling, 8, 0);
  assert.deepEqual(
    cooled.map((f) => f.words.heat),
    [85, 70, 55, 40, 25, 10, 0, 0],
  );
});

test("acid on the ground sets its ending and wait and grows the melt by the gain, the ball rolling on with its speed kept, the melt growing a frame while the countdown runs and held at its top, and the level ending as the wait runs out", () => {
  const l = level([...row(15, 18), ...row(10, 14, ACID)], [start()]);
  const live = begin(l);
  const frames = trace(live, 200, PAD.up, dying);
  const at = frames.at(-1);
  assert.deepEqual(
    at.events.filter((e) => e.dying),
    [{ dying: { cause: "acid", wait: play.wait.acid } }],
  );
  assert.deepEqual(at.block, [17, 14, 17], "the first frame the hazards read the acid");
  assert.equal(live.words.melt, MELT.gain);
  assert.equal(live.words.frozen, 0);
  assert.equal(live.words.dying, 0);
  assert.equal(live.ball.speed, TOP_SPEED, "the speed kept");
  const melting = trace(live, 20, PAD.up, over);
  assert.equal(melting.length, play.wait.acid, "six frames");
  assert.deepEqual(
    melting.map((f) => f.words.melt),
    [600, 900, 1200, 1500, 1800, MELT.top],
    "the melt grows a frame and is held at the top",
  );
  assert.ok(melting.slice(0, -1).every((f) => !f.heard));
  assert.ok(
    squared(melting.at(-1).pos, at.pos) > TOP_SPEED ** 2,
    "the ball rolled on through the countdown",
  );
  assert.deepEqual(
    melting
      .at(-1)
      .events.filter((e) => e.ended)
      .map((e) => e.ended.code),
    [play.ending.acid],
  );
  assert.equal(live.words.result, play.ending.acid);
});

test("spikes under the ball kill it at once, frozen and marked dying for the spikes' wait, and the outcome comes a frame before the wait runs out", () => {
  const live = begin(level(row(10, 18), [start(), on(15, SPIKES)]));
  const frames = trace(live, 200, PAD.up, dying);
  const at = frames.at(-1);
  assert.deepEqual(
    at.events.filter((e) => e.dying),
    [{ dying: { cause: "spikes", wait: play.wait.spikes } }],
  );
  assert.deepEqual(at.block, [17, 15, 17]);
  assert.deepEqual(
    [live.words.ending, live.words.frozen, live.words.dying],
    [play.ending.spikes, 1, 1],
  );
  assert.equal(live.ball.speed, 0);
  const frozen = trace(live, 20, PAD.up, over);
  assert.equal(frozen.length, play.wait.spikes - 1, "the outcome a frame early");
  assert.ok(
    frozen.every((f) => f.pos.every((v, i) => v === at.pos[i])),
    "the ball frozen where it was",
  );
  assert.equal(live.words.wait, 1);
  assert.equal(live.words.result, 0, "the outcome written and not the result");
  assert.equal(live.words.outcome, play.ending.spikes);
});

test("the moving spikes kill while the table's list says their flag held the deadly value on the frame before, which the hazards read, with the standing wait, are harmless outside it, and after a landing on them take the spikes' own wait, and the map's picture has them flat on the frame a phase that opens down kills and off the ground on the frame after", () => {
  const { harm, cycle } = motion.types[String(MOVING_SPIKES)];
  for (const phase of [0, 1, 2, 3]) {
    const deadly = DEADLY[phase];
    const l = level(row(10, 18), [start(), on(15, MOVING_SPIKES, { colour: phase })]);
    const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
    const frames = trace(live, 200, 0, dying);
    const before = frames.length - 1;
    assert.equal(
      before,
      deadly.at(-1) ? 0 : deadly.indexOf(true) + 1,
      `phase ${phase}: killed on the frame after the list's first deadly frame`,
    );
    assert.ok(deadly[(before + deadly.length - 1) % deadly.length]);
    assert.ok(
      frames.slice(0, -1).every((f, k) => !deadly[(k + deadly.length - 1) % deadly.length]),
      "harmless on every frame before",
    );
    assert.deepEqual(
      frames.at(-1).events.filter((e) => e.dying),
      [{ dying: { cause: "spikes", wait: harm.standing } }],
    );
    assert.deepEqual([live.words.frozen, live.words.dying], [1, 1]);
    const shown = cycle[phase][frameShown(live) % cycle[phase].length];
    if (deadly.at(-1)) assert.ok(shown > 0, `phase ${phase}: up on the frame they kill`);
    else {
      assert.equal(shown, 0, `phase ${phase}: flat on the frame they kill`);
      assert.ok(
        cycle[phase][frameShown(live) + 1] > 0,
        `phase ${phase}: off the ground on the frame after`,
      );
    }
    const frozen = trace(live, 20, 0, over);
    assert.equal(frozen.length, harm.standing - 1);
  }
  const deadly = DEADLY[0];
  const l = level(row(10, 18), [start(), on(15, MOVING_SPIKES)]);
  const late = standing(l, { cell: [17, 17, 17], face: TOP, h: UP });
  const retracted = deadly.lastIndexOf(true) + 2;
  trace(late, retracted, 0);
  stand(late, { cell: [17, 15, 17], face: TOP, h: UP });
  const frames = trace(late, 300, 0, dying);
  assert.equal(
    late.words.frame - 1,
    deadly.length + deadly.indexOf(true) + 1,
    "harmless once retracted until the next cycle's deadly frame",
  );
  assert.ok(frames.length > 1);

  const landing = standing(level(row(10, 18), [start(), on(15, MOVING_SPIKES, { colour: 2 })]), {
    cell: [17, 17, 17],
    face: TOP,
    h: UP,
  });
  frame(landing, PAD.up | PAD.cross);
  assert.equal(landing.ball.state, JUMP);
  const flight = trace(landing, 60, 0, (l) => l.ball.landed);
  assert.deepEqual(blockUnder(landing.ball), [17, 15, 17]);
  assert.ok(!has(flight.at(-1), "dying"), "the landing's frame itself reads the air");
  const [after] = trace(landing, 1, 0);
  assert.ok(DEADLY[2][landing.words.frame - 2], "while the list says deadly");
  assert.deepEqual(
    after.events.filter((e) => e.dying),
    [{ dying: { cause: "spikes", wait: play.wait.spikes } }],
  );
});

test("a captivator catches the ball within its reach of its position as the rules have stepped it, the walkers standing while the ball is caught, over any countdown but a catch's own and under the guard, and the wandering ball within its own shorter reach", () => {
  const platform = {
    x: 20,
    y: 14,
    z: 17,
    kind: 5,
    type: 3,
    f: [2, 1, 20, 10, 17, 20, 14, 17, -1, -1, -1],
    length: 2,
  };
  const l = level(
    [...row(10, 18), [20, 14, 17]],
    [start(), on(10, SLOW_STAR, { facing: 1 }), platform],
  );
  const live = standing(l, { cell: [17, 15, 17], face: TOP, h: UP });
  const star = live.world.walkers.get(slot([17, 10, 17]));
  const rail = live.world.walkers.get(`${cellKey(20, 14, 17)}/null`);
  const { square } = motion.types[String(SLOW_STAR)].catch;
  const seen = [];
  let out = [];
  while (!out.some((e) => e.dying) && live.words.frame < 400) {
    out = frame(live, 0);
    seen.push({ star: [...star.pos], d2: squared(live.ball.pos, star.pos), rail: [...rail.pos] });
  }
  const at = seen.at(-1);
  assert.deepEqual(
    out.filter((e) => e.dying),
    [{ dying: { cause: "captivator", wait: play.wait.captivator } }],
  );
  assert.ok(at.d2 <= square, `caught at ${at.d2}`);
  assert.ok(seen.at(-2).d2 > square, "and not a frame before");
  assert.deepEqual(
    [live.words.ending, live.words.frozen, live.words.dying, live.ball.speed],
    [play.ending.captivator, 1, 1, 0],
  );
  const held = trace(live, 20, 0, over);
  assert.equal(held.length, play.wait.captivator);
  assert.ok(
    held.every(() => star.pos.every((v, i) => v === at.star[i])),
    "the star stands while the ball is caught",
  );
  assert.notDeepEqual(rail.pos, at.rail, "the platform runs on");
  assert.equal(star.at, rail.at, "both at the run's frame");

  const corkscrew = level(row(10, 18), [start(), on(15, CORKSCREW, { colour: LANDED })]);
  const over2 = standing(corkscrew, { cell: [17, 15, 17], face: TOP, h: UP });
  Object.assign(over2.words, { ending: play.ending.exit, wait: play.wait.exit });
  const [caught] = trace(over2, 1, 0);
  assert.ok(has(caught, "dying"), "a catch overrides the exit's countdown");
  assert.deepEqual(
    [over2.words.ending, over2.words.wait],
    [play.ending.captivator, play.wait.captivator],
  );
  const [again] = trace(over2, 1, 0);
  assert.ok(!has(again, "dying"), "and not its own");
  assert.equal(over2.words.wait, play.wait.captivator - 1);
  const guarded = restart(begin(corkscrew, { cell: [17, 15, 17], face: TOP, h: UP }));
  assert.equal(guarded.words.guard, 1);
  const [under] = trace(guarded, 1, 0);
  assert.ok(has(under, "dying"), "the hit test runs under the guard");

  const wandering = standing(level(row(12, 18), [start(), on(14, WANDERER, { facing: 1 })]), {
    cell: [17, 18, 17],
    face: TOP,
    h: UP,
  });
  const ball = wandering.world.walkers.get(slot([17, 14, 17]));
  const own = motion.types[String(WANDERER)].catch.square;
  const near = [];
  out = [];
  while (!out.some((e) => e.dying) && wandering.words.frame < 4000) {
    out = frame(wandering, 0);
    near.push(squared(wandering.ball.pos, ball.pos));
  }
  assert.ok(
    out.some((e) => e.dying),
    "caught in the end",
  );
  assert.ok(near.at(-1) <= own, String(near.at(-1)));
  assert.ok(
    near.slice(0, -1).some((d2) => d2 > own && d2 <= square),
    "within the others' reach before and not caught",
  );
});

test("the corkscrew catches from where it bounces: a ball under it is caught at a landing on the first frame the hit test runs and under a risen one only from the first frame the rise has come down within reach, and a jump over its block is caught while it is up and clears it about a landing", () => {
  const { bounce, phases } = BOUNCE;
  const square = BOUNCE.catch.square;
  const reach = Math.sqrt(square);
  const rise = (f3, f) =>
    bounce.rise *
    Math.sin((((phases[f3] + bounce.rate * f) % bounce.wrap) / motion.turn) * 2 * Math.PI);
  const under = (f3, cell) =>
    standing(level(row(10, 18), [start(), on(15, CORKSCREW, { colour: f3 })]), {
      cell,
      face: TOP,
      h: UP,
    });
  const caught = [{ dying: { cause: "captivator", wait: play.wait.captivator } }];

  const landed = under(LANDED, [17, 15, 17]);
  const [c] = landed.world.captivators;
  const gap = Math.sqrt(squared(landed.ball.pos, c.at));
  assert.equal(gap, BOUNCE.catch.stand - landed.ball.radius, "the centre under the point");
  assert.equal(rise(LANDED, 0), 0);
  const [first] = trace(landed, 1, 0);
  assert.deepEqual(
    first.events.filter((e) => e.dying),
    caught,
  );
  assert.equal(frameShown(landed), 0, "caught on the frame the draw then shows, the first");

  const risen = under(RISEN, [17, 15, 17]);
  let down = 0;
  while (gap + rise(RISEN, down) > reach) down++;
  assert.ok(down > 1 && gap + rise(RISEN, down - 1) > reach, String(down));
  const stood = trace(risen, down + 10, 0, dying);
  assert.equal(stood.length, down + 1, "caught on the frame the rise comes within reach");
  assert.ok(
    stood.slice(0, -1).every((f) => !has(f, "dying")),
    "and not before",
  );
  assert.ok(
    stood.every((f) => squared(f.pos, c.at) <= square),
    "though the ball stood within reach of the home throughout",
  );
  assert.deepEqual(
    stood.at(-1).events.filter((e) => e.dying),
    caught,
  );
  assert.equal(frameShown(risen), down);

  // Up with Space from the block before leaps over the corkscrew's block, the centre at the
  // jump's apex row over it; the idle frames before the press put the corkscrew at a landing, or
  // at its top, as the ball reaches that row
  const rows = TABLES.jump.rows;
  const apex = Math.max(...rows.map((r) => r[0]));
  const apexRow = rows.findIndex((r) => r[0] === apex);
  const needed = landed.ball.radius + apex - BOUNCE.catch.stand - reach;
  const atLanding = Math.round((bounce.wrap - phases[RISEN]) / bounce.rate) - apexRow;
  const atTop = atLanding + Math.round(bounce.wrap / 2 / bounce.rate);
  const leap = (idle) => {
    const live = under(RISEN, [17, 16, 17]);
    trace(live, idle, 0);
    frame(live, PAD.up | PAD.cross);
    assert.equal(live.ball.state, JUMP);
    const flight = trace(live, 80, 0, (l) => dying(l) || resting(l));
    const over = flight.filter((f) => f.cell[0] === 17 && f.cell[1] === 15);
    assert.ok(over.length > 1, "over the corkscrew's block");
    return { live, flight, over };
  };
  const clear = leap(atLanding);
  assert.ok(rise(RISEN, atLanding + apexRow) < needed, "near a landing at the apex");
  assert.ok(!dying(clear.live), "not caught");
  assert.ok(clear.over.every((f) => rise(RISEN, f.frame - 1) < needed));
  assert.deepEqual(blockUnder(clear.live.ball), [17, 14, 17], "down two blocks on");
  const up = leap(atTop);
  assert.ok(rise(RISEN, atTop + apexRow) >= needed, "risen at the apex");
  const hit = up.flight.at(-1);
  assert.deepEqual(
    hit.events.filter((e) => e.dying),
    caught,
  );
  assert.equal(hit.state, JUMP, "caught in the air");
  assert.deepEqual(hit.cell.slice(0, 2), [17, 15], "over the corkscrew's block");
  const lift = rise(RISEN, hit.frame - 1);
  assert.ok(lift >= needed, String(lift));
  assert.ok(squared(hit.pos, c.at) > square, "out of reach of the home");
  assert.ok(squared(hit.pos, [c.at[0], c.at[1], c.at[2] - lift]) <= square, "within the point's");
});

test("the invincibility pill refuses the beam, fire's heat, acid, the spikes, the moving spikes and a catch, and not the clock", () => {
  const safe = (l, at, pad = 0) => {
    const live = standing(l, at);
    live.words.pills[INVINCIBLE] = 400;
    const frames = trace(live, 60, pad);
    assert.ok(!frames.some((f) => has(f, "dying")), "no death");
    assert.equal(live.words.ending, 0);
    return live;
  };
  const at = { cell: [17, 15, 17], face: TOP, h: UP };
  const beamed = safe(level([...row(10, 18), [15, 15, 16], [19, 15, 16]], [start(), beam(16)]), at);
  assert.equal(beamed.words.heat, 0);
  const fired = safe(level([...row(16, 18), ...row(10, 15, FIRE)], [start()]), at);
  assert.equal(fired.words.heat, 0, "the heat does not grow");
  const melted = safe(level([...row(16, 18), ...row(10, 15, ACID)], [start()]), at);
  assert.equal(melted.words.melt, 0);
  safe(level(row(10, 18), [start(), on(15, SPIKES)]), at);
  safe(level(row(10, 18), [start(), on(15, MOVING_SPIKES, { colour: 2 })]), at);
  safe(level(row(10, 18), [start(), on(15, CORKSCREW)]), at);
  const timed = standing({ ...level(row(10, 18), [start()]), time: 1 }, at);
  timed.words.pills[INVINCIBLE] = 400;
  const frames = trace(timed, 60, 0, over);
  assert.equal(timed.words.outcome, play.clock.out, "the clock still runs out");
  assert.equal(frames.length, play.clock.second);
});

test("revive undoes a death and puts the ball back at rest on its last rest, or on the station given, the clock and the score kept", () => {
  const l = level(row(10, 18), [start(), on(15, SPIKES), on(17, 37)]);
  const live = begin(l);
  trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] === 16);
  trace(live, 40, 0, resting);
  trace(live, 200, PAD.up, dying);
  assert.equal(live.words.ending, play.ending.spikes);
  trace(live, 3, 0);
  const { frame: at, clock, score } = live.words;
  assert.ok(score > 0, "the coin on the way taken");
  assert.deepEqual(live.ball.rest.cell, [17, 16, 17], "the last rest before the spikes");
  revive(live);
  assert.deepEqual(
    [live.words.ending, live.words.wait, live.words.frozen, live.words.dying, live.words.outcome],
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual([live.words.frame, live.words.clock, live.words.score], [at, clock, score]);
  assert.deepEqual(blockUnder(live.ball), [17, 16, 17]);
  assert.equal(live.ball.state, REST);
  assert.equal(live.ball.speed, 0);
  const [next] = trace(live, 1, 0);
  assert.equal(next.heard, true, "the pad read again");
  assert.equal(live.ball.frozen, false);

  const burnt = standing(level([...row(16, 18), ...row(10, 15, FIRE)], [start()]), {
    cell: [17, 15, 17],
    face: TOP,
    h: UP,
  });
  trace(burnt, 100, 0, dying);
  trace(burnt, 5, 0);
  assert.ok(burnt.words.heat > HEAT.limit && burnt.words.swell > 0);
  revive(burnt, { cell: [17, 17, 17], face: TOP, h: [1, 0, 0] });
  assert.deepEqual([burnt.words.heat, burnt.words.melt, burnt.words.swell], [0, 0, 0]);
  assert.deepEqual(blockUnder(burnt.ball), [17, 17, 17]);
  assert.deepEqual(burnt.ball.h, [1, 0, 0]);
  assert.equal(burnt.words.standing, -1, "read afresh where it stands");
});

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

/** A platform's record at (x, y, z), two blocks long, its run from its cell to `far` along one
    axis, setting off toward `far`. */
function platform(x, y, z, far) {
  const cell = [x, y, z];
  const axis = [0, 1, 2].find((i) => far[i] !== cell[i]);
  const step = [0, 0, 0];
  step[axis] = far[axis] > cell[axis] ? 1 : -1;
  const type = FACE_NORMAL.findIndex((n) => n.every((v, i) => v === step[i]));
  const [lower, upper] = far[axis] > cell[axis] ? [cell, far] : [far, cell];
  const f = [[1, 2, 5][axis], lower === cell ? 0 : 1, ...lower, ...upper, -1, -1, -1];
  return { x, y, z, kind: 5, type, f, length: 2 };
}

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
