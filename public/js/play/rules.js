// The game's frame over the ball and the level: the clock, the guard, the wait, the pad and the
// endings, in the order the executable runs them, over pad words from any source.
import { PAD, ballAt, place, read, run } from "./ball.js";
import { worldOf, probeOf, standingOf } from "./world.js";
import { layHeading, startsOf, TANGENT } from "../viewer/data.js";
import { advance } from "../viewer/travel.js";

const BALL = 30;
const KEY = 31;
const SIMON = 1;

const rulesOf = ({ motion, unit, jump }) => ({
  table: motion.types[String(BALL)],
  turn: motion.turn,
  unit,
  jump,
});

/** The start the game takes, as a station, or null. */
function startOf(l) {
  const s = startsOf(l).at(-1);
  return s && { cell: [s.x, s.y, s.z], face: s.face, h: layHeading(s) ?? TANGENT[s.face] };
}

const keysOf = (world) => [...world.pickups.values()].filter((p) => p.m.type === KEY).length;

/** A run of the level from its first frame: the world, the ball at the start the game takes or at
    `at`, and the words the game keeps, as the level's start sets them. */
export function startRun(l, idx, tables, circuits, at = null) {
  const { play, types } = tables.motion;
  const where = at ?? startOf(l);
  if (!where) throw new Error("the level has no start to stand the ball on");
  const world = worldOf(l, idx, tables, circuits);
  const keys = keysOf(world);
  const mode = 0;
  const live = {
    level: l,
    idx,
    tables,
    circuits,
    at,
    world,
    ball: ballAt(rulesOf(tables), where.cell, where.face, where.h),
    words: {
      frame: 0,
      clock: l.time * play.clock.second,
      score: 0,
      keys,
      mode,
      bonus: keys === 0 && mode !== SIMON,
      fruit: 0,
      standing: 0,
      wait: play.start.wait,
      rolled: 0,
      marker: 0,
      dying: 0,
      heat: 0,
      cold: 0,
      melt: 0,
      ending: 0,
      result: 0,
      outcome: 0,
      swell: 0,
      frozen: 0,
      guard: 0,
      send: -1,
      pills: Object.fromEntries(
        Object.entries(types)
          .filter(([, t]) => t.lasts)
          .map(([type]) => [type, -1]),
      ),
      blink: null,
      way: null,
    },
  };
  live.words.standing = standingOf(live);
  return live;
}

/** The level's outcome, which ends the run. */
export function end(live, code, out) {
  const w = live.words;
  if (w.outcome) return;
  w.outcome = code;
  out.push({ ended: { code, score: w.score, clock: w.clock } });
}

// The clock stands on a clock face and in the Simon rooms.
function tick(live, out, ticks) {
  const w = live.words;
  const { clock } = live.tables.motion.play;
  if (w.standing === clock.face || w.mode === SIMON) return;
  w.clock -= ticks;
  if (w.clock <= 0) end(live, clock.out, out);
}

/** Whether the coming frame reads the pad: no wait runs, or the one running runs out as the
    frame begins. */
export const heeds = (live) => live.words.wait <= 1;

// A wait holds the pad off and clears the ball's requests, and as it runs out the ending it was
// set with becomes the result, the spikes' the outcome a frame before that.
function waiting(live, out) {
  const w = live.words;
  const b = live.ball;
  const { ending } = live.tables.motion.play;
  w.wait -= 1;
  b.forward = false;
  b.wantJump = false;
  b.turn = 0;
  if (w.wait === 0) w.result = w.ending;
  else if (w.wait === 1 && w.ending === ending.spikes) end(live, w.ending, out);
}

function movers(live) {
  const { walkers, probe, roll } = live.world;
  advance([...walkers.values()], probe, live.words.frame + 1, roll);
}

// What is under and about the ball, off while the guard stands: a pill that hurries the clock
// ticks it more while its word is not negative.
function hazards(live, out) {
  const { types } = live.tables.motion;
  for (const [type, word] of Object.entries(live.words.pills)) {
    const extra = types[type].lasts.ticks;
    if (extra && word >= 0) tick(live, out, extra);
  }
}

/** One game frame with `pad` as held: what happened, as events. The frame the clock runs out on
    runs to its end, as the game's does, and nothing runs once the outcome stands; the ending's
    view is the mode's. */
export function frame(live, pad) {
  const w = live.words;
  const b = live.ball;
  const out = [];
  if (w.outcome) return out;
  const { start, clock, ending } = live.tables.motion.play;
  const probe = probeOf(live);
  const heard = heeds(live);
  tick(live, out, clock.tick);
  if (w.guard) w.guard = (w.guard + 1) % start.guard;
  if (w.wait > 0) waiting(live, out);
  // Cross held under the guard reads nothing, and a read clears the guard
  if (heard && !(w.guard && pad & PAD.cross)) {
    w.guard = 0;
    b.pad = pad;
    read(b, probe, out);
  }
  if (w.result) end(live, w.result, out);
  movers(live);
  if (!w.guard) hazards(live, out);
  b.frozen = w.frozen !== 0;
  run(b, probe, out);
  w.standing = standingOf(live);
  if (out.some((e) => e.lost)) end(live, ending.lost, out);
  w.frame += 1;
  return out;
}

/** The level loaded again after an ending: a fresh run of it with the guard set, so the pad is
    dead and the hazards off as the game opens a level that follows another, the ball on the
    start or at `at`. */
export function restart(live, at = live.at) {
  const next = startRun(live.level, live.idx, live.tables, live.circuits, at);
  next.words.guard = 1;
  return next;
}

/** The ending undone and the ball placed back on its last rest, the other words kept. */
export function revive(live) {
  const w = live.words;
  const b = live.ball;
  Object.assign(w, {
    outcome: 0,
    result: 0,
    ending: 0,
    wait: 0,
    frozen: 0,
    dying: 0,
    swell: 0,
    heat: 0,
    melt: 0,
    cold: 0,
  });
  stand(live, b.rest);
}

/** Stand the ball at rest on `at`, a station of the level, the words running on. */
export function stand(live, { cell, face, h }) {
  place(live.ball, cell, face, h);
  live.words.standing = standingOf(live);
}

/** The level edited under the run: the world laid anew from it, the walkers at the run's frame,
    and the keys counted again. */
export function relevel(live, l, idx) {
  live.level = l;
  live.idx = idx;
  live.world = worldOf(l, idx, live.tables, live.circuits, live.words.frame);
  live.words.keys = keysOf(live.world);
  live.words.standing = standingOf(live);
}
