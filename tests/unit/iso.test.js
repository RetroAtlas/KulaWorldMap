import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTORY,
  DIR_MOST,
  EXTENT,
  FLAGS,
  NAME,
  NAME_LEN,
  SIZE,
  bothWays,
  openDisc,
  record,
  setRecord,
} from "../../public/js/format/iso.js";
import { SECTOR_RAW, USER, USER_OFF } from "../../public/js/format/sectors.js";
import {
  CNF,
  CNF_AT,
  FINALS_AT,
  PACK_AT,
  ROOM_AT,
  ROOM_SECTORS,
  ROOT_AT,
  SYNTHETIC_FINALS,
  SYNTHETIC_PACK,
  SYNTHETIC_SECTORS,
  WORLD_AT,
  bytesOf,
  syntheticImage,
  syntheticPacks,
} from "./synthetic.js";

const IMAGE = syntheticImage();
const same = (a, b, name) => assert.deepEqual(Buffer.from(a), Buffer.from(b), name);
const u32 = (bytes, at, little) =>
  new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, little);
const text = (bytes) => String.fromCharCode(...bytes);

/**
 * An image of so many raw sectors whose volume descriptor puts the root
 * directory at a sector of the caller's choosing, holding what is given.
 */
function image(sectors, rootAt, directory = new Uint8Array(0), rootSize = USER) {
  const raw = new Uint8Array(SECTOR_RAW * sectors);
  const pvd = SECTOR_RAW * 16 + USER_OFF;
  raw.set(bytesOf("CD001"), pvd + 1);
  const view = new DataView(raw.buffer);
  view.setUint32(pvd + 156 + EXTENT, rootAt, true);
  view.setUint32(pvd + 156 + SIZE, rootSize, true);
  if (directory.length) raw.set(directory, SECTOR_RAW * rootAt + USER_OFF);
  return raw;
}

/** A directory table of records so long, then one byte of length, as the Python tests build them. */
function table(lengths, tail) {
  const out = new Uint8Array(lengths.reduce((n, l) => n + l, 0) + 1);
  let at = 0;
  for (const l of lengths) {
    out[at] = l;
    at += l;
  }
  out[at] = tail;
  return out;
}

test("a directory record is laid out as the disc has it, and rewritten in both byte orders", () => {
  const r = record("3.00;1", 27, 24576);
  assert.equal(r.length, 40);
  assert.deepEqual(
    [u32(r, EXTENT, true), u32(r, EXTENT + 4, false), u32(r, SIZE, true), u32(r, SIZE + 4, false)],
    [27, 27, 24576, 24576],
  );
  assert.deepEqual([r[FLAGS], r[NAME_LEN], text(r.subarray(NAME, NAME + 6))], [0, 6, "3.00;1"]);
  assert.deepEqual([...r.subarray(28, 32)], [1, 0, 0, 1]);
  const root = record("\0", 22, USER, DIRECTORY);
  assert.deepEqual([root.length, root[FLAGS], root[NAME_LEN], root[NAME]], [34, 2, 1, 0]);
  assert.equal(record("HIRO", 24, USER, DIRECTORY).length, 38);
  setRecord(r, 0, 93953, 3124);
  same(r.subarray(EXTENT, EXTENT + 8), bothWays(93953));
  same(r.subarray(SIZE, SIZE + 8), bothWays(3124));
  assert.deepEqual([...bothWays(0x01020304)], [4, 3, 2, 1, 1, 2, 3, 4]);
});

test("the synthetic image walks to its four files and to where their records lie", async () => {
  const disc = await openDisc(new Blob([IMAGE]));
  assert.equal(disc.size, IMAGE.length);
  const [[, , world], [, , finals]] = syntheticPacks();
  assert.deepEqual(Object.fromEntries(disc.files), {
    "/3.00": { lba: ROOM_AT, size: ROOM_SECTORS * USER },
    "/HIRO/HIRO.PAK": { lba: PACK_AT, size: world.length },
    "/HIRO/HIROFI.PAK": { lba: FINALS_AT, size: finals.length },
    "/SYSTEM.CNF": { lba: CNF_AT, size: CNF.length },
  });
  assert.deepEqual(Object.fromEntries(disc.records), {
    "/3.00": { sector: ROOT_AT, offset: 68 },
    "/SYSTEM.CNF": { sector: ROOT_AT, offset: 146 },
    [SYNTHETIC_PACK]: { sector: WORLD_AT, offset: 68 },
    [SYNTHETIC_FINALS]: { sector: WORLD_AT, offset: 112 },
  });
});

test("reads come a slice at a time: a sector, a run of sectors, a file's bytes across them, a path in any case", async () => {
  const disc = await openDisc(new Blob([IMAGE]));
  same(await disc.readFile("/system.cnf"), CNF);
  assert.equal(text((await disc.sector(16)).subarray(1, 6)), "CD001");
  same(
    await disc.rawSector(PACK_AT),
    IMAGE.subarray(PACK_AT * SECTOR_RAW, (PACK_AT + 1) * SECTOR_RAW),
  );
  same(
    await disc.raw(ROOM_AT, 2),
    IMAGE.subarray(ROOM_AT * SECTOR_RAW, (ROOM_AT + 2) * SECTOR_RAW),
  );
  const across = await disc.read(ROOT_AT, USER + 100);
  assert.equal(across.length, USER + 100);
  const data = (lba) =>
    IMAGE.subarray(lba * SECTOR_RAW + USER_OFF, lba * SECTOR_RAW + USER_OFF + USER);
  same(across.subarray(0, USER), data(ROOT_AT));
  same(across.subarray(USER), data(CNF_AT).subarray(0, 100));
  assert.equal((await disc.read(ROOM_AT, 0)).length, 0);
  await assert.rejects(disc.readFile("/NOWHERE"), /no such file/);
  await assert.rejects(disc.sector(SYNTHETIC_SECTORS), /ends before sector 43/);
  await assert.rejects(disc.raw(SYNTHETIC_SECTORS - 1, 2), /ends before sector 43/);
});

test("a file without the mark, one that ends before its directory, and a record past its table are refused", async () => {
  await assert.rejects(
    openDisc(new Blob([new Uint8Array(SECTOR_RAW * 17)])),
    /not a raw ISO9660 image/,
  );
  await assert.rejects(openDisc(new Blob([image(17, 40)])), /ends before sector/);
  const spanning = table(Array(8).fill(255), 1);
  await assert.rejects(openDisc(new Blob([image(24, 20, spanning)])), /runs past its table/);
  const short = table([...Array(7).fill(255), 240], 1);
  await assert.rejects(openDisc(new Blob([image(24, 20, short)])), /runs past its table/);
});

test("a directory longer than any disc's is refused before it is read", async () => {
  const sectors = 20 + DIR_MOST + 2;
  await assert.rejects(
    openDisc(new Blob([image(sectors, 20, new Uint8Array(0), DIR_MOST * USER + 1)])),
    /the directory at sector 20 is longer than any disc's/,
  );
  const disc = await openDisc(new Blob([image(sectors, 20, new Uint8Array(0), DIR_MOST * USER)]));
  assert.equal(disc.files.size, 0);
});

test("a directory reached twice is refused", async () => {
  const loop = new Uint8Array(USER);
  loop.set(record("A", 20, USER, DIRECTORY));
  await assert.rejects(openDisc(new Blob([image(24, 20, loop)])), /reached twice/);
});
