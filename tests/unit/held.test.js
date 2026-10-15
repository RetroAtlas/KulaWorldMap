import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY, draftShaped, heldIn, idOf } from "../../public/js/format/held.js";
import { blank } from "../../public/js/format/project.js";

const entry = (doc, more = {}) => ({ doc, updated: 1, saved: null, edits: 0, ...more });

test("the store's key is the one the page reads at the start", () => {
  assert.equal(KEY, "kula.drafts");
});

test("a key names a draft when it is a positive whole number in its own spelling", () => {
  for (const [key, id] of [
    ["7", 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
    [String(Number.MAX_SAFE_INTEGER + 1), null],
    ["07", null],
    ["1e3", null],
    ["1.0", null],
    [" 7", null],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    ["x", null],
    ["", null],
    ["__proto__", null],
  ])
    assert.equal(idOf(key), id, key);
});

test("an entry has a draft's shape with the format's marker and a list of blocks", () => {
  const doc = blank("HIRO");
  assert.ok(draftShaped(entry(doc)));
  assert.ok(draftShaped({ doc }));
  for (const bad of [
    null,
    "text",
    7,
    {},
    { doc: null },
    { doc: "text" },
    { doc: { ...doc, format: "something-else" } },
    { doc: { ...doc, blocks: {} } },
    { doc: { ...doc, blocks: undefined } },
  ])
    assert.equal(draftShaped(bad), false, JSON.stringify(bad));
});

test("the text's ids are told apart: every key that names a draft, and those shaped as one", () => {
  const doc = blank("MARS");
  const text = JSON.stringify({
    version: 1,
    next: 9,
    drafts: {
      1: entry(doc),
      2: null,
      3: entry({ format: "something-else", blocks: [] }),
      "1e3": entry(doc),
      a: entry(doc),
      0: entry(doc),
      "-2": entry(doc),
    },
  });
  assert.deepEqual(heldIn(text), { named: [1, 2, 3], shaped: [1] });
});

test("text that is not a store holds nothing", () => {
  for (const text of [null, undefined, "", "not json", "[]", "7", '{"drafts":5}', '{"next":3}'])
    assert.deepEqual(heldIn(text), { named: [], shaped: [] }, String(text));
});
