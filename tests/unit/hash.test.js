import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { hashes, seed } from "../../public/js/hash.js";
import { phasesOf } from "../../public/js/motion.js";

const table = objects.motion;

test("a place's face paint and its three starting angles come from one stream", () => {
  const next = hashes(17, 12, 30, 5);
  const stream = [next(), next(), next()];
  assert.equal(seed(17, 12, 30, 5), stream[0]);
  assert.deepEqual(
    phasesOf(table, 17, 12, 30, 5),
    stream.map((h) => h % table.turn),
  );
});

test("the stream is the one every visit has drawn from", () => {
  assert.equal(seed(3, 4, 5, 0), 2595170866);
  assert.deepEqual(phasesOf(table, 3, 4, 5, 0), [2610, 1314, 3560]);
  assert.notEqual(seed(3, 4, 5, 1), seed(3, 4, 5, 0));
  assert.notEqual(seed(4, 4, 5, 0), seed(3, 4, 5, 0));
});
