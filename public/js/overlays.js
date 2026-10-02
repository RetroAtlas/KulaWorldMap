import { state, BLOCK, screen, cellKey } from "./state.js";
import { FACE_NORMAL } from "./faces.js";
import { startsOf, markerHeading, cross } from "./data.js";
import { bow, arrow } from "./arrow.js";

/** A block's survey marks: one dot, and a line a mark. */
export function drawMark(ctx, ms, c) {
  const [px, py] = screen(c.x + 0.5, c.y + 0.5, c.z + 1);
  const r = Math.max(3, 5 * state.cam.zoom);
  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "rgba(9 13 20 / 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, 7);
  ctx.fill();
  ctx.stroke();
  if (state.cam.zoom > 0.4) {
    ms.forEach((m, i) =>
      label(ctx, m.face ? `${m.name} ${m.face}` : m.name, px + r + 3, py + 4 + 12 * i, "#ffd166"),
    );
  }
}

// A route is drawn a cell at a time, its dashes carried across the cells so it
// reads as one line, and left out inside the platform's own blocks wherever
// they have got to.
export function drawRails(ctx, c, ghost, moving) {
  for (const { a, b, axis, cell, length } of c.rails) {
    const lo = Math.min(a[axis], b[axis]) + 0.5;
    const hi = Math.max(a[axis], b[axis]) + 0.5;
    const at = (v) => {
      const p = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
      p[axis] = v;
      return screen(...p);
    };
    const offset = moving?.get(`${cellKey(...cell)}/null`)?.offset ?? [0, 0, 0];
    const near = cell[axis] + offset[axis];
    const far = near + length;
    const t = [c.x, c.y, c.z][axis];
    const from = Math.max(t, lo);
    const to = Math.min(t + 1, hi);
    const [p, q] = [at(lo), at(lo + 1)];
    const block = Math.hypot(q[0] - p[0], q[1] - p[1]);
    ctx.save();
    ctx.strokeStyle = "rgba(232 238 251 / 0.5)";
    ctx.globalAlpha = ghost ? 0.16 : 1;
    ctx.lineWidth = Math.max(1, 1.5 * state.cam.zoom);
    ctx.setLineDash([2 * state.cam.zoom, 5 * state.cam.zoom]);
    for (const [s, e] of [
      [from, Math.min(to, near)],
      [Math.max(from, far), to],
    ]) {
      if (e <= s) continue;
      ctx.lineDashOffset = (s - lo) * block;
      const [u, v] = [at(s), at(e)];
      ctx.beginPath();
      ctx.moveTo(u[0], u[1]);
      ctx.lineTo(v[0], v[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}

const LINK_HOVER = 0.3;
const LINK_RIM = "rgba(9 13 20 / 0.8)";
export function drawLink(ctx, from, to, colour, dark) {
  const at = (c) => {
    const n = FACE_NORMAL[c.face];
    return screen(...[c.x, c.y, c.z].map((v, i) => v + 0.5 + n[i] * (0.5 + LINK_HOVER)));
  };
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const block = state.cam.zoom * BLOCK;
  const width = clamp(block / 16, 1.75, 3);
  const head = clamp(block / 3, 9, 15);
  const curve = bow(...at(from), ...at(to), { min: 2 * head, loop: 3 * head });
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [ink, rim] of [
    [LINK_RIM, 3],
    [colour, 0],
  ]) {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = width + rim;
    ctx.setLineDash(dark ? [2 * width, 4 * width] : []);
    arrow(ctx, curve, head);
    if (rim) ctx.stroke();
  }
  ctx.restore();
}

export function label(ctx, text, x, y, colour) {
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(9 13 20 / 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

// The game's view at rest, in its own units: pitched down from the ball's
// heading, the middle of the face under the ball below the view's middle and
// ahead of the eye, on a screen given as its half-width and half-height over its
// distance.
const PITCH = (250 / 4096) * 2 * Math.PI;
const BELOW = 250 / 512;
const AHEAD = 800 / 512;
const HALF_WIDE = 160 / 160;
const HALF_HIGH = 120 / 160;

const along = (p, ...terms) => terms.reduce((q, [k, v]) => q.map((c, i) => c + k * v[i]), p);

/** Where the game's camera stands as the level opens, and the corners of what
    it sees at the depth of the face under the ball. */
export function startCamera(l) {
  const [start] = startsOf(l);
  const heading = start && markerHeading(start);
  if (!heading) return null;
  const up = FACE_NORMAL[start.face];
  const right = cross(heading, up);
  const [c, s] = [Math.cos(PITCH), Math.sin(PITCH)];
  const ahead = along([0, 0, 0], [c, heading], [-s, up]);
  const down = along([0, 0, 0], [-c, up], [-s, heading]);
  const under = along([start.x + 0.5, start.y + 0.5, start.z + 0.5], [0.5, up]);
  const eye = along(under, [-AHEAD, ahead], [-BELOW, down]);
  const sees = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) =>
    along(eye, [AHEAD, ahead], [x * AHEAD * HALF_WIDE, right], [y * AHEAD * HALF_HIGH, down]),
  );
  return { eye, sees };
}

export function drawCamera(ctx, l) {
  const camera = startCamera(l);
  if (!camera) return;
  const corners = camera.sees.map((p) => screen(...p));
  const [ex, ey] = screen(...camera.eye);
  const colour = "#ffcf6f";
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.12;
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.beginPath();
  for (const [x, y] of corners) {
    ctx.moveTo(ex, ey);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(3, 3 * state.cam.zoom), 0, 7);
  ctx.fill();
  ctx.restore();
}

export function drawBase(ctx, l) {
  const [x0, y0] = l.min,
    [x1, y1, z1] = l.max;
  const z0 = z1 + 1;
  ctx.strokeStyle = "#ffffff20";
  ctx.lineWidth = 1;
  const line = (a, b) => {
    const p = screen(...a),
      q = screen(...b);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  for (let x = x0; x <= x1 + 1; x++) line([x, y0, z0], [x, y1 + 1, z0]);
  for (let y = y0; y <= y1 + 1; y++) line([x0, y, z0], [x1 + 1, y, z0]);
}

export function drawScale(ctx) {
  const n = 4;
  const px = 18,
    py = state.view.h - 26;
  const len = n * BLOCK * state.cam.zoom;
  ctx.strokeStyle = "#b3c0d4";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + len, py);
  ctx.stroke();
  label(ctx, `${n} blocks`, px, py - 6, "#b3c0d4");
}
