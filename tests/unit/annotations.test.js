import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations, levelKey, CAMERA_KIND } from "./fixtures.js";

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
