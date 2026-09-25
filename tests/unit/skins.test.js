import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { faceSkin, lookOf, paintedShadow } from "../../public/js/skins.js";

const { skins } = objects;
const COIN = 37;
const GEM = 36;
const START = 30;
const START_ON_A_CLOCK = 29;
const CLOCK = 8;
const SLOW_STAR = 50;

test("a pickup's shadow is painted into its face, and the ball's and a star's are not", () => {
  assert.equal(paintedShadow(skins, COIN), true);
  assert.equal(paintedShadow(skins, GEM), true);
  assert.equal(paintedShadow(skins, START), false);
  assert.equal(paintedShadow(skins, SLOW_STAR), false);
});

test("the start on a clock is painted as the clock, which carries no shadow", () => {
  assert.equal(paintedShadow(skins, CLOCK), false);
  assert.equal(paintedShadow(skins, START_ON_A_CLOCK), false);
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
