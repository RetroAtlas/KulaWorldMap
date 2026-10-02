// The game's own rules for what travels across blocks, stepped frame by frame
// from the level's start in the game's units and unit vectors.
import { FACE_NORMAL } from "./faces.js";
import { OFF_LATTICE, beams, kindMotion, platformAxis } from "./data.js";
import { state, SIDE, cellKey } from "./state.js";
import { blockPhase } from "./motion.js";

const UNIT = 512;
const HALF = UNIT / 2;
const PROBE = 400;
const SLOW_STAR = 50;
const WHEEL = 51;
const FAST_STAR = 52;
const WANDERER = 53;
const GRID = 256;
const PLATFORM_KIND = 5;
const CRUMBLING_KIND = 6;
const VANISHING_KIND = 7;
const BEAM_KIND = 8;
const BETWEEN = -2;
// The types standing on a face that a captivator may still cross.
const CROSSABLE = new Set([30, 1, 2, 4]);
const CAPTIVATORS_FROM = 50;

// The two tangents the game lays on each face. A facing of 1 heads along the
// second, and each further value up to 4 turns a quarter about the normal, the
// side following the heading; any other heads as 1 does.
const TANGENTS = [
  [
    [-1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [0, 1, 0],
  ],
  [
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [1, 0, 0],
    [0, 1, 0],
  ],
];
const neg = (v) => v.map((x) => -x || 0);
export function heading(face, facing) {
  const [a, b] = TANGENTS[face];
  return [
    { d: b, s: a },
    { d: a, s: neg(b) },
    { d: neg(b), s: neg(a) },
    { d: neg(a), s: b },
  ][facing >= 2 && facing <= 4 ? facing - 1 : 0];
}

export function probe(l, lit = (ray) => ray.lit) {
  const { firstRecord: first, styles } = state.data;
  const cells = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    cells.set(cellKey(l.cells[i], l.cells[i + 1], l.cells[i + 2]), l.cells[i + 3]);
  }
  // Every frame the game empties the cells of every dark beam and then fills
  // those of every lit one, so where two cross a lit one fills the cell.
  const crossed = new Map();
  for (const ray of beams(l)) {
    const { a, b, axis } = ray;
    for (const end of [a, b]) if (!cells.has(cellKey(...end))) cells.set(cellKey(...end), 0);
    for (let t = Math.min(a[axis], b[axis]) + 1; t < Math.max(a[axis], b[axis]); t++) {
      const cell = [...a];
      cell[axis] = t;
      const k = cellKey(...cell);
      crossed.set(k, [...(crossed.get(k) ?? []), ray]);
    }
  }
  const vanishing = kindMotion(VANISHING_KIND);
  const value = ([x, y, z], frame) => {
    if ([x, y, z].some((c) => c < 1 || c > SIDE - 2)) return OFF_LATTICE;
    const rays = crossed.get(cellKey(x, y, z));
    if (rays) return rays.some(lit) ? BETWEEN : OFF_LATTICE;
    const v = cells.get(cellKey(x, y, z)) ?? OFF_LATTICE;
    if (v >= first && vanishing) {
      const r = l.records[v - first];
      if (r.kind === VANISHING_KIND && blockPhase(vanishing, r, frame).state === 0)
        return OFF_LATTICE;
    }
    return v;
  };
  return {
    value,
    free(cell, face, frame) {
      const v = value(cell, frame);
      if (v < 0) return false;
      if (v < styles) return true;
      const i = v - first;
      const r = l.records[i];
      if (r.kind === PLATFORM_KIND) return false;
      if (r.kind === CRUMBLING_KIND) return true;
      let type = r.on.find((o) => o.face === face)?.type ?? 0;
      // A laser and a vanishing block keep their own payload in their first
      // two slots, which the game reads as a face's object all the same.
      if (r.kind === BEAM_KIND && face === 0) type = r.type;
      if (r.kind === VANISHING_KIND && face === 0) type = v;
      if ((r.kind === BEAM_KIND || r.kind === VANISHING_KIND) && face === 1) return false;
      return type === 0 || type >= CAPTIVATORS_FROM || CROSSABLE.has(type);
    },
    empty: (cell, frame) => value(cell, frame) === OFF_LATTICE,
  };
}

const add = (p, v, k) => p.map((c, i) => c + v[i] * k);
const cellOf = (p) => p.map((c) => Math.floor((c + HALF) / UNIT));

/** How far into its cell a thing has come along its heading. */
function progress(w) {
  const i = w.d.findIndex((c) => c !== 0);
  const within = (w.pos[i] + HALF) & (UNIT - 1);
  return w.d[i] > 0 ? within : UNIT - within;
}

const block = (w) => cellOf(add(w.pos, w.n, -PROBE));
const beside = (w, p, way, frame) => p.free(add(block(w), way, 1), w.face, frame);
const ahead = (w, p, way, frame) => {
  const next = add(block(w), way, 1);
  return p.free(next, w.face, frame) && p.empty(add(next, w.n, 1), frame);
};
const travelled = (w) => Math.abs(w.pos.reduce((sum, v, i) => sum + v - w.home[i], 0));
const turnTo = (w, way) => {
  const d = w.d;
  if (way === w.s) {
    w.d = w.s;
    w.s = neg(d);
  } else {
    w.d = neg(w.s);
    w.s = d;
  }
};
const about = (w) => {
  w.d = neg(w.d);
  w.s = neg(w.s);
};

export function walker(m, c, l, table, frame = 0) {
  const w = {
    m,
    c,
    at: Math.floor(frame),
    type: m.face === null ? null : m.type,
    kind: m.face === null ? m.kind : null,
  };
  const home = [c.x, c.y, c.z].map((v) => v * UNIT);
  if (w.kind === PLATFORM_KIND) {
    const r = l.records.find(
      (r) => r.kind === PLATFORM_KIND && r.x === c.x && r.y === c.y && r.z === c.z,
    );
    const axis = platformAxis(r);
    const entry = table.kinds[String(PLATFORM_KIND)];
    Object.assign(w, {
      axis,
      length: r.length || 1,
      low: r.f[2 + axis] * UNIT,
      high: r.f[5 + axis] * UNIT,
      pos: [...home],
      dir: FACE_NORMAL[r.type],
      speed: entry.speed,
      wait: entry.dwell,
      dwell: 0,
    });
    return w;
  }
  const entry = table.types[String(m.type)];
  const n = FACE_NORMAL[m.face];
  Object.assign(w, heading(m.face, m.f[0]), {
    n,
    face: m.face,
    origin: add(home, n, table.standoff),
    entry,
    state: 0,
    timer: 0,
    theta: 0,
    roll: 0,
  });
  // where it stands at the start; the wandering ball moves its home on
  w.home = [...w.origin];
  w.pos = [...w.origin];
  w.first = w.d;
  w.turn = { from: w.d, way: null, part: 0 };
  if (m.type === WANDERER) Object.assign(w, { mode: 0, fresh: true });
  return w;
}

/** The offset is in blocks. Only the wheel turns its body with its way; a star
    tumbles the same whichever way it walks. */
export function place(w) {
  const from = w.kind === PLATFORM_KIND ? [w.c.x, w.c.y, w.c.z].map((v) => v * UNIT) : w.origin;
  const offset = w.pos.map((v, i) => (v - from[i]) / UNIT);
  if (w.kind === PLATFORM_KIND) return { offset };
  let fwd = w.first;
  if (w.type === WHEEL) {
    fwd = w.d;
    if (w.state) {
      const { from, way, part } = w.turn;
      const angle = part * (way ? Math.PI / 2 : Math.PI);
      const toward = way || neg(w.s);
      fwd = from.map((c, i) => c * Math.cos(angle) + toward[i] * Math.sin(angle));
    }
  }
  return { offset, fwd, roll: w.roll };
}

/** The cell under its middle first, then those under either half of it across
    its face. */
export function under(w, offset) {
  const n = FACE_NORMAL[w.face];
  const at = [w.c.x, w.c.y, w.c.z].map((v, i) => v + 0.5 + offset[i]);
  const cells = [at.map(Math.floor)];
  for (let axis = 0; axis < 3; axis++) {
    if (n[axis]) continue;
    for (const k of [-0.5, 0.5]) {
      const cell = at.map((v, i) => Math.floor(i === axis ? v + k : v));
      if (!cells.some((c) => c.every((v, i) => v === cell[i]))) cells.push(cell);
    }
  }
  return cells;
}

function stepStar(w, p, frame) {
  const e = w.entry;
  if (progress(w) < HALF && progress(w) + e.travel >= HALF) {
    if (beside(w, p, w.s, frame)) turnTo(w, w.s);
    else if (beside(w, p, neg(w.s), frame)) turnTo(w, neg(w.s));
    else if (!ahead(w, p, w.d, frame)) about(w);
  }
  w.pos = add(w.pos, w.d, e.travel);
}

function stepWheel(w, p, frame) {
  const e = w.entry;
  if (w.state === 0) {
    if (!ahead(w, p, w.d, frame) && progress(w) < HALF && progress(w) + e.travel >= HALF) {
      const way = beside(w, p, neg(w.s), frame) ? neg(w.s) : beside(w, p, w.s, frame) ? w.s : null;
      w.state = way ? 1 : 3;
      w.timer = 0;
      w.turn = { from: w.d, way, part: 0 };
    }
    if (w.state === 0) {
      w.pos = add(w.pos, w.d, e.travel);
      w.roll += e.roll;
    }
    return;
  }
  const been = w.timer;
  w.timer += 1;
  if (been < e.turning.frames) {
    w.turn.part = w.timer / e.turning.frames;
    return;
  }
  if (w.turn.way) turnTo(w, w.turn.way);
  else about(w);
  w.state = 0;
}

export function dice({ seed, times, plus }) {
  let state = seed;
  return (n) => {
    state = (Math.imul(state, times) + plus) >>> 0;
    return (n * (state & 0xffff)) >>> 16;
  };
}

// The wandering ball draws ways until one is open: the side, the other side,
// on or back. The game would draw for ever with every way shut, where the
// ball here stands.
function decide(w, p, frame, roll) {
  w.mode = 0;
  w.theta = 0;
  w.home = w.pos.map((v, i) => (w.d[i] ? (v + GRID / 2) & ~(GRID - 1) : v));
  w.pos = [...w.home];
  const open = [
    beside(w, p, w.s, frame),
    beside(w, p, neg(w.s), frame),
    ahead(w, p, w.d, frame),
    ahead(w, p, neg(w.d), frame),
  ];
  if (!open.includes(true)) {
    w.mode = -1;
    w.stuck = true;
    return;
  }
  let way;
  do way = roll(w.entry.ways);
  while (!open[way]);
  if (way === 0) turnTo(w, w.s);
  else if (way === 1) turnTo(w, neg(w.s));
  else if (way === 3) about(w);
  w.mode = 1;
}

function stepWanderer(w, p, frame, roll) {
  const e = w.entry;
  if (w.fresh || (w.mode === -1 && !w.stuck && travelled(w) >= e.settle)) decide(w, p, frame, roll);
  w.fresh = false;
  if (w.mode === -1) {
    if (!w.stuck) w.pos = add(w.pos, w.d, e.dash);
    return;
  }
  w.theta = (w.theta + Math.floor((w.mode * w.mode) / 8)) % 4096;
  const lurch =
    e.shake.reach - Math.round(e.shake.reach * Math.cos((w.theta / 4096) * Math.PI * 2));
  w.pos = add(w.home, w.d, lurch);
  w.mode += 1;
  if (w.mode >= e.shake.frames) {
    w.mode = -1;
    w.pos = [...w.home];
  }
}

function stepFastStar(w) {
  const e = w.entry;
  w.theta = (w.theta + e.sway.rate) % 4096;
  const sway = Math.round(e.sway.reach * Math.sin((w.theta / 4096) * Math.PI * 2));
  w.pos = add(w.origin, w.d, sway);
}

function stepPlatform(w) {
  if (w.dwell > 0) w.dwell -= 1;
  if (w.dwell > 0) return;
  w.pos = add(w.pos, w.dir, w.speed);
  const along = w.pos[w.axis];
  const forward = w.dir[w.axis] > 0;
  if (forward ? along < w.high : along > w.low) return;
  w.dir = neg(w.dir);
  w.dwell = w.wait;
}

/** One game frame at a time, every walker in the order the game moves them. */
export function advance(ws, p, frame, roll) {
  const to = Math.floor(frame);
  for (let at = ws[0]?.at ?? to; at < to; at++) {
    for (const w of ws) {
      if (w.kind === PLATFORM_KIND) stepPlatform(w);
      else if (w.type === SLOW_STAR) stepStar(w, p, at);
      else if (w.type === WHEEL) stepWheel(w, p, at);
      else if (w.type === FAST_STAR) stepFastStar(w);
      else if (w.type === WANDERER) stepWanderer(w, p, at, roll);
      w.at = at + 1;
    }
  }
}

/** Keyed by the cell and face each starts from, in the order the game lifts
    them: record by record, face by face. */
export function walkers(l, idx, table, frame = 0) {
  const out = new Map();
  if (!table) return out;
  for (const [key, marks] of idx.markers) {
    const c = idx.cells.get(key);
    for (const m of marks) {
      const moves =
        m.face === null
          ? m.kind === PLATFORM_KIND
          : [SLOW_STAR, WHEEL, FAST_STAR, WANDERER].includes(m.type);
      if (moves) out.set(`${key}/${m.face}`, walker(m, c, l, table, frame));
    }
  }
  return out;
}
