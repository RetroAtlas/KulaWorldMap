import { $ } from "./dom.js";
import { state, SIDE, BLOCK, project, depth, facing, screen, cellKey, camera } from "./state.js";
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

// The six faces of a unit cube: outward normal, the neighbour it hides behind,
// and its corners. Lighting comes from the world, not from the screen, so a
// face keeps its brightness as the view turns and the solid reads as solid.
const FACES = [
  {
    n: [0, 0, 1],
    d: [0, 0, 1],
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    d: [0, 0, -1],
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    n: [1, 0, 0],
    d: [1, 0, 0],
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    d: [-1, 0, 0],
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    d: [0, 1, 0],
    c: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    d: [0, -1, 0],
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
];

const LIGHT = (() => {
  const v = [0.35, -0.55, 0.78];
  const m = Math.hypot(...v);
  return v.map((x) => x / m);
})();

const lit = FACES.map((f) => {
  const d = f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2];
  return 0.5 + 0.75 * (0.5 + 0.5 * d);
});

function visible(idx) {
  const out = [];
  for (const c of idx.cells.values()) {
    if (c.z > state.slice && !state.show.hidden) continue;
    out.push(c);
  }
  out.sort((a, b) => depth(b.x, b.y, b.z) - depth(a.x, a.y, a.z));
  return out;
}

function cube(g, c, idx, colour, edge, alpha) {
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  for (let i = 0; i < FACES.length; i++) {
    const f = FACES[i];
    if (!facing(f.n)) continue;
    const nb = idx.cells.get(cellKey(c.x + f.d[0], c.y + f.d[1], c.z + f.d[2]));
    if (nb && nb.z <= state.slice) continue;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const [dx, dy, dz] = f.c[k];
      const [px, py] = project(dx, dy, dz);
      const x = ox + px * s,
        y = oy + py * s;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = colour ? colour(i) : edge;
    g.fill();
    if (edge && colour) {
      g.strokeStyle = edge;
      g.lineWidth = 1;
      g.stroke();
    }
  }
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
  const edges = state.cam.zoom > 0.3;

  for (const c of cells) {
    const [px, py] = screen(c.x, c.y, c.z);
    const r = BLOCK * state.cam.zoom * 2;
    if (px < -r || px > w + r || py < -r || py > h + r) continue;
    const ghost = c.z > state.slice;
    const key = cellKey(c.x, c.y, c.z);
    const sel = state.selected?.key === key;
    const hov = state.hover?.key === key;
    const base = styleTint(tint, c.v);
    const boost = sel ? 0.22 : hov ? 0.12 : 0;
    const a = ghost ? 0.16 : 1;
    cube(
      ctx,
      c,
      idx,
      (i) => shade(base, lit[i] + boost, a),
      edges ? `rgba(9 13 20 / ${0.55 * a})` : null,
      a,
    );

    if (pickStale && !ghost) {
      pickList.push(c);
      const id = pickList.length;
      const col = `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
      cube(pick, c, { cells: new Map() }, () => col, null, 1);
    }

    if (state.show.objects && !ghost) {
      const objs = idx.objects.get(key);
      if (objs) drawObjects(objs, c);
    }
    if (sel || hov) outline(c, idx, sel ? "#ffffff" : "#ffffffb0");
  }
  pickStale = false;

  if (state.show.start && l.start) drawStart(l);
  drawScale();
}

function outline(c, idx, colour) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  for (const f of FACES) {
    if (!facing(f.n)) continue;
    ctx.beginPath();
    f.c.forEach(([dx, dy, dz], k) => {
      const [px, py] = project(dx, dy, dz);
      const x = ox + px * s,
        y = oy + py * s;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/** The screen point just above a cell's top face, where its markers sit. */
function above(c) {
  const [px, py] = screen(c.x + 0.5, c.y + 0.5, c.z + 1);
  return [px, py];
}

function drawObjects(objs, c) {
  const shown = objs.filter((o) => !state.hiddenKinds.has(`${o.kind}/${o.type}`));
  if (!shown.length) return;
  const [px, top] = above(c);
  const r = Math.max(4, 7 * state.cam.zoom);
  ctx.strokeStyle = "rgba(232 238 251 / 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, top);
  ctx.lineTo(px, top - 8 * state.cam.zoom - (shown.length - 1) * (r * 1.8));
  ctx.stroke();
  shown.forEach((o, i) => {
    const oy = top - 8 * state.cam.zoom - i * (r * 1.8);
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
    if (state.show.labels && state.cam.zoom > 0.45) {
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
  const mark = (p, colour, text) => {
    const [px, py] = screen(p[0] + 0.5, p[1] + 0.5, p[2] + 1);
    const y = py - 18 * state.cam.zoom;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, y, Math.max(5, 8 * state.cam.zoom), 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, y, Math.max(2, 3 * state.cam.zoom), 0, 7);
    ctx.fill();
    label(text, px + Math.max(9, 12 * state.cam.zoom), y + 4, colour);
  };
  mark(l.start.at, "#7dff9b", "start");
  const look = l.start.look;
  if (look && look.every((v) => v >= 0 && v < SIDE)) mark(look, "#ffcf6f", "look-at");
}

function drawBase(l) {
  const [x0, y0, z0] = l.min,
    [x1, y1] = l.max;
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

function drawScale() {
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
