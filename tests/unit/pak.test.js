import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { mapData, packs, levelKey } from "./fixtures.js";
import {
  BUFFER,
  IN_PLACE,
  LARGEST,
  REBUILD,
  RELOCATE,
  SLOTS_MOST,
  fit,
  fitPak,
  packName,
  packSize,
  readPak,
  writePak,
} from "../../public/js/pak.js";
import { deflate } from "../../public/js/deflate.js";
import { writeKwl } from "../../public/js/kwl.js";
import { USER } from "../../public/js/sectors.js";
import { stored, streamOf, synthetic, syntheticPacks } from "./synthetic.js";

// The length of every shipped level's canonical stream, as the Python writer
// deflates it, so the fit here is held to the one tools/kula_place.py makes.
const digests = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/kwl-digests.json", import.meta.url)), "utf8"),
);

const names = (p) => p.slots.map((s) => s.name);
const sizes = (p) => p.slots.map((s) => s.size);
const withSlot = (p, slot, size, recompressed) =>
  p.slots.map((s, i) => (i === slot ? size : recompressed ? s.size9 : s.size));
const packOf = (l) => packs.packs.find((p) => p.path === l.pack);

/** A pack of one sector with three records, the shape of the Python tests' synthetic image. */
function small(capacity = 2048) {
  const slots = [
    { name: "LEVEL 1", size: 300, size9: 250 },
    { name: "LEVEL 2", size: 400, size9: 320 },
    { name: "LEVEL 3", size: 500, size9: 410 },
  ];
  const p = { path: "/HIRO/HIRO.PAK", lba: 25, capacity, slots };
  p.size = packSize(names(p), sizes(p));
  return p;
}
const SLOT = 1;
const HEAD = 68;
const OTHERS = 300 + 500;
const OTHERS9 = 250 + 410;

test("the game's buffer is what caps a pack, and the paths are named for the UI", () => {
  assert.deepEqual([BUFFER, LARGEST], [32768, 32767]);
  assert.deepEqual([IN_PLACE, REBUILD, RELOCATE], ["in place", "rebuild", "relocate"]);
});

test("the container is the table, the names each with their two bytes, the padding and the records", () => {
  assert.equal(packSize(["LEVEL 1", "LEVEL 10", "OBJ LEVEL"], [3, 5, 1]), 81);
  for (let n = 1; n <= 8; n++) {
    const head = packSize(["X".repeat(n)], [0]);
    assert.equal(head % 4, 0, n);
    assert.ok(head - (16 + n + 2) >= 1 && head - (16 + n + 2) <= 4, n);
  }
  assert.equal(small().size, HEAD + OTHERS + 400);
});

test("every pack of the disc is its names and records laid out, with no gap", () => {
  assert.equal(packs.packs.length, 21);
  for (const p of packs.packs) assert.equal(packSize(names(p), sizes(p)), p.size, p.path);
});

test("a shipped level's own stream goes back into its slot in place, but for six that rebuild their pack", () => {
  const paths = {};
  const longer = [];
  for (const l of mapData.levels) {
    const p = packOf(l);
    const { size } = digests[levelKey(l)];
    const f = fit(p, l.index, size);
    paths[f.path] = (paths[f.path] ?? 0) + 1;
    if (f.path === IN_PLACE) {
      const room = p.slots[l.index].size - size;
      assert.deepEqual(f, { path: IN_PLACE, recompressed: false, size: p.size, room }, l.name);
      continue;
    }
    const limit = Math.min(p.capacity, LARGEST);
    const asIs = packSize(names(p), withSlot(p, l.index, size, false));
    const total = f.recompressed ? packSize(names(p), withSlot(p, l.index, size, true)) : asIs;
    assert.equal(asIs > limit, f.recompressed, l.name);
    assert.deepEqual(
      f,
      { path: REBUILD, recompressed: f.recompressed, size: total, room: limit - total },
      l.name,
    );
    assert.equal(Math.ceil(total / 2048) * 2048, p.capacity, l.name);
    longer.push([l.name, size - p.slots[l.index].size, f.recompressed]);
  }
  assert.deepEqual(paths, { [IN_PLACE]: 224, [REBUILD]: 6 });
  assert.deepEqual(longer, [
    ["BONUS 1", 6, false],
    ["LEVEL 33", 1, true],
    ["SIMON 4", 2, false],
    ["LEVEL 86", 2, false],
    ["LEVEL 87", 5, false],
    ["BONUS 30", 82, false],
  ]);
});

test("a stream no longer than the record goes in place, and one exactly its length with no room", () => {
  const p = small();
  assert.deepEqual(fit(p, SLOT, 400), {
    path: IN_PLACE,
    recompressed: false,
    size: p.size,
    room: 0,
  });
  assert.deepEqual(fit(p, SLOT, 1), {
    path: IN_PLACE,
    recompressed: false,
    size: p.size,
    room: 399,
  });
});

test("a longer one rebuilds the pack as it is while that fits its sectors", () => {
  const p = small();
  const most = p.capacity - HEAD - OTHERS;
  assert.deepEqual(fit(p, SLOT, 401), {
    path: REBUILD,
    recompressed: false,
    size: p.size + 1,
    room: p.capacity - p.size - 1,
  });
  assert.deepEqual(fit(p, SLOT, most), {
    path: REBUILD,
    recompressed: false,
    size: p.capacity,
    room: 0,
  });
});

test("then with the others recompressed at level 9", () => {
  const p = small();
  const most = p.capacity - HEAD - OTHERS;
  assert.deepEqual(fit(p, SLOT, most + 1), {
    path: REBUILD,
    recompressed: true,
    size: HEAD + OTHERS9 + most + 1,
    room: OTHERS - OTHERS9 - 1,
  });
  const most9 = p.capacity - HEAD - OTHERS9;
  assert.deepEqual(fit(p, SLOT, most9), {
    path: REBUILD,
    recompressed: true,
    size: p.capacity,
    room: 0,
  });
});

test("and moves the pack when even that does not fit, recompressing only to come under what the game reads", () => {
  const p = small();
  const most9 = p.capacity - HEAD - OTHERS9;
  assert.deepEqual(fit(p, SLOT, most9 + 1), {
    path: RELOCATE,
    recompressed: false,
    size: HEAD + OTHERS + most9 + 1,
    room: LARGEST - (HEAD + OTHERS + most9 + 1),
  });
  const over = LARGEST + 1 - HEAD - OTHERS;
  assert.deepEqual(fit(p, SLOT, over), {
    path: RELOCATE,
    recompressed: true,
    size: HEAD + OTHERS9 + over,
    room: OTHERS - OTHERS9 - 1,
  });
  assert.throws(() => fit(p, SLOT, over + OTHERS - OTHERS9), /more than the game reads/);
});

test("a pack with more sectors than the game reads is rebuilt only within what it reads", () => {
  const p = small(BUFFER + 2048);
  assert.deepEqual(fit(p, SLOT, 401), {
    path: REBUILD,
    recompressed: false,
    size: p.size + 1,
    room: LARGEST - p.size - 1,
  });
  const over = LARGEST + 1 - HEAD - OTHERS;
  assert.deepEqual(fit(p, SLOT, over), {
    path: REBUILD,
    recompressed: true,
    size: HEAD + OTHERS9 + over,
    room: OTHERS - OTHERS9 - 1,
  });
});

test("a slot the pack does not have is refused", () => {
  const p = small();
  for (const slot of [3, -1, 1.5, "1", undefined]) assert.throws(() => fit(p, slot, 1), /slots/);
});

// --- the container read and written, and a fit over a pack read off the image ----

const same = (a, b, name) => assert.deepEqual(Buffer.from(a), Buffer.from(b), name);
const sameAll = (as, bs, name) => {
  assert.equal(as.length, bs.length, name);
  as.forEach((a, i) => same(a, bs[i], name));
};

test("the writer lays the container out as the disc does, and the reader reads it back", () => {
  const names = ["LEVEL 1", "LEVEL 10", "OBJ LEVEL"];
  const streams = [Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5, 6, 7, 8), Uint8Array.of(9)];
  const blob = writePak(names, streams);
  const pak = readPak(blob);
  assert.deepEqual([pak.names, pak.size, blob.length], [names, 81, 81]);
  sameAll(pak.streams, streams);
  const view = new DataView(blob.buffer);
  const table = 4 + 3 * 12;
  assert.deepEqual(
    [0, 1, 2].map((i) => view.getUint32(4 + 3 * 8 + i * 4, true)),
    [table, table + 9, table + 19],
  );
  assert.equal(
    String.fromCharCode(...blob.subarray(table, table + 30)),
    "LEVEL 1\n\0LEVEL 10\n\0OBJ LEVEL\n\0",
  );
  assert.deepEqual(pak.offsets, [72, 75, 80]);
  assert.deepEqual([...blob.subarray(table + 30, 72)], [0, 0]);
});

test("the padding is one to four bytes, and a record starts on a four-byte boundary", () => {
  for (let n = 1; n <= 8; n++) {
    const [first] = readPak(writePak(["X".repeat(n)], [Uint8Array.of(1)])).offsets;
    assert.ok(first - (16 + n + 2) >= 1 && first - (16 + n + 2) <= 4, n);
    assert.equal(first % 4, 0, n);
  }
});

test("a name is ASCII, and one that runs past the pack is refused", () => {
  assert.throws(() => writePak(["\u00c9p\u00e9e"], [Uint8Array.of(1)]), /ASCII/);
  const blob = writePak(["LEVEL 1"], [Uint8Array.of(1)]);
  blob.fill(0x41, 16 + 8, 28);
  assert.throws(() => readPak(blob), /the name of slot 0 runs past the pack/);
});

test("the reader trusts nothing the bytes say about where a record or a name lies", () => {
  assert.equal(SLOTS_MOST, 32);
  const blob = writePak(["LEVEL 1", "LEVEL 2"], [Uint8Array.of(1, 2, 3), Uint8Array.of(4)]);
  const doctored = (at, value) => {
    const out = blob.slice();
    new DataView(out.buffer).setUint32(at, value, true);
    return out;
  };
  assert.throws(() => readPak(blob.subarray(0, 3)), /ends before its count/);
  assert.throws(() => readPak(doctored(0, 0)), /a count of 0 is not a pack's/);
  assert.throws(() => readPak(doctored(0, SLOTS_MOST + 1)), /a count of 33 is not a pack's/);
  assert.throws(() => readPak(doctored(0, 5)), /the table runs past the pack/);
  assert.throws(() => readPak(doctored(4, 4)), /the record of slot 0 lies outside the pack/);
  assert.throws(() => readPak(doctored(8, 0)), /the record of slot 0 lies outside the pack/);
  assert.throws(() => readPak(doctored(8, 5)), /the record of slot 0 lies outside the pack/);
  assert.throws(
    () => readPak(doctored(4 + 2 * 8, blob.length - 1)),
    /the name of slot 0 lies outside the names/,
  );
  assert.throws(() => readPak(doctored(4 + 2 * 8, 0)), /the name of slot 0 lies outside the names/);
  assert.throws(() => readPak(Uint8Array.of(1, 0, 0, 0, 1, 2, 3)), /the table runs past the pack/);
  assert.deepEqual(readPak(blob).names, ["LEVEL 1", "LEVEL 2"]);
});

test("the synthetic image's packs read back as the levels they were written from", () => {
  for (const [path, , blob] of syntheticPacks()) {
    const pak = readPak(blob);
    const finals = path.endsWith("FI.PAK");
    assert.deepEqual(
      pak.names,
      finals ? ["FINAL 1", "FINAL 2"] : ["LEVEL 1", "LEVEL 2", "LEVEL 3"],
    );
    assert.equal(pak.size, blob.length);
    assert.equal(
      packSize(
        pak.names,
        pak.streams.map((s) => s.length),
      ),
      pak.size,
    );
    pak.streams.forEach((s, i) => {
      const n = finals ? i + 4 : i + 1;
      same(inflateSync(s), writeKwl(synthetic(n, `${finals ? "FINAL" : "LEVEL"} ${n}`)), path);
      assert.equal(s[1], finals ? 0x9c : 0x01, path);
      assert.equal(
        pak.offsets[i],
        pak.offsets[0] + pak.streams.slice(0, i).reduce((sum, t) => sum + t.length, 0),
      );
    });
  }
});

test("a title becomes upper-case ASCII no longer than the name it replaces, or leaves it", () => {
  assert.equal(packName("Spiral", "LEVEL 1"), "SPIRAL");
  assert.equal(packName("my great level", "LEVEL 1"), "MY GREA");
  assert.equal(packName("\u00c9p\u00e9e \u00e0 la mode", "LEVEL 10"), "PE  LA M");
  assert.equal(packName("a\tb\nc", "LEVEL 1"), "ABC");
  for (const title of ["", "   ", "\u00e9\u00e9\u00e9", "\n"])
    assert.equal(packName(title, "LEVEL 1"), "LEVEL 1", JSON.stringify(title));
});

// The Python tests' cases over the synthetic world pack, whose records are
// stored at level 1 so that recompression wins room.
const world = readPak(syntheticPacks()[0][2]);
const levels = world.streams.map((s) => new Uint8Array(inflateSync(s)));
const LEVELS = { [IN_PLACE]: 6, [REBUILD]: 30, recompressed: 60, [RELOCATE]: 120 };
const WORLD_SLOT = 1;
const fitted = (
  stream,
  { title = "Spiral", capacity = USER, slot = WORLD_SLOT, known = true } = {},
) => fitPak(world, capacity, slot, stream, title, known ? levels : null);
const withStream = (stream) => world.streams.map((s, i) => (i === WORLD_SLOT ? stream : s));
const base = () => writePak(world.names, withStream(new Uint8Array(0))).length;
const gain = () =>
  [0, 2].reduce((sum, i) => sum + world.streams[i].length - deflate(levels[i], 9).length, 0);

test("a stream no longer than the record goes in place and the name stays", () => {
  const stream = streamOf(synthetic(LEVELS[IN_PLACE]));
  const f = fitted(stream);
  assert.deepEqual(
    [f.path, f.room, f.size, f.recompressed],
    [IN_PLACE, world.streams[WORLD_SLOT].length - stream.length, world.size, false],
  );
  sameAll(f.streams, withStream(stream));
  assert.deepEqual(f.names, world.names);
  const exact = fitted(stored(world.streams[WORLD_SLOT].length));
  assert.deepEqual([exact.path, exact.room], [IN_PLACE, 0]);
});

test("a longer stream rebuilds the pack within its sectors with the others as they are", () => {
  const stream = streamOf(synthetic(LEVELS[REBUILD]));
  const f = fitted(stream);
  assert.deepEqual([f.path, f.recompressed], [REBUILD, false]);
  assert.equal(f.size, writePak(f.names, f.streams).length);
  assert.equal(f.room, USER - f.size);
  sameAll(f.streams, withStream(stream));
  assert.deepEqual(f.names, ["LEVEL 1", "SPIRAL", "LEVEL 3"]);
  assert.deepEqual(fitted(stream, { title: null }).names, world.names);
  assert.equal(fitted(stream, { known: false }).path, REBUILD);
});

test("then with the others recompressed at level 9, from their levels", () => {
  const stream = streamOf(synthetic(LEVELS.recompressed));
  const f = fitted(stream);
  assert.deepEqual([f.path, f.recompressed, f.room], [REBUILD, true, USER - f.size]);
  same(f.streams[WORLD_SLOT], stream);
  for (const i of [0, 2]) {
    same(f.streams[i], deflate(levels[i], 9));
    assert.deepEqual([...f.streams[i].subarray(0, 2)], [0x78, 0xda]);
    assert.ok(f.streams[i].length < world.streams[i].length);
  }
  assert.ok(writePak(f.names, withStream(stream)).length > USER);
  assert.equal(fitted(stream, { known: false }), null);
});

test("and moves the pack when even that does not fit", () => {
  const stream = streamOf(synthetic(LEVELS[RELOCATE]));
  const f = fitted(stream);
  assert.deepEqual([f.path, f.recompressed], [RELOCATE, false]);
  sameAll(f.streams, withStream(stream));
  assert.deepEqual([f.size, f.room], [writePak(f.names, f.streams).length, LARGEST - f.size]);
  assert.ok(f.size > USER);
});

test("a moved pack is recompressed only to come under what the game reads", () => {
  const over = fitted(stored(LARGEST + 1 - base()), { title: null });
  assert.deepEqual(
    [over.path, over.recompressed, over.size],
    [RELOCATE, true, LARGEST + 1 - gain()],
  );
  assert.throws(
    () => fitted(stored(LARGEST + 1 - base() + gain()), { title: null }),
    /more than the game reads/,
  );
});

test("a pack with more sectors than the game reads is rebuilt only within what it reads", () => {
  const stream = streamOf(synthetic(LEVELS[REBUILD]));
  const f = fitted(stream, { capacity: LARGEST + USER });
  assert.deepEqual([f.path, f.room], [REBUILD, LARGEST - f.size]);
  const over = fitted(stored(LARGEST + 1 - base()), { title: null, capacity: LARGEST + USER });
  assert.deepEqual([over.path, over.recompressed], [REBUILD, true]);
});

test("a slot the pack read off the image does not have is refused", () => {
  for (const slot of [3, -1, 1.5]) assert.throws(() => fitted(Uint8Array.of(1), { slot }), /slots/);
});
