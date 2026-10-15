// Play mode: the ball stood on the level and rolled by the keys, the camera behind it.
import { $, emit, on } from "../viewer/ui/dom.js";
import { state, BLOCK, basisAt, camera, depth, fitLevel } from "../viewer/state.js";
import { SIDE, cellKey, FACE_NAME, FACE_NORMAL, DIRECTION_NAME } from "../format/lattice.js";
import {
  ballFor,
  blockUnits,
  jumpTable,
  layHeading,
  levelTitle,
  markerModel,
  modelUnit,
  motionTable,
  startsOf,
  TANGENT,
} from "../viewer/data.js";
import { probeOf, tangent } from "../viewer/walk.js";
import { draw, drawSoon, invalidatePick, movingWith, overlayWith } from "../viewer/draw/render.js";
import { ballsWith } from "../viewer/draw/things.js";
import { iconFor } from "../viewer/draw/icons.js";
import { toast } from "../viewer/ui/toast.js";
import { chip, fit, fitWith, writeHash } from "../viewer/chrome/navigate.js";
import { measureStrip } from "../viewer/chrome/course.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { say } from "../viewer/chrome/a11y.js";
import {
  PAD,
  ballAt,
  blockUnder,
  centreOf,
  clearance,
  faceOf,
  faceUnder,
  moving,
  offsetFrame,
  step,
} from "./ball.js";

const BALL_TYPE = 30;
const STARTS = new Set([29, BALL_TYPE]);
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
const REFUSED = "The ball cannot roll off here: a block stands beside it.";
const AS_STONE = "The ball rolls over ice, spikes and the rest as over plain stone for now.";
const NO_START = "The level has no start, so the ball stands on the first face it could.";
const NOWHERE = "The level has no face the ball could stand on.";
const OBJECTS_ON = "Objects turned on, for the ball.";
const LOST = "The ball fell off the level, and is back where it last stood.";

let live = null;
let held = 0;
let tapped = 0;
let last = 0;
let owed = 0;
let ease = null;
let measure = () => {};
let padShown = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
let wired = false;

export const playing = () => live !== null;

const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const motionOn = () => state.show.motion;
const smooth = (t) => t * t * (3 - 2 * t);
const faceName = (v) => DIRECTION_NAME[faceOf(v)];

// --- the ball as the frame draws it -----------------------------------------------------

/** What the ball shows: its block and face, heading, centre, spin and lift. */
function stateOf(b) {
  return {
    block: blockUnder(b),
    face: faceUnder(b),
    h: b.h,
    centre: centreOf(b),
    point: b.pos.map((v) => v + b.half),
    spin: b.spin,
    height: clearance(b, live.probe),
    frame: b.ramp ? b.ramp.to : b.frame,
  };
}

/** The ball as drawn: live while Motion is on, else as it last stood. */
const shown = () => (motionOn() ? stateOf(live.ball) : live.still);

/** The rules the ball rolls by: its type's motion table, the 4096ths of a turn, a block's units
    and the mesh file's arc. */
const rulesOf = (motion) => ({
  table: motion.types[String(BALL_TYPE)],
  turn: motion.turn,
  unit: blockUnits(),
  jump: jumpTable(),
});

/** Whether a block stands between `centre`, in blocks, and the camera, within the cover's reach. */
function covered(centre) {
  const { toward } = camera();
  for (let t = COVER.step; t <= COVER.reach; t += COVER.step)
    if (live.probe.solid(centre.map((v, i) => Math.floor(v + toward[i] * t)))) return true;
  return false;
}

export function station() {
  if (!live) return null;
  const s = shown();
  return { block: s.block, face: s.face, heading: faceName(s.h), moving: moving(live.ball) };
}

function travellers(l) {
  if (!live || l !== live.level) return null;
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
    roll: 0,
    about: [s.spin / live.ball.rules.turn, 0, 0],
    height: s.height,
    through: covered(s.centre),
    // at an inner corner the ball touches the block it leaves as well as the wall, so while the
    // climb's ramp runs it sorts by its own centre rather than by the block under it
    depth: live.ball.ramp?.kind === "climb" ? depth(...s.centre) : undefined,
  };
  return new Map([[live.key, going]]);
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
  const s = shown();
  if (!ease) {
    const k = motionOn() ? 1 - Math.exp(-dt / FOLLOW_MS) : 1;
    state.target = state.target.map((v, i) => v + (s.centre[i] - v) * k);
    const frame = motionOn() ? looked(live.ball) : s.frame;
    if (state.frame !== frame) {
      state.frame = frame;
      moved = true;
    }
  }
  if (moved) invalidatePick();
}

/** Step the game frames `dt` ms owe: whether anything moved. */
function stepped(dt) {
  const b = live.ball;
  let moved = false;
  if (moving(b) || held || tapped) {
    owed += (dt * motionTable().hz) / 1000;
    while (owed >= 1) {
      owed -= 1;
      b.pad = held | tapped;
      tapped = 0;
      for (const event of step(b, live.probe)) happened(event);
      moved = true;
    }
  } else owed = 0;
  if (!moving(b) || live.station) live.still = stateOf(b);
  live.station = false;
  if (moved) line();
  return moved;
}

const again = () => !!(ease || (live && (moving(live.ball) || held || tapped)));

/** The ball's frame pitched further down by the view's word while it falls. */
const looked = (b) => (b.look.word ? offsetFrame(b.frame, 0, b.look.word, b.rules.turn) : b.frame);

function happened(event) {
  const b = live.ball;
  if (event.refused) {
    status(REFUSED);
    return;
  }
  if (event.lost) {
    live.station = true;
    toast(LOST);
    say(LOST);
    return;
  }
  if (event.at) {
    live.station = true;
    const block = blockUnder(b);
    say(`${block.join(",")}, ${FACE_NAME[faceUnder(b)]}`);
    status(standsOn(block, faceUnder(b)) ? AS_STONE : null);
  } else if (event.face) {
    live.station = true;
    say(`${FACE_NAME[faceUnder(b)]} of ${blockUnder(b).join(",")}, now underfoot`);
  } else if (event.turned) live.station = true;
}

/** Whether the ball stands on something it does not act on yet: ice, a hazard or a pickup. */
function standsOn(block, face) {
  const key = cellKey(...block);
  const c = live.idx.cells.get(key);
  if (!c) return false;
  const kind = c.v < state.data.firstRecord ? c.v : live.idx.records.get(key)?.[0]?.kind;
  if (kind !== PLAIN_KIND) return true;
  return (live.idx.markers.get(key) ?? []).some((m) => m.face === face && !STARTS.has(m.type));
}

// --- the strip and the pad ----------------------------------------------------------------

function status(text) {
  if (!live) return;
  live.status = text;
  const el = $("playStatus");
  if (el.textContent !== (text ?? "")) el.textContent = text ?? "";
}

function line() {
  if (!live) return;
  const s = shown();
  const text = `Playing · on the ${FACE_NAME[s.face]} of ${s.block.join(",")}, facing ${faceName(s.h)}`;
  const el = $("playLine");
  if (el.textContent !== text) el.textContent = text;
}

function sync() {
  $("play").hidden = !live;
  $("pad").hidden = !live || !padShown;
  $("padBtn").setAttribute("aria-pressed", String(padShown));
  if (live) {
    line();
    $("playStatus").textContent = live.status ?? "";
  }
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
    e.target.setPointerCapture(e.pointerId);
    held |= bit;
    tapped |= bit;
    wake();
  });
  for (const type of ["pointerup", "pointercancel"]) pad.addEventListener(type, release);
  pad.addEventListener("lostpointercapture", release);
  $("padBtn").onclick = () => {
    padShown = !padShown;
    sync();
    if (state.framing === fit) fit();
    drawSoon();
  };
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
  const bit = BITS[e.key];
  if (!bit || e.shiftKey || modified(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
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
  state.parked = {
    cam: { ...state.cam },
    target: [...state.target],
    fitted: state.framing === fit,
    slice: state.slice,
  };
  const from = viewNow();
  state.slice = SIDE - 1;
  const ball = ballAt(rulesOf(motion), where.cell, where.face, where.h);
  live = {
    level: l,
    idx: state.idx,
    probe,
    ball,
    key: keyOf(start, where),
    markers: markersFor(start),
    still: null,
    station: false,
    framed: false,
    status: at || start ? null : NO_START,
  };
  live.still = stateOf(ball);
  held = tapped = owed = 0;
  last = performance.now();
  state.anchored = true;
  state.frame = ball.frame;
  icon();
  sync();
  measure();
  fitWith(frameBall);
  fit();
  const to = {
    ...viewNow(),
    rot: () => viewOf(looked(live.ball), state.cam.yaw, state.cam.pitch),
    target: () => shown().centre,
  };
  startEase(from, to, ENTER_MS, () => {
    state.frame = live?.ball.frame ?? state.frame;
  });
  if (ease) state.frame = mul(from.rot, transpose(basisOf(state.cam.yaw, state.cam.pitch)));
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

function leave({ restore = true } = {}) {
  if (!live) return;
  finishEase();
  const parked = state.parked;
  live = null;
  held = tapped = 0;
  fitWith(null);
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
  live.key = keyOf(startOf(live.level, probe), at);
  live.ball = ballAt(live.ball.rules, cell, c.face, at.h);
  live.still = stateOf(live.ball);
  held = tapped = 0;
  status(null);
  state.frame = live.ball.frame;
  if (state.framing === fit) fit();
  line();
  invalidatePick();
  drawSoon();
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
  overlayWith({ under: () => void advance(), frame: again });
  movingWith(travellers);
  ballsWith(() => (live ? [shown().point] : null));
  on("level-changed", () => {
    leave({ restore: false });
    icon();
  });
  on("level-updated", () => {
    if (!live) return;
    live.idx = state.idx;
    live.probe = probeOf(state.idx);
    if (!live.probe.solid(blockUnder(live.ball))) leave();
  });
  on("link-opening", () => leave({ restore: false }));
  on("go-to", () => leave({ restore: false }));
  on("density-changed", icon);
  sync();
}
