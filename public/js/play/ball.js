// The ball's roll over the lattice, a game frame at a time, by the executable's rules.
import { FACE_NORMAL } from "../format/lattice.js";
import { frameOf } from "../viewer/state.js";

export const REST = -1;
export const HOP = 0;
export const JUMP = 1;
export const ROLLING = 2;
export const FALL = 6;
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
/** The cell a point of the ball's lies in, its own where none is given. */
export const cellOf = (b, p = b.pos) => p.map((c) => Math.floor((c + b.half) / b.unit));
export const faceOf = (n) => FACE_NORMAL.findIndex((f) => f.every((c, i) => c === n[i]));

const NO_JUMP = { count: 0, rows: [] };

/** A ball at rest on `face` of the block at `cell`, heading `h`, by `rules`: its type's motion
    table, the 4096ths of a turn, the units a block has and the mesh file's arc for the jump. */
export function ballAt(rules, cell, face, h) {
  const { table, unit, jump = NO_JUMP } = rules;
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
    jump,
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
    wantJump: false,
    turn: 0,
    waiting: 0,
    again: 0,
    pad: 0,
    previous: 0,
    since: 0,
    ramp: null,
    arc: 0,
    wrapped: false,
    held: [...cell],
    v: 0,
    count: 0,
    row: 0,
    saved: null,
    bounced: false,
    landed: false,
    frozen: false,
    rest: { cell: [...cell], face, h },
    look: { word: 0, rate: table.look.from },
    frame: frameOf(h, n),
  };
}

/** Whether the ball is in the air, falling or in a jump's or a hop's rows. */
export const aloft = (b) => b.state === JUMP || b.state === HOP || b.state === FALL;
/** The block the ball stands on, kept while it goes round its edge or is in the air. */
export const blockUnder = (b) =>
  b.state === WRAPPING || aloft(b) ? b.held : add(cellOf(b, b.pos), b.n, -1);
export const faceUnder = (b) => faceOf(b.n);
/** The centre's distance off the face it stands on, in game units. */
export const heightOf = (b) => dot(add(b.pos, blockUnder(b), -b.unit), b.n) - b.half;
/** The centre's distance off the face below it, for the shadow: in the air, the block under
    the ball's cell, or nothing at all, Infinity, where that cell holds no block. */
export function clearance(b, probe) {
  if (!aloft(b)) return heightOf(b);
  const under = add(cellOf(b, b.pos), b.n, -1);
  return probe.solid(under) ? dot(add(b.pos, under, -b.unit), b.n) - b.half : Infinity;
}
/** The centre in blocks. */
export const centreOf = (b) => b.pos.map((c) => c / b.unit + 0.5);
/** Whether the ball has anything to do: it moves, a ramp runs, a turn waits or the view's pitch
    returns. */
export const moving = (b) => b.state !== REST || b.ramp !== null || b.turn !== 0 || b.look.word > 0;
/** The centre's lift off the face the jump or the hop left, in game units. */
const liftOf = (b) => dot(add(b.pos, b.saved, -1), b.n) + b.radius;

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

function drop(b) {
  b.state = FALL;
  b.speed = 0;
  b.v = b.table.fall.start;
}

/** Laid its radius off its face at rest, and dropped where the block under it has gone. */
function resting(b, probe) {
  settle(b);
  if (!probe.solid(blockUnder(b))) drop(b);
  b.spinSpeed = 0;
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

/** The pad as held, `b.pad`, into the ball's requests: the roll, the jump and a turn, held back
    while a turn's ramp runs. A press is a bit held now and not on the last frame, and a held
    turn presses again once the count passes the repeat. */
export function read(b, probe, out) {
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
  b.wantJump = (b.pad & PAD.cross) !== 0;
  b.forward = (b.pad & PAD.up) !== 0;
  if (!b.forward || b.wantJump) return;
  const under = blockUnder(b);
  if (probe.solid(add(under, b.h))) return;
  if (probe.solid(add(under, b.s)) || probe.solid(add(under, neg(b.s)))) {
    b.forward = false;
    if (b.state === REST) out.push({ refused: true });
  }
}

function turnNow(b, out) {
  const dir = b.turn;
  b.turn = 0;
  const [h, s] = dir === LEFT ? [neg(b.s), b.h] : [b.s, neg(b.h)];
  b.h = h;
  b.s = s;
  startRamp(b, "quarter", dir * b.table.quarter.step);
  out.push({ turned: dir });
}

function startJump(b, probe) {
  if (!b.jump.count || !probe.solid(blockUnder(b))) return;
  b.state = JUMP;
  b.saved = [...b.pos];
  b.count = b.jump.count;
  b.row = 0;
  b.speed = b.table.jump.speed;
  b.spinSpeed = b.speed;
  b.v = 0;
  b.bounced = false;
}

function startHop(b) {
  if (!b.jump.count) return;
  b.state = HOP;
  b.saved = [...b.pos];
  b.count = b.jump.count;
  b.row = 0;
  b.v = 0;
}

function intents(b, probe, out) {
  if (b.state === HOP) {
    if (b.turn && !b.ramp) turnNow(b, out);
    return;
  }
  if (b.state === ROLLING) {
    if (b.wantJump) startJump(b, probe);
    return;
  }
  if (b.state !== REST) return;
  if (b.wantJump) {
    if (b.forward) startJump(b, probe);
    else startHop(b);
    return;
  }
  if (b.turn) {
    if (!b.ramp) turnNow(b, out);
    return;
  }
  if (!b.forward) return;
  const cell = cellOf(b, b.pos);
  if (!probe.solid(add(cell, b.n, -1))) return;
  if (mayRollOn(b, probe, cell)) b.state = ROLLING;
}

function recentre(p, b, by) {
  const i = axisOf(b.s);
  const off = p[i] - cellOf(b, p)[i] * b.unit;
  if (Math.abs(off) > by) p[i] -= Math.sign(off) * by;
}

function roll(b, probe) {
  const t = b.table.rolling;
  recentre(b.pos, b, t.recentre);
  if (!probe.solid(blockUnder(b)) && b.progress >= t.over[0] && b.progress <= t.over[1]) {
    drop(b);
    return;
  }
  if (b.progress >= t.over[0]) b.wrapped = false;
  b.speed = Math.min(b.speed + t.gain, t.top);
  if (turning(b)) b.speed = Math.min(b.speed, b.table.quarter.clamp);
  b.pos = add(b.pos, b.h, b.speed);
  b.spinSpeed = b.speed;
}

/** Land where the point the radius under the centre lies in a block: laid the radius off its
    face, rolling on where Up is held or the landing was short of the middle's third, else at
    rest. */
function land(b, probe, out) {
  const block = cellOf(b, add(b.pos, b.n, -b.radius));
  if (!probe.solid(block)) return false;
  const i = axisOf(b.n);
  b.pos[i] = block[i] * b.unit + b.n[i] * (b.half + b.radius);
  b.v = 0;
  b.bounced = false;
  b.landed = true;
  b.progress = progressOf(b);
  if (b.forward || (b.progress < b.table.fall.short && !b.wantJump)) {
    b.state = ROLLING;
    b.speed = b.table.rolling.top;
  } else {
    b.state = REST;
    b.speed = 0;
  }
  out.push({ at: "landed" });
  return true;
}

// Rising into a block over the ball, or ahead and above from the wall's progress, or behind and
// above short of the ball's radius, drops it at its rise reversed.
function ceiling(b, probe, rise) {
  const j = b.table.jump;
  if (rise <= 0 || liftOf(b) < j.wall) return false;
  const cell = cellOf(b, b.pos);
  const p = progressOf(b);
  const over = add(cell, b.n);
  const hit =
    probe.solid(over) ||
    (p >= j.wall && probe.solid(add(over, b.h))) ||
    (p <= b.radius && probe.solid(add(over, b.h, -1)));
  if (!hit) return false;
  b.state = FALL;
  b.v = -rise;
  return true;
}

function jumping(b, probe, out) {
  const j = b.table.jump;
  b.count = b.count === j.skip + 1 ? 0 : b.count - 1;
  if (b.count <= 0) {
    b.pos = add(b.saved, b.h, j.snap);
    if (land(b, probe, out)) return;
    const rows = b.jump.rows;
    b.state = FALL;
    b.v = rows[b.row - 1][0] - rows[b.row - 2][0];
    return;
  }
  recentre(b.saved, b, j.recentre);
  const was = b.row ? b.jump.rows[b.row - 1] : [0, 0, 0];
  const [height, right, back] = b.jump.rows[b.row++];
  b.pos = add(add(add(b.saved, b.n, height), b.s, right), b.h, -back);
  const rise = height - was[0];
  const advance = was[2] - back;
  if (b.count < j.catch && land(b, probe, out)) return;
  const cell = cellOf(b, b.pos);
  const p = progressOf(b);
  const ahead = add(cell, b.h);
  const lift = liftOf(b);
  const wall =
    p >= j.wall &&
    (probe.solid(ahead) ||
      (lift >= j.wall && probe.solid(add(ahead, b.n))) ||
      (lift < j.low && probe.solid(add(ahead, b.n, -1))));
  if (wall) {
    b.pos = add(b.pos, b.h, -2 * advance);
    b.speed = -advance;
    b.bounced = true;
    b.state = FALL;
    b.v = rise > 0 ? j.bounce : rise;
    return;
  }
  ceiling(b, probe, rise);
}

function hopping(b, probe) {
  const j = b.table.jump;
  b.count = b.count === j.skip + 1 ? 0 : b.count - 1;
  if (b.count <= 0) {
    if (probe.solid(add(cellOf(b, b.saved), b.n, -1))) {
      b.state = REST;
      return;
    }
    b.state = FALL;
    b.v = b.table.fall.hop;
    return;
  }
  const was = b.jump.rows[b.row][0];
  b.row += 1;
  const height = b.jump.rows[b.row][0];
  b.pos = add(b.saved, b.n, height);
  ceiling(b, probe, height - was);
}

function falling(b, probe, out) {
  const f = b.table.fall;
  const t = b.table.rolling;
  b.v = Math.max(b.v + f.gain, f.top);
  if (b.bounced && b.speed < 0) b.speed = Math.min(0, b.speed + t.gain);
  b.pos = add(add(b.pos, b.n, b.v), b.h, b.speed);
  b.spinSpeed = b.forward ? Math.min(b.spinSpeed + t.gain, t.top) : Math.max(0, b.spinSpeed - 1);
  const cell = cellOf(b, b.pos);
  const p = progressOf(b);
  const [ahead, behind] = f.hold;
  if (p >= ahead && probe.solid(add(cell, b.h))) lay(b, f.wall);
  else if (p < behind && probe.solid(add(cell, b.h, -1))) lay(b, f.behind);
  land(b, probe, out);
}

// The view pitches further down over a fall, and over the jump's last rows, where no block is
// under the ball, by a word that grows faster then slower, and comes back once the ball is over
// a block or at rest, the rate starting over once the ball is neither falling nor in those rows.
function looking(b, probe) {
  const l = b.table.look;
  const w = b.look;
  const aloft = b.state === FALL || (b.state === JUMP && b.count < l.rows);
  if (aloft && !probe.solid(add(cellOf(b, b.pos), b.n, -1))) {
    if (w.word < l.near) w.rate = Math.min(w.rate + 1, l.to);
    else w.rate = Math.max(w.rate - 1, l.least);
    w.word = Math.min(l.far, w.word + w.rate);
    return;
  }
  if (!aloft) w.rate = l.from;
  w.word = Math.max(0, w.word - l.back);
}

/** Whether the point past the ball's centre along the normal has left the lattice far enough to
    be lost. */
const lost = (b) => {
  const [low, high] = b.table.fall.lost;
  return cellOf(b, add(b.pos, b.n, b.half)).some((v) => v <= low || v >= high);
};

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
    out.push({ face: "climb" });
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
  out.push({ face: "wrap" });
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

function acting(b, probe, out) {
  if (b.state === ROLLING) roll(b, probe);
  else if (b.state === WRAPPING) wrap(b);
  else if (b.state === JUMP) jumping(b, probe, out);
  else if (b.state === HOP) hopping(b, probe);
  else if (b.state === FALL) falling(b, probe, out);
  else if (b.state === REST) resting(b, probe);
}

/** The frame from the requests on: what happened, as events, added to `out`. The last frame's
    landing is cleared first, so a caller between `read` and `run` still sees it; while the ball
    is `frozen` its state does nothing, nor the move step nor the landings, and a ramp, the look
    and the spin go on. Between the state and the move step the probe's `stood`, where it has
    one, is told the ball, which is where the game reads the cells about it. A lost ball says so
    and stays where it is. */
export function run(b, probe, out) {
  b.landed = false;
  intents(b, probe, out);
  if (!b.frozen) acting(b, probe, out);
  probe.stood?.(b);
  b.last = b.progress;
  b.progress = progressOf(b);
  // the game's move step runs before its landings, so a frame that lands takes no roll of its own
  if (b.state === ROLLING && !b.landed && !b.frozen) move(b, probe, out);
  if (b.ramp) ramping(b);
  if (b.state === REST || b.state === ROLLING) b.held = add(cellOf(b, b.pos), b.n, -1);
  looking(b, probe);
  b.spin += b.table.spin * b.spinSpeed;
  if (b.state === REST) b.rest = { cell: blockUnder(b), face: faceUnder(b), h: b.h };
  if (lost(b)) out.push({ lost: true });
  return out;
}

/** Stand the ball at rest on `face` of the block at `cell`, heading `h`, laid as `ballAt` lays
    it, a ramp or a look it had gone and its frame cut to the new footing. */
export function place(b, cell, face, h) {
  Object.assign(b, ballAt(b.rules, cell, face, h));
}

/** One game frame, with `b.pad` the pad as held, for a caller with no rules over the ball: what
    happened, as events, a lost ball put back where it last rested. */
export function step(b, probe) {
  const out = [];
  read(b, probe, out);
  run(b, probe, out);
  if (out.some((e) => e.lost)) place(b, b.rest.cell, b.rest.face, b.rest.h);
  return out;
}
