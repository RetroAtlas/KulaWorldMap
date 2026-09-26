import { state, BLOCK, depth, screen, cellKey } from "./state.js";
import {
  FACE_NORMAL,
  FACE_NAME,
  markerColour,
  markerLabel,
  markerFacing,
  markerHeading,
  markerNow,
  markerModel,
  motionTable,
  motionOf,
  modelUnit,
  TANGENT,
  cross,
  startsOf,
  ballFor,
} from "./data.js";
import { phasesOf, pose, orbit, press, inReach } from "./motion.js";
import { label } from "./overlays.js";

// The types the game draws on the face and nowhere else, so that once the
// face is painted the marker would say the same thing twice; and so would a
// marker for a record's own kind, once its block is painted, but for the
// settings record, which stands on no block of its own.
const FACE_ONLY = new Set([1, 2, 8]);
export const paintSays = (m, skins) =>
  m.face === null ? m.kind !== skins.hidden.kind : FACE_ONLY.has(m.type);

/** The disc a thing at a cell covers on the screen, as its centre and radius:
    as wide as its model, about the model's middle, or its marker. */
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

/** Whether a device a switch toggles is drawn off. */
const switchedOff = (m) => markerNow(m) === "off";

// A boost button is pressed by the ball standing within its reach: the ball
// at the level's start, on its own face and its radius off it, and the block
// under the pointer or the one selected, each as the ball on the face of that
// block the button stands on, which is as near as a block can say. Positions
// are in the game's units, the button's where it stands on its face.
const point = (c, face, off) =>
  [c.x, c.y, c.z].map((v, i) => (v + 0.5) / modelUnit() + FACE_NORMAL[face][i] * off);
const starts = new WeakMap();
function pressedAt(motion, m, home, l) {
  const half = 0.5 / modelUnit();
  if (!starts.has(l)) {
    const r = ballFor(l)?.box[1][1] ?? 0;
    starts.set(l, { r, balls: startsOf(l).map((s) => point(s, s.face, half + r)) });
  }
  const { r, balls } = starts.get(l);
  const button = point(home, m.face, half);
  const pointed = [state.hover, state.selected].filter(Boolean);
  return (
    balls.some((b) => inReach(motion, b, button)) ||
    pointed.some((c) => inReach(motion, point(c, m.face, half + r), button))
  );
}

/** An object as itself where it has a mesh and the display asks for it, else
    its marker; on a moving platform the cell is where the platform is, and
    a thing that travels brings where it has got to and which way it faces,
    its marker and its label going with it. Says whether it moves by the
    next frame. */
export function drawThing(ctx, m, c, l, frame, home = c, going = null, painted = false) {
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
  const pushed = motion?.press
    ? press(
        motion,
        `${l.pack}#${l.index}/${cellKey(home.x, home.y, home.z)}/${m.face}`,
        frame,
        pressedAt(motion, m, home, l),
      )
    : null;
  drawObject(
    ctx,
    m,
    c,
    model,
    motion,
    frame,
    phase,
    round,
    l.camera?.time ?? 0,
    going,
    painted,
    pushed?.height,
  );
  if (state.show.labels && state.cam.zoom > 0.45) {
    const [px, py] = off(where, m.face, OBJECT_HOVER);
    const dark = switchedOff(m) ? " · off" : "";
    const side = state.show.faces ? ` · ${FACE_NAME[m.face]}` : "";
    label(ctx, markerLabel(m) + dark + side, px + 8, py + 4, "#e8eefb");
  }
  return pushed ? pushed.moving : !!motion;
}

// An object is its mesh stood on its face: the model's y runs along the face's
// outward normal, its z along the way the thing points where it has one, and
// its lowest vertex sits just off the face, save that a thing the game keeps an
// entry of its own for stands where the game draws it. What moves in play moves
// here at the game's rate, from the table the build read off the executable,
// about those same axes; a thing that bobs is stood its bob's reach higher so
// that it never dips into its face, and a device switched off stands still,
// as it does in play. The polygons are filled back to front in
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

function drawObject(
  ctx,
  m,
  c,
  model,
  motion,
  frame,
  phase,
  round,
  time,
  going,
  painted,
  height = 1,
) {
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
    tall = (1 - 2 * p.squash) * height;
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
// hold, so the marker says it outright once it has the room. A device
// switched off is drawn hollow, the way a dark beam is drawn broken.
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

// What floats casts a shadow straight down onto its face, whatever the light,
// as the game does: a disc on the face's plane, under the thing.
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
