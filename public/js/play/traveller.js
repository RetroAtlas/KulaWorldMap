// The ball as the frame draws it: the ball as one of the frame's travellers, what the frame draws
// at and with while the ball is on the map, the ball's tint, the start the game takes and the
// ball as it last stood.
import { state, camera, depth } from "../viewer/state.js";
import { cellKey, FACE_NORMAL, KIND, TYPE } from "../format/lattice.js";
import {
  TANGENT,
  layHeading,
  markerModel,
  modelUnit,
  motionTable,
  startsOf,
} from "../viewer/data.js";
import { tangent } from "../viewer/walk.js";
import { faceAxes } from "../viewer/motion.js";
import { blockUnder, centreOf, clearance, faceUnder, positionOf } from "./ball.js";
import { frameShown, travelOf, viewOf as drawnIndex } from "./world.js";
import { glowOf, glowStep, seeing } from "./passes.js";

// the ball's key among the frame's travellers, which no thing of the level's answers to
export const BALL = "ball";
// the untinted light, the unit a traveller's tint is in
const LIGHT = 4096;
// how far toward the camera a block counts as covering the ball, in blocks, and the sampling step
const COVER = { reach: 1.5, step: 0.25 };

// the invincible ball's glow counter, kept for the page's life as the game keeps it
let glowCounter = 0;

const motionOn = () => state.show.motion;
const glowTable = () => motionTable().types[String(TYPE.INVINCIBILITY_PILL)].lasts.glow;

/** What the ball shows: its block and face, heading, centre and foot, body and lift. */
export function stateOf(b, probe) {
  return {
    block: blockUnder(b),
    face: faceUnder(b),
    h: b.h,
    centre: centreOf(b),
    foot: footOf(b),
    point: positionOf(b).map((v) => v + b.half),
    body: bodyOf(b),
    height: clearance(b, probe),
    frame: b.ramp ? b.ramp.to : b.frame,
  };
}

/** The body relative to the axes the frame lays the ball on, across, forward and up, by rows. */
export function bodyOf(b) {
  const f = faceAxes(b.n, b.h);
  const [x, y, z] = [0, 1, 2].map((j) => b.body.slice(3 * j, 3 * j + 3));
  const along = (k, v) => f[0][k] * v[0] + f[1][k] * v[1] + f[2][k] * v[2];
  return [0, 1, 2].map((k) => [along(k, x), along(k, y), along(k, z)]);
}

/** The ball as drawn: live while Motion is on, else as it last stood. */
export const shown = (live) => (motionOn() ? stateOf(live.run.ball, live.probe) : live.still);

/** What the frame draws at and with while the ball is on the map: the frame the rules last ran,
    which is the one the game's draw shows, the ending's view's frames added once the level has
    ended, the level's index less what the ball has taken, the walkers where the rules have
    stepped them, and whether every invisible block is seen. */
export const sourceOf = (live, l) =>
  live && l === live.level
    ? {
        frame: frameShown(live.run) + (live.ended?.frame ?? 0),
        idx: drawnIndex(live.run),
        travel: travelOf(live.run),
        seeing: seeing(live.run),
      }
    : null;

/** Whether a block stands between `centre`, in blocks, and the camera, within the cover's reach. */
function covered(probe, centre) {
  const { toward } = camera();
  for (let t = COVER.step; t <= COVER.reach; t += COVER.step)
    if (probe.filled(centre.map((v, i) => Math.floor(v + toward[i] * t)))) return true;
  return false;
}

/** Where the ball touches its face, in blocks. */
export const footOf = (b) => centreOf(b).map((v, i) => v - (b.n[i] * b.radius) / b.unit);
/** The block whose face `foot` lies on, under the normal `n`, or `block` where that cell is
    empty. */
export function blockAt(probe, foot, n, block) {
  const c = foot.map((v, i) => Math.floor(v - 0.5 * n[i]));
  return probe.filled(c) ? c : block;
}

export function travellerOf(live, l) {
  if (!live || l !== live.level || live.ended) return null;
  const s = shown(live);
  const m = live.markers[s.face];
  const n = FACE_NORMAL[s.face];
  const model = markerModel(m, l);
  // the viewer stands a thing a hair off its face; the ball keeps that gap, so it stands where
  // the start's ball stood
  const reach = model ? Math.max(0, -model.box[0][1]) * modelUnit() : 0;
  const offset = s.centre.map((v, i) => v - reach * n[i] - (s.block[i] + 0.5 + 0.5 * n[i]));
  const c = live.idx.cells.get(cellKey(...s.block)) ?? {
    x: s.block[0],
    y: s.block[1],
    z: s.block[2],
    v: KIND.PLAIN,
  };
  const going = {
    w: { c, m, face: s.face },
    offset,
    fwd: s.h,
    body: s.body,
    height: s.height,
    tint: tintOf(live, live.run.words),
    through: covered(live.probe, s.centre),
    // at an inner corner the ball touches the block it leaves as well as the wall, and a
    // platform's blocks are drawn off their cells, so while the climb's ramp runs or the ball
    // rides it sorts as the unit cube about its centre would, by that cube's corner as a block
    // sorts by its cell's depth, rather than by the block under it
    depth:
      live.run.ball.ramp?.kind === "climb" || live.run.ball.riding
        ? depth(...s.centre.map((v) => v - 0.5))
        : undefined,
  };
  return new Map([[BALL, going]]);
}

/** The ball's light: flashing while it is marked dying, else tinted by its heat, melt and cold
    and, while the invincibility pill's word stands, raised by the glow. */
export function tintOf(live, w) {
  const { types, turn } = motionTable();
  if (w.dying) {
    const level = LIGHT + LIGHT * Math.sin((live.flash / turn) * 2 * Math.PI);
    return [level, level, level];
  }
  const words = [w.heat, w.melt, w.cold];
  const glowing = w.pills[TYPE.INVINCIBILITY_PILL] >= 0;
  if (!words.some(Boolean) && !glowing) return undefined;
  const { own, other } = types[String(TYPE.START)].tint;
  const raised = glowing ? glowOf(glowCounter, glowTable(), turn) : null;
  // the sine's one is the untinted light
  const lift = (ch) => (raised ? (raised[ch] * LIGHT) / turn : 0);
  return words.map((word, ch) => {
    const tinted = words.reduce(
      (level, v, k) => (k === ch ? level : level - Math.floor((v * LIGHT) / other)),
      LIGHT + Math.floor((word * LIGHT) / own),
    );
    return Math.max(0, tinted + lift(ch));
  });
}

// The dying flash's angle steps each frame the mark stands and starts over as it clears.
export function flashed(live, w) {
  const { types, turn } = motionTable();
  live.flash = w.dying ? (live.flash + types[String(TYPE.START)].dying.flash) % turn : 0;
}

// The glow's counter steps on each frame the ball is drawn with the pill's word not negative, and
// is never put back.
export function glowed(live, w) {
  if (!live.ended && w.pills[TYPE.INVINCIBILITY_PILL] >= 0)
    glowCounter = glowStep(glowCounter, glowTable());
}

/** The things on `key`'s block the ball has taken, as play's level still lists them. */
export const takenOn = (live, key) =>
  live
    ? (live.run.world.idx.markers.get(key) ?? []).filter(
        (m) => m.face !== null && live.run.world.taken.has(`${key}/${m.face}`),
      )
    : [];

/** The start the game takes, as the ball stands on it, or null. */
export function startOf(l, probe) {
  const s = startsOf(l).at(-1);
  if (!s) return null;
  const cell = [s.x, s.y, s.z];
  if (!probe.standable(cell, s.face)) return null;
  return { cell, face: s.face, h: layHeading(s) ?? TANGENT[s.face], marker: s };
}

/** The first face of the level the ball could stand on, or null. */
export function firstStandable(probe) {
  for (const c of state.idx.cells.values())
    for (let face = 0; face < FACE_NORMAL.length; face++)
      if (probe.standable([c.x, c.y, c.z], face))
        return { cell: [c.x, c.y, c.z], face, h: tangent(face, 0) };
  return null;
}

export function markersFor(start) {
  const base = start?.marker
    ? { type: start.marker.type, f: start.marker.f, v: undefined, variant: null }
    : { type: TYPE.START, f: [], v: undefined, variant: null };
  return FACE_NORMAL.map((_, face) => ({ ...base, id: BALL, face }));
}
