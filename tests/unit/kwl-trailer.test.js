import { test } from "node:test";
import assert from "node:assert/strict";
import { SIDE } from "../../public/js/format/lattice.js";
import {
  CELLS,
  EXIT,
  FACES,
  FIRST_RECORD,
  FORMAT,
  FRUIT,
  GRID_BYTES,
  HEAD,
  RECORD,
  SLOT,
  START,
  TRAILER_KIND,
  VERSION,
  WORDS,
  levelOf,
  readKwl,
  writeKwl,
} from "../../public/js/format/kwl.js";

// One level of the PAL disc ends at its count: the lattice, the header counting
// its records and that many records, with no trailer after them.

/** The words of a plain block standing on cell with type on its top face, headed facing. */
function record(cell, type, facing = -1) {
  const words = Array(WORDS).fill(-1);
  words[0] = 0;
  for (let j = 0; j < FACES; j++) words[SLOT * j + 1] = 0;
  words[1] = type;
  words[2] = facing;
  words.splice(WORDS - 3, 3, ...cell);
  return words;
}

/** A level file of the records and the plain blocks that ends at its records, its header counting count. */
function untrailed(records, plain, count = records.length) {
  const out = new Uint8Array(GRID_BYTES + HEAD + RECORD * records.length);
  const view = new DataView(out.buffer);
  const at = ([x, y, z]) => 2 * ((x * SIDE + y) * SIDE + z);
  for (let i = 0; i < CELLS; i++) view.setUint16(2 * i, 0xffff, true);
  for (const [cell, kind] of plain) view.setUint16(at(cell), kind, true);
  records.forEach((words, k) => {
    view.setUint16(at(words.slice(-3)), FIRST_RECORD + k, true);
    words.forEach((w, i) => view.setInt16(GRID_BYTES + HEAD + RECORD * k + 2 * i, w, true));
  });
  view.setInt32(GRID_BYTES, plain.length + records.length, true);
  view.setUint16(GRID_BYTES + 4, count, true);
  return out;
}

const topOf = (k) => (k === 0 ? START : k === 29 ? EXIT : FRUIT[k % FRUIT.length]);
// Thirty records in a row, the start first and the exit last, with a plain block
// of each lattice kind beside the first five.
const RECORDS = Array.from({ length: 30 }, (_, k) =>
  record([1 + k, 10, 17], topOf(k), k === 0 ? 1 : -1),
);
const PLAIN = Array.from({ length: 5 }, (_, k) => [[1 + k, 12, 17], k]);
const BONUS = untrailed(RECORDS, PLAIN);
const BLOCKS = RECORDS.flatMap((_, k) => [
  {
    cell: [1 + k, 10, 17],
    kind: 0,
    faces: { 0: k === 0 ? { type: START, facing: 1 } : { type: topOf(k) } },
  },
  ...(k < PLAIN.length ? [{ cell: [1 + k, 12, 17], kind: k }] : []),
]);
const PROJECT = {
  format: FORMAT,
  version: VERSION,
  title: "",
  author: "",
  notes: "",
  world: "HIRO",
  time: 99,
  hidden: false,
  invisibleFromAfar: false,
  simon: false,
  circuits: {},
  blocks: BLOCKS,
};
const NO_TRAILER = "no trailer, so the time is 99";

test("a level file that ends at its count reads whole, the line on the trailer its one repair", () => {
  const { project, report, repairs } = readKwl(BONUS);
  assert.deepEqual(project, PROJECT);
  assert.deepEqual([report, repairs], [[NO_TRAILER], 1]);
});

test("the level written back from it gains a trailer timed at 99 and reads back the same with nothing to report", () => {
  const out = writeKwl(readKwl(BONUS).project);
  assert.equal(out.length, BONUS.length + RECORD);
  const trailer = new DataView(out.buffer, out.length - RECORD);
  assert.deepEqual([trailer.getInt16(0, true), levelOf(out).time], [TRAILER_KIND, 99]);
  assert.deepEqual(readKwl(out), { project: PROJECT, report: [], repairs: 0 });
});

test("a file a record short of its count, or two past it, reads from its length with the count among the repairs", () => {
  const short = readKwl(BONUS.slice(0, -RECORD));
  assert.deepEqual(short.report, [
    NO_TRAILER,
    "the header counts 30 records and the file holds 29",
    "cell 30,10,17 names record 29, which is not a block; the cell is left empty",
  ]);
  assert.deepEqual([short.repairs, short.project.blocks.length, short.project.time], [3, 34, 99]);
  const more = [record([31, 10, 17], FRUIT[0]), record([32, 10, 17], FRUIT[1])];
  const over = readKwl(untrailed([...RECORDS, ...more], PLAIN, RECORDS.length));
  assert.deepEqual(over.report, [NO_TRAILER, "the header counts 30 records and the file holds 32"]);
  assert.deepEqual([over.repairs, over.project.blocks.length, over.project.time], [2, 37, 99]);
});

test("a file that ends inside a record is refused, whatever its count says", () => {
  const cut = BONUS.slice(0, -1);
  assert.throws(
    () => readKwl(cut),
    new Error(
      `${cut.length} bytes is not a level: the lattice, six bytes and whole 256-byte stretches`,
    ),
  );
});
