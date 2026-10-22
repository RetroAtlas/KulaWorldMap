import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { guessSlot } from "../../public/js/editor/slotguess.js";

// The titles the box lists: every slot but the Simon rooms', named as the pause screen names it.
const listed = mapData.levels
  .filter((l) => !l.pack.includes("COPYCAT"))
  .map((l) => [`${l.pack}#${l.index}`, l.shown || l.name]);
const key = (title) => listed.find(([, name]) => name === title)[0];

test("a title that is a listed title names its slot, case and spacing aside", () => {
  assert.equal(guessSlot("LEVEL 101", listed), key("LEVEL 101"));
  assert.equal(guessSlot("  level \t 101 ", listed), key("LEVEL 101"));
  assert.equal(guessSlot("bonus 3", listed), key("BONUS 3"));
  assert.equal(guessSlot("Final 20", listed), key("FINAL 20"));
  assert.equal(guessSlot("hidden 10", listed), key("HIDDEN 10"));
  assert.equal(guessSlot("lesson", listed), key("LESSON"));
});

test("a listed title standing in the title as whole words names its slot, the longest where several do", () => {
  assert.equal(guessSlot("My LEVEL 101 remix", listed), key("LEVEL 101"));
  assert.equal(guessSlot("My level 10, remixed", listed), key("LEVEL 10"));
  assert.equal(guessSlot("LEVEL 1 and LEVEL 10", listed), key("LEVEL 10"));
  assert.equal(guessSlot("(bonus 3)", listed), key("BONUS 3"));
  assert.equal(guessSlot("LEVEL 1010", listed), null);
});

test("a number in the title counts to a level, or to a bonus, final or hidden level where that word stands before it", () => {
  assert.equal(guessSlot("My 101", listed), key("LEVEL 101"));
  assert.equal(guessSlot("Level101", listed), key("LEVEL 101"));
  assert.equal(guessSlot("LEVEL 007", listed), key("LEVEL 7"));
  assert.equal(guessSlot("Lvl 5 v2", listed), key("LEVEL 5"));
  assert.equal(guessSlot("Bonus3", listed), key("BONUS 3"));
  assert.equal(guessSlot("Final-12 (hard)", listed), key("FINAL 12"));
  assert.equal(guessSlot("my hidden: 7", listed), key("HIDDEN 7"));
  assert.equal(guessSlot("hidden 11", listed), null);
  assert.equal(guessSlot("Spiral", listed), null);
  assert.equal(guessSlot("", listed), null);
});

test("a slot another row takes is not guessed", () => {
  const taken = new Set([key("LEVEL 5")]);
  assert.equal(guessSlot("LEVEL 5", listed, taken), null);
  assert.equal(guessSlot("My level 5", listed, taken), null);
  assert.equal(guessSlot("Lvl 5", listed, taken), null);
  assert.equal(guessSlot("LEVEL 6", listed, taken), key("LEVEL 6"));
});
