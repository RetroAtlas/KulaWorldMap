import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { faceSkin, lookOf, shadowed } from "../../public/js/skins.js";

const { skins } = objects;
const COIN = 37;
const GEM = 36;
const START_ON_A_CLOCK = 29;
const CLOCK = 8;
const SLOW_STAR = 50;

test("a pickup's shadow is painted into its face, and the ball and the captivators cast their own", () => {
  assert.equal(shadowed(skins, COIN), true);
  assert.equal(shadowed(skins, GEM), true);
  const cast = Object.entries(objects.motion.types).filter(([, e]) => e.shadow);
  assert.deepEqual(
    cast.map(([t]) => Number(t)).sort((a, b) => a - b),
    [30, 50, 51, 52, 53, 56],
  );
  for (const [t] of cast) assert.equal(shadowed(skins, Number(t)), false, `type ${t}`);
});

const KEY = skins.keys.type;
const settings = (type) => ({ kind: skins.hidden.kind, type, on: [] });
const block = (...types) => ({ kind: 0, on: types.map((type, face) => ({ face, type })) });
const levelOf = (records, pack = "/HIRO/HIRO.PAK", theme = "HIRO") => ({ pack, theme, records });

test("a level without a key draws the second set, unless it is hidden or a Simon room", () => {
  assert.equal(lookOf(skins, levelOf([block(KEY)]), 0).bonus, false);
  assert.equal(lookOf(skins, levelOf([block(COIN)]), 0).bonus, true);
  assert.equal(lookOf(skins, levelOf([block(COIN)], skins.copycat), 0).bonus, false);
  const hidden = lookOf(skins, levelOf([block(COIN), settings(skins.hidden.type)]), 0);
  assert.equal(hidden.bonus, false);
  assert.equal(hidden.glass, true);
});

const plainTurns = (theme, world) => {
  const look = lookOf(skins, levelOf([block(KEY)], `/${theme}/${theme}.PAK`, theme), world);
  const turns = new Set();
  for (let x = 0; x < 34; x++)
    turns.add(faceSkin(skins, look, { x, y: 17, z: 17 }, 0, 0, null, 0).turn);
  return turns;
};

test("a world's stones are turned only where its header lets them be", () => {
  assert.deepEqual([...plainTurns("HIRO", 0)], [0]);
  assert.ok(plainTurns("HILLS", 1).size > 1);
});

// One face of a block, as the loader paints it, in Hiro and in a level with
// a key unless a test says otherwise.
const TOP = 0;
const PLUS_X = 1;
const FIRE = 1;
const ICE = 2;
const INVISIBLE = 3;
const ARROW = 28;
const at = { x: 17, y: 17, z: 17 };
const arcade = lookOf(skins, levelOf([block(KEY)]), 0);
const bonus = lookOf(skins, levelOf([block(COIN)]), 0);
const face = (kind, types = [], { look = arcade, place = null, plate } = {}) =>
  faceSkin(skins, look, at, TOP, kind, types.length ? block(...types) : null, 0, place, plate);
const set = skins.sets.arcade;

test("a plain face is one of the world's stones", () => {
  assert.ok(set.stone.flat().includes(face(0).tex));
});

test("a clock, and the start on one, paint the clock's face", () => {
  assert.equal(face(0, [CLOCK]).tex, set.types[CLOCK][0]);
  assert.equal(face(0, [START_ON_A_CLOCK]).tex, set.types[CLOCK][0]);
});

test("a pickup's face carries its shadow on stone and on ice, and a star's does not", () => {
  assert.equal(face(0, [COIN]).tex, set.types[COIN][1]);
  assert.equal(face(ICE, [COIN]).tex, set.kinds[ICE][1]);
  assert.equal(face(ICE, [ARROW]).tex, set.kinds[ICE][0]);
  assert.ok(set.stone.flat().includes(face(0, [SLOW_STAR]).tex));
});

test("fire burns through its frames, on a fire block and on a face with fire on it", () => {
  const block = face(FIRE);
  const patch = face(0, [FIRE]);
  assert.ok(set.kinds[FIRE].includes(block.tex) && block.live);
  assert.ok(set.types[FIRE].includes(patch.tex) && patch.live);
});

test("an invisible face is added to what is behind it, through a grey that pulses", () => {
  const f = face(INVISIBLE);
  assert.ok(set.kinds[INVISIBLE].includes(f.tex));
  assert.equal(f.add, true);
  assert.ok(f.colour.every((v) => v === f.colour[0]) && f.live);
});

test("a beam's end wears the plate of its colour", () => {
  for (let colour = 0; colour < set.laser.length; colour++) {
    assert.equal(face(0, [], { plate: colour }).tex, set.laser[colour]);
  }
});

test("a platform's blocks have no face where they join", () => {
  const first = { axis: "x", role: "first" };
  assert.equal(faceSkin(skins, arcade, at, PLUS_X, 5, null, 0, first, undefined), null);
  assert.ok(set.platform.flat().includes(face(5, [], { place: first }).tex));
});

test("a bonus level's plain face is the swirl, run through its colour cycle", () => {
  const f = face(0, [], { look: bonus });
  assert.ok(skins.sets.bonus.stone.flat().includes(f.tex));
  assert.ok(f.live && !f.colour.every((v) => v === f.colour[0]));
});
