import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state, frameOf } from "../../public/js/viewer/state.js";
import { cellKey } from "../../public/js/format/lattice.js";
import {
  setObjects,
  setAnnotations,
  index,
  markerState,
  markerCircuit,
} from "../../public/js/viewer/data.js";
import {
  PAD,
  REST,
  HOP,
  blockUnder,
  faceUnder,
  acrossOf,
  progressOf,
} from "../../public/js/play/ball.js";
import { startRun, frame, heeds, stand } from "../../public/js/play/rules.js";

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
const UP = [0, -1, 0];
const TOP = 0;
const KEY = 31;
const SWITCH = 9;
const TELEPORTER = 5;
const THROW = motion.types[String(SWITCH)].throw;
const SEND = motion.types[String(TELEPORTER)].send;
const TOP_SPEED = motion.types["30"].rolling.top;

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
/** A level of plain blocks, some carrying a record, with a key far off. */
function level(blocks, records = []) {
  const all = [...records, FAR_KEY];
  const cells = [];
  const placed = new Map(all.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z] of [...blocks, FAR]) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? 0 : mapData.firstRecord + i);
  }
  return { cells, records: all.map((r) => ({ on: [], ...r })), time: 99 };
}
/** A row of blocks along y at x 17, z 17. */
const row = (y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17]);
/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's does. */
const start = () => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(TOP, 30, { facing: 3 })] });
/** A thing of `type` on the top of the row's block at `y`. */
const on = (y, type, opts) => ({ x: 17, y, z: 17, kind: 0, on: [object(TOP, type, opts)] });
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
    });
  }
  return out;
}
const has = (f, name) => f.events.some((e) => e[name]);
const resting = (l) => l.ball.state === REST && l.ball.turn === 0 && !l.ball.ramp;

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
  frame(live, PAD.down);
  trace(live, 80, 0, resting);
  assert.deepEqual(live.ball.h, [0, 1, 0], "turned about");
  const back = trace(live, 200, PAD.up, (l) => blockUnder(l.ball)[1] >= 17);
  assert.equal(back.filter((f) => has(f, "threw")).length, 1, "thrown again on the way back");
  assert.equal(live.circuits.presses.get(2).length, 2);
  assert.equal(live.circuits.on(sw), true);
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
