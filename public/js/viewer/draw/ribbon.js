// Paints a course over the blocks: its ribbon, chevrons, stops, leaps and rings; nothing of the page.
import { state, BLOCK, screen, facing } from "../state.js";
import { FACE_NORMAL } from "../../format/lattice.js";
import { cross } from "../data.js";
import { lifted } from "../walk.js";
import { arrow, bow } from "./arrow.js";

const CORE = "#f3b640";
const GLOW = "#ffb347";
const SHINE = "#fff6dc";
const RIM = "rgba(9 13 20 / 0.7)";
const RIM_EXTRA = 3.5;
const HALO = [
  [10, 0.05],
  [6, 0.08],
  [3, 0.14],
];
const CHEVRON_AT = 0.3;
const CHEVRON_BACK = 0.17;
const CHEVRON_SIDE = 0.15;
const CHEVRON_MIN = 5;
const DASH = [0.3, 1.2];
const SLIDE = 0.03;
const SHINE_WIDTH = 0.75;
const LEAP_BOW = { share: 0.3, min: 0.6, max: 1.6 };
const LEAP_CLEAR = 2;
const LEAP_THING = 0.25;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const along = (p, v, k) => p.map((c, i) => c + v[i] * k);
const widths = () => {
  const block = state.cam.zoom * BLOCK;
  return { block, core: clamp(block / 14, 1.6, 4) };
};
const dotRadius = (core) => clamp(core * 1.6, 3, 7);

/** One block's pieces of the course; `slide` moves the shimmer along it, and
    null leaves the ribbon still. */
export function drawPieces(ctx, pieces, { slide = null } = {}) {
  const shown = pieces.filter((p) => facing(FACE_NORMAL[p.face]));
  if (!shown.length) return;
  const { block, core } = widths();
  const lines = shown.filter((p) => !p.stop);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (lines.length) {
    const line = new Path2D();
    const vee = new Path2D();
    for (const p of lines) {
      const [ax, ay] = screen(...p.from);
      const [bx, by] = screen(...p.to);
      line.moveTo(ax, ay);
      line.lineTo(bx, by);
      if (p.chevron) chevron(vee, p);
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = GLOW;
    for (const [extra, alpha] of HALO) {
      ctx.lineWidth = core + extra;
      ctx.globalAlpha = alpha;
      ctx.stroke(line);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = RIM;
    ctx.lineWidth = core + RIM_EXTRA;
    ctx.stroke(line);
    ctx.stroke(vee);
    ctx.strokeStyle = CORE;
    ctx.lineWidth = core;
    ctx.stroke(line);
    ctx.stroke(vee);
    if (slide !== null) shimmer(ctx, lines, core, block, slide);
  }
  for (const p of shown) if (p.stop) dot(ctx, p, core);
  ctx.restore();
}

// A flat V on the face, its point along the step, left out where it would be
// too small to read.
function chevron(path, piece) {
  const t = piece.chevron;
  const s = cross(FACE_NORMAL[piece.face], t);
  const apex = along(piece.from, t, CHEVRON_AT);
  const back = along(apex, t, -CHEVRON_BACK);
  const [ax, ay] = screen(...apex);
  const [lx, ly] = screen(...along(back, s, CHEVRON_SIDE));
  const [rx, ry] = screen(...along(back, s, -CHEVRON_SIDE));
  if (Math.hypot(lx - ax, ly - ay) < CHEVRON_MIN) return;
  path.moveTo(lx, ly);
  path.lineTo(ax, ay);
  path.lineTo(rx, ry);
}

// A bright dash sliding along the core, its phase carried from piece to piece
// by how far along the course each lies.
function shimmer(ctx, lines, core, block, slide) {
  ctx.strokeStyle = SHINE;
  ctx.lineWidth = core * SHINE_WIDTH;
  ctx.setLineDash(DASH.map((d) => d * block));
  for (const p of lines) {
    ctx.lineDashOffset = (p.i + (p.chevron ? 0 : 0.5) - slide * SLIDE) * block;
    const [ax, ay] = screen(...p.from);
    const [bx, by] = screen(...p.to);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function dot(ctx, piece, core) {
  const [x, y] = screen(...piece.from);
  const r = dotRadius(core);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = CORE;
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (piece.i !== 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, 7);
  ctx.strokeStyle = CORE;
  ctx.stroke();
}

// The chord bowed toward the top of the screen, as a jump reads, whichever way it runs.
function hop(sx, sy, tx, ty, o) {
  if (tx <= sx) return bow(sx, sy, tx, ty, o);
  const [x3, y3, x2, y2, x1, y1, x0, y0] = bow(tx, ty, sx, sy, o);
  return [x0, y0, x1, y1, x2, y2, x3, y3];
}

/** Dashed arrows bowed as a jump from one stop's face centre to the next, each
    end clear of the stop's dot, drawn over everything. */
export function drawLeaps(ctx, leaps) {
  if (!leaps.length) return;
  const { block, core } = widths();
  const head = clamp(block / 3, 9, 15);
  const clear = dotRadius(core) + LEAP_CLEAR;
  const o = { share: LEAP_BOW.share, min: LEAP_BOW.min * block, max: LEAP_BOW.max * block };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { from, to, near, far } of leaps) {
    const [sx, sy] = screen(...from);
    const [tx, ty] = screen(...to);
    const len = Math.hypot(tx - sx, ty - sy);
    const c0 = clear + (near ? LEAP_THING * block : 0);
    const c1 = clear + (far ? LEAP_THING * block : 0);
    if (len <= c0 + c1) continue;
    const ux = (tx - sx) / len;
    const uy = (ty - sy) / len;
    const curve = hop(sx + ux * c0, sy + uy * c0, tx - ux * c1, ty - uy * c1, o);
    for (const [ink, extra] of [
      [RIM, RIM_EXTRA],
      [CORE, 0],
    ]) {
      ctx.strokeStyle = ink;
      ctx.fillStyle = ink;
      ctx.lineWidth = core + extra;
      ctx.setLineDash([2 * core, 3 * core]);
      arrow(ctx, curve, head);
      if (extra) ctx.stroke();
    }
  }
  ctx.restore();
}

/** Dashed rings at the face centres of stations that no longer stand. */
export function drawRings(ctx, stations) {
  if (!stations.length) return;
  const { block, core } = widths();
  const r = clamp(block / 6, 5, 11);
  const k = Math.max(0.5, state.cam.zoom);
  ctx.save();
  ctx.setLineDash([3 * k, 3 * k]);
  for (const s of stations) {
    const [x, y] = screen(...lifted(s));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = core + RIM_EXTRA;
    ctx.stroke();
    ctx.strokeStyle = CORE;
    ctx.lineWidth = core;
    ctx.stroke();
  }
  ctx.restore();
}
