import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData } from "./fixtures.js";
import { HIDES, KEY, WORLD, level, plain, project, start } from "./project-doc.js";
import { VERSION } from "../../public/js/format/kwl.js";
import { TEXT_MOST, TITLE_MOST, fromLevel, writeProject } from "../../public/js/format/project.js";
import { BUNDLE_FORMAT, BUNDLE_MOST } from "../../public/js/format/bundle.js";
import { playsAs } from "../../public/js/format/checks.js";
import {
  BUNDLE_IN_CATALOGUE_MOST,
  COMMUNITY_PACK,
  LICENCE,
  NOTES_MOST,
  documentOf,
  entryOf,
  readCatalogue,
  writeCatalogue,
} from "../../public/js/format/catalogue.js";

const doc = readFileSync(
  fileURLToPath(new URL("../../docs/community.md", import.meta.url)),
  "utf8",
);
const templates = mapData.levels.map((l) => fromLevel(l));
const read = (source, hides = HIDES) => readCatalogue(source, { hides });
const one = (title, more = {}) =>
  project([plain([17, 17, 17], 0, { 0: start() })], { title, ...more });
/** As `one`, with a key on a second block, so it plays as an arcade level. */
const keyed = (title, more = {}) =>
  project([plain([17, 17, 17], 0, { 0: start() }), plain([18, 17, 17], 0, { 0: { type: KEY } })], {
    title,
    ...more,
  });
const bundle = (levels, more = {}) => ({
  format: BUNDLE_FORMAT,
  version: 1,
  title: "Campaign",
  author: "Ada",
  notes: "n",
  levels,
  ...more,
});
const catalogue = (entries, retired = []) => ({
  version: VERSION,
  licence: LICENCE,
  entries,
  retired,
});
const EMPTY = catalogue([]);
const EMPTY_TEXT = `{\n  "version": 1,\n  "licence": "CC-BY-4.0",\n  "entries": [],\n  "retired": []\n}\n`;
const NOT_A_LEVEL = "has no kula-world-level document under level; it is left out";
const PHASE = 'has a phase of "x", which is not a whole number; it is 0';
// A level the reader repairs, one whose world the disc has not, one over the blocks cap the face
// table lets the checks count and one over the records cap they count without it.
const broken = project(
  [plain([5, 9, 5], 0, { 0: start() }), { cell: [5, 5, 5], kind: 7, phase: "x" }],
  {
    title: "Broken",
  },
);
const nowhere = one("Nowhere", { world: "NOWHERE" });
const slab = [];
for (let x = 1; x <= 16; x++) for (let y = 1; y <= 16; y++) slab.push(plain([x, y, 17]));
slab[0].faces = { 0: start() };
slab.push(plain([17, 1, 17]));
const wide = project(slab, { title: "Slab" });
const crowded = project(
  Array.from({ length: 2049 }, (_, i) =>
    plain([1 + (i % 32), 1 + (Math.floor(i / 32) % 32), 1 + Math.floor(i / 1024)], 6),
  ),
  { title: "Crowded" },
);
/** The lines between a project file's braces, indented by `by` spaces. */
const inside = (p, by) =>
  writeProject(p)
    .trimEnd()
    .split("\n")
    .slice(1, -1)
    .map((line) => `${" ".repeat(by)}${line}`)
    .join("\n");

test("the pack, the licence and the caps are what every index ever published is read by", () => {
  assert.equal(COMMUNITY_PACK, "/COMMUNITY/COMMUNITY.PAK");
  assert.match(COMMUNITY_PACK, /\.PAK$/);
  assert.equal(LICENCE, "CC-BY-4.0");
  assert.equal(NOTES_MOST, 320);
  assert.equal(BUNDLE_IN_CATALOGUE_MOST, 60);
  assert.ok(BUNDLE_IN_CATALOGUE_MOST < BUNDLE_MOST);
});

// --- the fixed point -------------------------------------------------------------

test("a catalogue of every template and a bundle of ten reads back the same, with nothing to report, and writes again as itself, with or without the face table and under a licence of its own at the head or on an entry", () => {
  const entries = templates.map((p, i) => entryOf(i + 1, p));
  entries.push(entryOf(templates.length + 1, bundle(templates.slice(0, 10))));
  const cat = catalogue(entries, [500, 999]);
  const text = writeCatalogue(cat);
  const out = read(text);
  assert.deepEqual(out.report, []);
  assert.deepEqual(out.catalogue, cat);
  assert.equal(writeCatalogue(out.catalogue), text);
  assert.deepEqual(read(JSON.parse(text)), out);
  assert.deepEqual(readCatalogue(text), out);
  assert.deepEqual(readCatalogue(text, {}), out);
  const licensed = catalogue([entries[0], { ...entries[1], licence: "CC0-1.0" }]);
  licensed.licence = "MIT";
  const own = writeCatalogue(licensed);
  assert.deepEqual(read(own), { catalogue: licensed, report: [] });
  assert.equal(writeCatalogue(read(own).catalogue), own);
});

test("the writer orders the entries by id and the retired ids by value, whatever order it is given, and writes each once", () => {
  const entries = [entryOf(3, templates[2]), entryOf(1, templates[0]), entryOf(2, templates[1])];
  const text = writeCatalogue(catalogue(entries, [9, 4, 9]));
  assert.equal(text, writeCatalogue(catalogue([entries[1], entries[2], entries[0]], [4, 9])));
  const out = read(text);
  assert.deepEqual(
    out.catalogue.entries.map((e) => e.id),
    [1, 2, 3],
  );
  assert.deepEqual(out.catalogue.retired, [4, 9]);
  assert.ok(text.includes('\n  "retired": [4, 9]\n'));
});

// --- an entry and its document -------------------------------------------------

test("entryOf fills an entry's figures from the document, its notes cut to the page's cap and a bundle's sentence its first level's sentence, and documentOf gives the document back", () => {
  const p = fromLevel(level("LEVEL 1"));
  const e = entryOf(7, p);
  assert.deepEqual(e, {
    id: 7,
    kind: "level",
    title: p.title,
    author: p.author,
    notes: p.notes,
    world: p.world,
    playsAs: "Plays as an arcade level.",
    blocks: p.blocks.length,
    licence: LICENCE,
    level: p,
  });
  assert.equal(documentOf(e), p);
  const long = one("Long", { author: "Ada", notes: "n".repeat(NOTES_MOST + 1) });
  assert.equal(entryOf(1, long).notes, "n".repeat(NOTES_MOST));
  assert.equal(documentOf(entryOf(1, long)), long);
  const b = bundle([one("One"), keyed("Two", { world: "MARS" })]);
  assert.equal(playsAs(b.levels[1]), "Plays as an arcade level.");
  const eb = entryOf(8, b);
  assert.deepEqual(eb, {
    id: 8,
    kind: "bundle",
    title: "Campaign",
    author: "Ada",
    notes: "n",
    world: WORLD,
    playsAs: "Plays as a bonus level since it has no key.",
    blocks: 3,
    licence: LICENCE,
    levels: b.levels,
  });
  assert.deepEqual(documentOf(eb), b);
  assert.equal(documentOf(eb).levels, b.levels);
  for (const id of [0, -1, 1.5, "7", 2 ** 53, null, undefined])
    assert.throws(() => entryOf(id, p), /is not a positive whole number/, String(id));
  for (const d of [null, "x", [], {}, { format: "orbit", blocks: [] }, 7])
    assert.throws(() => entryOf(1, d), /not a kula-world-level or a kula-world-bundle document/);
  assert.throws(() => entryOf(1, bundle([])), /a bundle with no level has no entry/);
  assert.throws(() => entryOf(1, bundle("x")), /a bundle with no level has no entry/);
});

// --- reading by shape -------------------------------------------------------------

test("the defaults: an empty index, an entry told by its document, the head's licence and the entry's own texts and world where it gives them", () => {
  assert.deepEqual(read({}), { catalogue: EMPTY, report: ["no entries"] });
  assert.deepEqual(read({ version: 1, licence: LICENCE, entries: [], retired: [] }), {
    catalogue: EMPTY,
    report: [],
  });
  for (const source of ["[]", "null", "7", '"text"', "[1]", "true"])
    assert.deepEqual(
      read(source),
      { catalogue: EMPTY, report: ["not a table of the catalogue's keys; nothing is read"] },
      source,
    );
  for (const entries of ["x", {}, 7, null, true])
    assert.deepEqual(read({ entries }).report, ["no entries"], String(entries));
  const p = one("Spiral", { author: "Ada", notes: "Mind the gap." });
  const bare = read({ entries: [{ id: 3, level: p }] });
  assert.deepEqual(bare.report, []);
  assert.deepEqual(bare.catalogue.entries, [entryOf(3, p)]);
  const empties = read({ entries: [{ id: 3, title: "", author: "", notes: "", level: p }] });
  assert.deepEqual(empties, bare);
  const head = read({
    licence: "MIT",
    entries: [
      { id: 3, level: p },
      { id: 4, licence: "CC0-1.0", level: p },
    ],
  });
  assert.deepEqual(head.report, []);
  assert.equal(head.catalogue.licence, "MIT");
  assert.deepEqual(
    head.catalogue.entries.map((e) => e.licence),
    ["MIT", "CC0-1.0"],
  );
  assert.equal(read({ licence: "", entries: [] }).catalogue.licence, LICENCE);
  const q = one("Two", { world: "MARS" });
  const b = read({ entries: [{ id: 4, levels: [p, q] }] });
  assert.deepEqual(b.report, []);
  assert.deepEqual(b.catalogue.entries, [
    {
      id: 4,
      kind: "bundle",
      title: "",
      author: "",
      notes: "",
      world: WORLD,
      playsAs: playsAs(p),
      blocks: 2,
      licence: LICENCE,
      levels: [p, q],
    },
  ]);
  const own = read({
    entries: [{ id: 5, title: "Mine", author: "Bob", notes: "Note.", world: "MARS", level: p }],
  });
  assert.deepEqual(own.report, []);
  const [e] = own.catalogue.entries;
  assert.deepEqual([e.title, e.author, e.notes, e.world], ["Mine", "Bob", "Note.", "MARS"]);
  assert.deepEqual(e.level, p);
});

test("the entry's texts are cut to the format's caps and the notes to the page's cap, with a line each, and a level's long notes are cut on the way in without one", () => {
  const p = one("Spiral", { author: "Ada", notes: "m".repeat(TEXT_MOST) });
  const out = read({
    entries: [
      {
        id: 1,
        title: "a".repeat(TITLE_MOST + 1),
        author: 5,
        notes: "c".repeat(NOTES_MOST + 1),
        licence: "l".repeat(TITLE_MOST + 1),
        level: p,
      },
      { id: 2, level: p },
    ],
  });
  assert.deepEqual(out.report, [
    `entry 0 (id 1): title is ${TITLE_MOST + 1} characters long, more than the ${TITLE_MOST} kept; it is cut to ${TITLE_MOST}`,
    "entry 0 (id 1): author is not text; it is left empty",
    `entry 0 (id 1): notes is ${NOTES_MOST + 1} characters long, more than the ${NOTES_MOST} kept; it is cut to ${NOTES_MOST}`,
    `entry 0 (id 1): licence is ${TITLE_MOST + 1} characters long, more than the ${TITLE_MOST} kept; it is cut to ${TITLE_MOST}`,
  ]);
  const [a, b] = out.catalogue.entries;
  assert.deepEqual(
    [a.title, a.author, a.notes, a.licence],
    ["a".repeat(TITLE_MOST), "Ada", "c".repeat(NOTES_MOST), "l".repeat(TITLE_MOST)],
  );
  assert.deepEqual([b.notes, b.level.notes.length], ["m".repeat(NOTES_MOST), TEXT_MOST]);
});

test("the figures are recomputed from the document whatever the index says", () => {
  const p = one("Spiral");
  const out = read({
    entries: [
      { id: 1, playsAs: "nonsense", blocks: "49", level: p },
      { id: 2, playsAs: 7, blocks: -3, level: p },
      { id: 3, playsAs: null, blocks: 2 ** 53, levels: [p, p] },
    ],
  });
  assert.deepEqual(out.report, []);
  assert.deepEqual(
    out.catalogue.entries.map((e) => [e.playsAs, e.blocks]),
    [
      [playsAs(p), 1],
      [playsAs(p), 1],
      [playsAs(p), 2],
    ],
  );
});

// --- the lines -----------------------------------------------------------------------

test("an entry is left out with a line where it is no table of keys, has no id or one that is not a positive whole number, or carries another entry's id, kept or not", () => {
  const p = one("Spiral");
  const out = read({
    entries: [
      "x",
      [p],
      null,
      { level: p },
      { id: 0, level: p },
      { id: -1, level: p },
      { id: 2 ** 53, level: p },
      { id: 1.5, level: p },
      { id: "7", level: p },
      { id: null, level: p },
      { id: true, level: p },
    ],
  });
  assert.deepEqual(out.catalogue.entries, []);
  assert.deepEqual(out.report, [
    "entry 0 is not a table of keys; it is left out",
    "entry 1 is not a table of keys; it is left out",
    "entry 2 is not a table of keys; it is left out",
    "entry 3 has no id; it is left out",
    "entry 4 has an id of 0, which is not a positive whole number; it is left out",
    "entry 5 has an id of -1, which is not a positive whole number; it is left out",
    "entry 6 has an id of 9007199254740992, which is not a positive whole number; it is left out",
    "entry 7 has an id of 1.5, which is not a positive whole number; it is left out",
    'entry 8 has an id of "7", which is not a positive whole number; it is left out',
    "entry 9 has an id of null, which is not a positive whole number; it is left out",
    "entry 10 has an id of true, which is not a positive whole number; it is left out",
  ]);
  const twice = read({
    entries: [
      { id: 7, level: p },
      { id: 7, level: p },
      { id: 7, level: "x" },
      { id: 8, level: "x" },
      { id: 8, level: p },
    ],
  });
  assert.deepEqual(
    twice.catalogue.entries.map((e) => e.id),
    [7],
  );
  assert.deepEqual(twice.report, [
    "entry 1 has the id 7 of entry 0; it is left out",
    "entry 2 has the id 7 of entry 0; it is left out",
    `entry 3 (id 8) ${NOT_A_LEVEL}`,
    "entry 4 has the id 8 of entry 3; it is left out",
  ]);
});

test("kind is level or bundle, told by the document where it is missing or neither, and an entry with no document under the kind is left out with a line", () => {
  const p = one("Spiral");
  const out = read({
    entries: [
      { id: 1 },
      { id: 2, kind: "level" },
      { id: 3, kind: "bundle" },
      { id: 4, kind: "pack", level: p },
      { id: 5, kind: 7, levels: [p] },
      { id: 6, kind: "level", levels: [p] },
      { id: 7, kind: "bundle", level: p },
      { id: 8, levels: p },
    ],
  });
  assert.deepEqual(
    out.catalogue.entries.map((e) => [e.id, e.kind]),
    [
      [4, "level"],
      [5, "bundle"],
    ],
  );
  assert.deepEqual(out.report, [
    "entry 0 (id 1) has no level and no levels; it is left out",
    `entry 1 (id 2) ${NOT_A_LEVEL}`,
    "entry 2 (id 3) has no list of levels; it is left out",
    'entry 3 (id 4) has a kind of "pack", which is neither level nor bundle; it is told by the document',
    "entry 4 (id 5) has a kind of 7, which is neither level nor bundle; it is told by the document",
    `entry 5 (id 6) ${NOT_A_LEVEL}`,
    "entry 6 (id 7) has no list of levels; it is left out",
    "entry 7 (id 8) has no list of levels; it is left out",
  ]);
});

test("a document of another format is left out with a line, lines of one shape kept to three and the rest counted", () => {
  const p = one("Spiral");
  const out = read({
    entries: [
      { id: 1, level: { format: "orbit", blocks: [] } },
      { id: 2, level: "text" },
      { id: 3, level: [p] },
      { id: 4, level: null },
      { id: 5, level: { format: BUNDLE_FORMAT, levels: [p] } },
      { id: 6, level: p },
    ],
  });
  assert.deepEqual(
    out.catalogue.entries.map((e) => e.id),
    [6],
  );
  assert.deepEqual(out.report, [
    `entry 0 (id 1) ${NOT_A_LEVEL}`,
    `entry 1 (id 2) ${NOT_A_LEVEL}`,
    `entry 2 (id 3) ${NOT_A_LEVEL}`,
    "2 more lines like the one above",
  ]);
});

test("a world that is not one of the ten takes the document's world with a line, and a bundle takes its first level's world", () => {
  const p = one("Spiral");
  const q = one("Two", { world: "MARS" });
  const out = read({
    entries: [
      { id: 1, world: "MOON", level: p },
      { id: 2, world: 7, level: p },
      { id: 3, world: "hiro", levels: [q, p] },
    ],
  });
  assert.deepEqual(
    out.catalogue.entries.map((e) => e.world),
    [WORLD, WORLD, "MARS"],
  );
  assert.deepEqual(out.report, [
    `entry 0 (id 1) has a world of "MOON", which is not one of the ten; it is ${WORLD}`,
    `entry 1 (id 2) has a world of 7, which is not one of the ten; it is ${WORLD}`,
    'entry 2 (id 3) has a world of "hiro", which is not one of the ten; it is MARS',
  ]);
});

// --- the gates ------------------------------------------------------------------------

test("a document stands only past the gates a link's level passes and no repair: a world among the ten and the game's caps, the faces and the blocks counted where the face table is given", () => {
  const newer = { ...one("Newer"), version: 7 };
  const out = read({
    entries: [
      { id: 1, level: broken },
      { id: 2, level: nowhere },
      { id: 3, level: wide },
      { id: 4, level: crowded },
      { id: 5, level: newer },
    ],
  });
  assert.deepEqual(
    out.catalogue.entries.map((e) => e.id),
    [5],
  );
  assert.equal(out.catalogue.entries[0].level.version, 1);
  assert.deepEqual(out.report, [
    `entry 0 (id 1): block 1 at 5,5,5 ${PHASE}`,
    "entry 0 (id 1) reads with 1 repair; it is left out",
    "entry 1 (id 2) names a world the disc has not; it is left out",
    "entry 2 (id 3) cannot be read as a level: 257 blocks: over the cap of 256; it is left out",
    "entry 3 (id 4) cannot be read as a level: 2049 records: over the cap of 123; it is left out",
    "entry 4 (id 5): written as version 7 of the format, newer than this reader's version 1; what it knows is read",
  ]);
  const blind = readCatalogue({
    entries: [
      { id: 3, level: wide },
      { id: 4, level: crowded },
    ],
  });
  assert.deepEqual(
    blind.catalogue.entries.map((e) => e.id),
    [3],
  );
  assert.deepEqual(blind.report, [
    "entry 1 (id 4) cannot be read as a level: 2049 records: over the cap of 123; it is left out",
  ]);
});

test("a bundle's levels pass the gates one by one, a level that fails or is no document taking the entry with it, with its place and its reason, so the places of the rest never shift, and a list past the bundle's cap is cut with its line", () => {
  const out = read({
    entries: [
      { id: 1, levels: [one("One"), nowhere, broken, one("Four")] },
      { id: 2, levels: [nowhere] },
      { id: 3, levels: [] },
      { id: 4, levels: ["x", { format: BUNDLE_FORMAT }] },
      { id: 5, levels: [one("One"), "x", one("Three")] },
      { id: 6, levels: [one("One"), one("Two")] },
    ],
  });
  assert.deepEqual(
    out.catalogue.entries.map((e) => [e.id, e.blocks, e.levels.map((l) => l.title)]),
    [[6, 2, ["One", "Two"]]],
  );
  assert.deepEqual(out.report, [
    `entry 0 (id 1): level 2 (Broken): block 1 at 5,5,5 ${PHASE}`,
    "entry 0 (id 1): level 1 (Nowhere) names a world the disc has not; it is left out",
    "entry 0 (id 1): level 2 (Broken) reads with 1 repair; it is left out",
    "entry 0 (id 1) has a level left out, so the others would change place; it is left out",
    "entry 1 (id 2): level 0 (Nowhere) names a world the disc has not; it is left out",
    "entry 1 (id 2) has no level left; it is left out",
    "entry 2 (id 3) has no level left; it is left out",
    "entry 3 (id 4): level 0 is not a kula-world-level document; it is left out",
    "entry 3 (id 4): level 1 is not a kula-world-level document; it is left out",
    "entry 3 (id 4) has no level left; it is left out",
    "entry 4 (id 5): level 1 is not a kula-world-level document; it is left out",
    "entry 4 (id 5) has a level left out, so the others would change place; it is left out",
  ]);
  const many = read({
    entries: [
      { id: 1, levels: Array.from({ length: BUNDLE_MOST + 1 }, (_, i) => one(`Level ${i}`)) },
    ],
  });
  assert.deepEqual(
    [many.catalogue.entries[0].levels.length, many.catalogue.entries[0].blocks],
    [BUNDLE_MOST, BUNDLE_MOST],
  );
  assert.deepEqual(many.report, [
    `entry 0 (id 1): levels lists ${BUNDLE_MOST + 1} levels, more than the ${BUNDLE_MOST} kept; it is cut to ${BUNDLE_MOST}`,
  ]);
});

test("retired keeps the positive whole numbers once each in the index's order, drops an id an entry carries, and is empty where it is not a list, each with a line", () => {
  const p = one("Spiral");
  const out = read({
    entries: [{ id: 7, level: p }],
    retired: [9, "3", 0, 1.5, null, 4, 4, 7, 2 ** 53, 8],
  });
  assert.deepEqual(out.catalogue.retired, [9, 4, 8]);
  assert.deepEqual(out.report, [
    'retired names "3", which is not a positive whole number; it is left out',
    "retired names 0, which is not a positive whole number; it is left out",
    "retired names 1.5, which is not a positive whole number; it is left out",
    "retired names null, which is not a positive whole number; it is left out",
    "retired names 4 again; it is left out",
    "retired names 7, which entry 0 carries; it is dropped",
    "retired names 9007199254740992, which is not a positive whole number; it is left out",
  ]);
  assert.deepEqual(read({ retired: "x" }).report, [
    "no entries",
    "retired is not a list; it is empty",
  ]);
  assert.deepEqual(read({ entries: [], retired: {} }).report, [
    "retired is not a list; it is empty",
  ]);
  // an id a left-out entry carries stays retired, since the catalogue holds no such entry
  const gone = read({ entries: [{ id: 7, level: "x" }], retired: [7] });
  assert.deepEqual([gone.catalogue.entries, gone.catalogue.retired], [[], [7]]);
});

// --- the hostile index --------------------------------------------------------------------

test("a key the language reserves does nothing as an id, a key or a retired id, and text where a number is due is a line rather than a crash", () => {
  const p = one("Spiral");
  const level = JSON.stringify(p).replace(
    /^\{/,
    '{"__proto__": {"polluted": true}, "constructor": "x", ',
  );
  const t = `{"version": 9007199254740992, "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "licence": 5, "entries": [{"id": "__proto__", "level": ${level}}, {"id": "constructor", "level": ${level}}, {"__proto__": {"id": 5}, "constructor": "x", "id": 3, "blocks": "49", "playsAs": 7, "level": ${level}}, {"id": 4, "levels": {"__proto__": [${level}]}}], "retired": ["__proto__", "constructor", "3"]}`;
  const { catalogue: c, report } = read(t);
  assert.deepEqual(report, [
    "a version of 9007199254740992 is not a whole number; the file is read as version 1",
    "licence is not text; it is left empty",
    'entry 0 has an id of "__proto__", which is not a positive whole number; it is left out',
    'entry 1 has an id of "constructor", which is not a positive whole number; it is left out',
    "entry 3 (id 4) has no list of levels; it is left out",
    'retired names "__proto__", which is not a positive whole number; it is left out',
    'retired names "constructor", which is not a positive whole number; it is left out',
    'retired names "3", which is not a positive whole number; it is left out',
  ]);
  assert.deepEqual(Object.keys(c), ["version", "licence", "entries", "retired"]);
  assert.deepEqual([c.version, c.licence, c.retired], [1, LICENCE, []]);
  assert.deepEqual(
    c.entries.map((e) => e.id),
    [3],
  );
  const [e] = c.entries;
  assert.deepEqual(Object.keys(e), [
    "id",
    "kind",
    "title",
    "author",
    "notes",
    "world",
    "playsAs",
    "blocks",
    "licence",
    "level",
  ]);
  assert.deepEqual([e.kind, e.blocks, e.playsAs], ["level", 1, playsAs(p)]);
  assert.deepEqual(Object.keys(e.level), Object.keys(p));
  for (const o of [c, e, e.level]) assert.equal(Object.getPrototypeOf(o), Object.prototype);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
  assert.equal({}.polluted, undefined);
  assert.equal(writeCatalogue(c), writeCatalogue(catalogue([entryOf(3, p)])));
});

// --- writing -----------------------------------------------------------------------------

test("the writer writes the head's keys in order, an entry's keys in the reader's order and each document indented inside it, as the document shows them", () => {
  assert.equal(writeCatalogue(EMPTY), EMPTY_TEXT);
  assert.equal(writeCatalogue({}), EMPTY_TEXT);
  assert.deepEqual(read(EMPTY_TEXT), { catalogue: EMPTY, report: [] });
  const p = fromLevel(level("LEVEL 1"));
  const text = writeCatalogue(catalogue([entryOf(1, p)]));
  const keys = (at) =>
    text
      .split("\n")
      .map((line) => new RegExp(`^ {${at}}"(\\w+)":`).exec(line)?.[1])
      .filter(Boolean);
  assert.deepEqual(keys(2), ["version", "licence", "entries", "retired"]);
  assert.deepEqual(keys(6), [
    "id",
    "kind",
    "title",
    "author",
    "notes",
    "world",
    "playsAs",
    "blocks",
    "licence",
    "level",
  ]);
  assert.ok(text.includes(`      "level": {\n${inside(p, 6)}\n      }\n    }\n  ],\n`));
  const two = writeCatalogue(catalogue([entryOf(1, bundle([p, p]))]));
  assert.equal(two.split("\n        },\n        {\n").length, 2);
  assert.ok(two.includes(`      "levels": [\n        {\n${inside(p, 8)}\n        }`));
  assert.equal(read(two).catalogue.entries[0].levels.length, 2);
  const example = /```json\n([\s\S]*?)```/.exec(doc)[1];
  const out = read(example);
  assert.deepEqual(out.report, []);
  assert.equal(writeCatalogue(out.catalogue), example);
  assert.deepEqual(
    out.catalogue.entries.map((e) => [e.id, e.kind, e.playsAs, e.blocks]),
    [
      [1, "level", "Plays as an arcade level.", 3],
      [2, "bundle", "Plays as a bonus level since it has no key.", 1],
    ],
  );
  assert.deepEqual(out.catalogue.retired, [3]);
});

test("the document names the caps, the pack and the licence as the module holds them", () => {
  const figure = (pattern) => {
    const hit = pattern.exec(doc);
    assert.ok(hit, `community.md has no sentence matching ${pattern}`);
    return hit.slice(1).map(Number);
  };
  assert.deepEqual(figure(/a title of up to (\d+) characters and an author of up to (\d+)/), [
    TITLE_MOST,
    TEXT_MOST,
  ]);
  assert.deepEqual(figure(/the author's notes, up to (\d+) characters/), [NOTES_MOST]);
  assert.deepEqual(figure(/holds at most (\d+) levels, `BUNDLE_IN_CATALOGUE_MOST`/), [
    BUNDLE_IN_CATALOGUE_MOST,
  ]);
  assert.ok(doc.includes(`\`${COMMUNITY_PACK}\`, \`COMMUNITY_PACK\``));
  assert.ok(doc.includes(`\`${LICENCE}\``));
});
