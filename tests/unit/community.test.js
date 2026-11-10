import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { levelKey, mapData, releases } from "./fixtures.js";
import {
  EXIT,
  HIDES,
  cornered,
  grown,
  level,
  nudged,
  own,
  plain,
  project,
  rebuilt,
  start,
} from "./project-doc.js";
import { NAMES } from "../../public/js/viewer/data.js";
import { VERSION, spelled, writeKwl } from "../../public/js/format/kwl.js";
import {
  fromLevel,
  moveBlocks,
  readProject,
  writeProject,
} from "../../public/js/format/project.js";
import { BUNDLE_FORMAT, readBundle, writeBundle } from "../../public/js/format/bundle.js";
import {
  BUNDLE_IN_CATALOGUE_MOST,
  LICENCE,
  NOTES_MOST,
  entryOf,
  readCatalogue,
  writeCatalogue,
} from "../../public/js/format/catalogue.js";
import { encodeLevel } from "../../public/js/format/sharewrite.js";
import {
  FLOOR,
  FROM_NOTE,
  NEAR,
  commonOf,
  shapeOf,
  shareOf,
} from "../../public/js/format/kinship.js";
import {
  INDEX,
  LEDGER,
  RECORDS,
  canonicalOf,
  filled,
  indexOf,
  main,
  readLedger,
  readRecords,
  recordOf,
  segmentOf,
  shippedDigests,
  shippedShapes,
  shippedTitles,
  writeLedger,
} from "../../tools/community.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const text = (path) => readFileSync(join(root, path), "utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digests = JSON.parse(text("tests/fixtures/kwl-digests.json"));
const deps = {
  hides: HIDES,
  names: NAMES,
  shipped: shippedDigests(),
  shapes: shippedShapes(),
  titles: shippedTitles(),
};
const EMPTY_TEXT = `{\n  "version": 1,\n  "licence": "CC-BY-4.0",\n  "entries": [],\n  "retired": []\n}\n`;
const PHASE_AT = (i) =>
  `block ${i} at 5,5,5 has a phase of "x", which is not a whole number; it is 0`;
const PHASE = PHASE_AT(1);
/** A level of `n` plain blocks in a row, the start on the first, whose bytes differ by `n`. */
const row = (n, title, more = {}) =>
  project(
    [
      plain([17, 17, 17], 0, { 0: start() }),
      ...Array.from({ length: n - 1 }, (_, i) => plain([18 + i, 17, 17])),
    ],
    { title, author: "Ada", ...more },
  );
/** A level of two blocks, the second at a cell of its own by `i`, so no two of them share bytes. */
const distinct = (i, title) =>
  project(
    [plain([17, 17, 17], 0, { 0: start() }), plain([1 + (i % 32), 1 + Math.floor(i / 32), 16])],
    { title, author: "Ada" },
  );
const bundle = (levels, more = {}) => ({
  format: BUNDLE_FORMAT,
  version: 1,
  title: "Campaign",
  author: "Ada",
  notes: "",
  levels,
  ...more,
});
const broken = project(
  [plain([5, 9, 5], 0, { 0: start() }), { cell: [5, 5, 5], kind: 7, phase: "x" }],
  { title: "Broken" },
);
const slab = [];
for (let x = 1; x <= 16; x++) for (let y = 1; y <= 16; y++) slab.push(plain([x, y, 17]));
slab[0].faces = { 0: start() };
slab.push(plain([17, 1, 17]));
const wide = project(slab, { title: "Slab" });
const shipped = fromLevel(level("LEVEL 1"));
const refuses = (document, message, id) =>
  assert.throws(() => recordOf(document, deps, id), { message }, message);
const lines = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.message.split("\n");
  }
  assert.fail("nothing was refused");
};
const scratch = () => mkdtempSync(join(tmpdir(), "kula-community-"));

// --- the committed catalogue --------------------------------------------------------

test("the committed index is what the tool writes from the records and the ledger, byte for byte, every record past the gates and written as the editor saves it", () => {
  const records = readRecords();
  const ledger = readLedger();
  for (const r of records) {
    assert.doesNotThrow(() => recordOf(r.document, deps, r.id), r.path);
    assert.equal(canonicalOf(r.document), r.text, r.path);
  }
  const { catalogue } = indexOf(records, ledger, deps);
  assert.equal(text(INDEX), writeCatalogue(catalogue));
  assert.equal(text(LEDGER), writeLedger(ledger));
  assert.deepEqual(readCatalogue(text(INDEX), { hides: HIDES }).report, []);
});

test("every whole number from 1 below next is exactly one of a record's id and a retired id", () => {
  const ids = new Set(readRecords().map((r) => r.id));
  const { next, retired } = readLedger();
  assert.ok(Number.isSafeInteger(next) && next >= 1);
  assert.equal(new Set(retired).size, retired.length);
  for (const id of [...ids, ...retired]) assert.ok(id < next, `${id} is not below next, ${next}`);
  for (let id = 1; id < next; id++)
    assert.notEqual(
      ids.has(id),
      retired.includes(id),
      `${id} is ${ids.has(id) ? "both a record and retired" : "neither a record nor retired"}`,
    );
});

test("the shipped digests are every level of the three discs by the digest of its canonical file, named for the first slot that holds it, the base's digests as the digest fixture has them", () => {
  const named = new Map();
  const name = (l, where) => {
    const d = sha256(writeKwl(fromLevel(l)));
    named.set(d, [...(named.get(d) ?? []), where]);
  };
  for (const l of mapData.levels) name(l, levelKey(l));
  for (const r of releases)
    for (const [key, v] of Object.entries(r.levels)) name(v, `${key} (${r.id})`);
  const all =
    mapData.levels.length + releases.reduce((n, r) => n + Object.keys(r.levels).length, 0);
  assert.ok(named.size < all, "the copies of the catalogue share one digest");
  assert.equal(deps.shipped.size, named.size);
  for (const [d, names] of named) {
    assert.equal(deps.shipped.get(d), names[0], names.join(", "));
    if (names.some((n) => !n.includes(" ("))) assert.ok(!deps.shipped.get(d).includes(" ("), d);
  }
  for (const l of mapData.levels)
    assert.ok(deps.shipped.has(digests[levelKey(l)].kwl), levelKey(l));
  const first = level("LEVEL 1");
  assert.equal(deps.shipped.get(digests[levelKey(first)].kwl), levelKey(first));
});

// --- a record ------------------------------------------------------------------------

test("recordOf gives the entry for a level or a bundle past every gate, under the id given or 1", () => {
  const p = row(2, "Spiral", { notes: "Two lines.\nOr three." });
  assert.deepEqual(recordOf(p, deps, 7), entryOf(7, readProject(p).project));
  assert.equal(recordOf(p, deps).id, 1);
  const b = bundle([row(2, "Two"), row(3, "Three", { notes: "😀".repeat(NOTES_MOST) })]);
  assert.deepEqual(recordOf(b, deps, 2), entryOf(2, readBundle(b).bundle));
  const newer = { ...row(2, "Newer"), version: 7 };
  assert.equal(recordOf(newer, deps).level.version, VERSION);
  const polluted = JSON.parse(
    writeProject(p).replace(/^\{/, '{"__proto__": {"polluted": true}, "constructor": "x", '),
  );
  assert.deepEqual(recordOf(polluted, deps), recordOf(p, deps));
  assert.equal({}.polluted, undefined);
});

test("a document is refused in one sentence where it reads with a repair, fails the checks or cannot be written as a level, a line feed in a text it quotes replaced", () => {
  refuses(broken, `"Broken" reads with 1 repair: ${PHASE}`);
  refuses(
    project([plain([17, 17, 17], 0, { "0\nx": start() })], { title: "Keyed" }),
    '"Keyed" reads with 1 repair: block 0 at 17,17,17 names a face "0\ufffdx", which is not one of the six; it is left out',
  );
  refuses(
    row(2, "Two", { world: "HIRO\nx" }),
    `the checks find an error in "Two": world 'HIRO\ufffdx': not one of the disc's ten`,
  );
  refuses(wide, 'the checks find an error in "Slab": 257 blocks: over the cap of 256');
  refuses(
    project([plain([17, 17, 17])], { title: "Still", time: 0 }),
    'the checks find an error in "Still": time 0: below 1, and 1 more error',
  );
  refuses(
    project([plain([17, 17, 17])], { title: "" }),
    'the checks find an error in "Untitled level": no start',
  );
  for (const d of [null, "x", [], {}, { format: "orbit", blocks: [] }, 7])
    refuses(d, "neither a kula-world-level nor a kula-world-bundle document");
});

test("a level a disc ships is refused as a copy, whatever its texts say, the variants of the other discs among them", () => {
  const key = levelKey(level("LEVEL 1"));
  refuses(shipped, `"${shipped.title}" is the disc's level at ${key}, byte for byte`);
  refuses(
    { ...shipped, title: "Mine", author: "Me", notes: "Mine now." },
    `"Mine" is the disc's level at ${key}, byte for byte`,
  );
  const [, eu] = releases;
  const base = new Set(mapData.levels.map((l) => sha256(writeKwl(fromLevel(l)))));
  const [slot, variant] = Object.entries(eu.levels).find(
    ([, v]) => !base.has(sha256(writeKwl(fromLevel(v)))),
  );
  const v = fromLevel(variant);
  refuses(v, `"${v.title}" is the disc's level at ${slot} (eu), byte for byte`);
  const bare = { ...deps, shipped: new Map(), shapes: new Map(), titles: new Map() };
  assert.equal(recordOf(shipped, bare).title, shipped.title);
});

test("a copy of one of the game's levels is refused by the share of its blocks with the level its from names, a half or more, a corner block added and a variant's edit among them, named with how much of the game's level it holds, while a copy gutted and rebuilt, one that kept a third of its source and one outgrown by more than as many blocks again pass", () => {
  const forty = fromLevel(level("LEVEL 42"));
  const title = `"${forty.title}"`;
  const n = forty.blocks.length;
  const copied = (name, percent, of) =>
    `${name} holds ${percent} percent of the blocks of the game's ${of}, which it was copied from; the community levels take levels of your own`;
  const moved = nudged(forty, 3);
  const percent = Math.round(((n - 3) / n) * 100);
  refuses(moved, copied(title, percent, "LEVEL 42"));
  refuses({ ...moved, title: "Mine", author: "Me" }, copied('"Mine"', percent, "LEVEL 42"));
  refuses(cornered(forty), copied(title, 100, "LEVEL 42"));
  const [, , jp] = releases;
  const hidden = fromLevel(jp.levels["/HILLS/HILLS.PAK#18"]);
  const m = hidden.blocks.length;
  refuses(
    nudged(hidden, 1),
    copied(`"${hidden.title}"`, Math.round(((m - 1) / m) * 100), "HIDDEN 2 (JP)"),
  );
  refuses(
    bundle([row(2, "Two"), moved]),
    copied(`level 1 (${forty.title}) of the bundle "Campaign"`, percent, "LEVEL 42"),
  );
  assert.deepEqual(
    lines(() => indexOf([{ id: 1, document: moved }], { next: 2 }, deps)),
    [`record 1: ${copied(title, percent, "LEVEL 42")}`],
  );
  assert.doesNotThrow(() => recordOf(rebuilt(forty, 0), deps));
  const third = Math.ceil(n / 3);
  assert.ok(third / n >= FROM_NOTE && third / n < NEAR);
  assert.doesNotThrow(() => recordOf(rebuilt(forty, third), deps));
  const first = fromLevel(level("LEVEL 1"));
  const outgrown = grown(first, first.blocks.length + 1);
  assert.ok(shareOf(shapeOf(first), shapeOf(outgrown)) < NEAR);
  assert.doesNotThrow(() => recordOf(outgrown, deps));
  assert.doesNotThrow(() => recordOf(row(3, "Own"), deps));
});

test("a level the rule does not refuse is admitted with a note where it holds part of one of the game's levels, naming that level and how much of its blocks it holds: a copy stripped of its from, a copy shifted whole, a flat slab and a bundle's level that resemble one, and a copy that kept a third of the level its from names or outgrew it by more than as many blocks again, with none where it holds too few of any", () => {
  const forty = fromLevel(level("LEVEL 42"));
  const title = `"${forty.title}"`;
  const n = forty.blocks.length;
  const look = (name, percent, of) =>
    `${name} holds ${percent} percent of the blocks of the game's ${of}, which is worth a look`;
  const noted = (...documents) =>
    indexOf(
      documents.map((document, i) => ({ id: i + 1, document })),
      { next: documents.length + 1 },
      deps,
    ).notes;
  const moved = own(nudged(forty, 3));
  const percent = Math.round(((n - 3) / n) * 100);
  assert.equal(recordOf(moved, deps).title, forty.title);
  assert.deepEqual(noted(moved), [{ id: 1, note: look(title, percent, "LEVEL 42") }]);
  assert.deepEqual(noted({ ...moved, title: "Mine", author: "Me" }), [
    { id: 1, note: look('"Mine"', percent, "LEVEL 42") },
  ]);
  const shifted = own(
    moveBlocks(
      forty,
      forty.blocks.map((b) => b.cell),
      [1, 0, 0],
    ),
  );
  assert.deepEqual(noted(shifted), [{ id: 1, note: look(title, 100, "LEVEL 42") }]);
  const flat = [];
  for (let x = 17; x <= 20; x++) for (let y = 17; y <= 20; y++) flat.push(plain([x, y, 17]));
  flat[0].faces = { 0: start() };
  flat[flat.length - 1].faces = { 0: { type: EXIT } };
  const slab4 = project(flat, { title: "Slab", author: "Ada" });
  const first = deps.shapes.get(levelKey(level("LEVEL 1")));
  const held = commonOf(shapeOf(slab4), first);
  assert.ok(held >= FLOOR && held / Math.max(first.size, flat.length) >= NEAR);
  assert.equal(recordOf(slab4, deps).title, "Slab");
  assert.deepEqual(noted(slab4), [
    { id: 1, note: look('"Slab"', Math.round((held / first.size) * 100), "LEVEL 1") },
  ]);
  assert.deepEqual(noted(row(2, "Two"), bundle([row(3, "Three"), moved])), [
    { id: 2, note: look(`level 1 (${forty.title}) of the bundle "Campaign"`, percent, "LEVEL 42") },
  ]);
  const third = Math.ceil(n / 3);
  assert.deepEqual(noted(rebuilt(forty, third)), [
    { id: 1, note: look(title, Math.round((third / n) * 100), "LEVEL 42") },
  ]);
  const one = fromLevel(level("LEVEL 1"));
  const outgrown = grown(one, one.blocks.length + 1);
  assert.deepEqual(noted(outgrown), [{ id: 1, note: look(`"${one.title}"`, 100, "LEVEL 1") }]);
  assert.deepEqual(noted(own(rebuilt(forty, third)), rebuilt(forty, 0), row(3, "Own")), []);
});

test("the shipped shapes are every level of the three discs under its slot, a variant under slot@release, each its template's shape, and the titles name each as the pause screen shows it, the disc's label after a variant's title", () => {
  const shapes = new Map();
  const titles = new Map();
  for (const l of mapData.levels) {
    shapes.set(levelKey(l), shapeOf(fromLevel(l)));
    titles.set(levelKey(l), l.shown || l.name);
  }
  for (const r of releases)
    for (const [slot, l] of Object.entries(r.levels)) {
      shapes.set(`${slot}@${r.id}`, shapeOf(fromLevel(l)));
      titles.set(`${slot}@${r.id}`, `${l.shown || l.name} (${r.label})`);
    }
  assert.deepEqual(deps.shapes, shapes);
  assert.deepEqual(deps.titles, titles);
  assert.equal(deps.titles.get(levelKey(level("LEVEL 42"))), "LEVEL 42");
  assert.equal(deps.titles.get("/HILLS/HILLS.PAK#18@jp"), "HIDDEN 2 (JP)");
});

test("a title, an author or notes holding a control, a bidi formatting or a zero-width character is refused, naming the character, a line break standing in the notes alone", () => {
  const spiral = (more) => row(2, "Spiral", more);
  refuses(row(2, "Spi‮ral"), 'the title of "Spi�ral" holds a bidi formatting character, U+202E');
  refuses(row(2, "⁦Spiral"), 'the title of "�Spiral" holds a bidi formatting character, U+2066');
  refuses(
    spiral({ author: "A\u0007da" }),
    'the author of "Spiral" holds a control character, U+0007',
  );
  refuses(
    spiral({ author: "Ada\u0085" }),
    'the author of "Spiral" holds a control character, U+0085',
  );
  refuses(
    spiral({ author: "Ada\u007f" }),
    'the author of "Spiral" holds a control character, U+007F',
  );
  refuses(spiral({ notes: "a\tb" }), 'the notes of "Spiral" hold a control character, U+0009');
  refuses(spiral({ notes: "a\r\nb" }), 'the notes of "Spiral" hold a control character, U+000D');
  refuses(row(2, "Spi\nral"), 'the title of "Spi�ral" holds a control character, U+000A');
  refuses(spiral({ author: "A\nda" }), 'the author of "Spiral" holds a control character, U+000A');
  refuses(spiral({ notes: "a​b" }), 'the notes of "Spiral" hold a zero-width character, U+200B');
  refuses(spiral({ notes: "﻿a" }), 'the notes of "Spiral" hold a zero-width character, U+FEFF');
  assert.doesNotThrow(() => recordOf(spiral({ notes: "Two lines.\nOr three." }), deps));
  assert.doesNotThrow(() => recordOf(spiral({ title: "Añо 😀", author: "Zoë" }), deps));
});

test("notes past the page's cap are refused by their count of characters, and a bundle by its count of levels or by having none", () => {
  refuses(
    row(2, "Spiral", { notes: "n".repeat(NOTES_MOST + 1) }),
    `the notes of "Spiral" run to ${NOTES_MOST + 1} characters, more than the ${NOTES_MOST} a record carries`,
  );
  assert.doesNotThrow(() => recordOf(row(2, "Spiral", { notes: "😀".repeat(NOTES_MOST) }), deps));
  refuses(
    bundle([row(2, "Two")], { notes: "n".repeat(NOTES_MOST + 1) }),
    `the notes of the bundle "Campaign" run to ${NOTES_MOST + 1} characters, more than the ${NOTES_MOST} a record carries`,
  );
  const many = Array.from({ length: BUNDLE_IN_CATALOGUE_MOST + 1 }, (_, i) => distinct(i, `L${i}`));
  refuses(
    bundle(many),
    `the bundle "Campaign" holds ${BUNDLE_IN_CATALOGUE_MOST + 1} levels, more than the ${BUNDLE_IN_CATALOGUE_MOST} a catalogue entry carries`,
  );
  assert.equal(recordOf(bundle(many.slice(1)), deps).levels.length, BUNDLE_IN_CATALOGUE_MOST);
  refuses(bundle([]), 'the bundle "Campaign" holds no level');
  refuses(bundle([], { title: "" }), "the untitled bundle holds no level");
});

test("a bundle is refused for its head or for any level of its own, the level named by its place", () => {
  refuses(
    bundle([row(2, "Two")], { title: 5 }),
    "the untitled bundle reads with 1 repair: title is not text; it is left empty",
  );
  refuses(
    bundle([row(2, "Two"), "x"]),
    'the bundle "Campaign" reads with 1 repair: level 1 is not a kula-world-level document; it is left out',
  );
  refuses(
    bundle([row(2, "Two"), broken]),
    `level 1 (Broken) of the bundle "Campaign" reads with 1 repair: ${PHASE}`,
  );
  refuses(
    bundle([shipped]),
    `level 0 (${shipped.title}) of the bundle "Campaign" is the disc's level at ${levelKey(level("LEVEL 1"))}, byte for byte`,
  );
  refuses(
    bundle([row(2, "Spi‮ral")]),
    'the title of level 0 (Spi�ral) of the bundle "Campaign" holds a bidi formatting character, U+202E',
  );
  refuses(
    bundle([row(2, "Two", { notes: "n".repeat(NOTES_MOST + 1) })]),
    `the notes of level 0 (Two) of the bundle "Campaign" run to ${NOTES_MOST + 1} characters, more than the ${NOTES_MOST} a record carries`,
  );
  refuses(
    bundle([wide]),
    'the checks find an error in level 0 (Slab) of the bundle "Campaign": 257 blocks: over the cap of 256',
  );
  assert.doesNotThrow(() => recordOf(bundle([{ ...row(2, "Newer"), version: 7 }]), deps));
});

// --- the index ------------------------------------------------------------------------

test("indexOf gives the catalogue for the records under the ledger, in the records' order, which the writer orders and the reader takes back whole", () => {
  const p = row(2, "Spiral");
  const b = bundle([row(3, "Three"), row(4, "Four")]);
  const { catalogue } = indexOf(
    [
      { id: 3, document: b },
      { id: 1, document: p },
    ],
    { next: 4, retired: [2] },
    deps,
  );
  assert.deepEqual(catalogue, {
    version: VERSION,
    licence: LICENCE,
    entries: [entryOf(3, readBundle(b).bundle), entryOf(1, readProject(p).project)],
    retired: [2],
  });
  const written = writeCatalogue(catalogue);
  const back = readCatalogue(written, { hides: HIDES });
  assert.deepEqual(back.report, []);
  assert.deepEqual(
    back.catalogue.entries.map((e) => e.id),
    [1, 3],
  );
  assert.equal(writeCatalogue(back.catalogue), written);
  assert.deepEqual(indexOf([], { next: 1, retired: [] }, deps).catalogue, {
    version: VERSION,
    licence: LICENCE,
    entries: [],
    retired: [],
  });
  assert.equal(writeCatalogue(indexOf([], { next: 1 }, deps).catalogue), EMPTY_TEXT);
});

test("indexOf refuses, one line each, an id retired or not issued, a record listed twice, an id that is no positive whole number and an issued id that is neither a record's id nor retired", () => {
  const p = row(2, "Spiral");
  assert.deepEqual(
    lines(() => indexOf([{ id: 1, document: p }], { next: 2, retired: [1] }, deps)),
    ["record 1 has an id the ledger retires"],
  );
  assert.deepEqual(
    lines(() => indexOf([{ id: 2, document: p }], { next: 2, retired: [] }, deps)),
    [
      "record 2 has an id the ledger has not issued, next being 2",
      "the ledger has issued 1, which no record carries and retired does not list",
    ],
  );
  assert.deepEqual(
    lines(() =>
      indexOf(
        [
          { id: 1, document: p },
          { id: 1, document: p },
        ],
        { next: 2 },
        deps,
      ),
    ),
    ["record 1 is listed twice"],
  );
  assert.deepEqual(
    lines(() =>
      indexOf(
        [
          { id: "__proto__", document: p },
          { id: 0, document: p },
          { id: 1.5, document: p },
          { id: 2 ** 53, document: p },
          { document: p },
        ],
        { next: 1 },
        deps,
      ),
    ),
    [
      'record "__proto__" has an id that is not a positive whole number',
      "record 0 has an id that is not a positive whole number",
      "record 1.5 has an id that is not a positive whole number",
      "record 9007199254740992 has an id that is not a positive whole number",
      "record undefined has an id that is not a positive whole number",
    ],
  );
  assert.deepEqual(
    lines(() => indexOf([{ id: 1, document: broken }], { next: 2 }, deps)),
    [`record 1: "Broken" reads with 1 repair: ${PHASE}`],
  );
  assert.equal({}.polluted, undefined);
});

test("indexOf refuses a level that is byte for byte another record's level, or another level of its own bundle, naming both", () => {
  const p = row(2, "Spiral");
  assert.deepEqual(
    lines(() =>
      indexOf(
        [
          { id: 1, document: p },
          { id: 2, document: { ...p, title: "Other", author: "Bob" } },
        ],
        { next: 3 },
        deps,
      ),
    ),
    ['record 2: "Other" is the same level as "Spiral" in record 1, byte for byte'],
  );
  assert.deepEqual(
    lines(() =>
      indexOf(
        [
          { id: 1, document: p },
          { id: 2, document: bundle([row(3, "Three"), p]) },
        ],
        { next: 3 },
        deps,
      ),
    ),
    [
      'record 2: level 1 (Spiral) of the bundle "Campaign" is the same level as "Spiral" in record 1, byte for byte',
    ],
  );
  assert.deepEqual(
    lines(() =>
      indexOf([{ id: 1, document: bundle([p, { ...p, title: "Again" }]) }], { next: 2 }, deps),
    ),
    [
      'record 1: level 1 (Again) of the bundle "Campaign" is the same level as level 0 (Spiral) of the bundle "Campaign" in record 1, byte for byte',
    ],
  );
});

test("indexOf refuses a ledger that is not next and retired, a next that is no positive whole number and retired ids that are none, named twice or not issued", () => {
  assert.deepEqual(
    lines(() => indexOf([], "x", deps)),
    ["the ledger is not a table of next and retired"],
  );
  assert.deepEqual(
    lines(() => indexOf([], { next: "x", retired: 7 }, deps)),
    [
      'the ledger\'s next is "x", not a positive whole number',
      "the ledger's retired is not a list",
    ],
  );
  assert.deepEqual(
    lines(() => indexOf([], {}, deps)),
    ["the ledger's next is undefined, not a positive whole number"],
  );
  assert.deepEqual(
    lines(() => indexOf([], { next: 3, retired: ["__proto__", 0, 1, 1, 3, 2 ** 53] }, deps)),
    [
      'the ledger retires "__proto__", which is not a positive whole number',
      "the ledger retires 0, which is not a positive whole number",
      "the ledger retires 1 twice",
      "the ledger retires 3, an id it has not issued, next being 3",
      "the ledger retires 9007199254740992, which is not a positive whole number",
      "the ledger has issued 2, which no record carries and retired does not list",
    ],
  );
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
});

// --- the files and the link ------------------------------------------------------------

test("the ledger is written with its two keys one a line and the retired ids once each in order, and read back, the empty ledger where there is no file", () => {
  assert.equal(
    writeLedger({ next: 4, retired: [9, 2, 9] }),
    '{\n  "next": 4,\n  "retired": [2, 9]\n}\n',
  );
  assert.equal(writeLedger({ next: 1, retired: [] }), '{\n  "next": 1,\n  "retired": []\n}\n');
  assert.equal(writeLedger({ next: 1 }), '{\n  "next": 1,\n  "retired": []\n}\n');
  const dir = scratch();
  try {
    assert.deepEqual(readLedger(dir), { next: 1, retired: [] });
    mkdirSync(join(dir, "catalogue"));
    writeFileSync(join(dir, LEDGER), writeLedger({ next: 4, retired: [2] }));
    assert.deepEqual(readLedger(dir), { next: 4, retired: [2] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readRecords reads each <id>.json under the records' directory by its stem, in order, none where the directory is missing, and refuses a stem that is no positive whole number or a file that is not JSON", () => {
  const dir = scratch();
  try {
    assert.deepEqual(readRecords(dir), []);
    const levels = join(dir, RECORDS);
    mkdirSync(levels, { recursive: true });
    const p = row(2, "Spiral");
    const q = row(3, "Three");
    writeFileSync(join(levels, "10.json"), writeProject(q));
    writeFileSync(join(levels, "2.json"), writeProject(p));
    writeFileSync(join(levels, "notes.txt"), "not a record");
    assert.deepEqual(readRecords(dir), [
      {
        id: 2,
        document: JSON.parse(writeProject(p)),
        text: writeProject(p),
        path: `${RECORDS}/2.json`,
      },
      {
        id: 10,
        document: JSON.parse(writeProject(q)),
        text: writeProject(q),
        path: `${RECORDS}/10.json`,
      },
    ]);
    for (const name of ["abc", "01", "0", "-1", "1.5", "__proto__"]) {
      writeFileSync(join(levels, `${name}.json`), writeProject(p));
      assert.throws(
        () => readRecords(dir),
        { message: `${RECORDS}/${name}.json is not named by a positive whole number` },
        name,
      );
      rmSync(join(levels, `${name}.json`));
    }
    writeFileSync(join(levels, "3.json"), "{");
    assert.throws(() => readRecords(dir), {
      message: new RegExp(`^${RECORDS}/3\\.json is not JSON: `),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("canonicalOf writes a level as the project file and a bundle as the bundle file, as the editor saves them", () => {
  const p = row(2, "Spiral");
  assert.equal(canonicalOf(JSON.parse(JSON.stringify(p))), writeProject(p));
  assert.equal(canonicalOf(bundle([p])), writeBundle(readBundle(bundle([p])).bundle));
  assert.throws(() => canonicalOf({ format: "orbit" }), /not a kula-world-level file/);
});

test("filled gives a document the author and the notes only where its own are empty", () => {
  const p = row(2, "Spiral", { author: "", notes: "" });
  assert.deepEqual(filled(p, { author: "Ada", notes: "Mind the gap." }), {
    ...p,
    author: "Ada",
    notes: "Mind the gap.",
  });
  const own = row(2, "Spiral", { author: "Bob", notes: "Own." });
  assert.deepEqual(filled({ ...own }, { author: "Ada", notes: "Mind the gap." }), own);
  assert.deepEqual(filled({ ...own }, {}), own);
  assert.deepEqual(filled({ ...own }), own);
  const bare = { format: "kula-world-level", blocks: [] };
  assert.deepEqual(filled(bare, { author: "Ada" }), { ...bare, author: "Ada" });
  assert.equal(filled("x", { author: "Ada" }), "x");
});

test("segmentOf finds the segment that carries a level in a link or a hash, escaped on its way or not, and null where there is none", () => {
  const segment = encodeLevel(row(2, "Spiral"));
  const hash = `#SHARED/L1/0,30/fit/33/${segment}`;
  assert.equal(segmentOf(`https://kulaworld.retroatlas.org/${hash}`), segment);
  assert.equal(segmentOf(hash), segment);
  assert.equal(segmentOf(`https://x/#${encodeURIComponent(hash.slice(1))}`), segment);
  assert.equal(segmentOf(`#HIRO/0/0,30/1.50/17,12,17/0.5,-0.25/33/d-eu/${segment}`), segment);
  for (const link of ["https://kulaworld.retroatlas.org/", "#HIRO/0/0,30/fit/33", "no link", ""])
    assert.equal(segmentOf(link), null, link);
});

// --- the command ---------------------------------------------------------------------

test("the command writes the index from the records and the ledger, adds a level from its link and a bundle from its file under the ids next names, and refuses without writing, a character that would hide or reorder what the terminal shows replaced in what it prints", async () => {
  const dir = scratch();
  const said = [];
  const out = (line) => said.push(line);
  const file = (path) => readFileSync(join(dir, path), "utf8");
  const run = async (argv) => {
    said.length = 0;
    return main(argv, dir, out);
  };
  try {
    mkdirSync(join(dir, "catalogue"));
    writeFileSync(join(dir, LEDGER), writeLedger({ next: 1, retired: [] }));
    assert.equal(await run([]), 0);
    assert.equal(file(INDEX), EMPTY_TEXT);
    assert.deepEqual(said, [`${INDEX}: 0 entries`]);

    const p = row(2, "Spiral", { author: "", notes: "" });
    const link = `https://kulaworld.retroatlas.org/#SHARED/L1/0,30/fit/33/${encodeLevel(p)}`;
    assert.equal(await run(["--add", link, "--author", "Ada", "--notes", "Mind the gap."]), 0);
    assert.deepEqual(said, ["1"]);
    assert.equal(
      file(`${RECORDS}/1.json`),
      writeProject({ ...p, author: "Ada", notes: "Mind the gap." }),
    );
    assert.equal(file(LEDGER), writeLedger({ next: 2, retired: [] }));
    assert.equal(
      file(INDEX),
      writeCatalogue(indexOf(readRecords(dir), readLedger(dir), deps).catalogue),
    );
    const [entry] = readCatalogue(file(INDEX), { hides: HIDES }).catalogue.entries;
    assert.deepEqual([entry.id, entry.author, entry.notes], [1, "Ada", "Mind the gap."]);

    assert.equal(await run(["--add", link]), 1);
    assert.deepEqual(said, [
      'record 2: "Spiral" is the same level as "Spiral" in record 1, byte for byte',
    ]);
    assert.ok(!existsSync(join(dir, RECORDS, "2.json")));
    assert.equal(file(LEDGER), writeLedger({ next: 2, retired: [] }));

    const b = bundle([row(3, "Three"), row(4, "Four")]);
    writeFileSync(join(dir, "campaign.json"), JSON.stringify(b));
    assert.equal(await run(["--add", join(dir, "campaign.json")]), 0);
    assert.deepEqual(said, ["2"]);
    assert.equal(file(`${RECORDS}/2.json`), writeBundle(readBundle(b).bundle));
    assert.equal(file(LEDGER), writeLedger({ next: 3, retired: [] }));
    const index = file(INDEX);
    assert.equal(await run([]), 0);
    assert.equal(file(INDEX), index);
    assert.deepEqual(said, [`${INDEX}: 2 entries`]);
    assert.deepEqual(
      readCatalogue(index, { hides: HIDES }).catalogue.entries.map((e) => [e.id, e.kind]),
      [
        [1, "level"],
        [2, "bundle"],
      ],
    );

    writeFileSync(join(dir, "copy.json"), writeProject(shipped));
    assert.equal(await run(["--add", join(dir, "copy.json")]), 1);
    assert.deepEqual(said, [
      `record 3: "${shipped.title}" is the disc's level at ${levelKey(level("LEVEL 1"))}, byte for byte`,
    ]);
    assert.equal(await run(["--add", `#SHARED/L1/0,30/fit/33/${encodeLevel(broken)}`]), 1);
    assert.deepEqual(said, [`the level in the link reads with 1 repair: ${PHASE_AT(0)}`]);
    writeFileSync(
      join(dir, "hostile.json"),
      JSON.stringify(row(6, "Six", { world: "\u001b[31mHIRO" })),
    );
    assert.equal(await run(["--add", join(dir, "hostile.json")]), 1);
    assert.deepEqual(said, [
      `record 3: the checks find an error in "Six": world '�[31mHIRO': not one of the disc's ten`,
    ]);
    assert.equal(await run(["--add", "nonsense"]), 1);
    assert.deepEqual(said, ["nonsense is neither a file nor a link that carries a level"]);
    writeFileSync(join(dir, "broken.json"), "{");
    assert.equal(await run(["--add", join(dir, "broken.json")]), 1);
    assert.match(said[0], new RegExp(`^${join(dir, "broken.json")} is not JSON: `));
    for (const argv of [["--bogus"], ["--add"], ["--author", "Ada"], ["--add", link, "--notes"]]) {
      assert.equal(await run(argv), 1, argv.join(" "));
      assert.match(said[0], /^usage: node tools\/community\.js /);
    }
    assert.ok(!existsSync(join(dir, RECORDS, "3.json")));
    assert.equal(file(LEDGER), writeLedger({ next: 3, retired: [] }));

    writeFileSync(join(dir, RECORDS, "3.json"), JSON.stringify(row(5, "Five")));
    writeFileSync(join(dir, LEDGER), writeLedger({ next: 4, retired: [] }));
    assert.equal(await run([]), 1);
    assert.deepEqual(said, [`${RECORDS}/3.json is not written as the editor saves it`]);
    assert.equal(file(INDEX), index);
    writeFileSync(join(dir, RECORDS, "3.json"), writeProject(row(5, "Five")));
    writeFileSync(join(dir, LEDGER), writeLedger({ next: 5, retired: [] }));
    assert.equal(await run([]), 1);
    assert.deepEqual(said, [
      "the ledger has issued 4, which no record carries and retired does not list",
    ]);
    assert.equal(file(INDEX), index);
    writeFileSync(join(dir, LEDGER), writeLedger({ next: 5, retired: [4] }));
    assert.equal(await run([]), 0);
    assert.deepEqual(said, [`${INDEX}: 3 entries`]);
    assert.deepEqual(readCatalogue(file(INDEX), { hides: HIDES }).catalogue.retired, [4]);

    const forty = fromLevel(level("LEVEL 42"));
    const k = forty.blocks.length;
    const look = (id, percent) =>
      `note: record ${id}: "${forty.title}" holds ${percent} percent of the blocks of the game's LEVEL 42, which is worth a look`;
    const shifted = own(
      moveBlocks(
        forty,
        forty.blocks.map((b) => b.cell),
        [1, 0, 0],
      ),
    );
    writeFileSync(join(dir, "shifted.json"), writeProject(shifted));
    assert.equal(await run(["--add", join(dir, "shifted.json")]), 0);
    assert.deepEqual(said, ["5", look(5, 100)]);
    const edited = own(nudged(forty, 3));
    writeFileSync(join(dir, "edited.json"), writeProject(edited));
    assert.equal(await run(["--add", join(dir, "edited.json")]), 0);
    const note = look(6, Math.round(((k - 3) / k) * 100));
    assert.deepEqual(said, ["6", note]);
    assert.equal(file(`${RECORDS}/6.json`), writeProject(edited));
    assert.equal(file(LEDGER), writeLedger({ next: 7, retired: [4] }));
    assert.equal(await run([]), 0);
    assert.deepEqual(said, [`${INDEX}: 5 entries`, look(5, 100), note]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the documents --------------------------------------------------------------------

test("docs/tools.md counts the Node tools and names each in its first paragraph and in its table", () => {
  const tools = readdirSync(join(root, "tools"))
    .filter((f) => f.endsWith(".js"))
    .sort();
  const doc = text("docs/tools.md");
  const [first] = doc.split("\n\n").slice(1);
  assert.ok(first.includes(`are the ${spelled(tools.length)} Node tools`), first);
  for (const tool of tools) {
    assert.ok(first.includes(`\`${tool}\``), `${tool} is not among the Node tools named`);
    assert.ok(doc.includes(`\n| \`${tool}\` | `), `${tool} has no row`);
  }
});

test("docs/community.md says how a level is added by hand: the command, the records, the ledger, the index, the commit's grant and what the tool refuses", () => {
  const doc = text("docs/community.md");
  const at = doc.indexOf("\n## Adding a level by hand\n");
  assert.ok(at > 0, "no section on adding a level by hand");
  const section = doc.slice(at);
  for (const phrase of [
    "node tools/community.js --add",
    "`npm test`",
    `\`${RECORDS}/<id>.json\``,
    `\`${LEDGER}\``,
    `\`${INDEX}\``,
    "CC BY 4.0",
    "`retired`",
    "`next`",
  ])
    assert.ok(section.includes(phrase), `the section has no ${phrase}`);
  const figure = (pattern) => {
    const hit = pattern.exec(section);
    assert.ok(hit, `the section has no sentence matching ${pattern}`);
    return Number(hit[1]);
  };
  assert.equal(figure(/notes past (\d+) characters/), NOTES_MOST);
  assert.equal(figure(/a bundle of more than (\d+) levels/), BUNDLE_IN_CATALOGUE_MOST);
  const WORDS = { 0.5: "a half", 0.2: "a fifth" };
  for (const bar of [NEAR, FROM_NOTE])
    assert.ok(
      section.includes(`is ${WORDS[bar]} or more`),
      `the section has no ${WORDS[bar]} or more`,
    );
  const COUNTS = { 8: "eight" };
  assert.ok(
    section.includes(`at least ${COUNTS[FLOOR]} blocks in common`),
    `the section has no at least ${COUNTS[FLOOR]} blocks in common`,
  );
});
