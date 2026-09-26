import { state, BLOCK, depth, facing, screen, cellKey } from "./state.js";
import {
  FACE_NORMAL,
  FACE_NAME,
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
  ballFor,
  shadowSprites,
} from "./data.js";
import { phasesOf, pose, orbit, press, inReach } from "./motion.js";
import { label } from "./overlays.js";
import { NEUTRAL } from "./atlas.js";

// The types the game draws on the face and nowhere else, so that once the
// face is painted the marker would say the same thing twice; and so would a
// marker for a record's own kind, once its block is painted.
const FACE_ONLY = new Set([1, 2, 8]);
const paintSays = (m) => m.face === null || FACE_ONLY.has(m.type);

/** Whether a marker is left out among the models: where the paint says what it
    would, and for the settings, which have neither mesh nor paint, anywhere but
    on the selected block. */
export const quietAmongModels = (m, painted, selected) =>
  markerGroup(m) === "settings" ? !selected : painted && paintSays(m);

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
export function drawThing(ctx, m, c, l, frame, home = c, going = null) {
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
// that it never dips into its face, and a device switched off stands still
// at the angle it has turned to, as it does in play. The polygons are filled
// back to front in their own colours, since the shading is baked into them,
// and both sides are drawn, since the meshes wind their faces either way.
const GAP = 0.03; // between a thing and its face, in blocks
const GLASS = 0.55; // how much a translucent polygon covers
// The rolling stone's axle is its model's z, which lies across the way it
// rolls, so it stands a quarter turn from the way its facing gives and rolls
// about that axle with its top going the way it travels.
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
    shown = model.frames[p.frame] || shown;
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
  // A polygon is sorted by the depth it has unpressed, so that a model pressed
  // flat keeps the order of its layers, the top one over the rest, where
  // their depths would otherwise tie and trade places as the view turns.
  const pts = [];
  for (let i = 0; i < shown.length; i += 3) {
    // about its own z, the way it points, then about its own x, across the
    // face, before it is placed; the turn about its normal is in the basis
    const x = (shown[i] * cz - shown[i + 1] * sz) * unit * wide,
      ty = (shown[i] * sz + shown[i + 1] * cz) * unit,
      tz = shown[i + 2] * unit;
    const y = (ty * cx - tz * sx) * tall,
      z = (ty * sx + tz * cx) * wide;
    const at = (k, h) => o[k] + x * right[k] + y * h * up[k] + z * fwd[k];
    pts.push([
      ...screen(at(0, height), at(1, height), at(2, height)),
      depth(at(0, 1), at(1, 1), at(2, 1)),
    ]);
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

// The game's shadow is a square laid on the face under the thing, textured
// with one of its sprites and taken away from what is behind it, as strong as
// its colour over neutral. A canvas cannot subtract, so the square's box is
// turned over, the sprite added and the box turned back, which leaves each
// pixel what the sprite takes off it and never less than nothing, where the
// pixel was opaque. It is drawn only on the map's own canvas, which is opaque
// before anything is drawn on it; dropping it on faces turned away, as the
// game does, keeps it off the see-through layer, which starts transparent.
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
