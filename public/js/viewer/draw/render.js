import { $, on, emit } from "../ui/dom.js";
import { state, screen, sliceZ, effectFrame } from "../state.js";
import {
  worldTint,
  motionTable,
  skinsTable,
  litNow,
  settleCircuits,
  markerDestination,
  markerColour,
  markerNow,
} from "../data.js";
import { frameAt } from "../motion.js";
import { slotOf } from "../permalink.js";
import { walkers, probe, advance, place, dice } from "../travel.js";
import { lookOf } from "../skins.js";
import { atlasFor } from "./atlas.js";
import { cube, outline, covers, faceAt } from "./blocks.js";
import { visible, reaches, paintCells } from "./cells.js";
import { drawBase, drawCamera, drawScale, drawLink } from "./overlays.js";
import { drawThing, thingDisc } from "./things.js";
import { drawCompass } from "./compass.js";
import { deviceLights } from "./lights.js";

// --- the canvases --------------------------------------------------------------------------

const cv = $("cv");
const ctx = cv.getContext("2d");

// A canvas painted one flat colour per cell and read back to hit-test a point,
// painted from the cells of the draw it goes stale at, under that draw's
// shift, by the first hit test after, and only about the point asked for where
// that is all the hit test wants.
const pickCv = document.createElement("canvas");
const pick = pickCv.getContext("2d", { willReadFrequently: true });
let pickStale = true;
let pickFrom = null;
let pickList = [];
// where the canvas holds paint, and where that paint is from the last draw
let laid = null;
let painted = null;
const WHOLE = { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
const NEAR = 12;
const within = (a, b) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1;
const pickColour = (id) => `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
// While anything travels, the pick goes stale every frame the pointer is over
// the map.
let pointerIn = false;
export const pointing = (on) => {
  pointerIn = on;
};

// What shows through the blocks is drawn whole on a layer of its own and laid
// over the map at once, so a faint thing does not show its own far side
// through its near one.
const layerCv = document.createElement("canvas");
const layer = layerCv.getContext("2d");
const THROUGH = 0.35;

export const invalidatePick = () => {
  pickStale = true;
};

// --- the hooks and the movers --------------------------------------------------------------

// What draws over the map from outside it: an under hook runs before any
// block, where the ground grid is drawn, and skips the grid by returning true;
// a block hook runs once a block is drawn, before the things standing on it;
// a cell hook runs after each block with what stands on it; a frame hook once
// the see-through layer is laid, and asks for another frame by returning true.
const overlays = { under: [], block: [], cell: [], frame: [] };
export function overlayWith({ under, block, cell, frame }) {
  if (under) overlays.under.push(under);
  if (block) overlays.block.push(block);
  if (cell) overlays.cell.push(cell);
  if (frame) overlays.frame.push(frame);
}

// What travels besides the walkers the level's records lift: a module may hand
// the frame travellers of its own, each keyed as a walker is and drawn,
// sorted and picked as one, standing in for the marker its key names; one
// that asks to show through is drawn again on the see-through layer, and one
// that hands a depth sorts at it.
const movers = [];
export const movingWith = (fn) => {
  movers.push(fn);
};
const merged = (into, more) => (more?.size ? new Map([...(into ?? []), ...more]) : into);

// --- the size, the density and the atlas ---------------------------------------------------

export function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth,
    h = cv.clientHeight;
  if (!w || !h) return;
  if (state.view.w === w && state.view.h === h && state.view.dpr === dpr) return;
  state.view = { w, h, dpr };
  for (const c of [cv, pickCv]) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  for (const g of [ctx, pick]) g.setTransform(dpr, 0, 0, dpr, 0, 0);
  laid = null;
  invalidatePick();
  for (const fn of resized) fn();
  draw();
}

const resized = [];
/** Run `fn` at every size the canvas takes, before the frame drawn at it. */
export const onResize = (fn) => {
  resized.push(fn);
};

// A resize observer sees the canvas's size and not the screen's density,
// which changes under a window dragged to a screen of another.
function watchDensity() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
    "change",
    () => {
      resize();
      emit("density-changed");
      watchDensity();
    },
    { once: true },
  );
}

// --- the run and what travels --------------------------------------------------------------

// The level's clock starts at its first frame as the level opens or motion is
// turned on, as play's clock does, and stands there while motion is off, and while
// the page is hidden, when the run moves on by the time it was hidden instead.
// The run keeps the time it started at and counts its frames from there at the
// rate of the table shown, so a level keeps its elapsed time across a change of
// table. The same level installed again keeps its clock, and what travels is
// laid out again from the level as it stands, and from the table shown where it
// was laid from another.
let run = null;
let hiddenAt = document.hidden ? performance.now() : null;
const now = () => hiddenAt ?? performance.now();
function syncRun() {
  const table = motionTable();
  if (!table || !state.show.motion) run = null;
  else if (run?.level !== state.lvl) {
    const slot = slotOf(state.lvl);
    if (run?.slot === slot) run = { ...run, level: state.lvl, travel: carried(run, state.lvl) };
    else {
      run = { slot, level: state.lvl, startMs: now(), travel: null };
      settleCircuits();
    }
  }
  if (run?.travel && run.travel.table !== table) run.travel = null;
}

/** What travels, kept where the records it was lifted from are unchanged,
    probing the blocks as they now stand; null where it is to be laid out anew. */
function carried(run, l) {
  const t = run.travel;
  if (!t || !same(run.level.records, l.records)) return null;
  return same(run.level.cells, l.cells) ? t : { ...t, probe: probe(l, litNow) };
}

function same(a, b) {
  if (a === b) return true;
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return same(keys, Object.keys(b)) && keys.every((k) => same(a[k], b[k]));
}

// What runs the level from outside the frame: a module may hand the frame the
// clock it draws at, the index it draws from and what travels, given the
// level, each standing in for the frame's own clock, index or travel while it
// is registered, and may say that every invisible block is seen. A handed
// index is shaped as the level's own index, with a marker only on a cell it
// holds, and may carry the blocks it has marked with the frame of each mark
// and the blocks breaking up with the size of each in the game's units, each
// drawn as a cube of that side about its middle. A handed run may shift the
// scene by a vector of canvas pixels, which the pick follows.
let source = null;
export const runWith = (fn) => {
  source = fn;
  if (run) run.travel = null;
  invalidatePick();
};
const handed = (l = state.lvl) => (l && source?.(l)) || null;

const own = () =>
  run && state.show.motion && run.level === state.lvl
    ? frameAt(motionTable(), now() - run.startMs)
    : 0;
const clockOf = (given) => given?.frame ?? own();
export const clock = () => clockOf(handed());

/** The frame's own travel, laid where none stands and stepped to `frame`. */
function stepped(l, idx, frame) {
  if (!run) return null;
  if (!run.travel) {
    const table = motionTable();
    run.travel = {
      table,
      walkers: walkers(l, idx, table),
      probe: probe(l, litNow),
      roll: dice(table.dice),
    };
  }
  const travel = run.travel;
  advance([...travel.walkers.values()], travel.probe, frame, travel.roll);
  return travel;
}

function travelling(l, idx, frame, given) {
  const travel = given ?? stepped(l, idx, frame);
  if (!travel) return null;
  const out = new Map();
  for (const [key, w] of travel.walkers) out.set(key, { w, ...place(w) });
  if (out.size) spinning = true;
  return out;
}

// --- the draw ------------------------------------------------------------------------------

export function draw() {
  const { w, h } = state.view;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111725";
  ctx.fillRect(0, 0, w, h);
  drawCompass();
  const l = state.lvl;
  if (!l) return;
  const tint = worldTint(l.theme) ?? "#93a8d4";
  const skins = skinsTable();
  const atlas = state.show.skins && skins ? atlasFor(l.theme) : null;
  const look = atlas
    ? lookOf(
        skins,
        l,
        state.data.themes.findIndex((t) => t.id === l.theme),
      )
    : null;

  let covered = false;
  for (const fn of overlays.under) covered = fn(ctx, l) || covered;
  // after the under hooks, which step whatever runs the level
  const given = handed(l);
  const shift = given?.shift ?? [0, 0];
  // the scene is drawn under the shift, so the view it is culled against is taken back by it
  const view = { x0: -shift[0], y0: -shift[1], x1: w - shift[0], y1: h - shift[1] };
  ctx.save();
  ctx.translate(shift[0], shift[1]);
  if (state.show.base && !covered) drawBase(ctx, l);
  const idx = given?.idx ?? state.idx;
  syncRun();
  const frame = clockOf(given);

  const walking = travelling(l, idx, frame, given?.travel);
  if (walking?.size && pointerIn) pickStale = true;
  const moving = movers.reduce((out, fn) => merged(out, fn(l, idx, frame)), walking);
  const cells = visible(idx, moving);
  if (pickFrom && (pickFrom.shift[0] !== shift[0] || pickFrom.shift[1] !== shift[1]))
    pickStale = true;
  if (pickStale) {
    pickFrom = { cells, l, shift };
    pickStale = false;
    painted = null;
  }
  const edges = state.show.outlines && state.cam.zoom > 0.3;
  const effect = effectFrame(frame);
  const lights = atlas ? deviceLights(l, idx, effect) : null;
  if (lights?.on) spinning = true;
  const scene = {
    l,
    idx,
    tint,
    skins,
    atlas,
    look,
    frame,
    effect,
    edges,
    lights: lights?.lit,
    seeing: given?.seeing ?? false,
  };
  const chosen = state.selected?.key;
  const { live, through } = paintCells(ctx, scene, cells, {
    view,
    moving,
    hooks: overlays,
    chosen,
    selectedKey: chosen,
    hoverKey: state.hover?.key,
  });
  if (live) spinning = true;

  if (through.length) {
    if (layerCv.width !== cv.width || layerCv.height !== cv.height) {
      layerCv.width = cv.width;
      layerCv.height = cv.height;
    }
    layer.setTransform(state.view.dpr, 0, 0, state.view.dpr, 0, 0);
    layer.clearRect(0, 0, w, h);
    for (const t of through) drawThing(layer, ...t);
    ctx.save();
    ctx.globalAlpha = THROUGH;
    ctx.drawImage(layerCv, 0, 0, w, h);
    ctx.restore();
  }
  let again = false;
  for (const fn of overlays.frame) again = fn(ctx, scene) === true || again;
  for (const m of idx.markers.get(chosen) || []) {
    const to = markerDestination(m, l);
    const from = { ...state.selected, face: m.face };
    if (!to || ["x", "y", "z", "face"].every((k) => to[k] === from[k])) continue;
    outline(ctx, to, idx, markerColour(m), [4, 3]);
    drawLink(ctx, from, to, markerColour(m), markerNow(m) === "off");
  }
  if (state.show.camera) drawCamera(ctx, l);
  ctx.restore();
  drawScale(ctx);
  if ((spinning && state.show.motion) || again) animate();
}

// --- the redraw ----------------------------------------------------------------------------

// Set by a draw with anything moving on screen, which then asks for the next
// frame.
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

/** Draw, unless a frame already asked for will draw before anything reaches
    the screen. */
export function drawSoon() {
  if (!queuedFrame) draw();
}

// --- the pick ------------------------------------------------------------------------------

/** Paint the pick from the last draw's cells, within `area`. Every cell takes
    its place in the list whether painted or not, so a colour read means the
    same cell whatever part was painted. */
function paintPick(area) {
  const { cells, l, shift } = pickFrom;
  pickList = [];
  const { w, h } = state.view;
  if (laid === WHOLE || area === WHOLE) pick.clearRect(0, 0, w, h);
  else if (laid)
    pick.clearRect(laid.x0 - 1, laid.y0 - 1, laid.x1 - laid.x0 + 2, laid.y1 - laid.y0 + 2);
  pick.save();
  if (area !== WHOLE) {
    pick.beginPath();
    pick.rect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0);
    pick.clip();
  }
  // the cells are painted under the draw's shift, so the view and the area are taken back by it
  pick.translate(shift[0], shift[1]);
  const back = (a) =>
    a === WHOLE
      ? a
      : { x0: a.x0 - shift[0], y0: a.y0 - shift[1], x1: a.x1 - shift[0], y1: a.y1 - shift[1] };
  const view = back({ x0: 0, y0: 0, x1: w, y1: h });
  const about = back(area);
  for (const c of cells) {
    const at = screen(c.x, c.y, c.z);
    if (!reaches(at, view)) continue;
    const home = c.home || c;
    if (home.z < sliceZ() || c.beams || c.rails || c.mark) continue;
    if (c.thing) {
      if (state.show.objects) pickGoing(c.thing, home, l, about);
      continue;
    }
    pickList.push({ home, at: c });
    if (!reaches(at, about)) continue;
    const col = pickColour(pickList.length);
    cube(pick, c, { cells: new Map() }, () => col, null, 1, null);
  }
  pick.restore();
  laid = painted = area;
}

/** A travelling thing picks as the cell it started from, which holds its
    record. */
function pickGoing(going, home, l, area) {
  const m = going.w.m;
  if (state.hiddenKinds.has(m.id)) return;
  const where = {
    x: home.x + going.offset[0],
    y: home.y + going.offset[1],
    z: home.z + going.offset[2],
  };
  const [x, y, r] = thingDisc(m, where, l);
  pickList.push({ home, disc: [x, y, r], face: going.w.face });
  if (x + r < area.x0 || x - r > area.x1 || y + r < area.y0 || y - r > area.y1) return;
  pick.fillStyle = pickColour(pickList.length);
  pick.beginPath();
  pick.arc(x, y, r, 0, 7);
  pick.fill();
}

// The pick is drawn smoothed like any canvas, so a pixel on the edge between
// two cells holds a blend of their colours, which can read as a third cell
// anywhere on the map. A colour read around a point only proposes a cell:
// the point takes the frontmost of those, the last the pick painted, whose
// shape covers the middle of the pixel it falls in, or failing that its rim.
const AROUND = 2;
const TRIES = [
  [0.5, 0.5],
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [0.5, 0],
  [0.5, 1],
  [0, 0.5],
  [1, 0.5],
];
const shows = (e, x, y) =>
  e.disc ? Math.hypot(x - e.disc[0], y - e.disc[1]) <= e.disc[2] : covers(e.at, x, y);

/** The cell under a point of the canvas, with the face the point lies on,
    and for a platform's block the cell it stands in at rest, as `body`, with
    its place along the run. With `near`, the pick is painted about the point
    alone where it is not painted already. */
export function cellAt(cx, cy, near = false) {
  if (pickStale) draw();
  if (!pickFrom) return null;
  const area = near ? { x0: cx - NEAR, y0: cy - NEAR, x1: cx + NEAR, y1: cy + NEAR } : WHOLE;
  if (!painted || !within(area, painted)) paintPick(area);
  // The backing store and the element can disagree, so the scale is read off
  // both rather than taken as the device ratio.
  const kx = pickCv.width / Math.max(1, cv.clientWidth);
  const ky = pickCv.height / Math.max(1, cv.clientHeight);
  const px = Math.round(cx * kx),
    py = Math.round(cy * ky);
  if (px < 0 || py < 0 || px >= pickCv.width || py >= pickCv.height) return null;
  const x0 = Math.max(0, px - AROUND);
  const y0 = Math.max(0, py - AROUND);
  const w = Math.min(pickCv.width, px + AROUND + 1) - x0;
  const h = Math.min(pickCv.height, py + AROUND + 1) - y0;
  const p = pick.getImageData(x0, y0, w, h).data;
  if (p[((py - y0) * w + (px - x0)) * 4 + 3] === 0) return null;
  const proposed = new Set();
  for (let i = 0; i < p.length; i += 4) {
    const id = p[i] | (p[i + 1] << 8) | (p[i + 2] << 16);
    if (p[i + 3] && id && id <= pickList.length) proposed.add(id);
  }
  const front = [...proposed].sort((a, b) => b - a);
  const dpr = state.view.dpr;
  const [sx, sy] = pickFrom.shift;
  for (const [dx, dy] of TRIES) {
    const x = (px + dx) / dpr - sx;
    const y = (py + dy) / dpr - sy;
    const id = front.find((v) => shows(pickList[v - 1], x, y));
    if (id) {
      const e = pickList[id - 1];
      // the face is read at the point itself, taken back by the shift, which the
      // probe may have left by a fraction of a pixel, and at the probe where the
      // point is off the cube
      const face = e.disc ? e.face : (faceAt(e.at, cx - sx, cy - sy) ?? faceAt(e.at, x, y));
      return e.at?.body ? { ...e.home, face, body: e.at.body, k: e.at.k } : { ...e.home, face };
    }
  }
  return null;
}

// --- the wiring ----------------------------------------------------------------------------

export function wireRender() {
  new ResizeObserver(() => resize()).observe(cv);
  watchDensity();
  on("atlas-loaded", (world) => {
    if (world !== state.lvl?.theme) return;
    invalidatePick();
    draw();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = performance.now();
      return;
    }
    if (run && hiddenAt !== null) run.startMs += performance.now() - hiddenAt;
    hiddenAt = null;
    draw();
  });
}
