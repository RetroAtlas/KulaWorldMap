import { $, on } from "./dom.js";
import { state, SIDE, BLOCK, depth, facing, screen, cellKey, sliceZ } from "./state.js";
import {
  WORLD_TINT,
  FACE_NORMAL,
  FACE_NAME,
  markerColour,
  markerLabel,
  markerFacing,
  markerHeading,
  markerState,
  markerModel,
  motionTable,
  skinsTable,
  motionOf,
  modelUnit,
  platformCells,
  TANGENT,
  cross,
} from "./data.js";
import { frameAt, phasesOf, pose, orbit } from "./motion.js";
import { walkers, probe, advance, place, under, dice } from "./travel.js";
import { lookOf, paintedShadow } from "./skins.js";
import { drawBeams } from "./beams.js";
import { atlasFor } from "./atlas.js";
import { drawBlock, cube, outline } from "./blocks.js";

const cv = $("cv");
const ctx = cv.getContext("2d");

// A second canvas painted with one flat colour per cell, so a click can be
// resolved by reading a pixel rather than by intersecting cubes.
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
      probe: probe(l),
      roll: dice(motionTable().dice),
    };
  }
  advance([...travel.walkers.values()], travel.probe, frame, travel.roll);
  const out = new Map();
  for (const [key, w] of travel.walkers) out.set(key, { w, ...place(w) });
  if (out.size) spinning = true;
  return out;
}

// The types the game draws on the face and nowhere else, so that once the
// face is painted the marker would say the same thing twice; and so would a
// marker for a record's own kind, once its block is painted, but for the
// settings record, which stands on no block of its own.
const FACE_ONLY = new Set([1, 2, 8]);
const paintSays = (m, skins) =>
  m.face === null ? m.kind !== skins.hidden.kind : FACE_ONLY.has(m.type);

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
  const frame = motionTable() ? frameAt(motionTable(), performance.now()) : 0;

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
  const chosen = state.selected?.key;
  const put = (...t) => {
    if (drawThing(ctx, ...t)) spinning = true;
    const [m, , , , home] = t;
    if (away(m.face) && (state.show.through || cellKey(home.x, home.y, home.z) === chosen))
      through.push(t);
  };
  const mark = (m, c, home, key) => {
    if (moving?.has(`${key}/${m.face}`)) return;
    if (atlas && state.show.models && paintSays(m, skins)) return;
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
      pickList.push(home);
      const col = pickColour(pickList.length);
      cube(pick, c, { cells: new Map() }, () => col, null, 1, null);
    }

    if (state.show.objects && !ghost && !c.k) {
      for (const m of idx.markers.get(key) || []) if (!away(m.face)) mark(m, c, home, key);
    }
    if (state.survey.on && !ghost) {
      const m = state.survey.marks.get(key);
      if (m) drawMark(ctx, m, c);
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
  pickList.push(home);
  pick.fillStyle = pickColour(pickList.length);
  pick.beginPath();
  pick.arc(x, y, r, 0, 7);
  pick.fill();
}

/** The disc a thing at a cell covers on the screen, as its centre and radius:
    as wide as its model, about the model's middle, or its marker. */
function thingDisc(m, where, l) {
  const model = state.show.models ? markerModel(m, l) : null;
  let p, r;
  if (model) {
    const [lo, hi] = model.box;
    p = off(where, m.face, (motionOf(m)?.entry?.stand ?? 0) * modelUnit());
    r = Math.max(...hi, ...lo.map((v) => -v)) * modelUnit() * state.cam.zoom * BLOCK;
  } else {
    p = off(where, m.face, OBJECT_HOVER);
    r = Math.max(4, 7 * state.cam.zoom);
  }
  return [p[0], p[1], r];
}

/** Whether a device a switch toggles is drawn off, as the level starts it. */
const switchedOff = (m) => markerState(m) === "off";

/** An object as itself where it has a mesh and the display asks for it, else
    its marker; on a moving platform the cell is where the platform is, and
    a thing that travels brings where it has got to and which way it faces,
    its marker and its label going with it. Says whether it moves by the
    next frame. */
function drawThing(ctx, m, c, l, frame, home = c, going = null, painted = false) {
  if (state.hiddenKinds.has(m.id)) return false;
  const motion = state.show.models ? motionOf(m) : null;
  // the game starts a pickup's angles at random and an entry's at zero, so
  // the things of one type that travel turn in step
  const phase = !motion
    ? null
    : motion.entry
      ? [0, 0, 0]
      : phasesOf(motionTable(), home.x, home.y, home.z, m.face);
  const round = motion?.orbit
    ? orbit(motionTable(), motion, `${cellKey(home.x, home.y, home.z)}/${m.face}`, frame, phase)
    : null;
  const model = state.show.models ? markerModel(m, l, round?.form ?? null) : null;
  const where = going
    ? { x: c.x + going.offset[0], y: c.y + going.offset[1], z: c.z + going.offset[2] }
    : c;
  if (!model) {
    drawMarker(ctx, m, where);
    return false;
  }
  drawObject(ctx, m, c, model, motion, frame, phase, round, l.camera?.time ?? 0, going, painted);
  if (state.show.labels && state.cam.zoom > 0.45) {
    const [px, py] = off(where, m.face, OBJECT_HOVER);
    const dark = switchedOff(m) ? " · off" : "";
    const side = state.show.faces ? ` · ${FACE_NAME[m.face]}` : "";
    label(ctx, markerLabel(m) + dark + side, px + 8, py + 4, "#e8eefb");
  }
  return !!motion;
}

// An object is its mesh stood on its face: the model's y runs along the face's
// outward normal, its z along the way the thing points where it has one, and
// its lowest vertex sits just off the face, save that a thing the game keeps an
// entry of its own for stands where the game draws it. What moves in play moves
// here at the game's rate, from the table the build read off the executable,
// about those same axes; a thing that bobs is stood its bob's reach higher so
// that it never dips into its face, and a device that starts switched off
// stands still, as it does in play. The polygons are filled back to front in
// their own colours, since the shading is baked into them, and both sides are
// drawn, since the meshes wind their faces either way. A thing whose face is
// painted with the game's own shadow casts none of its own.
const GAP = 0.03; // between a thing and its face, in blocks
const SHADOW = "rgba(0 0 0 / 0.32)";
const GLASS = 0.55; // how much a translucent polygon covers
const FLOATING = 0.02; // a lift beyond this is off the face, in blocks
// The rolling stone's axle is its model's z, which lies across the way it
// rolls, so it stands a quarter turn from the way its facing gives and rolls
// about that axle with its top going the way it travels.
const STONE = 51;
const ACROSS = 0.25;

function drawObject(ctx, m, c, model, motion, frame, phase, round, time, going, painted) {
  const up = FACE_NORMAL[m.face];
  const forward = going?.fwd || markerHeading(m) || TANGENT[m.face];
  const unit = modelUnit();
  const rest = motion?.entry
    ? motion.entry.stand * unit
    : GAP + Math.max(0, -model.box[0][1]) * unit;
  let lift = rest;
  const o = at(c, m.face, 0);
  let about = [0, 0, 0];
  let shown = model.frames[0];
  let wide = 1,
    tall = 1;
  if (going) for (let i = 0; i < 3; i++) o[i] += going.offset[i];
  const side = cross(up, forward);
  if (motion) {
    const p = pose(motionTable(), motion, m, frame, phase, time);
    about = p.about;
    wide = 1 + p.squash;
    tall = 1 - 2 * p.squash;
    // squashed about its centre, so it is stood lower by as much, and its
    // underside stays on the face while its top comes down
    lift = GAP + (rest - GAP) * tall;
    if (switchedOff(m)) about = [0, 0, 0];
    if (m.type === STONE) {
      about[1] += ACROSS;
      about[2] = -(going ? going.roll / motionTable().turn : about[2]);
    }
    if (motion.bob) lift += (motion.bob.reach + p.bob) * unit;
    lift += p.lift * unit;
    if (round) {
      // the orbit is in the face's own plane, its x across the way the thing points
      for (let i = 0; i < 3; i++) {
        o[i] += (forward[i] * round.offset[1] - side[i] * round.offset[0]) * unit;
      }
      about[1] += round.turn;
    }
    shown = model.frames[p.frame] || shown;
  }
  for (let i = 0; i < 3; i++) o[i] += up[i] * lift;
  if (!painted && (rest > GAP + FLOATING || motion?.bounce))
    drawShadow(ctx, m, c, model, unit, going?.offset);
  const ct = Math.cos(about[1] * Math.PI * 2),
    st = Math.sin(about[1] * Math.PI * 2);
  const fwd = forward.map((v, i) => v * ct + side[i] * st);
  const right = cross(up, fwd);
  const cx = Math.cos(about[0] * Math.PI * 2),
    sx = Math.sin(about[0] * Math.PI * 2);
  const cz = Math.cos(about[2] * Math.PI * 2),
    sz = Math.sin(about[2] * Math.PI * 2);
  const pts = [];
  for (let i = 0; i < shown.length; i += 3) {
    // about its own z, the way it points, then about its own x, across the
    // face, before it is placed; the turn about its normal is in the basis
    const x = (shown[i] * cz - shown[i + 1] * sz) * unit * wide,
      ty = (shown[i] * sz + shown[i + 1] * cz) * unit,
      tz = shown[i + 2] * unit;
    const y = (ty * cx - tz * sx) * tall,
      z = (ty * sx + tz * cx) * wide;
    const wx = o[0] + x * right[0] + y * up[0] + z * fwd[0];
    const wy = o[1] + x * right[1] + y * up[1] + z * fwd[1];
    const wz = o[2] + x * right[2] + y * up[2] + z * fwd[2];
    pts.push([...screen(wx, wy, wz), depth(wx, wy, wz)]);
  }
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
  for (const { p, fill, blend } of polys) {
    ctx.fillStyle = `rgba(${fill[0]} ${fill[1]} ${fill[2]} / ${blend ? GLASS : 1})`;
    ctx.beginPath();
    // A quad's corners come two edges at a time, 0-1 and 2-3, so its outline
    // runs 0, 1, 3, 2; traced in index order it is a bow-tie with two holes.
    const ring = p.length === 4 ? [p[0], p[1], p[3], p[2]] : p;
    ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
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
function drawFacing(ctx, m, c, face, colour) {
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
// hold, so the marker says it outright once it has the room. A device that
// starts switched off is drawn hollow, the way a beam that starts dark is
// drawn broken.
function drawMarker(ctx, m, c) {
  if (state.hiddenKinds.has(m.id)) return;
  const face = m.face ?? 0;
  const dark = switchedOff(m);
  const colour = markerColour(m);
  const ink = "rgba(9 13 20 / 0.9)";
  const [fx, fy] = off(c, face);
  const [px, py] = off(c, face, OBJECT_HOVER);
  const r = Math.max(4, 7 * state.cam.zoom);
  ctx.save();
  ctx.strokeStyle = "rgba(232 238 251 / 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(px, py);
  ctx.stroke();

  drawFacing(ctx, m, c, face, colour);
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
    const side = m.face !== null && state.show.faces ? ` · ${FACE_NAME[m.face]}` : "";
    label(ctx, markerLabel(m) + (dark ? " · off" : "") + side, px + r + 4, py + 4, "#e8eefb");
  }
  ctx.restore();
}

// A survey mark hangs below the block, where a decoded marker never goes, so
// the two readings of the same cell can be compared at a glance.
function drawMark(ctx, m, c) {
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
    label(ctx, m.face ? `${m.name} ${m.face}` : m.name, px + r + 3, py + 4, "#ffd166");
  }
}

// What floats casts a shadow straight down onto its face, whatever the light,
// as the game does: a disc the width of the thing, on the face's plane.
const SHADOW_SIDES = 14;
function drawShadow(ctx, m, c, model, unit, offset = null) {
  const [lo, hi] = model.box;
  const r = (Math.max(hi[0], -lo[0], hi[2], -lo[2]) * unit) / 2 + 0.06;
  const up = FACE_NORMAL[m.face];
  const a = TANGENT[m.face];
  const b = cross(up, a);
  const o = at(c, m.face, 0.005);
  if (offset) for (let i = 0; i < 3; i++) o[i] += offset[i];
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  for (let i = 0; i < SHADOW_SIDES; i++) {
    const ang = (i / SHADOW_SIDES) * Math.PI * 2;
    const ca = Math.cos(ang) * r,
      sa = Math.sin(ang) * r;
    const [x, y] = screen(...o.map((v, k) => v + a[k] * ca + b[k] * sa));
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// A moving platform's route is the run between the middles of the two cells
// its record names, drawn faint and a cell at a time, so that a block in front
// of it hides it, its dashes carried across the cells so it reads as one line.
// The stretch inside the platform's own blocks, wherever they have got to, is
// left out.
function drawRails(ctx, c, ghost, moving) {
  for (const { a, b, axis, cell, length } of c.rails) {
    const lo = Math.min(a[axis], b[axis]) + 0.5;
    const hi = Math.max(a[axis], b[axis]) + 0.5;
    const at = (v) => {
      const p = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
      p[axis] = v;
      return screen(...p);
    };
    const offset = moving?.get(`${cellKey(...cell)}/null`)?.offset ?? [0, 0, 0];
    const near = cell[axis] + offset[axis];
    const far = near + length;
    const t = [c.x, c.y, c.z][axis];
    const from = Math.max(t, lo);
    const to = Math.min(t + 1, hi);
    const [p, q] = [at(lo), at(lo + 1)];
    const block = Math.hypot(q[0] - p[0], q[1] - p[1]);
    ctx.save();
    ctx.strokeStyle = "rgba(232 238 251 / 0.5)";
    ctx.globalAlpha = ghost ? 0.16 : 1;
    ctx.lineWidth = Math.max(1, 1.5 * state.cam.zoom);
    ctx.setLineDash([2 * state.cam.zoom, 5 * state.cam.zoom]);
    for (const [s, e] of [
      [from, Math.min(to, near)],
      [Math.max(from, far), to],
    ]) {
      if (e <= s) continue;
      ctx.lineDashOffset = (s - lo) * block;
      const [u, v] = [at(s), at(e)];
      ctx.beginPath();
      ctx.moveTo(u[0], u[1]);
      ctx.lineTo(v[0], v[1]);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function label(ctx, text, x, y, colour) {
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(9 13 20 / 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function drawLook(ctx, l) {
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
  label(ctx, "camera target", px + Math.max(9, 12 * state.cam.zoom), y + 4, colour);
}

function drawBase(ctx, l) {
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

function drawScale(ctx) {
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
  label(ctx, `${n} blocks`, px, py - 6, "#b3c0d4");
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
