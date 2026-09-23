import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations, levelKey, CAMERA_KIND } from "./fixtures.js";
import { state } from "../../public/js/state.js";
import { setAnnotations, levelPoints, levelScore } from "../../public/js/data.js";

const reasons = readFileSync(
  fileURLToPath(new URL("../../docs/annotations.md", import.meta.url)),
  "utf8",
);

// annotations.json is hand-curated against generated data, so every key in it
// has to name something the data still has.
test("every annotated level names a level", () => {
  const keys = new Set(mapData.levels.map(levelKey));
  for (const key of Object.keys(annotations.levels ?? {})) {
    assert.ok(keys.has(key), `annotations.json names no such level: ${key}`);
  }
});

test("every annotated world names a world", () => {
  const ids = new Set(mapData.themes.map((t) => t.id));
  for (const id of Object.keys(annotations.worlds ?? {})) {
    assert.ok(ids.has(id), `annotations.json names no such world: ${id}`);
  }
});

test("every annotated kind, type and variant is placed somewhere", () => {
  const kinds = new Set([String(CAMERA_KIND)]);
  const objects = new Map();
  for (const l of mapData.levels) {
    for (let i = 3; i < l.cells.length; i += 4) {
      if (l.cells[i] < mapData.firstRecord) kinds.add(String(l.cells[i]));
    }
    for (const r of l.records) {
      kinds.add(String(r.kind));
      for (const o of r.on) {
        if (!objects.has(o.type)) objects.set(o.type, []);
        objects.get(o.type).push(o);
      }
    }
  }
  for (const k of Object.keys(annotations.kinds ?? {})) {
    assert.ok(kinds.has(k), `annotations.json names no such kind: ${k}`);
  }
  for (const [t, entry] of Object.entries(annotations.types ?? {})) {
    const placed = objects.get(Number(t));
    assert.ok(placed, `annotations.json names no such type: ${t}`);
    if (!entry.by) continue;
    const values = new Set(placed.map((o) => String(o.f[Number(entry.by.slice(1)) - 5])));
    for (const v of Object.keys(entry.variants ?? {})) {
      assert.ok(values.has(v), `annotations.json names no type ${t} with ${entry.by} = ${v}`);
    }
  }
});

test("the catalogue note is on OBJ LEVEL, in nine worlds", () => {
  const named = Object.entries(annotations.levels ?? {})
    .filter(([, v]) => /object catalogue/i.test(v.note ?? ""))
    .map(([k]) => k);
  const byKey = new Map(mapData.levels.map((l) => [levelKey(l), l]));
  assert.equal(named.length, 9);
  for (const key of named) assert.equal(byKey.get(key).name, "OBJ LEVEL");
});

// A curated score exists to say that not everything on a level can be had,
// so one that is not below the disc's own total has lost its reason.
test("a curated score is below what the disc holds, and says why", () => {
  setAnnotations(annotations);
  state.data = mapData;
  let curated = 0;
  for (const l of mapData.levels) {
    const score = levelScore(l);
    if (score === null) continue;
    curated++;
    assert.ok(Number.isInteger(score) && score > 0, `${levelKey(l)}: score ${score}`);
    assert.ok(score < levelPoints(l), `${levelKey(l)}: ${score} is not below ${levelPoints(l)}`);
    assert.ok(annotations.levels[levelKey(l)].note, `${levelKey(l)}: no note`);
  }
  assert.ok(curated > 0);
});

// A note is what the map says; why it is believed lives in docs/annotations.md
// under the entry's key, so nothing goes in without its reasons and nothing is
// left there once its entry is gone.
test("every annotation has its reasons in docs/annotations.md, and only those", () => {
  const entries = new Set([
    ...Object.keys(annotations.worlds ?? {}).map((id) => `world ${id}`),
    ...Object.keys(annotations.kinds ?? {}).map((k) => `kind ${k}`),
    ...Object.keys(annotations.types ?? {}).map((t) => `type ${t}`),
    ...Object.keys(annotations.levels ?? {}),
  ]);
  const sections = new Set();
  for (const heading of reasons.split("\n").filter((line) => line.startsWith("### "))) {
    const named = [
      ...heading.matchAll(/^### ((?:world|kind|type) \w+)|(\/[A-Z]+\/[A-Z]+\.PAK#\d+)/g),
    ].map((m) => m[1] ?? m[2]);
    assert.ok(named.length, `docs/annotations.md: "${heading}" names no entry`);
    for (const key of named) {
      assert.ok(
        entries.has(key),
        `docs/annotations.md has a section for ${key}, which is not annotated`,
      );
      sections.add(key);
    }
  }
  for (const key of entries) {
    assert.ok(sections.has(key), `docs/annotations.md has no section for ${key}`);
  }
});
