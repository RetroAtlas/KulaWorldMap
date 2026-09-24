import { test } from "node:test";
import assert from "node:assert/strict";
import { indexed, answers } from "../../public/js/searchtext.js";

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

test("any other term is a substring", () => {
  assert.ok(answers(c)("hir"));
  assert.ok(answers(c)("level 145"));
  assert.ok(!answers(c)("inca"));
});
