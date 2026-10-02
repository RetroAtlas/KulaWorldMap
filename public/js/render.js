import { $, on } from "./dom.js";
import {
  state,
  BLOCK,
  depth,
  facing,
  screen,
  cellKey,
  sliceZ,
  effectsOn,
  effectFrame,
} from "./state.js";
import {
  WORLD_TINT,
  FACE_NORMAL,
  motionTable,
  skinsTable,
  platformCells,
  litNow,
  settleCircuits,
  markerDestination,
  markerColour,
  markerNow,
} from "./data.js";
import { frameAt } from "./motion.js";
import { walkers, probe, advance, place, under, dice } from "./travel.js";
import { lookOf } from "./skins.js";
import { drawBeams } from "./beams.js";
import { atlasFor } from "./atlas.js";
import { drawBlock, cube, outline, covers } from "./blocks.js";
import { drawRails, drawBase, drawCamera, drawScale, drawMark, drawLink } from "./overlays.js";
import { drawThing, quietAmongModels, thingDisc } from "./things.js";
import { drawCompass } from "./compass.js";
import { deviceLights } from "./lights.js";

const cv = $("cv");
const ctx = cv.getContext("2d");

// A canvas painted one flat colour per cell and read back to hit-test a point,
// painted from the cells of the draw it goes stale at.
const pickCv = document.createElement("canvas");
const pick = pickCv.getContext("2d", { willReadFrequently: true });
let pickStale = true;
let pickFrom = null;
let pickList = [];
const pickColour = (id) => `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
// While anything travels, the pick goes stale every frame the pointer is over
// the map; while the pointer is pressed nothing reads the pick, so it waits for
// the hit test that does.
let pointerIn = false;
let pressed = false;
export const pointing = (on) => {
  pointerIn = on;
};
export const pressing = (on) => {
  pressed = on;
};

// What shows through the blocks is drawn whole on a layer of its own and laid
// over the map at once, so a faint thing does not show its own far side
// through its near one.
const layerCv = document.createElement("canvas");
const layer = layerCv.getContext("2d");

export const invalidatePick = () => {
  pickStale = true;
};

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
  invalidatePick();
  for (const fn of resized) fn();
  draw();
}

const resized = [];
/** Run `fn` at every size the canvas takes, before the frame drawn at it. */
export const onResize = (fn) => {
  resized.push(fn);
};

new ResizeObserver(() => resize()).observe(cv);

on("atlas-loaded", () => {
  invalidatePick();
  draw();
});

const PLATFORM = 5;
const THROUGH = 0.35;
const away = (face) => face !== null && face !== undefined && !facing(FACE_NORMAL[face]);

/** What to draw, back to front. */
function visible(idx, moving) {
  const out = [];
  for (const cells of [idx.cells, idx.beamCells, idx.railCells]) {
    for (const c of cells.values()) {
      if (c.z < sliceZ() && !state.show.hidden) continue;
      const key = cellKey(c.x, c.y, c.z);
      const r = c.v >= state.data.firstRecord ? idx.records.get(key)?.[0] : null;
      if (r?.kind !== PLATFORM) {
        out.push(c);
        // A thing on a face turned away from the view sorts as the cell it
        // stands in, behind its block, so the block hides only what it covers.
        if (cells !== idx.cells) continue;
        for (const m of idx.markers.get(key) || []) {
          if (!away(m.face)) continue;
          const n = FACE_NORMAL[m.face];
          const d = depth(c.x + n[0], c.y + n[1], c.z + n[2]);
          out.push({ x: c.x + n[0], y: c.y + n[1], z: c.z + n[2], d: d + 1e-6, home: c, mark: m });
        }
        continue;
      }
      const offset = moving?.get(`${key}/null`)?.offset || [0, 0, 0];
      platformCells(r).forEach(([x, y, z], k) =>
        out.push({ ...c, x: x + offset[0], y: y + offset[1], z: z + offset[2], home: c, k }),
      );
    }
  }
  // A travelling thing sorts just in front of the nearest block it stands
  // over, so neither the block it leaves nor the one it rolls onto paints over
  // it. On a face turned away from the view it sorts behind the furthest, so
  // every block it stands over comes in front.
  if (moving) {
    for (const going of moving.values()) {
      const { w, offset } = going;
      if (w.face === undefined) continue;
      const at = [w.c.x, w.c.y, w.c.z].map((v, i) => v + 0.5 + offset[i]);
      const cells = under(w, offset);
      const blocks = cells.filter((c) => idx.cells.has(cellKey(...c)));
      // over no block, it sorts as if one were under its middle
      const below = (blocks.length ? blocks : cells.slice(0, 1)).map((c) => depth(...c));
      const d = away(w.face)
        ? Math.max(...below) + depth(...FACE_NORMAL[w.face]) + 1e-6
        : Math.min(...below) - 1e-6;
      out.push({ x: at[0], y: at[1], z: at[2], d, home: w.c, thing: going });
    }
  }
  const far = (e) => e.d ?? depth(e.x, e.y, e.z);
  out.sort((a, b) => far(b) - far(a));
  return out;
}

// The level's clock starts at its first frame as the level opens or motion is
// turned on, as play's does, and stands there while motion is off, and while
// the page is hidden, when the run moves on by the time it was hidden instead.
let run = null;
let hiddenAt = document.hidden ? performance.now() : null;
const now = () => hiddenAt ?? performance.now();
function syncRun() {
  const table = motionTable();
  if (!table || !state.show.motion) run = null;
  else if (run?.level !== state.lvl) {
    run = { level: state.lvl, at: frameAt(table, now()), travel: null };
    settleCircuits();
  }
}

export const clock = () =>
  run && state.show.motion && run.level === state.lvl ? frameAt(motionTable(), now()) - run.at : 0;

function travelling(l, idx, frame) {
  if (!run) return null;
  if (!run.travel) {
    run.travel = {
      walkers: walkers(l, idx, motionTable()),
      probe: probe(l, litNow),
      roll: dice(motionTable().dice),
    };
  }
  const travel = run.travel;
  advance([...travel.walkers.values()], travel.probe, frame, travel.roll);
  const out = new Map();
  for (const [key, w] of travel.walkers) out.set(key, { w, ...place(w) });
  if (out.size) spinning = true;
  return out;
}

export function draw() {
  const { w, h } = state.view;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111725";
  ctx.fillRect(0, 0, w, h);
  drawCompass();
  const l = state.lvl;
  if (!l) return;
  const idx = state.idx;
  const tint = WORLD_TINT[l.theme] || "#93a8d4";
  const skins = skinsTable();
  const atlas = state.show.skins && skins ? atlasFor(l.theme) : null;
  const look = atlas
    ? lookOf(
        skins,
        l,
        state.data.themes.findIndex((t) => t.id === l.theme),
      )
    : null;

  if (state.show.base) drawBase(ctx, l);
  syncRun();
  const frame = clock();

  const moving = travelling(l, idx, frame);
  if (moving?.size && pointerIn) pickStale = true;
  const cells = visible(idx, moving);
  if (pickStale) {
    pickFrom = { cells, l };
    pickStale = false;
    if (!pressed) paintPick();
  }
  const edges = state.show.outlines && state.cam.zoom > 0.3;
  const effect = effectFrame(frame);
  const lights = atlas ? deviceLights(l, idx, effect) : null;
  if (lights?.on) spinning = true;
  const scene = { l, idx, tint, skins, atlas, look, frame, effect, edges, lights: lights?.lit };
  const through = [];
  const noted = [];
  const chosen = state.selected?.key;
  const put = (...t) => {
    if (drawThing(ctx, ...t)) spinning = true;
    const [m, , , , home] = t;
    if (away(m.face) && (state.show.through || cellKey(home.x, home.y, home.z) === chosen))
      through.push(t);
  };
  const mark = (m, c, home, key) => {
    if (moving?.has(`${key}/${m.face}`)) return;
    if (state.show.models && quietAmongModels(m, !!atlas, key === chosen)) return;
    put(m, c, l, frame, home);
  };

  for (const c of cells) {
    if (offScreen(c)) continue;
    const home = c.home || c;
    const ghost = home.z < sliceZ();
    if (c.beams) {
      if (drawBeams(ctx, c, ghost, effect)) spinning = true;
      continue;
    }
    if (c.rails) {
      if (state.show.outlines) drawRails(ctx, c, ghost, moving);
      continue;
    }
    if (c.thing) {
      if (state.show.objects && !ghost) put(c.thing.w.m, home, l, frame, home, c.thing);
      continue;
    }
    const key = cellKey(home.x, home.y, home.z);
    if (c.mark) {
      if (state.show.objects && !ghost) mark(c.mark, home, home, key);
      continue;
    }
    const sel = state.selected?.key === key;
    const hov = state.hover?.key === key;
    if (drawBlock(ctx, c, home, key, ghost, sel, hov, scene)) spinning = true;

    if (state.show.objects && !ghost && !c.k) {
      for (const m of idx.markers.get(key) || []) if (!away(m.face)) mark(m, c, home, key);
    }
    if (state.survey.on && !ghost) {
      const m = state.survey.marks.get(key);
      if (m) noted.push([m, c]);
    }
    if (sel || hov) outline(ctx, c, idx, sel ? "#ffffff" : "#ffffffb0");
  }

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
  for (const [m, c] of noted) drawMark(ctx, m, c);
  for (const m of idx.markers.get(chosen) || []) {
    const to = markerDestination(m, l);
    const from = { ...state.selected, face: m.face };
    if (!to || ["x", "y", "z", "face"].every((k) => to[k] === from[k])) continue;
    outline(ctx, to, idx, markerColour(m), [4, 3]);
    drawLink(ctx, from, to, markerColour(m), markerNow(m) === "off");
  }
  if (state.show.camera) drawCamera(ctx, l);
  drawScale(ctx);
  if (spinning && (state.show.motion || effectsOn())) animate();
}

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
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = performance.now();
    return;
  }
  if (run && hiddenAt !== null) run.at += frameAt(motionTable(), performance.now() - hiddenAt);
  hiddenAt = null;
  draw();
});

/** Draw, unless a frame already asked for will draw before anything reaches
    the screen. */
export function drawSoon() {
  if (!queuedFrame) draw();
}

function offScreen(c) {
  const [px, py] = screen(c.x, c.y, c.z);
  const r = BLOCK * state.cam.zoom * 2;
  const { w, h } = state.view;
  return px < -r || px > w + r || py < -r || py > h + r;
}

function paintPick() {
  const { cells, l } = pickFrom;
  pickFrom = null;
  pickList = [];
  pick.clearRect(0, 0, state.view.w, state.view.h);
  for (const c of cells) {
    if (offScreen(c)) continue;
    const home = c.home || c;
    if (home.z < sliceZ() || c.beams || c.rails || c.mark) continue;
    if (c.thing) {
      if (state.show.objects) pickGoing(c.thing, home, l);
      continue;
    }
    pickList.push({ home, at: c });
    const col = pickColour(pickList.length);
    cube(pick, c, { cells: new Map() }, () => col, null, 1, null);
  }
}

/** A travelling thing picks as the cell it started from, which holds its
    record. A survey marks blocks, so it leaves travellers out. */
function pickGoing(going, home, l) {
  const m = going.w.m;
  if (state.hiddenKinds.has(m.id) || state.survey.on) return;
  const where = {
    x: home.x + going.offset[0],
    y: home.y + going.offset[1],
    z: home.z + going.offset[2],
  };
  const [x, y, r] = thingDisc(m, where, l);
  pickList.push({ home, disc: [x, y, r] });
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

export function cellAt(cx, cy) {
  if (pickStale) draw();
  if (pickFrom) paintPick();
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
  for (const [dx, dy] of TRIES) {
    const id = front.find((v) => shows(pickList[v - 1], (px + dx) / dpr, (py + dy) / dpr));
    if (id) return pickList[id - 1].home;
  }
  return null;
}
