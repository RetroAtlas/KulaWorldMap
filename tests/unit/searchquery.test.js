import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseQuery,
  queryTerms,
  matchesBy,
  matchesQuery,
  rankFor,
} from "../../public/js/searchquery.js";

// A stand-in for the lowercased "name + fields" blob an object is searched by.
const TELEPORTER = "blue teleporter type 5 top facing=+x starts=off f6=1 f7=2";

test("parseQuery: space = AND within one group", () => {
  assert.deepEqual(parseQuery("Teleporter starts=off"), [["teleporter", "starts=off"]]);
});

test("parseQuery: comma and the word 'or' both split into OR groups", () => {
  assert.deepEqual(parseQuery("Coin, Key"), [["coin"], ["key"]]);
  assert.deepEqual(parseQuery("Coin or Key"), [["coin"], ["key"]]);
});

test("parseQuery: bare 'and'/'or' are operators, never terms", () => {
  assert.deepEqual(parseQuery("Coin and Key"), [["coin", "key"]]);
  // dangling operators (leading/trailing, so never a separator) drop out too
  assert.deepEqual(parseQuery("or Coin"), [["coin"]]);
  assert.deepEqual(parseQuery("Coin or"), [["coin"]]);
  assert.deepEqual(parseQuery("Coin and"), [["coin"]]);
});

test("parseQuery: '=' is never a split point; field=value stays one term", () => {
  assert.deepEqual(parseQuery("f12=500"), [["f12=500"]]);
});

test("parseQuery: substrings like 'wandering' aren't treated as operators", () => {
  // only whitespace-delimited and/or are operators
  assert.deepEqual(parseQuery("wandering"), [["wandering"]]);
});

test("parseQuery: trailing separators and blanks drop cleanly", () => {
  assert.deepEqual(parseQuery("coin,"), [["coin"]]);
  assert.deepEqual(parseQuery("  coin   gold "), [["coin", "gold"]]);
});

test("queryTerms: distinct terms across all groups", () => {
  assert.deepEqual(queryTerms([["coin"], ["key", "coin"]]), ["coin", "key"]);
});

test("matchesQuery: AND needs every term, non-adjacent is fine", () => {
  // the original bug: terms straddle other fields in the blob
  assert.ok(matchesQuery(TELEPORTER, parseQuery("teleporter starts=off")));
  assert.ok(!matchesQuery(TELEPORTER, parseQuery("teleporter starts=on")));
});

test("matchesQuery: a spaced name still matches (its words are the AND terms)", () => {
  assert.ok(matchesQuery(TELEPORTER, parseQuery("blue teleporter")));
});

test("matchesQuery: OR matches when any group matches", () => {
  assert.ok(matchesQuery(TELEPORTER, parseQuery("coin, teleporter")));
  assert.ok(!matchesQuery(TELEPORTER, parseQuery("coin, key")));
});

test("matchesBy: the same AND/OR shape over a test that isn't one blob", () => {
  // an index of two parts, only one of which answers a whole term
  const has = (term) => "gold coin".includes(term) || ["f6=0", "f8=3"].includes(term);
  assert.ok(matchesBy(parseQuery("gold coin"), has));
  assert.ok(matchesBy(parseQuery("f6=0 f8=3"), has));
  assert.ok(!matchesBy(parseQuery("f6=0 f8=4"), has));
  assert.ok(!matchesBy(parseQuery("f"), has)); // a term inside a token is not a match
});

test("rankFor: best (lowest) name rank across the terms", () => {
  assert.equal(rankFor("Coin", ["coin"]), 0); // exact
  assert.equal(rankFor("Coin", ["coi"]), 1); // prefix
  assert.equal(rankFor("Captivator, wandering", ["captivator"]), 1); // prefix wins
  assert.equal(rankFor("Boost button", ["button"]), 2); // substring
  assert.equal(rankFor("Coin", ["key"]), 3); // not in the name
  assert.equal(rankFor("Key", ["coin", "key"]), 0); // best across terms
});
