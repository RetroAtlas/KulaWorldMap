import { test } from "node:test";
import assert from "node:assert/strict";
import { placeLine, playsLine, savedWords, stateLine } from "../../public/js/editor/draftwords.js";

const level = (saved, edits) => ({ saved, edits });

test("a level never saved to a file says so, and counts its changes once it has one", () => {
  assert.equal(savedWords(level(null, 0)), "not saved to a file");
  assert.equal(savedWords(level(null, 1)), "not saved to a file · 1 change");
  assert.equal(savedWords(level(null, 12)), "not saved to a file · 12 changes");
});

test("a level saved to a file says so, whenever the save was, and counts the changes since", () => {
  assert.equal(savedWords(level(500, 0)), "saved to a file");
  assert.equal(savedWords(level(0, 0)), "saved to a file");
  assert.equal(savedWords(level(500, 1)), "saved to a file · 1 change since");
  assert.equal(savedWords(level(500, 3)), "saved to a file · 3 changes since");
});

test("a level's line of state is its world, then whether it is saved to a file", () => {
  assert.equal(stateLine("HIRO", level(null, 0)), "HIRO · not saved to a file");
  assert.equal(stateLine("INCA", level(500, 1)), "INCA · saved to a file · 1 change since");
});

test("how a level plays is the kind of level it plays as, then the time its clock starts at", () => {
  assert.equal(playsLine("bonus", false, 83), "bonus level · time 83");
  assert.equal(playsLine("simon", false, 99), "Simon room · time 99");
  assert.equal(playsLine("arcade", false, 119), "arcade level · time 119");
});

test("a hidden level says so before the kind of level it plays as", () => {
  assert.equal(playsLine("bonus", true, 83), "hidden bonus level · time 83");
  assert.equal(playsLine("simon", true, 83), "hidden Simon room · time 83");
  assert.equal(playsLine("arcade", true, 83), "hidden arcade level · time 83");
});

test("how a level plays leaves the time out where none is given", () => {
  assert.equal(playsLine("bonus", false), "bonus level");
  assert.equal(playsLine("arcade", true, null), "hidden arcade level");
});

test("a level's place in its bundle is the bundle's title, then the level's number among the bundle's levels", () => {
  assert.equal(placeLine("Spiral campaign", 2, 3), "Spiral campaign · level 2 of 3");
  assert.equal(placeLine("Untitled bundle", 1, 1), "Untitled bundle · level 1 of 1");
});
