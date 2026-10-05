import { state, BLOCK, depth, facing, screen, screenTo, cellKey, effectFrame } from "./state.js";
import { FACE_NORMAL, FACE_NAME } from "./faces.js";
import {
  markerColour,
  markerLabel,
  markerGroup,
  markerFacing,
  markerHeading,
  markerNow,
  movedFor,
  markerModel,
  motionTable,
  motionOf,
  modelUnit,
  TANGENT,
  cross,
  startsOf,
  shadowSprites,
} from "./data.js";
import { phasesOf, phaseField, pose, orbit, press, inReach } from "./motion.js";
import { label } from "./overlays.js";
import { NEUTRAL } from "./atlas.js";

// The paint on a face says what its marker would, as a block's does for a
// record's own kind.
export const quietAmongModels = (m, painted, selected) =>
  markerGroup(m) === "settings" ? !selected : painted && markerGroup(m) !== "object";

export function thingDisc(m, where, l) {
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

const switchedOff = (m) => markerNow(m) === "off";

// A face reacts to the ball at the level's start, and to a ball on the face of
// the hovered and the selected block that looks the same way. Positions are in
// the game's units.
const point = (c, face, off) =>
  [c.x, c.y, c.z].map((v, i) => (v + 0.5) / modelUnit() + FACE_NORMAL[face][i] * off);
const starts = new WeakMap();
export function ballsFor(l, face) {
  const half = 0.5 / modelUnit();
  if (!starts.has(l))
    starts.set(
      l,
      startsOf(l).map((s) => point(s, s.face, half)),
    );
  const pointed = [state.hover, state.selected].filter(Boolean);
  return [...starts.get(l), ...pointed.map((c) => point(c, face, half))];
}

const pressedAt = (motion, m, home, l) =>
  ballsFor(l, m.face).some((b) => inReach(motion, b, point(home, m.face, 0.5 / modelUnit())));

/** Returns whether the thing moves by the next frame. */
export function drawThing(ctx, m, c, l, frame, home = c, going = null) {
  if (state.hiddenKinds.has(m.id)) return false;
  const motion = state.show.models ? motionOf(m) : null;
  // the game starts a pickup's angles at random and an entry's at zero
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
  const pushed = motion?.press
    ? press(
        motion,
        `${l.pack}#${l.index}/${cellKey(home.x, home.y, home.z)}/${m.face}`,
        effectFrame(frame),
        pressedAt(motion, m, home, l),
      )
    : null;
  drawObject(ctx, m, c, model, motion, frame, phase, round, l.time ?? 0, going, pushed?.height);
  if (state.show.labels && state.cam.zoom > 0.45) {
    const [px, py] = off(where, m.face, OBJECT_HOVER);
    const dark = switchedOff(m) ? " · off" : "";
    const side = state.show.faces ? ` · ${FACE_NAME[m.face]}` : "";
    label(ctx, markerLabel(m) + dark + side, px + 8, py + 4, "#e8eefb");
  }
  return pushed ? pushed.moving : !!motion;
}

// A model's y runs along its face's outward normal and its z the way the thing
// points. Its lowest vertex sits just off the face, but a thing the game keeps
// an entry of its own for stands where the game draws it, and a thing that
// bobs stands its bob's reach higher so that it never dips into its face. Both
// sides of a polygon are drawn, since the meshes wind their faces either way.
const GAP = 0.03;
const GLASS = 0.55;
// The rolling stone's axle is its model's z, which lies across the way it
// rolls, so it stands a quarter turn from its facing.
const STONE = 51;
const ACROSS = 0.25;

function drawObject(ctx, m, c, model, motion, frame, phase, round, time, going, height = 1) {
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
    tall = 1,
    bounce = 0;
  if (going) for (let i = 0; i < 3; i++) o[i] += going.offset[i];
  const side = cross(up, forward);
  if (motion) {
    const p = pose(motionTable(), motion, m, movedFor(m, frame), phase, time);
    about = p.about;
    wide = 1 + p.squash;
    tall = 1 - 2 * p.squash;
    // squashed about its centre, so it is stood lower by as much, and its
    // underside stays on the face while its top comes down
    lift = GAP + (rest - GAP) * tall;
    if (m.type === STONE) {
      about[1] += ACROSS;
      about[2] = -(going ? going.roll / motionTable().turn : about[2]);
    }
    if (motion.bob) lift += (motion.bob.reach + p.bob) * unit;
    lift += p.lift * unit;
    if (motion.bounce) bounce = p.lift / motion.bounce.rise;
    if (round) {
      // the orbit is in the face's own plane, its x across the way the thing points
      for (let i = 0; i < 3; i++) {
        o[i] += (forward[i] * round.offset[1] - side[i] * round.offset[0]) * unit;
      }
      about[1] += round.turn;
    }
    const held = motion.cycle && !state.show.motion;
    shown = model.frames[held ? Math.max(...motion.cycle[phaseField(m)]) : p.frame] || shown;
  }
  for (let i = 0; i < 3; i++) o[i] += up[i] * lift;
  const ct = Math.cos(about[1] * Math.PI * 2),
    st = Math.sin(about[1] * Math.PI * 2);
  const fwd = forward.map((v, i) => v * ct + side[i] * st);
  const right = cross(up, fwd);
  const shade = motion?.shadow;
  if (shade) {
    let strength = shade.strength;
    if (shade.fade) strength -= shade.fade * bounce;
    // the ball's middle is as far off its face as the model reaches below it
    if (shade.top) strength = (strength * (shade.top + model.box[0][1])) / shade.over;
    const along = shade.turns ? fwd : TANGENT[m.face];
    drawShadow(ctx, m, c, shade, unit, going?.offset, along, strength, shade.squash ? wide : 1);
  }
  const cx = Math.cos(about[0] * Math.PI * 2),
    sx = Math.sin(about[0] * Math.PI * 2);
  const cz = Math.cos(about[2] * Math.PI * 2),
    sz = Math.sin(about[2] * Math.PI * 2);
  // A polygon sorts by its unpressed depth, so a model pressed flat keeps the
  // order of its layers rather than letting their tied depths trade places.
  const n = shown.length / 3;
  const polys = polygonsOf(model);
  const { spots, depths, far } = scratch(n, polys.length);
  for (let v = 0; v < n; v++) {
    const i = 3 * v;
    // about its own z, the way it points, then about its own x, across the
    // face, before it is placed; the turn about its normal is in the basis
    const x = (shown[i] * cz - shown[i + 1] * sz) * unit * wide,
      ty = (shown[i] * sz + shown[i + 1] * cz) * unit,
      tz = shown[i + 2] * unit;
    const y = (ty * cx - tz * sx) * tall,
      z = (ty * sx + tz * cx) * wide;
    const pressed = y * height;
    screenTo(
      spots,
      2 * v,
      o[0] + x * right[0] + pressed * up[0] + z * fwd[0],
      o[1] + x * right[1] + pressed * up[1] + z * fwd[1],
      o[2] + x * right[2] + pressed * up[2] + z * fwd[2],
    );
    depths[v] = depth(
      o[0] + x * right[0] + y * up[0] + z * fwd[0],
      o[1] + x * right[1] + y * up[1] + z * fwd[1],
      o[2] + x * right[2] + y * up[2] + z * fwd[2],
    );
  }
  polys.forEach(({ corners }, k) => {
    let z = 0;
    for (const i of corners) z += depths[i];
    far[k] = z / corners.length;
  });
  let colour = null;
  for (const k of backToFront(m, model, far)) {
    const { ring, fill } = polys[k];
    if (fill !== colour) ctx.fillStyle = colour = fill;
    ctx.beginPath();
    ring.forEach((i, j) =>
      j ? ctx.lineTo(spots[2 * i], spots[2 * i + 1]) : ctx.moveTo(spots[2 * i], spots[2 * i + 1]),
    );
    ctx.closePath();
    ctx.fill();
  }
}

// A quad's corners come two edges at a time, 0-1 and 2-3, so its outline runs
// 0, 1, 3, 2.
const polygons = new WeakMap();
function polygonsOf(model) {
  if (!polygons.has(model)) {
    const polys = model.polys.map((corners, k) => {
      const rgb = model.rgb[k];
      const n = corners.length;
      const mean = [0, 1, 2].map((ch) => {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += rgb[i * 3 + ch];
        return Math.round(sum / n);
      });
      const [a, b, c, d] = corners;
      return {
        corners,
        ring: n === 4 ? [a, b, d, c] : corners,
        fill: `rgba(${mean[0]} ${mean[1]} ${mean[2]} / ${model.flags[k] & 2 ? GLASS : 1})`,
      };
    });
    polygons.set(model, polys);
  }
  return polygons.get(model);
}

// Furthest first, ties in the model's order. Each sort starts from the last
// frame's order, which is all but sorted.
const orders = new WeakMap();
function backToFront(m, model, far) {
  let last = orders.get(m);
  if (last?.model !== model) {
    last = { model, order: model.polys.map((_, k) => k) };
    orders.set(m, last);
  }
  const { order } = last;
  for (let i = 1; i < order.length; i++) {
    const k = order[i];
    let j = i - 1;
    for (; j >= 0 && (far[order[j]] < far[k] || (far[order[j]] === far[k] && order[j] > k)); j--)
      order[j + 1] = order[j];
    order[j + 1] = k;
  }
  return order;
}

const buffers = {
  spots: new Float64Array(0),
  depths: new Float64Array(0),
  far: new Float64Array(0),
};
function scratch(corners, polys) {
  if (buffers.depths.length < corners) {
    buffers.spots = new Float64Array(2 * corners);
    buffers.depths = new Float64Array(corners);
  }
  if (buffers.far.length < polys) buffers.far = new Float64Array(polys);
  return buffers;
}

const OBJECT_HOVER = 8 / BLOCK;

function at(c, face, hover = 0) {
  const n = FACE_NORMAL[face];
  const d = 0.5 + hover;
  return [c.x + 0.5 + n[0] * d, c.y + 0.5 + n[1] * d, c.z + 0.5 + n[2] * d];
}
const off = (c, face, hover = 0) => screen(...at(c, face, hover));

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

// The game's shadow is a sprite taken away from what is behind it. A canvas
// cannot subtract, so the box is turned over, the sprite added and the box
// turned back, which is exact where the pixel was opaque: the map's own canvas
// is, and a shadow is dropped on a face turned away, as the game drops it, so
// it never reaches the see-through layer.
const sprites = [];
function spriteOf(k) {
  const rows = shadowSprites()?.[k];
  if (!rows) return null;
  if (!sprites[k]) {
    const cv = document.createElement("canvas");
    cv.width = rows[0].length;
    cv.height = rows.length;
    const g = cv.getContext("2d");
    const img = g.createImageData(cv.width, cv.height);
    rows.forEach((row, v) =>
      [...row].forEach((ch, u) => {
        // a level of 31 is a whole channel, as a texel's is
        const level = parseInt(ch, 32) << 3;
        img.data.set([level, level, level, level ? 255 : 0], (v * cv.width + u) * 4);
      }),
    );
    g.putImageData(img, 0, 0);
    sprites[k] = cv;
  }
  return sprites[k];
}

function drawShadow(ctx, m, c, shade, unit, offset, along, strength, scale) {
  const up = FACE_NORMAL[m.face];
  const sprite = spriteOf(shade.sprite);
  if (!sprite || strength <= 0 || !facing(up)) return;
  const half = motionTable().shadow.half * unit * scale;
  const o = at(c, m.face, shade.off * unit);
  if (offset) for (let i = 0; i < 3; i++) o[i] += offset[i];
  const across = cross(up, along);
  const t = ctx.getTransform();
  const corner = (i, j) => {
    const [x, y] = screen(...o.map((v, k) => v + (along[k] * i + across[k] * j) * half));
    return t.transformPoint(new DOMPoint(x, y));
  };
  const p = [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)];
  const x0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...p.map((q) => q.y))));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...p.map((q) => q.x))));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...p.map((q) => q.y))));
  if (x1 <= x0 || y1 <= y0) return;
  const n = sprite.width;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "difference";
  ctx.fillStyle = "#fff";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, strength / NEUTRAL);
  const [a, b, d] = p;
  ctx.setTransform((b.x - a.x) / n, (b.y - a.y) / n, (d.x - a.x) / n, (d.y - a.y) / n, a.x, a.y);
  ctx.drawImage(sprite, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "difference";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}
