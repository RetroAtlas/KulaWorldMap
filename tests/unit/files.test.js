import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { plain, project, start } from "./project-doc.js";
import { writeProject } from "../../public/js/format/project.js";
import { NOT_LINK, OWN_LEVEL } from "../../public/js/format/orbit.js";
import { NOT_CARRIED } from "../../public/js/format/share.js";
import { BUNDLE_FORMAT, writeBundle } from "../../public/js/format/bundle.js";
import { shareLink } from "../../public/js/editor/sharelink.js";
import { SLUG_MOST, readLevelFile, readLevelText, slug } from "../../public/js/editor/files.js";

const ORIGIN = "https://example.test/map/";
const parts = { cam: { yaw: 45, pitch: 35 }, target: null, slice: 33 };
const orbit = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/orbit-levels.json", import.meta.url)), "utf8"),
);
const carried = project([plain([17, 17, 17], 0, { 0: start() })], {
  title: "Carried one",
  author: "Ada",
  notes: "Mind the gap.",
  world: "INCA",
});
const linkOf = (p) => shareLink(p, parts, ORIGIN);
const hashOf = (link) => link.slice(link.indexOf("#"));

test("a slug is the title composed and lower-cased, every run of anything but letters, their marks and digits one hyphen, trimmed and cut, the fallback word where nothing is left", () => {
  assert.equal(slug("E\u0301pe\u0301e, a\u0300 la mode!!"), "\u00e9p\u00e9e-\u00e0-la-mode");
  assert.equal(
    slug("\u0939\u093f\u0902\u0926\u0940 \u0969"),
    "\u0939\u093f\u0902\u0926\u0940-\u0969",
  );
  assert.equal(slug("q\u0303 marks"), "q\u0303-marks");
  assert.equal(slug("Ti\u1ebfng Vi\u1ec7t"), "ti\u1ebfng-vi\u1ec7t");
  assert.equal(slug(" -- Spiral -- "), "spiral");
  assert.equal(slug("***"), "level");
  assert.equal(slug(""), "level");
  assert.equal(slug("***", "bundle"), "bundle");
  assert.equal(slug("Spiral", "bundle"), "spiral");
  const long = slug(`abc ${"x".repeat(80)}`);
  assert.equal(long.length, SLUG_MOST);
  assert.ok(long.startsWith("abc-xxxx"));
});

test("pasted text is read as the map's own link first, the whole address or its hash alone, titled as its document is, and as the community viewer's link otherwise, titled Shared level", async () => {
  const whole = await readLevelText(linkOf(carried), "MARS");
  assert.equal(writeProject(whole.project), writeProject(carried));
  assert.deepEqual(
    [whole.project.title, whole.project.world, whole.report],
    ["Carried one", "INCA", []],
  );
  const bare = await readLevelText(`  ${hashOf(linkOf(carried))}\n`, "MARS");
  assert.equal(writeProject(bare.project), writeProject(carried));
  const [, c] = Object.entries(orbit.levels)[0];
  const shared = await readLevelText(`https://example.test/?level=${c.link}`, "MARS");
  assert.deepEqual([shared.project.title, shared.project.world], ["Shared level", "MARS"]);
  await assert.rejects(readLevelText("hello there", "MARS"), { message: NOT_LINK });
  await assert.rejects(readLevelText("https://example.test/?level=42", "MARS"), {
    message: OWN_LEVEL,
  });
});

test("a link whose level is over one of the game's caps is refused in the checks' words, and one whose segment will not read in the share reader's words", async () => {
  const slab = [];
  for (let x = 1; x <= 16; x++) for (let y = 1; y <= 16; y++) slab.push(plain([x, y, 17]));
  slab[0].faces = { 0: start() };
  slab.push(plain([17, 1, 17]));
  await assert.rejects(readLevelText(linkOf(project(slab)), "MARS"), {
    message: "That link cannot be read as a level: 257 blocks: over the cap of 256.",
  });
  await assert.rejects(readLevelText(linkOf(carried).replace(/\/s[^/]*$/, "/sAbcd"), "MARS"), {
    message: NOT_CARRIED,
  });
});

const bytes = (text) => new TextEncoder().encode(text);
const one = (title, more = {}) =>
  project([plain([17, 17, 17], 0, { 0: start() })], { title, ...more });
const nowhere = one("Nowhere", { world: "NOWHERE" });
const crowded = project(
  Array.from({ length: 2049 }, (_, i) =>
    plain([1 + (i % 32), 1 + (Math.floor(i / 32) % 32), 1 + Math.floor(i / 1024)], 6),
  ),
  { title: "" },
);
const NO_WORLD = "names a world the disc has not";
const CROWDED = "cannot be read as a level: 2049 records: over the cap of 123";
const NONE = "That bundle holds no level the map can open";
const openBundle = (document) => readLevelFile(bytes(document), "set.kula-bundle.json", "MARS");

test("a bundle opens as the reads of the levels the map can show, in the file's order, its title, author and notes on the list with its report, a level the disc cannot show or the writer refuses left out with its place and its reason", async () => {
  const levels = [one("One"), nowhere, crowded, one("", { world: "INCA" })];
  const reads = await openBundle(writeBundle({ title: "Set", author: "Ada", notes: "n", levels }));
  assert.deepEqual(
    reads.map((r) => [r.at, writeProject(r.project)]),
    [
      [0, writeProject(levels[0])],
      [3, writeProject(levels[3])],
    ],
  );
  assert.deepEqual(reads.bundle, {
    title: "Set",
    author: "Ada",
    notes: "n",
    report: [
      `level 1 (Nowhere) ${NO_WORLD}; it is left out`,
      `level 2 (Untitled level) ${CROWDED}; it is left out`,
    ],
    repairs: 2,
  });
  // the place counts from the file's list, past an entry that is no level, whose own line stands first
  const odd = JSON.stringify({ format: BUNDLE_FORMAT, levels: ["x", nowhere, levels[0]] });
  const some = await openBundle(odd);
  assert.deepEqual(
    some.map((r) => r.at),
    [2],
  );
  assert.deepEqual(some.bundle, {
    title: "",
    author: "",
    notes: "",
    report: [
      "level 0 is not a kula-world-level document; it is left out",
      `level 1 (Nowhere) ${NO_WORLD}; it is left out`,
    ],
    repairs: 2,
  });
});

test("a bundle with no level the map can open is refused in one sentence, naming the first reason and counting the rest", async () => {
  const refused = (levels, message) =>
    assert.rejects(openBundle(writeBundle({ title: "Set", levels })), { message });
  await refused([nowhere], `${NONE}: level 0 (Nowhere) ${NO_WORLD}.`);
  await refused(
    [crowded, nowhere],
    `${NONE}: level 0 (Untitled level) ${CROWDED}, and 1 more is left out.`,
  );
  await refused(
    [nowhere, nowhere, crowded],
    `${NONE}: level 0 (Nowhere) ${NO_WORLD}, and 2 more are left out.`,
  );
  await refused([], `${NONE}.`);
  await assert.rejects(openBundle(JSON.stringify({ format: BUNDLE_FORMAT, levels: ["x"] })), {
    message: `${NONE}.`,
  });
});
