import { state, SIDE, BLOCK, screen, cellKey } from "./state.js";

// A survey mark hangs below the block, where a decoded marker never goes, so
// the two readings of the same cell can be compared at a glance.
export function drawMark(ctx, m, c) {
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
    label(ctx, m.face ? `${m.name} ${m.face}` : m.name, px + r + 3, py + 4, "#ffd166");
  }
}

// A moving platform's route is the run between the middles of the two cells
// its record names, drawn faint and a cell at a time, so that a block in front
// of it hides it, its dashes carried across the cells so it reads as one line.
// The stretch inside the platform's own blocks, wherever they have got to, is
// left out.
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

export function label(ctx, text, x, y, colour) {
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(9 13 20 / 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

const LOOK_HOVER = 18 / BLOCK;

export function drawLook(ctx, l) {
  const p = l.camera.look;
  if (!p.every((v) => v >= 0 && v < SIDE)) return;
  const colour = "#ffcf6f";
  const [px, y] = screen(p[0] + 0.5, p[1] + 0.5, p[2] - LOOK_HOVER);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px, y, Math.max(5, 8 * state.cam.zoom), 0, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, y, Math.max(2, 3 * state.cam.zoom), 0, 7);
  ctx.fill();
  label(ctx, "camera target", px + Math.max(9, 12 * state.cam.zoom), y + 4, colour);
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
