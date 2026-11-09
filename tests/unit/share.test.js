import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { mapData } from "./fixtures.js";
import { plain, project, start } from "./project-doc.js";
import { MOST } from "../../public/js/format/inflate.js";
import { fromLevel, writeProject } from "../../public/js/format/project.js";
import {
  LETTER,
  NEWER,
  NOT_CARRIED,
  NO_WORLD,
  SEGMENT_MOST,
  SHARED_PACK,
  TOO_LONG,
  decodeSegment,
  digestOf,
} from "../../public/js/format/share.js";
import { encodeLevel } from "../../public/js/format/sharewrite.js";

const SEGMENT = /^s[A-Za-z0-9_-]+$/;
// What every shipped level's segment stays under, with room for the texts a level carries.
const SEGMENT_BOUND = 1200;
const templates = mapData.levels.map((l) => fromLevel(l));
const texts = templates.map(writeProject);
const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const refused = (segment, message) =>
  assert.rejects(decodeSegment(segment), { message }, String(segment).slice(0, 40));

test("the letter, the pack and the cap are what every link ever shared is read by", () => {
  assert.equal(LETTER, "s");
  assert.equal(SHARED_PACK, "/SHARED/SHARED.PAK");
  assert.match(SHARED_PACK, /\.PAK$/);
  assert.equal(SEGMENT_MOST, 200000);
});

test("every shipped level's segment reads back to its own canonical text, with nothing repaired, under the bound", async () => {
  const segments = templates.map(encodeLevel);
  segments.forEach((segment, i) => {
    assert.match(segment, SEGMENT, mapData.levels[i].name);
    assert.ok(segment.length < SEGMENT_BOUND, `${mapData.levels[i].name}: ${segment.length}`);
  });
  const reads = await Promise.all(segments.map(decodeSegment));
  reads.forEach(({ project: p, report, repairs }, i) => {
    assert.equal(writeProject(p), texts[i], mapData.levels[i].name);
    assert.deepEqual([report, repairs], [[], 0], mapData.levels[i].name);
  });
});

test("a level of two hundred plain blocks comes back as it went", async () => {
  const blocks = [];
  for (let x = 1; x <= 20; x++) for (let y = 1; y <= 10; y++) blocks.push(plain([x, y, 17]));
  blocks[0].faces = { 0: start() };
  const p = project(blocks, { title: "Slab", author: "Ada", notes: "Twenty by ten." });
  const { project: q, report } = await decodeSegment(encodeLevel(p));
  assert.equal(q.blocks.length, 200);
  assert.equal(writeProject(q), writeProject(p));
  assert.deepEqual(report, []);
});

test("the digest is a letter and FNV-1a 32 of the text's UTF-16 code units in base36 upper case, the same every time and distinct over the shipped levels", () => {
  assert.equal(parseInt(digestOf("").slice(1), 36), 0x811c9dc5);
  assert.equal(parseInt(digestOf("a").slice(1), 36), 0xe40c292c);
  assert.equal(parseInt(digestOf("foobar").slice(1), 36), 0xbf9cf968);
  assert.equal(parseInt(digestOf("\u20ac").slice(1), 36), 0xa93e2c4b);
  const digests = texts.map(digestOf);
  for (const d of digests) {
    assert.match(d, /^L[0-9A-Z]{1,7}$/);
    assert.equal(d, d.toUpperCase());
  }
  assert.deepEqual(texts.map(digestOf), digests);
  assert.equal(new Set(digests).size, texts.length);
  assert.notEqual(digestOf(texts[0]), digestOf(`${texts[0]} `));
});

test("a segment that carries no level the map can read is refused in one sentence", async () => {
  const segment = encodeLevel(templates[0]);
  const payload = segment.slice(LETTER.length);
  for (const bare of [undefined, 42, null, payload, `x${payload}`, "", "s", "sA"])
    await refused(bare, NOT_CARRIED);
  const dashed = templates.map(encodeLevel).find((s) => /[-_]/.test(s));
  assert.ok(dashed);
  for (const bad of [
    `${segment}=`,
    `${segment}+`,
    `${segment} `,
    `s${payload.slice(0, 8)}.${payload.slice(8)}`,
    `s${payload.slice(0, 8)}    ${payload.slice(8)}`,
    dashed.replace(/-/g, "+").replace(/_/g, "/"),
  ])
    await refused(bad, NOT_CARRIED);
  await refused(`s${base64url(Buffer.from("not a stream"))}`, NOT_CARRIED);
  await refused(`s${base64url(deflateSync(Buffer.from("not json")))}`, NOT_CARRIED);
  await refused(`s${base64url(deflateSync(Uint8Array.from([0xff, 0xfe, 0x22])))}`, NOT_CARRIED);
  const marked = Buffer.from(
    writeProject(project([plain([17, 17, 17], 0, { 0: start() })], { title: "Ada" })),
  );
  marked[marked.indexOf("Ada") + 1] = 0xff;
  await refused(`s${base64url(deflateSync(marked))}`, NOT_CARRIED);
  await refused(`s${base64url(deflateSync(Buffer.from('{"format":"other"}')))}`, NOT_CARRIED);
  await refused(`s${base64url(deflateSync(Buffer.from("[1, 2]")))}`, NOT_CARRIED);
  await refused(`s${base64url(deflateSync(Buffer.from(JSON.stringify(texts[0]))))}`, NOT_CARRIED);
});

test("a level whose text inflates past the page's ceiling is refused, under the segment cap as it is", async () => {
  const blocks = [];
  for (let x = 1; x <= 30; x++)
    for (let y = 1; y <= 30; y++) for (let z = 1; z <= 30; z++) blocks.push(plain([x, y, z]));
  blocks[0].faces = { 0: start() };
  const cube = project(blocks, { title: "Cube" });
  assert.ok(Buffer.byteLength(writeProject(cube)) > MOST);
  const segment = encodeLevel(cube);
  assert.ok(segment.length < SEGMENT_MOST);
  await refused(segment, NOT_CARRIED);
});

test("a document whose world is not one of the disc's ten worlds is refused by its world", async () => {
  await refused(encodeLevel({ ...templates[0], world: "MOON" }), NO_WORLD);
  await refused(encodeLevel({ ...templates[0], world: "hiro" }), NO_WORLD);
});

test("a segment over the cap is refused before anything of it is decoded, and one at the cap is read and refused for what it holds", async () => {
  await refused(`s${"A".repeat(SEGMENT_MOST)}`, TOO_LONG);
  await refused(`s${".".repeat(SEGMENT_MOST)}`, TOO_LONG);
  await refused(`s${"A".repeat(SEGMENT_MOST - 1)}`, NOT_CARRIED);
  await refused(`x${"A".repeat(SEGMENT_MOST)}`, NOT_CARRIED);
});

test("a browser that cannot inflate is told it needs a newer one", async () => {
  const segment = encodeLevel(templates[0]);
  const held = globalThis.DecompressionStream;
  globalThis.DecompressionStream = undefined;
  try {
    await refused(segment, NEWER);
  } finally {
    globalThis.DecompressionStream = held;
  }
  assert.equal(writeProject((await decodeSegment(segment)).project), texts[0]);
});
