import { SIDE } from "../format/lattice.js";

export const BLOCK = 34;

const DEG = Math.PI / 180;
export const PITCH_MIN = -84;
export const PITCH_MAX = 84;
export const ZOOM_MIN = 0.08;
export const ZOOM_MAX = 5;

export const state = {
  data: null,
  lvl: null,
  li: -1,
  cam: { yaw: 45, pitch: 35, zoom: 1, panX: 0, panY: 0 },
  target: [17, 17, 17],
  // what framed the view, run again at every size the canvas takes; null once
  // the camera is moved on purpose
  framing: null,
  // the frame the camera turns about, a rotation's columns in the world, or null; set as a new array
  frame: null,
  // while set, the target holds where it was put as the view turns
  anchored: false,
  // what the view was before a module took it, { cam, target, fitted, slice } or null; links carry it
  parked: null,
  slice: SIDE - 1,
  view: { w: 0, h: 0, dpr: 1 },
  show: {
    objects: true,
    models: true,
    motion: true,
    through: false,
    labels: false,
    faces: false,
    base: false,
    hidden: false,
    camera: false,
    compass: true,
    skins: true,
    outlines: false,
    note: true,
    course: false,
  },
  hiddenKinds: new Set(),
  // by colour, and the last key's, the clock frames at which a panel turned each circuit over
  presses: new Map(),
  hover: null,
  selected: null,
};

let basis = null;

export function basisAt(yaw, pitch) {
  const cy = Math.cos(yaw * DEG),
    sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG),
    sp = Math.sin(pitch * DEG);
  // z counts downward, and seen from above y counts down the page.
  return {
    right: [cy, -sy, 0],
    up: [-sp * sy, -sp * cy, -cp],
    toward: [cp * sy, cp * cy, -sp], // scene toward camera
  };
}

// A vector given in a frame's coordinates, in the world's.
const inWorld = (f, v) => [
  v[0] * f[0] + v[1] * f[3] + v[2] * f[6],
  v[0] * f[1] + v[1] * f[4] + v[2] * f[7],
  v[0] * f[2] + v[1] * f[5] + v[2] * f[8],
];

/** The view's basis: the orbit's at the yaw and pitch, turned about `state.frame` where set. */
export function camera() {
  const { yaw, pitch } = state.cam;
  const { frame } = state;
  if (basis && basis.yaw === yaw && basis.pitch === pitch && basis.frame === frame) return basis;
  const b = basisAt(yaw, pitch);
  basis = frame
    ? {
        yaw,
        pitch,
        frame,
        right: inWorld(frame, b.right),
        up: inWorld(frame, b.up),
        toward: inWorld(frame, b.toward),
      }
    : { yaw, pitch, frame, ...b };
  return basis;
}

/** A traveller's frame, heading `h` on a face of normal `n`: the camera behind it, `n` up. */
export function frameOf(h, n) {
  const across = [h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0]];
  return [...across, -h[0], -h[1], -h[2], -n[0], -n[1], -n[2]].map((v) => v || 0);
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A world point in projected units, before zoom and pan. */
export function project(x, y, z) {
  const c = camera();
  return [
    x * c.right[0] + y * c.right[1] + z * c.right[2],
    -(x * c.up[0] + y * c.up[1] + z * c.up[2]),
  ];
}

/** Larger is further from the camera. */
export function depth(x, y, z) {
  const c = camera();
  return -(x * c.toward[0] + y * c.toward[1] + z * c.toward[2]);
}

export const facing = (n) => dot(n, camera().toward) > 0;

// The orbit target's projection, kept while the camera and the target hold.
let aim = { c: null, x: NaN, y: NaN, z: NaN, px: 0, py: 0 };
function aimAt(c) {
  const t = state.target;
  if (aim.c !== c || aim.x !== t[0] || aim.y !== t[1] || aim.z !== t[2]) {
    const [px, py] = project(t[0], t[1], t[2]);
    aim = { c, x: t[0], y: t[1], z: t[2], px, py };
  }
  return aim;
}

/** As `screen`, written into `out` at `i`, so placing many points makes no
    array for each. */
export function screenTo(out, i, x, y, z) {
  const c = camera();
  const a = aimAt(c);
  const { zoom, panX, panY } = state.cam;
  out[i] =
    (x * c.right[0] + y * c.right[1] + z * c.right[2] - a.px - panX) * zoom * BLOCK +
    state.view.w / 2;
  out[i + 1] =
    (-(x * c.up[0] + y * c.up[1] + z * c.up[2]) - a.py - panY) * zoom * BLOCK + state.view.h / 2;
}

export function screen(x, y, z) {
  const out = [0, 0];
  screenTo(out, 0, x, y, z);
  return out;
}

/** Move the point the view turns about without moving anything on screen. */
export function retarget(t) {
  const [ax, ay] = project(...state.target);
  const [bx, by] = project(...t);
  state.cam.panX += ax - bx;
  state.cam.panY += ay - by;
  state.target = t;
}

export const levelCentre = (l) => [0, 1, 2].map((i) => (l.min[i] + l.max[i] + 1) / 2);

export const FIT_MARGIN = 60;
export const FIT_ZOOM_MAX = 3;

/** Aim at the level's middle, zoomed and panned so every block fits the view. */
export function fitLevel(l) {
  state.target = levelCentre(l);
  const [tx, ty] = project(...state.target);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z] = l.cells.slice(i, i + 3);
    for (const dx of [0, 1])
      for (const dy of [0, 1])
        for (const dz of [0, 1]) {
          const [px, py] = project(x + dx, y + dy, z + dz);
          x0 = Math.min(x0, px - tx);
          x1 = Math.max(x1, px - tx);
          y0 = Math.min(y0, py - ty);
          y1 = Math.max(y1, py - ty);
        }
  }
  if (!Number.isFinite(x0)) return;
  state.cam.panX = (x0 + x1) / 2;
  state.cam.panY = (y0 + y1) / 2;
  const { w, h } = state.view;
  const zx = (w - FIT_MARGIN) / Math.max(1e-3, (x1 - x0) * BLOCK);
  const zy = (h - FIT_MARGIN) / Math.max(1e-3, (y1 - y0) * BLOCK);
  state.cam.zoom = Math.max(ZOOM_MIN, Math.min(FIT_ZOOM_MAX, zx, zy));
}

// The view turns about the selected cell while it is centred on that cell,
// and about the level otherwise.
export function pivot() {
  if (state.anchored) return;
  const s = state.selected;
  if (!state.lvl || (s && [s.x, s.y, s.z].every((v, i) => v + 0.5 === state.target[i]))) return;
  retarget(levelCentre(state.lvl));
}

// The effects keep a guard of their own, which follows Motion.
export const effectsOn = () => state.show.motion;
export const effectFrame = (frame) => (effectsOn() ? frame : 0);

/** The smallest z the slice still draws. */
export const sliceZ = () => SIDE - 1 - state.slice;
