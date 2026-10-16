// Play mode: the ball stood on the level and rolled by the keys, or along the planned route, the
// camera behind it.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { adoptCourse, current, measureStrip } from "../viewer/chrome/course.js";
import { drawPieces } from "../viewer/draw/ribbon.js";
import { ageDust, burstDust, drawDust, dustAlive, resetDust, travelDust } from "./dust.js";
import {
  state,
  BLOCK,
  FIT_MARGIN,
  FIT_ZOOM_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  basisAt,
  camera,
  depth,
  fitLevel,
  levelCentre,
} from "../viewer/state.js";
import { SIDE, cellKey, FACE_NAME, FACE_NORMAL, DIRECTION_NAME } from "../format/lattice.js";
import {
  ballFor,
  blockUnits,
  counted,
  flip,
  jumpTable,
  layHeading,
  levelTitle,
  litNow,
  markerLabel,
  markerModel,
  markerNow,
  modelUnit,
  motionTable,
  skinsTable,
  startsOf,
  theCircuit,
  worldTint,
  TANGENT,
} from "../viewer/data.js";
import { headingOn, pieces, probeOf, tangent } from "../viewer/walk.js";
import { faceAxes } from "../viewer/motion.js";
import {
  draw,
  drawSoon,
  invalidatePick,
  movingWith,
  overlayWith,
  runWith,
} from "../viewer/draw/render.js";
import { ballsWith } from "../viewer/draw/things.js";
import { iconFor } from "../viewer/draw/icons.js";
import { toast } from "../viewer/ui/toast.js";
import { chip, fit, fitWith, writeHash } from "../viewer/chrome/navigate.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { say } from "../viewer/chrome/a11y.js";
import { clearDetail, onShow, showCell } from "../viewer/chrome/detail.js";
import { tipWith } from "../viewer/chrome/interaction.js";
import {
  PAD,
  REST,
  ROLLING,
  WRAPPING,
  blockUnder,
  centreOf,
  clearance,
  faceOf,
  faceUnder,
  moving,
  offsetFrame,
  positionOf,
} from "./ball.js";
import { frame as gameFrame, heeds, relevel, restart, revive, stand, startRun } from "./rules.js";
import { courseDriver } from "./drive.js";
import { probeOf as liveProbe, travelOf, viewOf as drawnIndex } from "./world.js";

const BALL_TYPE = 30;
const AS_STONE_TYPES = new Set([10]);
// the untinted light, the unit a traveller's tint is in
const LIGHT = 4096;
const YAW = 20;
const PITCH = 30;
const ZOOM = { blocks: 8, min: 0.8, max: 3 };
const BELOW = 1 / 5;
const FOLLOW_MS = 120;
const ENTER_MS = 600;
const LEAVE_MS = 450;
const GAP_MS = 250;
// how far toward the camera a block counts as covering the ball, in blocks, and the sampling step
const COVER = { reach: 1.5, step: 0.25 };
const BITS = {
  ArrowUp: PAD.up,
  ArrowLeft: PAD.left,
  ArrowRight: PAD.right,
  ArrowDown: PAD.down,
  " ": PAD.cross,
};
const PAD_BITS = { up: PAD.up, left: PAD.left, right: PAD.right, down: PAD.down, jump: PAD.cross };
const PLAIN_KIND = 0;
const REFUSED = {
  arrow: "The ball cannot roll off here: the arrow points another way.",
};
const AS_STONE = "The ball rolls over a boost button as over plain stone for now.";
const RIDING = "The ball rides the platform.";
const NO_START = "The level has no start, so the ball stands on the first face it could.";
const NOWHERE = "The level has no face the ball could stand on.";
const OBJECTS_ON = "Objects turned on, for the ball.";
const VERDICT = {
  time: "Time is up.",
  lost: "The ball fell off the level.",
  exit: "Out by the exit: the level is done.",
  hidden: "Out by the hidden exit: the level is done.",
  bonus: "Every block is marked: the level is done.",
  spikes: "The ball is killed on the spikes.",
  fire: "The ball is burnt.",
  captivator: "The ball is caught.",
  acid: "The ball is dissolved in the acid.",
  laser: "The ball is killed in the beam.",
};
const DYING = {
  spikes: "On the spikes",
  fire: "Burnt",
  captivator: "Caught",
  acid: "In the acid",
  laser: "In the beam",
};
const WOULD = {
  spikes: "been killed on the spikes",
  fire: "been burnt",
  captivator: "been caught",
  acid: "been dissolved in the acid",
  laser: "been killed in the beam",
  lost: "fallen off the level",
};
const FORGIVEN = (name) => `Forgiven: the ball would have ${WOULD[name]}.`;
const ENDED = "The level has ended.";
const OPENED = "The last key is taken: the exits are open.";
const BROKE = "The crumbling block breaks under the ball.";
const GONE = (cell) => `The crumbling block at ${cell} is gone.`;
const SENDING = "The teleporter is sending the ball.";
const KEYS_LEFT = "The keys left to take";
const BLOCKS_LEFT = "The blocks left to roll onto";
const AGAIN = "Space or a tap on the pad starts the level again.";
const KEPT = "The way the ball has come is now the route.";
const ROUTE_STANDS = "A route already stands; clear it to keep the walk.";
const FOLLOWING = "Following the route; an arrow, Space or the pad takes the ball back.";
const NO_FIRST_STOP = "The route's first stop has nothing to stand on.";
const DONE_WHY = {
  end: "The route is done: the ball stands at its last stop.",
  leap: "The route leaps from here, which the ball cannot follow.",
  strayed: "The ball has left the route.",
};
const AT_SWITCH = 6;
const AT_TAKE = 10;
const AT_BREAK = 2;
const TRAIL = 12;

let live = null;
let held = 0;
let tapped = 0;
let last = 0;
let owed = 0;
let ease = null;
let redraw = false;
let measure = () => {};
let padShown = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
let forgiving = false;
let wired = false;

export const playing = () => live !== null;

const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const motionOn = () => state.show.motion;
const smooth = (t) => t * t * (3 - 2 * t);
const faceName = (v) => DIRECTION_NAME[faceOf(v)];

// --- the ball as the frame draws it -----------------------------------------------------

/** What the ball shows: its block and face, heading, centre and foot, body and lift. */
function stateOf(b) {
  return {
    block: blockUnder(b),
    face: faceUnder(b),
    h: b.h,
    centre: centreOf(b),
    foot: footOf(b),
    point: positionOf(b).map((v) => v + b.half),
    body: bodyOf(b),
    height: clearance(b, live.probe),
    frame: b.ramp ? b.ramp.to : b.frame,
  };
}

/** The body relative to the axes the frame lays the ball on, across, forward and up, by rows. */
function bodyOf(b) {
  const f = faceAxes(b.n, b.h);
  const [x, y, z] = [0, 1, 2].map((j) => b.body.slice(3 * j, 3 * j + 3));
  const along = (k, v) => f[0][k] * v[0] + f[1][k] * v[1] + f[2][k] * v[2];
  return [0, 1, 2].map((k) => [along(k, x), along(k, y), along(k, z)]);
}

/** The ball as drawn: live while Motion is on, else as it last stood. */
const shown = () => (motionOn() ? stateOf(live.run.ball) : live.still);

/** The tables the rules read: the motion table, the mesh file's arc for the jump, a block's units
    and where the data's records and styles begin. */
const tablesOf = () => ({
  motion: motionTable(),
  jump: jumpTable(),
  unit: blockUnits(),
  first: state.data.firstRecord,
  styles: state.data.styles,
  skins: skinsTable(),
});

/** The circuits as the map holds them, so a press in the panel and a switch the ball throws are
    one truth. */
const circuitsOf = () => ({ on: (m) => markerNow(m) === "on", lit: litNow, flip });

/** What the frame draws at and with while the ball is on the map: play's frame, the ending's
    view's frames added once the level has ended, the level's index less what the ball has taken,
    and the walkers where the rules have stepped them. */
const source = (l) =>
  live && l === live.level
    ? {
        frame: live.run.words.frame + (live.ended?.frame ?? 0),
        idx: drawnIndex(live.run),
        travel: travelOf(live.run),
      }
    : null;

/** Whether a block stands between `centre`, in blocks, and the camera, within the cover's reach. */
function covered(centre) {
  const { toward } = camera();
  for (let t = COVER.step; t <= COVER.reach; t += COVER.step)
    if (live.probe.filled(centre.map((v, i) => Math.floor(v + toward[i] * t)))) return true;
  return false;
}

const onFace = (b) => b.state === REST || b.state === ROLLING || b.state === WRAPPING;
/** Where the ball touches its face, in blocks. */
const footOf = (b) => centreOf(b).map((v, i) => v - (b.n[i] * b.radius) / b.unit);
/** The block whose face `foot` lies on, under the normal `n`, or `block` where that cell is
    empty. */
function blockAt(foot, n, block) {
  const c = foot.map((v, i) => Math.floor(v - 0.5 * n[i]));
  return live.probe.filled(c) ? c : block;
}

export function station() {
  if (!live) return null;
  const s = shown();
  return { block: s.block, face: s.face, heading: faceName(s.h), moving: moving(live.run.ball) };
}

/** What the frame is handed for the ball, or null while no ball is on the level. */
export const handed = () => (live ? (travellers(live.level)?.get(live.key) ?? null) : null);

function travellers(l) {
  if (!live || l !== live.level || live.ended) return null;
  const s = shown();
  const m = live.markers[s.face];
  const n = FACE_NORMAL[s.face];
  const model = markerModel(m, l);
  // the viewer stands a thing a hair off its face; the ball keeps that gap, so it meets the
  // start's ball
  const reach = model ? Math.max(0, -model.box[0][1]) * modelUnit() : 0;
  const offset = s.centre.map((v, i) => v - reach * n[i] - (s.block[i] + 0.5 + 0.5 * n[i]));
  const c = live.idx.cells.get(cellKey(...s.block)) ?? {
    x: s.block[0],
    y: s.block[1],
    z: s.block[2],
    v: PLAIN_KIND,
  };
  const going = {
    w: { c, m, face: s.face },
    offset,
    fwd: s.h,
    body: s.body,
    height: s.height,
    tint: tintOf(live.run.words),
    through: covered(s.centre),
    // at an inner corner the ball touches the block it leaves as well as the wall, and a
    // platform's blocks are drawn off their cells, so while the climb's ramp runs or the ball
    // rides it sorts by its own centre rather than by the block under it
    depth:
      live.run.ball.ramp?.kind === "climb" || live.run.ball.riding ? depth(...s.centre) : undefined,
  };
  return new Map([[live.key, going]]);
}

/** The ball's light: flashing while it is marked dying, else tinted by its heat, melt and cold. */
function tintOf(w) {
  const { types, turn } = motionTable();
  if (w.dying) {
    const level = LIGHT + LIGHT * Math.sin((live.flash / turn) * 2 * Math.PI);
    return [level, level, level];
  }
  const words = [w.heat, w.melt, w.cold];
  if (!words.some(Boolean)) return undefined;
  const { own, other } = types[String(BALL_TYPE)].tint;
  return words.map((word, ch) =>
    Math.max(
      0,
      words.reduce(
        (level, v, k) => (k === ch ? level : level - Math.floor((v * LIGHT) / other)),
        LIGHT + Math.floor((word * LIGHT) / own),
      ),
    ),
  );
}

// --- the camera ---------------------------------------------------------------------------

const mul = (a, b) =>
  [0, 1, 2].flatMap((j) =>
    [0, 1, 2].map((i) => a[i] * b[3 * j] + a[3 + i] * b[3 * j + 1] + a[6 + i] * b[3 * j + 2]),
  );
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const basisOf = (yaw, pitch) => {
  const { right, up, toward } = basisAt(yaw, pitch);
  return [...right, ...up, ...toward];
};

function quatOf(m) {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = m;
  const t = m00 + m11 + m22;
  if (t > 0) {
    const s = Math.sqrt(t + 1) * 2;
    return [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
}

const matOf = ([x, y, z, w]) => [
  1 - 2 * (y * y + z * z),
  2 * (x * y + z * w),
  2 * (x * z - y * w),
  2 * (x * y - z * w),
  1 - 2 * (x * x + z * z),
  2 * (y * z + x * w),
  2 * (x * z + y * w),
  2 * (y * z - x * w),
  1 - 2 * (x * x + y * y),
];

function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) {
    b = b.map((v) => -v);
    d = -d;
  }
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (b[i] - v) * t);
    const len = Math.hypot(...q);
    return q.map((v) => v / len);
  }
  const theta = Math.acos(d) * t;
  const r = b.map((v, i) => v - a[i] * d);
  const len = Math.hypot(...r);
  return a.map((v, i) => v * Math.cos(theta) + (r[i] / len) * Math.sin(theta));
}

/** The view's rotation: the frame turned by the orbit's yaw and pitch. */
const viewOf = (frame, yaw, pitch) =>
  frame ? mul(frame, basisOf(yaw, pitch)) : basisOf(yaw, pitch);

/** Frame the view on the ball: behind it and above, the ball a little below the middle. */
function frameBall(l) {
  if (!live || l !== live.level) {
    state.frame = null;
    return fitLevel(l);
  }
  if (live.ended) return frameEnding(l);
  const s = shown();
  state.target = [...s.centre];
  if (!live.framed) {
    state.cam.yaw = YAW;
    state.cam.pitch = PITCH;
    live.framed = true;
  }
  const { w, h } = state.view;
  const free = h - chrome();
  const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.min(w, free) / (ZOOM.blocks * BLOCK)));
  state.cam.zoom = zoom;
  state.cam.panX = 0;
  state.cam.panY = -(free * (0.5 + BELOW) - h / 2) / (zoom * BLOCK);
}

/** How much of the map's height the strip and the pad take, as they stand, from its foot. */
function chrome() {
  const foot = $("cv").getBoundingClientRect().bottom;
  let top = foot;
  for (const id of ["play", "pad"]) {
    const el = $(id);
    if (!el.hidden) top = Math.min(top, el.getBoundingClientRect().top);
  }
  return foot - top;
}

// --- the ending's view --------------------------------------------------------------------

/** Half the level's box's diagonal, in blocks: no cell of it lies further from its middle. */
const radiusOf = (l) => Math.hypot(...[0, 1, 2].map((i) => l.max[i] - l.min[i] + 1)) / 2;

/** Frame the ending's view: the level's middle in the middle of what the strip and the pad leave
    free, zoomed so that the whole level fits with the eye at its mean distance. */
function frameEnding(l) {
  const e = live.ended;
  state.target = levelCentre(l);
  const { w, h } = state.view;
  e.free = h - chrome();
  const fits = (Math.min(w, e.free) - FIT_MARGIN) / (2 * e.radius * BLOCK);
  e.base = Math.max(ZOOM_MIN, Math.min(FIT_ZOOM_MAX, fits));
  swung();
}

// The orbit has no eye, so the zoom stands in for how large the level looks from the game's,
// which stands the level's radius and an offset off the middle and swings its reach nearer and
// further by turns.
function swung() {
  const e = live.ended;
  const { turn } = motionTable();
  const eye = (theta) =>
    e.radius * blockUnits() + e.view.off + e.view.reach * Math.sin((theta / turn) * 2 * Math.PI);
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (e.base * eye(0)) / eye(e.theta)));
  state.cam.zoom = zoom;
  state.cam.panX = 0;
  state.cam.panY = -(e.free / 2 - state.view.h / 2) / (zoom * BLOCK);
}

/** One frame of the ending's view: the yaw turned by the game's third angle, the pitch by its
    first, the eye along its swing, and the level started again as the view's length runs out. */
function turning() {
  const e = live.ended;
  const { turn } = motionTable();
  const [pitch, , yaw] = e.view.angles;
  state.cam.yaw += (yaw * 360) / turn;
  state.cam.pitch += (pitch * 360) / turn;
  e.theta += e.view.swing;
  e.frame += 1;
  swung();
  if (e.frame >= e.length) startOver();
}

function startEase(from, to, ms, done) {
  if (!motionOn()) {
    done();
    return;
  }
  ease = { from, to, qa: quatOf(from.rot), start: performance.now(), ms, done };
}

function easing(now) {
  const e = ease;
  const t = Math.min(1, (now - e.start) / e.ms);
  if (t >= 1) {
    ease = null;
    e.done();
    writeHash();
    return;
  }
  const k = smooth(t);
  const rot = matOf(slerp(e.qa, quatOf(e.to.rot()), k));
  const { yaw, pitch } = state.cam;
  state.frame = mul(rot, transpose(basisOf(yaw, pitch)));
  state.cam.zoom = Math.exp(
    Math.log(e.from.zoom) + (Math.log(e.to.zoom) - Math.log(e.from.zoom)) * k,
  );
  state.cam.panX = e.from.panX + (e.to.panX - e.from.panX) * k;
  state.cam.panY = e.from.panY + (e.to.panY - e.from.panY) * k;
  const target = e.to.target();
  state.target = e.from.target.map((v, i) => v + (target[i] - v) * k);
}

function finishEase() {
  if (!ease) return;
  const e = ease;
  ease = null;
  e.done();
}

const viewNow = () => ({
  rot: viewOf(state.frame, state.cam.yaw, state.cam.pitch),
  zoom: state.cam.zoom,
  panX: state.cam.panX,
  panY: state.cam.panY,
  target: [...state.target],
});

// --- the frame ----------------------------------------------------------------------------

function wake() {
  last = performance.now();
  drawSoon();
}

/** Run the game frames the wall clock owes, and move the camera after the ball. */
function advance() {
  if (!live && !ease) return;
  const now = performance.now();
  const dt = Math.min(GAP_MS, now - last);
  last = now;
  let moved = live ? stepped(dt) : false;
  // after the step, so the ease's end is this frame's
  if (ease) {
    easing(now);
    invalidatePick();
  }
  if (!live) return;
  if (!ease && !live.ended) {
    const s = shown();
    const k = motionOn() ? 1 - Math.exp(-dt / FOLLOW_MS) : 1;
    state.target = state.target.map((v, i) => v + (s.centre[i] - v) * k);
    const frame = motionOn() ? looked(live.run.ball) : s.frame;
    if (state.frame !== frame) {
      state.frame = frame;
      moved = true;
    }
  }
  if (moved) invalidatePick();
}

/** Step the game frames `dt` ms owe, the level running at rest with Motion on and only while the
    ball moves or a key is held without it, and the ending's view in the level's place once it
    has ended, with Motion on alone: whether anything moved. */
function stepped(dt) {
  let moved = false;
  const runs = live.ended
    ? motionOn()
    : motionOn() || moving(live.run.ball) || held || tapped || live.driver !== null;
  if (runs) {
    owed += (dt * motionTable().hz) / 1000;
    while (owed >= 1 && live) {
      owed -= 1;
      if (live.ended) turning();
      else played();
      moved = true;
    }
  } else owed = 0;
  if (!live) return moved;
  if (motionOn() && dustAlive()) {
    ageDust(dt / 1000);
    moved = true;
  }
  const b = live.run.ball;
  if (!moving(b) || live.station) live.still = stateOf(b);
  live.station = false;
  if (moved) line();
  return moved;
}

/** A burst of `n0` motes at `point` over `block`, while the dust is on, still with Motion off. */
function burst(point, n, block, n0) {
  if (state.show.dust) burstDust(point, n, block, n0, !motionOn());
}

/** Dust along the footprint's travel from `from` to `to`, while the dust is on. */
function strewn(from, to, n, blockOf, still = false) {
  if (state.show.dust) travelDust(from, to, n, blockOf, still);
}

/** One game frame of the level with the pad as held, its dust, and what happened. */
function played() {
  const run = live.run;
  const b = run.ball;
  const pad = held | tapped | (live.driver ? live.driver.pad(run) : 0);
  // a tap stands until a frame reads the pad, as the level opens with it dead
  if (heeds(run)) tapped = 0;
  const was = onFace(b) ? footOf(b) : null;
  const events = gameFrame(run, pad);
  if (!motionOn()) ageDust(1 / motionTable().hz);
  else if (was && onFace(b) && !events.some((e) => e.sent)) {
    const under = blockUnder(b);
    strewn(was, footOf(b), b.n, () => under);
  }
  for (const event of events) happened(event);
  rested(b);
  flashed(run.words);
  if (run.words.send >= 0) status(SENDING);
  else if (live.status === SENDING) status(null);
  if (live.driver) {
    const why = live.driver.done(run);
    if (why) followed(why);
    else if (!live.status) status(FOLLOWING);
  }
  const death = deathOf(run.words);
  if (death) status(DYING[death], true);
  else if (live.dire) status(null);
  if (b.state === REST) live.notes.length = 0;
}

/** The name of the ending `code` in the table, or null. */
function endingName(code) {
  const { ending } = motionTable().play;
  return Object.keys(ending).find((k) => ending[k] === code) ?? null;
}

/** The cause of the death whose countdown runs, or null. */
function deathOf(w) {
  if (w.outcome || !w.ending) return null;
  const name = endingName(w.ending);
  return DYING[name] ? name : null;
}

// The dying flash's angle steps each frame the mark stands and starts over as it clears.
function flashed(w) {
  const { types, turn } = motionTable();
  live.flash = w.dying ? (live.flash + types[String(BALL_TYPE)].dying.flash) % turn : 0;
}

// The last two stations the ball rested on, the heading the latest at each.
function rested(b) {
  const rests = live.rests;
  const last = rests.at(-1);
  if (last && sameStation(last, b.rest)) rests[rests.length - 1] = b.rest;
  else live.rests = [...rests.slice(-1), b.rest];
}

/** Where a forgiven ball is put back: its last rest, or the rest before where it died at rest
    there. */
function refuge() {
  const b = live.run.ball;
  const here = { cell: blockUnder(b), face: faceUnder(b) };
  const [earlier, last] = live.rests.length > 1 ? live.rests.slice(-2) : [null, b.rest];
  return earlier && b.state === REST && sameStation(last, here) ? earlier : b.rest;
}

const again = () =>
  !!(
    ease ||
    (live &&
      (motionOn() || (!live.ended && (moving(live.run.ball) || held || tapped || live.driver))))
  );

/** The frame hook: another frame while the view eases, the level runs or something moves, and one
    more where the view has just cut. */
function more() {
  const asked = again() || redraw;
  redraw = false;
  return asked;
}

/** The ball's frame pitched further down by the view's word while it falls. */
const looked = (b) => (b.look.word ? offsetFrame(b.frame, 0, b.look.word, b.rules.turn) : b.frame);

function happened(event) {
  const b = live.run.ball;
  if (event.refused) {
    if (REFUSED[event.refused]) status(REFUSED[event.refused]);
    return;
  }
  if (event.ended) {
    const name = endingName(event.ended.code);
    if (forgiving && WOULD[name]) forgive(name);
    else ended(event.ended.code);
    return;
  }
  if (event.dying) {
    say(DYING[event.dying.cause]);
    if (forgiving) forgive(event.dying.cause);
    return;
  }
  if (event.took) {
    taken(event.took);
    return;
  }
  if (event.opened) {
    say(OPENED);
    return;
  }
  if (event.threw) {
    threw(event.threw);
    return;
  }
  if (event.broke) {
    broke(event.broke);
    return;
  }
  if (event.fell) {
    fell(event.fell);
    return;
  }
  if (event.sent) {
    sent(event.sent);
    return;
  }
  if (event.rode) {
    live.notes.push(RIDING);
    return;
  }
  if (event.alit) {
    if (live.status === RIDING) status(null);
    return;
  }
  if (event.clock) {
    const { second } = motionTable().play.clock;
    const left = Math.max(0, Math.floor(event.clock.to / second));
    say(`The hourglass turns the clock round: ${counted(left, "second")} left.`);
    return;
  }
  if (event.at) {
    live.station = true;
    const block = blockUnder(b);
    say(noted(`${block.join(",")}, ${FACE_NAME[faceUnder(b)]}`));
    status(standsOn(block, faceUnder(b)) ? AS_STONE : b.riding ? RIDING : null);
    walked({ cell: block, face: faceUnder(b) });
    if (!motionOn()) strewn(live.still.foot, footOf(b), b.n, (p) => blockAt(p, b.n, block), true);
  } else if (event.face) {
    live.station = true;
    say(noted(`${FACE_NAME[faceUnder(b)]} of ${blockUnder(b).join(",")}, now underfoot`));
    burst(footOf(b), b.n, blockUnder(b), AT_SWITCH);
  } else if (event.turned) live.station = true;
}

/** A thing taken: a burst of dust where it stood, the take said, and the panel brought up to date
    where it shows the block. */
function taken({ key, face, points, at }) {
  const c = live.idx.cells.get(key);
  const m = (live.idx.markers.get(key) ?? []).find((m) => m.face === face);
  const point = at.map((v) => v / live.run.ball.unit + 0.5);
  burst(point, FACE_NORMAL[face], [c.x, c.y, c.z], AT_TAKE);
  const label = markerLabel(m);
  say(points ? `${label} taken, ${counted(points, "point")}.` : `${label} taken.`);
  refreshPanel();
  invalidatePick();
}

/** The panel drawn again where it shows a block, so what it says of the block's things holds. */
function refreshPanel() {
  if (state.selected) showCell(state.selected, { raise: false });
}

/** A stop's sentence with what happened on the way to it, which a sentence of its own said
    mid-roll would lose to the stop's within the frame. */
const noted = (text) => (live.notes.length ? `${text}. ${live.notes.splice(0).join(" ")}` : text);

/** A switch thrown under the ball: dust at its foot, the circuit's turn said, the panel redrawn. */
function threw({ circuit }) {
  const b = live.run.ball;
  burst(footOf(b), b.n, blockUnder(b), AT_SWITCH);
  const text = `Switch thrown: ${theCircuit(circuit)} turned over.`;
  say(text);
  live.notes.push(text);
  refreshPanel();
}

/** A crumbling block broken under the ball: dust at its foot each time the game breaks it, and
    the break said the first time. */
function broke({ key }) {
  const b = live.run.ball;
  burst(footOf(b), b.n, blockUnder(b), AT_BREAK);
  if (live.broken.has(key)) return;
  live.broken.add(key);
  say(BROKE);
  live.notes.push(BROKE);
}

/** A crumbling block gone: dust where it stood, drawn over the nearest block the frame still
    draws, the panel cleared where it showed the block, and the fall said. */
function fell({ key }) {
  const { x, y, z } = live.idx.cells.get(key);
  const over = nearestDrawn([x, y, z]);
  if (over) burst([x + 0.5, y + 0.5, z + 0.5], live.run.ball.n, over, AT_TAKE);
  if (state.selected?.key === key) clearDetail();
  say(GONE([x, y, z].join(",")));
  redraw = true;
  invalidatePick();
}

/** The cell nearest `cell` among those the frame draws, or null where it draws none. */
function nearestDrawn(cell) {
  let best = null;
  let least = Infinity;
  for (const c of drawnIndex(live.run).cells.values()) {
    const d = (c.x - cell[0]) ** 2 + (c.y - cell[1]) ** 2 + (c.z - cell[2]) ** 2;
    if (d < least) [best, least] = [[c.x, c.y, c.z], d];
  }
  return best;
}

/** The ball sent by a teleporter: dust at both ends, a leap in its way, the view cut to it. */
function sent({ from, to }) {
  const b = live.run.ball;
  live.station = true;
  live.still = stateOf(b);
  for (const { cell, face } of [from, to]) {
    const n = FACE_NORMAL[face];
    const point = cell.map((v, i) => v + 0.5 + 0.5 * n[i]);
    burst(point, n, cell, AT_TAKE);
  }
  walked({ cell: to.cell, face: to.face }, true);
  state.frame = b.frame;
  state.target = [...centreOf(b)];
  if (state.framing === fit) fit();
  status(standsOn(to.cell, to.face) ? AS_STONE : null);
  say(`Sent to the ${FACE_NAME[to.face]} of ${to.cell.join(",")}.`);
  redraw = true;
  invalidatePick();
}

/** The level has ended: the ball is gone and the pad dead, the view lets go of the ball and turns
    about the level's middle as the game's does, and the strip gives the verdict with the points
    and the time left, until a key starts the level again or the view has run the length of one
    swing of an arcade level's eye, whichever figures the level's own eye swings by. */
function ended(code) {
  const { play, turn } = motionTable();
  const { view, clock } = play;
  const w = live.run.words;
  live.ended = {
    code,
    frame: 0,
    length: Math.floor(turn / view.swing),
    theta: 0,
    view: w.bonus ? { ...view, ...view.bonus } : view,
    radius: radiusOf(live.level),
    free: 0,
    base: 1,
  };
  held = tapped = owed = 0;
  retire();
  routing();
  finishEase();
  state.frame = null;
  fit();
  const name = endingName(code);
  const seconds = Math.max(0, Math.floor(w.clock / clock.second));
  const text = `${VERDICT[name] ?? ENDED} ${counted(w.score, "point")}, ${counted(seconds, "second")} left. ${AGAIN}`;
  status(text);
  say(text);
  redraw = true;
  invalidatePick();
}

/** The death forgiven: the ball put back at rest and the status saying what would have been. */
function forgive(name) {
  const b = live.run.ball;
  revive(live.run, refuge());
  live.flash = 0;
  live.still = stateOf(b);
  live.station = true;
  walked({ cell: blockUnder(b), face: faceUnder(b) }, true);
  status(FORGIVEN(name));
  say(FORGIVEN(name));
  state.frame = b.frame;
  if (state.framing === fit) fit();
  refreshPanel();
  redraw = true;
  invalidatePick();
}

/** The level again from its start, as the game loads it after an ending, the view coming back
    behind the ball; a level with no start stands the ball on the first face it could, as
    entering does. */
function startOver() {
  if (!live) return;
  const start = startOf(live.level, live.probe);
  const where = start ? null : firstStandable(live.probe);
  if (!start && !where) {
    toast(NOWHERE);
    leave();
    return;
  }
  const from = viewNow();
  live.run = restart(live.run, where);
  live.probe = liveProbe(live.run);
  live.ended = null;
  live.driver = null;
  live.route = null;
  live.framed = false;
  state.presses = new Map();
  const b = live.run.ball;
  const at = { cell: blockUnder(b), face: faceUnder(b) };
  live.key = keyOf(start, at);
  live.walk = { stations: [at], steps: [] };
  live.trail = null;
  live.notes = [];
  live.rests = [];
  live.broken = new Set();
  live.flash = 0;
  live.still = stateOf(b);
  resetDust(worldTint(live.level.theme));
  routing();
  status(start ? null : NO_START);
  held = tapped = owed = 0;
  state.frame = b.frame;
  fit();
  arrive(from);
  line();
  refreshPanel();
  redraw = true;
  invalidatePick();
  say(
    `${levelTitle(live.level)} again. The ball stands on the ${FACE_NAME[at.face]} of ${at.cell.join(",")}, facing ${faceName(b.h)}.`,
  );
}

// --- the trail -------------------------------------------------------------------------------

const sameStation = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);

/** The walk's step from station `a` to `b`, or null where no roll joins them. */
function stepBetween(a, b) {
  const n = FACE_NORMAL[a.face];
  const unit = (t) => t.reduce((sum, v) => sum + Math.abs(v), 0) === 1;
  const between = b.cell.map((v, i) => v - a.cell[i]);
  let t;
  let o;
  if (a.face === b.face) [t, o] = [between, 0];
  else if (!between.some((v) => v)) [t, o] = [FACE_NORMAL[b.face], 2];
  else {
    t = between.map((v, i) => v - n[i]);
    o = FACE_NORMAL[b.face].every((v, i) => v === -t[i]) ? 1 : null;
  }
  if (o === null || !unit(t)) return null;
  const k = headingOn(a.face, t);
  return k === null ? null : { k, o };
}

/** One more stop on the way the ball has come, joined by a roll, or by a leap where it was sent. */
function walked(station, leap = false) {
  const w = live.walk;
  const last = w.stations.at(-1);
  if (last && sameStation(last, station)) return;
  if (last) w.steps.push(leap ? null : stepBetween(last, station));
  w.stations.push(station);
  const from = Math.max(0, w.stations.length - TRAIL);
  const { byKey } = pieces({
    stations: w.stations.slice(from),
    steps: w.steps.slice(from),
    marks: new Set(),
  });
  const n = w.stations.length - from - 1;
  for (const list of byKey.values())
    for (const p of list) {
      p.alpha = (p.i + 1) / n;
      p.chevron = null;
    }
  live.trail = byKey;
  routing();
}

function drawTrail(ctx, c, home, key, ghost) {
  if (!live?.trail || !state.show.trail || ghost || c.k !== undefined) return;
  const list = live.trail.get(key);
  if (list) for (const p of list) drawPieces(ctx, [p], { alpha: p.alpha });
}

function drawDustOver(ctx, c, home, key, ghost) {
  if (!live || ghost || c.k !== undefined) return;
  drawDust(ctx, key);
}

/** The strip's route buttons: Keep while the walk has a roll in it and no route stands, Follow
    while a route stands, pressed while the ball follows it and dim once the level has ended. */
function routing() {
  const route = current();
  $("keepBtn").disabled = !live || live.walk.stations.length < 2 || route !== null;
  const follow = $("followBtn");
  follow.hidden = !live || route === null;
  follow.disabled = !live || live.ended !== null;
  follow.setAttribute("aria-pressed", String(live?.driver != null));
}

/** Roll the ball along the planned route from the stop it stands on, or from the first stop,
    where it is put, when it stands on none or on the last; pressed again, let the ball go. */
function followRoute() {
  const route = current();
  if (!live || live.ended || !route) return;
  if (live.driver) {
    retire();
    return;
  }
  const b = live.run.ball;
  const here = { cell: blockUnder(b), face: faceUnder(b) };
  const last = route.stations.length - 1;
  let i = route.stations.findIndex((s, j) => j < last && sameStation(s, here));
  let placed = "";
  if (i < 0) {
    const [first] = route.stations;
    if (!live.probe.standable(first.cell, first.face)) {
      status(NO_FIRST_STOP);
      return;
    }
    put({ cell: first.cell, face: first.face, h: tangent(first.face, route.steps[0]?.k ?? 0) });
    placed = `The ball is put on the ${FACE_NAME[first.face]} of ${first.cell.join(",")}. `;
    i = 0;
  }
  live.driver = courseDriver(route, i);
  live.route = route;
  routing();
  status(FOLLOWING);
  say(placed + FOLLOWING);
  wake();
}

/** The driver let go, the keys and the pad having the ball. */
function retire() {
  if (!live?.driver) return;
  live.driver = null;
  live.route = null;
  if (live.status === FOLLOWING) status(null);
  routing();
}

/** The driver done, and why said. */
function followed(why) {
  retire();
  status(DONE_WHY[why]);
  say(DONE_WHY[why]);
}

function keep() {
  if (!live) return;
  const { stations, steps } = live.walk;
  const c = {
    stations: [...stations],
    steps: [...steps],
    marks: new Set([0, stations.length - 1]),
  };
  if (!adoptCourse(c)) {
    status(ROUTE_STANDS);
    return;
  }
  say(KEPT);
  toast(KEPT);
  routing();
}

/** Whether the ball stands on something it does not act on yet. */
const standsOn = (block, face) =>
  (live.idx.markers.get(cellKey(...block)) ?? []).some(
    (m) => m.face === face && AS_STONE_TYPES.has(m.type),
  );

/** The things on `key`'s block the ball has taken, as the level as installed still lists them. */
const takenOn = (key) =>
  live
    ? (state.idx.markers.get(key) ?? []).filter(
        (m) => m.face !== null && live.run.world.taken.has(`${key}/${m.face}`),
      )
    : [];
const TAKEN = (m) => `Taken: ${markerLabel(m)} on the ${FACE_NAME[m.face]}`;

// --- the strip and the pad ----------------------------------------------------------------

function status(text, dying = false) {
  if (!live) return;
  live.status = text;
  live.dire = dying;
  const el = $("playStatus");
  if (el.textContent !== (text ?? "")) el.textContent = text ?? "";
  el.classList.toggle("dying", dying);
}

function figure(id, text, title = null) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
  if (title !== null && el.title !== title) el.title = title;
}

function line() {
  if (!live) return;
  const s = shown();
  const text = `Playing · on the ${FACE_NAME[s.face]} of ${s.block.join(",")}, facing ${faceName(s.h)}`;
  const el = $("playLine");
  if (el.textContent !== text) el.textContent = text;
  const w = live.run.words;
  const { clock } = motionTable().play;
  figure("playClock", `Time ${Math.max(0, Math.floor(w.clock / clock.second))}`);
  figure(
    "playKeys",
    w.bonus ? `Blocks ${w.unmarked}` : `Keys ${w.keys}`,
    w.bonus ? BLOCKS_LEFT : KEYS_LEFT,
  );
  figure("playPoints", counted(w.score, "point"));
}

function sync() {
  $("play").hidden = !live;
  $("pad").hidden = !live || !padShown;
  $("padDown").hidden = !state.show.turnabout;
  $("padBtn").setAttribute("aria-pressed", String(padShown));
  $("forgiveBtn").setAttribute("aria-pressed", String(forgiving));
  if (live) {
    line();
    $("playStatus").textContent = live.status ?? "";
    $("playStatus").classList.toggle("dying", live.dire);
  }
}

/** The pad has changed shape under the view: frame the ball over what it now leaves free. */
function reframe() {
  sync();
  if (state.framing === fit) fit();
  drawSoon();
}

function wirePad() {
  const pad = $("pad");
  const bitOf = (e) => PAD_BITS[e.target.closest("[data-pad]")?.dataset.pad] ?? 0;
  const release = (e) => {
    const bit = bitOf(e);
    if (bit) held &= ~bit;
  };
  pad.addEventListener("pointerdown", (e) => {
    const bit = bitOf(e);
    if (!bit || !live) return;
    e.preventDefault();
    if (live.ended) {
      startOver();
      wake();
      return;
    }
    retire();
    e.target.setPointerCapture(e.pointerId);
    held |= bit;
    tapped |= bit;
    wake();
  });
  for (const type of ["pointerup", "pointercancel"]) pad.addEventListener(type, release);
  pad.addEventListener("lostpointercapture", release);
  $("padBtn").onclick = () => {
    padShown = !padShown;
    reframe();
  };
  $("forgiveBtn").onclick = () => {
    forgiving = !forgiving;
    sync();
  };
  $("followBtn").onclick = followRoute;
  $("keepBtn").onclick = keep;
  $("leaveBtn").onclick = () => leave();
}

function icon() {
  const l = state.lvl;
  const model = l && ballFor(l);
  $("padBall").replaceChildren(model ? iconFor(model, 22) : "");
}

// --- the keys -----------------------------------------------------------------------------

const modified = (e) => e.metaKey || e.ctrlKey || e.altKey;
const heard = (bit) => bit !== PAD.down || state.show.turnabout;

function keydown(e) {
  if (!state.lvl || typing(e) || dialogOpen()) return;
  if (e.key === "y" && !modified(e) && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) togglePlay();
    return;
  }
  if (!live) return;
  if (e.key === "Escape") {
    if (e.defaultPrevented || state.selected) return;
    if (sidebarOverlays() && document.body.classList.contains("sidebar-open")) return;
    e.preventDefault();
    e.stopPropagation();
    leave();
    return;
  }
  if (live.ended) {
    const starts = e.key === " " || (e.key === "Enter" && e.target.tagName !== "BUTTON");
    if (!(starts || BITS[e.key]) || e.shiftKey || modified(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (starts && !e.repeat) {
      startOver();
      wake();
    }
    return;
  }
  const bit = BITS[e.key];
  if (!bit || e.shiftKey || modified(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat || !heard(bit)) return;
  retire();
  held |= bit;
  tapped |= bit;
  wake();
}

function keyup(e) {
  const bit = BITS[e.key];
  if (bit) held &= ~bit;
}

// --- entering and leaving -----------------------------------------------------------------

/** The start the game takes, as the ball stands on it, or null. */
function startOf(l, probe) {
  const s = startsOf(l).at(-1);
  if (!s) return null;
  const cell = [s.x, s.y, s.z];
  if (!probe.standable(cell, s.face)) return null;
  return { cell, face: s.face, h: layHeading(s) ?? TANGENT[s.face], marker: s };
}

/** The first face of the level the ball could stand on, or null. */
function firstStandable(probe) {
  for (const c of state.idx.cells.values())
    for (let face = 0; face < FACE_NORMAL.length; face++)
      if (probe.standable([c.x, c.y, c.z], face))
        return { cell: [c.x, c.y, c.z], face, h: tangent(face, 0) };
  return null;
}

/** The traveller's key: the start's own where the ball stands on it, so the start's ball is
    skipped. */
function keyOf(start, at) {
  const onStart = start && at.face === start.face && at.cell.every((v, i) => v === start.cell[i]);
  return onStart ? `${cellKey(...start.cell)}/${start.face}` : "ball";
}

function markersFor(start) {
  const base = start?.marker
    ? { type: start.marker.type, f: start.marker.f, v: undefined, variant: null }
    : { type: BALL_TYPE, f: [], v: undefined, variant: null };
  return FACE_NORMAL.map((_, face) => ({ ...base, id: "ball", face }));
}

function enter(at = null) {
  const l = state.lvl;
  const motion = motionTable();
  if (!l || !motion?.types[String(BALL_TYPE)]) return;
  finishEase();
  const probe = probeOf(state.idx);
  const start = startOf(l, probe);
  const where = at ?? start ?? firstStandable(probe);
  if (!where) {
    toast(NOWHERE);
    return;
  }
  if (!state.show.objects) {
    const box = $("showObjects");
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    toast(OBJECTS_ON);
  }
  // the level's circuits as the game loads them, the panel's presses kept for the return
  state.parked = {
    cam: { ...state.cam },
    target: [...state.target],
    fitted: state.framing === fit,
    slice: state.slice,
    presses: state.presses,
  };
  state.presses = new Map();
  const from = viewNow();
  state.slice = SIDE - 1;
  const run = startRun(l, state.idx, tablesOf(), circuitsOf(), start ? null : where);
  if (at && start) stand(run, at);
  live = {
    level: l,
    idx: state.idx,
    run,
    probe: liveProbe(run),
    key: keyOf(start, where),
    markers: markersFor(start),
    still: null,
    station: false,
    framed: false,
    status: at || start ? null : NO_START,
    walk: { stations: [{ cell: where.cell, face: where.face }], steps: [] },
    trail: null,
    notes: [],
    rests: [],
    broken: new Set(),
    flash: 0,
    dire: false,
    ended: null,
    driver: null,
    route: null,
  };
  const ball = run.ball;
  live.still = stateOf(ball);
  resetDust(worldTint(l.theme));
  routing();
  held = tapped = owed = 0;
  last = performance.now();
  state.anchored = true;
  state.frame = ball.frame;
  icon();
  sync();
  measure();
  fitWith(frameBall);
  fit();
  arrive(from);
  runWith(source);
  emit("play-changed", true);
  emit("slice-changed");
  chip();
  writeHash();
  invalidatePick();
  draw();
  const s = stateOf(ball);
  say(
    `Playing ${levelTitle(l)}. The ball stands on the ${FACE_NAME[s.face]} of ${s.block.join(",")}, facing ${faceName(s.h)}. The arrows roll and turn it, Esc leaves.`,
  );
}

/** Bring the view round behind the ball from `from`, easing with Motion on and at once without. */
function arrive(from) {
  const to = {
    ...viewNow(),
    rot: () => viewOf(looked(live.run.ball), state.cam.yaw, state.cam.pitch),
    target: () => shown().centre,
  };
  startEase(from, to, ENTER_MS, () => {
    state.frame = live?.run.ball.frame ?? state.frame;
  });
  if (ease) state.frame = mul(from.rot, transpose(basisOf(state.cam.yaw, state.cam.pitch)));
}

function leave({ restore = true } = {}) {
  if (!live) return;
  finishEase();
  const parked = state.parked;
  const level = live.level;
  live = null;
  held = tapped = 0;
  fitWith(null);
  runWith(null);
  refreshPanel();
  // the presses as they were, unless another level has been installed meanwhile with its own
  if (parked && state.lvl === level) state.presses = parked.presses;
  resetDust(null);
  sync();
  emit("play-changed", false);
  const done = () => {
    state.frame = null;
    state.anchored = false;
    state.parked = null;
    if (restore && parked) {
      Object.assign(state.cam, parked.cam);
      state.target = [...parked.target];
      state.slice = parked.slice;
      if (parked.fitted) fit();
      else state.framing = null;
      emit("slice-changed");
      chip();
    }
    writeHash();
    invalidatePick();
    draw();
  };
  if (!restore || !parked) {
    done();
    say("Left play.");
    return;
  }
  const to = {
    rot: () => viewOf(null, parked.cam.yaw, parked.cam.pitch),
    zoom: parked.cam.zoom,
    panX: parked.cam.panX,
    panY: parked.cam.panY,
    target: () => parked.target,
  };
  startEase(viewNow(), to, LEAVE_MS, done);
  invalidatePick();
  drawSoon();
  say("Left play; the view is as it was.");
}

export function togglePlay() {
  if (live) leave();
  else enter();
}

/** Stand the live ball at rest on `at`, the keys having it, the view cut to it and the way it has
    come taking a stop there. */
function put(at) {
  retire();
  live.key = keyOf(startOf(live.level, live.probe), at);
  stand(live.run, at);
  live.still = stateOf(live.run.ball);
  walked({ cell: at.cell, face: at.face });
  held = tapped = 0;
  status(null);
  state.frame = live.run.ball.frame;
  if (state.framing === fit) fit();
  line();
  invalidatePick();
  drawSoon();
}

/** Stand the ball on `face` of the block at `c`, starting play if it has not. */
export function playAt(c) {
  const probe = live?.probe ?? probeOf(state.idx);
  const cell = [c.x, c.y, c.z];
  if (!probe.standable(cell, c.face)) return;
  const at = { cell, face: c.face, h: tangent(c.face, 0) };
  if (!live) {
    enter(at);
    return;
  }
  if (live.ended) startOver();
  put(at);
  const s = live.still;
  say(
    `The ball stands on the ${FACE_NAME[s.face]} of ${s.block.join(",")}, facing ${faceName(s.h)}.`,
  );
}

export function bootPlay() {
  if (wired) return;
  wired = true;
  document.addEventListener("keydown", keydown, { capture: true });
  document.addEventListener("keyup", keyup, { capture: true });
  addEventListener("blur", () => {
    held = 0;
  });
  wirePad();
  measure = measureStrip($("play"), "--play-h");
  overlayWith({ under: () => void advance(), block: drawTrail, cell: drawDustOver, frame: more });
  movingWith(travellers);
  ballsWith(() => (live && !live.ended ? [shown().point] : null));
  tipWith((c) => takenOn(cellKey(c.x, c.y, c.z)).map(TAKEN));
  onShow((box, c) => {
    const body = box.querySelector("#detailBody");
    for (const m of takenOn(cellKey(c.x, c.y, c.z)))
      body.append(el("p", { className: "sub", textContent: `${TAKEN(m)}.` }));
  });
  on("level-changed", () => {
    leave({ restore: false });
    icon();
  });
  on("level-updated", () => {
    if (!live) return;
    live.level = state.lvl;
    live.idx = state.idx;
    relevel(live.run, state.lvl, state.idx);
    const b = live.run.ball;
    const under = blockUnder(b);
    if (!b.riding && !state.idx.cells.has(cellKey(...under)) && !live.probe.filled(under)) leave();
  });
  on("link-opening", () => leave({ restore: false }));
  on("go-to", () => leave({ restore: false }));
  on("density-changed", icon);
  on("course-changed", () => {
    if (live?.driver && current() !== live.route) retire();
    else routing();
  });
  on("show-changed", (key) => {
    if (key === "turnabout" && live) reframe();
    if (key === "dust" && live && !state.show.dust) resetDust(worldTint(live.level.theme));
  });
  sync();
}
