import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bundleCardName,
  bundleLine,
  placeWords,
  playsLine,
  savedWords,
  stateLine,
} from "../../public/js/editor/draftwords.js";

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

test("a level's place in its bundle is the level's number among the bundle's levels", () => {
  assert.equal(placeWords(2, 3), "level 2 of 3");
  assert.equal(placeWords(1, 1), "level 1 of 1");
});

test("a bundle's line of state is how many levels it holds, then how many of them are not saved to a file", () => {
  assert.equal(bundleLine(3, 1), "3 levels · 1 not saved to a file");
  assert.equal(bundleLine(3, 3), "3 levels · 3 not saved to a file");
  assert.equal(bundleLine(12, 10), "12 levels · 10 not saved to a file");
  assert.equal(bundleLine(1, 1), "1 level · 1 not saved to a file");
});

test("a bundle whose levels are all saved to a file says so, and a bundle with no level gives its count alone", () => {
  assert.equal(bundleLine(3, 0), "3 levels · saved to a file");
  assert.equal(bundleLine(1, 0), "1 level · saved to a file");
  assert.equal(bundleLine(0, 0), "0 levels");
});

test("a bundle's card is named by the bundle's title, then what the card is", () => {
  assert.equal(bundleCardName("Spiral campaign"), "Spiral campaign, the bundle's card");
  assert.equal(bundleCardName("Untitled bundle"), "Untitled bundle, the bundle's card");
});
