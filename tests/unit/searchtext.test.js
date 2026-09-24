import { test } from "node:test";
import assert from "node:assert/strict";
import { indexed, answers, spans } from "../../public/js/searchtext.js";

const c = indexed(["LEVEL 145", null, "", "HIRO", "f3=20"]);

test("indexed: the words lowercased and run together, blanks dropped", () => {
  assert.equal(c.text, "level 145 hiro f3=20");
  assert.deepEqual(c.tokens, ["level", "145", "hiro", "f3=20"]);
});

test("a number is answered by a whole word only", () => {
  assert.ok(answers(c)("145"));
  assert.ok(!answers(c)("45"));
  assert.ok(!answers(c)("14"));
});

test("a key=value pair is answered by a whole word only", () => {
  assert.ok(answers(c)("f3=20"));
  assert.ok(!answers(c)("f3=2"));
});

test("a pair still waiting for its value is a substring, so it finds what it starts", () => {
  assert.ok(answers(c)("f3="));
  assert.ok(!answers(c)("f4="));
});

test("any other term is a substring", () => {
  assert.ok(answers(c)("hir"));
  assert.ok(answers(c)("level 145"));
  assert.ok(!answers(c)("inca"));
});

test("spans: a word term wherever it falls, overlaps merged", () => {
  assert.deepEqual(spans("Bronze coin", ["on", "co"]), [
    [2, 4],
    [7, 9],
  ]);
  assert.deepEqual(spans("coin", ["coi", "oin"]), [[0, 4]]);
});

test("spans: a number only as a whole word or a pair's value, never inside a cell", () => {
  const row = "Key top · 17,12,17 · type=17";
  assert.deepEqual(spans(row, ["17"]), [[row.length - 2, row.length]]);
  assert.deepEqual(spans("LEVEL 17", ["level", "17"]), [
    [0, 5],
    [6, 8],
  ]);
  assert.deepEqual(spans("LEVEL 170", ["17"]), []);
});

test("spans: a pair only whole", () => {
  assert.deepEqual(spans("f3=20 f3=2", ["f3=2"]), [[6, 10]]);
});
