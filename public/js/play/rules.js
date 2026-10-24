// The game's frame over the ball and the level: the clock, the guard, the wait, the pad, in the
// Simon rooms one move at a time against the stored sequence, what is under the ball and what it
// takes, in the executable's order, over pad words from any source, the draw's step over the
// screen's words as the pass ends and the effects' run after it, the bursts a pickup and a
// teleporter start, the flash a send and a level with no key start, the blanks a pass waits, the
// view's roll by the pill's word and the invincible ball's glow by its counter.
import {
  JUMP,
  PAD,
  REST,
  ROLLING,
  alight,
  aloft,
  ballAt,
  blockUnder,
  cellOf,
  place,
  read,
  run,
  turning,
} from "./ball.js";
import {
  KEY,
  fell,
  frameShown,
  keysOf,
  marked,
  probeOf,
  shiftOf,
  standingOf,
  took,
  worldOf,
} from "./world.js";
import { contact } from "./contact.js";
import {
  INVINCIBLE,
  boosting,
  broken,
  catching,
  counting,
  crumble,
  devices,
  harms,
  rearm,
  spiked,
} from "./hazards.js";
import {
  FORM,
  SIMON,
  UNASKED,
  copied,
  gameOf,
  modeOf,
  moveOf,
  other,
  startMatch,
  stored,
} from "./game.js";
import { SIDE, cellKey } from "../format/lattice.js";
import { OFF_LATTICE, layHeading, startsOf, TANGENT } from "../viewer/data.js";
import { advance } from "../viewer/travel.js";

const BALL = 30;
const BUTTON = 10;
const PLATFORM = 5;
const CRUMBLING = 6;
const EXIT = 7;
const HIDDEN_EXIT = 26;
const LETHARGY = 32;
const BOUNCY = 33;
const SUNGLASSES = 38;
const OUT = { [EXIT]: "exit", [HIDDEN_EXIT]: "hidden" };

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const lastsOf = (live, type) => live.tables.motion.types[String(type)].lasts;
const flashOf = (live, mode) => live.tables.motion.effects.flash[mode];
const effectsOf = (live) => live.tables.motion.effects;
const effectTable = (live, kind) => effectsOf(live).tables[effectsOf(live).kinds[String(kind)]];

/** The screen's mode word under the lethargy pill: the states its routine runs, in their order. */
export const SCREEN = { off: 0, flash: 1, ghost: 2, end: 3, fade: 4 };

/** The flash's mode word, as its routine takes it: a send's mode, or the opening's mode on a level
    with no key, each naming the table's entry the strength and the step come from. */
export const FLASH = { teleport: "teleport", bonus: "bonus" };

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

// The loader's mode routine: a level with no key, the settings record's hidden flag over that,
// and the Simon rooms over both.
function formOf(l, skins, keys, mode) {
  let form = keys === 0 ? FORM.bonus : FORM.arcade;
  if (l.records.some((r) => r.kind === skins.hidden.kind && r.type === skins.hidden.type))
    form = FORM.hidden;
  if (mode === SIMON) form = FORM.arcade;
  return form;
}

/** A run of the level from its first frame: the world, its fruit placed by the pickups' fruit
    word as `game` carries it, the ball at the start the game takes or at `at`, and the words the
    game keeps as the level loads: the game's mode word for the level, the level's word by
    its keys, its settings record and that mode, that fruit word, the run's bank where the level
    is one the game counts, the flash a level with no key opens in, and the rest as the level's
    start sets them. In a Simon room the run holds a match, `match` where one is carried from a
    round done, its round counted on by one and its count of moves by the table's grow as the
    room's start counts them, and else one as the reset leaves it, which the game's loop runs
    after the start on a load that follows no level or one with no way out, the word `game` keeps
    for it flipped first and given as the turn, the first player's where no game stands. */
export function startRun(l, idx, tables, circuits, at = null, game = null, match = null) {
  const { play, types } = tables.motion;
  const where = at ?? startOf(l);
  if (!where) throw new Error("the level has no start to stand the ball on");
  const world = worldOf(l, idx, tables, circuits, 0, game?.fruit ?? null);
  const keys = keysOf(world);
  const mode = modeOf(l, tables);
  let kept = null;
  if (mode === SIMON) {
    const { simon } = play;
    if (match) {
      kept = match;
      kept.round += 1;
      kept.count += simon.grow;
    } else {
      if (game) game.starter = other(game.starter, simon.players);
      kept = startMatch(simon, game ? game.starter : 0);
    }
  }
  const live = {
    level: l,
    idx,
    tables,
    circuits,
    at,
    game,
    match: kept,
    world,
    ball: ballAt(rulesOf(tables), where.cell, where.face, where.h),
    words: {
      frame: 0,
      clock: l.time * play.clock.second,
      score: 0,
      keys,
      mode,
      form: formOf(l, tables.skins, keys, mode),
      bonus: keys === 0 && mode !== SIMON,
      unmarked: world.counted.size,
      fruit: game?.fruit ?? 0,
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
      pad: 0,
      send: -1,
      screen: SCREEN.off,
      fade: 0,
      flash: 0,
      flashing: null,
      effects: [],
      latch: { up: 0, cross: 0, count: 0 },
      idle: 0,
      index: 0,
      verdict: 0,
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
  if (live.words.form === FORM.bonus) startFlash(live, FLASH.bonus);
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

/** Whether the Simon rooms' verdict becomes the ending as the coming frame begins: one stands
    and the ball rests with no turn running. */
const judged = (live) =>
  live.words.verdict !== 0 && live.ball.state === REST && !turning(live.ball);

/** Whether the coming frame reads the pad: no wait and no self-roll runs, or the one running
    runs out as the frame begins, the ball does not stand on a boost button, and no verdict
    becomes the ending as the frame begins. */
export const heeds = (live) => {
  const w = live.words;
  return w.wait <= 1 && w.rolled <= 1 && w.standing !== BUTTON && !judged(live);
};

// The verdict becomes the ending, the exit's code for the sequence done and the rooms' own code
// for a wrong move, with the rooms' wait, and is cleared; the sequence done passes the turn to the
// other player.
function judge(live) {
  const w = live.words;
  const { ending, wait, simon } = live.tables.motion.play;
  const done = w.verdict === simon.verdict.done;
  w.ending = done ? ending.exit : ending.simon;
  w.wait = wait.simon;
  w.verdict = 0;
  if (done) live.match.turn = other(live.match.turn, simon.players);
}

/** Whether the game moves the ball of itself on the coming frame, whatever the pad: a self-roll
    runs, or the ball stands on a boost button. */
export const drives = (live) => live.words.rolled > 0 || live.words.standing === BUTTON;

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

// A self-roll asks the roll of the ball for the frames its count holds, the turn and the jump
// dropped, and the pad is unread until the count has run out.
function rolled(live) {
  const w = live.words;
  const b = live.ball;
  w.rolled -= 1;
  b.forward = true;
  b.wantJump = false;
  b.turn = 0;
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

// A level with no key marks the block at `cell` once: its points, one off the blocks left, and
// the mark stamped with the frame the draw shows next, the count stepping as the frame ends.
function mark(live, cell, out) {
  const w = live.words;
  const world = live.world;
  const { bonus } = live.tables.motion.play;
  if (!cell.every((v) => v > 0 && v < SIDE)) return;
  const key = cellKey(...cell);
  if (!world.cells.has(key) || world.marked.has(key) || world.kinds.get(key) === bonus.skips)
    return;
  marked(world, key, w.frame);
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
    // the cells about a riding ball are its platform's cells, which hold none of the level's blocks
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

// The pills' words run down in the hazards routine's order, the sunglasses' word starting their
// blink as it runs out, the invincibility pill cutting the bouncy and lethargy pills' short while
// it stands and the lethargy pill hurrying the clock and, found at nothing, asking its screen's
// end.
function pills(live, out) {
  const w = live.words;
  const p = w.pills;
  const lasts = (type) => lastsOf(live, type);
  if (p[SUNGLASSES] >= 0) {
    p[SUNGLASSES] -= lasts(SUNGLASSES).step;
    const { frames, first = frames } = lasts(SUNGLASSES).blink;
    w.blink = p[SUNGLASSES] < 0 ? { spell: 0, left: first } : null;
  } else if (w.blink) blinking(w, lasts(SUNGLASSES).blink);
  if (p[INVINCIBLE] >= 0) p[INVINCIBLE] -= lasts(INVINCIBLE).step;
  if (p[INVINCIBLE] >= 0) {
    if (p[BOUNCY] >= 0) p[BOUNCY] = -1;
    if (p[LETHARGY] < 0) return;
    p[LETHARGY] = 0;
  }
  if (p[LETHARGY] >= 0) {
    if (p[LETHARGY] === 0 && w.screen) w.screen = SCREEN.end;
    p[LETHARGY] -= lasts(LETHARGY).step;
    tick(live, out, lasts(LETHARGY).ticks);
  }
}

/** The game's start of an effect of `kind`: in the world at `at`, a place in the game's units,
    with `light`, the light the contact walk makes from the thing's cell and face, or on the HUD,
    `icon` naming which of the table's points it stands at and `at` the point, or null where the
    map has none for it. Refused, and false, where the kind has no table or the list holds the
    table's most. */
export function startEffect(live, kind, at, { light = null, icon = null } = {}) {
  const { most, particles } = effectsOf(live);
  const list = live.words.effects;
  if (!effectTable(live, kind) || list.length >= most) return false;
  list.push({ kind, at, icon, light, count: 0, slots: Array(particles).fill(0) });
  return true;
}

// The point of the game's HUD a pickup's second effect stands at: the clock's point for the pickup
// that turns the clock, a fruit's icon by its bit, and the key's icon, which the map has no
// point for.
function iconOf({ clock, fruit }, take) {
  if (take.clock) return { icon: "clock", at: clock };
  if (take.fruit) return { icon: "fruit", at: fruit[Math.round(Math.log2(take.fruit))] };
  return { icon: "key", at: null };
}

// A pickup taken starts the kinds the table gives for its type, the HUD kind first where it has
// one, then the world kind at the thing's place with a light from its cell and face.
function burst(live, { key, face, type, at }) {
  const { starts, hud } = effectsOf(live);
  const kinds = starts[String(type)];
  if (!kinds) return;
  if (kinds.hud !== undefined) {
    const { icon, at: point } = iconOf(hud, live.tables.motion.types[String(type)].take);
    startEffect(live, kinds.hud, point, { icon });
  }
  const { x, y, z } = live.idx.cells.get(key);
  startEffect(live, kinds.world, at, { light: { x, y, z, face, colour: [0, 0, 0] } });
}

// The effects' run: an effect at its table's frames is dropped, its light with it, and each
// other draws the row of its frame count, a particle's angle below nothing drawn from the dice
// into its slot and a world effect's light coloured by the sum of its particles' colours, each
// byte times the brightness over the table's divisor, and counts on.
function runEffects(live) {
  const { sprites, light } = effectsOf(live);
  const { turn } = live.tables.motion;
  const list = live.words.effects;
  for (let i = 0; i < list.length;) {
    const e = list[i];
    const { frames, rows } = effectTable(live, e.kind);
    if (e.count >= frames) {
      list.splice(i, 1);
      continue;
    }
    const row = rows[e.count];
    row.forEach(([, angle], k) => {
      if (angle < 0) e.slots[k] = live.world.roll(turn);
    });
    if (e.light)
      e.light.colour = row.reduce(
        (sum, [sprite, , , brightness]) =>
          sum.map(
            (v, ch) => v + Math.floor((sprites.colours[sprite][ch] * brightness) / light.over),
          ),
        [0, 0, 0],
      );
    e.count += 1;
    i += 1;
  }
}

/** The particles the pass drew, for the frame: each its sprite, its angle, the slot's draw with
    the row's run on from it, its size and its brightness, and where its effect stands, `at` a
    place in the game's units for a world effect, or for one on the HUD a point of the game's
    screen, or null where the map has none, with `icon` naming which of the table's points it
    is. */
export function particlesOf(live) {
  return live.words.effects.flatMap((e) => {
    const row = effectTable(live, e.kind).rows[e.count - 1] ?? [];
    return row.map(([sprite, angle, size, brightness], k) => ({
      sprite,
      angle: e.slots[k] + Math.max(angle, 0),
      size,
      brightness,
      at: e.at,
      icon: e.icon,
    }));
  });
}

/** The lights the world's effects cast this pass, each from the pickup's cell and face in the
    colour its particles summed to. */
export const effectLights = (live) => live.words.effects.filter((e) => e.light).map((e) => e.light);

/** The game's start of the flash in `mode`: the strength its table's entry gives, which the draw
    steps as each pass ends. */
function startFlash(live, mode) {
  const w = live.words;
  w.flashing = mode;
  w.flash = flashOf(live, mode).from;
}

/** The draw's step over the screen's words, run as each pass ends, the ending's view's passes
    included, and the effects' run after it: the pill's own pass moves its mode on to the ghost,
    the end's pass lays the fade's level from the table and moves on, each pass after takes the
    table's step off the level, and the level below nothing clears the mode; the flash wanes by
    its mode's step while it stands and is cleared below nothing; and every effect draws its row
    and counts on. */
export function drawn(live) {
  const w = live.words;
  const { fade } = lastsOf(live, LETHARGY).screen;
  if (w.screen === SCREEN.flash) w.screen = SCREEN.ghost;
  else if (w.screen === SCREEN.end) {
    w.screen = SCREEN.fade;
    w.fade = fade.from;
  } else if (w.screen === SCREEN.fade) {
    w.fade -= fade.by;
    if (w.fade < 0) {
      w.screen = SCREEN.off;
      w.fade = 0;
    }
  }
  if (w.flash > 0) {
    w.flash = Math.max(0, w.flash - flashOf(live, w.flashing).step);
    if (w.flash === 0) w.flashing = null;
  }
  runEffects(live);
}

/** The blanks the frame loop waits before a pass, by the words as the pass before left them: the
    pill's while the screen's mode stands, the teleport's while its flash does, else one; the
    opening's flash waits none. */
export function blanksOf(live) {
  const w = live.words;
  if (w.screen) return lastsOf(live, LETHARGY).blanks;
  if (w.flashing === FLASH.teleport) return flashOf(live, w.flashing).blanks;
  return 1;
}

/** The view's roll under the lethargy pill, in `turn`ths of a turn, by the pill's `word` as the
    hazards leave it: the sine, in the turn's own units, of the word times the table's scale
    taken modulo a turn, shifted down by the table's shift and rounded toward nothing; nothing
    while the word is not positive. */
export function rockOf(word, { scale, shift }, turn) {
  if (word <= 0) return 0;
  const sine = Math.round(turn * Math.sin((((word * scale) % turn) / turn) * 2 * Math.PI));
  return Math.trunc(sine / 2 ** shift);
}

/** The invincible ball's glow by the counter the ball's draw steps, in the sine's units, the
    turn's one at a quarter turn: each channel raised by the table's gain times the sine of the
    counter less the channel's start while that angle lies within a turn, and nothing outside
    it. */
export function glowOf(counter, { gain, from }, turn) {
  return from.map((start) => {
    const angle = counter - start;
    if (angle < 0 || angle >= turn) return 0;
    return gain * Math.round(turn * Math.sin((angle / turn) * 2 * Math.PI));
  });
}

/** The glow's counter stepped as the ball's draw steps it: by the table's step, round its round. */
export const glowStep = (counter, { step, round }) => (counter + step) % round;

// The blink's spells run on from the word's end, off first, the first spell at the table's own length,
// and the flag stays off after the last.
function blinking(w, { times, frames }) {
  const b = w.blink;
  b.left -= 1;
  if (b.left > 0) return;
  w.blink = b.spell + 1 < times ? { spell: b.spell + 1, left: frames } : null;
}

/** Whether every invisible block is seen this frame: the sunglasses' word stands, or their blink
    is in an on spell. */
export const seeing = (live) =>
  live.words.pills[SUNGLASSES] >= 0 || (live.words.blink?.spell ?? 0) % 2 === 1;

// What is under and about the ball, off while the guard stands, in the routine's order.
function hazards(live, out) {
  harms(live, out);
  if (!aloft(live.ball)) {
    ground(live, out);
    broken(live);
    spiked(live, out);
    boosting(live, out);
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

/** The bouncy pill's reading of Up and Cross, one frame, over `latch`, the three words it writes,
    by `lasts`, the pill's entry: Up held sets the Up latch and Cross held the Cross latch, the
    count steps while either stands and is put at nothing otherwise, and until it reaches the
    pill's `latch` nothing more is read; from there the roll's request is the Up latch, the long
    jump is armed where both latches stand with the ball's `long` at nothing and its `state` not
    the forward jump's state, and both latches are cleared with the count kept. The jump is asked
    whatever the keys. */
export function latched(latch, pad, lasts, { long, state }) {
  if (pad & PAD.up) latch.up = 1;
  if (pad & PAD.cross) latch.cross = 1;
  latch.count = latch.up || latch.cross ? latch.count + 1 : 0;
  if (latch.count < lasts.latch) return { forward: false, jump: true, arm: false };
  const both = latch.up === 1 && latch.cross === 1;
  const asked = { forward: latch.up === 1, jump: true, arm: both && !long && state !== JUMP };
  latch.up = 0;
  latch.cross = 0;
  return asked;
}

// The Simon rooms' pad: the requests as the rooms' reading gives them, the side rule over the
// roll as the pad's reading applies it, and a move left packed and held to the sequence.
function copy(live, pad, probe, out) {
  const w = live.words;
  const b = live.ball;
  const { simon } = live.tables.motion.play;
  const asked = copied(w, pad, simon, b);
  read(b, probe, out, asked ?? UNASKED);
  if (!asked) return;
  const move = moveOf(b, simon.bits);
  if (move) stored(w, live.match, move, simon);
}

// The jump the pad asks under the bouncy pill never reaches a rolling ball: while the word is at
// the hold or more and the ball rolls, both requests are dropped and the word grows by one.
function held(live) {
  const w = live.words;
  const b = live.ball;
  if (w.pills[BOUNCY] < lastsOf(live, BOUNCY).hold || b.state !== ROLLING) return;
  b.forward = false;
  b.wantJump = false;
  w.pills[BOUNCY] += 1;
}

/** One game frame with `pad` as held: what happened, as events. The frame the clock runs out on
    runs to its end, as the game's does, the crumbling blocks breaking up and the screen's words
    stepping last as the draw runs them, and nothing runs once the outcome stands; the ending's
    view is the one the mode gives. */
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
  if (judged(live)) judge(live);
  if (w.wait > 0) waiting(live, out);
  if (w.rolled > 0) rolled(live);
  if (heard) {
    const bounding = w.pills[BOUNCY] >= 0;
    // the pill asks the jump before the guard's test, which with Cross held reads nothing more,
    // and a read clears the guard
    if (!(w.guard && pad & PAD.cross)) {
      w.guard = 0;
      b.previous = w.pad;
      b.pad = pad;
      if (w.mode === SIMON) copy(live, pad, probe, out);
      else {
        const asked = bounding ? latched(w.latch, pad, lastsOf(live, BOUNCY), b) : undefined;
        read(b, probe, out, asked);
        if (asked?.arm) b.long = b.table.jump.arm;
      }
    } else if (bounding) b.wantJump = true;
  }
  // the frame's word is kept, read or not, as what the next read judges a press against
  w.pad = pad;
  held(live);
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
  // the bursts, the teleporter's burst as its count starts and a pickup's burst as it is taken, and
  // the flash as a send lands the ball
  for (const e of out) {
    if (e.took) burst(live, e.took);
    else if (e.sending) {
      const { teleport, hud } = effectsOf(live);
      startEffect(live, teleport.hud, hud.teleport, { icon: "teleport" });
    } else if (e.sent) startFlash(live, FLASH.teleport);
  }
  if (out.some((e) => e.pill?.type === LETHARGY)) w.screen = SCREEN.flash;
  if (out.some((e) => e.lost)) end(live, ending.lost, out);
  crumble(live, out);
  drawn(live);
  w.frame += 1;
  return out;
}

/** The level the game loads after an ending, this one again or `level` at `idx`: a fresh run of
    it with the guard set, so the pad is dead and the hazards off as the game opens a level that
    follows another, the ball on the start or at `at`, the game carried on, or started afresh
    where its total is below nothing, which is the game's end, and the match carried on where
    the level had a way out, or reset where it had not, as the game's loop resets it after the
    start. */
export function restart(live, at = live.at, { level = live.level, idx = live.idx } = {}) {
  const game = live.game && live.game.total < 0 ? gameOf(level, live.tables) : live.game;
  const match = live.words.outcome > 0 ? live.match : null;
  const next = startRun(level, idx, live.tables, live.circuits, at, game, match);
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
  const fruit = live.game?.fruit ?? null;
  const world = worldOf(l, idx, live.tables, live.circuits, live.words.frame, fruit);
  for (const slot of was.taken)
    if (world.pickups.get(slot)?.m.type === was.pickups.get(slot).m.type) took(world, slot);
  for (const [key, at] of was.marked) if (world.cells.has(key)) marked(world, key, at);
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
