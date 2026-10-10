import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, packs, levelKey } from "./fixtures.js";
import {
  BUFFER,
  IN_PLACE,
  LARGEST,
  REBUILD,
  RELOCATE,
  fit,
  packSize,
} from "../../public/js/pak.js";

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
    ["SIMON 4", 2, false],
    ["LEVEL 33", 1, true],
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
