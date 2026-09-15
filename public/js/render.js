import { $ } from "./dom.js";
import { state, SIDE, BLOCK, project, depth, facing, screen, cellKey, sliceZ } from "./state.js";
import {
  WORLD_TINT,
  OFF_LATTICE,
  FACE_NORMAL,
  FACE_NAME,
  markerColour,
  markerLabel,
  markerFacing,
  markerState,
  markerModel,
  markerSpins,
  modelUnit,
  beamColour,
} from "./data.js";

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
  // A zero size means the page is not laid out; keeping the old one leaves
  // something sane to draw with rather than dividing by nothing.
  if (!w || !h) return;
  if (state.view.w === w && state.view.h === h && state.view.dpr === dpr) return;
  state.view = { w, h, dpr };
  for (const c of [cv, pickCv]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  pick.setTransform(dpr, 0, 0, dpr, 0, 0);
  invalidatePick();
  if (state.needsFit) refit();
  draw();
}

let refit = () => {};
export const onFirstSize = (fn) => {
  refit = fn;
};

// The canvas resizes for reasons no window event reports: the sidebar slides
// over 180ms, the pane changes, the page zooms. Measuring on a timer after any
// of those catches an intermediate width and leaves the backing store scaled
// against the element, which puts the picture and the pointer on different
// grids. Watching the element itself is the only reading that cannot go stale.
new ResizeObserver(() => resize()).observe(cv);

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
// The atlas is one row per world and, along it, each block style in each of the
// three shades the game ships it pre-lit with.
const ATLAS = { img: new Image(), ready: false, size: 64, shades: 3 };
ATLAS.img.onload = () => {
  ATLAS.ready = true;
  invalidatePick();
  draw();
};
ATLAS.img.src = "tex/blocks.png";

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
  const v = [0.35, -0.55, -0.78];
  const m = Math.hypot(...v);
  return v.map((x) => x / m);
})();

const lit = FACES.map((f) => {
  const d = f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2];
  return 0.5 + 0.75 * (0.5 + 0.5 * d);
});

// Which of the three shipped shades a face wears. Fixed in the world rather
// than on the screen, so a face keeps its brightness as the view turns.
const SHADE = FACES.map((f) =>
  f.n[2] < 0 ? 2 : f.n[2] > 0 ? 0 : f.n[0] > 0 || f.n[1] < 0 ? 1 : 0,
);

function visible(idx) {
  const out = [];
  for (const c of idx.cells.values()) {
    if (c.z < sliceZ() && !state.show.hidden) continue;
    out.push(c);
  }
  out.sort((a, b) => depth(b.x, b.y, b.z) - depth(a.x, a.y, a.z));
  return out;
}

function cube(g, c, idx, colour, edge, alpha, skin) {
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  for (let i = 0; i < FACES.length; i++) {
    const f = FACES[i];
    if (!facing(f.n)) continue;
    const nb = idx.cells.get(cellKey(c.x + f.d[0], c.y + f.d[1], c.z + f.d[2]));
    if (nb && nb.z >= sliceZ()) continue;
    const pts = f.c.map(([dx, dy, dz]) => {
      const [px, py] = project(dx, dy, dz);
      return [ox + px * s, oy + py * s];
    });
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (skin) {
      g.save();
      g.clip();
      paint(g, pts, skin, SHADE[i], alpha);
      g.restore();
    } else {
      g.fillStyle = colour ? colour(i) : edge;
      g.fill();
    }
    if (edge) {
      g.strokeStyle = edge;
      g.lineWidth = 1;
      g.stroke();
    }
  }
}

/** Map the atlas cell onto a face, which orthographic projection keeps a
    parallelogram, so an affine transform lands it exactly. */
function paint(g, pts, skin, shade, alpha) {
  const n = ATLAS.size;
  const [p0, p1, , p3] = pts;
  const ex = [(p1[0] - p0[0]) / n, (p1[1] - p0[1]) / n];
  const ey = [(p3[0] - p0[0]) / n, (p3[1] - p0[1]) / n];
  const d = state.view.dpr;
  g.globalAlpha = alpha;
  g.setTransform(d * ex[0], d * ex[1], d * ey[0], d * ey[1], d * p0[0], d * p0[1]);
  const sx = (skin.style * ATLAS.shades + shade) * n;
  g.drawImage(ATLAS.img, sx + 0.5, skin.world * n + 0.5, n - 1, n - 1, 0, 0, n, n);
  g.setTransform(d, 0, 0, d, 0, 0);
  g.globalAlpha = 1;
}

// Without textures a block is a step of the world's tint by kind.
function kindTint(tint, kind) {
  const c = rgb(tint);
  const k = 0.16 * (Math.min(kind, state.data.styles - 1) / Math.max(1, state.data.styles - 1));
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

// How a kind of block reads over its skin: a wash for what the game paints
// onto the block, and a fainter, broken cube for a block that is not solidly
// there, whether never seen, gone once rolled on, or gone half the time.
const LOOK = {
  1: { wash: "rgba(255 70 30 / 0.45)" },
  2: { wash: "rgba(160 225 255 / 0.45)" },
  3: { alpha: 0.35, dash: [3, 3] },
  6: { wash: "rgba(0 0 0 / 0.3)", dash: [6, 3] },
  7: { alpha: 0.55, dash: [2, 4] },
};

/** The kind of block a cell draws: its style, or the kind of the record it names. */
function kindOf(c, idx, key) {
  if (c.v === OFF_LATTICE) return 0;
  if (c.v < state.data.firstRecord) return c.v;
  return idx.records.get(key)?.[0]?.kind ?? 0;
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
  const world = state.data.themes.findIndex((t) => t.id === l.theme);

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
    const ghost = c.z < sliceZ();
    const key = cellKey(c.x, c.y, c.z);
    const sel = state.selected?.key === key;
    const hov = state.hover?.key === key;
    const kind = kindOf(c, idx, key);
    const look = LOOK[kind] || {};
    const base = kindTint(tint, kind);
    const boost = sel ? 0.22 : hov ? 0.12 : 0;
    const a = (ghost ? 0.16 : 1) * (look.alpha ?? 1);
    // A block wears the skin of its kind, and a kind past the skinned ones
    // wears the plain stone with its marker saying what it is.
    const skin =
      state.show.skins && ATLAS.ready && world >= 0
        ? { world, style: kind < state.data.styles ? kind : 0 }
        : null;
    cube(
      ctx,
      c,
      idx,
      (i) => shade(base, lit[i] + boost, a),
      edges ? `rgba(9 13 20 / ${0.55 * a})` : null,
      a,
      skin,
    );
    if (look.wash) cube(ctx, c, idx, () => look.wash, null, a, null);
    if (look.dash && !ghost) outline(c, idx, "rgba(232 238 251 / 0.7)", look.dash);
    if (skin && (sel || hov)) {
      cube(ctx, c, idx, () => `rgba(255 255 255 / ${sel ? 0.22 : 0.12})`, null, a, null);
    }

    if (pickStale && !ghost) {
      pickList.push(c);
      const id = pickList.length;
      const col = `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
      cube(pick, c, { cells: new Map() }, () => col, null, 1, null);
    }

    if (state.show.objects && !ghost) {
      const marks = idx.markers.get(key);
      if (marks) for (const m of marks) drawThing(m, c, l);
    }
    if (state.survey.on && !ghost) {
      const m = state.survey.marks.get(key);
      if (m) drawMark(m, c);
    }
    if (sel || hov) outline(c, idx, sel ? "#ffffff" : "#ffffffb0");
  }
  pickStale = false;

  for (const r of idx.rails) drawRail(r);
  for (const r of idx.rays) drawBeam(r);
  if (state.show.start && l.camera) drawLook(l);
  drawScale();
  if (spinning) animate();
}

// The things that turn in play turn here, which means drawing again every
// frame while any is on screen and the page is looked at; the frame is cheap
// enough, and the loop ends itself when there is nothing left turning.
let spinning = false;
let queuedFrame = 0;
function animate() {
  if (queuedFrame || document.hidden) return;
  queuedFrame = requestAnimationFrame(() => {
    queuedFrame = 0;
    spinning = false;
    draw();
  });
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) draw();
});

/** An object as itself where it has a mesh and the display asks for it, else its marker. */
function drawThing(m, c, l) {
  if (state.hiddenKinds.has(m.id)) return;
  const model = state.show.models ? markerModel(m, l) : null;
  if (!model) return drawMarker(m, c);
  drawObject(m, c, model);
  if (state.show.labels && state.cam.zoom > 0.45) {
    const [px, py] = off(c, m.face, OBJECT_HOVER);
    const dark = markerState(m) === "off" ? " · off" : "";
    label(markerLabel(m) + dark + ` · ${FACE_NAME[m.face]}`, px + 8, py + 4, "#e8eefb");
  }
}

// An object is its mesh stood on its face: the model's y runs along the face's
// outward normal, its z along the way the thing points where it has one, and
// its lowest vertex sits just off the face. The polygons are filled back to
// front in their own colours, since the shading is baked into them, and both
// sides are drawn, since the meshes wind their faces either way. A thing on a
// face turned away from the view is drawn faint, like its marker.
const SPIN = 0.35; // turns per second
const GAP = 0.03; // between a thing and its face, in blocks
const TANGENT = [
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, -1],
  [0, 0, -1],
  [0, 0, -1],
  [0, 1, 0],
];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function drawObject(m, c, model) {
  const up = FACE_NORMAL[m.face];
  const heading = markerFacing(m);
  const forward =
    heading !== null && !FACE_NORMAL[heading].some((v, i) => v && up[i])
      ? FACE_NORMAL[heading]
      : TANGENT[m.face];
  let turn = 0;
  if (markerSpins(m)) {
    spinning = true;
    const phase = ((c.x * 7 + c.y * 13 + c.z * 5) % 17) / 17;
    turn = (performance.now() / 1000) * SPIN * Math.PI * 2 + phase * Math.PI * 2;
  }
  const side = cross(up, forward);
  const ct = Math.cos(turn),
    st = Math.sin(turn);
  const fwd = forward.map((v, i) => v * ct + side[i] * st);
  const right = cross(up, fwd);
  const unit = modelUnit();
  const lift = GAP + Math.max(0, -model.box[0][1]) * unit;
  const o = at(c, m.face, lift);
  const frame =
    model.frames[
      model.frames.length > 1 ? Math.floor(performance.now() / 60) % model.frames.length : 0
    ];
  if (model.frames.length > 1) spinning = true;
  const pts = [];
  for (let i = 0; i < frame.length; i += 3) {
    const x = frame[i] * unit,
      y = frame[i + 1] * unit,
      z = frame[i + 2] * unit;
    const wx = o[0] + x * right[0] + y * up[0] + z * fwd[0];
    const wy = o[1] + x * right[1] + y * up[1] + z * fwd[1];
    const wz = o[2] + x * right[2] + y * up[2] + z * fwd[2];
    pts.push([...screen(wx, wy, wz), depth(wx, wy, wz)]);
  }
  const away = !facing(up);
  const polys = [];
  model.polys.forEach((poly, k) => {
    const p = poly.map((i) => pts[i]);
    const rgb = model.rgb[k];
    const n = poly.length;
    const mean = [0, 1, 2].map((ch) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += rgb[i * 3 + ch];
      return Math.round(sum / n);
    });
    let z = 0;
    for (const q of p) z += q[2];
    polys.push({ p, z: z / n, fill: mean, blend: model.flags[k] & 2 });
  });
  polys.sort((a, b) => b.z - a.z);
  ctx.save();
  if (away) ctx.globalAlpha = 0.3;
  for (const { p, fill, blend } of polys) {
    ctx.fillStyle = `rgba(${fill[0]} ${fill[1]} ${fill[2]} / ${blend ? 0.75 : 1})`;
    ctx.beginPath();
    p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function outline(c, idx, colour, dash = []) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.setLineDash(dash.map((d) => d * Math.max(0.5, state.cam.zoom)));
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

// A marker hovers off the face its object stands on, and the hover is a
// distance in the world rather than on the screen: a screen offset does not
// shrink as the view turns overhead, so it would carry the marker onto the
// next block in a plan view, which is the one view a reader uses to say which
// block is which. A record that is its own thing hovers over the top.
const OBJECT_HOVER = 8 / BLOCK;
const LOOK_HOVER = 18 / BLOCK;

/** The world point off the centre of one of a cell's faces. */
function at(c, face, hover = 0) {
  const n = FACE_NORMAL[face];
  const d = 0.5 + hover;
  return [c.x + 0.5 + n[0] * d, c.y + 0.5 + n[1] * d, c.z + 0.5 + n[2] * d];
}
const off = (c, face, hover = 0) => screen(...at(c, face, hover));

// The way a thing points is drawn as a stroke from its marker, in the world
// rather than on the screen, so it turns with the view.
const FACING_REACH = 0.45;
function drawFacing(m, c, face, colour) {
  const d = markerFacing(m);
  if (d === null) return;
  const n = FACE_NORMAL[d];
  const from = at(c, face, OBJECT_HOVER);
  const [px, py] = screen(...from);
  const [qx, qy] = screen(
    from[0] + n[0] * FACING_REACH,
    from[1] + n[1] * FACING_REACH,
    from[2] + n[2] * FACING_REACH,
  );
  const r = Math.max(2, 3 * state.cam.zoom);
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = Math.max(1.5, 2 * state.cam.zoom);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(qx, qy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(qx, qy, r, 0, 7);
  ctx.fill();
}

// A marker stands for one thing: an object on a face, or a record of a kind
// that is more than a block. Colour tells the two apart, and the number is the
// type or the kind, of which there are too many for an encoding a reader could
// hold, so the marker says it outright once it has the room. One on a face
// turned away from the view is drawn faint rather than left out, since a plan
// view is the one a reader counts from, and a device that starts switched off
// is drawn hollow, the way a beam that starts dark is drawn broken.
function drawMarker(m, c) {
  if (state.hiddenKinds.has(m.id)) return;
  const face = m.face ?? 0;
  const away = m.face !== null && !facing(FACE_NORMAL[face]);
  const dark = markerState(m) === "off";
  const colour = markerColour(m);
  const ink = "rgba(9 13 20 / 0.9)";
  const [fx, fy] = off(c, face);
  const [px, py] = off(c, face, OBJECT_HOVER);
  const r = Math.max(4, 7 * state.cam.zoom);
  ctx.save();
  if (away) ctx.globalAlpha = 0.4;
  ctx.strokeStyle = "rgba(232 238 251 / 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(px, py);
  ctx.stroke();

  drawFacing(m, c, face, colour);
  ctx.fillStyle = dark ? "#111725" : colour;
  ctx.strokeStyle = dark ? colour : ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, py - r);
  ctx.lineTo(px + r, py);
  ctx.lineTo(px, py + r);
  ctx.lineTo(px - r, py);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (r >= 9) {
    ctx.font = `${Math.round(r * 0.95)}px ui-monospace, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = dark ? colour : "rgba(9 13 20 / 0.85)";
    ctx.fillText(String(m.face === null ? m.kind : m.type), px, py + 0.5);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }
  if (state.show.labels && state.cam.zoom > 0.45) {
    const side = m.face ? ` · ${FACE_NAME[m.face]}` : "";
    label(markerLabel(m) + (dark ? " · off" : "") + side, px + r + 4, py + 4, "#e8eefb");
  }
  ctx.restore();
}

// A survey mark hangs below the block, where a decoded marker never goes, so
// the two readings of the same cell can be compared at a glance.
function drawMark(m, c) {
  const [px, py] = screen(c.x + 0.5, c.y + 0.5, c.z);
  const r = Math.max(3, 5 * state.cam.zoom);
  ctx.fillStyle = "#ffd166";
  ctx.strokeStyle = "rgba(9 13 20 / 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, 7);
  ctx.fill();
  ctx.stroke();
  if (state.cam.zoom > 0.4) {
    label(m.face ? `${m.name} ${m.face}` : m.name, px + r + 3, py + 4, "#ffd166");
  }
}

// A beam is drawn over the blocks rather than among them: it runs through the
// space between its ends, and showing where it goes is worth more than letting
// a block in front of it hide it. A circuit nobody has yet seen lit draws in
// plain ink rather than in a guess.
function drawBeam({ a, b, lit, colour }) {
  const p = screen(a[0] + 0.5, a[1] + 0.5, a[2] + 0.5);
  const q = screen(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5);
  ctx.save();
  ctx.strokeStyle = beamColour(colour) || "#e8eefb";
  ctx.lineWidth = Math.max(1.5, 2.5 * state.cam.zoom);
  if (!lit) {
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4 * state.cam.zoom, 4 * state.cam.zoom]);
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
}

// A moving platform's rail is the run between the two cells its record names,
// drawn faint, since the block itself is drawn where the level keeps it.
function drawRail({ a, b }) {
  const p = screen(a[0] + 0.5, a[1] + 0.5, a[2] + 0.5);
  const q = screen(b[0] + 0.5, b[1] + 0.5, b[2] + 0.5);
  ctx.save();
  ctx.strokeStyle = "rgba(232 238 251 / 0.5)";
  ctx.lineWidth = Math.max(1, 1.5 * state.cam.zoom);
  ctx.setLineDash([2 * state.cam.zoom, 5 * state.cam.zoom]);
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
  ctx.restore();
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

function drawLook(l) {
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
  label("look-at", px + Math.max(9, 12 * state.cam.zoom), y + 4, colour);
}

function drawBase(l) {
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
  // Read the scale off the two canvases rather than assuming it is the device
  // ratio. Whenever the backing store and the element disagree the browser
  // stretches one onto the other, and a hit test that assumed otherwise would
  // land further from the pointer the further it got from the centre.
  const kx = pickCv.width / Math.max(1, cv.clientWidth);
  const ky = pickCv.height / Math.max(1, cv.clientHeight);
  const px = Math.round(cx * kx),
    py = Math.round(cy * ky);
  if (px < 0 || py < 0 || px >= pickCv.width || py >= pickCv.height) return null;
  const p = pick.getImageData(px, py, 1, 1).data;
  const id = p[0] | (p[1] << 8) | (p[2] << 16);
  if (!id || id > pickList.length || p[3] === 0) return null;
  return pickList[id - 1];
}
