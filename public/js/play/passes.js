import { TYPE } from "../format/lattice.js";
// The draw's passes over the game's words: the step over the screen's words as each pass ends and
// the effects' run after it, the bursts a pickup and a teleporter start, the flash a send and a
// level with no key start, the blanks a pass waits, the view's roll by the pill's word, the
// invincible ball's glow by its counter and the sunglasses' blink, which says whether every
// invisible block is seen.

export const lastsOf = (live, type) => live.tables.motion.types[String(type)].lasts;
const flashOf = (live, mode) => live.tables.motion.effects.flash[mode];
export const effectsOf = (live) => live.tables.motion.effects;
const effectTable = (live, kind) => effectsOf(live).tables[effectsOf(live).kinds[String(kind)]];

/** The screen's mode word under the lethargy pill: the states its routine runs, in their order. */
export const SCREEN = { off: 0, flash: 1, ghost: 2, end: 3, fade: 4 };

/** The flash's mode word, as its routine takes it: a send's mode, or the opening's mode on a level
    with no key, each naming the table's entry the strength and the step come from. */
export const FLASH = { teleport: "teleport", bonus: "bonus" };

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
export function burst(live, { key, face, type, at }) {
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
export function startFlash(live, mode) {
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
  const { fade } = lastsOf(live, TYPE.LETHARGY_PILL).screen;
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
  if (w.screen) return lastsOf(live, TYPE.LETHARGY_PILL).blanks;
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
export function blinking(w, { times, frames }) {
  const b = w.blink;
  b.left -= 1;
  if (b.left > 0) return;
  w.blink = b.spell + 1 < times ? { spell: b.spell + 1, left: frames } : null;
}

/** Whether every invisible block is seen this frame: the sunglasses' word stands, or their blink
    is in an on spell. */
export const seeing = (live) =>
  live.words.pills[TYPE.SUNGLASSES] >= 0 || (live.words.blink?.spell ?? 0) % 2 === 1;
