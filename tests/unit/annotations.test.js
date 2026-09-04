import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations, levelKey } from "./fixtures.js";

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

test("every annotated kind and type is placed somewhere", () => {
  const kinds = new Set([String(mapData.startKind)]);
  const pairs = new Set();
  for (const l of mapData.levels) {
    for (const o of l.objects) {
      kinds.add(String(o.kind));
      pairs.add(`${o.kind}/${o.type}`);
    }
  }
  for (const k of Object.keys(annotations.kinds ?? {})) {
    assert.ok(kinds.has(k), `annotations.json names no such kind: ${k}`);
  }
  for (const p of Object.keys(annotations.types ?? {})) {
    assert.ok(pairs.has(p), `annotations.json names no such kind/type: ${p}`);
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
