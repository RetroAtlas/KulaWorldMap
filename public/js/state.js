export const SIDE = 34;
export const TILE = { w: 30, h: 15, v: 30 };

export const state = {
  data: null,
  lvl: null,
  li: -1,
  rot: 0,
  slice: SIDE - 1,
  cam: { x: 0, y: 0, z: 1 },
  view: { w: 0, h: 0, dpr: 1 },
  show: { objects: true, start: true, labels: false, base: false, hidden: false },
  hiddenKinds: new Set(),
  hover: null,
  selected: null,
};

const C = (SIDE - 1) / 2;

export function rotate(x, y, r) {
  const dx = x - C,
    dy = y - C;
  switch (r & 3) {
    case 1:
      return [dy, -dx];
    case 2:
      return [-dx, -dy];
    case 3:
      return [-dy, dx];
    default:
      return [dx, dy];
  }
}

/** Lattice cell to the flat plane the camera pans over. */
export function plane(x, y, z) {
  const [rx, ry] = rotate(x, y, state.rot);
  return [(rx - ry) * TILE.w, (rx + ry) * TILE.h - (z - C) * TILE.v];
}

export const depth = (x, y, z) => {
  const [rx, ry] = rotate(x, y, state.rot);
  return rx + ry + z;
};

export const sx = (px) => (px - state.cam.x) * state.cam.z + state.view.w / 2;
export const sy = (py) => (py - state.cam.y) * state.cam.z + state.view.h / 2;

export const cellKey = (x, y, z) => (x * SIDE + y) * SIDE + z;
