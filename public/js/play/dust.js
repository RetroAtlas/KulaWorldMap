// Golden dust behind the ball: born along its footprint, lifting off the face and settling,
// twinkling and fading.
import { state, screen } from "../viewer/state.js";
import { hashes } from "../viewer/hash.js";
import { cellKey } from "../format/lattice.js";

const CAP = 320;
const PER_BLOCK = 16;
const LIFE = [1.2, 2];
const TWINKLE = [3, 6];
const RISE = [0.5, 1.2];
const GRAVITY = 2.2;
const SPREAD = 0.14;
const DRIFT = 0.3;
const DRAG = 2.5;
const SIZE = [0.7, 1.6];
const SPARKLE = 10;
const SPARKLE_REACH = 2;
const STOPS = [
  [255, 228, 160],
  [255, 205, 112],
  [228, 152, 66],
];
const TOWARD_TINT = 0.25;
// a mote's share of its alpha, so the block shows through the dust
const ALPHA = 0.6;
const LEAST_ALPHA = 0.08;

let byKey = new Map();
let count = 0;
let born = 0;
let tint = null;
let owed = 0;

/** Start afresh over a world of tint `hex`, or null for none. */
export function resetDust(hex) {
  byKey = new Map();
  count = 0;
  born = 0;
  owed = 0;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  tint = m ? m.slice(1).map((c) => parseInt(c, 16)) : null;
}

export const dustAlive = () => count > 0;
/** How many motes are over the block keyed `key`. */
export const dustOver = (key) => byKey.get(key)?.length ?? 0;

const palette = () =>
  STOPS.map((stop) =>
    tint ? stop.map((c, i) => Math.round(c + (tint[i] - c) * TOWARD_TINT)) : stop,
  );

// Two unit vectors across the face, from its normal.
function tangents(n) {
  const u = n[0] === 0 ? [1, 0, 0] : [0, 1, 0];
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return [u, v];
}

function drop(p) {
  const list = byKey.get(p.key);
  const i = list.indexOf(p);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) byKey.delete(p.key);
  count -= 1;
}

function birth(point, n, block, still) {
  const seq = born++;
  const next = hashes(block[0], block[1], block[2], seq);
  const unit = () => next() / 4294967296;
  const between = ([lo, hi]) => lo + (hi - lo) * unit();
  const [u, v] = tangents(n);
  const angle = unit() * 2 * Math.PI;
  const reach = unit() * SPREAD;
  const key = cellKey(...block);
  const p = {
    key,
    seq,
    at: point.map((c, i) => c + (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)) * reach),
    n,
    u,
    v,
    lift: 0,
    vn: still ? 0 : between(RISE),
    du: still ? 0 : (unit() - 0.5) * 2 * DRIFT,
    dv: still ? 0 : (unit() - 0.5) * 2 * DRIFT,
    age: 0,
    life: between(LIFE),
    hz: between(TWINKLE),
    phase: unit() * 2 * Math.PI,
    sparkle: next() % SPARKLE === 0,
    size: between(SIZE),
    colours: palette(),
  };
  if (count >= CAP) {
    let oldest = null;
    for (const [first] of byKey.values()) if (!oldest || first.seq < oldest.seq) oldest = first;
    drop(oldest);
  }
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(p);
  count += 1;
}

/** Dust along the footprint's travel from `from` to `to`, each mote over the block `blockOf`
    names for its point, born still where `still`, while the dust is on. */
export function travelDust(from, to, n, blockOf, still = false) {
  if (!state.show.dust) return;
  const d = Math.hypot(...to.map((c, i) => c - from[i]));
  owed += d * PER_BLOCK;
  const n0 = Math.floor(owed);
  owed -= n0;
  for (let k = 0; k < n0; k++) {
    const f = (k + 0.5) / n0;
    const point = from.map((c, i) => c + (to[i] - c) * f);
    birth(point, n, blockOf(point), still);
  }
}

/** A burst of `n0` motes at `point` over `block`, born still where `still`, while the dust
    is on. */
export function burstDust(point, n, block, n0, still) {
  if (!state.show.dust) return;
  for (let k = 0; k < n0; k++) birth(point, n, block, still);
}

/** Age every mote by `dt` seconds: it lifts, slows, settles and fades. */
export function ageDust(dt) {
  for (const list of [...byKey.values()])
    for (const p of [...list]) {
      p.age += dt;
      if (p.age >= p.life) {
        drop(p);
        continue;
      }
      p.vn -= GRAVITY * dt;
      p.lift = Math.max(0, p.lift + p.vn * dt);
      if (p.lift === 0 && p.vn < 0) p.vn = 0;
      for (let i = 0; i < 3; i++) p.at[i] += (p.u[i] * p.du + p.v[i] * p.dv) * dt;
      const slow = Math.max(0, 1 - DRAG * dt);
      p.du *= slow;
      p.dv *= slow;
    }
}

const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

/** The motes born over the block keyed `key`, drawn where they now are: each core in its own
    colour, so the dust stays gold over a bright block, and the sparkles added lighter. */
export function drawDust(ctx, key) {
  const list = byKey.get(key);
  if (!list) return;
  const zoom = Math.max(0.5, state.cam.zoom);
  const shown = [];
  for (const p of list) {
    const gone = p.age / p.life;
    const twinkle = 0.55 + 0.45 * Math.sin(p.age * p.hz * 2 * Math.PI + p.phase);
    const alpha = (1 - gone) * twinkle * ALPHA;
    if (alpha < LEAST_ALPHA) continue;
    const t = gone * (p.colours.length - 1);
    const k = Math.min(p.colours.length - 2, Math.floor(t));
    const [x, y] = screen(...p.at.map((c, i) => c + p.n[i] * p.lift));
    shown.push({
      sparkle: p.sparkle,
      x,
      y,
      size: p.size * zoom,
      colour: mix(p.colours[k], p.colours[k + 1], t - k).join(" "),
      alpha,
    });
  }
  if (!shown.length) return;
  ctx.save();
  for (const { x, y, size, colour, alpha } of shown) {
    ctx.fillStyle = `rgba(${colour} / ${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 7);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const { sparkle, x, y, size, colour, alpha } of shown) {
    if (!sparkle) continue;
    ctx.strokeStyle = `rgba(${colour} / ${alpha * 0.7})`;
    ctx.lineWidth = Math.max(0.6, size * 0.4);
    const reach = size * SPARKLE_REACH;
    ctx.beginPath();
    ctx.moveTo(x - reach, y);
    ctx.lineTo(x + reach, y);
    ctx.moveTo(x, y - reach);
    ctx.lineTo(x, y + reach);
    ctx.stroke();
  }
  ctx.restore();
}
