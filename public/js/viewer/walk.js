// The ball's moves over the lattice, station to station, and the course they make.
import { SIDE, cellKey, FACE_NORMAL } from "../format/lattice.js";
import { heading } from "./travel.js";
import { platformCells } from "./data.js";

const LOW = 1;
const HIGH = SIDE - 2;
const CELLS = SIDE * SIDE * SIDE;
const PLATFORM_KIND = 5;
const ROLL_ON = 0;
const INNER_CORNER = 1;
const OUTER_EDGE = 2;
export const JUMP = 3;
const LEAP = 12;
const STOP = 13;
const FLIGHT = 14;
const PAD = 15;
const LIFT = 0.02;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export const LETTER = "r";
export const CAP = 400;

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const neg = (v) => v.map((x) => -x || 0);
const same = (a, b) => a.every((v, i) => v === b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const size = (v) => v.reduce((sum, c) => sum + Math.abs(c), 0);
const inside = (cell) => cell.every((c) => c >= 0 && c < SIDE);

export const tangent = (face, k) => heading(face, k + 1).d;
export const faceOf = (normal) => FACE_NORMAL.findIndex((n) => same(n, normal));
export const headingOn = (face, d) =>
  d ? ([0, 1, 2, 3].find((k) => same(tangent(face, k), d)) ?? null) : null;

export function probeOf(idx) {
  const bodies = new Set();
  for (const records of idx.records.values())
    for (const r of records)
      if (r.kind === PLATFORM_KIND) for (const c of platformCells(r)) bodies.add(cellKey(...c));
  const solid = (cell) => {
    if (!cell.every((v) => v >= LOW && v <= HIGH)) return false;
    const key = cellKey(...cell);
    return idx.cells.has(key) || bodies.has(key);
  };
  return { solid, standable: (cell, face) => solid(cell) && !solid(add(cell, FACE_NORMAL[face])) };
}

// The side rule: no roll off a missing floor while a block stands beside the one left.
export function outcomeAt(probe, { cell, face }, k) {
  const t = tangent(face, k);
  const s = tangent(face, (k + 1) % 4);
  const ahead = add(cell, t);
  const floor = probe.solid(ahead);
  if (!floor && (probe.solid(add(cell, s)) || probe.solid(add(cell, neg(s))))) return null;
  if (probe.solid(add(ahead, FACE_NORMAL[face]))) return INNER_CORNER;
  if (floor) return ROLL_ON;
  return OUTER_EDGE;
}

/** How far a jump along `k` falls past the block two on, 0 landing there, null landing nowhere. */
export function jumpAt(probe, { cell, face }, k) {
  const n = FACE_NORMAL[face];
  const t = tangent(face, k);
  const over = add(cell, n);
  const high = add(over, n);
  const path = [add(over, t), add(over, t, 2), high, add(high, t), add(high, t, 2)];
  if (path.some((c) => probe.solid(c))) return null;
  for (let d = 0, landing = add(cell, t, 2); inside(landing); d++, landing = add(landing, n, -1))
    if (probe.solid(landing)) return d;
  return null;
}

export function step({ cell, face }, k, o, d = 0) {
  const t = tangent(face, k);
  if (o === ROLL_ON) return { cell: add(cell, t), face };
  if (o === JUMP) return { cell: add(add(cell, t, 2), FACE_NORMAL[face], -d), face };
  if (o === INNER_CORNER)
    return { cell: add(add(cell, t), FACE_NORMAL[face]), face: faceOf(neg(t)) };
  return { cell, face: faceOf(t) };
}

export function headingAfter(face, k, o) {
  if (o === ROLL_ON || o === JUMP) return k;
  const t = tangent(face, k);
  const n = FACE_NORMAL[face];
  return o === INNER_CORNER ? headingOn(faceOf(neg(t)), n) : headingOn(faceOf(t), neg(n));
}

/** The roll or the jump that joins station `a` to station `b`, or null where none does. */
export function stepBetween(a, b) {
  const n = FACE_NORMAL[a.face];
  const between = b.cell.map((v, i) => v - a.cell[i]);
  let t;
  let o;
  let d = 0;
  if (a.face === b.face) {
    d = dot(between, neg(n));
    const flat = add(between, n, d);
    if (size(between) === 1) [t, o] = [between, ROLL_ON];
    else if (d >= 0 && size(flat) === 2 && flat.some((v) => Math.abs(v) === 2))
      [t, o] = [flat.map((v) => v / 2 || 0), JUMP];
    else return null;
  } else if (!between.some((v) => v)) [t, o] = [FACE_NORMAL[b.face], OUTER_EDGE];
  else {
    t = add(between, n, -1);
    o = same(FACE_NORMAL[b.face], neg(t)) ? INNER_CORNER : null;
  }
  if (o === null || size(t) !== 1) return null;
  const k = headingOn(a.face, t);
  if (k === null) return null;
  return o === JUMP ? { k, o, d } : { k, o };
}

export const stationKey = ({ cell, face }) => cellKey(...cell) * 6 + face;
const stationId = (station, k) => stationKey(station) * 4 + k;
export const sameStation = (a, b) => same(a.cell, b.cell) && a.face === b.face;

function unwind(seen, id) {
  let node = seen.get(id);
  const walk = { steps: [], stations: [node.station], heading: node.k };
  while (node.from !== null) {
    const parent = seen.get(node.from);
    if (node.step) {
      walk.steps.push(node.step);
      walk.stations.push(parent.station);
    }
    node = parent;
  }
  walk.steps.reverse();
  walk.stations.reverse();
  return walk;
}

export function shortestWalk(probe, from, to, headings = [0, 1, 2, 3]) {
  const seen = new Map();
  const queue = [];
  const open = (station, k, parent, step) => {
    const id = stationId(station, k);
    if (seen.has(id)) return;
    seen.set(id, { station, k, from: parent, step });
    queue.push(id);
  };
  for (const k of headings) open(from, k, null, null);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const { station, k } = seen.get(id);
    if (sameStation(station, to)) return unwind(seen, id);
    open(station, (k + 1) % 4, id, null);
    open(station, (k + 3) % 4, id, null);
    const o = outcomeAt(probe, station, k);
    if (o !== null) open(step(station, k, o), headingAfter(station.face, k, o), id, { k, o });
  }
  return null;
}

/** Every station a walk from `from` reaches, by `stationKey`; the ball turns in place at any
    station, so the heading plays no part. */
export function reachable(probe, from) {
  const reached = new Map([[stationKey(from), from]]);
  for (const station of reached.values())
    for (let k = 0; k < 4; k++) {
      const o = outcomeAt(probe, station, k);
      if (o === null) continue;
      const next = step(station, k, o);
      if (!reached.has(stationKey(next))) reached.set(stationKey(next), next);
    }
  return reached;
}

// Five nibbles spell a station; then one a step, a jump spelling two more, a leap five more, a
// stop mark or a pad.
function nibblesOf({ stations, steps, marks }) {
  const out = [];
  const spell = ({ cell, face }) => {
    const index = cellKey(...cell);
    out.push((index >> 12) & 15, (index >> 8) & 15, (index >> 4) & 15, index & 15, face);
  };
  const n = Math.min(stations.length, CAP);
  spell(stations[0]);
  for (let i = 1; i < n; i++) {
    const step = steps[i - 1];
    if (!step) {
      out.push(LEAP);
      spell(stations[i]);
      continue;
    }
    if (step.o === JUMP) out.push(FLIGHT, (step.k << 2) | (step.d >> 4), step.d & 15);
    else out.push(step.k * 3 + step.o);
    if (i < n - 1 && marks.has(i)) out.push(STOP);
  }
  return out;
}

function toBase64url(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let j = 0; j < chars; j++) out += ALPHABET[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

function fromBase64url(text) {
  const out = [];
  let held = 0;
  let bits = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return null;
    held = (held << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((held >> bits) & 255);
      held &= (1 << bits) - 1;
    }
  }
  return out;
}

export function encode(course) {
  const nibbles = nibblesOf(course);
  if (nibbles.length & 1) nibbles.push(PAD);
  const bytes = [];
  for (let i = 0; i < nibbles.length; i += 2) bytes.push((nibbles[i] << 4) | nibbles[i + 1]);
  return LETTER + toBase64url(bytes);
}

export function decode(segment) {
  if (typeof segment !== "string" || segment[0] !== LETTER) return null;
  const bytes = fromBase64url(segment.slice(1));
  if (!bytes) return null;
  const nibbles = bytes.flatMap((b) => [b >> 4, b & 15]);
  const spelled = (i) => {
    if (i + 5 > nibbles.length) return null;
    const index =
      (nibbles[i] << 12) | (nibbles[i + 1] << 8) | (nibbles[i + 2] << 4) | nibbles[i + 3];
    const face = nibbles[i + 4];
    if (index >= CELLS || face >= FACE_NORMAL.length) return null;
    const cell = [Math.floor(index / (SIDE * SIDE)), Math.floor(index / SIDE) % SIDE, index % SIDE];
    return { cell, face };
  };
  const first = spelled(0);
  if (!first) return null;
  const course = { stations: [first], steps: [], marks: new Set([0]) };
  let i = 5;
  while (i < nibbles.length && course.stations.length < CAP) {
    const v = nibbles[i++];
    if (v < LEAP) {
      const k = Math.floor(v / 3);
      const o = v % 3;
      const next = step(course.stations.at(-1), k, o);
      if (!inside(next.cell)) break;
      course.steps.push({ k, o });
      course.stations.push(next);
    } else if (v === FLIGHT) {
      if (i + 2 > nibbles.length) break;
      const k = nibbles[i] >> 2;
      const d = ((nibbles[i] & 3) << 4) | nibbles[i + 1];
      const next = step(course.stations.at(-1), k, JUMP, d);
      if (!inside(next.cell)) break;
      i += 2;
      course.steps.push({ k, o: JUMP, d });
      course.stations.push(next);
    } else if (v === LEAP) {
      const target = spelled(i);
      if (!target) break;
      i += 5;
      course.steps.push(null);
      course.stations.push(target);
      course.marks.add(course.stations.length - 1);
    } else if (v === STOP) {
      course.marks.add(course.stations.length - 1);
    } else break;
  }
  course.marks.add(course.stations.length - 1);
  return course;
}

export function validate(probe, { stations, steps }) {
  const hollow = new Set();
  const broken = new Set();
  stations.forEach((s, i) => {
    if (!probe.standable(s.cell, s.face)) hollow.add(i);
  });
  steps.forEach((step, i) => {
    if (!step) return;
    const holds =
      step.o === JUMP
        ? jumpAt(probe, stations[i], step.k) === step.d
        : outcomeAt(probe, stations[i], step.k) === step.o;
    if (!holds) broken.add(i);
  });
  return { hollow, broken };
}

/** A station's face centre, lifted clear of the face as the ribbon lies. */
export const lifted = ({ cell, face }) =>
  cell.map((c, i) => c + 0.5 + FACE_NORMAL[face][i] * (0.5 + LIFT));

/** The half-pieces on each block by its key, the leaps and the jumps, which lie in the air. */
export function pieces({ stations, steps, marks }) {
  const byKey = new Map();
  const leaps = [];
  const jumps = [];
  const laid = new Set();
  const span = (p, q) => [...p, ...q].map((v) => v.toFixed(3)).join();
  const put = ({ cell, face }, from, to, chevron, i, stop) => {
    const key = cellKey(...cell);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ key, face, from, to, chevron, i, stop });
  };
  steps.forEach((step, i) => {
    const a = stations[i];
    const b = stations[i + 1];
    if (!step) {
      leaps.push({ from: lifted(a), to: lifted(b), i });
      return;
    }
    const n = FACE_NORMAL[a.face];
    if (step.o === JUMP) {
      jumps.push({ from: lifted(a), to: lifted(b), up: n, i });
      return;
    }
    const t = tangent(a.face, step.k);
    const m = FACE_NORMAL[b.face];
    const lift = same(n, m) ? n : add(n, m);
    const edge = a.cell.map((c, j) => c + 0.5 + 0.5 * n[j] + 0.5 * t[j] + LIFT * lift[j]);
    const out = lifted(a);
    const into = lifted(b);
    // a half laid back over one already laid carries no chevron against it
    put(a, out, edge, laid.has(span(edge, out)) ? null : t, i, false);
    put(b, edge, into, null, i, false);
    laid.add(span(out, edge));
    laid.add(span(edge, into));
  });
  for (const i of marks) {
    const s = stations[i];
    if (s) put(s, lifted(s), lifted(s), null, i, true);
  }
  return { byKey, leaps, jumps };
}
