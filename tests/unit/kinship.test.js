import { test } from "node:test";
import assert from "node:assert/strict";
import { levelKey, mapData, releases } from "./fixtures.js";
import {
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
import { fromLevel, moveBlocks } from "../../public/js/format/project.js";
import {
  FLOOR,
  FROM_NOTE,
  NEAR,
  commonOf,
  kinOf,
  shapeOf,
  shapesOf,
  shareOf,
} from "../../public/js/format/kinship.js";

const entries = [
  ...mapData.levels.map((l) => ({ slot: levelKey(l), project: fromLevel(l) })),
  ...releases.flatMap((r) =>
    Object.entries(r.levels).map(([slot, l]) => ({
      slot: `${slot}@${r.id}`,
      project: fromLevel(l),
    })),
  ),
];
const shipped = shapesOf(entries);
const SLOT = levelKey(level("LEVEL 42"));
const FIRST = levelKey(level("LEVEL 1"));
const template = fromLevel(level("LEVEL 42"));
const n = template.blocks.length;
const everyCell = (p) => p.blocks.map((b) => b.cell);
/** Four blocks of three kinds about a corner, a start on the first. */
const corner = project([
  plain([3, 4, 5], 0, { 0: start() }),
  plain([4, 4, 5]),
  plain([3, 5, 5], 2),
  plain([3, 4, 6], 6),
]);
const CORNER = new Set(["3,4,5,0", "4,4,5,0", "3,5,5,2", "3,4,6,6"]);
/** `k` plain blocks in a row along `axis` from the cell 1,1,1. */
const along = (axis, k) =>
  project(
    [...Array(k).keys()].map((i) => plain([1, 1, 1].map((v, j) => (j === axis ? v + i : v)))),
  );
/** `k` plain blocks in a row along `axis` from `cell`, a start on the first. */
const rowFrom = (cell, axis, k) =>
  project(
    [...Array(k).keys()].map((i) =>
      plain(
        cell.map((v, j) => (j === axis ? v + i : v)),
        0,
        i === 0 ? { 0: start() } : null,
      ),
    ),
  );
/** A flat slab of `side` by `side` plain blocks from the cell 17,17,17, a start on the first. */
const slabOf = (side) => {
  const blocks = [];
  for (let x = 17; x < 17 + side; x++)
    for (let y = 17; y < 17 + side; y++) blocks.push(plain([x, y, 17]));
  blocks[0].faces = { 0: start() };
  return project(blocks);
};
const copy = (slot, share) => ({ slot, share, from: true, refused: true });
const kept = (slot, share) => ({ slot, share, from: true, refused: false });
const alike = (slot, share) => ({ slot, share, from: false, refused: false });

test("a shape is the level's blocks as cells and kinds, counted in common at the best alignment, so a level and the same shifted by a cell share every block, and the objects on the faces count for nothing", () => {
  assert.deepEqual(shapeOf(corner), CORNER);
  const moved = moveBlocks(corner, everyCell(corner), [5, 6, 7]);
  assert.notDeepEqual(shapeOf(moved), CORNER);
  assert.equal(shareOf(shapeOf(corner), shapeOf(moved)), 1);
  const bare = { ...corner, blocks: corner.blocks.map(({ cell, kind }) => ({ cell, kind })) };
  assert.equal(shareOf(shapeOf(corner), shapeOf(bare)), 1);
  const shifted = moveBlocks(template, everyCell(template), [1, 0, 0]);
  assert.equal(shareOf(shapeOf(template), shapeOf(shifted)), 1);
  assert.deepEqual(kinOf(own(shifted), shipped), alike(SLOT, 1));
});

test("a copy with a block added at its low corner still holds every block of its source, as one with a block added past its far side does, and is refused as its copy", () => {
  const low = cornered(template);
  assert.equal(low.blocks.length, n + 1);
  assert.deepEqual(
    low.blocks[0].cell,
    [0, 1, 2].map((i) => Math.min(...everyCell(template).map((c) => c[i])) - 1),
  );
  assert.equal(commonOf(shapeOf(template), shapeOf(low)), n);
  assert.equal(shareOf(shapeOf(template), shapeOf(low)), n / (n + 1));
  assert.deepEqual(kinOf(low, shipped), copy(SLOT, n / (n + 1)));
  assert.deepEqual(kinOf(own(low), shipped), alike(SLOT, n / (n + 1)));
  assert.equal(commonOf(shapeOf(template), shapeOf(grown(template, 1))), n);
});

test("kinds count: the same cells with other kinds share less, by the blocks whose kind changed, and nothing where no kind is shared", () => {
  const rekinded = (k) => ({
    ...corner,
    blocks: corner.blocks.map((b, i) => (i < k ? { ...b, kind: 3 } : b)),
  });
  assert.equal(shareOf(shapeOf(corner), shapeOf(rekinded(2))), 1 / 2);
  assert.equal(shareOf(shapeOf(corner), shapeOf(rekinded(4))), 0);
});

test("the blocks in common are counted once, and the share is that count over the more numerous of the two, 0 where either is empty, so a level that holds a small one whole is no edit of it", () => {
  const two = new Set(["0,0,0,0", "1,0,0,0"]);
  const four = new Set([...two, "2,0,0,0", "3,0,0,0"]);
  assert.equal(commonOf(two, four), 2);
  assert.equal(commonOf(four, two), 2);
  assert.equal(commonOf(two, new Set()), 0);
  assert.equal(commonOf(shapeOf(template), shapeOf(nudged(template, 3))), n - 3);
  assert.equal(shareOf(two, four), 1 / 2);
  assert.equal(shareOf(four, two), 1 / 2);
  assert.equal(shareOf(two, two), 1);
  assert.equal(shareOf(new Set(), two), 0);
  assert.equal(shareOf(two, new Set()), 0);
  assert.equal(shareOf(new Set(), new Set()), 0);
  assert.equal(kinOf(slabOf(16), shipped), null);
});

test("a resemblance takes FLOOR blocks in common, so three plain blocks in a row or a column, the whole of SIMON10, name no level, while a copy whose from names SIMON10 needs no floor", () => {
  const simon = levelKey(level("SIMON10"));
  assert.equal(shipped.get(simon).size, 3);
  const row = rowFrom([17, 16, 17], 1, 3);
  assert.equal(shareOf(shapeOf(row), shipped.get(simon)), 1);
  assert.equal(kinOf(row, shipped), null);
  assert.deepEqual(kinOf({ ...row, from: simon }, shipped), copy(simon, 1));
  assert.equal(kinOf(rowFrom([17, 17, 17], 0, 3), shipped), null);
  assert.equal(kinOf(rowFrom([17, 17, 17], 2, 3), shipped), null);
  const atFloor = new Map([["r", shapeOf(along(1, FLOOR))]]);
  assert.deepEqual(kinOf(along(1, FLOOR), atFloor), alike("r", 1));
  const under = new Map([["r", shapeOf(along(1, FLOOR - 1))]]);
  assert.equal(kinOf(along(1, FLOOR - 1), under), null);
});

test("a flat slab of plain blocks resembles LEVEL 1 without being its copy, so it is noted with from false and not refused, and is refused as its copy where its from names LEVEL 1", () => {
  const slab = slabOf(4);
  const first = shipped.get(FIRST);
  const common = commonOf(shapeOf(slab), first);
  assert.ok(common >= FLOOR && common < first.size);
  const share = common / Math.max(first.size, slab.blocks.length);
  assert.ok(share >= NEAR && share < 1);
  assert.deepEqual(kinOf(slab, shipped), alike(FIRST, share));
  assert.deepEqual(kinOf({ ...slab, from: FIRST }, shipped), copy(FIRST, share));
});

test("the template of LEVEL 42 with three blocks moved shares more than NEAR with it, so it is refused as its copy while from names it, and noted with from false once from is cleared", () => {
  const moved = nudged(template, 3);
  assert.notEqual(moved, null);
  const share = (n - 3) / n;
  assert.ok(share > NEAR);
  assert.equal(shareOf(shapeOf(template), shapeOf(moved)), share);
  assert.deepEqual(kinOf(moved, shipped), copy(SLOT, share));
  assert.deepEqual(kinOf(own(moved), shipped), alike(SLOT, share));
});

test("kinOf gives the nearest shipped level and not the first at NEAR or more, a share exactly at either bar is at it, and a copy just under NEAR is noted and not refused", () => {
  const sixty = fromLevel(level("LEVEL 61"));
  const moved = own(nudged(sixty, 2));
  const m = sixty.blocks.length;
  const slots = [...shipped.keys()];
  const slot = levelKey(level("LEVEL 61"));
  assert.ok(shareOf(shapeOf(moved), shipped.get(FIRST)) >= NEAR, "LEVEL 1 is at NEAR or more");
  assert.ok(slots.indexOf(FIRST) < slots.indexOf(slot), "and stands before LEVEL 61");
  assert.deepEqual(kinOf(moved, shipped), alike(slot, (m - 2) / m));
  const twice = new Map([["r", shapeOf(along(1, 2 * FLOOR))]]);
  const half = project([...along(1, FLOOR).blocks, ...rowFrom([2, 1, 1], 0, FLOOR).blocks]);
  assert.equal(commonOf(shapeOf(half), twice.get("r")), FLOOR);
  assert.equal(shareOf(shapeOf(half), twice.get("r")), NEAR);
  assert.deepEqual(kinOf(half, twice), alike("r", NEAR));
  assert.deepEqual(kinOf({ ...half, from: "r" }, twice), copy("r", NEAR));
  const under = project([...along(1, FLOOR).blocks, ...rowFrom([2, 1, 1], 0, FLOOR + 1).blocks]);
  const short = FLOOR / (2 * FLOOR + 1);
  assert.equal(shareOf(shapeOf(under), twice.get("r")), short);
  assert.equal(kinOf(under, twice), null);
  assert.deepEqual(kinOf({ ...under, from: "r" }, twice), kept("r", short));
  const five = new Map([["r", shapeOf(along(1, 5))]]);
  const fifth = along(0, 5);
  assert.equal(shareOf(shapeOf(fifth), five.get("r")), FROM_NOTE);
  assert.equal(kinOf(fifth, five), null);
  assert.deepEqual(kinOf({ ...fifth, from: "r" }, five), kept("r", FROM_NOTE));
});

test("a template gutted and rebuilt as a tower is no level's kin though from stands; with a third of its blocks kept it is noted as keeping part of its parent and not refused, and is no level's kin once from is cleared", () => {
  assert.ok(shareOf(shapeOf(rebuilt(template, 0)), shipped.get(SLOT)) < FROM_NOTE);
  assert.equal(kinOf(rebuilt(template, 0), shipped), null);
  const third = Math.ceil(n / 3);
  assert.ok(third / n >= FROM_NOTE && third / n < NEAR);
  const part = rebuilt(template, third);
  assert.equal(part.blocks.length, n);
  assert.deepEqual(kinOf(part, shipped), kept(SLOT, third / n));
  assert.equal(kinOf(own(part), shipped), null);
});

test("from names the variant of fromRelease where that disc's level is keyed, else the slot as written, and a from naming no slot, or a level under FROM_NOTE, is passed over", () => {
  const slot = "/HILLS/HILLS.PAK#18";
  const [, , jp] = releases;
  const variant = fromLevel(jp.levels[slot]);
  assert.deepEqual([variant.from, variant.fromRelease], [slot, "jp"]);
  assert.ok(shareOf(shipped.get(slot), shipped.get(`${slot}@jp`)) < 1, "the variant differs");
  const moved = nudged(variant, 1);
  assert.notEqual(moved, null);
  const m = variant.blocks.length;
  assert.deepEqual(kinOf(moved, shipped), copy(`${slot}@jp`, (m - 1) / m));
  const us = shareOf(shapeOf(moved), shipped.get(slot));
  assert.ok(us >= NEAR && us < (m - 1) / m);
  assert.deepEqual(kinOf({ ...own(moved), from: slot }, shipped), copy(slot, us));
  assert.deepEqual(kinOf({ ...moved, fromRelease: "eu" }, shipped), copy(slot, us));
  const edited = nudged(template, 3);
  const share = (n - 3) / n;
  assert.ok(shareOf(shapeOf(edited), shipped.get(FIRST)) < FROM_NOTE);
  for (const from of ["/NOWHERE/NOWHERE.PAK#0", FIRST, 7, null, ["/INCA/INCA.PAK#11"]])
    assert.deepEqual(kinOf({ ...edited, from }, shipped), alike(SLOT, share));
});

test("every shipped level's template is its own slot's copy, whole, the variants under their disc", () => {
  for (const { slot, project: p } of entries)
    assert.deepEqual(kinOf(p, shipped), copy(slot, 1), slot);
});

test("an empty level, and a hostile document whose blocks are not a list or whose cells are not numbers on the lattice, give null without throwing, and a block off the lattice is left out of the shape", () => {
  assert.equal(kinOf(project([]), shipped), null);
  assert.deepEqual(shapeOf(project([])), new Set());
  const one = { cell: [1, 2, 3], kind: 0 };
  assert.deepEqual(shapeOf({ blocks: [{ cell: [1, 34, 3], kind: 0 }, one] }), new Set(["1,2,3,0"]));
  for (const hostile of [
    null,
    undefined,
    7,
    "x",
    {},
    { blocks: null },
    { blocks: "x" },
    { blocks: {} },
    {
      blocks: [
        null,
        7,
        "x",
        {},
        { cell: "1,2,3", kind: 0 },
        { cell: [1, "2", 3], kind: 0 },
        { cell: [1, 2], kind: 0 },
        { cell: [1, 2, 3, 4], kind: 0 },
        { cell: [1.5, 2, 3], kind: 0 },
        { cell: [-1, 2, 3], kind: 0 },
        { cell: [1, 34, 3], kind: 0 },
        { cell: [1, 2, 3], kind: "0" },
        { cell: [1, 2, 3] },
        { cell: [1, 2, 3], kind: 2 ** 53 },
      ],
    },
    { blocks: [one], from: { toString: () => SLOT } },
    { blocks: [one], from: "__proto__", fromRelease: "constructor" },
    { blocks: [one], from: SLOT, fromRelease: { toString: () => "jp" } },
  ])
    assert.equal(kinOf(hostile, shipped), null, JSON.stringify(hostile) ?? String(hostile));
  assert.deepEqual(
    shapesOf([
      { slot: "a", project: corner },
      { slot: "b", project: { blocks: "x" } },
    ]),
    new Map([
      ["a", CORNER],
      ["b", new Set()],
    ]),
  );
});
