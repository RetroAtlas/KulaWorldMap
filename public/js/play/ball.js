// The ball's roll over the lattice, a game frame at a time, by the executable's rules.
import { FACE_NORMAL } from "../format/lattice.js";
import { frameOf } from "../viewer/state.js";

export const REST = -1;
export const ROLLING = 2;
export const WRAPPING = 7;
export const LEFT = 1;
export const RIGHT = -1;
export const PAD = { up: 16, right: 32, down: 64, left: 128, cross: 16384 };
// the ramps turn the drawn frame about its own down axis or its across axis
const AXIS = { quarter: 2, wrap: 0, climb: 0 };

const neg = (v) => v.map((x) => -x || 0);
const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const cross = (a, b) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]].map(
    (v) => v || 0,
  );
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const axisOf = (v) => v.findIndex((c) => c !== 0);
const cellOf = (b, p) => p.map((c) => Math.floor((c + b.half) / b.unit));
export const faceOf = (n) => FACE_NORMAL.findIndex((f) => f.every((c, i) => c === n[i]));

/** A ball at rest on `face` of the block at `cell`, heading `h`, by `rules`: its type's motion
    table, the 4096ths of a turn and the units a block has. */
export function ballAt(rules, cell, face, h) {
  const { table, unit } = rules;
  const half = unit / 2;
  // the ball rests its radius off the face, which is where the roll up a wall resumes from
  const radius = table.rolling.resume;
  const n = FACE_NORMAL[face];
  return {
    rules,
    table,
    unit,
    half,
    radius,
    h,
    n,
    s: cross(h, n),
    pos: add(
      cell.map((c) => c * unit),
      n,
      half + radius,
    ),
    speed: 0,
    spinSpeed: 0,
    spin: 0,
    state: REST,
    progress: half,
    last: half,
    forward: false,
    jump: false,
    turn: 0,
    waiting: 0,
    again: 0,
    pad: 0,
    previous: 0,
    since: 0,
    ramp: null,
    arc: 0,
    wrapped: false,
    held: null,
    frame: frameOf(h, n),
  };
}

/** The block the ball stands on, which it keeps while it goes round its edge. */
export const blockUnder = (b) => (b.state === WRAPPING ? b.held : add(cellOf(b, b.pos), b.n, -1));
export const faceUnder = (b) => faceOf(b.n);
/** The centre's distance off the face it stands on, in game units. */
export const heightOf = (b) => dot(add(b.pos, blockUnder(b), -b.unit), b.n) - b.half;
/** The centre in blocks. */
export const centreOf = (b) => b.pos.map((c) => c / b.unit + 0.5);
/** Whether the ball has anything to do: it rolls, a ramp runs or a turn waits. */
export const moving = (b) => b.state !== REST || b.ramp !== null || b.turn !== 0;

function progressOf(b) {
  const i = axisOf(b.h);
  const within = (((b.pos[i] + b.half) % b.unit) + b.unit) % b.unit;
  return b.h[i] > 0 ? within : b.unit - within;
}

/** Lay the centre at progress `p` into its cell along the heading. */
function lay(b, p) {
  const i = axisOf(b.h);
  const edge = cellOf(b, b.pos)[i] * b.unit - b.h[i] * b.half;
  b.pos[i] = edge + b.h[i] * p;
}

function settle(b) {
  const block = blockUnder(b);
  const i = axisOf(b.n);
  b.pos[i] = block[i] * b.unit + b.n[i] * (b.half + b.radius);
}

function stop(b, p) {
  lay(b, p);
  b.speed = 0;
  b.state = REST;
}

function mayRollOn(b, probe, cell) {
  const under = add(cell, b.n, -1);
  if (probe.solid(add(under, b.h))) return true;
  return !probe.solid(add(under, b.s)) && !probe.solid(add(under, neg(b.s)));
}

/** The frame `f` turned about its own axis by `t` turns. */
export function turned(f, axis, t) {
  const c = Math.cos(t * 2 * Math.PI);
  const s = Math.sin(t * 2 * Math.PI);
  const col = (k) => f.slice(3 * k, 3 * k + 3);
  const mix = (u, v, p, q) => u.map((x, i) => p * x + q * v[i]);
  const [x, y, z] = [col(0), col(1), col(2)];
  return axis === 2
    ? [...mix(x, y, c, s), ...mix(x, y, -s, c), ...z]
    : [...x, ...mix(y, z, c, s), ...mix(y, z, -s, c)];
}

/** The frame the view shows `offset` of a `turn` from `from`, as the game's yaw or pitch
    offset shows it. */
export const offsetFrame = (from, axis, offset, turn) => turned(from, axis, -offset / turn);

function startRamp(b, kind, step) {
  const r = b.table[kind];
  b.ramp = {
    kind,
    axis: AXIS[kind],
    frames: r.frames,
    step,
    count: 0,
    from: b.frame,
    to: frameOf(b.h, b.n),
  };
}

const turning = (b) => b.ramp?.kind === "quarter";

function swap(b, h, n) {
  b.h = h;
  b.n = n;
  b.s = cross(h, n);
}

// A press is a bit held now and not on the last frame; a held turn presses again once the
// count passes the repeat.
function input(b, probe, out) {
  const t = b.table.rolling;
  if (turning(b)) b.since = 0;
  else if (++b.since > t.repeat) b.previous = 0;
  const newly = b.pad & ~b.previous;
  b.previous = b.pad;
  const press = (dir) => {
    b.since = 0;
    if (turning(b)) b.waiting = dir;
    else if (!b.turn) b.turn = dir;
  };
  if (newly & PAD.left) press(LEFT);
  if (newly & PAD.right) press(RIGHT);
  if (newly & PAD.down) {
    press(LEFT);
    b.again = LEFT;
  }
  b.jump = (b.pad & PAD.cross) !== 0;
  b.forward = (b.pad & PAD.up) !== 0;
  if (!b.forward || b.jump) return;
  const under = blockUnder(b);
  if (probe.solid(add(under, b.h))) return;
  if (probe.solid(add(under, b.s)) || probe.solid(add(under, neg(b.s)))) {
    b.forward = false;
    if (b.state === REST) out.push({ refused: true });
  }
}

function intents(b, probe, out) {
  if (b.state !== REST) return;
  if (b.turn) {
    if (b.ramp) return;
    const dir = b.turn;
    b.turn = 0;
    const [h, s] = dir === LEFT ? [neg(b.s), b.h] : [b.s, neg(b.h)];
    b.h = h;
    b.s = s;
    startRamp(b, "quarter", dir * b.table.quarter.step);
    out.push({ turned: dir });
    return;
  }
  if (!b.forward) return;
  const cell = cellOf(b, b.pos);
  if (!probe.solid(add(cell, b.n, -1))) return;
  if (mayRollOn(b, probe, cell)) b.state = ROLLING;
}

function roll(b) {
  const t = b.table.rolling;
  const i = axisOf(b.s);
  const off = b.pos[i] - cellOf(b, b.pos)[i] * b.unit;
  if (Math.abs(off) > t.recentre) b.pos[i] -= Math.sign(off) * t.recentre;
  b.speed = Math.min(b.speed + t.gain, t.top);
  if (turning(b)) b.speed = Math.min(b.speed, b.table.quarter.clamp);
  b.pos = add(b.pos, b.h, b.speed);
  b.spinSpeed = b.speed;
  if (b.wrapped && b.progress >= t.over[0]) b.wrapped = false;
}

function wrap(b) {
  const { arc } = b.table.wrap;
  const [dn, dh] = arc[b.arc++];
  b.pos = add(add(b.pos, b.n, dn), b.h, dh);
  if (b.arc < arc.length) return;
  settle(b);
  b.state = ROLLING;
}

function move(b, probe, out) {
  const t = b.table.rolling;
  const cell = cellOf(b, b.pos);
  const atMiddle = b.progress >= t.middle && b.last <= t.middle;
  if (b.progress >= t.middle && b.last < t.middle) out.push({ at: "middle" });
  if (atMiddle && (!b.forward || b.turn)) {
    stop(b, t.middle);
    return;
  }
  if (!mayRollOn(b, probe, cell) && b.progress >= t.middle) {
    if (atMiddle) stop(b, t.middle);
    else {
      b.pos = add(b.pos, b.h, -b.speed);
      b.speed = 0;
      b.state = REST;
    }
    return;
  }
  if (probe.solid(add(cell, b.h)) && b.progress >= t.climb) {
    lay(b, t.touch);
    swap(b, b.n, neg(b.h));
    startRamp(b, "climb", b.table.climb.step);
    out.push({ face: true });
    return;
  }
  const under = add(cell, b.n, -1);
  if (probe.solid(under) || b.wrapped || b.last + b.speed < t.wrap) return;
  const behind = add(under, b.h, -1);
  if (probe.solid(add(behind, b.s)) || probe.solid(add(behind, neg(b.s)))) return;
  lay(b, 0);
  b.held = behind;
  swap(b, neg(b.n), b.h);
  b.state = WRAPPING;
  b.arc = 0;
  b.wrapped = true;
  startRamp(b, "wrap", b.table.wrap.step);
  out.push({ face: true });
}

// A turn pressed while a ramp runs waits for its end, whichever ramp is running by then, and
// past an end that finds a turn asked already.
function ramping(b) {
  const r = b.ramp;
  r.count += 1;
  if (r.count < r.frames) {
    b.frame = offsetFrame(r.from, r.axis, r.step * r.count, b.rules.turn);
    return;
  }
  b.frame = r.to;
  b.ramp = null;
  if (b.turn) return;
  b.turn = b.waiting || b.again;
  if (b.waiting) b.waiting = 0;
  else b.again = 0;
}

/** One game frame, with `b.pad` the pad as held: what happened, as events. */
export function step(b, probe) {
  const out = [];
  input(b, probe, out);
  intents(b, probe, out);
  if (b.state === ROLLING) roll(b);
  else if (b.state === WRAPPING) wrap(b);
  else if (b.state === REST) {
    settle(b);
    b.spinSpeed = 0;
  }
  b.last = b.progress;
  b.progress = progressOf(b);
  if (b.state === ROLLING) move(b, probe, out);
  if (b.ramp) ramping(b);
  b.spin += b.table.spin * b.spinSpeed;
  return out;
}
