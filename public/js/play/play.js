// Play mode: the ball stood on the level and rolled by the keys, or along the planned route, the
// camera behind it.
import { $, el, emit, on } from "../viewer/ui/dom.js";
import { adoptCourse, current, measureStrip } from "../viewer/chrome/course.js";
import { ageDust, burstDust, drawDust, dustAlive, resetDust, travelDust } from "./dust.js";
import { drawEffects, effectsWith } from "./effects.js";
import { state } from "../viewer/state.js";
import { SIDE, cellKey } from "../format/lattice.js";
import {
  ballFor,
  blockUnits,
  flip,
  jumpTable,
  levelTitle,
  litNow,
  markerModel,
  markerNow,
  motionTable,
  skinsTable,
  worldName,
  worldTint,
} from "../viewer/data.js";
import { probeOf, stepBetween, tangent } from "../viewer/walk.js";
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
import {
  centreOn,
  chip,
  fit,
  fitWith,
  selectLevel,
  settle,
  writeHash,
} from "../viewer/chrome/navigate.js";
import { slotOf } from "../viewer/permalink.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { say as announce } from "../viewer/chrome/a11y.js";
import { clearDetail, onShow, showCell } from "../viewer/chrome/detail.js";
import { tipWith } from "../viewer/chrome/interaction.js";
import { PAD, REST, aloft, blockUnder, centreOf, faceUnder, moving } from "./ball.js";
import {
  drives,
  frame as gameFrame,
  heeds,
  relevel,
  restart,
  revive,
  stand,
  startRun,
} from "./rules.js";
import { SCREEN, blanksOf } from "./passes.js";
import { MODE, conclude, gameOf, nextOf } from "./game.js";
import {
  AT,
  BROKE,
  CLOCK_ROUND,
  DONE_WHY,
  DYING,
  ENDED,
  FOLLOWING,
  FOLLOWING_PAD,
  FORGIVEN,
  GONE,
  KEEPING,
  KEPT,
  LAUNCHED,
  LEFT_PLAY,
  LEFT_PLAY_RESTORED,
  LINE,
  NO_FIRST_STOP,
  NO_START,
  NOWHERE,
  OBJECTS_ON,
  OPENED,
  PLAYING,
  PUT_ON,
  REFUSED,
  RIDING,
  ROUTE_STANDS,
  SENDING,
  SENT,
  STANDS,
  STARTED,
  TAKEN,
  THROWN,
  TOOK,
  UNDERFOOT,
  WEARING_OFF,
  WOULD,
  deathOf,
  endingName,
  faceName,
  howEnded,
  hudOf,
  isFollowing,
  noted,
  thenOn,
} from "./phrases.js";
import { courseDriver, keyPad } from "./drive.js";
import {
  arrive,
  easeOn,
  easing,
  eyeOf,
  finishEase,
  follow,
  frameBall,
  radiusOf,
  startEase,
  turning,
  viewNow,
  viewOf,
} from "./eye.js";
import { probeOf as liveProbe, viewOf as drawnIndex } from "./world.js";
import {
  BALL,
  BALL_TYPE,
  blockAt,
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

const KEY_TYPE = 31;
const LETHARGY_TYPE = 32;
const KEY_MARKER = { type: KEY_TYPE, face: 0, variant: null, f: [] };
// the ghost's blend takes half of the last frame and half of the scene
const HALF = 0.5;
// a channel's full byte, the unit the flash's strength is in
const BYTE = 255;
const LEAVE_MS = 450;
const GAP_MS = 250;
const BITS = {
  ArrowUp: PAD.up,
  ArrowLeft: PAD.left,
  ArrowRight: PAD.right,
  ArrowDown: PAD.down,
  " ": PAD.cross,
};
const PAD_BITS = { up: PAD.up, left: PAD.left, right: PAD.right, jump: PAD.cross };
const AT_SWITCH = 6;
const AT_GONE = 10;
const AT_BREAK = 2;
const AT_LAUNCH = 10;

let live = null;
const keys = keyPad();
let last = 0;
let owed = 0;
let idle = true;
let framing = false;
let saying = null;
const unsaid = [];
let telling = false;
let redraw = false;
// whether the pass last run took the lethargy pill, and whether one ran since the frame hook drew
let lit = false;
let passed = false;
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

/** The game the run plays, where its setting is on and the level is one the game plays a game
    on: `game` carried on, or a fresh one of the level's mode; else none. */
const gameFor = (l, tables, game = null) => (state.show.playon ? gameOf(l, tables, game) : null);

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

/** How much of the map's height the strip takes, as it stands, from its foot; the pad lies over
    the view and takes none. */
function chrome() {
  const strip = $("play");
  if (strip.hidden) return 0;
  return $("cv").getBoundingClientRect().bottom - strip.getBoundingClientRect().top;
}

// --- the frame ----------------------------------------------------------------------------

function wake() {
  // a level that runs keeps the time it is owed; one at rest counts from the press
  if (idle) last = performance.now();
  drawSoon();
}

/** Run the game frames the wall clock owes, and move the camera after the ball. */
function advance() {
  if (changing || (!live && !easeOn())) return;
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

// what leaving says waits a frame, so what the way out says of where it goes is heard first
const sayLeaving = (text) =>
  requestAnimationFrame(() => {
    if (!live) told(text);
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
      framing = true;
      saying = null;
      lit = false;
      passed = true;
      if (live.ended) {
        if (turning(live)) startOver();
      } else played();
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
  if (!moving(b) || live.station) live.still = stateOf(b, live.probe);
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
  const was = !aloft(b) ? footOf(b) : null;
  const blinked = !!run.words.blink;
  const events = gameFrame(run, pad);
  if (events.some((e) => e.pill?.type === LETHARGY_TYPE)) lit = true;
  if (!motionOn()) ageDust(1 / motionTable().hz);
  else if (was && !aloft(b) && !events.some((e) => e.sent)) {
    const under = blockUnder(b);
    strewn(was, footOf(b), b.n, () => under);
  }
  for (const event of events) happened(event);
  rested(b);
  flashed(live, run.words);
  glowed(live, run.words);
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
    say(CLOCK_ROUND(left));
    return;
  }
  if (event.at) {
    live.station = true;
    const block = blockUnder(b);
    say(noted(live.notes, AT(block, faceUnder(b))));
    status(b.riding ? RIDING : null);
    walked({ cell: block, face: faceUnder(b) });
    if (!motionOn())
      strewn(live.still.foot, footOf(b), b.n, (p) => blockAt(live.probe, p, b.n, block), true);
  } else if (event.face) {
    live.station = true;
    say(noted(live.notes, UNDERFOOT(faceUnder(b), blockUnder(b))));
    burst(footOf(b), b.n, blockUnder(b), AT_SWITCH);
  } else if (event.turned) {
    live.station = true;
    if (Object.values(REFUSED).includes(live.status)) status(b.riding ? RIDING : null);
  }
}

/** A thing taken: the take said, and the panel brought up to date where it shows the block. */
function taken({ key, face, points }) {
  const m = (live.run.world.idx.markers.get(key) ?? []).find((m) => m.face === face);
  say(TOOK(m, points));
  refreshPanel();
  invalidatePick();
}

/** The panel drawn again where it shows a block, so what it says of the block's things holds. */
function refreshPanel() {
  if (state.selected) showCell(state.selected, { raise: false });
}

/** A switch thrown under the ball: dust at its foot, the circuit's turn said, the panel redrawn. */
function threw({ circuit }) {
  const b = live.run.ball;
  burst(footOf(b), b.n, blockUnder(b), AT_SWITCH);
  const text = THROWN(circuit);
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
  live.still = stateOf(b, live.probe);
  walked({ cell: to.cell, face: to.face }, true);
  state.frame = b.frame;
  state.target = [...centreOf(b)];
  if (state.framing === fit) fit();
  status(null);
  say(SENT(to.face, to.cell));
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
  const { view } = play;
  const run = live.run;
  if (!state.show.playon) run.game = null;
  const w = run.words;
  const settled = conclude(run);
  const next = run.game ? pickedLevel(nextOf(run.game, run, packCount(live.level.pack))) : null;
  live.ended = {
    code,
    how: howEnded(code, w, settled, play),
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
  live.keeping = false;
  routing();
  finishEase();
  state.frame = null;
  fit();
  status(verdict());
  say(verdict());
  redraw = true;
  invalidatePick();
}

/** The strip's verdict: how the level ended and what the key goes on to, the level the game loads
    next or this one again, the pad named while it shows. */
const verdict = () => `${live.ended.how} ${thenOn(live.ended.next, padShown)}`;

/** The levels the pack holds, as the data has them. */
const packCount = (pack) => state.data.levels.filter((l) => l.pack === pack).length;

/** The level of the disc at `pick`, a pack and an index, where it is another than the one played,
    else null. */
function pickedLevel(pick) {
  if (!pick) return null;
  const l = state.data.levels.find((x) => x.pack === pick.pack && x.index === pick.index);
  return l && l !== live.level ? l : null;
}

/** The death forgiven: the ball put back at rest and the status saying what would have been. */
function forgive(name) {
  const b = live.run.ball;
  revive(live.run, refuge());
  live.flash = 0;
  live.still = stateOf(b, live.probe);
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
  live.keeping = false;
  live.kept = null;
  live.framed = false;
  state.presses = new Map();
  const b = live.run.ball;
  const at = { cell: blockUnder(b), face: faceUnder(b) };
  live.walk = { stations: [at], steps: [] };
  live.notes = [];
  live.rests = [];
  live.broken = new Set();
  live.flash = 0;
  live.still = stateOf(b, live.probe);
  resetDust(worldTint(l.theme));
  routing();
  status(start ? null : NO_START);
  keys.clear();
  owed = 0;
  last = performance.now();
  state.frame = b.frame;
  fit();
  arrive(live, from, () => shown(live).centre, performance.now());
  line();
  refreshPanel();
  redraw = true;
  invalidatePick();
  say(STARTED(l, went, at.face, at.cell, b.h));
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

// --- the way the ball has come ------------------------------------------------------------

const sameStation = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);

/** One more stop on the way the ball has come, joined by the roll or the jump that reaches it, or by
    a leap where it was sent or where no step does. */
function walked(station, leap = false) {
  const w = live.walk;
  const last = w.stations.at(-1);
  if (last && sameStation(last, station)) return;
  if (last) w.steps.push(leap ? null : stepBetween(last, station));
  w.stations.push(station);
  if (live.keeping) hand();
}

function drawDustOver(ctx, c, home, key, ghost) {
  if (!live || ghost || c.k !== undefined) return;
  drawDust(ctx, key);
}

/** The strip's route buttons: Keep while no route stands or the route is the way the ball has
    come, pressed while that way goes on being handed over, Follow while a route stands, pressed
    while the ball follows it and dim once the level has ended. */
function routing() {
  const route = current();
  const keep = $("keepBtn");
  keep.disabled = !live || (route !== null && route !== live.kept);
  keep.setAttribute("aria-pressed", String(!!live?.keeping));
  const follow = $("followBtn");
  follow.hidden = !live || route === null;
  follow.disabled = !live || live.ended !== null;
  follow.setAttribute("aria-pressed", String(live?.driver != null));
}

/** The strip's word while the ball follows the route, the pad named while it shows. */
const following = () => (padShown ? FOLLOWING_PAD : FOLLOWING);

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
  const [first] = route.stations;
  if (i < 0 && !live.probe.standable(first.cell, first.face)) {
    status(NO_FIRST_STOP);
    return;
  }
  live.keeping = false;
  if (i < 0) {
    put({ cell: first.cell, face: first.face, h: tangent(first.face, route.steps[0]?.k ?? 0) });
    placed = `${PUT_ON(first.face, first.cell)} `;
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

/** Hand the way the ball has come to the planner as the route: whether it took it, and where
    another route stands keeping ends. */
function hand() {
  const { stations, steps } = live.walk;
  const c = {
    stations: [...stations],
    steps: [...steps],
    marks: new Set([0, stations.length - 1]),
  };
  // the hand-over's own course-changed is not a change from the planner's side
  live.kept = null;
  const taken = adoptCourse(c);
  if (taken) live.kept = current();
  else live.keeping = false;
  routing();
  return taken;
}

/** Keep: pressed, the way the ball has come is the route and grows under the ball
    as it goes on; pressed again, the route stays as it is; once the level has ended the whole
    way is handed over once. */
function keep() {
  if (!live) return;
  if (live.keeping) {
    live.keeping = false;
    routing();
    return;
  }
  if (!hand()) {
    status(ROUTE_STANDS);
    return;
  }
  live.keeping = !live.ended;
  const text = live.keeping ? KEEPING : KEPT;
  say(text);
  toast(text);
  routing();
}

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

/** Fill a figure of the HUD's row from its phrase: the number in its bold, what stands before
    the number in the span a reader alone gets and the word after it in its small, each with its
    own space, so the figure reads as the phrase, written only where it changed. */
function reading(id, phrase, title = null) {
  const el = $(id);
  const [, before, n, after] = /^(.*?)\s*(\d+)\s*(.*)$/.exec(phrase);
  const parts = [
    [".sr", before && `${before} `],
    ["b", n],
    ["small", after && ` ${after}`],
  ];
  for (const [part, text] of parts) {
    const node = el.querySelector(part);
    if (node && node.textContent !== text) node.textContent = text;
  }
  if (title !== null && el.title !== title) el.title = title;
}

/** Keep the keys figure's mark to the level: the legend's key where keys are counted and
    nothing where blocks are, drawn again when `fresh`. */
function marked(bonus, fresh = false) {
  const mark = $("playKeys").querySelector(".mark");
  if (!fresh && mark.hasChildNodes() === !bonus) return;
  const model = bonus ? null : markerModel(KEY_MARKER, state.lvl);
  if (model) mark.replaceChildren(iconFor(model, 18));
  else mark.replaceChildren();
}

function line() {
  if (!live) return;
  const s = shown(live);
  const text = live.ended ? ENDED : LINE(s.face, s.block, s.h);
  const el = $("playLine");
  if (el.textContent !== text) el.textContent = text;
  const w = live.run.words;
  const game = live.run.game;
  const hud = hudOf(w, game, live.run.match, motionTable().play);
  reading("playClock", hud.clock);
  reading("playKeys", hud.keys, hud.keysTitle);
  marked(w.bonus);
  reading("playPoints", hud.points);
  const room = w.mode === MODE.simon;
  for (const id of ["playRound", "playMoves"]) $(id).hidden = !room;
  for (const id of ["playTurn", "playMatch"]) $(id).hidden = !(room && game);
  if (room) {
    figure("playRound", hud.round);
    figure("playMoves", hud.moves);
    if (game) {
      figure("playTurn", hud.turn);
      figure("playMatch", hud.match);
    }
  }
  $("playTotal").hidden = !game || room;
  if (game && !room) figure("playTotal", hud.total);
}

function sync() {
  $("play").hidden = !live;
  $("hud").hidden = !live;
  document.body.classList.toggle("playing", live !== null);
  const padUp = live !== null && padShown;
  $("pad").hidden = !padUp;
  $("jump").hidden = !padUp;
  document.body.classList.toggle("padded", padUp);
  $("padBtn").setAttribute("aria-pressed", String(padShown));
  $("forgiveBtn").setAttribute("aria-pressed", String(forgiving));
  if (live) {
    line();
    $("playStatus").textContent = live.status ?? "";
    $("playStatus").classList.toggle("dying", live.dire);
  }
}

function wirePad() {
  const bitOf = (e) => PAD_BITS[e.target.closest("[data-pad]")?.dataset.pad] ?? 0;
  const release = (e) => {
    const bit = bitOf(e);
    if (bit) keys.up(bit);
  };
  const press = (e) => {
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
  };
  for (const group of [$("pad"), $("jump")]) {
    group.addEventListener("pointerdown", press);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      group.addEventListener(type, release);
  }
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

/** Draw the pad's ball for the level shown and, while the ball is on it, the HUD's key and the
    level's name. */
function icon() {
  const l = state.lvl;
  const model = l && ballFor(l);
  $("padBall").replaceChildren(model ? iconFor(model, 40) : "");
  if (!live) return;
  marked(live.run.words.bonus, true);
  caption();
}

/** Name the level in the HUD as the level line names it. */
function caption() {
  const l = state.lvl;
  $("hudTitle").textContent = `${levelTitle(l)} · ${worldName(l.theme)}`;
}

// --- the keys -----------------------------------------------------------------------------

const modified = (e) => e.metaKey || e.ctrlKey || e.altKey;

function keydown(e) {
  if (!state.lvl || typing(e) || dialogOpen()) return;
  if (e.key === "p" && !modified(e) && !e.shiftKey) {
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
  };
  const ball = run.ball;
  live.still = stateOf(ball, live.probe);
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
  retire();
  stand(live.run, at);
  live.still = stateOf(live.run.ball, live.probe);
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
  say(STANDS(s.face, s.block, s.h));
}

export function bootPlay() {
  if (wired) return;
  wired = true;
  document.addEventListener("keydown", keydown, { capture: true });
  document.addEventListener("keyup", keyup, { capture: true });
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
  // read as the focus lands, since by the keydown a clicked button's focus is visible too
  document.addEventListener("focusin", (e) => {
    keyed = e.target.matches(":focus-visible");
  });
  addEventListener("blur", () => keys.up());
  wirePad();
  measure = measureStrip($("play"), "--play-h");
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
    if (live && !changing) {
      leave({ restore: false });
      // the level was fitted before play heard of it, with the ball still framing the view
      if (state.framing === fit) fit();
    } else if (!live) finishEase();
    icon();
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
  on("density-changed", icon);
  on("course-changed", () => {
    if (live?.driver && current() !== live.route) retire();
    if (live?.kept && current() !== live.kept) {
      live.kept = null;
      live.keeping = false;
    }
    routing();
  });
  on("show-changed", (key) => {
    if (key === "dust" && live && !state.show.dust) resetDust(worldTint(live.level.theme));
  });
  sync();
}
