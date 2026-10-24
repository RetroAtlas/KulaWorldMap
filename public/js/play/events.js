// The game's events as play answers them: what happened on the way said and marked with dust, the
// ending with its verdict and its eye, a death forgiven and the level started over or the next
// gone on to.
import { state } from "../viewer/state.js";
import { motionTable, worldTint } from "../viewer/data.js";
import { probeOf } from "../viewer/walk.js";
import { invalidatePick } from "../viewer/draw/render.js";
import { toast } from "../viewer/ui/toast.js";
import { fit, selectLevel } from "../viewer/chrome/navigate.js";
import { clearDetail, showCell } from "../viewer/chrome/detail.js";
import { burstDust, resetDust, travelDust } from "./dust.js";
import { blockUnder, centreOf, faceUnder } from "./ball.js";
import { restart, revive } from "./rules.js";
import { conclude, gameOf, nextOf } from "./game.js";
import {
  AT,
  BROKE,
  CLOCK_ROUND,
  DYING,
  FORGIVEN,
  GONE,
  LAUNCHED,
  NO_START,
  NOWHERE,
  OPENED,
  REFUSED,
  RIDING,
  SENT,
  STARTED,
  THROWN,
  TOOK,
  UNDERFOOT,
  WOULD,
  endingName,
  howEnded,
  noted,
} from "./phrases.js";
import { arrive, eyeOf, finishEase, radiusOf, viewNow } from "./eye.js";
import { probeOf as liveProbe, viewOf as drawnIndex } from "./world.js";
import {
  blockAt,
  firstStandable,
  footOf,
  markersFor,
  shown,
  startOf,
  stateOf,
} from "./traveller.js";
import { forgiving, line, routing, say, status, verdict } from "./strip.js";
import { refuge, retire, walked } from "./route.js";

const AT_SWITCH = 6;
const AT_GONE = 10;
const AT_BREAK = 2;
const AT_LAUNCH = 10;

const motionOn = () => state.show.motion;

export function happened(live, event) {
  const b = live.run.ball;
  if (event.refused) {
    if (REFUSED[event.refused]) status(live, REFUSED[event.refused]);
    return;
  }
  if (event.ended) {
    const name = endingName(event.ended.code);
    if (forgiving && WOULD[name]) forgive(live, name);
    else ended(live, event.ended.code);
    return;
  }
  if (event.dying) {
    say(DYING[event.dying.cause]);
    if (forgiving) forgive(live, event.dying.cause);
    return;
  }
  if (event.took) {
    taken(live, event.took);
    return;
  }
  if (event.opened) {
    say(OPENED);
    return;
  }
  if (event.threw) {
    threw(live, event.threw);
    return;
  }
  if (event.broke) {
    broke(live, event.broke);
    return;
  }
  if (event.fell) {
    fell(live, event.fell);
    return;
  }
  if (event.sent) {
    sent(live, event.sent);
    return;
  }
  if (event.boosted) {
    boosted(live);
    return;
  }
  if (event.rode) {
    live.notes.push(RIDING);
    return;
  }
  if (event.alit) {
    if (live.status === RIDING) status(live, null);
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
    status(live, b.riding ? RIDING : null);
    walked(live, { cell: block, face: faceUnder(b) });
    if (!motionOn())
      travelDust(live.still.foot, footOf(b), b.n, (p) => blockAt(live.probe, p, b.n, block), true);
  } else if (event.face) {
    live.station = true;
    say(noted(live.notes, UNDERFOOT(faceUnder(b), blockUnder(b))));
    burstDust(footOf(b), b.n, blockUnder(b), AT_SWITCH, !motionOn());
  } else if (event.turned) {
    live.station = true;
    if (Object.values(REFUSED).includes(live.status)) status(live, b.riding ? RIDING : null);
  }
}

/** A thing taken: the take said, and the panel brought up to date where it shows the block. */
function taken(live, { key, face, points }) {
  const m = (live.run.world.idx.markers.get(key) ?? []).find((m) => m.face === face);
  say(TOOK(m, points));
  refreshPanel();
  invalidatePick();
}

/** The panel drawn again where it shows a block, so what it says of the block's things holds. */
export function refreshPanel() {
  if (state.selected) showCell(state.selected, { raise: false });
}

/** A switch thrown under the ball: dust at its foot, the circuit's turn said, the panel redrawn. */
function threw(live, { circuit }) {
  const b = live.run.ball;
  burstDust(footOf(b), b.n, blockUnder(b), AT_SWITCH, !motionOn());
  const text = THROWN(circuit);
  say(text);
  live.notes.push(text);
  refreshPanel();
}

/** The ball launched off a boost button: dust at its foot, the launch said, and the strip saying
    so until the ball lands. */
function boosted(live) {
  const b = live.run.ball;
  burstDust(footOf(b), b.n, blockUnder(b), AT_LAUNCH, !motionOn());
  status(live, LAUNCHED);
  say(LAUNCHED);
  live.notes.push(LAUNCHED);
}

/** A crumbling block broken under the ball: dust at its foot each time the game breaks it, and
    the break said the first time. */
function broke(live, { key }) {
  const b = live.run.ball;
  burstDust(footOf(b), b.n, blockUnder(b), AT_BREAK, !motionOn());
  if (live.broken.has(key)) return;
  live.broken.add(key);
  say(BROKE);
  live.notes.push(BROKE);
}

/** A crumbling block gone: dust where it stood, drawn over the nearest block the frame still
    draws, the panel cleared where it showed the block, and the fall said. */
function fell(live, { key }) {
  const { x, y, z } = live.idx.cells.get(key);
  const over = nearestDrawn(live, [x, y, z]);
  if (over) burstDust([x + 0.5, y + 0.5, z + 0.5], live.run.ball.n, over, AT_GONE, !motionOn());
  if (state.selected?.key === key) clearDetail();
  say(GONE([x, y, z].join(",")));
  live.redraw = true;
  invalidatePick();
}

/** The cell nearest `cell` among those the frame draws, or null where it draws none. */
function nearestDrawn(live, cell) {
  let best = null;
  let least = Infinity;
  for (const c of drawnIndex(live.run).cells.values()) {
    const d = (c.x - cell[0]) ** 2 + (c.y - cell[1]) ** 2 + (c.z - cell[2]) ** 2;
    if (d < least) [best, least] = [[c.x, c.y, c.z], d];
  }
  return best;
}

/** The ball sent by a teleporter: a leap in its way, the view cut to it. */
function sent(live, { to }) {
  const b = live.run.ball;
  live.station = true;
  live.still = stateOf(b, live.probe);
  walked(live, { cell: to.cell, face: to.face }, true);
  state.frame = b.frame;
  state.target = [...centreOf(b)];
  if (state.framing === fit) fit();
  status(live, null);
  say(SENT(to.face, to.cell));
  live.redraw = true;
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
function ended(live, code) {
  const { play, turn } = motionTable();
  const { view } = play;
  const run = live.run;
  if (!state.show.playon) run.game = null;
  const w = run.words;
  const settled = conclude(run);
  const next = run.game
    ? pickedLevel(live, nextOf(run.game, run, packCount(live.level.pack)))
    : null;
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
  retire(live);
  live.keeping = false;
  routing(live);
  finishEase();
  state.frame = null;
  fit();
  status(live, verdict(live));
  say(verdict(live));
  live.redraw = true;
  invalidatePick();
}

/** The levels the pack holds, as the data has them. */
const packCount = (pack) => state.data.levels.filter((l) => l.pack === pack).length;

/** The level of the disc at `pick`, a pack and an index, where it is another than the one played,
    else null. */
function pickedLevel(live, pick) {
  if (!pick) return null;
  const l = state.data.levels.find((x) => x.pack === pick.pack && x.index === pick.index);
  return l && l !== live.level ? l : null;
}

/** The death forgiven: the ball put back at rest and the status saying what would have been. */
function forgive(live, name) {
  const b = live.run.ball;
  revive(live.run, refuge(live));
  live.flash = 0;
  live.still = stateOf(b, live.probe);
  live.station = true;
  walked(live, { cell: blockUnder(b), face: faceUnder(b) }, true);
  status(live, FORGIVEN(name));
  say(FORGIVEN(name));
  state.frame = b.frame;
  if (state.framing === fit) fit();
  refreshPanel();
  live.redraw = true;
  invalidatePick();
}

/** The level the game loads after an ending, from its start: the level it picked, another of the
    disc, reached through the viewer's funnel with play kept on, or, where the pick is this level
    or `onward` is off, this one again; the run goes on with the ball, or begins where its setting
    has come on since the ball was put down, the view comes back behind the ball, and a level with
    no start stands the ball on the first face it could, as entering does, or says that it has
    none: whether the ball stands. */
export function startOver(live, { onward = true } = {}) {
  const from = viewNow();
  const went = onward && goOn(live, live.ended?.next);
  const l = went ? state.lvl : live.level;
  const idx = went ? state.idx : live.idx;
  const probe = went ? probeOf(idx) : live.probe;
  const start = startOf(l, probe);
  const where = start ? null : firstStandable(probe);
  if (!start && !where) {
    toast(NOWHERE);
    return false;
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
  routing(live);
  status(live, start ? null : NO_START);
  state.frame = b.frame;
  fit();
  arrive(live, from, () => shown(live).centre, performance.now());
  line(live);
  refreshPanel();
  live.redraw = true;
  invalidatePick();
  say(STARTED(l, went, at.face, at.cell, b.h));
  return true;
}

/** Go on to `next`, a level of the disc, through the viewer's level funnel with play kept on:
    whether the level changed. */
function goOn(live, next) {
  const i = next ? state.data.levels.indexOf(next) : -1;
  if (i < 0 || i === state.li) return false;
  live.changing = true;
  try {
    selectLevel(i);
  } finally {
    live.changing = false;
  }
  return true;
}

/** The game the run plays, where its setting is on and the level is one the game plays a game
    on: `game` carried on, or a fresh one of the level's mode; else none. */
export const gameFor = (l, tables, game = null) =>
  state.show.playon ? gameOf(l, tables, game) : null;
