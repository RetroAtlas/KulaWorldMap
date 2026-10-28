import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { openAsBlob, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { discs, mapData } from "./fixtures.js";
import { projectOf, writeKwl } from "../../public/js/format/kwl.js";
import { deflate } from "../../public/js/format/deflate.js";
import { openDisc } from "../../public/js/format/iso.js";
import { readPak } from "../../public/js/format/pak.js";
import { SECTOR_RAW } from "../../public/js/format/sectors.js";
import {
  BLOCK,
  BLOCK_AT,
  PREFIX,
  WINDOW,
  adler32,
  description,
  plan,
  planAll,
  ppf,
  varint,
  vcdiff,
} from "../../public/js/format/patch.js";
import {
  PPF,
  VCDIFF,
  appliedImage,
  changedSlots,
  patchKind,
  ppfCheck,
  ppfPatch,
  vcdiffPatch,
  vcdiffStretches,
} from "../../public/js/format/patchread.js";
import {
  SYNTHETIC_PACK,
  bytesOf,
  streamOf,
  synthetic,
  syntheticImage,
  syntheticPacks,
} from "./synthetic.js";

// The readers are held to the fixture's digest of each patched image, which
// the Python wrote, so a reader that agreed with the writers alone would not pass.
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/patch-digests.json", import.meta.url)), "utf8"),
);
const IMAGE = syntheticImage();
const BLOB = new Blob([IMAGE]);
const ORIGINAL = readPak(syntheticPacks()[0][2]);
const SLOT = fixture.slot;
const TITLE = fixture.title;
const CASE = Object.fromEntries(fixture.cases.map((c) => [c.name, c]));
const PPF_HEAD = 60;
const RUN = 0;
const ADD_2 = 3;

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inflate = async (bytes) => new Uint8Array(inflateSync(bytes));
const same = (a, b, name) => assert.deepEqual(Buffer.from(a), Buffer.from(b), name);
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const digest = async (blob) => sha256(await bytes(blob));
const text = (s) => bytesOf(s);
const named = (slots) => slots.map(({ pack, index, name }) => ({ pack, index, name }));
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A source whose slices are counted, so a test sees which windows were read. */
function counted(blob) {
  const reads = [];
  return {
    reads,
    size: blob.size,
    slice: (start, end) => {
      reads.push([start, end]);
      return blob.slice(start, end);
    },
  };
}

/** The fixture case's level placed, with the two patches the writers make of it. */
async function patchesOf(c) {
  const stream = streamOf(synthetic(c.blocks));
  const placed = await plan(
    await openDisc(BLOB),
    SYNTHETIC_PACK,
    SLOT,
    stream,
    TITLE,
    inflate,
    discs,
  );
  return {
    stream,
    placed,
    patch: await ppf(BLOB, placed.writes, PREFIX + TITLE),
    delta: await vcdiff(BLOB, placed.writes),
  };
}

/** The fixture set's levels placed together, with the two patches the writers make of them. */
async function patchesOfSet(s) {
  const items = s.items.map(({ pack, slot, blocks, title }) => ({
    pack,
    slot,
    stream: streamOf(synthetic(blocks, title)),
    title,
  }));
  const planned = await planAll(BLOB, items, inflate, discs);
  return {
    items,
    planned,
    patch: await ppf(BLOB, planned.writes, description(items.map((i) => i.title))),
    delta: await vcdiff(BLOB, planned.writes),
  };
}

/** The image a stretch's sector falls in, for holding the stretches to the placement's sectors. */
const sectorsOf = (stretches) => [...new Set(stretches.map(([at]) => Math.floor(at / SECTOR_RAW)))];

// --- the kind -------------------------------------------------------------------------

test("a file is a PPF or a VCDIFF by its head, and anything else is neither", async () => {
  const { patch, delta } = await patchesOf(CASE["in place"]);
  assert.equal(patchKind(patch), PPF);
  assert.equal(patchKind(delta), VCDIFF);
  assert.equal(patchKind(IMAGE), null);
  assert.equal(patchKind(streamOf(synthetic(3))), null);
  assert.equal(patchKind(writeKwl(synthetic(3))), null);
  assert.equal(patchKind(text("PPF20")), null);
  assert.equal(patchKind(text("PPF")), null);
  assert.equal(patchKind(new Uint8Array(0)), null);
});

// --- each placement read back ---------------------------------------------------------

for (const c of fixture.cases) {
  test(`${c.name}: the PPF's records and the VCDIFF's stretches lay the fixture's patched image over the original, and the patch changes the one slot`, async () => {
    const { stream, placed, patch, delta } = await patchesOf(c);
    const read = ppfPatch(patch);
    assert.equal(read.description, PREFIX + TITLE);
    same(read.block, IMAGE.subarray(BLOCK_AT, BLOCK_AT + BLOCK));
    const offsets = read.stretches.map(([at]) => at);
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    assert.deepEqual(sectorsOf(read.stretches), c.sectors);
    const viaPpf = appliedImage(BLOB, read.stretches);
    assert.equal(viaPpf.size, BLOB.size);
    assert.equal(await digest(viaPpf), c.patched);
    const stretches = await vcdiffStretches(BLOB, delta);
    assert.deepEqual(sectorsOf(stretches), c.sectors);
    const viaVcdiff = appliedImage(BLOB, stretches);
    assert.equal(await digest(viaVcdiff), c.patched);
    assert.equal(await ppfCheck(BLOB, patch), true);
    for (const applied of [viaPpf, viaVcdiff]) {
      const slots = await changedSlots(BLOB, applied, inflate);
      assert.deepEqual(named(slots), [
        { pack: SYNTHETIC_PACK, index: SLOT, name: placed.fit.names[SLOT] },
      ]);
      same(await inflate(slots[0].stream), await inflate(stream));
      same(slots[0].stream, placed.fit.streams[SLOT]);
    }
    const pak = readPak(await (await openDisc(viaPpf)).readFile(SYNTHETIC_PACK));
    const others = [0, 2].map((i) => Buffer.compare(pak.streams[i], ORIGINAL.streams[i]) !== 0);
    assert.deepEqual(others, c.recompressed ? [true, true] : [false, false]);
  });
}

test("a record a rebuild only recompressed is not a level the patch puts on the disc", async () => {
  const c = CASE["rebuild, recompressed"];
  const { patch } = await patchesOf(c);
  const applied = appliedImage(BLOB, ppfPatch(patch).stretches);
  const pak = readPak(await (await openDisc(applied)).readFile(SYNTHETIC_PACK));
  for (const i of [0, 2]) {
    same(pak.streams[i], deflate(inflateSync(ORIGINAL.streams[i]), 9));
    same(inflateSync(pak.streams[i]), inflateSync(ORIGINAL.streams[i]));
  }
  assert.deepEqual(
    (await changedSlots(BLOB, applied, inflate)).map((s) => s.index),
    [SLOT],
  );
});

for (const s of fixture.sets) {
  test(`${s.name}: both patches lay the fixture's patched image over the original, and the patch changes the set's slots`, async () => {
    const { items, planned, patch, delta } = await patchesOfSet(s);
    const read = ppfPatch(patch);
    assert.equal(read.description, description(items.map((i) => i.title)));
    assert.deepEqual(sectorsOf(read.stretches), s.sectors);
    const viaPpf = appliedImage(BLOB, read.stretches);
    assert.equal(await digest(viaPpf), s.patched);
    const viaVcdiff = appliedImage(BLOB, await vcdiffStretches(BLOB, delta));
    assert.equal(await digest(viaVcdiff), s.patched);
    for (const applied of [viaPpf, viaVcdiff]) {
      const slots = await changedSlots(BLOB, applied, inflate);
      assert.deepEqual(
        named(slots),
        items.map(({ pack, slot }, i) => ({
          pack,
          index: slot,
          name: planned.placed[i].fit.names[slot],
        })),
      );
      for (const [i, slot] of slots.entries())
        same(await inflate(slot.stream), await inflate(items[i].stream));
    }
  });
}

test("an image the patch did not change has no changed slot", async () => {
  assert.deepEqual(await changedSlots(BLOB, BLOB, inflate), []);
  assert.deepEqual(await changedSlots(BLOB, appliedImage(BLOB, []), inflate), []);
});

// --- the PPF ----------------------------------------------------------------------------

test("the block check tells the image the patch was made for from another", async () => {
  const { patch } = await patchesOf(CASE["in place"]);
  assert.equal(await ppfCheck(BLOB, patch), true);
  assert.equal(await ppfCheck(BLOB, ppfPatch(patch)), true);
  const other = IMAGE.slice();
  other[BLOCK_AT + 100] ^= 0xff;
  assert.equal(await ppfCheck(new Blob([other]), patch), false);
  assert.equal(await ppfCheck(new Blob([IMAGE.subarray(0, BLOCK_AT + 10)]), patch), false);
  const unchecked = patch.slice();
  unchecked[57] = 0;
  const bare = concat([unchecked.subarray(0, PPF_HEAD), unchecked.subarray(PPF_HEAD + BLOCK)]);
  assert.equal(ppfPatch(bare).block, null);
  assert.equal(await ppfCheck(BLOB, bare), null);
  assert.deepEqual(ppfPatch(bare).stretches, ppfPatch(patch).stretches);
});

test("a PPF with undo data and a FILE_ID.DIZ reads to the same stretches", async () => {
  const { patch } = await patchesOf(CASE.rebuild);
  const { stretches } = ppfPatch(patch);
  const withUndo = concat([
    patch.subarray(0, PPF_HEAD + BLOCK),
    ...stretches.flatMap(([at, data]) => {
      const head = new Uint8Array(9);
      new DataView(head.buffer).setBigUint64(0, BigInt(at), true);
      head[8] = data.length;
      return [head, data, IMAGE.subarray(at, at + data.length)];
    }),
  ]);
  withUndo[58] = 1;
  assert.deepEqual(ppfPatch(withUndo).stretches, stretches);
  const diz = text("@BEGIN_FILE_ID.DIZ\r\nA level for the map.\r\n@END_FILE_ID.DIZ");
  for (const word of [2, 4]) {
    const length = new Uint8Array(word);
    new DataView(length.buffer)[word === 2 ? "setUint16" : "setUint32"](0, 22, true);
    assert.deepEqual(ppfPatch(concat([patch, diz, length])).stretches, stretches, word);
    assert.deepEqual(ppfPatch(concat([withUndo, diz, length])).stretches, stretches, word);
  }
  const padded = text("Kula World Map: A short one\0garbage".padEnd(50, "x"));
  const described = patch.slice();
  described.set(padded, 6);
  assert.equal(ppfPatch(described).description, "Kula World Map: A short one");
});

test("what a PPF reader refuses", async () => {
  const { patch } = await patchesOf(CASE["in place"]);
  assert.throws(() => ppfPatch(IMAGE), /not a PPF 3\.0 patch/);
  assert.throws(() => ppfPatch(text("PPF30")), /not a PPF 3\.0 patch/);
  const older = patch.slice();
  older[5] = 1;
  assert.throws(() => ppfPatch(older), /not a PPF 3\.0 patch/);
  const gi = patch.slice();
  gi[56] = 1;
  assert.throws(() => ppfPatch(gi), /2336-byte sectors/);
  assert.throws(() => ppfPatch(patch.subarray(0, PPF_HEAD + 100)), /inside its block check/);
  assert.throws(() => ppfPatch(patch.subarray(0, patch.length - 1)), /runs past its end/);
  assert.throws(() => ppfPatch(patch.subarray(0, PPF_HEAD + BLOCK + 5)), /runs past its end/);
});

// --- the VCDIFF -------------------------------------------------------------------------

test("the windows are the writer's, one per stretch of the image, and only those with a change are read", async () => {
  const c = CASE.relocate;
  const { placed, delta } = await patchesOf(c);
  const [one] = vcdiffPatch(delta);
  assert.equal(vcdiffPatch(delta).length, 1);
  assert.deepEqual(
    [one.indicator, one.srcPos, one.srcLen, one.start, one.targetLen],
    [5, 0, IMAGE.length, 0, IMAGE.length],
  );
  assert.equal(
    one.adler,
    adler32(await bytes(appliedImage(BLOB, await vcdiffStretches(BLOB, delta)))),
  );
  for (const window of [WINDOW, 16384, 7 * SECTOR_RAW + 1, 2048]) {
    const cut = await vcdiff(BLOB, placed.writes, window);
    const windows = vcdiffPatch(cut);
    assert.equal(windows.length, Math.ceil(IMAGE.length / window), window);
    windows.forEach((w, i) => {
      assert.equal(w.start, i * window, window);
      assert.deepEqual([w.srcPos, w.srcLen], [w.start, w.targetLen], window);
      assert.equal(w.targetLen, Math.min(window, IMAGE.length - w.start), window);
    });
    const source = counted(BLOB);
    const applied = appliedImage(BLOB, await vcdiffStretches(source, cut));
    assert.equal(await digest(applied), c.patched, window);
    const touched = new Set(
      c.sectors.flatMap((lba) => {
        const first = Math.floor((lba * SECTOR_RAW) / window);
        const last = Math.floor(((lba + 1) * SECTOR_RAW - 1) / window);
        return Array.from({ length: last - first + 1 }, (_, i) => first + i);
      }),
    );
    assert.deepEqual(
      source.reads.map(([start]) => start / window),
      [...touched].sort((a, b) => a - b),
      window,
    );
  }
});

test("the decoder knows the default code table: a run, a sized add and copies through every address mode", async () => {
  const source = text("abcdWXYZ1234567890123456");
  const segment = source.subarray(0, 4);
  const target = text("abcdabcdZZZZabcdabcdQQ");
  const copyOf = (mode, size) => 19 + 16 * mode + (size ? size - 3 : 0);
  const inst = Uint8Array.of(
    copyOf(0, 4),
    copyOf(1, 0),
    4,
    RUN,
    4,
    copyOf(2, 0),
    4,
    copyOf(6, 4),
    ADD_2,
  );
  const addr = Uint8Array.of(0, 4, 0, 4);
  const data = text("ZQQ");
  const body = concat([
    varint(target.length),
    Uint8Array.of(0),
    varint(data.length),
    varint(inst.length),
    varint(addr.length),
    Uint8Array.of(
      adler32(target) >>> 24,
      (adler32(target) >>> 16) & 0xff,
      (adler32(target) >>> 8) & 0xff,
      adler32(target) & 0xff,
    ),
    data,
    inst,
    addr,
  ]);
  const patch = concat([
    Uint8Array.of(0xd6, 0xc3, 0xc4, 0x00, 0x04),
    varint(3),
    text("app"),
    Uint8Array.of(5),
    varint(segment.length),
    varint(0),
    varint(body.length),
    body,
  ]);
  const [window] = vcdiffPatch(patch);
  assert.deepEqual([window.srcPos, window.srcLen, window.start, window.targetLen], [0, 4, 0, 22]);
  const stretches = await vcdiffStretches(new Blob([source]), patch);
  assert.deepEqual(
    stretches.map(([at, data]) => [at, String.fromCharCode(...data)]),
    [[4, "abcdZZZZabcdabcdQQ"]],
  );
  same(
    await bytes(appliedImage(new Blob([source]), stretches)),
    concat([target, source.subarray(22)]),
  );
  const longer = await vcdiffStretches(new Blob([source.subarray(0, 10)]), patch);
  assert.deepEqual(
    longer.map(([at, data]) => [at, String.fromCharCode(...data)]),
    [
      [4, "abcdZZ"],
      [10, "ZZabcdabcdQQ"],
    ],
  );
  assert.throws(() => appliedImage(new Blob([source.subarray(0, 10)]), longer), /past the end/);
});

test("what a VCDIFF reader refuses", async () => {
  const { delta } = await patchesOf(CASE.rebuild);
  assert.throws(() => vcdiffPatch(IMAGE), /not a VCDIFF patch/);
  assert.throws(() => vcdiffPatch(delta.subarray(0, 4)), /not a VCDIFF patch/);
  const compressed = delta.slice();
  compressed[4] = 1;
  assert.throws(() => vcdiffPatch(compressed), /secondary compression/);
  const table = delta.slice();
  table[4] = 2;
  assert.throws(() => vcdiffPatch(table), /code table of its own/);
  assert.throws(
    () => vcdiffPatch(delta.subarray(0, delta.length - 1)),
    /window 0 runs past the end/,
  );
  const [w] = vcdiffPatch(delta);
  const data = delta.length - w.data.length - w.inst.length - w.addr.length;
  const damaged = delta.slice();
  damaged[data + 3] ^= 0xff;
  await assert.rejects(
    vcdiffStretches(BLOB, damaged),
    /window 0 carries a checksum that is not its target's/,
  );
  const short = vcdiffPatch(delta).map((x) => ({
    ...x,
    inst: x.inst.subarray(0, x.inst.length - 1),
  }));
  await assert.rejects(vcdiffStretches(BLOB, short), /window 0 ends inside a number/);
  const noData = vcdiffPatch(delta).map((x) => ({ ...x, data: x.data.subarray(0, 1) }));
  await assert.rejects(vcdiffStretches(BLOB, noData), /window 0 adds more than its data/);
  assert.equal(w.addr[0], 0);
  const far = vcdiffPatch(delta).map((x) => ({
    ...x,
    addr: concat([varint(IMAGE.length), x.addr.subarray(1)]),
  }));
  await assert.rejects(vcdiffStretches(BLOB, far), /window 0 copies from outside its window/);
});

test("what applying refuses, and what a changed record must do", async () => {
  const a = [5, text("abc")];
  assert.throws(() => appliedImage(BLOB, [a, [6, text("x")]]), /overlaps the one before it/);
  assert.throws(
    () => appliedImage(BLOB, [[BLOB.size - 1, text("xy")]]),
    /past the end of the image/,
  );
  const want = IMAGE.slice();
  want.set(text("Z"), 0);
  want.set(text("abc"), 5);
  same(await bytes(appliedImage(BLOB, [a, [0, text("Z")]])), want);
  const { patch } = await patchesOf(CASE["in place"]);
  const broken = ppfPatch(patch).stretches.map(([at, data]) => [
    at,
    Uint8Array.from(data, (v) => v ^ 0xff),
  ]);
  await assert.rejects(
    changedSlots(BLOB, appliedImage(BLOB, broken), inflate),
    new RegExp(`^Error: ${SYNTHETIC_PACK}#${SLOT} is not one the game inflates: `),
  );
});

// --- the disc, where it is ---------------------------------------------------------------

test(
  "on the disc, LEVEL 1 placed back in its slot reads back from the PPF and the xdelta as the one slot changed",
  { skip: !process.env.KULA_DISC && "needs the disc under $KULA_DISC" },
  async () => {
    const blob = await openAsBlob(process.env.KULA_DISC);
    const disc = await openDisc(blob);
    const level = mapData.levels[0];
    const own = deflate(writeKwl(projectOf(level)), 6);
    const placed = await plan(disc, level.pack, level.index, own, null, inflate, discs);
    const patch = await ppf(blob, placed.writes, PREFIX + level.name);
    const delta = await vcdiff(blob, placed.writes);
    assert.equal(patchKind(patch), PPF);
    assert.equal(patchKind(delta), VCDIFF);
    assert.equal(await ppfCheck(blob, patch), true);
    assert.equal(vcdiffPatch(delta).length, Math.ceil(blob.size / WINDOW));
    const source = counted(blob);
    const stretches = await vcdiffStretches(source, delta);
    assert.equal(source.reads.length, 1);
    for (const applied of [
      appliedImage(blob, ppfPatch(patch).stretches),
      appliedImage(blob, stretches),
    ]) {
      assert.equal(applied.size, blob.size);
      const slots = await changedSlots(blob, applied, inflate);
      assert.deepEqual(named(slots), [{ pack: level.pack, index: level.index, name: "LEVEL 1" }]);
      same(slots[0].stream, own);
    }
  },
);
