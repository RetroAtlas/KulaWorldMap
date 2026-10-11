import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openAsBlob, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { mapData, packs } from "./fixtures.js";
import { projectOf, writeKwl } from "../../public/js/kwl.js";
import { deflate } from "../../public/js/deflate.js";
import { EXTENT, SIZE, openDisc, record } from "../../public/js/iso.js";
import {
  IN_PLACE,
  LARGEST,
  REBUILD,
  RELOCATE,
  fit,
  fitPak,
  packSize,
  readPak,
  writePak,
} from "../../public/js/pak.js";
import {
  DATA_SUBMODE,
  EOF_SUBMODE,
  SECTOR_RAW,
  USER,
  USER_OFF,
  check,
  rewrite,
  sector,
} from "../../public/js/sectors.js";
import {
  ADD,
  BLOCK,
  BLOCK_AT,
  COPY,
  DESCRIPTION,
  PPF_MAGIC,
  PREFIX,
  RECORD_MOST,
  ROOM,
  SERIAL,
  VCDIFF_MAGIC,
  VCD_ADLER32,
  VCD_SOURCE,
  WINDOW,
  adler32,
  changes,
  cue,
  identify,
  patchedImage,
  placements,
  plan,
  ppf,
  runs,
  varint,
  vcdiff,
  verify,
} from "../../public/js/patch.js";
import {
  CNF,
  CNF_AT,
  PACK_AT,
  ROOM_AT,
  ROOM_SECTORS,
  ROOT_AT,
  SYNTHETIC_FINALS,
  SYNTHETIC_PACK,
  SYNTHETIC_SECTORS,
  WORLD_AT,
  bytesOf,
  noise,
  stored,
  streamOf,
  synthetic,
  syntheticImage,
  syntheticPacks,
} from "./synthetic.js";

// The digests the Python placer and patch writer produced from the same
// synthetic image, so the two ports cannot drift apart without this file saying so.
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/patch-digests.json", import.meta.url)), "utf8"),
);
const IMAGE = syntheticImage();
const ORIGINAL = readPak(syntheticPacks()[0][2]);
const SLOT = fixture.slot;
const TITLE = fixture.title;
const CASE = Object.fromEntries(fixture.cases.map((c) => [c.name, c]));
const SUBMODE_AT = 18;
const WARNINGS = [
  "the image has 43 sectors, not the 109,607 of the disc",
  "19 of the 21 packs are missing",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inflate = async (bytes) => new Uint8Array(inflateSync(bytes));
const same = (a, b, name) => assert.deepEqual(Buffer.from(a), Buffer.from(b), name);
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const raw = (image, lba) => image.subarray(lba * SECTOR_RAW, (lba + 1) * SECTOR_RAW);
const user = (image, lba) => raw(image, lba).subarray(USER_OFF, USER_OFF + USER);
const text = (bytes) => String.fromCharCode(...bytes);
const lbas = (placed) => placed.writes.map(([lba]) => lba);
const differing = (a, b) => [...a].flatMap((v, i) => (v !== b[i] ? [i] : []));
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const padded = (data, length) => {
  const out = new Uint8Array(length);
  out.set(data);
  return out;
};

/** A directory record's extent and size, each as [little-endian, big-endian]. */
function bothWaysAt(data, pos) {
  const view = new DataView(data.buffer, data.byteOffset);
  return [
    [view.getUint32(pos + EXTENT, true), view.getUint32(pos + EXTENT + 4, false)],
    [view.getUint32(pos + SIZE, true), view.getUint32(pos + SIZE + 4, false)],
  ];
}

/** The stream placed into the synthetic image, proven through the patched image. */
async function place(
  stream,
  { slot = SLOT, title = TITLE, pack = SYNTHETIC_PACK, image = IMAGE } = {},
) {
  const blob = new Blob([image]);
  const disc = await openDisc(blob);
  const placed = await plan(disc, pack, slot, stream, title, inflate);
  const patched = patchedImage(blob, placed.writes);
  await verify(await openDisc(patched), pack, slot, stream, placed, inflate);
  return { blob, disc, placed, patched, after: await bytes(patched) };
}

// --- the appliers the patches are proven by ---------------------------------------

/** The original with a PPF 3.0 patch's records laid over it. */
function applyPpf(original, patch) {
  same(patch.subarray(0, 6), [...PPF_MAGIC, 2]);
  assert.deepEqual([...patch.subarray(56, 60)], [0, 1, 0, 0]);
  same(patch.subarray(60, 60 + BLOCK), original.subarray(BLOCK_AT, BLOCK_AT + BLOCK));
  const out = original.slice();
  for (const [at, data] of ppfRecords(patch)) out.set(data, at);
  return out;
}

function ppfRecords(patch) {
  const view = new DataView(patch.buffer, patch.byteOffset);
  const out = [];
  for (let pos = 60 + BLOCK; pos < patch.length;) {
    const at = Number(view.getBigUint64(pos, true));
    const n = patch[pos + 8];
    out.push([at, patch.subarray(pos + 9, pos + 9 + n)]);
    pos += 9 + n;
  }
  return out;
}

function readVarint(buf, pos) {
  let n = 0;
  for (;;) {
    const b = buf[pos++];
    n = n * 128 + (b & 0x7f);
    if (!(b & 0x80)) return [n, pos];
  }
}

/** The Adler-32 a byte at a time, so the writer's is checked against something not itself. */
function slowAdler32(data) {
  let a = 1;
  let b = 0;
  for (const v of data) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  return b * 65536 + a;
}

/**
 * The target a VCDIFF patch of COPY and ADD instructions builds from the
 * source, every window's Adler-32 and lengths checked on the way.
 */
function decodeVcdiff(source, patch) {
  same(patch.subarray(0, 5), [...VCDIFF_MAGIC, 0]);
  const view = new DataView(patch.buffer, patch.byteOffset);
  const out = [];
  let pos = 5;
  let done = 0;
  while (pos < patch.length) {
    assert.equal(patch[pos], VCD_SOURCE | VCD_ADLER32);
    let srcLen, srcPos, deltaLen, targetLen, dataLen, instLen, addrLen;
    [srcLen, pos] = readVarint(patch, pos + 1);
    [srcPos, pos] = readVarint(patch, pos);
    [deltaLen, pos] = readVarint(patch, pos);
    const body = pos;
    [targetLen, pos] = readVarint(patch, pos);
    assert.equal(patch[pos], 0, "a delta indicator of 0");
    [dataLen, pos] = readVarint(patch, pos + 1);
    [instLen, pos] = readVarint(patch, pos);
    [addrLen, pos] = readVarint(patch, pos);
    const adler = view.getUint32(pos, false);
    pos += 4;
    const data = patch.subarray(pos, pos + dataLen);
    const inst = patch.subarray(pos + dataLen, pos + dataLen + instLen);
    const addr = patch.subarray(pos + dataLen + instLen, pos + dataLen + instLen + addrLen);
    pos += dataLen + instLen + addrLen;
    assert.equal(pos - body, deltaLen, "the delta encoding length counts everything after it");
    assert.deepEqual(
      [srcPos, srcLen],
      [done, targetLen],
      "the source segment is the window's own stretch",
    );
    const segment = source.subarray(srcPos, srcPos + srcLen);
    const target = new Uint8Array(targetLen);
    let tp = 0;
    let ip = 0;
    let dp = 0;
    let ap = 0;
    while (ip < instLen) {
      const op = inst[ip];
      let size;
      [size, ip] = readVarint(inst, ip + 1);
      if (op === COPY) {
        let at;
        [at, ap] = readVarint(addr, ap);
        target.set(segment.subarray(at, at + size), tp);
      } else if (op === ADD) {
        target.set(data.subarray(dp, dp + size), tp);
        dp += size;
      } else assert.fail(`opcode ${op}`);
      tp += size;
    }
    assert.deepEqual(
      [dp, ap, tp],
      [dataLen, addrLen, targetLen],
      "every section is consumed whole",
    );
    assert.equal(slowAdler32(target), adler, "the window's checksum");
    out.push(target);
    done += targetLen;
  }
  return [concat(out), out.length];
}

// --- the fixture ----------------------------------------------------------------------

test("the synthetic image built here is the one the Python built, byte for byte", () => {
  assert.equal(IMAGE.length, SYNTHETIC_SECTORS * SECTOR_RAW);
  assert.equal(sha256(IMAGE), fixture.image);
  assert.deepEqual([fixture.pack, SLOT, TITLE], [SYNTHETIC_PACK, 1, "Spiral"]);
  assert.deepEqual(
    fixture.cases.map((c) => [c.path, c.recompressed]),
    [
      [IN_PLACE, false],
      [REBUILD, false],
      [REBUILD, true],
      [RELOCATE, false],
    ],
  );
});

for (const c of fixture.cases) {
  test(`${c.name}: the plan, the patched image, the PPF and the xdelta are the fixture's`, async () => {
    const stream = streamOf(synthetic(c.blocks));
    assert.equal(stream.length, c.stream);
    const { blob, placed, after } = await place(stream);
    assert.deepEqual(
      [placed.fit.path, placed.fit.recompressed, placed.fit.size, placed.fit.room, placed.lba],
      [c.path, c.recompressed, c.size, c.room, c.lba],
    );
    assert.deepEqual(lbas(placed), c.sectors);
    assert.equal(sha256(after), c.patched);
    assert.equal(sha256(await ppf(blob, placed.writes, PREFIX + TITLE)), c.ppf);
    assert.equal(sha256(await vcdiff(blob, placed.writes)), c.xdelta);
    assert.deepEqual(placed.warnings, WARNINGS);
  });
}

// --- the placements -------------------------------------------------------------------

test("every placement writes whole sectors that check, and nothing outside them moves", async () => {
  for (const c of fixture.cases) {
    const stream = streamOf(synthetic(c.blocks));
    const { placed, after } = await place(stream);
    assert.equal(after.length, IMAGE.length, c.name);
    assert.deepEqual(lbas(placed), sorted(new Set(lbas(placed))), c.name);
    const touched = new Set(lbas(placed));
    for (let lba = 0; lba < SYNTHETIC_SECTORS; lba++)
      if (!touched.has(lba)) same(raw(after, lba), raw(IMAGE, lba), `${c.name} sector ${lba}`);
    for (const [lba, written] of placed.writes) {
      same(raw(after, lba), written, c.name);
      assert.notDeepEqual(Buffer.from(written), Buffer.from(raw(IMAGE, lba)), c.name);
      assert.ok(check(written), c.name);
      same(sector(lba, written.subarray(USER_OFF, USER_OFF + USER), written[SUBMODE_AT]), written);
    }
    const disc = await openDisc(new Blob([after]));
    assert.deepEqual(disc.files.get(SYNTHETIC_PACK), { lba: placed.lba, size: placed.fit.size });
    const pak = readPak(await disc.readFile(SYNTHETIC_PACK));
    pak.streams.forEach((s, i) =>
      same(inflateSync(s), inflateSync(i === SLOT ? stream : ORIGINAL.streams[i]), c.name),
    );
    assert.deepEqual(pak.names, placed.fit.names, c.name);
    const { sector: at, offset } = disc.records.get(SYNTHETIC_PACK);
    assert.deepEqual(bothWaysAt(user(after, at), offset), [
      [placed.lba, placed.lba],
      [placed.fit.size, placed.fit.size],
    ]);
  }
});

test("in place, the record is written over the old bytes and nothing else moves", async () => {
  const stream = streamOf(synthetic(CASE["in place"].blocks));
  const { placed, after } = await place(stream);
  assert.deepEqual(lbas(placed), [PACK_AT]);
  const at = ORIGINAL.offsets[SLOT];
  const old = ORIGINAL.streams[SLOT].length;
  const was = user(IMAGE, PACK_AT);
  const now = user(after, PACK_AT);
  const allowed = new Set([
    ...Array.from({ length: 4 }, (_, i) => 4 + SLOT * 8 + 4 + i),
    ...Array.from({ length: stream.length }, (_, i) => at + i),
  ]);
  assert.ok(differing(was, now).every((i) => allowed.has(i)));
  same(now.subarray(at, at + stream.length), stream);
  const view = new DataView(now.buffer, now.byteOffset);
  assert.deepEqual(
    [view.getUint32(4 + SLOT * 8, true), view.getUint32(8 + SLOT * 8, true)],
    [at, stream.length],
  );
  same(now.subarray(at + stream.length, at + old), was.subarray(at + stream.length, at + old));
  assert.equal(placed.fit.names[SLOT], "LEVEL 2");
  same(raw(after, WORLD_AT), raw(IMAGE, WORLD_AT));
  assert.equal(placed.fit.room, old - stream.length);
});

test("a rebuild lays the pack out again and rewrites the directory record's size", async () => {
  const stream = streamOf(synthetic(CASE.rebuild.blocks));
  const { disc, placed, after } = await place(stream);
  assert.deepEqual(
    [placed.fit.path, placed.fit.recompressed, placed.lba],
    [REBUILD, false, PACK_AT],
  );
  assert.deepEqual(lbas(placed), [WORLD_AT, PACK_AT]);
  same(user(after, PACK_AT), padded(writePak(placed.fit.names, placed.fit.streams), USER));
  assert.deepEqual(placed.fit.names, ["LEVEL 1", "SPIRAL", "LEVEL 3"]);
  const pak = readPak(user(after, PACK_AT).slice(0, placed.fit.size));
  for (const i of [0, 2]) same(pak.streams[i], ORIGINAL.streams[i]);
  same(raw(after, WORLD_AT).subarray(0, USER_OFF), raw(IMAGE, WORLD_AT).subarray(0, USER_OFF));
  const { offset } = disc.records.get(SYNTHETIC_PACK);
  const changed = differing(user(IMAGE, WORLD_AT), user(after, WORLD_AT));
  assert.ok(
    changed.length > 0 && changed.every((i) => i >= offset + SIZE && i < offset + SIZE + 8),
  );
  assert.equal(placed.fit.room, USER - placed.fit.size);
});

test("a rebuild recompresses the others when that is what makes room", async () => {
  const stream = streamOf(synthetic(CASE["rebuild, recompressed"].blocks));
  const { placed, after } = await place(stream);
  assert.deepEqual([placed.fit.path, placed.fit.recompressed], [REBUILD, true]);
  assert.deepEqual(lbas(placed), [WORLD_AT, PACK_AT]);
  const pak = readPak(user(after, PACK_AT).slice(0, placed.fit.size));
  for (const i of [0, 2]) {
    assert.notDeepEqual(Buffer.from(pak.streams[i]), Buffer.from(ORIGINAL.streams[i]));
    same(pak.streams[i], deflate(inflateSync(ORIGINAL.streams[i]), 9));
  }
  assert.ok(placed.fit.size <= USER);
});

test("a pack that does not fit moves to the head of the room", async () => {
  const stream = streamOf(synthetic(CASE.relocate.blocks));
  const { disc, placed, after } = await place(stream);
  assert.deepEqual(
    [placed.fit.path, placed.fit.recompressed, placed.lba],
    [RELOCATE, false, ROOM_AT],
  );
  assert.deepEqual(lbas(placed), [WORLD_AT, ROOM_AT, ROOM_AT + 1]);
  const laid = writePak(placed.fit.names, placed.fit.streams);
  same(concat([user(after, ROOM_AT), user(after, ROOM_AT + 1)]), padded(laid, 2 * USER));
  assert.deepEqual(
    [raw(after, ROOM_AT)[SUBMODE_AT], raw(after, ROOM_AT + 1)[SUBMODE_AT]],
    [DATA_SUBMODE, EOF_SUBMODE],
  );
  same(raw(after, ROOM_AT), sector(ROOM_AT, user(after, ROOM_AT), DATA_SUBMODE));
  same(user(after, ROOM_AT + 2), new Uint8Array(USER));
  same(raw(after, PACK_AT), raw(IMAGE, PACK_AT));
  const { offset } = disc.records.get(SYNTHETIC_PACK);
  assert.deepEqual(bothWaysAt(user(after, WORLD_AT), offset)[0], [ROOM_AT, ROOM_AT]);
  assert.equal(placed.fit.room, LARGEST - placed.fit.size);
});

test("a directory sector is rewritten under its own subheader, which need not be a file's last", async () => {
  const DIR_AT = SYNTHETIC_SECTORS;
  const root = concat([
    record("\0", ROOT_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    record("3.00;1", ROOM_AT, ROOM_SECTORS * USER),
    record("HIRO", DIR_AT, 2 * USER, 2),
    record("SYSTEM.CNF;1", CNF_AT, CNF.length),
  ]);
  const world = concat([
    record("\0", DIR_AT, 2 * USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    ...syntheticPacks().map(([path, at, blob]) =>
      record(`${path.split("/").pop()};1`, at, blob.length),
    ),
  ]);
  const image = concat([
    IMAGE,
    sector(DIR_AT, padded(world, USER), DATA_SUBMODE),
    sector(DIR_AT + 1, new Uint8Array(USER), EOF_SUBMODE),
  ]);
  image.set(sector(ROOT_AT, padded(root, USER), EOF_SUBMODE), ROOT_AT * SECTOR_RAW);
  const { disc, placed } = await place(streamOf(synthetic(CASE.rebuild.blocks)), { image });
  assert.equal(disc.records.get(SYNTHETIC_PACK).sector, DIR_AT);
  assert.deepEqual(lbas(placed), [PACK_AT, DIR_AT]);
  const written = placed.writes.find(([lba]) => lba === DIR_AT)[1];
  const was = raw(image, DIR_AT);
  same(written.subarray(0, USER_OFF), was.subarray(0, USER_OFF));
  assert.equal(written[SUBMODE_AT], DATA_SUBMODE);
  same(written, rewrite(was, written.subarray(USER_OFF, USER_OFF + USER)));
  assert.ok(check(written));
});

test("the fit from the layout is the fit from the image, the slot named after the title in both", async () => {
  const pak = readPak(syntheticPacks()[0][2]);
  const levels = await Promise.all(pak.streams.map(inflate));
  const sizes = pak.streams.map((s) => s.length);
  const size9 = levels.map((l) => deflate(l, 9).length);
  const layout = {
    size: pak.size,
    capacity: USER,
    slots: pak.names.map((name, i) => ({ name, size: sizes[i], size9: size9[i] })),
  };
  const key = (f) => [f.path, f.recompressed, f.size, f.room];
  const others = (ss) =>
    packSize(
      pak.names,
      ss.map((s, i) => (i === SLOT ? 0 : s)),
    );
  const edges = [
    sizes[SLOT],
    USER - others(sizes),
    USER - others(size9),
    LARGEST - others(sizes),
    LARGEST - others(size9),
  ];
  const outcome = (f) => {
    try {
      return key(f());
    } catch (e) {
      return e.message;
    }
  };
  for (const title of [null, TITLE, "X", "A much longer title than the slot's name"])
    for (const edge of edges)
      for (let n = edge - 8; n <= edge + 8; n++)
        assert.deepEqual(
          outcome(() => fit(layout, SLOT, n, title)),
          outcome(() => fitPak(pak, USER, SLOT, stored(n), title, levels)),
          `${title} ${n}`,
        );
  assert.notDeepEqual(
    key(fit(layout, SLOT, edges[1] + 1, "X")),
    key(fit(layout, SLOT, edges[1] + 1)),
  );
});

test("the finals pack takes a level too", async () => {
  const { placed } = await place(streamOf(synthetic(1)), {
    slot: 0,
    title: "Tiny",
    pack: SYNTHETIC_FINALS,
  });
  assert.equal(placed.fit.path, IN_PLACE);
});

test("what is refused", async () => {
  const disc = await openDisc(new Blob([IMAGE]));
  const stream = streamOf(synthetic(CASE["in place"].blocks));
  const moving = streamOf(synthetic(CASE.relocate.blocks));
  await assert.rejects(plan(disc, "/HIRO/COPYCAT.PAK", 0, stream, null, inflate), /no such pack/);
  await assert.rejects(plan(disc, SYNTHETIC_PACK, 3, stream, null, inflate), /slots/);
  await assert.rejects(
    plan(disc, SYNTHETIC_PACK, SLOT, bytesOf("not a stream"), null, inflate),
    /not one the game inflates/,
  );
  await assert.rejects(
    plan(disc, SYNTHETIC_PACK, SLOT, stored(ROOM_SECTORS * USER - USER), null, inflate),
    /sectors and the pack needs/,
  );
  const taken = IMAGE.slice();
  const head = user(IMAGE, ROOM_AT).slice();
  head[0] = 1;
  taken.set(sector(ROOM_AT, head, DATA_SUBMODE), ROOM_AT * SECTOR_RAW);
  await assert.rejects(
    plan(await openDisc(new Blob([taken])), SYNTHETIC_PACK, SLOT, moving, null, inflate),
    /is not zero/,
  );
  const roomless = IMAGE.slice();
  const root = concat([
    record("\0", ROOT_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    record("HIRO", WORLD_AT, USER, 2),
  ]);
  roomless.set(sector(ROOT_AT, padded(root, USER), EOF_SUBMODE), ROOT_AT * SECTOR_RAW);
  const bare = await openDisc(new Blob([roomless]));
  assert.ok(!bare.files.has(ROOM));
  await assert.rejects(plan(bare, SYNTHETIC_PACK, SLOT, moving, null, inflate), /has no \/3\.00/);
  const rebuilt = await plan(
    bare,
    SYNTHETIC_PACK,
    SLOT,
    streamOf(synthetic(CASE.rebuild.blocks)),
    null,
    inflate,
  );
  assert.equal(rebuilt.fit.path, REBUILD);
});

test("a record that does not inflate stops only a rebuild that would recompress it", async () => {
  const damaged = IMAGE.slice();
  const data = user(IMAGE, PACK_AT).slice();
  data[ORIGINAL.offsets[0] + 3] ^= 0xff;
  damaged.set(sector(PACK_AT, data, EOF_SUBMODE), PACK_AT * SECTOR_RAW);
  const disc = await openDisc(new Blob([damaged]));
  const fitted = async (c) =>
    (await plan(disc, SYNTHETIC_PACK, SLOT, streamOf(synthetic(c.blocks)), TITLE, inflate)).fit;
  assert.equal((await fitted(CASE["in place"])).path, IN_PLACE);
  assert.deepEqual(
    [(await fitted(CASE.rebuild)).path, (await fitted(CASE.rebuild)).recompressed],
    [REBUILD, false],
  );
  await assert.rejects(
    fitted(CASE["rebuild, recompressed"]),
    /^Error: the record of LEVEL 1 is not one the game inflates: /,
  );
});

test("the record of the slot being replaced is never inflated, so a damaged one does not stop the rebuild", async () => {
  const damaged = IMAGE.slice();
  const data = user(IMAGE, PACK_AT).slice();
  const at = ORIGINAL.offsets[SLOT];
  data[at + 3] ^= 0xff;
  await assert.rejects(inflate(data.subarray(at, at + ORIGINAL.streams[SLOT].length)));
  damaged.set(sector(PACK_AT, data, EOF_SUBMODE), PACK_AT * SECTOR_RAW);
  const c = CASE["rebuild, recompressed"];
  const { placed } = await place(streamOf(synthetic(c.blocks)), { image: damaged });
  assert.deepEqual(
    [placed.fit.path, placed.fit.recompressed, placed.fit.size, placed.fit.room, placed.lba],
    [c.path, c.recompressed, c.size, c.room, c.lba],
  );
});

test("the verifier refuses an image that is not the plan's", async () => {
  const stream = streamOf(synthetic(CASE.rebuild.blocks));
  const { disc, placed, after } = await place(stream);
  await assert.rejects(
    verify(disc, SYNTHETIC_PACK, SLOT, stream, placed, inflate),
    /the directory puts/,
  );
  const small = await place(streamOf(synthetic(CASE["in place"].blocks)));
  await assert.rejects(
    verify(small.disc, SYNTHETIC_PACK, SLOT, streamOf(synthetic(6)), small.placed, inflate),
    /does not inflate to the level/,
  );
  const patched = await openDisc(new Blob([after]));
  const renamed = { ...placed, fit: { ...placed.fit, names: ["LEVEL 1", "OTHER", "LEVEL 3"] } };
  await assert.rejects(
    verify(patched, SYNTHETIC_PACK, SLOT, stream, renamed, inflate),
    /read back as planned/,
  );
  const broken = {
    ...placed,
    writes: placed.writes.map(([lba, written]) => {
      const flipped = written.slice();
      flipped[USER_OFF + 5] ^= 1;
      return [lba, flipped];
    }),
  };
  await assert.rejects(
    verify(patched, SYNTHETIC_PACK, SLOT, stream, broken, inflate),
    /does not check/,
  );
});

test("the patched image is the original's slices with the written sectors between them", async () => {
  const blob = new Blob([IMAGE]);
  const a = sector(30, noise(5), DATA_SUBMODE);
  const b = sector(3, noise(6), DATA_SUBMODE);
  const after = await bytes(
    patchedImage(blob, [
      [30, a],
      [3, b],
    ]),
  );
  const want = IMAGE.slice();
  want.set(a, 30 * SECTOR_RAW);
  want.set(b, 3 * SECTOR_RAW);
  same(after, want);
  same(await bytes(patchedImage(blob, [])), IMAGE);
  assert.throws(() => patchedImage(blob, [[SYNTHETIC_SECTORS, a]]), /past the end/);
  assert.throws(
    () =>
      patchedImage(blob, [
        [3, a],
        [3, b],
      ]),
    /written twice/,
  );
});

// --- the patches ------------------------------------------------------------------------

test("a PPF is the header, the block check and a record for every changed stretch", async () => {
  for (const c of fixture.cases) {
    const { blob, placed, after } = await place(streamOf(synthetic(c.blocks)));
    const patch = await ppf(blob, placed.writes, PREFIX + TITLE);
    same(patch.subarray(0, 6), [...PPF_MAGIC, 2], c.name);
    assert.equal(text(patch.subarray(6, 56)), (PREFIX + TITLE).padEnd(DESCRIPTION), c.name);
    assert.deepEqual([...patch.subarray(56, 60)], [0, 1, 0, 0], c.name);
    same(patch.subarray(60, 60 + BLOCK), IMAGE.subarray(BLOCK_AT, BLOCK_AT + BLOCK), c.name);
    assert.equal(text(IMAGE.subarray(BLOCK_AT, BLOCK_AT + 11)), "PLAYSTATION");
    const records = ppfRecords(patch);
    const at = records.map(([offset]) => offset);
    assert.deepEqual(at, sorted(at), c.name);
    assert.equal(
      records.reduce((n, [, data]) => n + data.length, 0),
      differing(IMAGE, after).length,
    );
    for (const [offset, data] of records) {
      assert.ok(data.length >= 1 && data.length <= RECORD_MOST, c.name);
      assert.ok(
        data.every((v, i) => IMAGE[offset + i] !== v),
        c.name,
      );
      same(after.subarray(offset, offset + data.length), data, c.name);
    }
    same(applyPpf(IMAGE, patch), after, c.name);
  }
});

test("a long description is cut and a short one padded, in ASCII", async () => {
  const { blob, placed } = await place(streamOf(synthetic(CASE["in place"].blocks)));
  const description = async (s) => text((await ppf(blob, placed.writes, s)).subarray(6, 56));
  assert.equal(await description("x".repeat(80)), "x".repeat(50));
  assert.equal(await description("Kula World Map: Épée"), "Kula World Map: ?p?e".padEnd(50));
  assert.equal(await description("a\tb\nc\u007fd\u0000"), "a?b?c?d?".padEnd(50));
});

test("a VCDIFF decodes to the patched image and copies the rest from the source", async () => {
  for (const c of fixture.cases) {
    const { blob, placed, after } = await place(streamOf(synthetic(c.blocks)));
    const patch = await vcdiff(blob, placed.writes);
    const [target, windows] = decodeVcdiff(IMAGE, patch);
    same(target, after, c.name);
    assert.equal(windows, 1, c.name);
    assert.ok(patch.length < (await ppf(blob, placed.writes, PREFIX + TITLE)).length, c.name);
  }
});

test("windows of a size that cuts a sector in two decode the same", async () => {
  const { blob, placed, after } = await place(streamOf(synthetic(CASE.relocate.blocks)));
  for (const window of [WINDOW, 16384, 7 * SECTOR_RAW + 1, 2048]) {
    const [target, windows] = decodeVcdiff(IMAGE, await vcdiff(blob, placed.writes, window));
    same(target, after, window);
    assert.equal(windows, Math.ceil(IMAGE.length / window), window);
  }
  const cut = (lba) =>
    Math.floor((lba * SECTOR_RAW) / 16384) !== Math.floor(((lba + 1) * SECTOR_RAW - 1) / 16384);
  assert.ok(lbas(placed).some(cut));
});

test("the changes are the differing stretches of the written sectors", async () => {
  for (const c of fixture.cases) {
    const { blob, placed, after } = await place(streamOf(synthetic(c.blocks)));
    const changed = await changes(blob, placed.writes);
    const at = changed.map(([offset]) => offset);
    assert.deepEqual(at, sorted(at), c.name);
    const sectors = new Set(lbas(placed));
    for (const [offset, data] of changed) {
      same(after.subarray(offset, offset + data.length), data, c.name);
      assert.ok(sectors.has(Math.floor(offset / SECTOR_RAW)), c.name);
      assert.notEqual(IMAGE[offset], data[0], c.name);
      assert.notEqual(IMAGE[offset + data.length - 1], data[data.length - 1], c.name);
    }
    assert.deepEqual(new Set(at.map((offset) => Math.floor(offset / SECTOR_RAW))), sectors, c.name);
  }
});

test("an integer is base 128, most significant first, the continuation bit high on all but the last", () => {
  assert.deepEqual([...varint(0)], [0x00]);
  assert.deepEqual([...varint(127)], [0x7f]);
  assert.deepEqual([...varint(128)], [0x81, 0x00]);
  assert.deepEqual([...varint(123456789)], [0xba, 0xef, 0x9a, 0x15]);
  for (const n of [0, 1, 127, 128, 16383, 16384, 2 ** 32 - 1, 257795664])
    assert.deepEqual(readVarint(varint(n), 0), [n, varint(n).length], n);
});

test("the stretches that differ", () => {
  const b = (s) => bytesOf(s);
  assert.deepEqual(runs(b("abcdef"), b("abcdef")), []);
  assert.deepEqual(runs(b("abcdef"), b("Abcdef")), [[0, 1]]);
  assert.deepEqual(runs(b("abcdef"), b("abcdeF")), [[5, 1]]);
  assert.deepEqual(runs(b("abcdef"), b("aBCdEF")), [
    [1, 2],
    [4, 2],
  ]);
  assert.deepEqual(runs(b("abcdef"), b("ABCDEF")), [[0, 6]]);
});

test("the Adler-32 is zlib's", () => {
  assert.equal(adler32(bytesOf("Wikipedia")), 0x11e60398);
  assert.equal(adler32(new Uint8Array(0)), 1);
  const long = noise(7, 100000);
  assert.equal(adler32(long), slowAdler32(long));
  assert.equal(
    adler32(new Uint8Array(70000).fill(255)),
    slowAdler32(new Uint8Array(70000).fill(255)),
  );
});

test("the placements name the image for two emulators and the serial for two, and the cue sheet the image", () => {
  const lines = placements("/discs/Roll Away.bin", "out/spiral");
  assert.equal(lines.length, 3);
  assert.ok(lines[0].includes("Roll Away.ppf") && lines[0].includes("DuckStation"), lines[0]);
  assert.ok(lines[0].includes("PCSX-Redux"), lines[0]);
  assert.ok(lines[1].includes(SERIAL) && lines[1].includes("ePSXe"), lines[1]);
  assert.ok(
    lines[2].includes('xdelta3 -d -s "Roll Away.bin" "spiral.xdelta" "spiral.bin"'),
    lines[2],
  );
  assert.ok(
    placements("/discs/Roll Away.bin", "out/level 4")[2].endsWith(
      'xdelta3 -d -s "Roll Away.bin" "level 4.xdelta" "level 4.bin"',
    ),
  );
  assert.equal(
    cue("spiral.bin"),
    'FILE "spiral.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n',
  );
  for (const name of ["kula $& level.bin", "level$`.bin", "a$$b.bin", "x$'.bin"])
    assert.equal(cue(name).split("\n")[0], `FILE "${name}" BINARY`, name);
  assert.equal(cue('my "disc".bin').split("\n")[0], 'FILE "my \\"disc\\".bin" BINARY');
});

test("the image is known by its structure and warned about where it is not the disc", async () => {
  assert.deepEqual(await identify(await openDisc(new Blob([IMAGE]))), WARNINGS);
  const odd = await identify(await openDisc(new Blob([IMAGE, new Uint8Array(1)])));
  assert.equal(odd[0], "the image is 101,137 bytes, which is not whole sectors of 2352");
  const quiet = IMAGE.slice();
  quiet.set(sector(CNF_AT, new Uint8Array(USER), EOF_SUBMODE), CNF_AT * SECTOR_RAW);
  assert.ok(
    (await identify(await openDisc(new Blob([quiet])))).includes(
      "SYSTEM.CNF does not say BOOT = cdrom:SLUS_007.24;1",
    ),
  );
  const other = IMAGE.slice();
  const pvd = user(IMAGE, 16).slice();
  pvd.set(bytesOf("SATURN".padEnd(32)), 8);
  other.set(sector(16, pvd, 0x09), 16 * SECTOR_RAW);
  assert.ok(
    (await identify(await openDisc(new Blob([other])))).includes(
      "the system identifier is 'SATURN', not PLAYSTATION",
    ),
  );
});

// --- the disc, where it is -----------------------------------------------------------

test(
  "on the disc, the walk finds every pack where packs.json puts it, and LEVEL 1's own stream goes back in place",
  { skip: !process.env.KULA_DISC && "needs the disc under $KULA_DISC" },
  async () => {
    const blob = await openAsBlob(process.env.KULA_DISC);
    const disc = await openDisc(blob);
    assert.equal(disc.files.size, 42);
    for (const p of packs.packs)
      assert.deepEqual(disc.files.get(p.path), { lba: p.lba, size: p.size }, p.path);
    assert.deepEqual(disc.files.get(ROOM), { lba: packs.room.lba, size: packs.room.size });
    assert.deepEqual(await identify(disc), []);
    const level = mapData.levels[0];
    const own = deflate(writeKwl(projectOf(level)), 6);
    const placed = await plan(disc, level.pack, level.index, own, null, inflate);
    assert.deepEqual([placed.fit.path, placed.lba, lbas(placed)], [IN_PLACE, 1002, [1002]]);
    assert.equal(placed.fit.room, packs.packs[0].slots[0].size - own.length);
    assert.deepEqual(placed.warnings, []);
    const patched = patchedImage(blob, placed.writes);
    assert.equal(patched.size, blob.size);
    await verify(await openDisc(patched), level.pack, level.index, own, placed, inflate);
    const patch = await ppf(blob, placed.writes, PREFIX + level.name);
    assert.equal(patch.length, 1687);
    assert.ok(ppfRecords(patch).every(([at]) => Math.floor(at / SECTOR_RAW) === 1002));
    const delta = await vcdiff(blob, placed.writes);
    assert.equal(delta.length, 1469);
    same(delta.subarray(0, 5), [...VCDIFF_MAGIC, 0]);
    const fourth = mapData.levels.find((l) => l.pack === level.pack && l.index === 3);
    const longer = deflate(writeKwl(projectOf(fourth)), 6);
    const rebuilt = await plan(disc, level.pack, level.index, longer, fourth.name, inflate);
    assert.deepEqual([rebuilt.fit.path, rebuilt.fit.recompressed], [REBUILD, false]);
    assert.deepEqual(lbas(rebuilt), [322, 1002, 1003, 1004, 1005, 1006, 1007]);
    assert.equal((await ppf(blob, rebuilt.writes, PREFIX + fourth.name)).length, 14879);
    assert.equal((await vcdiff(blob, rebuilt.writes)).length, 14329);
  },
);
