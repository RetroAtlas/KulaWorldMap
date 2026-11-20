import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASKED,
  BACK,
  BUNDLE,
  CHOSEN,
  GONE,
  LEVEL,
  LIST,
  MOVED,
  SHOWN,
  STEPPED,
  partAfter,
} from "../../public/js/editor/draftparts.js";

const PARTS = [LIST, LEVEL, BUNDLE];
const after = (what, own) => PARTS.map((stood) => partAfter(stood, what, own));

test("a level of your own coming on screen stands its card, whatever stood", () => {
  assert.deepEqual(after(SHOWN, true), [LEVEL, LEVEL, LEVEL]);
});

test("a step along the list to another level of your own keeps what stood", () => {
  assert.deepEqual(after(STEPPED, true), [LIST, LEVEL, BUNDLE]);
});

test("the level on screen chosen again, in the list or on a bundle's card, stands its card", () => {
  assert.deepEqual(after(CHOSEN, true), [LEVEL, LEVEL, LEVEL]);
});

test("the way back stands the list, whatever level is on screen", () => {
  for (const own of [true, false]) assert.deepEqual(after(BACK, own), [LIST, LIST, LIST]);
});

test("a level that is not your own on screen stands the list in a level's card's place and leaves a bundle's card standing, by whatever road it came", () => {
  for (const what of [SHOWN, STEPPED, MOVED])
    assert.deepEqual(after(what, false), [LIST, LIST, BUNDLE]);
});

test("a level of your own under a new number keeps what stood", () => {
  assert.deepEqual(after(MOVED, true), [LIST, LEVEL, BUNDLE]);
});

test("a bundle's card asked for stands, whatever stood and whatever level is on screen", () => {
  for (const own of [true, false]) assert.deepEqual(after(ASKED, own), [BUNDLE, BUNDLE, BUNDLE]);
});

test("the bundle whose card stands going stands the list, whatever level is on screen", () => {
  for (const own of [true, false]) assert.equal(partAfter(BUNDLE, GONE, own), LIST);
});

test("anything else that happens to a level of your own keeps what stood", () => {
  assert.deepEqual(after("updated", true), [LIST, LEVEL, BUNDLE]);
  assert.deepEqual(after(undefined, true), [LIST, LEVEL, BUNDLE]);
});

test("the parts and what bears on them are told apart by their names", () => {
  assert.equal(new Set(PARTS).size, PARTS.length);
  const names = [SHOWN, STEPPED, MOVED, CHOSEN, BACK, ASKED, GONE];
  assert.equal(new Set(names).size, names.length);
});
