import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { annotations, mapData, most, packs, releases, levelKey, TRAILER_KIND } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import {
  compose,
  current,
  differs as differsOn,
  discWord,
  layoutOf,
  levelOn,
  levelsOf,
  releaseOf,
  releases as known,
  rulesOf,
  setCurrent,
  setReleases,
} from "../../public/js/viewer/release.js";
import { blank, toLevel } from "../../public/js/format/project.js";
import {
  levelAt,
  levelMarkers,
  levelScore,
  levelsIn,
  markerPoints,
  markerStats,
  setAnnotations,
} from "../../public/js/viewer/data.js";

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

state.data = mapData;
const VARIANT = "/MARS/MARS.PAK#11";
const slot = (key) => mapData.levels.findIndex((l) => levelKey(l) === key);

test("a release's levels are the base's slot for slot, its variants in place and every other slot the base's own object", () => {
  setReleases(releases);
  for (const r of releases) {
    const levels = levelsOf(r.id);
    assert.equal(levels.length, mapData.levels.length, r.id);
    levels.forEach((l, i) => {
      const b = mapData.levels[i];
      assert.deepEqual([l.pack, l.index, l.theme], [b.pack, b.index, b.theme], `${r.id} ${i}`);
      assert.equal(l, r.levels[levelKey(b)] ?? b, `${r.id} ${levelKey(b)}`);
    });
    assert.equal(levels.filter((l, i) => l !== mapData.levels[i]).length, variants(r).length, r.id);
  }
});

test("a release's levels are built once for the data and again for other data or other files", () => {
  setReleases(releases);
  const first = levelsOf("eu");
  assert.equal(levelsOf("eu"), first);
  assert.equal(levelsOf("eu")[slot(VARIANT)], eu.levels[VARIANT]);
  state.data = { ...mapData, levels: mapData.levels.slice(0, 1) };
  assert.equal(levelsOf("eu").length, 1);
  state.data = mapData;
  const again = levelsOf("eu");
  assert.notEqual(again, first);
  assert.deepEqual(again, first);
  setReleases(releases);
  assert.notEqual(levelsOf("eu"), again);
});

test("the level on a release at a slot is its variant there, the base's elsewhere, and a draft is handed back as it is", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  const base = mapData.levels[slot(VARIANT)];
  assert.equal(levelOn(base, "eu"), eu.levels[VARIANT]);
  assert.equal(levelOn(base, "jp"), jp.levels[VARIANT]);
  assert.equal(levelOn(eu.levels[VARIANT], "us"), base);
  assert.equal(levelOn(jp.levels[VARIANT], "eu"), eu.levels[VARIANT]);
  assert.equal(levelOn(base), base);
  setCurrent("eu");
  assert.equal(levelOn(base), eu.levels[VARIANT]);
  const same = mapData.levels[0];
  assert.deepEqual(differsOn(levelKey(same)), []);
  assert.equal(levelOn(same, "jp"), same);
  const draft = toLevel(blank("HIRO"), 1);
  assert.equal(levelOn(draft), draft);
  assert.equal(levelOn(draft, "jp"), draft);
});

test("the releases a slot differs on are those whose file holds it, and none for an identical slot", () => {
  setReleases(releases);
  assert.deepEqual(differsOn(VARIANT), ["eu", "jp"]);
  assert.deepEqual(differsOn(levelKey(mapData.levels[0])), []);
  for (const r of releases)
    for (const key of Object.keys(r.levels))
      assert.ok(differsOn(key).includes(r.id), `${r.id} ${key}`);
});

test("the release shown is the base until a loaded one is chosen, and an unknown id changes nothing", (t) => {
  t.after(() => {
    setReleases(releases);
    setCurrent("us");
  });
  setReleases(releases);
  assert.equal(current(), "us");
  setCurrent("jp");
  assert.equal(current(), "jp");
  setCurrent("pal");
  assert.equal(current(), "jp");
  setReleases([us, eu, null]);
  assert.equal(current(), "us");
});

test("the word for a disc is the map's, PAL for the European release and Japanese for the Japanese one, and the file's region where the map has none", () => {
  setReleases(releases);
  assert.equal(discWord("us"), "North American");
  assert.equal(discWord("eu"), "PAL");
  assert.equal(discWord("jp"), "Japanese");
  setReleases([...releases, { ...eu, id: "au", region: "Australia", levels: {} }]);
  assert.equal(discWord("au"), "Australia");
  assert.equal(discWord("nz"), "nz");
  setReleases(releases);
});

test("a file that did not load leaves its release out, and the base is built in where its own file is missing", () => {
  setReleases([us, null, jp]);
  assert.deepEqual(
    known().map((r) => r.id),
    ["us", "jp"],
  );
  assert.equal(releaseOf("eu"), null);
  assert.deepEqual(differsOn(VARIANT), ["jp"]);
  assert.equal(levelsOf("eu")[slot(VARIANT)], mapData.levels[slot(VARIANT)]);
  setReleases([null, eu, jp]);
  assert.deepEqual(
    known().map((r) => r.id),
    ["us", "eu", "jp"],
  );
  assert.deepEqual(releaseOf("us"), { id: "us", label: "US", name: "Roll Away", levels: {} });
  assert.equal(levelsOf("us")[slot(VARIANT)], mapData.levels[slot(VARIANT)]);
  assert.equal(layoutOf("us"), null);
  assert.equal(rulesOf("us"), null);
  setReleases(releases);
  assert.equal(releaseOf("us"), us);
  assert.equal(layoutOf("eu"), eu.packs);
  assert.equal(rulesOf("jp"), jp.rules);
});

test("a composed entry takes the overlay's keys, loses one the overlay nulls and keeps the rest of the base", () => {
  const base = { name: "Hourglass", points: 1190, note: "Flips the timer." };
  assert.deepEqual(compose(base, { points: 990, score: 7 }), {
    name: "Hourglass",
    points: 990,
    note: "Flips the timer.",
    score: 7,
  });
  assert.deepEqual(compose(base, { note: null }), { name: "Hourglass", points: 1190 });
  assert.equal(compose(base, undefined), base);
  assert.deepEqual(base, { name: "Hourglass", points: 1190, note: "Flips the timer." });
});

const HELL = "/HELL/HELL.PAK";
const LEVEL_102 = "/ATLANT/ATLANT.PAK#11";
const BONUS_26 = "/MARS/MARS.PAK#16";
const HOURGLASS = 35;
const GEM = 36;

test("a slot's level and a pack's levels are the release shown's", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  const variant = eu.levels[`${HELL}#17`];
  const shipped = mapData.levels.filter((l) => l.pack === HELL);
  setCurrent("eu");
  assert.equal(levelAt(HELL, 17), variant);
  assert.ok(levelsIn(HELL).includes(variant));
  assert.equal(levelsIn(HELL).length, shipped.length);
  setCurrent("us");
  assert.equal(levelAt(HELL, 17), mapData.levels[slot(`${HELL}#17`)]);
  assert.deepEqual(levelsIn(HELL), shipped);
  assert.equal(levelAt(HELL, shipped.length), null);
});

test("an annotation is read with its override for the release shown, a null taking a score away", (t) => {
  t.after(() => {
    setCurrent("us");
    setAnnotations(annotations);
  });
  setReleases(releases);
  setAnnotations({
    ...annotations,
    levels: {
      ...annotations.levels,
      [LEVEL_102]: { ...annotations.levels[LEVEL_102], releases: { jp: { score: null } } },
    },
    types: {
      ...annotations.types,
      [HOURGLASS]: { ...annotations.types[HOURGLASS], releases: { eu: { points: 990 } } },
    },
  });
  const level = mapData.levels[slot(LEVEL_102)];
  const hourglass = levelMarkers(mapData.levels[slot("/HIRO/HIRO.PAK#5")]).find(
    (m) => m.face !== null && m.type === HOURGLASS,
  );
  assert.equal(levelScore(level), 23115);
  assert.equal(markerPoints(hourglass), 1190);
  setCurrent("jp");
  assert.equal(levelScore(level), null);
  assert.equal(markerPoints(hourglass), 1190);
  setCurrent("eu");
  assert.equal(levelScore(level), 23115);
  assert.equal(markerPoints(hourglass), 990);
});

test("the hourglass's points under each release are what its rules make of the clock it turns", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  setAnnotations(annotations);
  const hourglass = levelMarkers(mapData.levels[slot("/HIRO/HIRO.PAK#5")]).find(
    (m) => m.face !== null && m.type === HOURGLASS,
  );
  for (const r of releases) {
    setCurrent(r.id);
    assert.equal(markerPoints(hourglass), most(r.rules.hourglass), r.id);
  }
});

test("the statistics count the release shown's levels, so a type the Japanese disc removes is placed fewer times under it", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  const gems = (levels) =>
    levels.reduce(
      (n, l) => n + l.records.reduce((k, r) => k + r.on.filter((o) => o.type === GEM).length, 0),
      0,
    );
  const placed = (stats) =>
    [...stats]
      .filter(([id]) => id.split("/")[0] === `t${GEM}`)
      .reduce((n, [, s]) => n + s.total, 0);
  const onJp = mapData.levels.map((l) => jp.levels[levelKey(l)] ?? l);
  assert.equal(placed(markerStats()), gems(mapData.levels));
  assert.equal(placed(markerStats("jp")), gems(onJp));
  setCurrent("jp");
  assert.equal(placed(markerStats()), gems(onJp));
  assert.ok(gems(onJp) < gems(mapData.levels));
  assert.equal(gems([mapData.levels[slot(BONUS_26)]]) - gems([jp.levels[BONUS_26]]), 3);
});
