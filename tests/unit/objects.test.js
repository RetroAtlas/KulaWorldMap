import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations, objects } from "./fixtures.js";
import { lookOf } from "../../public/js/skins.js";

// The types drawn on a block's face rather than standing on it, which have no
// mesh of their own; and the starts, which are drawn as the ball.
const FACELESS = new Set([1, 2, 8]);
const STARTS = new Set([29, 30]);

const placed = new Set(
  mapData.levels.flatMap((l) => l.records.flatMap((r) => r.on.map((o) => o.type))),
);
const drawn = new Set(Object.keys(objects.types).map(Number));

test("every placed type is drawn, or is one drawn on the face", () => {
  for (const t of placed) assert.ok(drawn.has(t) || FACELESS.has(t) || STARTS.has(t), `type ${t}`);
  for (const t of drawn) assert.ok(placed.has(t), `type ${t} is drawn but never placed`);
  assert.equal(objects.balls.length, 14);
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
  for (const [t, models] of [...Object.entries(objects.types), ["ball", objects.balls]]) {
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

// What moves is read off the executable at a frame a sixtieth of a second, and
// the two things that run a cycle of states carry it as a frame program, one
// per value of their phase field.
test("the motion table is in the game's units and cycles per phase", () => {
  const m = objects.motion;
  assert.equal(m.hz, 60);
  assert.equal(m.turn, 4096);
  for (const t of Object.keys(m.types))
    assert.ok(drawn.has(Number(t)) || STARTS.has(Number(t)), `type ${t} moves but is not drawn`);
  for (const [n, len] of [
    [m.types[11].cycle, objects.types[11][0].frames.length],
    [m.kinds[7].cycle, 6],
    [m.kinds[7].level, 256],
  ]) {
    assert.equal(n.length, 4);
    for (const p of n) {
      assert.equal(p.length, n[0].length);
      for (const v of p) assert.ok(Number.isInteger(v) && v >= 0 && v < len);
    }
  }
  assert.equal(m.types[56].phases.length, 4);
});

// The skins the build reads off the executable: two sets of models, the
// second for a level the loader finds no key on, except a hidden level and
// the mode that plays one pack of its own, which keep the first (docs/tgi.md).
test("the second set of skins is drawn by the bonus levels and no others", () => {
  const { skins } = objects;
  const BONUS_SLOTS = [15, 16, 17];
  const second = mapData.levels.filter((l) => lookOf(skins, l, 0).bonus);
  assert.ok(
    mapData.levels.some((l) => l.pack === skins.copycat),
    `no pack is ${skins.copycat}`,
  );
  assert.deepEqual(
    second.map((l) => l.name),
    mapData.levels
      .filter((l) => BONUS_SLOTS.includes(l.index) && !l.pack.endsWith("FI.PAK"))
      .map((l) => l.name),
  );
  assert.equal(second.length, BONUS_SLOTS.length * mapData.themes.length);
});
