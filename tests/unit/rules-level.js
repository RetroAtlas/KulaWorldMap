import assert from "node:assert/strict";
import { annotations, mapData, objects } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import {
  index,
  markerCircuit,
  markerState,
  setAnnotations,
  setObjects,
} from "../../public/js/viewer/data.js";
import { PAD, REST, ROLLING } from "../../public/js/play/ball.js";
import {
  end,
  frame,
  nextOf,
  startMatch,
  startRun,
  startSimon,
} from "../../public/js/play/rules.js";

setObjects(objects);
setAnnotations(annotations);
state.data = mapData;

export const motion = objects.motion;

export const { play } = motion;

export const UNIT = objects.block;

export const TABLES = {
  motion,
  jump: objects.jump,
  unit: UNIT,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
  worlds: mapData.themes.map((t) => t.id),
};

export const UP = [0, -1, 0];

export const TOP = 0;

export const KEY = 31;

export const ROLL = motion.types["30"].rolling;

export const LETHARGY = "32";

export const BOUNCY = "33";

export const INVINCIBLE = "34";

export const SIMON = 1;

// a level built for a run
/** The circuits as a parity map, turned over by each press. */
export function circuits() {
  const presses = new Map();
  const turned = (c) => (presses.get(c) ?? []).length % 2 === 1;
  return {
    presses,
    on: (m) => (markerState(m) === "on") !== turned(markerCircuit(m)),
    lit: (ray) => ray.lit !== turned(ray.colour),
    flip: (c, at) => presses.set(c, [...(presses.get(c) ?? []), at]),
  };
}

export const object = (face, type, facing = 0, f3 = 0) => ({
  face,
  type,
  f: [facing, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1],
  v: 0,
});

// A key far from anything the ball reaches, so a level plays as an arcade one.
export const FAR = [25, 25, 25];

export const FAR_KEY = { x: 25, y: 25, z: 25, kind: 0, on: [object(0, KEY)] };

/** A level of blocks of the kinds given, some carrying a record, laid out to order, with `time`
    seconds, and a key far off unless `keyed` is false. */
export function level(blocks, records = [], time = 99, keyed = true) {
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
export const row = (y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17]);

/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's start does. */
export const start = (type = 30) => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(0, type, 3)] });

/** The level's settings record, on no block, with `type` in its first slot. */
export const settings = (type) => ({
  x: 0,
  y: 0,
  z: 0,
  kind: objects.skins.hidden.kind,
  type,
  f: Array(11).fill(0),
});

// a run started and stepped
export const begin = (l, at = null, game = null, match = null) =>
  startRun(l, index(l), TABLES, circuits(), at, game, match);

/** The level as the one at `slot` of the world at `place`, of its finals pack where `final`. */
export const counted = (l, place, slot, final = false) => {
  const w = TABLES.worlds[place];
  return { ...l, theme: w, pack: `/${w}/${w}${final ? "FI" : ""}.PAK`, index: slot };
};

/** Run `n` frames with `pad` held: the events, each with the frame count it left. */
export function steps(live, n, pad = 0) {
  const out = [];
  for (let i = 0; i < n; i++)
    for (const e of frame(live, pad)) out.push({ at: live.words.frame, ...e });
  return out;
}

export const COUNT = 20;

/** The pick after `code` ends a run of the level at `slot` of the world at `place`, over `game`:
    an arcade level with a key far off, one with no key, a hidden level or a final. */
export function picked(
  game,
  place,
  slot,
  code,
  { keyed = true, hidden = false, final = false } = {},
) {
  const records = hidden ? [start(), settings(objects.skins.hidden.type)] : [start()];
  const l = counted(level(row(10, 18), records, 99, keyed), place, slot, final);
  const live = begin(l, null, game);
  end(live, code, []);
  return nextOf(game, live, COUNT);
}

export const HOURGLASS = 35;

/** A pill of `type` on the top of the row's block at `y`. */
export const pill = (y, type = Number(BOUNCY)) => ({
  x: 17,
  y,
  z: 17,
  kind: 0,
  on: [object(0, type)],
});

export const taken = (events, type) => events.some((e) => e.pill?.type === type);

export const landed = (events) => events.some((e) => e.at === "landed");

/** Frames with `pad` held until `done(live, events)` holds, at most `most`: whether it did. */
export function until(live, pad, done, most = 400) {
  for (let i = 0; i < most; i++) if (done(live, frame(live, pad))) return true;
  return false;
}

/** The passes a flash shows on after the one that starts it, its strength stepped once a pass
    and above nothing. */
export const shows = ({ from, step }) => Math.ceil(from / step) - 1;

/** Run `live` with Up held to the frame a thing is taken: the take's event. */
export function takes(live) {
  let took = null;
  assert.ok(until(live, PAD.up, (_, events) => (took = events.find((e) => e.took)?.took ?? null)));
  return took;
}

// --- the Simon rooms -----------------------------------------------------------------------

export const ROOMS = play.simon;

/** A room of the Copycat pack: the row with the start and no key, so it plays in the game's mode. */
export const room = (blocks = row(10, 18), records = [start()]) => ({
  ...level(blocks, records, 99, false),
  pack: objects.skins.copycat,
});

/** The frame at rest on which Up held from the first asks the roll: the latch runs from the first
    gate and asks as its count reaches the latch's frames. */
export const ASKS = ROOMS.idle[0] + ROOMS.latch - 1;

/** Up held from rest through the roll it asks, to the rest on the next block. */
export function rolled(live) {
  for (let i = 1; i <= ASKS; i++) frame(live, PAD.up);
  assert.equal(live.ball.state, ROLLING, "the roll asked");
  assert.ok(
    until(live, PAD.up, (l) => l.ball.state === REST, 40),
    "and come to rest",
  );
}

export const fresh = () => startMatch(ROOMS);

/** Up held through the two rolls of a first round, to the outcome. */
export function done(live) {
  rolled(live);
  rolled(live);
  assert.equal(live.words.verdict, ROOMS.verdict.done);
  assert.ok(until(live, 0, (l) => l.words.outcome !== 0, 60));
  assert.equal(live.words.outcome, play.ending.exit);
}

/** The other player than `player`. */
export const other = (player) => (player + 1) % ROOMS.players;

/** A Simon game in its second match of a room, the word the loop flips left so that the room's
    load flips it to 1, with `points` the players' points. */
export const second = (points = [0, 0]) => ({
  ...startSimon(ROOMS),
  points: [...points],
  starter: 0,
});
