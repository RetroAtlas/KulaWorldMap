import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { FORMAT, VERSION } from "../../public/js/format/kwl.js";
import { UNTITLED, blank, fromLevel, writeProject } from "../../public/js/format/project.js";
import {
  BUNDLE_FORMAT,
  BUNDLE_MOST,
  readBundle,
  writeBundle,
} from "../../public/js/format/bundle.js";
import { WORLD, doc, level, plain, project, start } from "./project-doc.js";

const bundle = (levels, more = {}) => ({
  format: BUNDLE_FORMAT,
  version: 1,
  title: "Campaign",
  author: "",
  notes: "",
  levels,
  ...more,
});
const head = (more = {}) => ({
  format: BUNDLE_FORMAT,
  version: VERSION,
  title: "",
  author: "",
  notes: "",
  levels: [],
  ...more,
});
// A level whose vanishing blocks each carry a phase the reader repairs, one line a block.
const broken = (title, n) =>
  project(
    [
      plain([5, 9, 5], 0, { 0: start() }),
      ...Array.from({ length: n }, (_, i) => ({ cell: [5 + i, 5, 5], kind: 7, phase: "x" })),
    ],
    { title },
  );
const PHASE = 'has a phase of "x", which is not a whole number; it is 0';
const indented = (text) =>
  text
    .trimEnd()
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

// --- reading ---------------------------------------------------------------------

test("a bundle of the templates, cut in tens, reads back the same and writes again as itself", () => {
  const templates = mapData.levels.map((l) => fromLevel(l));
  for (let at = 0; at < templates.length; at += 10) {
    const levels = templates.slice(at, at + 10);
    const text = writeBundle({ title: `Slice ${at / 10}`, author: "me", notes: "n", levels });
    const read = readBundle(text);
    assert.deepEqual(read.report, [], text.slice(0, 60));
    assert.equal(read.repairs, 0);
    assert.deepEqual(
      read.bundle,
      head({ title: `Slice ${at / 10}`, author: "me", notes: "n", levels }),
    );
    assert.deepEqual(
      read.levels.map((l) => l.project),
      levels,
    );
    assert.ok(read.levels.every((l) => l.report.length === 0 && l.repairs === 0));
    assert.equal(writeBundle(read.bundle), text);
    assert.deepEqual(readBundle(JSON.parse(text)), read);
  }
});

test("the reader refuses another format's file and nothing else, and fills the defaults", () => {
  assert.throws(
    () => readBundle(`{"format": "${FORMAT}", "levels": []}`),
    /not a kula-world-bundle file/,
  );
  assert.throws(() => readBundle({ version: 1, levels: [] }), /not a kula-world-bundle file/);
  assert.throws(() => readBundle("[]"), /not a kula-world-bundle file/);
  assert.throws(() => readBundle("null"), /not a kula-world-bundle file/);
  assert.throws(() => readBundle("not even json"), SyntaxError);
  const { bundle: b, report, repairs, levels } = readBundle({ format: BUNDLE_FORMAT });
  assert.deepEqual(report, ["no levels"]);
  assert.equal(repairs, 1);
  assert.deepEqual(levels, []);
  assert.deepEqual(b, head());
  for (const levels of ["text", {}, 7, null, true])
    assert.deepEqual(
      readBundle({ format: BUNDLE_FORMAT, levels }).report,
      ["no levels"],
      String(levels),
    );
  const none = readBundle({ format: BUNDLE_FORMAT, levels: [] });
  assert.deepEqual(none, { bundle: head(), report: [], repairs: 0, levels: [] });
});

test("the head's texts are read under the level file's caps, with its lines", () => {
  const {
    bundle: b,
    report,
    repairs,
  } = readBundle(bundle([], { title: "a".repeat(81), author: 5, notes: "c".repeat(2001) }));
  assert.equal(b.title, "a".repeat(80));
  assert.equal(b.author, "");
  assert.equal(b.notes, "c".repeat(2000));
  assert.deepEqual(report, [
    "title is 81 characters long, more than the 80 kept; it is cut to 80",
    "author is not text; it is left empty",
    "notes is 2001 characters long, more than the 2000 kept; it is cut to 2000",
  ]);
  assert.equal(repairs, 3);
  assert.deepEqual(readBundle(writeBundle(b)), { bundle: b, report: [], repairs: 0, levels: [] });
});

test("an entry that is not a level document is left out with its line, and the rest keep their order", () => {
  const one = project([plain([5, 5, 5], 0, { 0: start() })], { title: "One" });
  const two = project([plain([6, 5, 5], 0, { 0: start() })], { title: "Two" });
  const {
    bundle: b,
    report,
    repairs,
    levels,
  } = readBundle(bundle([one, "text", null, { format: "orbit", blocks: [] }, two, [one]]));
  assert.deepEqual(
    b.levels.map((p) => p.title),
    ["One", "Two"],
  );
  assert.deepEqual(
    levels.map((l) => l.project.title),
    ["One", "Two"],
  );
  assert.deepEqual(report, [
    "level 1 is not a kula-world-level document; it is left out",
    "level 2 is not a kula-world-level document; it is left out",
    "level 3 is not a kula-world-level document; it is left out",
    "1 more line like the one above",
  ]);
  assert.equal(repairs, 4);
});

test("a level's lines carry its place and its title, and the bundle's count takes in its repairs", () => {
  const {
    bundle: b,
    report,
    repairs,
    levels,
  } = readBundle(bundle([broken("", 1), broken("Spiral 2", 5)], { title: "t".repeat(81) }));
  assert.deepEqual(report, [
    "title is 81 characters long, more than the 80 kept; it is cut to 80",
    `level 0 (${UNTITLED}): block 1 at 5,5,5 ${PHASE}`,
    `level 1 (Spiral 2): block 1 at 5,5,5 ${PHASE}`,
    `level 1 (Spiral 2): block 2 at 6,5,5 ${PHASE}`,
    `level 1 (Spiral 2): block 3 at 7,5,5 ${PHASE}`,
    "2 more lines like the one above",
  ]);
  assert.equal(repairs, 7);
  assert.deepEqual(
    levels.map((l) => l.repairs),
    [1, 5],
  );
  assert.deepEqual(levels[1].report, [
    `block 1 at 5,5,5 ${PHASE}`,
    `block 2 at 6,5,5 ${PHASE}`,
    `block 3 at 7,5,5 ${PHASE}`,
    "2 more lines like the one above",
  ]);
  assert.deepEqual(
    b.levels[1].blocks.filter((block) => block.kind === 7).map((block) => block.phase),
    [0, 0, 0, 0, 0],
  );
  assert.equal(levels[1].project, b.levels[1]);
});

test("the report is collapsed once over every level's lines, so lines of one shape across numbered levels are counted together, each level's own read kept to three on its own", () => {
  const { report, repairs, levels } = readBundle(
    bundle(Array.from({ length: 5 }, (_, i) => broken(`Spiral ${i + 1}`, 5))),
  );
  assert.deepEqual(report, [
    `level 0 (Spiral 1): block 1 at 5,5,5 ${PHASE}`,
    `level 0 (Spiral 1): block 2 at 6,5,5 ${PHASE}`,
    `level 0 (Spiral 1): block 3 at 7,5,5 ${PHASE}`,
    "22 more lines like the one above",
  ]);
  assert.equal(repairs, 25);
  assert.deepEqual(
    levels.map((l) => l.repairs),
    [5, 5, 5, 5, 5],
  );
  for (const l of levels)
    assert.deepEqual(l.report, [
      `block 1 at 5,5,5 ${PHASE}`,
      `block 2 at 6,5,5 ${PHASE}`,
      `block 3 at 7,5,5 ${PHASE}`,
      "2 more lines like the one above",
    ]);
  const same = readBundle(bundle(Array.from({ length: 5 }, () => broken("Same", 1))));
  assert.deepEqual(same.report, [
    `level 0 (Same): block 1 at 5,5,5 ${PHASE}`,
    `level 1 (Same): block 1 at 5,5,5 ${PHASE}`,
    `level 2 (Same): block 1 at 5,5,5 ${PHASE}`,
    "2 more lines like the one above",
  ]);
  assert.equal(same.repairs, 5);
});

test("a level whose report runs to hundreds of thousands of lines reads through, each line under its place", () => {
  // a face key of letters alone is a shape of its own, so the collapse keeps every line
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const faces = { 0: start() };
  for (let i = 0; i < 200_000; i++) {
    let key = "";
    for (let n = i; ; n = Math.floor(n / 26) - 1) {
      key = letters[n % 26] + key;
      if (n < 26) break;
    }
    faces[key] = 1;
  }
  const many = project([plain([5, 9, 5], 0, faces)], { title: "Many" });
  const { report, repairs, levels } = readBundle(bundle([many]));
  assert.equal(report.length, 200_000);
  assert.equal(repairs, 200_000);
  assert.equal(
    report[0],
    'level 0 (Many): block 0 at 5,9,5 names a face "a", which is not one of the six; it is left out',
  );
  assert.equal(levels[0].report.length, 200_000);
});

test("a list past the cap keeps the first levels and says so in one line", () => {
  const many = Array.from({ length: BUNDLE_MOST + 1 }, (_, i) => ({
    ...blank(WORLD),
    title: `Level ${i}`,
  }));
  const { bundle: b, report, repairs, levels } = readBundle(bundle(many));
  assert.equal(b.levels.length, BUNDLE_MOST);
  assert.equal(levels.length, BUNDLE_MOST);
  assert.equal(b.levels.at(-1).title, `Level ${BUNDLE_MOST - 1}`);
  assert.deepEqual(report, [
    `levels lists ${BUNDLE_MOST + 1} levels, more than the ${BUNDLE_MOST} kept; it is cut to ${BUNDLE_MOST}`,
  ]);
  assert.equal(repairs, 1);
  const full = readBundle(bundle(many.slice(0, BUNDLE_MOST)));
  assert.deepEqual(full.report, []);
  assert.equal(full.bundle.levels.length, BUNDLE_MOST);
  assert.equal(BUNDLE_MOST, mapData.levels.length);
});

test("a newer version is read with the note, which is not a repair, at the head and in a level", () => {
  const newer = { ...blank(WORLD), version: 7 };
  const { bundle: b, report, repairs, levels } = readBundle(bundle([newer], { version: 9 }));
  assert.equal(b.version, 1);
  assert.equal(b.levels[0].version, 1);
  assert.deepEqual(report, [
    "written as version 9 of the format, newer than this reader's version 1; what it knows is read",
    `level 0 (${UNTITLED}): written as version 7 of the format, newer than this reader's version 1; what it knows is read`,
  ]);
  assert.equal(repairs, 0);
  assert.equal(levels[0].repairs, 0);
  const spelled = readBundle(bundle([], { version: "2" }));
  assert.deepEqual(spelled.report, [
    'a version of "2" is not a whole number; the file is read as version 1',
  ]);
  assert.equal(spelled.repairs, 1);
});

test("a key the language reserves does nothing, at the head or in a level", () => {
  const inside = JSON.stringify(blank(WORLD)).replace(
    /^\{/,
    '{"__proto__": {"polluted": true}, "constructor": "x", ',
  );
  const t = `{"format": "${BUNDLE_FORMAT}", "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "levels": [${inside}]}`;
  const { bundle: b, report, repairs } = readBundle(t);
  assert.deepEqual(report, []);
  assert.equal(repairs, 0);
  assert.deepEqual(Object.keys(b), ["format", "version", "title", "author", "notes", "levels"]);
  assert.deepEqual(Object.keys(b.levels[0]), Object.keys(blank(WORLD)));
  assert.equal(Object.getPrototypeOf(b), Object.prototype);
  assert.equal(Object.getPrototypeOf(b.levels[0]), Object.prototype);
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
  assert.equal({}.polluted, undefined);
  assert.equal(writeBundle(b), writeBundle(head({ levels: [blank(WORLD)] })));
});

// --- writing ---------------------------------------------------------------------

test("the writer writes the head's keys in order and each level as its own file, indented", () => {
  const p = fromLevel(level("LEVEL 1"));
  const text = writeBundle({ title: "One", author: "me", notes: "n", levels: [p] });
  const keys = text
    .split("\n")
    .map((line) => /^ {2}"(\w+)":/.exec(line)?.[1])
    .filter(Boolean);
  assert.deepEqual(keys, ["format", "version", "title", "author", "notes", "levels"]);
  const opening = `{\n  "format": "${BUNDLE_FORMAT}",\n  "version": 1,\n  "title": "One",\n  "author": "me",\n  "notes": "n",\n  "levels": [\n`;
  assert.equal(text, `${opening}${indented(writeProject(p))}\n  ]\n}\n`);
  const two = writeBundle({ levels: [p, p] });
  assert.equal(two.split("\n    },\n    {\n").length, 2);
  assert.equal(readBundle(two).bundle.levels.length, 2);
  const empty = `{\n  "format": "${BUNDLE_FORMAT}",\n  "version": 1,\n  "title": "",\n  "author": "",\n  "notes": "",\n  "levels": []\n}\n`;
  assert.equal(writeBundle({ levels: [] }), empty);
  assert.equal(writeBundle({}), empty);
  assert.deepEqual(readBundle(empty), { bundle: head(), report: [], repairs: 0, levels: [] });
});

test("the writer writes a bundle as the document shows one", () => {
  const section = doc.slice(doc.indexOf("\n## The bundle file\n"));
  const example = /```json\n([\s\S]*?)```/.exec(section)[1];
  const { bundle: b, report, repairs } = readBundle(example);
  assert.deepEqual([report, repairs, b.levels.length], [[], 0, 1]);
  assert.equal(writeBundle(b), example);
  assert.ok(example.includes(indented(writeProject(b.levels[0]))));
  const cap = /more than (\d+) levels, as many as the disc has slots, keeps the first (\d+)/.exec(
    section,
  );
  assert.ok(cap, "editor.md has no sentence giving the cap on a bundle's levels");
  assert.deepEqual(cap.slice(1).map(Number), [BUNDLE_MOST, BUNDLE_MOST]);
});
