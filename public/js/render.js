import { $ } from "./dom.js";
import { state, SIDE, TILE, plane, depth, sx, sy, cellKey } from "./state.js";
import { WORLD_TINT, kindColour, kindName } from "./data.js";

const cv = $("cv");
const ctx = cv.getContext("2d");

// A second canvas painted with one flat colour per cell, so a click can be
// resolved by reading a pixel rather than by intersecting cubes.
const pickCv = document.createElement("canvas");
const pick = pickCv.getContext("2d", { willReadFrequently: true });
let pickStale = true;
let pickList = [];

export const invalidatePick = () => {
  pickStale = true;
};

export function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth,
    h = cv.clientHeight;
  state.view = { w, h, dpr };
  for (const c of [cv, pickCv]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pick.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * f))),
  );
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
};

function cube(g, px, py, z, faces, top, left, right) {
  const w = TILE.w * state.cam.z,
    h = TILE.h * state.cam.z,
    v = TILE.v * state.cam.z;
  if (faces.top) {
    g.fillStyle = top;
    g.beginPath();
    g.moveTo(px, py - h);
    g.lineTo(px + w, py);
    g.lineTo(px, py + h);
    g.lineTo(px - w, py);
    g.closePath();
    g.fill();
  }
  if (faces.left) {
    g.fillStyle = left;
    g.beginPath();
    g.moveTo(px - w, py);
    g.lineTo(px, py + h);
    g.lineTo(px, py + h + v);
    g.lineTo(px - w, py + v);
    g.closePath();
    g.fill();
  }
  if (faces.right) {
    g.fillStyle = right;
    g.beginPath();
    g.moveTo(px + w, py);
    g.lineTo(px, py + h);
    g.lineTo(px, py + h + v);
    g.lineTo(px + w, py + v);
    g.closePath();
    g.fill();
  }
}

function visible(idx) {
  const out = [];
  for (const c of idx.cells.values()) {
    if (c.z > state.slice) continue;
    out.push(c);
  }
  out.sort((a, b) => depth(a.x, a.y, a.z) - depth(b.x, b.y, b.z));
  return out;
}

function faceMask(idx, c) {
  const r = state.rot & 3;
  // The two side faces that face the camera depend on which way the level is turned.
  const dx = [1, 0, -1, 0][r],
    dy = [0, 1, 0, -1][r];
  const ex = [0, -1, 0, 1][r],
    ey = [1, 0, -1, 0][r];
  const has = (x, y, z) => {
    const cell = idx.cells.get(cellKey(x, y, z));
    return cell !== undefined && cell.z <= state.slice;
  };
  return {
    top: !has(c.x, c.y, c.z + 1),
    left: !has(c.x + ex, c.y + ey, c.z),
    right: !has(c.x + dx, c.y + dy, c.z),
  };
}

export function draw() {
  const { w, h } = state.view;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0d1017";
  ctx.fillRect(0, 0, w, h);
  const l = state.lvl;
  if (!l) return;
  const idx = state.idx;
  const tint = WORLD_TINT[l.theme] || "#8899aa";

  if (state.show.base) drawBase(l);

  const cells = visible(idx);
  if (pickStale) {
    pickList = [];
    pick.clearRect(0, 0, w, h);
  }

  for (const c of cells) {
    const [px0, py0] = plane(c.x, c.y, c.z);
    const px = sx(px0),
      py = sy(py0);
    if (px < -80 || px > w + 80 || py < -80 || py > h + 80) continue;
    const f = faceMask(idx, c);
    const objs = idx.objects.get(cellKey(c.x, c.y, c.z));
    const special = c.v >= state.data.firstRecord;
    const base = special ? tint : shade(tint, 0.72 + c.v * 0.045);
    const sel = state.selected && state.selected.key === cellKey(c.x, c.y, c.z);
    const hov = state.hover && state.hover.key === cellKey(c.x, c.y, c.z);
    const lift = sel ? 1.5 : hov ? 1.25 : 1;
    cube(
      ctx,
      px,
      py,
      c.z,
      f,
      shade(base, 1.0 * lift),
      shade(base, 0.55 * lift),
      shade(base, 0.72 * lift),
    );

    if (pickStale) {
      pickList.push(c);
      const id = pickList.length;
      const col = `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
      cube(pick, px, py, c.z, { top: true, left: true, right: true }, col, col, col);
    }

    if (state.show.objects && objs) drawObjects(objs, px, py);
    if (sel || hov) outline(px, py, sel ? "#ffffff" : "#ffffffa0");
  }
  pickStale = false;

  if (state.show.start && l.start) drawStart(l);
  drawScale();
}

function outline(px, py, colour) {
  const w = TILE.w * state.cam.z,
    h = TILE.h * state.cam.z,
    v = TILE.v * state.cam.z;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, py - h);
  ctx.lineTo(px + w, py);
  ctx.lineTo(px + w, py + v);
  ctx.lineTo(px, py + h + v);
  ctx.lineTo(px - w, py + v);
  ctx.lineTo(px - w, py);
  ctx.closePath();
  ctx.stroke();
}

function drawObjects(objs, px, py) {
  const h = TILE.h * state.cam.z;
  const shown = objs.filter((o) => !state.hiddenKinds.has(`${o.kind}/${o.type}`));
  if (!shown.length) return;
  const r = Math.max(3, 6 * state.cam.z);
  shown.forEach((o, i) => {
    const oy = py - h - 5 * state.cam.z - i * (r * 1.6);
    ctx.fillStyle = kindColour(o.kind);
    ctx.strokeStyle = "#0d1017";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px, oy - r);
    ctx.lineTo(px + r, oy);
    ctx.lineTo(px, oy + r);
    ctx.lineTo(px - r, oy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (state.show.labels && state.cam.z > 0.55) {
      ctx.fillStyle = "#dfe6f2";
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillText(kindName(o.kind, o.type) || `${o.kind}/${o.type}`, px + r + 3, oy + 3);
      ctx.textAlign = "start";
    }
  });
}

function drawStart(l) {
  const s = l.start;
  const mark = (p, colour, label) => {
    const [x, y] = plane(p[0], p[1], p[2]);
    const px = sx(x),
      py = sy(y) - TILE.h * state.cam.z - 16 * state.cam.z;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(4, 7 * state.cam.z), 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.5, 2.5 * state.cam.z), 0, 7);
    ctx.fill();
    ctx.font = "11px ui-sans-serif, system-ui";
    ctx.fillText(label, px + 11 * state.cam.z, py + 4);
  };
  mark(s.at, "#7dff9b", "start");
  if (s.look && s.look.some((v) => v >= 0)) mark(s.look, "#ffcf6f", "look-at");
}

function drawBase(l) {
  const [x0, y0] = l.min,
    [x1, y1] = l.max;
  ctx.strokeStyle = "#ffffff12";
  ctx.lineWidth = 1;
  for (let x = x0; x <= x1 + 1; x++) {
    const a = plane(x - 0.5, y0 - 0.5, l.min[2]);
    const b = plane(x - 0.5, y1 + 0.5, l.min[2]);
    ctx.beginPath();
    ctx.moveTo(sx(a[0]), sy(a[1]));
    ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.stroke();
  }
  for (let y = y0; y <= y1 + 1; y++) {
    const a = plane(x0 - 0.5, y - 0.5, l.min[2]);
    const b = plane(x1 + 0.5, y - 0.5, l.min[2]);
    ctx.beginPath();
    ctx.moveTo(sx(a[0]), sy(a[1]));
    ctx.lineTo(sx(b[0]), sy(b[1]));
    ctx.stroke();
  }
}

function drawScale() {
  const n = 4;
  const px = 18,
    py = state.view.h - 26;
  ctx.strokeStyle = "#8b97ab";
  ctx.lineWidth = 1;
  const len = n * TILE.w * 2 * state.cam.z;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + len, py);
  ctx.stroke();
  ctx.fillStyle = "#8b97ab";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillText(`${n} blocks`, px, py - 5);
}

/** The cell under a client point, or null. */
export function cellAt(cx, cy) {
  if (pickStale) draw();
  const d = state.view.dpr;
  const p = pick.getImageData(Math.round(cx * d), Math.round(cy * d), 1, 1).data;
  const id = p[0] | (p[1] << 8) | (p[2] << 16);
  if (!id || id > pickList.length || p[3] === 0) return null;
  return pickList[id - 1];
}
