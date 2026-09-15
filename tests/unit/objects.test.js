import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations, objects } from "./fixtures.js";

// The types drawn on a block's face rather than standing on it: fire, ice, the
// clock and one unnamed type, which have no mesh of their own.
const FACELESS = new Set([1, 2, 8, 29]);

const placed = new Set(
  mapData.levels.flatMap((l) => l.records.flatMap((r) => r.on.map((o) => o.type))),
);
const drawn = new Set(Object.keys(objects.types).map(Number));

test("every placed type is drawn, or is one drawn on the face", () => {
  for (const t of placed) assert.ok(drawn.has(t) || FACELESS.has(t), `type ${t}`);
  for (const t of drawn) assert.ok(placed.has(t), `type ${t} is drawn but never placed`);
});

test("a type with variants has a model for each", () => {
  for (const [t, e] of Object.entries(annotations.types)) {
    if (!e.variants || !objects.types[t]) continue;
    const most = Math.max(...Object.keys(e.variants).map(Number));
    assert.ok(objects.types[t].length > most, `type ${t} has ${objects.types[t].length} models`);
  }
});

test("a model's polygons name its vertices and carry a colour per corner", () => {
  assert.equal(objects.block, 512);
  for (const [t, models] of Object.entries(objects.types)) {
    for (const m of models) {
      const n = m.frames[0].length / 3;
      assert.ok(Number.isInteger(n) && n > 0, `type ${t}`);
      for (const f of m.frames) assert.equal(f.length, n * 3, `type ${t} frames`);
      assert.equal(m.polys.length, m.rgb.length, `type ${t}`);
      assert.equal(m.polys.length, m.flags.length, `type ${t}`);
      m.polys.forEach((p, i) => {
        assert.ok(p.length === 3 || p.length === 4, `type ${t} polygon ${i}`);
        for (const v of p) assert.ok(v >= 0 && v < n, `type ${t} polygon ${i} names ${v}`);
        assert.equal(m.rgb[i].length, p.length * 3, `type ${t} polygon ${i} colours`);
      });
      const [lo, hi] = m.box;
      for (let i = 0; i < 3; i++) assert.ok(lo[i] <= hi[i], `type ${t} box`);
    }
  }
});
