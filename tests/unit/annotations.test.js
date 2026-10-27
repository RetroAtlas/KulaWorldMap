import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations, objects, releases, levelKey } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import {
  setAnnotations,
  setObjects,
  levelNote,
  levelScore,
  fieldIndex,
} from "../../public/js/viewer/data.js";
import { levelPoints } from "../../public/js/viewer/draw/points.js";
import {
  BASE,
  discWord,
  levelsOf,
  setCurrent,
  setReleases,
} from "../../public/js/viewer/release.js";

const reasons = readFileSync(
  fileURLToPath(new URL("../../docs/annotations.md", import.meta.url)),
  "utf8",
);

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
  const kinds = new Set();
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
    const values = new Set(placed.map((o) => String(o.f[fieldIndex(entry.by)])));
    for (const v of Object.keys(entry.variants ?? {})) {
      assert.ok(values.has(v), `annotations.json names no type ${t} with ${entry.by} = ${v}`);
    }
  }
});

// The catalogue's note is on every copy of OBJ LEVEL and on nothing else under
// every release, read as the map reads it, with the release's own note where
// the entry has one.
test("the catalogue note is on every copy of OBJ LEVEL under every release and on nothing else, nine on the base", (t) => {
  t.after(() => setCurrent(BASE));
  setAnnotations(annotations);
  state.data = mapData;
  setReleases(releases);
  for (const r of releases) {
    setCurrent(r.id);
    const noted = levelsOf(r.id).filter((l) => /object catalogue/i.test(levelNote(l)));
    for (const l of noted) assert.equal(l.name, "OBJ LEVEL", `${r.id}: ${levelKey(l)}`);
    const copies = levelsOf(r.id).filter((l) => l.name === "OBJ LEVEL").length;
    assert.equal(noted.length, copies, `${r.id}: ${noted.length} catalogue notes`);
    if (r.id === BASE) assert.equal(noted.length, 9);
  }
});

// A curated score exists to say that not everything on a level can be had,
// so one that is not below the disc's own total has lost its reason.
test("a curated score is below what the disc holds, and says why", () => {
  setAnnotations(annotations);
  setObjects(objects);
  state.data = mapData;
  let curated = 0;
  for (const l of mapData.levels) {
    const score = levelScore(l);
    if (score === null) continue;
    curated++;
    assert.ok(Number.isInteger(score) && score > 0, `${levelKey(l)}: score ${score}`);
    assert.ok(score < levelPoints(l), `${levelKey(l)}: ${score} is not below ${levelPoints(l)}`);
    assert.ok(annotations.levels[levelKey(l)].note, `${levelKey(l)}: no note`);
  }
  assert.ok(curated > 0);
});

// The entry keys a heading of docs/annotations.md names.
const NAMED = /^### ((?:world|kind|type) \w+)|(\/[A-Z]+\/[A-Z]+\.PAK#\d+)/g;
const keysOf = (heading) => [...heading.matchAll(NAMED)].map((m) => m[1] ?? m[2]);

// A note is what the map says; why it is believed lives in docs/annotations.md
// under the entry's key, so nothing goes in without its reasons and nothing is
// left there once its entry is gone.
test("every annotation has its reasons in docs/annotations.md, and only those", () => {
  const entries = new Set([
    ...Object.keys(annotations.worlds ?? {}).map((id) => `world ${id}`),
    ...Object.keys(annotations.kinds ?? {}).map((k) => `kind ${k}`),
    ...Object.keys(annotations.types ?? {}).map((t) => `type ${t}`),
    ...Object.keys(annotations.levels ?? {}),
  ]);
  const sections = new Set();
  for (const heading of reasons.split("\n").filter((line) => line.startsWith("### "))) {
    const named = keysOf(heading);
    assert.ok(named.length, `docs/annotations.md: "${heading}" names no entry`);
    for (const key of named) {
      assert.ok(
        entries.has(key),
        `docs/annotations.md has a section for ${key}, which is not annotated`,
      );
      sections.add(key);
    }
  }
  for (const key of entries) {
    assert.ok(sections.has(key), `docs/annotations.md has no section for ${key}`);
  }
});

// A release's own note, score or points stand in for the entry's under that
// release alone, and the entry itself is the base's, so an override names a
// release the files know other than the base and carries only the keys an
// entry of its table has.
const OWN = {
  worlds: ["note"],
  kinds: ["note", "points"],
  types: ["note", "points"],
  levels: ["note", "score"],
};
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Every entry of annotations.json with where it stands and the keys it may override. */
const entriesOf = () =>
  Object.entries(OWN).flatMap(([section, own]) =>
    Object.entries(annotations[section] ?? {}).flatMap(([key, entry]) => {
      const where = `annotations.json ${section} ${key}`;
      return [
        { where, entry, own, key: section === "levels" ? key : `${section.slice(0, -1)} ${key}` },
        ...Object.entries(entry.variants ?? {}).map(([v, x]) => ({
          where: `${where} ${entry.by} ${v}`,
          entry: x,
          own,
          key: `${section.slice(0, -1)} ${key}`,
        })),
      ];
    }),
  );

test("a release's overrides name a release the files know and carry only what the entry may have", () => {
  const ids = new Set(releases.map((r) => r.id));
  let overrides = 0;
  for (const { where, entry, own } of entriesOf()) {
    if (!("releases" in entry)) continue;
    assert.ok(isObject(entry.releases), `${where}: releases is not an object`);
    for (const [id, over] of Object.entries(entry.releases)) {
      const at = `${where} ${id}`;
      assert.ok(ids.has(id) && id !== BASE, `${at}: no release to override for`);
      assert.ok(isObject(over) && Object.keys(over).length, `${at}: overrides nothing`);
      for (const [k, v] of Object.entries(over)) {
        assert.ok(own.includes(k), `${at}: ${k} is not a release's own`);
        if (k === "note") assert.ok(typeof v === "string" && v, `${at}: note is not a sentence`);
        if (k === "points") assert.ok(Number.isInteger(v) && v >= 0, `${at}: points ${v}`);
        if (k === "score" && v === null)
          assert.ok("score" in entry, `${at}: null takes no score away`);
        if (k === "score" && v !== null)
          assert.ok(Number.isInteger(v) && v > 0, `${at}: score ${v}`);
      }
      overrides++;
    }
  }
  assert.ok(overrides > 0);
});

// What an override rests on is in the entry's section, in a line opening on the disc's word.
test("a release's override has its reasons in the entry's section, opening on the disc", () => {
  setReleases(releases);
  const sections = new Map();
  let keys = [];
  for (const line of reasons.split("\n")) {
    if (line.startsWith("#")) keys = keysOf(line);
    else for (const key of keys) sections.set(key, `${sections.get(key) ?? ""}${line}\n`);
  }
  let reasoned = 0;
  for (const { entry, key } of entriesOf()) {
    for (const id of Object.keys(entry.releases ?? {})) {
      assert.match(
        sections.get(key) ?? "",
        new RegExp(`^On the ${discWord(id)} disc\\b`, "m"),
        `docs/annotations.md: ${key} gives no reasons for the ${discWord(id)} disc`,
      );
      reasoned++;
    }
  }
  assert.ok(reasoned > 0);
});

// A hazard is a flag on a kind or a type as a whole, and the entry's section
// says what shows it can cost the ball its life.
test("a hazard is flagged on a kind or a type, and its section says why", () => {
  const sections = new Map();
  let key = null;
  for (const line of reasons.split("\n")) {
    if (line.startsWith("#")) key = /^### ((?:kind|type) \w+)/.exec(line)?.[1] ?? null;
    else if (key) sections.set(key, `${sections.get(key) ?? ""}${line}\n`);
  }
  let flagged = 0;
  for (const [section, word] of [
    ["kinds", "kind"],
    ["types", "type"],
  ]) {
    for (const [k, entry] of Object.entries(annotations[section] ?? {})) {
      const where = `annotations.json ${section} ${k}`;
      for (const v of Object.values(entry.variants ?? {})) {
        assert.ok(!("hazard" in v), `${where}: a variant is a hazard only as its type is`);
      }
      if (!("hazard" in entry)) continue;
      assert.equal(entry.hazard, true, `${where}: hazard is true or absent`);
      assert.ok(entry.note, `${where}: a hazard has no note`);
      assert.match(
        sections.get(`${word} ${k}`) ?? "",
        /\bhazard\b/i,
        `docs/annotations.md: ${word} ${k} does not say why it is a hazard`,
      );
      flagged++;
    }
  }
  for (const section of ["worlds", "levels"]) {
    for (const [k, entry] of Object.entries(annotations[section] ?? {})) {
      assert.ok(!("hazard" in entry), `annotations.json ${section} ${k}: not a kind or a type`);
    }
  }
  assert.ok(flagged > 0);
});

// A note is read by someone looking at the map, in a sentence or three, each
// ending in a full stop rather than chained with colons and semicolons. It
// never names this project's scripts or files, a path on a machine, an
// address, a date or the walkthrough: those belong in docs/. A release's own
// note is read the same way.
const LONGEST_NOTE = 320;
const SENTENCES = 3;
const INTERNALS =
  /tools\/|\.(?:py|js|json|md)\b|\/Users\/|\/home\/|~\/|\b0x[0-9a-f]+|\b\d{4}-\d{2}-\d{2}\b|walkthrough/i;

test("a note is a sentence or three, short and free of the project's workings", () => {
  let notes = 0;
  for (const { where, entry } of entriesOf()) {
    for (const [at, note] of [
      [where, entry.note],
      ...Object.entries(entry.releases ?? {}).map(([id, over]) => [`${where} ${id}`, over.note]),
    ]) {
      if (!note) continue;
      notes++;
      assert.ok(
        note.length <= LONGEST_NOTE,
        `${at}: ${note.length} characters, over ${LONGEST_NOTE}`,
      );
      assert.match(note, /\.$/, `${at}: does not end in a full stop`);
      assert.doesNotMatch(note, /[;:]/, `${at}: chains its clauses with a colon or a semicolon`);
      const sentences = note.split(/(?<=\.)\s+/).length;
      assert.ok(sentences <= SENTENCES, `${at}: ${sentences} sentences, over ${SENTENCES}`);
      const hit = INTERNALS.exec(note);
      assert.ok(!hit, `${at}: "${hit?.[0]}" belongs in docs/annotations.md`);
    }
  }
  assert.ok(notes > 0);
});

// A field's name is shown beside its number, so it has to name a field the
// kind or type sets wherever it is placed, in a few plain words, and no field
// a `facing` or `state` key already names.
const FIELD = /^f\d+$/;
const FIELDS = 11;

test("a named field is set wherever its kind or type is placed", () => {
  const placed = { kinds: new Map(), types: new Map() };
  const add = (map, key, f) => map.set(key, [...(map.get(key) ?? []), f]);
  for (const l of mapData.levels) {
    for (const r of l.records) {
      add(placed.kinds, String(r.kind), r.f);
      for (const o of r.on) add(placed.types, String(o.type), o.f);
    }
  }
  let named = 0;
  for (const section of ["kinds", "types"]) {
    for (const [key, entry] of Object.entries(annotations[section] ?? {})) {
      for (const [field, name] of Object.entries(entry.fields ?? {})) {
        const where = `annotations.json ${section} ${key} ${field}`;
        const n = fieldIndex(field);
        assert.ok(FIELD.test(field) && n >= 0 && n < FIELDS, `${where}: no such field`);
        assert.ok(field !== entry.facing && field !== entry.state, `${where}: named by its key`);
        assert.match(name, /^[a-z]+(?: [a-z]+)*$/, `${where}: "${name}" is not plain words`);
        assert.ok(!INTERNALS.test(name), `${where}: "${name}" belongs in docs/annotations.md`);
        for (const f of placed[section].get(key) ?? []) {
          assert.notEqual(f[n], -1, `${where}: unset where it is placed`);
        }
        named++;
      }
    }
  }
  assert.ok(named > 0);
});
