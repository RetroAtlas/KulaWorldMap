// The game's frame over the ball and the level: the clock, the guard, the wait, the pad, what is
// under the ball and what it takes, in the executable's order, over pad words from any source.
import { PAD, alight, aloft, ballAt, blockUnder, cellOf, place, read, run } from "./ball.js";
import {
  KEY,
  fell,
  frameShown,
  keysOf,
  probeOf,
  shiftOf,
  standingOf,
  took,
  worldOf,
} from "./world.js";
import { contact } from "./contact.js";
import {
  INVINCIBLE,
  broken,
  catching,
  counting,
  crumble,
  devices,
  harms,
  rearm,
  spiked,
} from "./hazards.js";
import { SIDE, cellKey } from "../format/lattice.js";
import { OFF_LATTICE, layHeading, startsOf, TANGENT } from "../viewer/data.js";
import { advance } from "../viewer/travel.js";

const BALL = 30;
const PLATFORM = 5;
const CRUMBLING = 6;
const SIMON = 1;
const EXIT = 7;
const HIDDEN_EXIT = 26;
const LETHARGY = 32;
const BOUNCY = 33;
const SUNGLASSES = 38;
const OUT = { [EXIT]: "exit", [HIDDEN_EXIT]: "hidden" };

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);

const rulesOf = ({ motion, unit, jump }) => ({
  table: motion.types[String(BALL)],
  turn: motion.turn,
  unit,
  jump,
  edge: motion.kinds[String(CRUMBLING)].edge,
  ride: motion.kinds[String(PLATFORM)].ride,
});

/** The start the game takes, as a station, or null. */
function startOf(l) {
  const s = startsOf(l).at(-1);
  return s && { cell: [s.x, s.y, s.z], face: s.face, h: layHeading(s) ?? TANGENT[s.face] };
}

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
      unmarked: world.counted.size,
      fruit: 0,
      standing: 0,
      cell: OFF_LATTICE,
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
  readCells(live);
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
  counting(live);
  if (w.wait === 0) w.result = w.ending;
  else if (w.wait === 1 && w.ending === ending.spikes) end(live, w.ending, out);
}

// The walkers take a frame, the captivators standing while the ball is caught.
function movers(live) {
  const { walkers, probe, roll } = live.world;
  const { ending } = live.tables.motion.play;
  const to = live.words.frame + 1;
  const all = [...walkers.values()];
  const caught = live.words.ending === ending.captivator;
  advance(caught ? all.filter((w) => w.type === null) : all, probe, to, roll);
  if (caught) for (const w of all) w.at = to;
}

// A riding ball's travel is its platform's shift, taken afresh as the hazards end, so the beam is
// read at the cell the last frame's travel gave.
function carried(live) {
  const b = live.ball;
  if (b.riding) b.travel = shiftOf(live.world, b.riding.key);
}

// A level with no key marks the block at `cell` once: its points, and one off the blocks left.
function mark(live, cell, out) {
  const w = live.words;
  const world = live.world;
  const { bonus } = live.tables.motion.play;
  if (!cell.every((v) => v > 0 && v < SIDE)) return;
  const key = cellKey(...cell);
  if (!world.cells.has(key) || world.marked.has(key) || world.kinds.get(key) === bonus.skips)
    return;
  world.marked.add(key);
  w.unmarked -= 1;
  w.score += bonus.block;
  out.push({ marked: { key, left: w.unmarked } });
}

// A level with no key ends with its last block marked, any other by the exit the ball stands on
// with no key left: at once on a landing, else as an ending with its wait.
function ground(live, out) {
  const w = live.words;
  const b = live.ball;
  const { ending, wait } = live.tables.motion.play;
  if (w.bonus) {
    // the cells about a riding ball are its platform's, which hold no block of the level's
    if (!b.riding) mark(live, cellOf(b, add(b.pos, b.n, -(b.half + b.radius))), out);
    if (w.unmarked !== 0) return;
    if (b.landed) end(live, ending.bonus, out);
    else if (w.wait === 0) Object.assign(w, { ending: ending.bonus, wait: wait.bonus });
    return;
  }
  const way = OUT[w.standing];
  if (!way || w.keys !== 0) return;
  if (b.landed) w.result = ending[way];
  else if (w.wait === 0) Object.assign(w, { ending: ending[way], wait: wait[way] });
}

// The pills' words run down in the hazards routine's order, the invincibility pill cutting the
// bouncy and lethargy pills' short while it stands and the lethargy pill hurrying the clock.
function pills(live, out) {
  const p = live.words.pills;
  const { types } = live.tables.motion;
  const lasts = (type) => types[String(type)].lasts;
  if (p[SUNGLASSES] >= 0) p[SUNGLASSES] -= lasts(SUNGLASSES).step;
  if (p[INVINCIBLE] >= 0) p[INVINCIBLE] -= lasts(INVINCIBLE).step;
  if (p[INVINCIBLE] >= 0) {
    if (p[BOUNCY] >= 0) p[BOUNCY] = -1;
    if (p[LETHARGY] < 0) return;
    p[LETHARGY] = 0;
  }
  if (p[LETHARGY] >= 0) {
    p[LETHARGY] -= lasts(LETHARGY).step;
    tick(live, out, lasts(LETHARGY).ticks);
  }
}

// What is under and about the ball, off while the guard stands, in the routine's order.
function hazards(live, out) {
  harms(live, out);
  if (!aloft(live.ball)) {
    ground(live, out);
    broken(live);
    spiked(live, out);
  }
  pills(live, out);
  devices(live, out);
  carried(live);
}

/** What the game's read of the cells about the ball leaves for the next frame's hazards: the
    word for what the ball stands on and the word its own cell holds. */
function readCells(live) {
  const w = live.words;
  w.standing = standingOf(live);
  w.cell = live.world.probe.value(cellOf(live.ball), frameShown(live));
}

/** One game frame with `pad` as held: what happened, as events. The frame the clock runs out on
    runs to its end, as the game's does, the crumbling blocks breaking up last as the draw runs
    them, and nothing runs once the outcome stands; the ending's view is the mode's. */
export function frame(live, pad) {
  const w = live.words;
  const b = live.ball;
  const out = [];
  if (w.outcome) return out;
  const { start, clock, ending } = live.tables.motion.play;
  const probe = probeOf(live);
  probe.stood = () => {
    readCells(live);
    rearm(live);
  };
  const heard = heeds(live);
  tick(live, out, clock.tick);
  if (w.guard) w.guard = (w.guard + 1) % start.guard;
  if (w.wait > 0) waiting(live, out);
  if (heard) {
    // Cross held under the guard reads nothing, and a read clears the guard
    if (!(w.guard && pad & PAD.cross)) {
      w.guard = 0;
      b.pad = pad;
      read(b, probe, out);
    }
    if (w.pills[BOUNCY] >= 0) b.wantJump = true;
  }
  if (w.result) end(live, w.result, out);
  movers(live);
  if (!w.guard) hazards(live, out);
  if (w.pills[INVINCIBLE] < 0) catching(live, out);
  b.frozen = w.frozen !== 0;
  b.way = w.way;
  // the block ahead of the one under the ball, which a climb marks as the block under its wall
  const ahead = add(blockUnder(b), b.h);
  run(b, probe, out);
  w.way = b.way;
  if (w.bonus && out.some((e) => e.face === "climb")) mark(live, ahead, out);
  if (!w.guard) contact(live, out);
  if (out.some((e) => e.lost)) end(live, ending.lost, out);
  crumble(live, out);
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

/** The ending undone and the ball placed back at rest, on `at` or its last rest, the other words
    kept. */
export function revive(live, at = live.ball.rest) {
  const w = live.words;
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
    way: null,
  });
  stand(live, at);
}

/** Stand the ball at rest on `at`, a station of the level, the words running on. */
export function stand(live, { cell, face, h }) {
  place(live.ball, cell, face, h);
  readCells(live);
}

/** The level edited under the run: the world laid anew from it, the walkers at the run's frame,
    what was taken, marked and gone carried where it still names the same thing, and the keys
    and the blocks left counted again. */
export function relevel(live, l, idx) {
  const was = live.world;
  live.level = l;
  live.idx = idx;
  const world = worldOf(l, idx, live.tables, live.circuits, live.words.frame);
  for (const slot of was.taken)
    if (world.pickups.get(slot)?.m.type === was.pickups.get(slot).m.type) took(world, slot);
  for (const key of was.marked) if (world.cells.has(key)) world.marked.add(key);
  for (const key of was.gone) if (world.crumbling.has(key)) fell(world, key);
  live.world = world;
  const b = live.ball;
  if (b.riding) {
    if (world.platforms.has(b.riding.key)) b.travel = shiftOf(world, b.riding.key);
    else alight(b);
  }
  const w = live.words;
  const takenKeys = [...world.taken].filter((s) => world.pickups.get(s).m.type === KEY).length;
  w.keys = keysOf(world) - takenKeys;
  w.unmarked = world.counted.size - world.marked.size;
  readCells(live);
}
