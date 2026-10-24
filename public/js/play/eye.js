// The camera behind the ball and the ending's eye: the view framed behind the ball and drawn
// after it, rolled by the pill's angle, the ending's eye swinging about the level's middle, and
// the ease that brings the view round.
import {
  state,
  BLOCK,
  FIT_MARGIN,
  FIT_ZOOM_MAX,
  ZOOM_MAX,
  ZOOM_MIN,
  basisAt,
  fitLevel,
  levelCentre,
} from "../viewer/state.js";
import { blockUnits, motionTable } from "../viewer/data.js";
import { offsetFrame, turned } from "./ball.js";
import { LETHARGY, drawn, rockOf } from "./passes.js";
import { FORM } from "./game.js";

const YAW = 20;
const PITCH = 30;
const ZOOM = { blocks: 8, min: 0.8, max: 3 };
const BELOW = 1 / 5;
const FOLLOW_MS = 120;
const LANDS = 1e-4;
const ENTER_MS = 600;

let ease = null;
let rolled = null;

const motionOn = () => state.show.motion;
const rockTable = () => motionTable().types[String(LETHARGY)].lasts.rock;
const smooth = (t) => t * t * (3 - 2 * t);

const mul = (a, b) =>
  [0, 1, 2].flatMap((j) =>
    [0, 1, 2].map((i) => a[i] * b[3 * j] + a[3 + i] * b[3 * j + 1] + a[6 + i] * b[3 * j + 2]),
  );
const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const basisOf = (yaw, pitch) => {
  const { right, up, toward } = basisAt(yaw, pitch);
  return [...right, ...up, ...toward];
};

export function quatOf(m) {
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

export const matOf = ([x, y, z, w]) => [
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

export function slerp(a, b, t) {
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
export const viewOf = (frame, yaw, pitch) =>
  frame ? mul(frame, basisOf(yaw, pitch)) : basisOf(yaw, pitch);

/** The ball's frame pitched further down by the view's word while it falls. */
const looked = (b) => (b.look.word ? offsetFrame(b.frame, 0, b.look.word, b.rules.turn) : b.frame);

/** The frame rolled about the view's line of sight by the pill's angle, the orbit's yaw and pitch
    composed first, or the frame itself while the pill's word is not positive; the array stands
    while the frame, the angle and the orbit do, since the frame is compared by identity. */
export function rocked(live, frame) {
  const { turn } = motionTable();
  const angle = rockOf(live.run.words.pills[LETHARGY], rockTable(), turn);
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

/** Frame the view on the ball as drawn, `s`, in the height the strip leaves `free`: behind it and
    above, the ball a little below the middle; the level's own fit where `l` is not the level
    played, and the ending's view once the level has ended. */
export function frameBall(l, live, s, free) {
  if (!live || l !== live.level) {
    state.frame = null;
    return fitLevel(l);
  }
  if (live.ended) return frameEnding(live, free);
  state.target = [...s.centre];
  if (!live.framed) {
    state.cam.yaw = YAW;
    state.cam.pitch = PITCH;
    live.framed = true;
  }
  const { w, h } = state.view;
  const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.min(w, free) / (ZOOM.blocks * BLOCK)));
  state.cam.zoom = zoom;
  state.cam.panX = 0;
  state.cam.panY = -(free * (0.5 + BELOW) - h / 2) / (zoom * BLOCK);
}

/** Draw the view's target after the ball as drawn, `s`, with Motion on by the follow's time over
    `dt` ms and without at once, and set the camera's frame to the ball's: whether the frame
    changed. */
export function follow(live, s, dt) {
  const k = motionOn() ? 1 - Math.exp(-dt / FOLLOW_MS) : 1;
  state.target = state.target.map((v, i) => {
    const off = s.centre[i] - v;
    return Math.abs(off) < LANDS ? s.centre[i] : v + off * k;
  });
  const frame = rocked(live, motionOn() ? looked(live.run.ball) : s.frame);
  if (state.frame === frame) return false;
  state.frame = frame;
  return true;
}

/** Half the level's box's diagonal, in blocks: no cell of it lies further from its middle. */
export const radiusOf = (l) => Math.hypot(...[0, 1, 2].map((i) => l.max[i] - l.min[i] + 1)) / 2;

/** Frame the ending's view: the level's middle in the middle of what the strip leaves `free`,
    zoomed so that the whole level fits with the eye at its mean distance. */
export function frameEnding(live, free) {
  const e = live.ended;
  state.target = levelCentre(live.level);
  const { w } = state.view;
  e.free = free;
  const fits = (Math.min(w, e.free) - FIT_MARGIN) / (2 * e.radius * BLOCK);
  e.base = Math.max(ZOOM_MIN, Math.min(FIT_ZOOM_MAX, fits));
  swung(live);
}

/** The eye the level's mode word stands at an ending: the arcade's swing, the no-key level's
    quicker and wider swing, or the hidden level's eye, which does not swing, its fourth angle
    never stepping. */
export const eyeOf = (view, form) => {
  if (form === FORM.bonus) return { ...view, ...view.bonus };
  if (form === FORM.hidden) return { ...view, ...view.hidden, swing: 0, reach: 0 };
  return view;
};

// The orbit has no eye, so the zoom stands in for how large the level looks from the game's eye,
// which stands the level's radius and an offset off the middle and swings its reach, where it
// has one, nearer and further by turns.
function swung(live) {
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
    yaw turned by the game's third angle, the pitch by its first, the eye along its swing: whether
    the view's length has run out. */
export function turning(live) {
  const e = live.ended;
  const { turn } = motionTable();
  drawn(live.run);
  const [pitch, , yaw] = e.view.angles;
  state.cam.yaw += (yaw * 360) / turn;
  state.cam.pitch += (pitch * 360) / turn;
  e.theta += e.view.swing;
  e.frame += 1;
  swung(live);
  return e.frame >= e.length;
}

export function startEase(from, to, ms, now, done) {
  if (!motionOn()) {
    done();
    return;
  }
  ease = { from, to, qa: quatOf(from.rot), start: now, ms, done };
}

/** The ease stepped to `now`: whether it has ended, its done run. */
export function easing(now) {
  const e = ease;
  const t = Math.max(0, Math.min(1, (now - e.start) / e.ms));
  if (t >= 1) {
    ease = null;
    e.done();
    return true;
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
  return false;
}

export function finishEase() {
  if (!ease) return;
  const e = ease;
  ease = null;
  e.done();
}

export const easeOn = () => ease !== null;

export const viewNow = () => ({
  rot: viewOf(state.frame, state.cam.yaw, state.cam.pitch),
  zoom: state.cam.zoom,
  panX: state.cam.panX,
  panY: state.cam.panY,
  target: [...state.target],
});

/** Bring the view round behind the ball from `from`, easing with Motion on and at once without. */
export function arrive(live, from, centreNow, now) {
  const to = {
    ...viewNow(),
    rot: () => viewOf(looked(live.run.ball), state.cam.yaw, state.cam.pitch),
    target: centreNow,
  };
  startEase(from, to, ENTER_MS, now, () => {
    state.frame = live?.run.ball.frame ?? state.frame;
  });
  if (ease) state.frame = mul(from.rot, transpose(basisOf(state.cam.yaw, state.cam.pitch)));
}
