export const SIDE = 34;
export const BLOCK = 34;

const DEG = Math.PI / 180;
const REDUCED = "(prefers-reduced-motion: reduce)";
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
  slice: SIDE - 1,
  view: { w: 0, h: 0, dpr: 1 },
  show: {
    objects: true,
    models: true,
    motion: !globalThis.matchMedia?.(REDUCED).matches,
    through: false,
    labels: false,
    faces: false,
    base: false,
    start: false,
    hidden: false,
    skins: true,
    outlines: false,
    note: true,
  },
  hiddenKinds: new Set(),
  // by colour, the clock frames at which a switch turned each circuit over
  presses: new Map(),
  hover: null,
  selected: null,
  survey: { on: false, marks: new Map() },
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

export function camera() {
  const { yaw, pitch } = state.cam;
  if (basis && basis.yaw === yaw && basis.pitch === pitch) return basis;
  basis = { yaw, pitch, ...basisAt(yaw, pitch) };
  return basis;
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

// The view turns about the selected cell while it is centred on that cell,
// and about the level otherwise.
export function pivot() {
  const s = state.selected;
  if (!state.lvl || (s && [s.x, s.y, s.z].every((v, i) => v + 0.5 === state.target[i]))) return;
  retarget(levelCentre(state.lvl));
}

// The effects keep a guard of their own, which follows Motion.
export const effectsOn = () => state.show.motion;
export const effectFrame = (frame) => (effectsOn() ? frame : 0);

/** The smallest z the slice still draws. */
export const sliceZ = () => SIDE - 1 - state.slice;

export const cellKey = (x, y, z) => (x * SIDE + y) * SIDE + z;
