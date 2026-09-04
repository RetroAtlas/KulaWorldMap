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

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Faces are lit by mixing toward white or toward the page ground rather than by
// scaling the channels, which would drain the colour out of the darker sides.
const shade = (hex, f, a = 1) => {
  const c = rgb(hex);
  const t = f >= 1 ? [255, 255, 255] : [14, 19, 30];
  const k = f >= 1 ? f - 1 : 1 - f;
  const m = c.map((v, i) => Math.round(v + (t[i] - v) * k));
  return `rgba(${m[0]} ${m[1]} ${m[2]} / ${a})`;
};

const FACE = { top: 1.16, right: 0.78, left: 0.55 };

function cube(g, px, py, faces, colour, edge) {
  const w = TILE.w * state.cam.z,
    h = TILE.h * state.cam.z,
    v = TILE.v * state.cam.z;
  const poly = {
    top: [
      [px, py - h],
      [px + w, py],
      [px, py + h],
      [px - w, py],
    ],
    left: [
      [px - w, py],
      [px, py + h],
      [px, py + h + v],
      [px - w, py + v],
    ],
    right: [
      [px + w, py],
      [px, py + h],
      [px, py + h + v],
      [px + w, py + v],
    ],
  };
  for (const face of ["top", "left", "right"]) {
    if (!faces[face]) continue;
    g.beginPath();
    poly[face].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = colour[face];
    g.fill();
    if (edge) {
      g.strokeStyle = edge;
      g.lineWidth = 1;
      g.stroke();
    }
  }
}

function visible(idx) {
  const out = [];
  for (const c of idx.cells.values()) {
    if (c.z > state.slice && !state.show.hidden) continue;
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
  ctx.fillStyle = "#111725";
  ctx.fillRect(0, 0, w, h);
  const l = state.lvl;
  if (!l) return;
  const idx = state.idx;
  const tint = WORLD_TINT[l.theme] || "#93a8d4";

  if (state.show.base) drawBase(l);

  const cells = visible(idx);
  if (pickStale) {
    pickList = [];
    pick.clearRect(0, 0, w, h);
  }

  const edges = state.cam.z > 0.28;
  for (const c of cells) {
    const [px0, py0] = plane(c.x, c.y, c.z);
    const px = sx(px0),
      py = sy(py0);
    if (px < -80 || px > w + 80 || py < -80 || py > h + 80) continue;
    const ghost = c.z > state.slice;
    const f = faceMask(idx, c);
    const objs = idx.objects.get(cellKey(c.x, c.y, c.z));
    const key = cellKey(c.x, c.y, c.z);
    const sel = state.selected?.key === key;
    const hov = state.hover?.key === key;
    const base = styleTint(tint, c.v);
    const lift = sel ? 0.22 : hov ? 0.12 : 0;
    const a = ghost ? 0.16 : 1;
    const colour = {
      top: shade(base, FACE.top + lift, a),
      left: shade(base, FACE.left + lift, a),
      right: shade(base, FACE.right + lift, a),
    };
    cube(ctx, px, py, f, colour, edges ? `rgba(9 13 20 / ${0.55 * a})` : null);

    if (pickStale && !ghost) {
      pickList.push(c);
      const id = pickList.length;
      const col = `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
      cube(
        pick,
        px,
        py,
        { top: true, left: true, right: true },
        { top: col, left: col, right: col },
        null,
      );
    }

    if (state.show.objects && objs && !ghost) drawObjects(objs, px, py);
    if (sel || hov) outline(px, py, sel ? "#ffffff" : "#ffffffb0");
  }
  pickStale = false;

  if (state.show.start && l.start) drawStart(l);
  drawScale();
}

// The five styles below firstRecord are drawn as steps of the world's tint,
// since what tells them apart in the engine is not decoded.
function styleTint(tint, v) {
  if (v >= state.data.firstRecord) return tint;
  const c = rgb(tint);
  const k = 0.16 * (v / Math.max(1, state.data.styles - 1));
  return (
    "#" +
    c
      .map((n) =>
        Math.round(n * (1 - k) + 232 * k)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
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
  const r = Math.max(4, 7 * state.cam.z);
  const top = py - h;
  ctx.strokeStyle = "rgba(232 238 251 / 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, top);
  ctx.lineTo(px, top - 7 * state.cam.z - (shown.length - 1) * (r * 1.8));
  ctx.stroke();
  shown.forEach((o, i) => {
    const oy = top - 7 * state.cam.z - i * (r * 1.8);
    ctx.fillStyle = kindColour(o.kind);
    ctx.strokeStyle = "rgba(9 13 20 / 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, oy - r);
    ctx.lineTo(px + r, oy);
    ctx.lineTo(px, oy + r);
    ctx.lineTo(px - r, oy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (state.show.labels && state.cam.z > 0.45) {
      label(kindName(o.kind, o.type) || `kind ${o.kind}/${o.type}`, px + r + 4, oy + 4, "#e8eefb");
    }
  });
}

function label(text, x, y, colour) {
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(9 13 20 / 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function drawStart(l) {
  const s = l.start;
  const mark = (p, colour, text) => {
    const [x, y] = plane(p[0], p[1], p[2]);
    const px = sx(x),
      py = sy(y) - TILE.h * state.cam.z - 16 * state.cam.z;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(5, 8 * state.cam.z), 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, 3 * state.cam.z), 0, 7);
    ctx.fill();
    label(text, px + Math.max(9, 12 * state.cam.z), py + 4, colour);
  };
  mark(s.at, "#7dff9b", "start");
  if (s.look && s.look.some((v) => v >= 0)) mark(s.look, "#ffcf6f", "look-at");
}

function drawBase(l) {
  const [x0, y0] = l.min,
    [x1, y1] = l.max;
  ctx.strokeStyle = "#ffffff20";
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
  ctx.strokeStyle = "#b3c0d4";
  ctx.lineWidth = 1.5;
  const len = n * TILE.w * 2 * state.cam.z;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + len, py);
  ctx.stroke();
  label(`${n} blocks`, px, py - 6, "#b3c0d4");
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
