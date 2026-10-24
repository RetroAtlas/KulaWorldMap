import assert from "node:assert/strict";
import { annotations, mapData, objects } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { FACE_NORMAL, cellKey } from "../../public/js/format/lattice.js";
import {
  index,
  markerCircuit,
  markerState,
  setAnnotations,
  setObjects,
} from "../../public/js/viewer/data.js";
import { REST, blockUnder, cellOf } from "../../public/js/play/ball.js";
import { frame, heeds, startRun } from "../../public/js/play/rules.js";

setObjects(objects);

setAnnotations(annotations);

state.data = mapData;

export const motion = objects.motion;

export const UNIT = objects.block;

export const TABLES = {
  motion,
  jump: objects.jump,
  unit: UNIT,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
};

export const { play } = motion;

export const UP = [0, -1, 0];

export const TOP = 0;

export const FIRE = 1;

export const KEY = 31;

export const CORKSCREW = 56;

export const TOP_SPEED = motion.types["30"].rolling.top;

export const HEAT = motion.kinds[String(FIRE)].heat;

export const BEAM = motion.kinds["8"].harm;

export const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);

export const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

export const differs = (f, g) => f.some((v, i) => Math.abs(v - g[i]) > 1e-6);

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

/** A thing on `face`: its facing, its circuit, whether it starts on and the link its f7 holds. */
export const object = (face, type, { facing = 0, colour = 0, on = true, link = -1 } = {}) => ({
  face,
  type,
  f: [facing, colour, on ? 1 : 2, 0, -1, link, -1, 386, 1, -1, -1],
  v: 0,
});

// A key far from anything the ball reaches, so a level plays as an arcade one.
export const FAR = [25, 25, 25];

export const FAR_KEY = { x: 25, y: 25, z: 25, kind: 0, on: [object(0, KEY)] };

/** A level of blocks of the kinds given, plain unless one is, some carrying a record, with a key
    far off. */
export function level(blocks, records = []) {
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
export const row = (y0, y1, kind = 0) =>
  Array.from({ length: y1 - y0 + 1 }, (_, i) => [17, y0 + i, 17, kind]);

/** A laser's record at (15, 15, z) whose beam runs along x to (19, 15, z), crossing the row. */
export const beam = (z, lit = true) => ({
  x: 15,
  y: 15,
  z,
  kind: 8,
  type: 1,
  colour: 2,
  f: [1, lit ? 1 : 0, 15, 15, z, 19, 15, z, -1, -1, -1],
});

/** The start on the top of (17, 18, 17), heading −y as LEVEL 1's start does. */
export const start = () => ({ x: 17, y: 18, z: 17, kind: 0, on: [object(TOP, 30, { facing: 3 })] });

/** A thing of `type` on the top of the row's block at `y`. */
export const on = (y, type, opts) => ({ x: 17, y, z: 17, kind: 0, on: [object(TOP, type, opts)] });

/** The link word for `face` of the record at `i`. */
export const link = (i, face = TOP) => i * 16 + face;

export const slot = (cell, face = TOP) => `${cellKey(...cell)}/${face}`;

export const begin = (l, at = null) => startRun(l, index(l), TABLES, circuits(), at);

/** Up to `n` frames with `pad` held, stopping once `until` says so, each with what the hazards
    read before it and what it left. */
export function trace(live, n, pad, until = () => false) {
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

export const has = (f, name) => f.events.some((e) => e[name]);

export const dying = (l) => l.words.ending !== 0;

export const over = (l) => l.words.outcome !== 0;

export const resting = (l) => l.ball.state === REST && l.ball.turn === 0 && !l.ball.ramp;

/** The ball at rest on `at`, the opening wait over. */
export function standing(l, at) {
  const live = begin(l, at);
  live.words.wait = 0;
  return live;
}

/** A platform's record at (x, y, z), two blocks long, its run from its cell to `far` along one
    axis, setting off toward `far`. */
export function platform(x, y, z, far) {
  const cell = [x, y, z];
  const axis = [0, 1, 2].find((i) => far[i] !== cell[i]);
  const step = [0, 0, 0];
  step[axis] = far[axis] > cell[axis] ? 1 : -1;
  const type = FACE_NORMAL.findIndex((n) => n.every((v, i) => v === step[i]));
  const [lower, upper] = far[axis] > cell[axis] ? [cell, far] : [far, cell];
  const f = [[1, 2, 5][axis], lower === cell ? 0 : 1, ...lower, ...upper, -1, -1, -1];
  return { x, y, z, kind: 5, type, f, length: 2 };
}
