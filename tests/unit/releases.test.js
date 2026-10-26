import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, packs, releases, levelKey, TRAILER_KIND } from "./fixtures.js";

const [us, eu, jp] = releases;
const FACES = 6;
const SECTOR = 2048;
const KEYS = [
  "id",
  "label",
  "name",
  "region",
  "serial",
  "boot",
  "sectors",
  "rules",
  "packs",
  "levels",
];
const base = new Map(mapData.levels.map((l) => [levelKey(l), l]));
const variants = (r) => Object.entries(r.levels);
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const WORDS = "no one two three four five six seven eight nine ten eleven twelve thirteen".split(
  " ",
);
const number = (s) => (WORDS.includes(s) ? WORDS.indexOf(s) : Number(s));

test("the three files are the US, PAL and Japanese releases, each its identity, rules, layout and levels", () => {
  assert.deepEqual(
    releases.map((r) => r.id),
    ["us", "eu", "jp"],
  );
  for (const r of releases) {
    assert.deepEqual(Object.keys(r), KEYS, r.id);
    for (const k of ["label", "name", "region", "serial", "boot"])
      assert.ok(typeof r[k] === "string" && r[k].length, `${r.id} ${k}`);
    assert.ok(Number.isInteger(r.sectors) && r.sectors > 0, r.id);
    for (const k of ["rules", "packs", "levels"])
      assert.ok(r[k] && typeof r[k] === "object" && !Array.isArray(r[k]), `${r.id} ${k}`);
  }
});

test("the US file has no variant, and its layout is packs.json", () => {
  assert.deepEqual(us.levels, {});
  assert.deepEqual(us.packs, packs);
});

test("every variant is a slot of the base whose level differs from it, named for its release", () => {
  for (const r of releases) {
    for (const [key, v] of variants(r)) {
      const b = base.get(key);
      assert.ok(b, `${r.id} ${key} is no slot of the base`);
      assert.equal(v.release, r.id, key);
      assert.deepEqual(
        [v.pack, v.index, v.theme, v.shown],
        [b.pack, b.index, b.theme, b.shown],
        key,
      );
      assert.deepEqual(Object.keys(v).sort(), [...Object.keys(b), "release"].sort(), key);
      assert.ok(
        ["cells", "records", "time", "name"].some((k) => differs(v[k], b[k])),
        `${r.id} ${key} is the base's level`,
      );
    }
  }
});

test("a variant has the shape of a shipped level", () => {
  const { side, firstRecord, styles } = mapData;
  for (const r of releases) {
    for (const [key, v] of variants(r)) {
      assert.ok(Number.isInteger(v.time) && v.time > 0 && v.time <= 99, `${key}: time ${v.time}`);
      assert.equal(v.placed, v.cells.length / 4, key);
      const cells = new Map();
      for (let i = 0; i < v.cells.length; i += 4) {
        const [x, y, z, c] = v.cells.slice(i, i + 4);
        for (const n of [x, y, z]) assert.ok(n >= 0 && n < side, `${key} ${x},${y},${z}`);
        cells.set(`${x},${y},${z}`, c);
        if (c < firstRecord) assert.ok(c < styles, `${key} cell ${x},${y},${z} has style ${c}`);
        else {
          const rec = v.records[c - firstRecord];
          assert.ok(rec, `${key} cell ${x},${y},${z} names record ${c - firstRecord}`);
          assert.deepEqual([rec.x, rec.y, rec.z], [x, y, z], `${key} record ${c - firstRecord}`);
        }
      }
      [0, 1, 2].forEach((a) => {
        const vs = [...cells.keys()].map((k) => Number(k.split(",")[a]));
        assert.deepEqual([v.min[a], v.max[a]], [Math.min(...vs), Math.max(...vs)], key);
      });
      v.records.forEach((rec, k) => {
        const where = `${key} record ${k}`;
        assert.notEqual(rec.kind, TRAILER_KIND, where);
        assert.ok(rec.on.length <= FACES, where);
        assert.equal(new Set(rec.on.map((o) => o.face)).size, rec.on.length, where);
        for (const o of rec.on) assert.ok(o.face >= 0 && o.face < FACES && o.type > 0, where);
        if (rec.on.length)
          assert.equal(cells.get(`${rec.x},${rec.y},${rec.z}`), firstRecord + k, where);
      });
    }
  }
});

test("the PAL disc differs in five slots and the Japanese in thirteen, LEVEL 132's among both", () => {
  assert.equal(variants(eu).length, 5);
  assert.equal(variants(jp).length, 13);
  for (const r of [eu, jp]) assert.ok("/MARS/MARS.PAK#11" in r.levels, r.id);
});

test("each layout names the packs of packs.json in order, with the room and one slot a level", () => {
  for (const r of releases) {
    assert.deepEqual(Object.keys(r.packs), ["room", "packs"], r.id);
    assert.deepEqual(Object.keys(r.packs.room), ["path", "lba", "size"], r.id);
    assert.equal(r.packs.room.path, packs.room.path, r.id);
    assert.deepEqual(
      r.packs.packs.map((p) => p.path),
      packs.packs.map((p) => p.path),
      r.id,
    );
    for (const p of r.packs.packs) {
      const where = `${r.id} ${p.path}`;
      assert.deepEqual(Object.keys(p), ["path", "lba", "size", "capacity", "slots"], where);
      assert.ok(p.size > 0 && p.size <= p.capacity, where);
      assert.equal(p.capacity, Math.ceil(p.size / SECTOR) * SECTOR, where);
      assert.equal(p.slots.length, packs.packs.find((q) => q.path === p.path).slots.length, where);
      for (const s of p.slots) {
        assert.deepEqual(Object.keys(s), ["name", "size", "size9"], `${where} ${s.name}`);
        assert.ok(typeof s.name === "string" && s.name.length, where);
        assert.ok(Number.isInteger(s.size) && s.size > 0, `${where} ${s.name}`);
        assert.ok(
          Number.isInteger(s.size9) && s.size9 > 0 && s.size9 <= s.size,
          `${where} ${s.name}`,
        );
      }
    }
    const runs = r.packs.packs
      .map((p) => [p.lba, p.lba + p.capacity / SECTOR])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < runs.length; i++)
      assert.ok(runs[i][0] >= runs[i - 1][1], `${r.id} ${runs[i]}`);
    assert.ok(r.packs.room.lba >= runs[runs.length - 1][1], r.id);
    assert.ok(r.packs.room.size > Math.max(...r.packs.packs.map((p) => p.capacity)), r.id);
  }
});

test("the rules are what each release's executable sets", () => {
  const each = (f) => releases.map((r) => f(r.rules));
  assert.deepEqual(
    each((x) => x.hz),
    [60, 50, 60],
  );
  assert.deepEqual(
    each((x) => x.clock.default),
    [4950, 4950, 7140],
  );
  assert.deepEqual(
    each((x) => x.clock.swap),
    [null, null, [5940, 7140]],
  );
  assert.deepEqual(
    each((x) => x.clock.shown),
    [60, 50, 60],
  );
  assert.deepEqual(
    each((x) => x.hourglass.from),
    [5999, 4999, 7199],
  );
  const most = ({ from, second, points }) =>
    second === null ? 0 : points * Math.floor(from / second);
  assert.deepEqual(
    each((x) => most(x.hourglass)),
    [1190, 990, 0],
  );
});

test("the README's sentence on the slots that differ is what the files hold", () => {
  const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");
  const m =
    /share (\d+) of their (\d+) levels byte for byte, the PAL disc differing in (\w+) slots and the Japanese in (\w+)/.exec(
      readme,
    );
  assert.ok(m, "the README has no sentence on the slots that differ");
  const differing = new Set(releases.flatMap((r) => Object.keys(r.levels)));
  assert.deepEqual(m.slice(1).map(number), [
    mapData.levels.length - differing.size,
    mapData.levels.length,
    variants(eu).length,
    variants(jp).length,
  ]);
});
