export const SIDE = 34;
export const BLOCK = 34;

const DEG = Math.PI / 180;
export const PITCH_MIN = -84;
export const PITCH_MAX = 84;

export const state = {
  data: null,
  lvl: null,
  li: -1,
  cam: { yaw: 45, pitch: 35, zoom: 1, panX: 0, panY: 0 },
  target: [17, 17, 17],
  slice: SIDE - 1,
  view: { w: 0, h: 0, dpr: 1 },
  show: {
    objects: true,
    models: true,
    start: true,
    labels: false,
    base: false,
    hidden: false,
    skins: true,
  },
  hiddenKinds: new Set(),
  hover: null,
  selected: null,
  survey: { on: false, marks: new Map() },
};

let basis = null;

/** Screen axes and the depth axis for the current yaw and pitch. */
export function camera() {
  const { yaw, pitch } = state.cam;
  if (basis && basis.yaw === yaw && basis.pitch === pitch) return basis;
  const cy = Math.cos(yaw * DEG),
    sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG),
    sp = Math.sin(pitch * DEG);
  // The lattice's third axis counts downward, and seen from above its second
  // counts down the page, which is the one way the game's own lettering reads.
  basis = {
    yaw,
    pitch,
    right: [cy, -sy, 0],
    up: [-sp * sy, -sp * cy, -cp],
    toward: [cp * sy, cp * cy, -sp], // scene toward camera
  };
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

/** Distance away from the camera; larger is further, so draw larger first. */
export function depth(x, y, z) {
  const c = camera();
  return -(x * c.toward[0] + y * c.toward[1] + z * c.toward[2]);
}

/** Whether a face with this outward normal turns toward the camera. */
export const facing = (n) => dot(n, camera().toward) > 0;

export function screen(x, y, z) {
  const [px, py] = project(x, y, z);
  const [tx, ty] = project(...state.target);
  const { zoom, panX, panY } = state.cam;
  return [
    (px - tx - panX) * zoom * BLOCK + state.view.w / 2,
    (py - ty - panY) * zoom * BLOCK + state.view.h / 2,
  ];
}

/** The smallest z the slice still draws, counting down from the top. */
export const sliceZ = () => SIDE - 1 - state.slice;

export const cellKey = (x, y, z) => (x * SIDE + y) * SIDE + z;
