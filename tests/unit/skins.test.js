import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { paintedShadow } from "../../public/js/skins.js";

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
