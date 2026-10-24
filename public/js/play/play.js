// Play mode: the ball stood on the level and rolled by the keys, or along the planned route, the
// camera behind it.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { current } from "../viewer/chrome/course.js";
import { ageDust, drawDust, dustAlive, resetDust, travelDust } from "./dust.js";
import { drawEffects, effectsWith } from "./effects.js";
import { flashing, screened } from "./screen.js";
import { state } from "../viewer/state.js";
import { SIDE, cellKey } from "../format/lattice.js";
import {
  blockUnits,
  flip,
  jumpTable,
  litNow,
  markerNow,
  motionTable,
  skinsTable,
  worldTint,
} from "../viewer/data.js";
import { probeOf, tangent } from "../viewer/walk.js";
import {
  draw,
  drawSoon,
  invalidatePick,
  movingWith,
  overlayWith,
  runWith,
} from "../viewer/draw/render.js";
import { ballsWith } from "../viewer/draw/things.js";
import { toast } from "../viewer/ui/toast.js";
import { centreOn, chip, fit, fitWith, settle, writeHash } from "../viewer/chrome/navigate.js";
import { slotOf } from "../viewer/permalink.js";
import { onShow } from "../viewer/chrome/detail.js";
import { tipWith } from "../viewer/chrome/interaction.js";
import { REST, aloft, blockUnder, moving } from "./ball.js";
import { drives, frame as gameFrame, heeds, relevel, stand, startRun } from "./rules.js";
import { blanksOf } from "./passes.js";
import {
  DYING,
  LEFT_PLAY,
  LEFT_PLAY_RESTORED,
  NO_START,
  NOWHERE,
  OBJECTS_ON,
  PLAYING,
  PUT_ON,
  SENDING,
  STANDS,
  TAKEN,
  WEARING_OFF,
  deathOf,
  faceName,
} from "./phrases.js";
import { keyPad } from "./drive.js";
import {
  arrive,
  easeOn,
  easing,
  finishEase,
  follow,
  frameBall,
  startEase,
  turning,
  viewNow,
  viewOf,
} from "./eye.js";
import { probeOf as liveProbe } from "./world.js";
import {
  BALL,
  BALL_TYPE,
  firstStandable,
  flashed,
  footOf,
  glowed,
  markersFor,
  shown,
  sourceOf,
  startOf,
  stateOf,
  takenOn,
  travellerOf,
} from "./traveller.js";
import {
  caption,
  chrome,
  clearSaying,
  following,
  holdSaying,
  icon,
  line,
  measure,
  releaseSaying,
  routing,
  say,
  status,
  sync,
  wireStrip,
} from "./strip.js";
import { drive, followFrom, followed, keep, rested, retire, walked } from "./route.js";
import { gameFor, happened, refreshPanel, startOver as restarted } from "./events.js";

const LETHARGY_TYPE = 32;
const LEAVE_MS = 450;
const GAP_MS = 250;

let live = null;
const keys = keyPad();
let last = 0;
let owed = 0;
let idle = true;
// whether the pass last run took the lethargy pill, and whether one ran since the frame hook drew
let lit = false;
let passed = false;
let wired = false;

export const playing = () => live !== null;

const motionOn = () => state.show.motion;

// --- the ball as the frame draws it -----------------------------------------------------

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

export function station() {
  if (!live) return null;
  const s = shown(live);
  return { block: s.block, face: s.face, heading: faceName(s.h), moving: moving(live.run.ball) };
}

/** What the frame is handed for the ball, or null while no ball is on the level. */
export const handed = () => (live ? (travellerOf(live, live.level)?.get(BALL) ?? null) : null);

// --- the camera ---------------------------------------------------------------------------

/** The fit's framer while the ball is on the map: the view behind the ball as drawn, in the
    height the strip leaves free. */
const framer = (l) => frameBall(l, live, live && shown(live), state.view.h - chrome());

// --- the frame ----------------------------------------------------------------------------

function wake() {
  // a level that runs keeps the time it is owed; one at rest counts from the press
  if (idle) last = performance.now();
  drawSoon();
}

/** Run the game frames the wall clock owes, and move the camera after the ball. */
function advance() {
  if (live?.changing || (!live && !easeOn())) return;
  const now = performance.now();
  const dt = Math.min(GAP_MS, now - last);
  last = now;
  let moved = live ? stepped(dt) : false;
  // after the step, so the ease ends on this frame
  if (easeOn()) {
    if (easing(now)) writeHash();
    invalidatePick();
  }
  if (!live) return;
  if (!easeOn() && !live.ended && follow(live, shown(live), dt)) moved = true;
  if (moved) invalidatePick();
}

// what leaving says waits a frame, so what the way out says of where it goes is heard first
const sayLeaving = (text) =>
  requestAnimationFrame(() => {
    if (!live) say(text);
  });

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
      holdSaying();
      lit = false;
      passed = true;
      if (live.ended) {
        if (turning(live)) startOver();
      } else played();
      releaseSaying();
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
  if (moved) line(live);
  return moved;
}

/** Where the ball last stood, as Motion off draws it, taken on the game frame it stood there: a
    drawn frame may run several. */
function stood() {
  const b = live.run.ball;
  if (!moving(b) || live.station) live.still = stateOf(b, live.probe);
  live.station = false;
}

/** One game frame of the level with the pad as held, its dust, and what happened. */
function played() {
  const run = live.run;
  const b = run.ball;
  // a tap stands until a frame reads the pad, as the level opens with it dead, and is dropped
  // while an ending stands, so its wait's last frame reads only the keys held on it
  const pad = keys.pad(heeds(run), live.driver ? live.driver.pad(run) : 0, !run.words.ending);
  const was = !aloft(b) ? footOf(b) : null;
  const blinked = !!run.words.blink;
  const events = gameFrame(run, pad);
  if (events.some((e) => e.pill?.type === LETHARGY_TYPE)) lit = true;
  if (!motionOn()) ageDust(1 / motionTable().hz);
  else if (was && !aloft(b) && !events.some((e) => e.sent)) {
    const under = blockUnder(b);
    travelDust(was, footOf(b), b.n, () => under);
  }
  for (const event of events) happened(live, event);
  rested(live, b);
  flashed(live, run.words);
  glowed(live, run.words);
  if (run.words.send >= 0) status(live, SENDING);
  else if (run.words.blink && !blinked) status(live, WEARING_OFF);
  else if (live.status === SENDING || (live.status === WEARING_OFF && !run.words.blink))
    status(live, null);
  if (live.driver) {
    const why = live.driver.done(run);
    if (why) followed(live, why);
    else if (!live.status) status(live, following());
  }
  const death = deathOf(run.words);
  if (death) status(live, DYING[death], true);
  else if (live.dire) status(live, null);
  if (b.state === REST) live.notes.length = 0;
  if (live.ended) {
    keys.clear();
    owed = 0;
  }
}

const again = () =>
  !!(
    easeOn() ||
    (live &&
      (motionOn() ||
        (!live.ended && (moving(live.run.ball) || drives(live.run) || keys.busy() || live.driver))))
  );

/** The frame hook: the game's bursts over the scene, the pill's screen over them and the flash
    over everything, and another frame while the view eases, the level runs or something moves,
    and one more where the view has just cut. */
function more(ctx) {
  drawEffects(ctx);
  const ran = passed;
  passed = false;
  screened(ctx, live, { ran, lit });
  flashing(ctx, live);
  const asked = again() || !!live?.redraw;
  if (live) live.redraw = false;
  return asked;
}

// --- the way the ball has come ------------------------------------------------------------

function drawDustOver(ctx, c, home, key, ghost) {
  if (!live || ghost || c.k !== undefined) return;
  drawDust(ctx, key);
}

/** Roll the ball along the planned route from the stop it stands on, or from the first stop,
    where it is put, when it stands on none or on the last; pressed again, let the ball go. */
function followRoute() {
  const route = current();
  if (!live || live.ended || !route) return;
  if (live.driver) {
    retire(live);
    return;
  }
  const { error, i, at } = followFrom(live, route);
  if (error) {
    status(live, error);
    return;
  }
  live.keeping = false;
  if (at) put(at);
  drive(live, route, i);
  status(live, following());
  say((at ? `${PUT_ON(at.face, at.cell)} ` : "") + following());
  wake();
}

// --- entering and leaving -----------------------------------------------------------------

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
    notes: [],
    rests: [],
    broken: new Set(),
    flash: 0,
    dire: false,
    ended: null,
    driver: null,
    route: null,
    keeping: false,
    kept: null,
    redraw: false,
    changing: false,
  };
  const ball = run.ball;
  live.still = stateOf(ball, live.probe);
  resetDust(worldTint(l.theme));
  routing(live);
  keys.clear();
  owed = 0;
  last = performance.now();
  state.anchored = true;
  state.frame = ball.frame;
  icon(live);
  sync(live);
  measure();
  fitWith(framer);
  fit();
  arrive(live, from, () => shown(live).centre, performance.now());
  runWith((l) => sourceOf(live, l));
  emit("play-changed", true);
  emit("slice-changed");
  chip();
  writeHash();
  invalidatePick();
  draw();
  const s = stateOf(ball, live.probe);
  say(PLAYING(l, s.face, s.block, s.h));
}

function leave({ restore = true } = {}) {
  if (!live) return;
  finishEase();
  const parked = state.parked;
  // the view and the presses go back only where the level shown is the one they were parked on
  const home = () => parked !== null && slotOf(state.lvl) === parked.slot;
  const back = home();
  live = null;
  keys.clear();
  clearSaying();
  fitWith(null);
  runWith(null);
  refreshPanel();
  if (back) state.presses = parked.presses;
  resetDust(null);
  sync(live);
  emit("play-changed", false);
  const done = () => {
    state.frame = null;
    state.anchored = false;
    state.parked = null;
    if (restore && home()) {
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
    sayLeaving(LEFT_PLAY);
    return;
  }
  const to = {
    rot: () => viewOf(null, parked.cam.yaw, parked.cam.pitch),
    zoom: parked.cam.zoom,
    panX: parked.cam.panX,
    panY: parked.cam.panY,
    target: () => parked.target,
  };
  startEase(viewNow(), to, LEAVE_MS, performance.now(), done);
  invalidatePick();
  drawSoon();
  sayLeaving(LEFT_PLAY_RESTORED);
}

export function togglePlay() {
  if (live) leave();
  else enter();
}

/** Stand the live ball at rest on `at`, the keys having it, the view cut to it and the way it has
    come taking a stop there. */
function put(at) {
  retire(live);
  stand(live.run, at);
  live.still = stateOf(live.run.ball, live.probe);
  walked(live, { cell: at.cell, face: at.face });
  keys.clear();
  status(live, null);
  state.frame = live.run.ball.frame;
  if (state.framing === fit) fit();
  line(live);
  invalidatePick();
  drawSoon();
}

/** The level over from its start, or on to the next, the keys let go and the clock counting from
    now, or play left where no face can stand the ball. */
function startOver(opts) {
  if (!live) return;
  if (!restarted(live, opts)) {
    leave();
    return;
  }
  keys.clear();
  owed = 0;
  last = performance.now();
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
  say(STANDS(s.face, s.block, s.h));
}

export function bootPlay() {
  if (wired) return;
  wired = true;
  wireStrip({
    startOver,
    retire: () => retire(live),
    wake,
    followRoute,
    keep: () => keep(live),
    leave,
    togglePlay,
    keys,
    live: () => live,
  });
  // a press while the view eases back out of play ends the ease, so what it does starts from the
  // view play leaves for
  for (const type of ["pointerdown", "keydown"])
    addEventListener(
      type,
      () => {
        if (!live) finishEase();
      },
      { capture: true },
    );
  overlayWith({ under: () => void advance(), cell: drawDustOver, frame: more });
  effectsWith(() => live?.run ?? null);
  movingWith((l) => travellerOf(live, l));
  ballsWith(() => (live && !live.ended ? [shown(live).point] : null));
  tipWith((c) => takenOn(live, cellKey(c.x, c.y, c.z)).map(TAKEN));
  onShow((box, c) => {
    const body = box.querySelector("#detailBody");
    for (const m of takenOn(live, cellKey(c.x, c.y, c.z)))
      body.append(el("p", { className: "sub", textContent: `${TAKEN(m)}.` }));
  });
  on("level-changed", () => {
    if (live && !live.changing) {
      leave({ restore: false });
      // the level was fitted before play heard of it, with the ball still framing the view
      if (state.framing === fit) fit();
    } else if (!live) finishEase();
    icon(live);
  });
  on("level-updated", () => {
    if (!live) return;
    live.level = state.lvl;
    live.idx = state.idx;
    caption();
    relevel(live.run, state.lvl, state.idx);
    const b = live.run.ball;
    const under = blockUnder(b);
    if (!b.riding && !state.idx.cells.has(cellKey(...under)) && !live.probe.filled(under)) leave();
  });
  on("link-opening", () => {
    if (live) leave({ restore: false });
    else finishEase();
  });
  on("go-to", ({ x, y, z }) => {
    if (!live) return;
    // the find has been drawn on the ball's view and written with the view from before play
    centreOn(x, y, z);
    leave({ restore: false });
    settle();
  });
  on("density-changed", () => icon(live));
  on("course-changed", () => {
    if (live?.driver && current() !== live.route) retire(live);
    if (live?.kept && current() !== live.kept) {
      live.kept = null;
      live.keeping = false;
    }
    routing(live);
  });
  on("show-changed", (key) => {
    if (key === "dust" && live && !state.show.dust) resetDust(worldTint(live.level.theme));
  });
  sync(live);
}
