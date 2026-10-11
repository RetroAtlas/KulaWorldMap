import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { mapData, levelKey } from "./fixtures.js";
import { projectOf, writeKwl } from "../../public/js/kwl.js";
import {
  NOT_LINK,
  OWN_LEVEL,
  isOrbit,
  kwlOfOrbit,
  linkParts,
  parseOrbitText,
  readOrbit,
  readOrbitLink,
} from "../../public/js/orbit.js";

// Five level files of the community's viewer, each a shipped level, and the
// share link its encoder makes of each; the fixture's own key says where they
// are from.
const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const fixture = JSON.parse(readFileSync(at("../fixtures/orbit-levels.json"), "utf8"));
const digests = JSON.parse(readFileSync(at("../fixtures/kwl-digests.json"), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shipped = (key) => projectOf(mapData.levels.find((l) => levelKey(l) === key));
const link = (text) =>
  Buffer.from(gzipSync(Buffer.from(text, "utf8")))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const START = { id: 30, option: 1, variant: 0, state: 0 };
const BARE = { id: 0, option: 65535, variant: 65535, state: 0 };
const level = (blocks, more = {}) => ({ time: 99, hidden: false, reverse: false, blocks, ...more });
const plain = (pos, type = 0, items = []) => ({ type, pos, items });
const starting = (pos) => plain(pos, 0, [START]);

test("the viewer's level files read back to the disc's own levels, byte for byte in the game's file", () => {
  const entries = Object.entries(fixture.levels);
  assert.ok(entries.length >= 5);
  for (const [n, c] of entries) {
    const { project, report } = readOrbit(c.json, "HIRO");
    assert.deepEqual(report, [], n);
    assert.equal(sha256(writeKwl(project)), digests[c.level].kwl, n);
    const own = shipped(c.level);
    assert.deepEqual(project.blocks, own.blocks, n);
    assert.deepEqual(
      [project.time, project.hidden, project.invisibleFromAfar, project.circuits, project.world],
      [own.time, own.hidden, own.invisibleFromAfar, own.circuits, "HIRO"],
      n,
    );
  }
  const kinds = new Set(entries.flatMap(([, c]) => c.json.blocks.map((b) => b.type)));
  for (const kind of [0, 1, 3, 5, 6, 8]) assert.ok(kinds.has(kind), `a block of kind ${kind}`);
  assert.ok(entries.some(([, c]) => c.json.reverse));
  assert.ok(entries.some(([, c]) => c.json.blocks.some((b) => b.items?.some((i) => i?.id === 5))));
});

test("the share link of each reads to the same level, in the disc's world the link names or the one on screen", async () => {
  for (const [n, c] of Object.entries(fixture.levels)) {
    const named = await readOrbitLink(`https://example.test/?theme=mars&level=${c.link}`, "HIRO");
    assert.equal(sha256(writeKwl(named.project)), digests[c.level].kwl, n);
    assert.deepEqual([named.project.world, named.report], ["MARS", []], n);
    const bare = await readOrbitLink(c.link, "INCA");
    assert.equal(bare.project.world, "INCA", n);
    assert.equal(sha256(writeKwl(bare.project)), digests[c.level].kwl, n);
    const other = await readOrbitLink(`?level=${c.link}&theme=crimson`, "HELL");
    assert.deepEqual(
      [other.project.world, other.report],
      ["HELL", ["the link's theme crimson is not one of the disc's worlds"]],
      n,
    );
  }
});

test("a level is told by its blocks at positions and its time", () => {
  assert.ok(isOrbit(level([plain([1, 31, 2])])));
  assert.ok(isOrbit(level([])));
  assert.ok(isOrbit(level([{ type: 0, pos: [1, 2, 3], items: null }])));
  assert.ok(isOrbit(level([{ type: 7, pos: [1, 2, 3], intervals: null }])));
  assert.ok(isOrbit(level([{ type: 7, pos: [1, 2, 3] }])));
  for (const other of [
    null,
    [],
    "level",
    { format: "kula-world-level", blocks: [] },
    { blocks: [plain([1, 2, 3])] },
    level([{ type: 0, items: [] }]),
    level([{ type: 0, pos: [1, 2] }]),
    level([{ type: "0", pos: [1, 2, 3] }]),
    { time: "99", blocks: [] },
    level([{ type: 0, pos: [1, 2, 3], items: 5 }]),
    level([{ type: 0, pos: [1, 2, 3], items: {} }]),
    level([{ type: 7, pos: [1, 2, 3], intervals: "x" }]),
    level([{ type: 7, pos: [1, 2, 3], intervals: 5 }]),
  ])
    assert.ok(!isOrbit(other), JSON.stringify(other));
});

test("the viewer's axes are the game's with y and z swapped and the height counted from the top", () => {
  const { project, report } = readOrbit(
    level([plain([1, 31, 2], 2), starting([3, 16, 4])], { time: 45 }),
    "MARS",
  );
  assert.deepEqual(report, []);
  assert.deepEqual(project.blocks, [
    { cell: [1, 2, 2], kind: 2 },
    { cell: [3, 4, 17], kind: 0, faces: { 0: { type: 30, facing: 1 } } },
  ]);
  assert.deepEqual(
    [project.time, project.world, project.hidden, project.invisibleFromAfar],
    [45, "MARS", false, false],
  );
});

test("items are the slot's words under other names, an empty one a bare face, and the two link words ride along", () => {
  const items = [
    START,
    { id: 37, option: 0, variant: 2, state: 1 },
    null,
    BARE,
    { id: 5, option: 2, variant: 1, state: 2, route: 65535, to: 2 },
    { id: 9, option: 0, variant: 3, state: 1, route: 65535, to: 36 },
  ];
  const { project, report } = readOrbit(level([plain([3, 16, 4], 0, items)]));
  assert.deepEqual(project.blocks, [
    {
      cell: [3, 4, 17],
      kind: 0,
      faces: {
        0: { type: 30, facing: 1 },
        1: { type: 37, variant: 2 },
        4: { type: 5, facing: 2, variant: 1 },
        5: { type: 9, variant: 3 },
      },
    },
  ]);
  assert.deepEqual(project.circuits, { 1: "off" });
  assert.deepEqual(report, []);
  const bytes = kwlOfOrbit(level([plain([3, 16, 4], 0, items)])).bytes;
  const view = new DataView(bytes.buffer);
  const word = (slot, i) => view.getInt16(2 * 39307 + 2 * (16 * slot + i), true);
  assert.deepEqual([word(4, 6), word(4, 7), word(5, 6), word(5, 7)], [-1, 2, -1, 36]);
  assert.deepEqual([word(2, 1), word(2, 2), word(2, 3), word(2, 4)], [0, -1, -1, 0]);
});

test("a laser's four misnamed words are whether it is lit, its own lattice value, its colour and its next link", () => {
  const laser = {
    type: 8,
    pos: [10, 16, 12],
    from: [10, 17, 12],
    to: [14, 17, 12],
    orientation: 1,
    length: 0,
    speed: 6,
    variant: 3,
    state: 65535,
  };
  const { project, report } = readOrbit(level([starting([3, 16, 4]), laser]));
  assert.deepEqual(report, []);
  assert.deepEqual(project.blocks[1], {
    cell: [10, 12, 17],
    kind: 8,
    far: [14, 12, 17],
    colour: 3,
  });
  assert.deepEqual(project.circuits, { 3: "off" });
  const lit = readOrbit(level([starting([3, 16, 4]), { ...laser, length: 1 }]));
  assert.deepEqual(lit.project.circuits, {});
});

test("a platform's run, length and speed, a vanishing block's phase and a crumbling block come through", () => {
  const blocks = [
    starting([3, 16, 4]),
    {
      type: 5,
      pos: [5, 20, 6],
      start: [5 * 512, 13 * 512, 6 * 512],
      from: [5, 13, 6],
      to: [5, 13, 9],
      movement: 2,
      orientation: 2,
      length: 3,
      speed: 30,
      id: 6,
    },
    { type: 7, pos: [8, 20, 8], intervals: [65535, 3, 65535, 65535, 65535, 65535, 65535, 65535] },
    { type: 6, pos: [9, 20, 8] },
  ];
  const { project, report } = readOrbit(level(blocks, { hidden: true, reverse: true }));
  assert.deepEqual(project.blocks.slice(1), [
    { cell: [5, 6, 13], kind: 5, far: [5, 9, 13], length: 3, speed: 30 },
    { cell: [8, 8, 13], kind: 7, phase: 3 },
    { cell: [9, 8, 13], kind: 6 },
  ]);
  assert.deepEqual([project.hidden, project.invisibleFromAfar], [true, true]);
  assert.deepEqual(report, []);
});

test("the two flags are read as the viewer writes them, true or false, and anything else is said and taken as false", () => {
  const blocks = [starting([3, 16, 4])];
  const { project, report } = readOrbit(level(blocks, { hidden: 1, reverse: "yes" }));
  assert.deepEqual([project.hidden, project.invisibleFromAfar], [false, false]);
  assert.deepEqual(report, [
    "hidden is 1, neither true nor false; it is taken as false",
    'reverse is "yes", neither true nor false; it is taken as false',
  ]);
  const bare = readOrbit({ time: 99, blocks });
  assert.deepEqual(
    [bare.project.hidden, bare.project.invisibleFromAfar, bare.report],
    [false, false, []],
  );
});

test("a value that is no word of the file is said so and left empty, while null is an empty slot and says nothing", () => {
  const platform = {
    type: 5,
    pos: [5, 20, 6],
    start: "nowhere",
    from: [5, 13, 6],
    to: [5, 13, -1],
    movement: 2,
    orientation: 2,
    length: 3,
    speed: 30,
    id: 6,
  };
  const { project, report } = readOrbit(
    level(
      [
        starting([3, 16, 4]),
        plain([4, 16, 4], 0, [
          { id: 37, option: 0, variant: 2.5, state: 1, route: null, to: null },
          { id: 5, option: -1, variant: 1, state: 1, route: 65535, to: 70000 },
        ]),
        platform,
      ],
      { time: 99.5 },
    ),
  );
  assert.deepEqual(report.slice(0, 6), [
    "the variant on face 0 of the block at 4, 4, 17 is 2.5, not a whole number from 0 to 65535; it is left empty",
    "the option on face 1 of the block at 4, 4, 17 is -1, not a whole number from 0 to 65535; it is left empty",
    "the to on face 1 of the block at 4, 4, 17 is 70000, not a whole number from 0 to 65535; it is left empty",
    "the to of the block at 5, 6, 13's y is -1, not a whole number from 0 to 65535; it is left empty",
    "the start of the block at 5, 6, 13 is not a point of three whole numbers; it is left empty",
    "the time is 99.5, not a whole number from 0 to 65535; it is 99",
  ]);
  assert.equal(project.time, 99);
  assert.equal(project.blocks[1].faces[0].type, 37);
  const nulls = readOrbit(
    level([
      starting([3, 16, 4]),
      plain([4, 16, 4], 0, [{ id: 9, option: 0, variant: 1, state: 1, route: null, to: null }]),
    ]),
  );
  assert.deepEqual(nulls.report, []);
});

test("lines of one shape are kept to three and the rest counted, as the level reader's are", () => {
  const blocks = [starting([3, 16, 4])];
  for (let i = 0; i < 20; i++) blocks.push(plain([40 + i, 16, 4]));
  for (let i = 0; i < 5; i++) blocks.push({ type: 12, pos: [6 + i, 16, 4] });
  const { report } = readOrbit(level(blocks));
  assert.equal(report.length, 8);
  assert.ok(
    report.slice(0, 3).every((line) => line.endsWith("lies outside the lattice and was left out")),
  );
  assert.equal(report[3], "17 more lines like the one above");
  assert.ok(
    report.slice(4, 7).every((line) => line.includes("is not one the game has and was left out")),
  );
  assert.equal(report[7], "2 more lines like the one above");
});

test("what the lattice refuses is left out and said: a block past the edge, a second block on a cell, a kind the game has not", () => {
  const { project, report } = readOrbit(
    level([
      starting([3, 16, 4]),
      plain([40, 16, 4]),
      plain([3, 34, 4]),
      plain([3, 16, 4], 2),
      { type: 12, pos: [6, 16, 4] },
    ]),
  );
  assert.deepEqual(
    project.blocks.map((b) => b.cell),
    [[3, 4, 17]],
  );
  assert.deepEqual(report, [
    "a block at 40, 4, 17 lies outside the lattice and was left out",
    "a block at 3, 4, -1 lies outside the lattice and was left out",
    "two blocks stand at 3, 4, 17; the first was kept",
    "a block of kind 12 at 6, 4, 17 is not one the game has and was left out",
  ]);
});

test("the link's text is a header and a line a block, every number base 36, ~ for 65535 and _ for an empty slot", () => {
  const text = [
    "19|1|0",
    "1 f c h 10:0:0:1 _ 0:~:~:0 0:0:0:0 0:0:0:0 1a:0:0:1",
    "5 5 k 6 5 d 6 5 d 6 5 d 9 2 2 3 u 6",
    "6 9 k 8",
    "7 8 k 8 ~ 3 ~ ~ ~ ~ ~ ~",
    "8 a g c a h c e h c 1 0 6 3 ~",
    "0 3 g 4 u:1:0:0:~:~ _ _ _ _ _",
    "",
  ].join("\n");
  const json = parseOrbitText(text);
  assert.deepEqual(
    [json.time, json.hidden, json.reverse, json.blocks.length],
    [45, true, false, 6],
  );
  assert.deepEqual(json.blocks[0], {
    type: 1,
    pos: [15, 12, 17],
    items: [
      { id: 36, option: 0, variant: 0, state: 1 },
      null,
      { id: 0, option: 65535, variant: 65535, state: 0 },
      { id: 0, option: 0, variant: 0, state: 0 },
      { id: 0, option: 0, variant: 0, state: 0 },
      { id: 46, option: 0, variant: 0, state: 1 },
    ],
  });
  assert.deepEqual(json.blocks[1], {
    type: 5,
    pos: [5, 20, 6],
    start: [5 * 512, 13 * 512, 6 * 512],
    from: [5, 13, 6],
    to: [5, 13, 9],
    movement: 2,
    orientation: 2,
    length: 3,
    speed: 30,
    id: 6,
  });
  assert.deepEqual(json.blocks[2], { type: 6, pos: [9, 20, 8] });
  assert.deepEqual(json.blocks[3], {
    type: 7,
    pos: [8, 20, 8],
    intervals: [65535, 3, 65535, 65535, 65535, 65535, 65535, 65535],
  });
  assert.deepEqual(json.blocks[4], {
    type: 8,
    pos: [10, 16, 12],
    from: [10, 17, 12],
    to: [14, 17, 12],
    orientation: 1,
    length: 0,
    speed: 6,
    variant: 3,
    state: 65535,
  });
  assert.deepEqual(json.blocks[5].items[0], {
    id: 30,
    option: 1,
    variant: 0,
    state: 0,
    route: 65535,
    to: 65535,
  });
  const off = parseOrbitText("19|1|0\n5 5 k 6 1.y9 d 6 5 d 6 5 d 9 2 2 3 u 6\n");
  assert.deepEqual(off.blocks[0].start, [512, 13 * 512, 6 * 512]);
  assert.deepEqual(
    parseOrbitText("19|1|0\n5 5 k 6 ~ d 6 5 d 6 5 d 9 2 2 3 u 6\n").blocks[0].start,
    [65535, 13 * 512, 6 * 512],
  );
  for (const bad of [
    "19|1",
    "19|1|0\n1 f c",
    "19|1|0\n5 5 k 6 .y9 d 6 5 d 6 5 d 9 2 2 3 u 6",
    "19|1|0\n5 5 k 6 1.y9 d 6 5.1 d 6 5 d 9 2 2 3 u 6",
    "19|1|0\n5 5 k 6 5 d",
    "19|1|0\n9 1 2 3",
    "19|1|0\n0 1 2 3 x:y",
    "19|1|0\n0 1 2 3 1:2:3:$",
  ])
    assert.throws(() => parseOrbitText(bad), new RegExp(NOT_LINK.slice(0, 20)), bad);
});

test("a link is read whole, as its query or as its bare value, and a level of the viewer's own is refused", async () => {
  assert.deepEqual(linkParts("https://example.test/path?level=abc_-9&theme=mars"), {
    param: "abc_-9",
    theme: "mars",
  });
  assert.deepEqual(linkParts("?theme=inca&level=abc"), { param: "abc", theme: "inca" });
  assert.deepEqual(linkParts("  level=abc  "), { param: "abc", theme: null });
  assert.deepEqual(linkParts("H4sIAAAAAAAA"), { param: "H4sIAAAAAAAA", theme: null });
  assert.equal(linkParts("hello world"), null);
  assert.equal(linkParts("https://example.test/"), null);
  const text = "2r|0|0\n0 3 g 4 u:1:0:0 _ _ _ _ _\n";
  const read = await readOrbitLink(`https://example.test/?level=${link(text)}`, "FIELD");
  assert.deepEqual(read.project.blocks, [
    { cell: [3, 4, 17], kind: 0, faces: { 0: { type: 30, facing: 1 } } },
  ]);
  assert.deepEqual([read.project.time, read.project.world, read.report], [99, "FIELD", []]);
  const padded = link(text).replace(/-/g, "+").replace(/_/g, "/");
  const again = await readOrbitLink(`${padded}==`, "FIELD");
  assert.deepEqual(again.project.blocks, read.project.blocks);
  await assert.rejects(
    readOrbitLink("https://example.test/?level=42"),
    new RegExp(OWN_LEVEL.slice(0, 20)),
  );
  await assert.rejects(readOrbitLink("https://example.test/"), new RegExp(NOT_LINK.slice(0, 20)));
  await assert.rejects(readOrbitLink("level=not*base64"), new RegExp(NOT_LINK.slice(0, 20)));
  await assert.rejects(
    readOrbitLink(`level=${link("not a level")}`),
    new RegExp(NOT_LINK.slice(0, 20)),
  );
  await assert.rejects(readOrbitLink("level=AAAAAAAAAA"), new RegExp(NOT_LINK.slice(0, 20)));
});
