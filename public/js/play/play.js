// Play mode: the ball stood on the level and rolled by the keys, or along the planned route, the
// camera behind it.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { adoptCourse, current, measureStrip } from "../viewer/chrome/course.js";
import { drawPieces } from "../viewer/draw/ribbon.js";
import { ageDust, burstDust, drawDust, dustAlive, resetDust, travelDust } from "./dust.js";
import { drawEffects, effectsWith } from "./effects.js";
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
import { chip, fit, fitWith, selectLevel, writeHash } from "../viewer/chrome/navigate.js";
import { slotOf } from "../viewer/permalink.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { say as announce } from "../viewer/chrome/a11y.js";
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
  turned,
} from "./ball.js";
import {
  FORM,
  MODE,
  SCREEN,
  blanksOf,
  conclude,
  drawn,
  drives,
  frame as gameFrame,
  gameOf,
  glowOf,
  glowStep,
  heeds,
  nextOf,
  relevel,
  restart,
  revive,
  rockOf,
  roundOf,
  seeing,
  stand,
  startRun,
} from "./rules.js";
import { courseDriver, keyPad } from "./drive.js";
import { frameShown, probeOf as liveProbe, travelOf, viewOf as drawnIndex } from "./world.js";

const BALL_TYPE = 30;
const LETHARGY_TYPE = 32;
const INVINCIBLE_TYPE = 34;
// the ball's key among the frame's travellers, which no thing of the level's answers to
const BALL = "ball";
// the untinted light, the unit a traveller's tint is in
const LIGHT = 4096;
// the ghost's blend takes half of the last frame and half of the scene
const HALF = 0.5;
// a channel's full byte, the unit the flash's strength is in
const BYTE = 255;
const YAW = 20;
const PITCH = 30;
const ZOOM = { blocks: 8, min: 0.8, max: 3 };
const BELOW = 1 / 5;
const FOLLOW_MS = 120;
const LANDS = 1e-4;
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
const PAD_BITS = { up: PAD.up, left: PAD.left, right: PAD.right, jump: PAD.cross };
const PLAIN_KIND = 0;
const REFUSED = {
  arrow: "The ball cannot roll off here: the arrow points another way.",
};
const LAUNCHED = "Launched by the boost button.";
const RIDING = "The ball rides the platform.";
const NO_START = "The level has no start, so the ball stands on the first face it could.";
const NOWHERE = "The level has no face the ball could stand on.";
const OBJECTS_ON = "Objects turned on, for the ball.";
const VERDICT = {
  exit: "Out by the exit: the level is done.",
  hidden: "Out by the hidden exit: the level is done.",
  bonus: "Every block is marked: the level is done.",
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
const ENDED = "The level has ended";
const ROUND_DONE = "The round is done.";
const ROUND_LOST = "The round is lost.";
const PLAYER = (player) => `Player ${player + 1}`;
const POINT_TO = (player) => `The round is lost, a point to ${PLAYER(player)}.`;
const AFRESH = "The run starts afresh.";
const MATCH_AFRESH = "The match starts afresh.";
const OPENED = "The last key is taken: the exits are open.";
const BROKE = "The crumbling block breaks under the ball.";
const GONE = (cell) => `The crumbling block at ${cell} is gone.`;
const SENDING = "The teleporter is sending the ball.";
const WEARING_OFF = "The sunglasses are wearing off: the invisible blocks are about to hide again.";
const KEYS_LEFT = "The keys left to take";
const BLOCKS_LEFT = "The blocks left to roll onto";
const AGAIN = "Space or Enter starts the level again.";
const AGAIN_PAD = "Space, Enter or a tap on the pad starts the level again.";
const ON = (title) => `Space or Enter goes on to ${title}.`;
const ON_PAD = (title) => `Space, Enter or a tap on the pad goes on to ${title}.`;
const KEPT = "The way the ball has come is now the route.";
const ROUTE_STANDS = "A route already stands; clear it to keep the walk.";
const FOLLOWING = "Following the route; an arrow or Space takes the ball back.";
const FOLLOWING_PAD = "Following the route; an arrow, Space or the pad takes the ball back.";
const NO_FIRST_STOP = "The route's first stop has nothing to stand on.";
const DONE_WHY = {
  end: "The route is done: the ball stands at its last stop.",
  leap: "The route leaps from here, which the ball cannot follow.",
  strayed: "The ball has left the route.",
};
const AT_SWITCH = 6;
const AT_GONE = 10;
const AT_BREAK = 2;
const AT_LAUNCH = 10;
const TRAIL = 12;

let live = null;
const keys = keyPad();
let last = 0;
let owed = 0;
let idle = true;
let framing = false;
let saying = null;
const unsaid = [];
let telling = false;
let ease = null;
let redraw = false;
// whether the pass last run took the lethargy pill, and whether one ran since the frame hook drew
let lit = false;
let passed = false;
let rolled = null;
// the invincible ball's glow counter, kept for the page's life as the game keeps it
let glowCounter = 0;
// the frame as last displayed while the pill works, tinted, for the ghost
const lastCv = document.createElement("canvas");
const lastCtx = lastCv.getContext("2d");
let measure = () => {};
let padShown = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
let forgiving = false;
let keyed = false;
let wired = false;
// whether play itself is changing the level through the funnel
let changing = false;

export const playing = () => live !== null;

const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const motionOn = () => state.show.motion;
const pillTable = () => motionTable().types[String(LETHARGY_TYPE)].lasts;
const glowTable = () => motionTable().types[String(INVINCIBLE_TYPE)].lasts.glow;
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

/** The tables the rules read: the motion table, the mesh file's arc for the jump, a block's units,
    where the data's records and styles begin, the skins and the worlds in the game's order. */
const tablesOf = () => ({
  motion: motionTable(),
  jump: jumpTable(),
  unit: blockUnits(),
  first: state.data.firstRecord,
  styles: state.data.styles,
  skins: skinsTable(),
  worlds: state.data.themes.map((t) => t.id),
});

/** The circuits as the map holds them, so a press in the panel and a switch the ball throws are
    one truth. */
const circuitsOf = () => ({ on: (m) => markerNow(m) === "on", lit: litNow, flip });

/** The game the run plays, where its setting is on and the level is one the game plays a game
    on: `game` carried on, or a fresh one of the level's mode; else none. */
const gameFor = (l, tables, game = null) => (state.show.playon ? gameOf(l, tables, game) : null);

/** What the frame draws at and with while the ball is on the map: the frame the rules last ran,
    which is the one the game's draw shows, the ending's view's frames added once the level has
    ended, the level's index less what the ball has taken, the walkers where the rules have
    stepped them, and whether every invisible block is seen. */
const source = (l) =>
  live && l === live.level
    ? {
        frame: frameShown(live.run) + (live.ended?.frame ?? 0),
        idx: drawnIndex(live.run),
        travel: travelOf(live.run),
        seeing: seeing(live.run),
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
export const handed = () => (live ? (travellers(live.level)?.get(BALL) ?? null) : null);

function travellers(l) {
  if (!live || l !== live.level || live.ended) return null;
  const s = shown();
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
    // rides it sorts as the unit cube about its centre would, by that cube's corner as a block
    // sorts by its cell's, rather than by the block under it
    depth:
      live.run.ball.ramp?.kind === "climb" || live.run.ball.riding
        ? depth(...s.centre.map((v) => v - 0.5))
        : undefined,
  };
  return new Map([[BALL, going]]);
}

/** The ball's light: flashing while it is marked dying, else tinted by its heat, melt and cold
    and, while the invincibility pill's word stands, raised by the glow. */
function tintOf(w) {
  const { types, turn } = motionTable();
  if (w.dying) {
    const level = LIGHT + LIGHT * Math.sin((live.flash / turn) * 2 * Math.PI);
    return [level, level, level];
  }
  const words = [w.heat, w.melt, w.cold];
  const glowing = w.pills[INVINCIBLE_TYPE] >= 0;
  if (!words.some(Boolean) && !glowing) return undefined;
  const { own, other } = types[String(BALL_TYPE)].tint;
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

/** The frame rolled about the view's line of sight by the pill's angle, the orbit's yaw and pitch
    composed first, or the frame itself while the pill's word is not positive; the array stands
    while the frame, the angle and the orbit do, since the frame is compared by identity. */
function rocked(frame) {
  const { turn } = motionTable();
  const angle = rockOf(live.run.words.pills[LETHARGY_TYPE], pillTable().rock, turn);
  if (!angle) return frame;
  const { yaw, pitch } = state.cam;
  const r = rolled;
  if (r && r.frame === frame && r.angle === angle && r.yaw === yaw && r.pitch === pitch)
    return r.out;
  const b = basisOf(yaw, pitch);
  const out = mul(turned(mul(frame, b), 2, angle / turn), transpose(b));
  rolled = { frame, angle, yaw, pitch, out };
  return out;
}

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

/** How much of the map's height the strip takes, as it stands, from its foot; the pad lies over
    the view and takes none. */
function chrome() {
  const strip = $("play");
  if (strip.hidden) return 0;
  return $("cv").getBoundingClientRect().bottom - strip.getBoundingClientRect().top;
}

// --- the ending's view --------------------------------------------------------------------

/** Half the level's box's diagonal, in blocks: no cell of it lies further from its middle. */
const radiusOf = (l) => Math.hypot(...[0, 1, 2].map((i) => l.max[i] - l.min[i] + 1)) / 2;

/** Frame the ending's view: the level's middle in the middle of what the strip leaves free,
    zoomed so that the whole level fits with the eye at its mean distance. */
function frameEnding(l) {
  const e = live.ended;
  state.target = levelCentre(l);
  const { w, h } = state.view;
  e.free = h - chrome();
  const fits = (Math.min(w, e.free) - FIT_MARGIN) / (2 * e.radius * BLOCK);
  e.base = Math.max(ZOOM_MIN, Math.min(FIT_ZOOM_MAX, fits));
  swung();
}

/** The eye the level's mode word stands at an ending: the arcade's swing, the no-key level's
    quicker and wider swing, or the hidden level's eye, which does not swing, its fourth angle
    never stepping. */
const eyeOf = (view, form) => {
  if (form === FORM.bonus) return { ...view, ...view.bonus };
  if (form === FORM.hidden) return { ...view, ...view.hidden, swing: 0, reach: 0 };
  return view;
};

// The orbit has no eye, so the zoom stands in for how large the level looks from the game's,
// which stands the level's radius and an offset off the middle and swings its reach, where it
// has one, nearer and further by turns.
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

/** One frame of the ending's view: the screen's words stepped as the game's draw steps them, the
    yaw turned by the game's third angle, the pitch by its first, the eye along its swing, and the
    level started again as the view's length runs out. */
function turning() {
  const e = live.ended;
  const { turn } = motionTable();
  drawn(live.run);
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
  const t = Math.max(0, Math.min(1, (now - e.start) / e.ms));
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
  // a level that runs keeps the time it is owed; one at rest counts from the press
  if (idle) last = performance.now();
  drawSoon();
}

/** Run the game frames the wall clock owes, and move the camera after the ball. */
function advance() {
  if (changing || (!live && !ease)) return;
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
    state.target = state.target.map((v, i) => {
      const off = s.centre[i] - v;
      return Math.abs(off) < LANDS ? s.centre[i] : v + off * k;
    });
    const frame = rocked(motionOn() ? looked(live.run.ball) : s.frame);
    if (state.frame !== frame) {
      state.frame = frame;
      moved = true;
    }
  }
  if (moved) invalidatePick();
}

// a sentence waits for an animation frame of its own, as the live region keeps only its last
function told(text) {
  if (telling) {
    unsaid.push(text);
    return;
  }
  announce(text);
  telling = true;
  requestAnimationFrame(() => {
    telling = false;
    if (unsaid.length) told(unsaid.shift());
  });
}

const say = (text) => {
  if (framing) saying = text;
  else told(text);
};

const running = () =>
  live.ended
    ? motionOn()
    : motionOn() ||
      moving(live.run.ball) ||
      drives(live.run) ||
      keys.busy() ||
      live.driver !== null;

/** Step the game frames `dt` ms owe, each taking the sixtieths the run's words ask, the level
    running at rest with Motion on and only while the ball moves or a key is held without it, and
    the ending's view in the level's place once it has ended, with Motion on alone: whether
    anything moved. */
function stepped(dt) {
  let moved = false;
  if (running()) {
    owed += (dt * motionTable().hz) / 1000;
    let blanks = blanksOf(live.run);
    while (owed >= blanks && live) {
      owed -= blanks;
      framing = true;
      saying = null;
      lit = false;
      passed = true;
      if (live.ended) turning();
      else played();
      framing = false;
      if (saying !== null) told(saying);
      if (live) {
        stood();
        blanks = blanksOf(live.run);
      }
      moved = true;
    }
  } else owed = 0;
  if (!live) return moved;
  idle = !running();
  if (motionOn() && dustAlive()) {
    ageDust(dt / 1000);
    moved = true;
  }
  stood();
  if (moved) line();
  return moved;
}

/** Where the ball last stood, as Motion off draws it, taken on the game frame it stood there: a
    drawn frame may run several. */
function stood() {
  const b = live.run.ball;
  if (!moving(b) || live.station) live.still = stateOf(b);
  live.station = false;
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
  // a tap stands until a frame reads the pad, as the level opens with it dead, and is dropped
  // while an ending stands, so its wait's last frame reads only the keys held on it
  const pad = keys.pad(heeds(run), live.driver ? live.driver.pad(run) : 0, !run.words.ending);
  const was = onFace(b) ? footOf(b) : null;
  const blinked = !!run.words.blink;
  const events = gameFrame(run, pad);
  if (events.some((e) => e.pill?.type === LETHARGY_TYPE)) lit = true;
  if (!motionOn()) ageDust(1 / motionTable().hz);
  else if (was && onFace(b) && !events.some((e) => e.sent)) {
    const under = blockUnder(b);
    strewn(was, footOf(b), b.n, () => under);
  }
  for (const event of events) happened(event);
  rested(b);
  flashed(run.words);
  glowed(run.words);
  if (run.words.send >= 0) status(SENDING);
  else if (run.words.blink && !blinked) status(WEARING_OFF);
  else if (live.status === SENDING || (live.status === WEARING_OFF && !run.words.blink))
    status(null);
  if (live.driver) {
    const why = live.driver.done(run);
    if (why) followed(why);
    else if (!live.status) status(following());
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

// The glow's counter steps on each frame the ball is drawn with the pill's word not negative, and
// is never put back.
function glowed(w) {
  if (!live.ended && w.pills[INVINCIBLE_TYPE] >= 0)
    glowCounter = glowStep(glowCounter, glowTable());
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
      (motionOn() ||
        (!live.ended && (moving(live.run.ball) || drives(live.run) || keys.busy() || live.driver))))
  );

/** The frame hook: the game's bursts over the scene, the pill's screen over them and the flash
    over everything, and another frame while the view eases, the level runs or something moves,
    and one more where the view has just cut. */
function more(ctx) {
  drawEffects(ctx);
  screened(ctx);
  flashing(ctx);
  const asked = again() || redraw;
  redraw = false;
  return asked;
}

/** The pill's screen, as the game's draw of the pass showed it: the flash on the pill's own pass,
    the last frame as a ghost at half strength over the scene on each pass the pill works and on
    the end's pass, and the white glow at the fade's level on each pass after; the frame drawn is
    kept, tinted, for the next pass's ghost. */
function screened(ctx) {
  const ran = passed;
  passed = false;
  if (!live || live.run.words.screen === SCREEN.off) {
    sized(lastCv, 0, 0);
    return;
  }
  const w = live.run.words;
  const { grey, tint, fade } = pillTable().screen;
  const { w: width, h: height } = state.view;
  const ghost = w.screen === SCREEN.ghost;
  ctx.save();
  if (ghost && lit) glow(ctx, grey, grey, width, height);
  else if (ghost || w.fade === fade.from) {
    ctx.globalAlpha = HALF;
    if (lastCv.width) ctx.drawImage(lastCv, 0, 0, width, height);
  } else glow(ctx, w.fade, grey, width, height);
  ctx.restore();
  if (ran && ghost) kept(ctx.canvas, tint, grey);
}

/** The flash's quad, as the game's draw lays it over everything: white added to the whole screen
    at the strength the pass left, a byte a channel, on every frame it is above nothing with
    Motion on; with it off the words run and nothing is drawn. */
function flashing(ctx) {
  const strength = live?.run.words.flash ?? 0;
  if (strength <= 0 || !motionOn()) return;
  const { w: width, h: height } = state.view;
  ctx.save();
  glow(ctx, strength, BYTE, width, height);
  ctx.restore();
}

// A white quad added to the whole screen at `level` over `full`, the texel as it is.
function glow(ctx, level, full, width, height) {
  if (level <= 0) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = level / full;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
}

// The canvas kept for the ghost, tinted by the table's colour over its grey.
function kept(cv, tint, grey) {
  sized(lastCv, cv.width, cv.height);
  lastCtx.setTransform(1, 0, 0, 1, 0, 0);
  lastCtx.globalCompositeOperation = "copy";
  lastCtx.drawImage(cv, 0, 0);
  lastCtx.globalCompositeOperation = "multiply";
  lastCtx.fillStyle = `rgb(${tint.map((v) => Math.round((v * BYTE) / grey)).join(" ")})`;
  lastCtx.fillRect(0, 0, lastCv.width, lastCv.height);
}

function sized(cv, w, h) {
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
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
  if (event.boosted) {
    boosted();
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
    status(b.riding ? RIDING : null);
    walked({ cell: block, face: faceUnder(b) });
    if (!motionOn()) strewn(live.still.foot, footOf(b), b.n, (p) => blockAt(p, b.n, block), true);
  } else if (event.face) {
    live.station = true;
    say(noted(`${FACE_NAME[faceUnder(b)]} of ${blockUnder(b).join(",")}, now underfoot`));
    burst(footOf(b), b.n, blockUnder(b), AT_SWITCH);
  } else if (event.turned) {
    live.station = true;
    if (Object.values(REFUSED).includes(live.status)) status(b.riding ? RIDING : null);
  }
}

/** A thing taken: the take said, and the panel brought up to date where it shows the block. */
function taken({ key, face, points }) {
  const m = (live.run.world.idx.markers.get(key) ?? []).find((m) => m.face === face);
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

/** The ball launched off a boost button: dust at its foot, the launch said, and the strip saying
    so until the ball lands. */
function boosted() {
  const b = live.run.ball;
  burst(footOf(b), b.n, blockUnder(b), AT_LAUNCH);
  status(LAUNCHED);
  say(LAUNCHED);
  live.notes.push(LAUNCHED);
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
  if (over) burst([x + 0.5, y + 0.5, z + 0.5], live.run.ball.n, over, AT_GONE);
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

/** The ball sent by a teleporter: a leap in its way, the view cut to it. */
function sent({ to }) {
  const b = live.run.ball;
  live.station = true;
  live.still = stateOf(b);
  walked({ cell: to.cell, face: to.face }, true);
  state.frame = b.frame;
  state.target = [...centreOf(b)];
  if (state.framing === fit) fit();
  status(null);
  say(`Sent to the ${FACE_NAME[to.face]} of ${to.cell.join(",")}.`);
  redraw = true;
  invalidatePick();
}

/** The level has ended: the loop's step runs, a bad ending past the arcade's mode scoring nothing
    on any level, and where a run is on, and its setting still is, the run's points are settled,
    or in a Simon room the match's point given and its winner named, and the level the game loads
    next picked, as the game's loop does all three, and where the setting has gone off the run
    ends here; the ball is gone and the pad dead, the view lets go of the ball and turns about the
    level's middle as the game's does, the eye standing by the level's mode word, and the strip
    gives the verdict with the points and the time left, what the ending did to the run's total
    or to the match and what the key goes on to, until a key goes on or the view has run the
    length of one swing of an arcade level's eye, whichever eye the level's word stands. */
function ended(code) {
  const { play, turn } = motionTable();
  const { view, clock, words } = play;
  const run = live.run;
  if (!state.show.playon) run.game = null;
  const w = run.words;
  const name = endingName(code);
  const settled = conclude(run);
  const seconds = Math.max(0, Math.floor(w.clock / clock.second));
  const room = w.mode === MODE.simon;
  const word = words[name] ?? `${ENDED}.`;
  const told = room ? roomTold(code, word, settled) : (VERDICT[name] ?? word);
  const how = `${told} ${counted(w.score, "point")}, ${counted(seconds, "second")} left.`;
  const did = settled && (room ? settled.won && MATCH_AFRESH : banked(settled, words));
  const next = run.game ? pickedLevel(nextOf(run.game, run, packCount(live.level.pack))) : null;
  live.ended = {
    code,
    how: did ? `${how} ${did}` : how,
    next,
    frame: 0,
    length: Math.floor(turn / view.swing),
    theta: 0,
    view: eyeOf(view, w.form),
    radius: radiusOf(live.level),
    free: 0,
    base: 1,
  };
  keys.clear();
  owed = 0;
  retire();
  routing();
  finishEase();
  state.frame = null;
  fit();
  status(verdict());
  say(verdict());
  redraw = true;
  invalidatePick();
}

/** A room's word for its ending `code`: the end screen's `word`, or the winner's where the match
    is won, and whether the round is done or lost, with whose point it is where a match is on. */
function roomTold(code, word, settled) {
  const named = settled?.won ?? word;
  if (code > 0) return `${named} ${ROUND_DONE}`;
  return settled?.point == null ? `${named} ${ROUND_LOST}` : `${named} ${POINT_TO(settled.point)}`;
}

/** The strip's verdict: how the level ended and what the key goes on to, the level the game loads
    next or this one again, the pad named while it shows. */
const verdict = () => {
  const { how, next } = live.ended;
  const then = next ? (padShown ? ON_PAD : ON)(levelTitle(next)) : padShown ? AGAIN_PAD : AGAIN;
  return `${how} ${then}`;
};

/** The levels the pack holds, as the data has them. */
const packCount = (pack) => state.data.levels.filter((l) => l.pack === pack).length;

/** The level of the disc at `pick`, a pack and an index, where it is another than the one played,
    else null. */
function pickedLevel(pick) {
  if (!pick) return null;
  const l = state.data.levels.find((x) => x.pack === pick.pack && x.index === pick.index);
  return l && l !== live.level ? l : null;
}

/** What the ending did to the run's total: the penalty taken or the points banked, the total,
    and where that is below nothing the game's word for its end. */
function banked({ penalty, banked: points, total, over }, words) {
  const did = penalty
    ? `${counted(penalty, "point")} off the total`
    : `${counted(points, "point")} banked`;
  const sum = `${did}, ${counted(total, "point")} in all.`;
  return over ? `${sum} ${words.over} ${AFRESH}` : sum;
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

/** The level the game loads after an ending, from its start: the level it picked, another of the
    disc, reached through the viewer's funnel with play kept on, or, where the pick is this level
    or `onward` is off, this one again; the run goes on with the ball, or begins where its setting
    has come on since the ball was put down, the view comes back behind the ball, and a level with
    no start stands the ball on the first face it could, as entering does. */
function startOver({ onward = true } = {}) {
  if (!live) return;
  const from = viewNow();
  const went = onward && goOn(live.ended?.next);
  const l = went ? state.lvl : live.level;
  const idx = went ? state.idx : live.idx;
  const probe = went ? probeOf(idx) : live.probe;
  const start = startOf(l, probe);
  const where = start ? null : firstStandable(probe);
  if (!start && !where) {
    toast(NOWHERE);
    leave();
    return;
  }
  live.run.game = gameFor(l, live.run.tables, live.run.game);
  live.run = restart(live.run, where, { level: l, idx });
  live.level = l;
  live.idx = idx;
  live.probe = liveProbe(live.run);
  live.markers = markersFor(start);
  live.ended = null;
  live.driver = null;
  live.route = null;
  live.framed = false;
  state.presses = new Map();
  const b = live.run.ball;
  const at = { cell: blockUnder(b), face: faceUnder(b) };
  live.walk = { stations: [at], steps: [] };
  live.trail = null;
  live.notes = [];
  live.rests = [];
  live.broken = new Set();
  live.flash = 0;
  live.still = stateOf(b);
  resetDust(worldTint(l.theme));
  routing();
  status(start ? null : NO_START);
  keys.clear();
  owed = 0;
  last = performance.now();
  state.frame = b.frame;
  fit();
  arrive(from);
  line();
  refreshPanel();
  redraw = true;
  invalidatePick();
  say(
    `${went ? `On to ${levelTitle(l)}` : `${levelTitle(l)} again`}. The ball stands on the ${FACE_NAME[at.face]} of ${at.cell.join(",")}, facing ${faceName(b.h)}.`,
  );
}

/** Go on to `next`, a level of the disc, through the viewer's level funnel with play kept on:
    whether the level changed. */
function goOn(next) {
  const i = next ? state.data.levels.indexOf(next) : -1;
  if (i < 0 || i === state.li) return false;
  changing = true;
  try {
    selectLevel(i);
  } finally {
    changing = false;
  }
  return true;
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

/** The strip's word while the ball follows the route, the pad named while it shows. */
const following = () => (padShown ? FOLLOWING_PAD : FOLLOWING);
const isFollowing = (text) => text === FOLLOWING || text === FOLLOWING_PAD;

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
  status(following());
  say(placed + following());
  wake();
}

/** The driver let go, the keys and the pad having the ball. */
function retire() {
  if (!live?.driver) return;
  live.driver = null;
  live.route = null;
  if (isFollowing(live.status)) status(null);
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

/** The things on `key`'s block the ball has taken, as play's level still lists them. */
const takenOn = (key) =>
  live
    ? (live.run.world.idx.markers.get(key) ?? []).filter(
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
  const text = live.ended
    ? ENDED
    : `Playing · on the ${FACE_NAME[s.face]} of ${s.block.join(",")}, facing ${faceName(s.h)}`;
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
  const game = live.run.game;
  const room = w.mode === MODE.simon;
  for (const id of ["playRound", "playMoves"]) $(id).hidden = !room;
  for (const id of ["playTurn", "playMatch"]) $(id).hidden = !(room && game);
  if (room) {
    const { round, moves } = roundOf(live.run.match);
    figure("playRound", `Round ${round}`);
    figure("playMoves", counted(moves, "move"));
    if (game) {
      figure("playTurn", `${PLAYER(live.run.match.turn)}'s turn`);
      figure("playMatch", `Match ${game.points.join(" : ")}`);
    }
  }
  $("playTotal").hidden = !game || room;
  if (game && !room) figure("playTotal", `Total ${game.total}`);
}

function sync() {
  $("play").hidden = !live;
  $("pad").hidden = !live || !padShown;
  $("padBtn").setAttribute("aria-pressed", String(padShown));
  $("forgiveBtn").setAttribute("aria-pressed", String(forgiving));
  if (live) {
    line();
    $("playStatus").textContent = live.status ?? "";
    $("playStatus").classList.toggle("dying", live.dire);
  }
}

function wirePad() {
  const pad = $("pad");
  const bitOf = (e) => PAD_BITS[e.target.closest("[data-pad]")?.dataset.pad] ?? 0;
  const release = (e) => {
    const bit = bitOf(e);
    if (bit) keys.up(bit);
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
    keys.down(bit);
    wake();
  });
  for (const type of ["pointerup", "pointercancel"]) pad.addEventListener(type, release);
  pad.addEventListener("lostpointercapture", release);
  $("padBtn").onclick = () => {
    padShown = !padShown;
    if (live?.ended) status(verdict());
    else if (isFollowing(live?.status)) status(following());
    sync();
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
    const starts =
      e.key === " " || (e.key === "Enter" && !(keyed && e.target.tagName === "BUTTON"));
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
  if (e.repeat) return;
  retire();
  keys.down(bit);
  wake();
}

function keyup(e) {
  const bit = BITS[e.key];
  if (bit) keys.up(bit);
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

function markersFor(start) {
  const base = start?.marker
    ? { type: start.marker.type, f: start.marker.f, v: undefined, variant: null }
    : { type: BALL_TYPE, f: [], v: undefined, variant: null };
  return FACE_NORMAL.map((_, face) => ({ ...base, id: BALL, face }));
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
    slot: slotOf(l),
    cam: { ...state.cam },
    target: [...state.target],
    fitted: state.framing === fit,
    slice: state.slice,
    presses: state.presses,
  };
  state.presses = new Map();
  const from = viewNow();
  state.slice = SIDE - 1;
  const tables = tablesOf();
  const game = gameFor(l, tables);
  const run = startRun(l, state.idx, tables, circuitsOf(), start ? null : where, game);
  if (at && start) stand(run, at);
  live = {
    level: l,
    idx: state.idx,
    run,
    probe: liveProbe(run),
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
  keys.clear();
  owed = 0;
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
  // the view and the presses go back only where the level shown is the one they were parked on
  const back = parked !== null && slotOf(state.lvl) === parked.slot;
  live = null;
  keys.clear();
  unsaid.length = 0;
  fitWith(null);
  runWith(null);
  refreshPanel();
  if (back) state.presses = parked.presses;
  resetDust(null);
  sync();
  emit("play-changed", false);
  const done = () => {
    state.frame = null;
    state.anchored = false;
    state.parked = null;
    if (restore && back) {
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
  if (!restore || !back) {
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
  stand(live.run, at);
  live.still = stateOf(live.run.ball);
  walked({ cell: at.cell, face: at.face });
  keys.clear();
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
  if (live.ended) startOver({ onward: false });
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
  // read as the focus lands, since by the keydown a clicked button's focus is visible too
  document.addEventListener("focusin", (e) => {
    keyed = e.target.matches(":focus-visible");
  });
  addEventListener("blur", () => keys.up());
  wirePad();
  measure = measureStrip($("play"), "--play-h");
  overlayWith({ under: () => void advance(), block: drawTrail, cell: drawDustOver, frame: more });
  effectsWith(() => live?.run ?? null);
  movingWith(travellers);
  ballsWith(() => (live && !live.ended ? [shown().point] : null));
  tipWith((c) => takenOn(cellKey(c.x, c.y, c.z)).map(TAKEN));
  onShow((box, c) => {
    const body = box.querySelector("#detailBody");
    for (const m of takenOn(cellKey(c.x, c.y, c.z)))
      body.append(el("p", { className: "sub", textContent: `${TAKEN(m)}.` }));
  });
  on("level-changed", () => {
    if (!changing) leave({ restore: false });
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
    if (key === "dust" && live && !state.show.dust) resetDust(worldTint(live.level.theme));
  });
  sync();
}
