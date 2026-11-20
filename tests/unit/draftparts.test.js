import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACK,
  CHOSEN,
  LEVEL,
  LIST,
  MOVED,
  SHOWN,
  STEPPED,
  partAfter,
} from "../../public/js/editor/draftparts.js";

const PARTS = [LIST, LEVEL];
const after = (what, own) => PARTS.map((stood) => partAfter(stood, what, own));

test("a level of your own coming on screen stands its card, whatever stood", () => {
  assert.deepEqual(after(SHOWN, true), [LEVEL, LEVEL]);
});

test("a step along the list to another level of your own keeps what stood", () => {
  assert.deepEqual(after(STEPPED, true), [LIST, LEVEL]);
});

test("the level on screen chosen again in the list stands its card", () => {
  assert.deepEqual(after(CHOSEN, true), [LEVEL, LEVEL]);
});

test("the way back stands the list", () => {
  assert.deepEqual(after(BACK, true), [LIST, LIST]);
});

test("a level that is not your own on screen stands the list, by whatever road it came", () => {
  for (const what of [SHOWN, STEPPED, MOVED]) assert.deepEqual(after(what, false), [LIST, LIST]);
});

test("a level of your own under a new number keeps what stood", () => {
  assert.deepEqual(after(MOVED, true), [LIST, LEVEL]);
});

test("anything else that happens to a level of your own keeps what stood", () => {
  assert.deepEqual(after("updated", true), [LIST, LEVEL]);
  assert.deepEqual(after(undefined, true), [LIST, LEVEL]);
});

test("the parts and what bears on them are told apart by their names", () => {
  assert.equal(new Set(PARTS).size, PARTS.length);
  const names = [SHOWN, STEPPED, MOVED, CHOSEN, BACK];
  assert.equal(new Set(names).size, names.length);
});
