// The game's level file: a project's bytes, and a project out of any file the game loads.
import { SIDE, cellKey } from "./state.js";
import { FACE_NORMAL } from "./faces.js";

export const FORMAT = "kula-world-level";
export const VERSION = 1;
export const WORLDS = [
  "HIRO",
  "HILLS",
  "INCA",
  "ARCTIC",
  "COWBOY",
  "FIELD",
  "ATLANT",
  "HAZE",
  "MARS",
  "HELL",
];
export const WORLD_SLOTS = 20;
export const FINAL_SLOTS = 2;

export const CELLS = SIDE ** 3;
export const GRID_BYTES = CELLS * 2;
export const HEAD = 6;
export const RECORD = 256;
export const WORDS = RECORD / 2;
export const SLOT = 16;
export const FACES = FACE_NORMAL.length;
const EMPTY = 0xffff;
export const FIRST_RECORD = 5;
export const BLOCK_KINDS = 5;
export const PLATFORM_KIND = 5;
export const CRUMBLING_KIND = 6;
export const VANISHING_KIND = 7;
export const LASER_KIND = 8;
export const SETTINGS_KIND = 9;
export const TRAILER_KIND = 666;
export const SPAN_KINDS = new Set([PLATFORM_KIND, LASER_KIND]);
const PAYLOAD_KINDS = new Set([PLATFORM_KIND, CRUMBLING_KIND, VANISHING_KIND, LASER_KIND]);
export const COLOURS = 4;
export const DEFAULT_TIME = 99;
export const TIME_MAX = 99;
export const DEFAULT_SPEED = 30;
export const DEFAULT_LENGTH = 2;
export const LENGTHS = [2, 3];
export const PHASES = 4;
export const DIM_AT_ONCE = [4, 5];
const FIXED = 512;
const PLATFORM_UNIT = 256;
export const OWN = 6;
export const NEXT_WORD = 6;
export const LINK_WORD = 7;
const AXIS_WORD = [1, 2, 5];

export const TELEPORTER = 5;
export const EXIT = 7;
export const SWITCH = 9;
export const MOVING_SPIKES = 11;
export const HIDDEN_EXIT = 26;
export const START_ON_CLOCK = 29;
export const START = 30;
export const KEY = 31;
export const STAR = 42;
export const FRUIT = [43, 44, 45, 46, 47];
export const CAPTIVATORS = [50, 51, 52, 53, 54, 55, 56];
export const STARTS = new Set([START, START_ON_CLOCK]);
// What the bonus artwork, drawn for a level with no key, has no picture for.
export const BONUS_UNDRAWN_KINDS = [1, 2, 4, PLATFORM_KIND];
export const BONUS_UNDRAWN_TYPES = [1, 2, 4, EXIT, 8, START_ON_CLOCK, ...FRUIT];
export const FACING_TYPES = new Set([TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52, 53, 56]);
export const FACING_NEEDED = new Set([TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52]);
export const VARIANTS = {
  [TELEPORTER]: COLOURS,
  [SWITCH]: COLOURS,
  11: PHASES,
  36: 3,
  37: 3,
  56: PHASES,
};
export const VARIANT_TYPES = new Set(Object.keys(VARIANTS).map(Number));
export const PICKUPS = [31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47];
const PICKUP_SET = new Set(PICKUPS);
const CAPTIVATOR_SET = new Set(CAPTIVATORS);
export const PLAIN_ONLY = new Set([TELEPORTER, EXIT, SWITCH, MOVING_SPIKES]);
export const LIGHTS = new Set([TELEPORTER, EXIT, SWITCH]);
export const NUMBERED = new Set([5, 7, 9, 10, 11, 12, 26, 28, ...PICKUPS]);
export const PLAYED = new Set([
  1,
  2,
  4,
  5,
  7,
  8,
  9,
  10,
  11,
  12,
  26,
  28,
  29,
  30,
  50,
  51,
  52,
  53,
  56,
  ...PICKUPS,
]);
export const STATE_ON = 1;
export const STATE_OFF = 2;
const STATE = new Map([
  ...[10, 11, 12, 28, ...PICKUPS].map((t) => [t, STATE_ON]),
  [EXIT, STATE_OFF],
  [HIDDEN_EXIT, STATE_OFF],
]);
const TRIO = new Map([
  [TELEPORTER, [256, 1, 30]],
  [EXIT, [500, 1, 30]],
  [HIDDEN_EXIT, [500, 1, 30]],
  [10, [256, 3, 0]],
  [START_ON_CLOCK, [386, 1, -100]],
  [36, [386, 1, -17]],
  [STAR, [416, 0, 100]],
  ...[8, SWITCH, 11, 12, 28, START].map((t) => [t, [256, 0, 0]]),
  ...[KEY, 37, 38].map((t) => [t, [386, 1, -100]]),
  ...[32, 33, 34, 35].map((t) => [t, [386, 2, 100]]),
  ...FRUIT.map((t) => [t, [386, 1, 100]]),
]);
const NO_TRIO = [-1, -1, -1];
const BARE = [-1, 0, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1];
const UNSET = Array(SLOT).fill(-1);
const NEVER_SET = WORDS - SLOT * FACES - 3;
const SETTINGS_CELL = [0, 0, 0];

export const CAPS = {
  records: 123,
  faces: 768,
  blocks: 256,
  objects: 255,
  platforms: 8,
  vanishing: 64,
  crumbling: 64,
  captivators: 32,
  lights: 32,
  spikes: 64,
};
/** The longest run the ride's grid holds a platform of. */
export const LENGTH_CAP = 7;
/** A counter's name as a visitor reads it. */
export const COUNTER_WORDS = {
  records: "records",
  cells: "cells",
  faces: "faces",
  blocks: "blocks",
  objects: "objects the loader numbers",
  platforms: "platforms",
  lasers: "lasers",
  vanishing: "vanishing blocks",
  crumbling: "crumbling blocks",
  captivators: "captivators",
  keys: "keys",
  lights: "devices that cast a light",
  spikes: "moving spikes",
};

export const DISC_MAX = {
  records: 75,
  cells: 178,
  faces: 766,
  blocks: 178,
  objects: 81,
  platforms: 4,
  lasers: 12,
  vanishing: 14,
  crumbling: 33,
  captivators: 12,
  keys: 4,
  lights: 19,
  spikes: 19,
};
export const COUNTED_KINDS = new Set([0, 1, 2, 4, CRUMBLING_KIND, VANISHING_KIND]);

export const onLattice = (v) => Number.isInteger(v) && v >= 0 && v < SIDE;
export const inner = (v) => Number.isInteger(v) && v >= 1 && v <= SIDE - 2;
export const inWord = (v) => Number.isInteger(v) && v >= -(2 ** 15) && v < 2 ** 15;
export const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
export const compareCells = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
export const byCell = (a, b) => compareCells(a.cell, b.cell);
export const cellText = (c) => (Array.isArray(c) ? c.join(",") : String(c));
export const isCell = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isInteger);
export const levelKey = (pack, index) => `${pack}#${index}`;

/** The game's direction from a to b where they differ on one axis, else null. */
export function direction(a, b) {
  const axes = [0, 1, 2].filter((i) => a[i] !== b[i]);
  if (axes.length !== 1) return null;
  const step = [0, 0, 0];
  step[axes[0]] = b[axes[0]] > a[axes[0]] ? 1 : -1;
  return FACE_NORMAL.findIndex((n) => sameCell(n, step));
}

export function spanAxis(a, b) {
  const d = direction(a, b);
  return d === null ? null : FACE_NORMAL[d].findIndex((v) => v !== 0);
}

const FACE_KEY = /^-?\d+$/;
const standing = (o) =>
  o !== null && typeof o === "object" && typeof o.type === "number" && o.type > 0;

/** The entries of a block's faces with something standing on them, on a kind
    that carries any. */
const occupied = (b) =>
  b.kind >= BLOCK_KINDS || !b.faces ? [] : Object.entries(b.faces).filter(([, o]) => standing(o));

/** What stands on a block's faces, as [face, object] pairs in face order, on a
    kind that carries any. */
export function facesOf(b) {
  return occupied(b)
    .filter(([f]) => FACE_KEY.test(f))
    .map(([f, o]) => [Number(f), o])
    .sort((p, q) => p[0] - q[0]);
}

/** The keys of a block's faces that name no face by number, with something standing on them. */
export const strayFaceKeys = (b) =>
  occupied(b)
    .filter(([f]) => !FACE_KEY.test(f))
    .map(([f]) => f);

/** The face two keys of a block's faces spell between them, or null. */
export function faceNamedTwice(b) {
  const faces = facesOf(b);
  const again = faces.find(([f], i) => i > 0 && faces[i - 1][0] === f);
  return again ? again[0] : null;
}

/** Whether a block needs a record: a span, a payload kind, or something on a face. */
export const carries = (b) => b.kind >= BLOCK_KINDS || facesOf(b).length > 0;

// --- a project out of a level ------------------------------------------------

const KEEP = 3;
const shapeOf = (line) => line.replace(/-?\d+/g, "#");

/** A report with lines of one shape, the same words with other numbers, kept to
    the first few and the rest counted in one line after them. */
export function collapse(lines) {
  const shapes = lines.map(shapeOf);
  const total = new Map();
  for (const s of shapes) total.set(s, (total.get(s) ?? 0) + 1);
  const seen = new Map();
  const out = [];
  lines.forEach((line, i) => {
    const n = (seen.get(shapes[i]) ?? 0) + 1;
    seen.set(shapes[i], n);
    if (n <= KEEP) out.push(line);
    const rest = total.get(shapes[i]) - KEEP;
    if (n === KEEP && rest > 0)
      out.push(`${rest} more line${rest === 1 ? "" : "s"} like the one above`);
  });
  return out;
}

/** The line both readers give a facing of 0 on a type that needs one: the game heads as 1. */
export const HEADS_AS_ONE = "which the game heads as 1; it is 1";

function faceOf(o, cell, report) {
  const out = { type: o.type };
  if (FACING_TYPES.has(o.type) && o.f[0] !== 0) out.facing = o.f[0];
  else if (FACING_NEEDED.has(o.type)) {
    report.push(
      `type ${o.type} on face ${o.face} of the block at ${cellText(cell)} has a facing of 0, ${HEADS_AS_ONE}`,
    );
    out.facing = 1;
  }
  if (VARIANT_TYPES.has(o.type)) out.variant = o.f[1];
  return out;
}

function farOf(r, cell) {
  const a = r.f.slice(2, 5);
  const b = r.f.slice(5, 8);
  return sameCell(a, cell) ? b : a;
}

/** The project a level of the map's shape means; `report` takes a line for
    each thing the project leaves behind. */
export function projectOf(level, report = []) {
  const { records, cells } = level;
  const blocks = [];
  let folded = 0;
  for (let i = 0; i < cells.length; i += 4) {
    const cell = cells.slice(i, i + 3);
    const v = cells[i + 3];
    if (v < FIRST_RECORD) {
      blocks.push({ cell, kind: v });
      continue;
    }
    const r = records[v - FIRST_RECORD];
    const b = { cell, kind: r.kind };
    if (r.kind < BLOCK_KINDS) {
      const faces = {};
      for (const o of [...r.on].sort((p, q) => p.face - q.face))
        faces[String(o.face)] = faceOf(o, cell, report);
      if (r.on.length) b.faces = faces;
      else folded++;
    } else if (r.kind === PLATFORM_KIND) {
      b.far = farOf(r, cell);
      b.length = r.length;
      b.speed = r.speed ?? DEFAULT_SPEED;
    } else if (r.kind === LASER_KIND) {
      b.far = farOf(r, cell);
      b.colour = r.colour;
    } else if (r.kind === VANISHING_KIND) {
      b.phase = r.f[0];
    }
    blocks.push(b);
  }
  if (folded) report.push(`folded ${folded} records carrying nothing into plain blocks`);

  let hidden = false;
  let flip = false;
  for (const r of records) {
    if (r.kind !== SETTINGS_KIND) continue;
    hidden ||= r.type === 1;
    flip ||= r.f[0] === 1;
  }

  const states = new Map();
  const disagree = new Set();
  for (const r of records) {
    let found;
    if (r.kind === LASER_KIND) found = [[r.colour, r.f[1] === 1 ? STATE_ON : STATE_OFF]];
    else if (r.kind < BLOCK_KINDS)
      found = r.on
        .filter((o) => o.type === TELEPORTER || o.type === SWITCH)
        .map((o) => [o.f[1], o.f[2] === STATE_OFF ? STATE_OFF : STATE_ON]);
    else continue;
    for (const [colour, state] of found) {
      if (!states.has(colour)) states.set(colour, state);
      else if (states.get(colour) !== state) disagree.add(colour);
    }
  }
  for (const colour of [...disagree].sort((a, b) => a - b))
    report.push(
      `colour ${colour} starts on for some of its devices and off for others; the first decides`,
    );

  const project = {
    format: FORMAT,
    version: VERSION,
    title: level.shown || level.name || "",
    author: "",
    notes: "",
    world: level.theme,
  };
  if ("pack" in level) project.from = levelKey(level.pack, level.index);
  const circuits = {};
  for (const c of [...states.keys()].sort((a, b) => a - b))
    if (states.get(c) === STATE_OFF) circuits[String(c)] = "off";
  return Object.assign(project, {
    time: level.time,
    hidden,
    invisibleFromAfar: flip,
    circuits,
    blocks: blocks.sort(byCell),
  });
}

// --- the game's bytes out of a project ----------------------------------------

const linkOf = ([k, face]) => k * 16 + face;

function members(carried) {
  const out = Array.from({ length: COLOURS }, () => []);
  carried.forEach((b, k) => {
    const found =
      b.kind === LASER_KIND
        ? [[b.colour, OWN]]
        : facesOf(b)
            .filter(([, o]) => o.type === TELEPORTER || o.type === SWITCH)
            .map(([j, o]) => [o.variant ?? 0, j]);
    for (const [colour, face] of found) {
      if (!Number.isInteger(colour) || colour < 0 || colour >= COLOURS)
        throw new Error(`colour ${colour} is not one of the four`);
      out[colour].push([k, face]);
    }
  });
  return out;
}

const typeAt = (carried, [k, face]) =>
  face === OWN ? LASER_KIND : facesOf(carried[k]).find(([j]) => j === face)[1].type;

/** record * 16 + face -> [next, link] for every switch, teleporter and laser. */
function links(carried) {
  const out = new Map();
  for (const M of members(carried)) {
    M.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    M.forEach((m, i) => out.set(linkOf(m), [i === 0 ? -1 : linkOf(M[i - 1]), -1]));
    if (!M.length) continue;
    const last = linkOf(M[M.length - 1]);
    const T = M.filter((m) => typeAt(carried, m) === TELEPORTER);
    T.forEach((t, i) => {
      out.get(linkOf(t))[1] = linkOf(T[(i + T.length - 1) % T.length]);
    });
    for (const m of M) if (typeAt(carried, m) === SWITCH) out.get(linkOf(m))[1] = last;
  }
  return out;
}

/** record * 16 + face -> the pickup's number, in record then face order. */
function numbers(carried) {
  const out = new Map();
  let n = 0;
  carried.forEach((b, k) => {
    for (const [j, o] of facesOf(b)) if (PICKUP_SET.has(o.type)) out.set(k * 16 + j, n++);
  });
  return out;
}

function objectSlot(kindWord, o, state, number, [next, link]) {
  const t = o.type;
  const facing = FACING_TYPES.has(t) ? (o.facing ?? 0) : 0;
  const variant = VARIANT_TYPES.has(t) ? (o.variant ?? 0) : 0;
  const [f9, f10, f14] = TRIO.get(t) ?? NO_TRIO;
  return [kindWord, t, facing, variant, state, number, next, link, 0, f9, f10, -1, -1, -1, f14, -1];
}

function spanWords(cell, far) {
  const d = direction(cell, far);
  if (d === null)
    throw new Error(`the span from ${cellText(cell)} to ${cellText(far)} runs along no one axis`);
  const [lower, upper] = compareCells(cell, far) < 0 ? [cell, far] : [far, cell];
  return { d, axis: AXIS_WORD[spanAxis(cell, far)], lower, upper };
}

const fill = (n) => Array(n).fill(-1);

function recordWords(b, k, states, linkTable, numberTable) {
  const { cell, kind } = b;
  const slots = Array.from({ length: FACES }, () => [...(kind < BLOCK_KINDS ? BARE : UNSET)]);
  slots[0][0] = kind;
  const extras = fill(NEVER_SET);
  if (kind < BLOCK_KINDS) {
    for (const [j, o] of facesOf(b)) {
      const t = o.type;
      const state = t === TELEPORTER || t === SWITCH ? states[o.variant ?? 0] : (STATE.get(t) ?? 0);
      slots[j] = objectSlot(
        j === 0 ? kind : -1,
        o,
        state,
        numberTable.get(k * 16 + j) ?? -1,
        linkTable.get(k * 16 + j) ?? [-1, -1],
      );
    }
  } else if (kind === PLATFORM_KIND) {
    const { d, axis, lower, upper } = spanWords(cell, b.far);
    slots[0] = [kind, d, axis, 1, ...lower, ...upper, ...fill(6)];
    slots[1] = [
      sameCell(cell, lower) ? 0 : 1,
      b.length ?? DEFAULT_LENGTH,
      b.speed ?? DEFAULT_SPEED,
      -1,
      FIRST_RECORD + k,
      ...fill(11),
    ];
    extras.splice(
      -6,
      6,
      ...cell.map((c) => FIXED * c),
      PLATFORM_UNIT,
      PLATFORM_UNIT,
      PLATFORM_UNIT,
    );
  } else if (kind === CRUMBLING_KIND) {
    slots[0] = [kind, 1, ...cell.map((c) => FIXED * c), ...fill(11)];
  } else if (kind === VANISHING_KIND) {
    slots[0] = [kind, 0, b.phase ?? 0, ...fill(13)];
  } else if (kind === LASER_KIND) {
    const { d, axis, lower, upper } = spanWords(cell, b.far);
    const lit = states[b.colour] === STATE_ON ? 1 : 0;
    slots[0] = [kind, d, axis, lit, ...lower, ...upper, ...fill(6)];
    const next = linkTable.get(k * 16 + OWN)[0];
    slots[1] = [-1, 1, -1, -1, FIRST_RECORD + k, -1, b.colour, next, ...fill(8)];
  }
  const words = [...slots.flat(), ...extras, ...cell];
  if (!words.every(inWord))
    throw new Error(`a word of the block at ${cellText(cell)} is outside the file's range`);
  return words;
}

function settingsWords(project) {
  const words = Array(WORDS).fill(0);
  words[0] = SETTINGS_KIND;
  words[1] = project.hidden ? 1 : 0;
  words[2] = project.invisibleFromAfar ? 1 : 0;
  return words;
}

/** Where the game puts the ball: the last start it meets, else nowhere. */
export function startCell(carried) {
  let found = SETTINGS_CELL;
  for (const b of carried) if (facesOf(b).some(([, o]) => STARTS.has(o.type))) found = b.cell;
  return found;
}

function trailerWords(project, carried) {
  const words = fill(WORDS);
  words[0] = TRAILER_KIND;
  words.splice(1, 3, ...startCell(carried));
  words[4] = 0;
  words[5] = 0;
  words[6] = project.time ?? DEFAULT_TIME;
  if (!inWord(words[6])) throw new Error(`a time of ${words[6]} is outside the file's range`);
  return words;
}

/** The level file the project means, byte for byte; throws where the bytes are undefined. */
export function writeKwl(project) {
  const blocks = [...project.blocks].sort(byCell);
  const seen = new Set();
  for (const b of blocks) {
    const { cell, kind } = b;
    if (!isCell(cell) || !cell.every(onLattice))
      throw new Error(`cell ${cellText(cell)} is outside the lattice`);
    if (seen.has(cellKey(...cell))) throw new Error(`two blocks on cell ${cellText(cell)}`);
    seen.add(cellKey(...cell));
    if (!Number.isInteger(kind) || kind < 0 || kind >= SETTINGS_KIND)
      throw new Error(`kind ${kind} is not a kind of block`);
    for (const key of strayFaceKeys(b))
      throw new Error(`face ${JSON.stringify(key)} is not one of the six`);
    for (const [j] of facesOf(b))
      if (j < 0 || j >= FACES) throw new Error(`face ${j} is not one of the six`);
    const twice = faceNamedTwice(b);
    if (twice !== null)
      throw new Error(`face ${twice} of the block at ${cellText(cell)} is named twice`);
    if (SPAN_KINDS.has(kind)) {
      if (!isCell(b.far)) throw new Error(`the span at ${cellText(cell)} needs a far end`);
      if (!b.far.every(onLattice))
        throw new Error(
          `the far end ${cellText(b.far)} of the span at ${cellText(cell)} is outside the lattice`,
        );
    }
  }
  const carried = blocks.filter(carries);
  const at = new Map(carried.map((b, k) => [cellKey(...b.cell), k]));
  const circuits = project.circuits ?? {};
  const states = Array.from({ length: COLOURS }, (_, c) =>
    circuits[String(c)] === "off" ? STATE_OFF : STATE_ON,
  );
  const linkTable = links(carried);
  const numberTable = numbers(carried);
  const settings = !!(project.hidden || project.invisibleFromAfar);
  const count = carried.length + (settings ? 1 : 0);

  const out = new Uint8Array(GRID_BYTES + HEAD + RECORD * (count + 1));
  const view = new DataView(out.buffer);
  for (let i = 0; i < CELLS; i++) view.setUint16(2 * i, EMPTY, true);
  for (const b of blocks) {
    const key = cellKey(...b.cell);
    view.setUint16(2 * key, at.has(key) ? FIRST_RECORD + at.get(key) : b.kind, true);
  }
  view.setInt32(GRID_BYTES, blocks.length, true);
  view.setUint16(GRID_BYTES + 4, count, true);
  let offset = GRID_BYTES + HEAD;
  const put = (words) => {
    words.forEach((w, i) => view.setInt16(offset + 2 * i, w, true));
    offset += RECORD;
  };
  carried.forEach((b, k) => put(recordWords(b, k, states, linkTable, numberTable)));
  if (settings) put(settingsWords(project));
  put(trailerWords(project, carried));
  return out;
}

// --- a level, and a project, out of the game's bytes --------------------------

const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function recordAt(view, offset) {
  const words = Array.from({ length: WORDS }, (_, i) => view.getInt16(offset + 2 * i, true));
  return {
    kind: words[0],
    slots: Array.from({ length: FACES }, (_, j) => words.slice(SLOT * j, SLOT * (j + 1))),
    cell: words.slice(WORDS - 3),
  };
}

const fieldsOf = (slot) => slot.slice(2, 13);
const typeOf = (r) => r.slots[0][1];
const fOf = (r) => fieldsOf(r.slots[0]);
const spanOf = (r) => [fOf(r).slice(2, 5), fOf(r).slice(5, 8)];
const objectsOf = (r) =>
  r.kind >= BLOCK_KINDS
    ? []
    : r.slots.flatMap((s, j) =>
        s[1] > 0 ? [{ face: j, type: s[1], f: fieldsOf(s), v: s[14] }] : [],
      );

function recordDict(r) {
  const d = { x: r.cell[0], y: r.cell[1], z: r.cell[2], kind: r.kind };
  if (PAYLOAD_KINDS.has(r.kind) || r.kind === SETTINGS_KIND) {
    d.type = typeOf(r);
    d.f = fOf(r);
  }
  if (r.kind === LASER_KIND) d.colour = r.slots[1][6];
  if (r.kind === PLATFORM_KIND) {
    d.length = r.slots[1][1];
    d.speed = r.slots[1][2];
  }
  d.on = objectsOf(r);
  return d;
}

function cellsOf(view, keep) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    const v = view.getUint16(2 * i, true);
    if (v === EMPTY) continue;
    const cell = [Math.floor(i / (SIDE * SIDE)), Math.floor(i / SIDE) % SIDE, i % SIDE];
    const kept = keep(cell, v);
    if (kept !== null) cells.push(...cell, kept);
  }
  return cells;
}

function extent(cells) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cells.length; i += 4)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], cells[i + a]);
      max[a] = Math.max(max[a], cells[i + a]);
    }
  return cells.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

const META = ["name", "shown", "theme", "pack", "index", "draft"];

/** The level of the map's shape the bytes mean, with `meta`'s keys laid over it. */
export function levelOf(bytes, meta = {}) {
  if (bytes.length < GRID_BYTES + HEAD)
    throw new Error(`${bytes.length} bytes is too short for a level`);
  const view = viewOf(bytes);
  const header = view.getInt32(GRID_BYTES, true);
  const count = view.getUint16(GRID_BYTES + 4, true);
  const expect = GRID_BYTES + HEAD + RECORD * (1 + count);
  if (bytes.length !== expect) throw new Error(`${bytes.length} bytes, expected ${expect}`);
  const cells = cellsOf(view, (_, v) => v);
  const records = Array.from({ length: count }, (_, k) =>
    recordDict(recordAt(view, GRID_BYTES + HEAD + RECORD * k)),
  );
  const trailer = recordAt(view, GRID_BYTES + HEAD + RECORD * count);
  const out = { name: "", theme: "" };
  for (const key of META) if (meta[key] !== undefined) out[key] = meta[key];
  return Object.assign(out, {
    placed: cells.length / 4,
    header,
    ...extent(cells),
    cells,
    records,
    time: trailer.kind === TRAILER_KIND ? fOf(trailer)[4] : DEFAULT_TIME,
  });
}

function levelDict(cells, records, time, world, name, report) {
  let unplayed = 0;
  const out = records.map((r) => {
    if (r.kind >= BLOCK_KINDS) {
      const first = SPAN_KINDS.has(r.kind) ? 2 : 1;
      unplayed += r.slots.slice(first).filter((s) => s[1] > 0).length;
    }
    return recordDict(r);
  });
  if (unplayed)
    report.push(`left out ${unplayed} objects standing on records the game never walks`);
  return { name, theme: world, cells, records: out, time };
}

/** A level's wiring in play: the slots each switch's list reaches and where each
    teleporter leads, as the cells and faces they name, in one order, so two levels
    wired alike compare equal whatever their record order. `devices` says which of
    `records` to read the switches and teleporters from. */
function wiring(records, devices = records) {
  const target = (at) =>
    at[0] < records.length ? `${cellText(records[at[0]].cell)}/${at[1]}` : "past";
  const list = (word) => {
    const seen = [];
    let at = linkTarget(word);
    while (at !== null && at[0] < records.length && at[1] <= OWN && !seen.includes(target(at))) {
      seen.push(target(at));
      const r = records[at[0]];
      at = linkTarget(at[1] === OWN ? r.slots[1][LINK_WORD] : r.slots[at[1]][NEXT_WORD]);
    }
    return seen.sort().join(" ");
  };
  const out = [];
  for (const r of devices) {
    if (r.kind >= BLOCK_KINDS) continue;
    r.slots.forEach((s, j) => {
      if (s[1] === SWITCH) out.push(`${cellText(r.cell)}/${j} flips ${list(s[LINK_WORD])}`);
      else if (s[1] === TELEPORTER) {
        const at = linkTarget(s[LINK_WORD]);
        out.push(`${cellText(r.cell)}/${j} leads to ${at === null ? "none" : target(at)}`);
      }
    });
  }
  return out.sort();
}

/** The line both readers add where a level's own wiring is not what the colour rule writes. */
export const REWIRED =
  "the level's switches, teleporters and lasers are wired otherwise than the colour rule wires them; the level written back follows the colours";

/** { project, report } for any file the game would load; only a length that is not a level's throws. */
export function readKwl(bytes, world = WORLDS[0]) {
  const report = [];
  const body = bytes.length - GRID_BYTES - HEAD;
  if (body < 0 || body % RECORD)
    throw new Error(
      `${bytes.length} bytes is not a level: the lattice, six bytes and whole ${RECORD}-byte stretches`,
    );
  const view = viewOf(bytes);
  const records = Array.from({ length: body / RECORD }, (_, k) =>
    recordAt(view, GRID_BYTES + HEAD + RECORD * k),
  );
  const count = view.getUint16(GRID_BYTES + 4, true);
  let time = DEFAULT_TIME;
  if (records.length && records[records.length - 1].kind === TRAILER_KIND)
    time = fOf(records.pop())[4];
  else report.push(`no trailer, so the time is ${DEFAULT_TIME}`);
  if (count !== records.length)
    report.push(`the header counts ${count} records and the file holds ${records.length}`);

  const named = new Map();
  const cells = cellsOf(view, (cell, v) => {
    if (v < FIRST_RECORD) return v;
    const k = v - FIRST_RECORD;
    const r = records[k];
    if (!r || r.kind < 0 || r.kind >= SETTINGS_KIND) {
      report.push(
        `cell ${cellText(cell)} names record ${k}, which is not a block; the cell is left empty`,
      );
      return null;
    }
    if (named.has(k)) {
      report.push(
        `cell ${cellText(cell)} names record ${k}, which cell ${cellText(named.get(k))} already names; the cell is left empty`,
      );
      return null;
    }
    named.set(k, cell);
    if (!sameCell(r.cell, cell)) {
      report.push(
        `record ${k} says it stands at ${cellText(r.cell)}; the lattice puts it at ${cellText(cell)}`,
      );
      r.cell = cell;
    }
    return v;
  });

  let kept = [];
  const settings = [];
  records.forEach((r, k) => {
    if (r.kind === SETTINGS_KIND) settings.push(k);
    else if (named.has(k)) kept.push(k);
    else
      report.push(
        `record ${k} of kind ${r.kind} at ${cellText(r.cell)} is named by no cell; it is dropped`,
      );
  });
  if (settings.length > 1)
    report.push(`${settings.length} settings records; the flags of all of them are taken`);

  const dropped = new Set();
  for (const k of kept) {
    const r = records[k];
    if (SPAN_KINDS.has(r.kind)) {
      let [a, b] = spanOf(r).sort(compareCells);
      if (!sameCell(r.cell, a) && !sameCell(r.cell, b)) {
        report.push(
          `record ${k} spans ${cellText(a)} to ${cellText(b)} and stands at ${cellText(r.cell)}; its lower end is now its cell`,
        );
        a = r.cell;
      }
      const far = sameCell(a, r.cell) ? b : a;
      if (sameCell(far, r.cell)) {
        report.push(
          `record ${k} spans nothing: both of its ends are its own cell ${cellText(r.cell)}; it is dropped and its cell left empty`,
        );
        dropped.add(k);
        continue;
      }
      if (!far.every(onLattice)) {
        report.push(
          `record ${k} spans to ${cellText(far)}, outside the lattice; it is dropped and its cell left empty`,
        );
        dropped.add(k);
        continue;
      }
      r.slots[0].splice(4, 6, ...a, ...b);
    }
    if (r.kind === PLATFORM_KIND) {
      const [, length, speed] = r.slots[1];
      if (!LENGTHS.includes(length))
        report.push(`the platform at ${cellText(r.cell)} is ${length} blocks long`);
      if (speed !== DEFAULT_SPEED)
        report.push(`the platform at ${cellText(r.cell)} runs at ${speed}`);
    }
    if (r.kind === VANISHING_KIND && DIM_AT_ONCE.includes(fOf(r)[0]))
      report.push(
        `the vanishing block at ${cellText(r.cell)} has phase ${fOf(r)[0]}, which dims at once`,
      );
  }

  if (dropped.size) {
    kept = kept.filter((k) => !dropped.has(k));
    for (let i = cells.length - 4; i >= 0; i -= 4)
      if (cells[i + 3] >= FIRST_RECORD && dropped.has(cells[i + 3] - FIRST_RECORD))
        cells.splice(i, 4);
  }
  const order = kept.map((k) => records[k].cell);
  if (order.some((c, i) => i > 0 && compareCells(order[i - 1], c) > 0)) {
    const objects = kept.flatMap((k) => objectsOf(records[k]));
    const starts = objects.filter((o) => STARTS.has(o.type)).length;
    if (starts > 1 || objects.some((o) => CAPTIVATOR_SET.has(o.type)))
      report.push(
        "the records are not in lattice order, which the file written back will be; the start the game takes and the captivators' order may change",
      );
  }

  const renumber = new Map(kept.map((k, n) => [k, n]));
  for (let i = 3; i < cells.length; i += 4)
    if (cells[i] >= FIRST_RECORD) cells[i] = FIRST_RECORD + renumber.get(cells[i] - FIRST_RECORD);
  const level = levelDict(
    cells,
    [...kept, ...settings].map((k) => records[k]),
    time,
    world,
    "",
    report,
  );
  const project = projectOf(level, report);
  let rebuilt = null;
  try {
    rebuilt = writeKwl(project);
  } catch {
    rebuilt = null;
  }
  if (rebuilt) {
    const view = viewOf(rebuilt);
    const again = Array.from({ length: view.getUint16(GRID_BYTES + 4, true) }, (_, k) =>
      recordAt(view, GRID_BYTES + HEAD + RECORD * k),
    );
    const theirs = wiring(
      records,
      kept.map((k) => records[k]),
    );
    if (theirs.join("\n") !== wiring(again).join("\n")) report.push(REWIRED);
  }
  return { project, report: collapse(report) };
}

/** A link word as the record and face it names, or null for none. */
export const linkTarget = (word) => (word === -1 ? null : [(word & 0xffff) >> 4, word & 15]);
