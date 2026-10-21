import { test } from "node:test";
import assert from "node:assert/strict";
import { named } from "../../public/js/viewer/ui/keys.js";

const text = "Ctrl-Z, Ctrl-Shift-Z and Alt-click";

test("an Apple platform names Ctrl as Cmd and Alt as Option", () => {
  for (const platform of ["MacIntel", "iPhone", "iPad"])
    assert.equal(named(text, platform), "Cmd-Z, Cmd-Shift-Z and Option-click", platform);
});

test("any other platform keeps the names as written", () => {
  for (const platform of ["Win32", "Linux x86_64", ""])
    assert.equal(named(text, platform), text, platform);
});

test("a chord joined with a plus is renamed too", () => {
  assert.equal(named("Ctrl+Z", "MacIntel"), "Cmd+Z");
});

test("a word that merely holds the letters is left alone", () => {
  assert.equal(named("Ctrls Alto", "MacIntel"), "Ctrls Alto");
});
