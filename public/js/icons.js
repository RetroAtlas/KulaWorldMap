import { state, SIDE, basisAt } from "./state.js";
import { WORLD_TINT, skinsTable } from "./data.js";
import { atlasFor, paint } from "./atlas.js";
import { lookOf, faceSkin, platformPlace } from "./skins.js";
import { FACES, SKINNED_LOOK, shadeOf, flatFace } from "./blocks.js";

// A model drawn small, once, in the same three-quarter view for every one, so
// a legend or a heading can show the thing rather than a dot beside a number.
// The view is fixed rather than the map's, since an icon is for telling a key
// from a coin, not for saying which way either faces.
const DEG = Math.PI / 180;
const YAW = 35 * DEG;
const PITCH = 28 * DEG;
const RIGHT = [Math.cos(YAW), 0, -Math.sin(YAW)];
const UP = [-Math.sin(PITCH) * Math.sin(YAW), Math.cos(PITCH), -Math.sin(PITCH) * Math.cos(YAW)];
const TOWARD = [Math.cos(PITCH) * Math.sin(YAW), Math.sin(PITCH), Math.cos(PITCH) * Math.cos(YAW)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const GLASS = 0.55;

const drawn = new WeakMap();

/** A fresh canvas of the model, `size` CSS pixels square. */
export function iconFor(model, size = 22) {
  let sizes = drawn.get(model);
  if (!sizes) drawn.set(model, (sizes = new Map()));
  let master = sizes.get(size);
  if (!master) sizes.set(size, (master = render(model, size)));
  const cv = document.createElement("canvas");
  cv.width = master.width;
  cv.height = master.height;
  cv.style.width = cv.style.height = `${size}px`;
  cv.className = "icon";
  cv.getContext("2d").drawImage(master, 0, 0);
  return cv;
}

const bounds = (frame) =>
  [Math.min, Math.max].map((pick) =>
    [0, 1, 2].map((k) => pick(...frame.filter((_, i) => i % 3 === k))),
  );
const span = (frame) => {
  const [lo, hi] = bounds(frame);
  return Math.hypot(...hi.map((v, i) => v - lo[i]));
};

function render(model, size) {
  const cv = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(size * dpr);
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  // A thing that changes shape in play is shown at its fullest.
  const frame = model.frames.reduce((a, f) => (span(f) > span(a) ? f : a));
  const [lo, hi] = bounds(frame);
  const centre = lo.map((v, i) => (v + hi[i]) / 2);
  let reach = 1;
  for (let i = 0; i < frame.length; i += 3) {
    reach = Math.max(reach, Math.hypot(...[0, 1, 2].map((k) => frame[i + k] - centre[k])));
  }
  const scale = (size / 2 - 1) / reach;
  const pts = [];
  for (let i = 0; i < frame.length; i += 3) {
    const p = [0, 1, 2].map((k) => frame[i + k] - centre[k]);
    pts.push([size / 2 + dot(p, RIGHT) * scale, size / 2 - dot(p, UP) * scale, dot(p, TOWARD)]);
  }
  const polys = model.polys.map((poly, k) => {
    const p = poly.map((i) => pts[i]);
    const rgb = model.rgb[k];
    const n = poly.length;
    const mean = [0, 1, 2].map((ch) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += rgb[i * 3 + ch];
      return Math.round(sum / n);
    });
    return { p, z: p.reduce((s, q) => s + q[2], 0) / n, mean, blend: model.flags[k] & 2 };
  });
  polys.sort((a, b) => a.z - b.z);
  for (const { p, mean, blend } of polys) {
    g.fillStyle = `rgba(${mean[0]} ${mean[1]} ${mean[2]} / ${blend ? GLASS : 1})`;
    g.beginPath();
    const ring = p.length === 4 ? [p[0], p[1], p[3], p[2]] : p;
    ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
  return cv;
}

// A block is drawn in the same view on the lattice's own axes, painted as its
// level paints it, and what the game paints on a face as a tile facing the view.
const VIEW = basisAt(YAW / DEG, PITCH / DEG);
const toward = (i) => dot(FACES[i].n, VIEW.toward);
const SHOWN = FACES.map((_, i) => i).filter((i) => toward(i) > 0);
// A laser's end shows its plate on the side turned most toward the view.
const nearest = SHOWN.filter((i) => FACES[i].n[2] === 0).sort((a, b) => toward(b) - toward(a));
const PLATE_FACE = FACES[nearest[0]].game;
const TOP = FACES.findIndex((f) => f.game === 0);
// An icon's block stands mid-lattice, so that every face's place, which the
// game phases its cycles by, is inside the lattice.
const MID = SIDE / 2;
const CELL = { x: MID, y: MID, z: MID };
const TILE_MARGIN = 3;
const INVISIBLE = 3;
const PLATFORM = 5;
const BEAM_KIND = 8;

function canvasOf(size) {
  const cv = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(size * dpr);
  cv.style.width = cv.style.height = `${size}px`;
  cv.className = "icon";
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  return { cv, g };
}

const tintOf = (l) => WORLD_TINT[l.theme] || "#93a8d4";

/** What a level paints its faces with, or null until the world's textures arrive. */
function looks(l) {
  const skins = skinsTable();
  const img = skins && atlasFor(l.theme);
  if (!img) return null;
  const world = state.data.themes.findIndex((t) => t.id === l.theme);
  return { skins, img, look: lookOf(skins, l, world) };
}

// An invisible block pulses, and is shown at the frame its faces in view are
// brightest, as a model that changes shape is shown at its fullest.
function brightest(skins, look) {
  const light = (frame) =>
    SHOWN.reduce((sum, i) => {
      const sk = faceSkin(skins, look, CELL, FACES[i].game, INVISIBLE, null, frame);
      return sum + sk.colour[0];
    }, 0);
  const pulse = [...skins.cycles.invisible.level.keys()];
  return pulse.reduce((a, f) => (light(f) > light(a) ? f : a));
}

const trace = (g, pts) => {
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
};

/** A fresh canvas of a block of `kind` as level `l` paints it, `size` CSS
    pixels square, in the world's tint until its textures arrive. */
export function blockIcon(l, kind, size = 22) {
  const { cv, g } = canvasOf(size);
  const scale = (size / 2 - 1) / (Math.sqrt(3) / 2);
  const to = ([x, y, z]) => {
    const p = [x - 0.5, y - 0.5, z - 0.5];
    return [size / 2 + dot(p, VIEW.right) * scale, size / 2 - dot(p, VIEW.up) * scale];
  };
  const r = l.records.find((x) => x.kind === kind);
  const place = kind === PLATFORM && r ? platformPlace({ ...r, length: 1 }, 0) : null;
  const plate = kind === BEAM_KIND && r ? r.colour : undefined;
  const style = SKINNED_LOOK[kind] || {};
  const alpha = style.alpha ?? 1;
  const paints = looks(l);
  const frame = paints && kind === INVISIBLE ? brightest(paints.skins, paints.look) : 0;
  for (const i of SHOWN) {
    const face = FACES[i].game;
    trace(g, FACES[i].c.map(to));
    if (paints) {
      const { skins, look, img } = paints;
      const at = face === PLATE_FACE ? plate : undefined;
      const sk = faceSkin(skins, look, CELL, face, kind, null, frame, place, at);
      g.save();
      g.clip();
      paint(g, skins.corners[face][sk.turn].map(to), { ...sk, img }, shadeOf(i, l.theme), alpha);
      g.restore();
    } else {
      g.globalAlpha = alpha;
      g.fillStyle = flatFace(tintOf(l), kind, i);
      g.fill();
      g.globalAlpha = 1;
    }
  }
  if (style.dash) {
    g.strokeStyle = "rgba(232 238 251 / 0.7)";
    g.setLineDash(style.dash.map((d) => d / 2));
    for (const i of SHOWN) {
      trace(g, FACES[i].c.map(to));
      g.stroke();
    }
  }
  return cv;
}

/** A fresh canvas of what level `l` paints on a face under a thing of `type`. */
export function paintIcon(l, type, size = 22) {
  const { cv, g } = canvasOf(size);
  const [lo, hi] = [TILE_MARGIN, size - TILE_MARGIN];
  g.beginPath();
  g.rect(lo, lo, hi - lo, hi - lo);
  const paints = looks(l);
  if (!paints) {
    g.fillStyle = flatFace(tintOf(l), 0, TOP);
    g.fill();
    return cv;
  }
  const { skins, look, img } = paints;
  const r = { kind: 0, on: [{ face: 0, type }] };
  const sk = faceSkin(skins, look, CELL, 0, 0, r, 0);
  const corners = [lo, hi].flatMap((y) => [lo, hi].map((x) => [x, y]));
  g.clip();
  paint(g, corners, { ...sk, img }, shadeOf(TOP, l.theme), 1);
  return cv;
}
