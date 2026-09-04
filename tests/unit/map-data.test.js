import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, levelKey } from "./fixtures.js";

const cellsOf = (l) => {
  const set = new Set();
  for (let i = 0; i < l.cells.length; i += 4) set.add(l.cells.slice(i, i + 3).join(","));
  return set;
};

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

test("a record holds one entity, and the last one is the start", () => {
  for (const l of mapData.levels) {
    assert.equal(l.objects.length, l.records - 1, `${l.name}`);
    assert.ok(l.start, `${l.name} has no start`);
    assert.ok(
      l.objects.every((o) => o.kind !== mapData.startKind),
      `${l.name}`,
    );
    assert.deepEqual(
      l.objects.map((o) => o.r),
      l.objects.map((_, i) => i),
      `${l.name}`,
    );
  }
});

test("a cell holds a block style or names a record that names it back", () => {
  for (const l of mapData.levels) {
    const byRecord = new Map(l.objects.map((o) => [o.r, o]));
    for (let i = 0; i < l.cells.length; i += 4) {
      const [x, y, z, v] = l.cells.slice(i, i + 4);
      for (const c of [x, y, z]) assert.ok(c >= 0 && c < mapData.side, `${l.name} ${x},${y},${z}`);
      if (v < mapData.firstRecord) {
        assert.ok(v < mapData.styles, `${l.name} cell ${x},${y},${z} has style ${v}`);
        continue;
      }
      const r = v - mapData.firstRecord;
      assert.ok(r < l.records, `${l.name} cell ${x},${y},${z} names record ${r}`);
      const o = byRecord.get(r);
      // the start is the one record a cell can name that is not in the object
      // list, since it is not a thing standing on a block
      if (o) assert.deepEqual([o.x, o.y, o.z], [x, y, z], `${l.name} record ${r}`);
      else assert.deepEqual(l.start.at, [x, y, z], `${l.name} record ${r}`);
    }
  }
});

test("every object stands on a placed cell", () => {
  for (const l of mapData.levels) {
    const cells = cellsOf(l);
    for (const o of l.objects) {
      assert.ok(cells.has(`${o.x},${o.y},${o.z}`), `${l.name}: object at ${o.x},${o.y},${o.z}`);
    }
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

test("the start looks at a cell of the lattice", () => {
  for (const l of mapData.levels) {
    for (const p of [l.start.at, l.start.look]) {
      for (const c of p) assert.ok(c >= 0 && c < mapData.side, `${l.name}: ${p}`);
    }
  }
});
