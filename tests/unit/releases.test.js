import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  annotations,
  mapData,
  most,
  objects,
  packs,
  releases,
  levelKey,
  TRAILER_KIND,
} from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import {
  compose,
  current,
  differs as differsOn,
  discWord,
  layoutOf,
  levelOn,
  levelsOf,
  nameOf,
  releaseOf,
  releases as known,
  rulesOf,
  setCurrent,
  setReleases,
} from "../../public/js/viewer/release.js";
import { blank, toLevel } from "../../public/js/format/project.js";
import {
  jumpTable,
  levelAt,
  levelMarkers,
  levelScore,
  levelsIn,
  markerModel,
  markerPoints,
  markerStats,
  setAnnotations,
  setObjects,
  typeModels,
  worldTint,
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
  "art",
  "objects",
  "levels",
];
const READINGS = ["jump.skip", "shadow.sprite", "shadow.sprites", "effect.sprites"];
const base = new Map(mapData.levels.map((l) => [levelKey(l), l]));
const variants = (r) => Object.entries(r.levels);
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const WORDS = "no one two three four five six seven eight nine ten eleven twelve thirteen".split(
  " ",
);
const number = (s) => (WORDS.includes(s) ? WORDS.indexOf(s) : Number(s));

test("the three files are the US, PAL and Japanese releases, each its identity, rules, layout, art, objects and levels", () => {
  assert.deepEqual(
    releases.map((r) => r.id),
    ["us", "eu", "jp"],
  );
  for (const r of releases) {
    assert.deepEqual(Object.keys(r), KEYS, r.id);
    for (const k of ["label", "name", "region", "serial", "boot"])
      assert.ok(typeof r[k] === "string" && r[k].length, `${r.id} ${k}`);
    assert.ok(Number.isInteger(r.sectors) && r.sectors > 0, r.id);
    for (const k of ["rules", "packs", "art", "objects", "levels"])
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

const themes = mapData.themes.map((t) => t.id);
const under = (path) => fileURLToPath(new URL(`../../public/${path}`, import.meta.url));
/** A PNG's width and height, off its header. */
const size = (path) => {
  const png = readFileSync(under(path));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

test("the base's art is a digest a world of the data, with no sheet and no tint of its own", () => {
  assert.deepEqual(Object.keys(us.art), ["quads", "sheets", "tint"]);
  assert.deepEqual(Object.keys(us.art.quads), themes);
  for (const [world, digest] of Object.entries(us.art.quads))
    assert.match(digest, /^[0-9a-f]{64}$/, world);
  assert.deepEqual([us.art.sheets, us.art.tint], [{}, {}]);
});

test("every release's quads are the base's quads, so a cell of a sheet means the same texture on every disc", () => {
  for (const r of releases) {
    assert.deepEqual(Object.keys(r.art), ["quads", "sheets", "tint"], r.id);
    assert.deepEqual(r.art.quads, us.art.quads, r.id);
  }
});

test("a release's sheets are files under its own directory of the US atlas's size, a world of the data each, and nothing else lies there", () => {
  for (const r of releases) {
    const named = new Set();
    for (const [world, paths] of Object.entries(r.art.sheets)) {
      assert.ok(themes.includes(world), `${r.id} ${world}`);
      assert.ok(paths.length > 0, `${r.id} ${world}`);
      for (const path of paths) {
        assert.match(path, new RegExp(`^tex/${r.id}/\\w+\\.png$`), `${r.id} ${world}`);
        assert.deepEqual(size(path), size(`tex/${world}.png`), `${r.id} ${path}`);
        named.add(path.split("/").pop());
      }
    }
    const folder = under(`tex/${r.id}`);
    const lying = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith(".png")) : [];
    assert.deepEqual(lying.sort(), [...named].sort(), r.id);
  }
});

test("a release's tint names only worlds of the data, a triple of bytes each, none the US tint of its world", () => {
  for (const r of releases) {
    for (const [world, tint] of Object.entries(r.art.tint)) {
      assert.ok(themes.includes(world), `${r.id} ${world}`);
      assert.equal(tint.length, 3, `${r.id} ${world}`);
      for (const v of tint) assert.ok(Number.isInteger(v) && v >= 0 && v < 256, `${r.id} ${world}`);
      assert.notDeepEqual(tint, objects.skins.tint[world], `${r.id} ${world}`);
    }
  }
});

test("the PAL disc draws HIRO otherwise and tints no world; the Japanese disc draws every world otherwise, HAZE on a sheet of its own, and tints HAZE alone", () => {
  assert.deepEqual(eu.art.sheets, { HIRO: ["tex/eu/HIRO.png"] });
  assert.deepEqual(eu.art.tint, {});
  assert.deepEqual(Object.keys(jp.art.sheets), themes);
  for (const world of themes)
    assert.deepEqual(
      jp.art.sheets[world],
      world === "HAZE" ? ["tex/jp/all.png", "tex/jp/HAZE.png"] : ["tex/jp/all.png"],
      world,
    );
  assert.deepEqual(Object.keys(jp.art.tint), ["HAZE"]);
});

test("every release's objects carry the base's four readings, the types its disc draws otherwise and the arc, and the base's own carry no type and no arc", () => {
  for (const r of releases) {
    assert.deepEqual(Object.keys(r.objects), ["readings", "types", "jump"], r.id);
    assert.deepEqual(Object.keys(r.objects.readings), READINGS, r.id);
    for (const v of Object.values(r.objects.readings))
      assert.ok(Number.isInteger(v) && v >= 0, r.id);
    assert.deepEqual(r.objects.readings, us.objects.readings, r.id);
  }
  assert.deepEqual([us.objects.types, us.objects.jump], [{}, {}]);
});

/** A model as objects.json ships one: its polygons name its vertices, each with a colour a corner. */
function shaped(m, where) {
  const own = Object.keys(m).filter((k) => !["normals", "sorted", "blend"].includes(k));
  assert.deepEqual(own, ["box", "frames", "polys", "rgb", "flags"], where);
  const n = m.frames[0].length / 3;
  assert.ok(Number.isInteger(n) && n > 0, where);
  for (const f of m.frames) assert.equal(f.length, n * 3, `${where} frames`);
  assert.equal(m.polys.length, m.rgb.length, where);
  assert.equal(m.polys.length, m.flags.length, where);
  m.polys.forEach((p, i) => {
    assert.ok(p.length === 3 || p.length === 4, `${where} polygon ${i}`);
    for (const v of p) assert.ok(v >= 0 && v < n, `${where} polygon ${i} names ${v}`);
    assert.equal(m.rgb[i].length, p.length * 3, `${where} polygon ${i} colours`);
  });
  const [lo, hi] = m.box;
  assert.deepEqual([lo.length, hi.length], [3, 3], `${where} box`);
  for (let i = 0; i < 3; i++) assert.ok(lo[i] <= hi[i], `${where} box`);
}

test("a release's types name types of objects.json, a whole list of the base's length each, every model shaped as the base's are and no list the base's, and its arc is a count over rows of three", () => {
  for (const r of releases) {
    for (const [t, models] of Object.entries(r.objects.types)) {
      const where = `${r.id} type ${t}`;
      assert.ok(t in objects.types, where);
      assert.equal(models.length, objects.types[t].length, where);
      models.forEach((m, i) => shaped(m, `${where} model ${i}`));
      assert.ok(differs(models, objects.types[t]), `${where} is the base's list`);
    }
    if (Object.keys(r.objects.jump).length === 0) continue;
    assert.deepEqual(Object.keys(r.objects.jump), ["count", "rows"], r.id);
    const { count, rows } = r.objects.jump;
    assert.ok(Number.isInteger(count) && count > 0 && rows.length > 0, r.id);
    for (const row of rows) {
      assert.equal(row.length, 3, r.id);
      for (const v of row) assert.ok(Number.isInteger(v), r.id);
    }
    assert.ok(differs(r.objects.jump, objects.jump), `${r.id} arc is the base's`);
  }
});

test("the PAL disc draws the arrow otherwise and jumps along an arc of 27 rows; the Japanese disc draws the exits, the hidden exit and the lethargy pill otherwise and jumps along the base's arc", () => {
  assert.deepEqual(Object.keys(eu.objects.types), ["28"]);
  assert.equal(eu.objects.jump.rows.length, 27);
  assert.deepEqual(Object.keys(jp.objects.types), ["7", "26", "32"]);
  assert.deepEqual(jp.objects.jump, {});
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
    each((x) => x.clock.plus),
    [1, 1, 1],
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
  assert.equal(nameOf(eu), `${eu.name}, the PAL release (${eu.serial})`);
  assert.equal(nameOf({ id: "us", name: "Roll Away" }), "Roll Away, the North American release");
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

test("a world's colour untextured is the release shown's tint where its file has one and the base's otherwise, so HAZE takes the Japanese disc's", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  setObjects(objects);
  const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  for (const r of releases) {
    setCurrent(r.id);
    for (const world of themes)
      assert.equal(
        worldTint(world),
        hex(r.art.tint[world] ?? objects.skins.tint[world]),
        `${r.id} ${world}`,
      );
  }
  setCurrent("jp");
  assert.notEqual(worldTint("HAZE"), hex(objects.skins.tint.HAZE));
  assert.equal(worldTint("ARCTIC"), hex(objects.skins.tint.ARCTIC));
  assert.equal(worldTint("NOWHERE"), null);
});

const EXIT = 7;
const ARROW = 28;
const LESSON = "/HIRO/HIRO.PAK#19";

test("a type's models are the release shown's where its file carries the list and the base's otherwise, the file's own objects, so the Japanese disc draws its exit and the PAL disc its arrow", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  setObjects(objects);
  setAnnotations(annotations);
  const lesson = mapData.levels[slot(LESSON)];
  const exit = levelMarkers(lesson).find((m) => m.face !== null && m.type === EXIT);
  assert.equal(typeModels(EXIT), objects.types[EXIT]);
  assert.equal(typeModels(ARROW), objects.types[ARROW]);
  assert.ok(objects.types[EXIT].includes(markerModel(exit, lesson)));
  setCurrent("jp");
  assert.equal(typeModels(EXIT), jp.objects.types[EXIT]);
  assert.equal(typeModels(ARROW), objects.types[ARROW]);
  assert.ok(jp.objects.types[EXIT].includes(markerModel(exit, lesson)));
  assert.ok(!objects.types[EXIT].includes(markerModel(exit, lesson)));
  setCurrent("eu");
  assert.equal(typeModels(EXIT), objects.types[EXIT]);
  assert.equal(typeModels(ARROW), eu.objects.types[ARROW]);
  assert.deepEqual(typeModels(999), []);
});

test("the jump's arc is the release shown's where its file carries rows and the base's otherwise, so the PAL disc jumps along its own 27 rows and the Japanese disc along the base's", (t) => {
  t.after(() => setCurrent("us"));
  setReleases(releases);
  setObjects(objects);
  assert.equal(jumpTable(), objects.jump);
  setCurrent("eu");
  assert.equal(jumpTable(), eu.objects.jump);
  assert.equal(jumpTable().rows.length, 27);
  setCurrent("jp");
  assert.equal(jumpTable(), objects.jump);
});
