import { $, on } from "./dom.js";
import { state, BLOCK, depth, facing, screen, cellKey, sliceZ } from "./state.js";
import {
  WORLD_TINT,
  FACE_NORMAL,
  motionTable,
  skinsTable,
  platformCells,
  litNow,
  markerDestination,
  markerColour,
  markerNow,
} from "./data.js";
import { frameAt } from "./motion.js";
import { walkers, probe, advance, place, under, dice } from "./travel.js";
import { lookOf, paintedShadow } from "./skins.js";
import { drawBeams } from "./beams.js";
import { atlasFor } from "./atlas.js";
import { drawBlock, cube, outline, covers } from "./blocks.js";
import { drawRails, drawBase, drawLook, drawScale, drawMark, drawLink } from "./overlays.js";
import { drawThing, quietAmongModels, thingDisc } from "./things.js";

const cv = $("cv");
const ctx = cv.getContext("2d");

// A second canvas painted with one flat colour per cell, so a click can be
// resolved by reading a pixel rather than by intersecting every cube.
const pickCv = document.createElement("canvas");
const pick = pickCv.getContext("2d", { willReadFrequently: true });
let pickStale = true;
let pickList = [];
const pickColour = (id) => `rgb(${id & 255} ${(id >> 8) & 255} ${(id >> 16) & 255})`;
// What travels moves every frame, so while the pointer is over the map the
// pick is painted again with every frame that moves anything.
let pointerIn = false;
/** Say whether the pointer is over the map. */
export const pointing = (on) => {
  pointerIn = on;
};

// What shows through the blocks is drawn whole on a layer of its own and laid
// over the map at once, so a faint thing does not show its own far side
// through its near one, and where nothing is in front of it, it shows as it is.
const layerCv = document.createElement("canvas");
const layer = layerCv.getContext("2d");

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
  for (const g of [ctx, pick]) g.setTransform(dpr, 0, 0, dpr, 0, 0);
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

on("atlas-loaded", () => {
  invalidatePick();
  draw();
});

const PLATFORM = 5;
const THROUGH = 0.35; // how much of a thing shows through the blocks in front of it
/** Whether a thing stands on a face turned away from the view. */
const away = (face) => face !== null && face !== undefined && !facing(FACE_NORMAL[face]);

/** The cells to draw, blocks and the stretches of beam and of a platform's
    route between them, back to front. A moving platform's blocks, on the
    move, are drawn where its run has them and sort there. */
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
        // stands in, which is behind its block, so that its block hides what
        // it covers of the thing and no more.
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
  // A thing on its way across blocks is drawn where it is, right after the
  // nearest of the blocks it stands over, so that neither the block it is
  // leaving nor the one it is coming onto is painted over it, while what is
  // nearer still comes in front. On a face turned away from the view it sorts
  // as the furthest of the cells it stands in, so every block it stands over
  // comes in front of it.
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

// What travels does so only while the display asks, from the frame the level
// was opened with it on, one game frame at a time; turning it off forgets
// where everything got to, so turning it on again starts the level afresh.
let travel = { level: null, walkers: null, probe: null, roll: null };
function travelling(l, idx, frame) {
  if (!state.show.travel || !motionTable()) {
    travel.level = null;
    return null;
  }
  if (travel.level !== l) {
    travel = {
      level: l,
      walkers: walkers(l, idx, motionTable(), frame),
      probe: probe(l, litNow),
      roll: dice(motionTable().dice),
    };
  }
  advance([...travel.walkers.values()], travel.probe, frame, travel.roll);
  const out = new Map();
  for (const [key, w] of travel.walkers) out.set(key, { w, ...place(w) });
  if (out.size) spinning = true;
  return out;
}

/** The frame of the clock everything that moves is drawn at. */
export const clock = () => (motionTable() ? frameAt(motionTable(), performance.now()) : 0);

export function draw() {
  const { w, h } = state.view;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111725";
  ctx.fillRect(0, 0, w, h);
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
  const frame = clock();

  const moving = travelling(l, idx, frame);
  if (moving?.size && pointerIn) pickStale = true;
  const cells = visible(idx, moving);
  if (pickStale) {
    pickList = [];
    pick.clearRect(0, 0, w, h);
  }
  const edges = state.show.outlines && state.cam.zoom > 0.3;
  const scene = { l, idx, tint, skins, atlas, look, frame, edges };
  // A thing on a face turned away from the view is drawn again once every
  // block is down, faintly, where the display asks to see it through them,
  // and on the selected block whatever the display says.
  const through = [];
  // A survey mark goes over every block, as the other overlays do, so that no
  // nearer block hides it.
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
    put(m, c, l, frame, home, null, atlas && m.face !== null && paintedShadow(skins, m.type));
  };

  for (const c of cells) {
    const [px, py] = screen(c.x, c.y, c.z);
    const r = BLOCK * state.cam.zoom * 2;
    if (px < -r || px > w + r || py < -r || py > h + r) continue;
    const home = c.home || c;
    const ghost = home.z < sliceZ();
    if (c.beams) {
      if (drawBeams(ctx, c, ghost, frame)) spinning = true;
      continue;
    }
    if (c.rails) {
      if (state.show.outlines) drawRails(ctx, c, ghost, moving);
      continue;
    }
    if (c.thing) {
      if (state.show.objects && !ghost) {
        put(c.thing.w.m, home, l, frame, home, c.thing);
        if (pickStale) pickGoing(c.thing, home, l);
      }
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

    // a moving platform's blocks are picked where they are drawn, each as its record's cell
    if (pickStale && !ghost) {
      pickList.push({ home, at: c });
      const col = pickColour(pickList.length);
      cube(pick, c, { cells: new Map() }, () => col, null, 1, null);
    }

    if (state.show.objects && !ghost && !c.k) {
      for (const m of idx.markers.get(key) || []) if (!away(m.face)) mark(m, c, home, key);
    }
    if (state.survey.on && !ghost) {
      const m = state.survey.marks.get(key);
      if (m) noted.push([m, c]);
    }
    if (sel || hov) outline(ctx, c, idx, sel ? "#ffffff" : "#ffffffb0");
  }
  pickStale = false;

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
  // where a selected teleporter leads goes over everything, as a mark does
  for (const m of idx.markers.get(chosen) || []) {
    const to = markerDestination(m, l);
    const from = { ...state.selected, face: m.face };
    if (!to || ["x", "y", "z", "face"].every((k) => to[k] === from[k])) continue;
    outline(ctx, to, idx, markerColour(m), [4, 3]);
    drawLink(ctx, from, to, markerColour(m), markerNow(m) === "off");
  }
  if (state.show.start && l.camera) drawLook(ctx, l);
  drawScale(ctx);
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

/** Paint a travelling thing into the pick where it has got to, as the cell it
    started from, which holds its record. A survey marks the block under the
    pointer, so there it is left out. */
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
const AROUND = 2; // how far, in the pick's pixels, the colours proposed are read
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
