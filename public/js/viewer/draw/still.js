import { SIDE } from "../../format/lattice.js";
import { state, SHOW_DEFAULTS, basisAt, framing, effectFrame } from "../state.js";
import { worldTint, skinsTable } from "../data.js";
import { lookOf } from "../skins.js";
import { apart } from "../motion.js";
import { atlasFor, landed } from "./atlas.js";
import { visible, paintCells } from "./cells.js";
import { deviceLights } from "./lights.js";
import { stillWith } from "./things.js";

// A still is a level frozen at its first frame and framed as the social card
// frames it, its turn, a slim margin, the blocks with what stands on them and
// none of the map's own marks, but without the outlines the card draws.
const YAW = 38;
const PITCH = 30;
const MARGIN = 6;
const BACKGROUND = "#111725";
const LOOK = {
  outlines: false,
  objects: true,
  models: true,
  labels: false,
  base: false,
  camera: false,
  through: false,
};

const SWAPPED = [
  "cam",
  "target",
  "frame",
  "view",
  "slice",
  "show",
  "hiddenKinds",
  "presses",
  "selected",
  "hover",
];

/** Run `fn` on a still paint's own state in place of the frame's state, a camera at the still's
    turn over a view of no size, the whole level in the slice, the still look's switches, no kind
    hidden, every circuit as the level starts and nothing selected or hovered, with the stores
    and the registrations the frame keeps set aside, and give back what `fn` returns; the frame's
    own fields are back, by reference, once `fn` returns or throws. */
export function stilled(fn) {
  const kept = Object.fromEntries(SWAPPED.map((k) => [k, state[k]]));
  Object.assign(state, {
    cam: { yaw: YAW, pitch: PITCH, zoom: 1, panX: 0, panY: 0 },
    target: [SIDE / 2, SIDE / 2, SIDE / 2],
    frame: null,
    view: { w: 0, h: 0, dpr: 1 },
    slice: SIDE - 1,
    show: { ...SHOW_DEFAULTS, ...LOOK },
    hiddenKinds: new Set(),
    presses: new Map(),
    selected: null,
    hover: null,
  });
  try {
    return apart(() => stillWith(fn));
  } finally {
    Object.assign(state, kept);
  }
}

/** Paint `l`, indexed as `idx`, frozen at its first frame into `canvas`, sized to its box at the
    screen's density: textured where `textures` is on and the world's atlas has landed, flat in the
    world's tint otherwise, and never fetching. Says whether the textures were drawn; a canvas with
    no box is left as it is. */
export function paintLevel(canvas, l, idx, { textures = true } = {}) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return { textured: false };
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const [bw, bh] = [Math.round(w * dpr), Math.round(h * dpr)];
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, w, h);
  const skins = skinsTable();
  const world = state.data.themes.findIndex((t) => t.id === l.theme);
  const atlas = textures && skins && world >= 0 && landed(l.theme) ? atlasFor(l.theme) : null;
  stilled(() => {
    state.view = { w, h, dpr };
    const f = framing(l, basisAt(YAW, PITCH), w, h, MARGIN);
    state.target = f.target;
    if (f.zoom !== undefined)
      Object.assign(state.cam, { panX: f.panX, panY: f.panY, zoom: f.zoom });
    const effect = effectFrame(0);
    const lights = atlas ? deviceLights(l, idx, effect, false) : null;
    const scene = {
      l,
      idx,
      tint: worldTint(l.theme) ?? "#93a8d4",
      skins,
      atlas,
      look: atlas ? lookOf(skins, l, world) : null,
      frame: 0,
      effect,
      edges: state.show.outlines && state.cam.zoom > 0.3,
      lights: lights?.lit,
      seeing: false,
    };
    paintCells(ctx, scene, visible(idx, null), { view: { x0: 0, y0: 0, x1: w, y1: h } });
  });
  return { textured: !!atlas };
}
