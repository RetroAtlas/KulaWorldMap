import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, levelKey, CAMERA_KIND, UNPLACED_KIND } from "./fixtures.js";

const FACES = 6;

const cellsOf = (l) => {
  const map = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    map.set(l.cells.slice(i, i + 3).join(","), l.cells[i + 3]);
  }
  return map;
};
const at = (r) => `${r.x},${r.y},${r.z}`;
const names = (cells, l, k) => cells.get(at(l.records[k])) === mapData.firstRecord + k;

test("the pack path and the index inside it are the key", () => {
  const keys = mapData.levels.map(levelKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("every world lists its own levels, and between them all of them", () => {
  const seen = [];
  for (const t of mapData.themes) {
    for (const i of t.levels) {
      assert.equal(mapData.levels[i].theme, t.id);
      seen.push(i);
    }
  }
  assert.deepEqual(
    seen,
    mapData.levels.map((_, i) => i),
  );
});

test("a record is a block carrying up to six objects, one to a face", () => {
  for (const l of mapData.levels) {
    for (const r of l.records) {
      const where = `${l.name} record at ${at(r)}`;
      for (const c of [r.x, r.y, r.z]) assert.ok(c >= 0 && c < mapData.side, where);
      assert.notEqual(r.kind, CAMERA_KIND, where);
      assert.ok(r.on.length <= FACES, `${where} carries ${r.on.length}`);
      assert.equal(new Set(r.on.map((o) => o.face)).size, r.on.length, `${where} doubles a face`);
      for (const o of r.on) {
        assert.ok(o.face >= 0 && o.face < FACES, `${where} face ${o.face}`);
        assert.ok(o.type > 0, `${where} face ${o.face} is bare`);
        // a kind with a payload of its own keeps its first two slots for it
        if ("type" in r) assert.ok(o.face >= 2, `${where} kind ${r.kind} face ${o.face}`);
      }
    }
  }
});

test("a cell holds a block style or names a record that names it back", () => {
  for (const l of mapData.levels) {
    for (let i = 0; i < l.cells.length; i += 4) {
      const [x, y, z, v] = l.cells.slice(i, i + 4);
      for (const c of [x, y, z]) assert.ok(c >= 0 && c < mapData.side, `${l.name} ${x},${y},${z}`);
      if (v < mapData.firstRecord) {
        assert.ok(v < mapData.styles, `${l.name} cell ${x},${y},${z} has style ${v}`);
        continue;
      }
      const k = v - mapData.firstRecord;
      const r = l.records[k];
      assert.ok(r, `${l.name} cell ${x},${y},${z} names record ${k} of ${l.records.length}`);
      assert.deepEqual([r.x, r.y, r.z], [x, y, z], `${l.name} record ${k}`);
    }
  }
});

test("every object stands on a placed cell", () => {
  for (const l of mapData.levels) {
    const cells = cellsOf(l);
    l.records.forEach((r, k) => {
      if (r.on.length) assert.ok(names(cells, l, k), `${l.name}: objects at ${at(r)}`);
    });
  }
});

test("kind 9 is named by no cell, carries nothing, and ends the records", () => {
  for (const l of mapData.levels) {
    const cells = cellsOf(l);
    l.records.forEach((r, k) => {
      const where = `${l.name} record ${k} at ${at(r)}`;
      assert.equal(names(cells, l, k), r.kind !== UNPLACED_KIND, where);
      if (r.kind !== UNPLACED_KIND) return;
      assert.equal(r.on.length, 0, where);
      assert.equal(k, l.records.length - 1, where);
    });
  }
});

test("the extent is the extent of the cells", () => {
  for (const l of mapData.levels) {
    const axes = [0, 1, 2].map((a) => {
      const vs = [];
      for (let i = 0; i < l.cells.length; i += 4) vs.push(l.cells[i + a]);
      return [Math.min(...vs), Math.max(...vs)];
    });
    assert.deepEqual(
      l.min,
      axes.map(([lo]) => lo),
      `${l.name}`,
    );
    assert.deepEqual(
      l.max,
      axes.map(([, hi]) => hi),
      `${l.name}`,
    );
    assert.equal(l.placed, l.cells.length / 4, `${l.name}`);
  }
});

test("the camera looks at a cell of the lattice", () => {
  for (const l of mapData.levels) {
    assert.ok(l.camera, `${l.name} has no camera`);
    assert.equal(l.camera.look.length, 3, `${l.name}`);
    for (const c of l.camera.look)
      assert.ok(c >= 0 && c < mapData.side, `${l.name}: ${l.camera.look}`);
    assert.equal(l.camera.angle.length, 2, `${l.name}`);
    assert.ok(Number.isInteger(l.camera.time), `${l.name}: time ${l.camera.time}`);
  }
});
