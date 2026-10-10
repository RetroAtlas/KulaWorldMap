import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations, objects } from "./fixtures.js";
import { lookOf } from "../../public/js/skins.js";
import { setObjects, motionOf, paintsFace, ballFor, markerModel } from "../../public/js/data.js";
import { state } from "../../public/js/state.js";

setObjects(objects);
// The starts are drawn as the ball.
const STARTS = new Set([29, 30]);

const placed = new Set(
  mapData.levels.flatMap((l) => l.records.flatMap((r) => r.on.map((o) => o.type))),
);
const drawn = new Set(Object.keys(objects.types).map(Number));

// A face's paint is a model of the loader's own, not the placeholder every unplaced type shares.
const PLACEHOLDER = 8;
const painted = (t) => {
  const model = objects.skins.sets.arcade.types[String(t)];
  return paintsFace(t) && !!model && !model.every((tex) => tex === PLACEHOLDER);
};

test("every placed type is drawn, or is one drawn on the face", () => {
  for (const t of placed) assert.ok(drawn.has(t) || painted(t) || STARTS.has(t), `type ${t}`);
  for (const t of drawn) assert.ok(placed.has(t), `type ${t} is drawn but never placed`);
  assert.equal(objects.balls.length, 14);
});

test("the ball moves as itself on a clock start as on any other", () => {
  const ball = motionOf({ face: 0, type: 30 });
  assert.ok(ball?.breathe);
  assert.equal(motionOf({ face: 0, type: 29 }), ball);
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

// A level with no key draws the second set of skins, unless it is a hidden
// level or the copycat pack (docs/tgi.md).
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

test("twenty-seven of the placed types are drawn as meshes of their own", () => {
  assert.equal([...placed].filter((t) => drawn.has(t)).length, 27);
});

// The game turns a bonus level's ball with a counter the level cannot know;
// the map stands the slot in for it where the level has one.
test("the ball follows the hidden flag and the keys, the slot standing in for the game's counter", () => {
  state.data = mapData;
  const { skins, balls } = objects;
  for (const l of mapData.levels) {
    const world = mapData.themes.findIndex((t) => t.id === l.theme);
    const slot = l.pack.endsWith("FI.PAK") ? 0 : l.index;
    const design = slot === 18 ? 13 : slot >= 15 && slot < 18 ? 10 + slot - 15 : world;
    assert.equal(ballFor(l), balls[design], l.name);
  }
  const level = (records, pack = "/HELL/HELL.PAK", index = 3) => ({
    theme: "HELL",
    pack,
    index,
    records,
  });
  const block = (...types) => ({ kind: 0, on: types.map((type, face) => ({ face, type })) });
  const settings = { kind: skins.hidden.kind, type: skins.hidden.type, on: [] };
  const COIN = 37;
  assert.equal(ballFor(level([block(skins.keys.type)])), balls[9]);
  assert.equal(ballFor(level([block(COIN)])), balls[10]);
  assert.equal(ballFor(level([block(COIN)], "/HELL/HELL.PAK", 16)), balls[11]);
  assert.equal(ballFor(level([block(COIN), settings])), balls[13]);
  assert.equal(ballFor(level([block(COIN)], skins.copycat)), balls[9]);
});

test("the exit starts shut where the level has a key, and open where it has none", () => {
  state.data = mapData;
  const { skins, types } = objects;
  const EXIT = 7;
  const exit = { face: 0, type: EXIT, f: [], v: 0, variant: null };
  const level = (...on) => ({
    theme: "HIRO",
    pack: "/HIRO/HIRO.PAK",
    index: 0,
    records: [{ kind: 0, on: on.map((type, face) => ({ face, type })) }],
  });
  assert.equal(markerModel(exit, level(EXIT, skins.keys.type)), types[EXIT][1]);
  assert.equal(markerModel(exit, level(EXIT)), types[EXIT][0]);
  for (const l of mapData.levels) {
    const exits = l.records.flatMap((r) => r.on.filter((o) => o.type === EXIT));
    for (const o of exits)
      assert.equal(markerModel({ ...o, variant: null }, l), types[EXIT][1], l.name);
  }
});
