import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { cellKey } from "../../public/js/format/lattice.js";
import { fieldIndex, index } from "../../public/js/viewer/data.js";
import { dice } from "../../public/js/viewer/travel.js";
import { PAD, blockUnder } from "../../public/js/play/ball.js";
import {
  FLASH,
  SCREEN,
  blanksOf,
  drawn,
  effectLights,
  end,
  frame,
  glowOf,
  glowStep,
  particlesOf,
  relevel,
  restart,
  rockOf,
  settle,
  startEffect,
  startGame,
} from "../../public/js/play/rules.js";
import {
  HOURGLASS,
  INVINCIBLE,
  KEY,
  LETHARGY,
  TOP,
  UNIT,
  begin,
  counted,
  level,
  motion,
  object,
  pill,
  play,
  row,
  settings,
  shows,
  start,
  steps,
  taken,
  takes,
  until,
} from "./rules-level.js";

const TELEPORTER = 5;

const LETHARGIC = motion.types[LETHARGY].lasts;

const TELEPORT_FLASH = motion.effects.flash.teleport;

const OPENING_FLASH = motion.effects.flash.bonus;

/** The passes the screen's mode stands after the pill's own pass: the word's passes, the end's
    pass, the fade's passes and the one that clears it. */
const SLOWED =
  LETHARGIC.word / LETHARGIC.step + 1 + LETHARGIC.screen.fade.from / LETHARGIC.screen.fade.by + 1;

const FLASHED = shows(TELEPORT_FLASH);

const OPENED = shows(OPENING_FLASH);

/** The strengths a flash shows on those passes, each the one before less the step. */
const waning = ({ from, step }, passes) =>
  Array.from({ length: passes }, (_, k) => from - step * (k + 1));

/** The screen's words as each pass of the fade leaves them, from the end's pass to the one that
    clears the mode. */
const FADING = [
  ...Array.from({ length: LETHARGIC.screen.fade.from / LETHARGIC.screen.fade.by + 1 }, (_, k) => [
    SCREEN.fade,
    LETHARGIC.screen.fade.from - LETHARGIC.screen.fade.by * k,
  ]),
  [SCREEN.off, 0],
];

const ROCK = LETHARGIC.rock;

/** The roll's angle the table predicts for the pill's word, in the turn's units. */
const rock = (word) => rockOf(word, ROCK, motion.turn);

/** The angles over the passes the word is positive, the pill's own pass first. */
const WAVE = Array.from({ length: LETHARGIC.word / LETHARGIC.step }, (_, k) =>
  rock(LETHARGIC.word - LETHARGIC.step * k),
);

/** The passes one wave of the roll takes: the word's step times the scale, into a turn. */
const CYCLE = motion.turn / (ROCK.scale * LETHARGIC.step);

const GLOW = motion.types[INVINCIBLE].lasts.glow;

/** The glow's three raises the table predicts for a counter, in the sine's units. */
const glowAt = (counter) => glowOf(counter, GLOW, motion.turn);

/** A channel's raise a quarter turn on from its start, the gain times the sine's one. */
const PEAK = GLOW.gain * motion.turn;

const QUARTER = motion.turn / 4;

/** The steps a round of the counter takes, and how far along it lands after one. */
const ROUND = Math.ceil(GLOW.round / GLOW.step);

const ALONG = ROUND * GLOW.step - GLOW.round;

// The five fruit by their bits, as the loader checks them.
const FRUITS = Object.entries(motion.types)
  .filter(([, entry]) => entry.take?.fruit)
  .sort(([, a], [, b]) => a.take.fruit - b.take.fruit)
  .map(([type]) => Number(type));

const EFFECTS = motion.effects;

const COIN = 37;

const FIRST_FRUIT = 43;

const effectTable = (kind) => EFFECTS.tables[EFFECTS.kinds[String(kind)]];

/** A pickup of `type` on the top of the row's block at `y`. */
const pickup = (y, type) => pill(y, type);

/** Each particle of the row as the frame reads it, with the effect at `at` and `icon`. */
const rowOf = (row, at, icon = null, slots = [0, 0]) =>
  row.map(([sprite, angle, size, brightness], k) => ({
    sprite,
    angle: slots[k] + Math.max(angle, 0),
    size,
    brightness,
    at,
    icon,
  }));

/** The light's colour the reading's arithmetic gives a row: each byte times the brightness over
    the table's divisor, summed over the particles. */
const colourOf = (row) =>
  row.reduce(
    (sum, [sprite, , , brightness]) =>
      sum.map(
        (v, ch) =>
          v + Math.floor((EFFECTS.sprites.colours[sprite][ch] * brightness) / EFFECTS.light.over),
      ),
    [0, 0, 0],
  );

test("the lethargy pill halves the pace from the frame after its take: every pass waits the table's blanks while the screen's mode stands, through the word's passes, the end's pass and the fade's passes, and one blank again after", () => {
  const live = begin(level(row(2, 18), [start(), pill(16, Number(LETHARGY))]));
  const w = live.words;
  assert.equal(w.screen, SCREEN.off);
  let took = false;
  for (let i = 0; i < 400 && !took; i++) {
    assert.equal(blanksOf(live), 1, "one blank before every frame to the take's");
    took = taken(frame(live, PAD.up), Number(LETHARGY));
  }
  assert.ok(took);
  assert.equal(w.screen, SCREEN.ghost, "the pill's own pass moved the mode on");
  const seen = [];
  for (let i = 0; i < SLOWED; i++) {
    assert.equal(blanksOf(live), LETHARGIC.blanks, `pass ${i + 1} after the pill's`);
    frame(live, 0);
    seen.push([w.screen, w.fade]);
  }
  assert.deepEqual(seen, [
    ...Array(LETHARGIC.word / LETHARGIC.step).fill([SCREEN.ghost, 0]),
    ...FADING,
  ]);
  assert.equal(blanksOf(live), 1, "one blank again");
  frame(live, 0);
  assert.equal(blanksOf(live), 1);
});

test("an invincibility pill taken while the mode stands brings the end forward: the pass after lays the fade, which runs its passes at the table's blanks, and then a pass waits one blank again", () => {
  const live = begin(
    level(row(2, 18), [start(), pill(16, Number(LETHARGY)), pill(14, Number(INVINCIBLE))]),
  );
  const w = live.words;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(LETHARGY))));
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(INVINCIBLE))));
  assert.equal(w.screen, SCREEN.ghost);
  assert.ok(w.pills[LETHARGY] > 0, "the word still running");
  const seen = [];
  for (let i = 0; i < FADING.length; i++) {
    assert.equal(blanksOf(live), LETHARGIC.blanks, `pass ${i + 1} after the pill's`);
    frame(live, 0);
    seen.push([w.screen, w.fade]);
  }
  assert.deepEqual(seen, FADING);
  assert.equal(blanksOf(live), 1);
});

test("a teleport's send starts the flash in the teleport's mode at the table's strength, which the draw steps once a pass: the strength shows on the derived passes after the send's pass, each waiting the flash's blanks, and is gone with one blank from the next", () => {
  const port = (x, y, facing, to) => {
    const o = object(0, TELEPORTER, facing, 1);
    o.f[fieldIndex("f7")] = to * 16;
    return { x, y, z: 17, kind: 0, on: [o] };
  };
  const l = level(
    [...row(10, 18), [20, 12, 17], [20, 13, 17], [20, 14, 17]],
    [start(), port(17, 15, 0, 2), port(20, 12, 1, 1)],
  );
  const live = begin(l);
  const w = live.words;
  assert.deepEqual([w.flashing, w.flash], [null, 0]);
  assert.equal(blanksOf(live), 1);
  assert.ok(until(live, PAD.up, (_, events) => events.some((e) => e.sent)));
  assert.deepEqual(blockUnder(live.ball), [20, 12, 17]);
  assert.equal(w.flashing, FLASH.teleport);
  assert.equal(
    w.flash,
    TELEPORT_FLASH.from - TELEPORT_FLASH.step,
    "stepped once by the send's own pass",
  );
  const seen = [];
  for (let i = 0; i < FLASHED; i++) {
    assert.equal(blanksOf(live), TELEPORT_FLASH.blanks, `pass ${i + 1} after the send's`);
    seen.push(w.flash);
    frame(live, 0);
  }
  assert.deepEqual(seen, waning(TELEPORT_FLASH, FLASHED));
  assert.ok(seen.at(-1) > 0, "shown on the last pass");
  assert.deepEqual([w.flashing, w.flash], [null, 0]);
  assert.equal(blanksOf(live), 1);
  frame(live, 0);
  assert.equal(blanksOf(live), 1);
});

test("a level with no key opens in the flash in the opening's mode at the table's strength and at full pace: every pass of the derived count waits one blank and shows the strength waning by the step, which is gone after; a level with a key, a hidden level and a Simon room open with none, and a restart opens from white again", () => {
  const live = begin(level(row(10, 18), [start()], 99, false));
  const w = live.words;
  assert.deepEqual([w.flashing, w.flash], [FLASH.bonus, OPENING_FLASH.from]);
  const seen = [];
  for (let i = 0; i < OPENED; i++) {
    assert.equal(blanksOf(live), 1, `pass ${i + 1} of the opening`);
    frame(live, 0);
    seen.push(w.flash);
  }
  assert.deepEqual(seen, waning(OPENING_FLASH, OPENED));
  assert.ok(seen.at(-1) > 0, "shown on the last pass");
  assert.equal(blanksOf(live), 1);
  frame(live, 0);
  assert.deepEqual([w.flashing, w.flash], [null, 0]);
  for (const other of [
    begin(level(row(10, 18), [start()])),
    begin(level(row(10, 18), [start(), settings(objects.skins.hidden.type)], 99, false)),
    begin({ ...level(row(10, 18), [start()], 99, false), pack: objects.skins.copycat }),
  ])
    assert.deepEqual([other.words.flashing, other.words.flash], [null, 0]);
  const again = restart(live);
  assert.deepEqual([again.words.flashing, again.words.flash], [FLASH.bonus, OPENING_FLASH.from]);
});

test("a run and a restart of a level with a key start the screen's mode, its fade and the flash at nothing", () => {
  const live = begin(level(row(2, 18), [start(), pill(16, Number(LETHARGY))]));
  const w = live.words;
  assert.deepEqual([w.screen, w.fade, w.flashing, w.flash], [SCREEN.off, 0, null, 0]);
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(LETHARGY))));
  Object.assign(w, { flashing: FLASH.teleport, flash: TELEPORT_FLASH.from });
  assert.equal(blanksOf(live), LETHARGIC.blanks);
  const again = restart(live);
  const a = again.words;
  assert.deepEqual([a.screen, a.fade, a.flashing, a.flash], [SCREEN.off, 0, null, 0]);
  assert.equal(blanksOf(again), 1);
});

test("the draw's step alone, as the ending's view runs it, keeps the ghost standing with no hazards to end it, wanes the flash to nothing and runs an asked end through the fade", () => {
  const live = begin(level(row(2, 18), [start(), pill(16, Number(LETHARGY))]));
  const w = live.words;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(LETHARGY))));
  Object.assign(w, { flashing: FLASH.teleport, flash: TELEPORT_FLASH.from });
  for (let i = 0; i < SLOWED; i++) drawn(live);
  assert.equal(w.screen, SCREEN.ghost);
  assert.deepEqual([w.flashing, w.flash], [null, 0]);
  assert.equal(blanksOf(live), LETHARGIC.blanks);
  w.screen = SCREEN.end;
  const seen = [];
  for (let i = 0; i < FADING.length; i++) {
    drawn(live);
    seen.push([w.screen, w.fade]);
  }
  assert.deepEqual(seen, FADING);
  assert.equal(blanksOf(live), 1);
});

test("the view's roll is nothing while the pill's word is not positive, and over the word's passes never above the sine's one shifted down by the table's shift either way, which it reaches both ways", () => {
  for (const word of [0, -1, -LETHARGIC.step, -LETHARGIC.word]) assert.equal(rock(word), 0);
  const most = motion.turn / 2 ** ROCK.shift;
  assert.ok(WAVE.every((a) => Number.isInteger(a) && Math.abs(a) <= most));
  assert.equal(Math.max(...WAVE), most);
  assert.equal(Math.min(...WAVE), -most);
});

test("the roll's first angle, at the pill's own word, is negative, the sine of five eighths of a turn shifted down and rounded toward nothing rather than down", () => {
  const sine = Math.round(-motion.turn * Math.SQRT1_2);
  assert.ok(WAVE[0] < 0);
  assert.equal(WAVE[0], Math.trunc(sine / 2 ** ROCK.shift));
  assert.notEqual(WAVE[0], Math.floor(sine / 2 ** ROCK.shift));
});

test("the roll runs a cycle every 32 passes, one wave through both extremes, as the word comes down by its step", () => {
  assert.equal(CYCLE, 32);
  for (let i = CYCLE; i < WAVE.length; i++) assert.equal(WAVE[i], WAVE[i - CYCLE], `pass ${i}`);
  const first = WAVE.slice(0, CYCLE);
  assert.ok(first.includes(Math.max(...WAVE)) && first.includes(Math.min(...WAVE)));
  assert.ok(new Set(first).size > CYCLE / 2);
});

test("frame by frame the view reads the word the hazards leave: the pill's own pass rolls by the first angle, each pass after by the next, and from the pass the word runs out on the roll is nothing", () => {
  const live = begin(level(row(2, 18), [start(), pill(16, Number(LETHARGY))]));
  const w = live.words;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(LETHARGY))));
  const seen = [rock(w.pills[LETHARGY])];
  for (let i = 0; i < WAVE.length + 3; i++) {
    frame(live, 0);
    seen.push(rock(w.pills[LETHARGY]));
  }
  assert.deepEqual(seen, [...WAVE, 0, 0, 0, 0]);
  assert.ok(w.pills[LETHARGY] < 0, "the word has run out");
});

test("the glow is nothing at the red window's start, the gain times the sine's one a quarter turn on from each channel's start and its negative three quarters on, one channel falling as the next rises", () => {
  assert.deepEqual(glowAt(GLOW.from[0]), [0, 0, 0]);
  assert.deepEqual(glowAt(GLOW.from[0] + QUARTER), [PEAK, 0, 0]);
  assert.deepEqual(glowAt(GLOW.from[1] + QUARTER), [-PEAK, PEAK, 0]);
  assert.deepEqual(glowAt(GLOW.from[2] + QUARTER), [0, -PEAK, PEAK]);
  assert.deepEqual(glowAt(GLOW.from[2] + 3 * QUARTER), [0, 0, -PEAK]);
});

test("the windows are as the listing compares them: red through the turn from the counter's start, green and blue from one past their starts through the turn, where the sine at the start is nothing anyway, and the counter's wrap closes the blue window", () => {
  const { turn } = motion;
  const [red, green, blue] = GLOW.from;
  const inside = (counter, ch) => assert.notEqual(glowAt(counter)[ch], 0, `${counter} in ${ch}`);
  const outside = (counter, ch) => assert.equal(glowAt(counter)[ch], 0, `${counter} out of ${ch}`);
  inside(red + 1, 0);
  inside(red + turn - 1, 0);
  outside(red + turn, 0);
  outside(green, 1);
  inside(green + 1, 1);
  inside(green + turn - 1, 1);
  outside(green + turn, 1);
  outside(blue, 2);
  inside(blue + 1, 2);
  inside(GLOW.round - 1, 2);
  outside(0, 2);
  GLOW.from.forEach((start, ch) => assert.equal(glowAt(start)[ch], 0, `channel ${ch}`));
  assert.equal(blue + turn, GLOW.round, "the blue's turn ends with the round");
});

test("the counter steps by the table's step round its round and lands further along each round, the step not dividing the round", () => {
  assert.ok(ALONG > 0 && ALONG < GLOW.step);
  let counter = 0;
  const seen = [];
  for (let i = 0; i < 3 * ROUND; i++) {
    counter = glowStep(counter, GLOW);
    seen.push(counter);
  }
  assert.ok(seen.every((c) => Number.isInteger(c) && c >= 0 && c < GLOW.round));
  assert.equal(seen[ROUND - 2], (ROUND - 1) * GLOW.step, "the last step before the wrap");
  assert.deepEqual(
    [seen[ROUND - 1], seen[2 * ROUND - 1], seen[3 * ROUND - 1]],
    [ALONG, 2 * ALONG, 3 * ALONG],
  );
});

test("stepped on each frame the pill's word is not negative after the frame, as the draw steps it, the counter runs the word's frames, one on the take and one a step of the word, and comes out part of a round along", () => {
  const live = begin(level(row(2, 18), [start(), pill(16, Number(INVINCIBLE))]));
  const w = live.words;
  const { word, step } = motion.types[INVINCIBLE].lasts;
  assert.ok(until(live, PAD.up, (_, events) => taken(events, Number(INVINCIBLE))));
  let counter = 0;
  let frames = 0;
  while (w.pills[INVINCIBLE] >= 0) {
    counter = glowStep(counter, GLOW);
    frames += 1;
    frame(live, 0);
  }
  assert.equal(frames, word / step + 1);
  assert.equal(counter, (frames * GLOW.step) % GLOW.round);
  assert.notEqual(counter, 0);
});

test("a run places the level's fruit by the game's pickups' word, the take sets the placed type's bit, relevel keeps the placement and the next run places by the word banked, while a level with no game keeps its own fruit", () => {
  const [, second, third] = FRUITS;
  const fruit = { x: 17, y: 16, z: 17, kind: 0, on: [object(0, third)] };
  const l = counted(level(row(10, 18), [start(), fruit]), 0, 2);
  const slot = `${cellKey(17, 16, 17)}/0`;
  assert.equal(begin(l).world.pickups.get(slot).m.type, third, "no game, the level's own");
  const game = { ...startGame(), fruit: 1 };
  const live = begin(l, null, game);
  assert.equal(live.world.pickups.get(slot).m.type, second);
  assert.equal(live.words.fruit, 1);
  const events = steps(live, 120, PAD.up);
  assert.deepEqual(
    events.filter((e) => e.took).map((e) => e.took.type),
    [second],
    "the thing taken is the one placed",
  );
  assert.equal(live.words.fruit, 3, "and its bit is the placed type's");
  relevel(live, l, index(l));
  assert.equal(live.world.pickups.get(slot).m.type, second);
  assert.deepEqual([...live.world.taken], [slot]);
  end(live, play.ending.exit, []);
  settle(game, live);
  assert.equal(game.fruit, 3);
  const again = restart(live, null, { level: l, idx: index(l) });
  assert.equal(again.world.pickups.get(slot).m.type, third, "the two taken, the third placed");
  assert.equal(again.words.fruit, 3);
});

test("a coin taken starts its kind's table at the thing's place with a light from its cell and face, which draws a row a pass from the take's pass and is gone from the list the pass after its last row, and a run and a restart start the list empty", () => {
  const live = begin(level(row(2, 18), [start(), pickup(16, COIN)]));
  const w = live.words;
  assert.deepEqual(w.effects, []);
  const took = takes(live);
  const { world } = EFFECTS.starts[COIN];
  const { frames, rows } = effectTable(world);
  assert.equal(w.effects.length, 1);
  const [e] = w.effects;
  assert.equal(e.kind, world);
  assert.deepEqual(e.at, took.at);
  assert.equal(e.icon, null);
  assert.deepEqual([e.light.x, e.light.y, e.light.z, e.light.face], [17, 16, 17, TOP]);
  assert.equal(e.count, 1, "the take's pass drew the first row");
  assert.deepEqual(particlesOf(live), rowOf(rows[0], took.at));
  frame(live, 0);
  assert.deepEqual(particlesOf(live), rowOf(rows[1], took.at));
  for (let i = 2; i < frames; i++) frame(live, 0);
  assert.equal(w.effects.length, 1);
  assert.equal(w.effects[0].count, frames);
  assert.deepEqual(particlesOf(live), rowOf(rows[frames - 1], took.at));
  frame(live, 0);
  assert.deepEqual(w.effects, [], "dropped on the pass after its last");
  assert.deepEqual(particlesOf(live), []);
  assert.deepEqual(effectLights(live), []);
  const again = begin(level(row(2, 18), [start(), pickup(16, COIN)]));
  takes(again);
  assert.equal(again.words.effects.length, 1);
  assert.deepEqual(restart(again).words.effects, []);
});

test("a key starts two effects, its HUD kind at the key's icon, which the map has no point for, before its world kind, a fruit's second effect at its icon's point and the hourglass's second effect at the clock's point, and the list holds the table's most and refuses the rest, as it does a kind without a table", () => {
  const live = begin(level(row(2, 18), [start(), pickup(16, KEY)]));
  const took = takes(live);
  const { world, hud } = EFFECTS.starts[KEY];
  assert.deepEqual(
    live.words.effects.map((e) => [e.kind, e.icon, e.at, e.light === null]),
    [
      [hud, "key", null, true],
      [world, null, took.at, false],
    ],
  );
  assert.deepEqual(effectLights(live), [live.words.effects[1].light]);
  const fruit = begin(level(row(2, 18), [start(), pickup(16, FIRST_FRUIT)]));
  takes(fruit);
  const [icon, burst] = fruit.words.effects;
  assert.deepEqual(
    [icon.kind, icon.icon, icon.at, burst.kind],
    [
      EFFECTS.starts[FIRST_FRUIT].hud,
      "fruit",
      EFFECTS.hud.fruit[0],
      EFFECTS.starts[FIRST_FRUIT].world,
    ],
  );
  const glass = begin(level(row(2, 18), [start(), pickup(16, HOURGLASS)]));
  takes(glass);
  assert.deepEqual(
    glass.words.effects.map((e) => [e.kind, e.icon, e.at]),
    [
      [EFFECTS.starts[HOURGLASS].hud, "clock", EFFECTS.hud.clock],
      [EFFECTS.starts[HOURGLASS].world, null, glass.words.effects[1].at],
    ],
  );
  // the HUD effects stand in the list and draw no particle the frame places
  assert.ok(particlesOf(glass).some((p) => p.icon === "clock"));
  // fifteen standing, a key's take fills the sixteenth slot with its HUD kind and its burst is refused
  const full = begin(level(row(2, 18), [start(), pickup(16, KEY)]));
  const at = [17 * UNIT, 10 * UNIT, 17 * UNIT];
  for (let i = 0; i < EFFECTS.most - 1; i++) assert.ok(startEffect(full, world, at));
  takes(full);
  assert.equal(full.words.effects.length, EFFECTS.most);
  assert.deepEqual(full.words.effects.at(-1).icon, "key");
  assert.deepEqual(effectLights(full), [], "the burst with the light was refused");
  assert.equal(startEffect(full, world, at), false);
  assert.equal(full.words.effects.length, EFFECTS.most);
  const none = Object.keys(EFFECTS.kinds).length;
  assert.equal(EFFECTS.kinds[String(none)], undefined);
  assert.equal(startEffect(live, none, at), false, "a kind with no table");
});

test("a fruit's first row draws its stripes' angle from the dice the wandering ball draws from, so the dice after its take stand elsewhere than after a coin's take, whose rows never draw, and the angle runs on from the draw by the rows' own angles", () => {
  const first = dice(motion.dice);
  const drawn = first(motion.turn);
  const after = (type) => {
    const live = begin(level(row(2, 18), [start(), pickup(16, type)]));
    takes(live);
    return live;
  };
  assert.equal(after(COIN).world.roll(motion.turn), drawn, "the coin's take drew nothing");
  const live = after(FIRST_FRUIT);
  assert.equal(live.world.roll(motion.turn), first(motion.turn), "one draw taken by the fruit's");
  const [, e] = live.words.effects;
  const { rows } = effectTable(e.kind);
  assert.equal(rows[0][1][1], -1, "the stripes' first angle is the dice's");
  assert.deepEqual(e.slots, [0, drawn]);
  const stripes = () => particlesOf(live).filter((p) => p.icon === null)[1];
  const glow = () => particlesOf(live).filter((p) => p.icon === null)[0];
  assert.equal(stripes().angle, drawn);
  assert.equal(glow().angle, rows[0][0][1]);
  for (let f = 1; f < 6; f++) {
    frame(live, 0);
    assert.equal(stripes().angle, drawn + rows[f][1][1], `frame ${f}`);
    assert.equal(glow().angle, rows[f][0][1], `the glow's angle is the table's, frame ${f}`);
  }
  assert.deepEqual(e.slots, [0, drawn], "the slot keeps the draw alone");
});

test("a world effect's light is coloured each pass by the sum of its particles' colours, each byte times the brightness over the table's divisor, dark where the row shows nothing, and a HUD effect has none", () => {
  const live = begin(level(row(2, 18), [start(), pickup(16, COIN)]));
  takes(live);
  const [e] = live.words.effects;
  const { rows } = effectTable(e.kind);
  assert.deepEqual(e.light.colour, colourOf(rows[0]));
  assert.deepEqual(e.light.colour, [0, 0, 0]);
  for (let f = 1; f <= 5; f++) {
    frame(live, 0);
    assert.deepEqual(e.light.colour, colourOf(rows[f]), `frame ${f}`);
  }
  // frame 5: the dark ring at 140 and the white ring at 68
  assert.deepEqual(rows[5], [
    [5, 3430, 1000, 140],
    [6, 3681, 2580, 68],
  ]);
  assert.deepEqual(e.light.colour, [37, 21, 21]);
  assert.deepEqual(effectLights(live), [e.light]);
  const key = begin(level(row(2, 18), [start(), pickup(16, KEY)]));
  takes(key);
  assert.equal(key.words.effects[0].light, null);
  assert.equal(effectLights(key).length, 1);
});

test("a teleporter starts its HUD kind at the screen's teleport point as its count starts, with no light, which runs through the count, the send and on the far face for its table's frames", () => {
  const port = (x, y, facing, to) => {
    const o = object(0, TELEPORTER, facing, 1);
    o.f[fieldIndex("f7")] = to * 16;
    return { x, y, z: 17, kind: 0, on: [o] };
  };
  const l = level(
    [...row(10, 18), [20, 12, 17], [20, 13, 17], [20, 14, 17]],
    [start(), port(17, 15, 0, 2), port(20, 12, 1, 1)],
  );
  const live = begin(l);
  const w = live.words;
  const { send } = motion.types[String(TELEPORTER)];
  const { frames } = effectTable(EFFECTS.teleport.hud);
  assert.ok(until(live, PAD.up, (_, events) => events.some((e) => e.sending)));
  assert.deepEqual(
    w.effects.map((e) => [e.kind, e.icon, e.at, e.light, e.count]),
    [[EFFECTS.teleport.hud, "teleport", EFFECTS.hud.teleport, null, 1]],
  );
  assert.ok(particlesOf(live).every((p) => p.icon === "teleport" && p.at === EFFECTS.hud.teleport));
  assert.ok(until(live, 0, (_, events) => events.some((e) => e.sent)));
  assert.equal(w.effects.length, 1, "no second effect at the send");
  assert.equal(w.effects[0].count, send.wait + 1);
  for (let i = 0; i < frames - send.wait - 1; i++) frame(live, 0);
  assert.equal(w.effects[0].count, frames);
  frame(live, 0);
  assert.deepEqual(w.effects, []);
});
