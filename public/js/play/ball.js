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
/** The cell a point of the ball's lies in, its centre's in the level where none is given. */
export const cellOf = (b, p = positionOf(b)) => p.map((c) => Math.floor((c + b.half) / b.unit));
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
  const s = cross(h, n);
  return {
    rules,
    table,
    unit,
    half,
    radius,
    jump,
    h,
    n,
    s,
    pos: add(
      cell.map((c) => c * unit),
      n,
      half + radius,
    ),
    speed: 0,
    spinSpeed: 0,
    body: [...s, ...h, ...n],
    mark: null,
    marked: null,
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
    floor: true,
    brittle: false,
    v: 0,
    count: 0,
    row: 0,
    long: 0,
    saved: null,
    landed: false,
    frozen: false,
    way: null,
    rest: { cell: [...cell], face, h },
    look: { word: 0, rate: table.look.from },
    frame: frameOf(h, n),
    riding: null,
    travel: null,
  };
}

/** Whether the ball is in the air, falling or in a jump's or a hop's rows. */
export const aloft = (b) => b.state === JUMP || b.state === HOP || b.state === FALL;
// The block under the ball in the lattice it rolls in, kept round an edge and in the air.
const standingOn = (b) =>
  b.state === WRAPPING || aloft(b) ? b.held : add(cellOf(b, b.pos), b.n, -1);
/** The centre in the level: the position, with the platform's travel added while the ball rides
    one. */
export const positionOf = (b) => (b.riding ? add(b.pos, b.travel) : b.pos);
/** The block the ball stands on, in the level. */
export const blockUnder = (b) =>
  b.riding
    ? cellOf(
        b,
        add(
          standingOn(b).map((c) => c * b.unit),
          b.travel,
        ),
      )
    : standingOn(b);
export const faceUnder = (b) => faceOf(b.n);
/** The centre's distance off the face it stands on, in game units. */
export const heightOf = (b) => dot(add(b.pos, standingOn(b), -b.unit), b.n) - b.half;
/** The centre's distance off the face below it, for the shadow: the block the ball stands on,
    or in the air the block under the ball's cell, and nothing at all, Infinity, where the probe
    holds no block there, as under a ball still at rest over a block that has gone. */
export function clearance(b, probe) {
  const under = aloft(b) ? add(cellOf(b, b.pos), b.n, -1) : standingOn(b);
  return probe.solid(under) ? dot(add(b.pos, under, -b.unit), b.n) - b.half : Infinity;
}
/** The centre in blocks, in the level. */
export const centreOf = (b) => positionOf(b).map((c) => c / b.unit + 0.5);
/** Whether the ball has anything to do: it moves, a ramp runs, a turn waits or the view's pitch
    returns. */
export const moving = (b) => b.state !== REST || b.ramp !== null || b.turn !== 0 || b.look.word > 0;
/** The jump's row `i`, its three halfwords scaled by the long jump's measure while its word
    stands, the odd half dropped toward nothing. */
function rowOf(b, i) {
  const row = b.jump.rows[i];
  if (!b.long) return row;
  const [over, under] = b.table.jump.scale;
  return row.map((v) => Math.trunc((v * over) / under));
}

/** How far into its cell the centre has come along the unit axis `v`, the middle at half a block. */
function along(b, v) {
  const i = axisOf(v);
  const within = (((b.pos[i] + b.half) % b.unit) + b.unit) % b.unit;
  return v[i] > 0 ? within : b.unit - within;
}
/** The centre's progress into its cell along the heading. */
export const progressOf = (b) => along(b, b.h);
/** The centre's measure across its cell, along the ball's side. */
export const acrossOf = (b) => along(b, b.s);
/** The centre's measure into its cell along the normal, its radius at rest. */
const upOf = (b) => along(b, b.n);

/** Lay the centre at progress `p` into its cell along the heading. */
function lay(b, p) {
  const i = axisOf(b.h);
  const edge = cellOf(b, b.pos)[i] * b.unit - b.h[i] * b.half;
  b.pos[i] = edge + b.h[i] * p;
}

/** Lay the centre its radius off the face plane nearest it along the normal. */
function settle(b) {
  const i = axisOf(b.n);
  const plane = Math.floor(b.pos[i] / b.unit) * b.unit + b.half;
  b.pos[i] = plane + b.n[i] * b.radius;
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

/** Laid its radius off its face at rest, and dropped where the last frame's read found no block
    under it, unless it rides a platform. */
function resting(b) {
  settle(b);
  if (!b.riding && !b.floor) drop(b);
  b.spinSpeed = 0;
}

function mayRollOn(b, probe, cell) {
  const under = add(cell, b.n, -1);
  if (probe.solid(add(under, b.h))) return true;
  if (!probe.solid(add(under, b.s)) && !probe.solid(add(under, neg(b.s)))) return true;
  return probe.slick?.(under) === true;
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

/** The frame `f` with each column turned about the world's unit axis `u` by `t` turns, the
    right-handed way. */
function spun(f, u, t) {
  const c = Math.cos(t * 2 * Math.PI);
  const s = Math.sin(t * 2 * Math.PI);
  const out = [];
  for (let k = 0; k < 3; k++) {
    const v = f.slice(3 * k, 3 * k + 3);
    const w = cross(u, v);
    const d = dot(u, v) * (1 - c);
    for (let i = 0; i < 3; i++) out.push(v[i] * c + w[i] * s + u[i] * d);
  }
  return out;
}

/** The frame `f` with its columns made unit and perpendicular again. */
function straightened(f) {
  const unit = (v) => {
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  };
  const x = unit(f.slice(0, 3));
  const y = f.slice(3, 6);
  const d = dot(y, x);
  const z = unit(y.map((v, i) => v - d * x[i]));
  return [...x, ...z, ...cross(x, z)];
}

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
    while a turn's ramp runs. The roll and the jump are the pad's alone, put at nothing before
    the keys are read, so either asked earlier in the frame stands only where the pad is not
    read; where `asked` is given, its `forward` and `jump` stand in place of Up and Cross, read
    by a rule of the caller's. A press is a bit held now and not on the last frame, and a held
    turn presses again once the count passes the repeat. With no jump asked, the floor ahead
    empty and a block beside the block under, the roll is refused; with nothing beside and the
    block under one the last frame's read found brittle, a rolling ball is held short of the
    edge by `rules.edge`: from its hold the forward request and the speed are dropped, and from
    its further mark the centre is set back along the heading besides. */
export function read(b, probe, out, asked) {
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
  b.wantJump = asked ? asked.jump : (b.pad & PAD.cross) !== 0;
  b.forward = asked ? asked.forward : (b.pad & PAD.up) !== 0;
  if (b.wantJump) return;
  const under = standingOn(b);
  if (probe.solid(add(under, b.h))) return;
  if (probe.solid(add(under, b.s)) || probe.solid(add(under, neg(b.s)))) {
    if (b.forward && b.state === REST) out.push({ refused: "edge" });
    b.forward = false;
    return;
  }
  const edge = b.rules.edge;
  if (!edge || b.speed <= 0 || b.progress < edge.hold || !b.brittle) return;
  b.forward = false;
  if (b.progress >= edge.back) b.pos = add(b.pos, b.h, -edge.push);
  b.speed = 0;
}

function turnNow(b, out) {
  const dir = b.turn;
  b.turn = 0;
  const [h, s] = dir === LEFT ? [neg(b.s), b.h] : [b.s, neg(b.h)];
  b.h = h;
  b.s = s;
  b.mark = "quarter";
  startRamp(b, "quarter", dir * b.table.quarter.step);
  out.push({ turned: dir });
}

/** Off the platform the ball rides, where it rides one: its position the level's again and its
    travel nothing. */
export function alight(b) {
  if (!b.riding) return;
  b.pos = positionOf(b);
  b.riding = null;
  b.travel = null;
}

// The forward jump and the hop alone take the ball off its platform.
function leaving(b, out) {
  if (b.riding) out.push({ alit: { key: b.riding.key } });
  alight(b);
}

function startJump(b, probe, out) {
  if (!b.jump.count || !probe.solid(standingOn(b))) return;
  leaving(b, out);
  b.state = JUMP;
  b.saved = [...b.pos];
  b.count = b.jump.count;
  b.row = 0;
  b.speed = b.table.jump.speed;
  b.spinSpeed = b.speed;
  b.v = 0;
}

function startHop(b, out) {
  if (!b.jump.count) return;
  leaving(b, out);
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
    if (b.wantJump) startJump(b, probe, out);
    return;
  }
  if (b.state !== REST) return;
  if (b.wantJump) {
    if (b.forward) startJump(b, probe, out);
    else startHop(b, out);
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

function roll(b) {
  const t = b.table.rolling;
  recentre(b.pos, b, t.recentre);
  const over = !b.riding && !b.floor;
  if (over && b.progress >= t.over[0] && b.progress <= t.over[1]) {
    drop(b);
    return;
  }
  if (b.progress >= t.over[0]) b.wrapped = false;
  b.speed = Math.min(b.speed + t.gain, t.top);
  if (turning(b)) b.speed = Math.min(b.speed, b.table.quarter.clamp);
  b.pos = add(b.pos, b.h, b.speed);
  b.spinSpeed = b.speed;
}

// Where the cell a block under the centre is a platform's body now and the centre is at most the
// table's height off its face, the ball rides it at rest: its position relative to the
// platform's, in which the platform's blocks stand at home and are all the probe calls solid.
function board(b, probe, out) {
  const ride = b.rules.ride;
  if (!ride || !probe.platform) return false;
  const under = cellOf(b, add(b.pos, b.n, -b.unit));
  const p = probe.platform(under);
  if (!p) return false;
  const rel = add(b.pos, p.travel, -1);
  const home = add(under, cellOf(b, p.travel), -1);
  if (dot(add(rel, home, -b.unit), b.n) - b.half > ride.land) return false;
  b.pos = rel;
  b.riding = { key: p.key };
  b.travel = p.travel;
  b.v = 0;
  b.speed = 0;
  b.long = 0;
  b.state = REST;
  b.progress = progressOf(b);
  out.push({ rode: { key: p.key } }, { at: "landed" });
  return true;
}

/** Land on a platform's body first, riding it, else where the point the radius under the centre
    lies in a block that is no platform's: laid the radius off its face at rest, the speed the
    top where the roll is asked, which a landing short of the middle's third with no jump asked
    asks itself, a request the pad's reading replaces on the frame after, and the speed as the
    air left it otherwise, for the roll asked next; the long jump's word is cleared. */
function land(b, probe, out) {
  if (board(b, probe, out)) return true;
  const block = cellOf(b, add(b.pos, b.n, -b.radius));
  if (!probe.solid(block) || probe.platform?.(block)) return false;
  const i = axisOf(b.n);
  b.pos[i] = block[i] * b.unit + b.n[i] * (b.half + b.radius);
  b.v = 0;
  b.landed = true;
  b.long = 0;
  b.state = REST;
  b.progress = progressOf(b);
  if (b.progress < b.table.fall.short && !b.wantJump) b.forward = true;
  if (b.forward) b.speed = b.table.rolling.top;
  out.push({ at: "landed" });
  return true;
}

// Rising into a block over the ball, or ahead and above from the wall's progress, or behind and
// above short of the ball's radius, drops it at its rise reversed.
function ceiling(b, probe, rise) {
  const j = b.table.jump;
  if (rise <= 0 || upOf(b) < j.wall) return false;
  const cell = cellOf(b, b.pos);
  const p = progressOf(b);
  const over = add(cell, b.n);
  const hit =
    probe.solid(over) ||
    (p >= j.wall && probe.solid(add(over, b.h))) ||
    (p <= b.radius && probe.solid(add(over, b.h, -1)));
  if (!hit) return false;
  b.pos = add(b.pos, b.n, -2 * rise);
  b.state = FALL;
  b.speed = 0;
  b.spinSpeed = 0;
  b.long = 0;
  b.v = -rise;
  return true;
}

function jumping(b, probe, out) {
  const j = b.table.jump;
  b.count = b.count === j.skip + 1 ? 0 : b.count - 1;
  if (b.count <= 0) {
    b.pos = add(b.saved, b.h, b.long >= j.long ? j.far : j.snap);
    if (land(b, probe, out)) return;
    b.state = FALL;
    b.speed = 0;
    b.v = -Math.abs(rowOf(b, b.row - 1)[0] - rowOf(b, b.row - 2)[0]);
    b.long = 0;
    return;
  }
  recentre(b.saved, b, j.recentre);
  const was = b.row ? rowOf(b, b.row - 1) : [0, 0, 0];
  const [height, right, back] = rowOf(b, b.row++);
  if (b.long) b.long += 1;
  b.pos = add(add(add(b.saved, b.n, height), b.s, right), b.h, -back);
  const rise = height - was[0];
  const advance = was[2] - back;
  if (b.count < j.catch && land(b, probe, out)) return;
  const cell = cellOf(b, b.pos);
  const p = progressOf(b);
  const ahead = add(cell, b.h);
  const up = upOf(b);
  if (p >= j.wall) {
    const wall =
      probe.solid(ahead) ||
      (up >= j.wall && probe.solid(add(ahead, b.n))) ||
      (up < j.low && probe.solid(add(ahead, b.n, -1)));
    if (wall || (b.way !== null && b.way.some((c, i) => c !== b.h[i]))) {
      b.pos = add(b.pos, b.h, -2 * advance);
      b.speed = -advance;
      b.spinSpeed = 0;
      b.state = FALL;
      b.long = 0;
      b.v = rise > 0 ? j.bounce : rise;
      return;
    }
    b.way = null;
  }
  ceiling(b, probe, rise);
}

function hopping(b, probe) {
  const j = b.table.jump;
  b.count = b.count === j.skip + 1 ? 0 : b.count - 1;
  if (b.count <= 0) {
    if (probe.solid(add(cellOf(b, b.pos), b.n, -1))) {
      b.state = REST;
      b.landed = true;
      return;
    }
    b.state = FALL;
    b.v = b.table.fall.hop;
    return;
  }
  b.spinSpeed = 0;
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
  if (b.speed > 0) b.speed = 0;
  else if (b.speed < 0) b.speed = Math.min(0, b.speed + t.gain);
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
  return cellOf(b, add(positionOf(b), b.n, b.half)).some((v) => v <= low || v >= high);
};

function wrap(b) {
  const { arc } = b.table.wrap;
  b.marked = "wrap";
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
    b.marked = "climb";
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
  if (b.state === ROLLING) roll(b);
  else if (b.state === WRAPPING) wrap(b);
  else if (b.state === JUMP) jumping(b, probe, out);
  else if (b.state === HOP) hopping(b, probe);
  else if (b.state === FALL) falling(b, probe, out);
  else if (b.state === REST) resting(b);
}

/** The body's turn for the draw; a turn marks this frame's, a wall and the arc the next's. */
function spinning(b) {
  const mark = b.mark;
  b.mark = b.marked;
  b.marked = null;
  if (mark && mark !== "wrap") return;
  const by = mark ? b.table.wrap.body : b.table.spin * b.spinSpeed;
  if (by) b.body = straightened(spun(b.body, b.s, by / b.rules.turn));
}

/** The frame from the requests on: what happened, as events, added to `out`. The last frame's
    landing, a block's or a hop's end's, is cleared first, so a caller between `read` and `run`
    still sees it; the long jump's word is cleared outside the jump's state where it has counted
    past its arming, as the states' dispatcher clears it; while the ball is `frozen` its state
    does nothing, nor the move step nor the landings, and a ramp, the look and the spin go on;
    while `way` holds a direction, the jump's wall test throws the ball back from the wall's
    progress where its heading differs from it and clears it where it lies along.
    Between the state and the move step the ball's words for the block under its cell are read,
    whether one is there and whether it is brittle, which the rest state, the roll and the pad's
    reading ask on the next frame, and the probe's `stood`, where it has one, is told the ball,
    which is where the game reads the cells about it. A landing on a platform's body rides it,
    said as `rode`, and the jump and the hop leave it, said as `alit`, while a ball that rides
    never drops. A lost ball says so and stays where it is. */
export function run(b, probe, out) {
  b.landed = false;
  intents(b, probe, out);
  if (b.state !== JUMP && b.long >= b.table.jump.keep) b.long = 0;
  if (!b.frozen) acting(b, probe, out);
  const below = add(cellOf(b, b.pos), b.n, -1);
  b.floor = probe.solid(below);
  b.brittle = probe.brittle?.(below) === true;
  probe.stood?.(b);
  b.last = b.progress;
  b.progress = progressOf(b);
  // the game's move step runs before its landings, so a frame that lands takes no roll of its own
  if (b.state === ROLLING && !b.landed && !b.frozen) move(b, probe, out);
  if (b.ramp) ramping(b);
  if (b.state === REST || b.state === ROLLING) b.held = add(cellOf(b, b.pos), b.n, -1);
  looking(b, probe);
  spinning(b);
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
