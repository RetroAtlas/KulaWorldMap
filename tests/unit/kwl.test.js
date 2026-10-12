import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, levelKey } from "./fixtures.js";
import { deflate } from "../../public/js/deflate.js";
import { SIDE } from "../../public/js/state.js";
import {
  CELLS,
  FACES,
  FIRST_RECORD,
  FORMAT,
  GRID_BYTES,
  HEAD,
  LASER_KIND,
  LINK_WORD,
  NEXT_WORD,
  OWN,
  PLATFORM_KIND,
  RECORD,
  REWIRED,
  SETTINGS_KIND,
  SLOT,
  SWITCH,
  TELEPORTER,
  TRAILER_KIND,
  WORDS,
  compareCells,
  levelOf,
  linkTarget,
  projectOf,
  readKwl,
  writeKwl,
} from "../../public/js/kwl.js";

// The digests the Python writer wrote from the same data, so the two writers
// cannot drift apart without this file saying so.
const { zlib: ZLIB, ...digests } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/kwl-digests.json", import.meta.url)), "utf8"),
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const START = 30;
const EXIT = 7;
const KEY = 31;
const COIN = 37;
const GEM = 36;
const WORLD = "HIRO";
const NOWHERE = [-1, -1, -1];

// --- the byte builders the Python tests use, so the cases read the same ------

const int16 = (words) => {
  const out = new Uint8Array(2 * words.length);
  const view = new DataView(out.buffer);
  words.forEach((w, i) => view.setInt16(2 * i, w, true));
  return out;
};
const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** One face of a block, or a payload slot: kind, type, fields, pad, value, pad. */
const slot = (typ = 0, fields = [], { kind = -1, v = -1 } = {}) => [
  kind,
  typ,
  ...fields,
  ...Array(11 - fields.length).fill(-1),
  -1,
  v,
  -1,
];

/** A 256-byte record standing on cell. faces maps a face to its slot. */
function block(cell, { kind = 0, faces = {}, second = null } = {}) {
  const slots = Array.from({ length: FACES }, () => slot());
  for (const [j, s] of Object.entries(faces)) slots[j] = [...s];
  if (second) slots[1] = [...second];
  slots[0][0] = kind;
  return int16([...slots.flat(), ...Array(WORDS - 3 - SLOT * FACES).fill(-1), ...cell]);
}

/** cells is a Map of "x,y,z" to value; records is a list of 256-byte blocks. */
function level(cells, records, { trailer = null, header = null } = {}) {
  const grid = new Uint8Array(GRID_BYTES);
  const view = new DataView(grid.buffer);
  for (let i = 0; i < CELLS; i++) view.setUint16(2 * i, 0xffff, true);
  for (const [key, v] of cells) {
    const [x, y, z] = key.split(",").map(Number);
    view.setUint16(2 * ((x * SIDE + y) * SIDE + z), v, true);
  }
  const head = new Uint8Array(HEAD);
  const hv = new DataView(head.buffer);
  hv.setInt32(0, header ?? cells.size, true);
  hv.setUint16(4, records.length, true);
  const tail =
    trailer ?? block(NOWHERE, { kind: TRAILER_KIND, faces: { 0: slot(20, [13, 17, -5, 0, 99]) } });
  return join(grid, head, ...records, tail);
}

/** An object as the reader needs it: type, facing, variant and state, the rest unset. */
const obj = (typ, f2 = 0, f3 = 0, f4 = 1) => slot(typ, [f2, f3, f4, -1, -1, -1, 0]);
const trailer = (cell, time) =>
  block(NOWHERE, {
    kind: TRAILER_KIND,
    faces: { 0: slot(cell[0], [cell[1], cell[2], 0, 0, time]) },
  });
const cells = (entries) => new Map(entries.map(([cell, v]) => [cell.join(), v]));

/** A level with one of everything the format carries, its records in lattice order. */
function playground() {
  const at = new Map();
  const records = [];
  const put = (cell, more = {}) => {
    at.set(cell.join(), FIRST_RECORD + records.length);
    records.push(block(cell, more));
  };
  put([10, 10, 17], { faces: { 0: obj(START, 3, 0, 0), 1: obj(COIN, 0, 2), 5: obj(KEY) } });
  put([10, 12, 17], { kind: 6, faces: { 0: slot(1, [5120, 6144, 8704]) } });
  put([10, 14, 17], { kind: 7, faces: { 0: slot(0, [2]) } });
  put([12, 10, 17], { faces: { 0: obj(SWITCH, 0, 1, 2), 2: obj(TELEPORTER, 4, 1, 2) } });
  put([12, 14, 17], {
    faces: { 0: obj(TELEPORTER, 2, 1, 2), 1: obj(53, 4, 0, 0), 3: obj(56, 0, 2, 0) },
  });
  at.set("13,10,17", 2);
  at.set("13,12,17", 3);
  put([14, 10, 17], {
    kind: PLATFORM_KIND,
    faces: { 0: slot(2, [2, 1, 14, 10, 17, 14, 13, 17]) },
    second: slot(2, [30, -1, FIRST_RECORD + 5], { kind: 0 }),
  });
  put([16, 10, 17], {
    kind: LASER_KIND,
    faces: { 0: slot(1, [1, 0, 16, 10, 17, 20, 10, 17]) },
    second: slot(1, [-1, -1, FIRST_RECORD + 6, -1, 1, -1]),
  });
  records.push(block([0, 0, 0], { kind: SETTINGS_KIND, faces: { 0: slot(1, [1]) } }));
  return level(at, records, { trailer: trailer([10, 10, 17], 45) });
}

const PLAYGROUND = {
  format: FORMAT,
  version: 1,
  title: "",
  author: "",
  notes: "",
  world: WORLD,
  time: 45,
  hidden: true,
  invisibleFromAfar: true,
  circuits: { 1: "off" },
  blocks: [
    {
      cell: [10, 10, 17],
      kind: 0,
      faces: {
        0: { type: START, facing: 3 },
        1: { type: COIN, variant: 2 },
        5: { type: KEY },
      },
    },
    { cell: [10, 12, 17], kind: 6 },
    { cell: [10, 14, 17], kind: 7, phase: 2 },
    {
      cell: [12, 10, 17],
      kind: 0,
      faces: {
        0: { type: SWITCH, variant: 1 },
        2: { type: TELEPORTER, facing: 4, variant: 1 },
      },
    },
    {
      cell: [12, 14, 17],
      kind: 0,
      faces: {
        0: { type: TELEPORTER, facing: 2, variant: 1 },
        1: { type: 53, facing: 4 },
        3: { type: 56, variant: 2 },
      },
    },
    { cell: [13, 10, 17], kind: 2 },
    { cell: [13, 12, 17], kind: 3 },
    { cell: [14, 10, 17], kind: PLATFORM_KIND, far: [14, 13, 17], length: 2, speed: 30 },
    { cell: [16, 10, 17], kind: LASER_KIND, far: [20, 10, 17], colour: 1 },
  ],
};

const project = (blocks, more = {}) => ({
  format: FORMAT,
  version: 1,
  title: "t",
  author: "",
  notes: "",
  world: WORLD,
  time: 99,
  hidden: false,
  invisibleFromAfar: false,
  circuits: {},
  blocks,
  ...more,
});
const plain = (cell, kind = 0, faces = null) => (faces ? { cell, kind, faces } : { cell, kind });
const start = (facing = 3) => ({ type: START, facing });

// --- raw words of a written file, where a test is about the bytes -------------

const words = (blob, k) => {
  const view = new DataView(blob.buffer, blob.byteOffset + GRID_BYTES + HEAD + RECORD * k);
  return Array.from({ length: WORDS }, (_, i) => view.getInt16(2 * i, true));
};
const slotOf = (blob, k, j) => words(blob, k).slice(SLOT * j, SLOT * (j + 1));
const count = (blob) => new DataView(blob.buffer, blob.byteOffset + GRID_BYTES).getUint16(4, true);

/** The slots on the list a switch's link starts, each naming the next, as the game walks it. */
function circuit(blob, k, face) {
  const out = [];
  let at = linkTarget(slotOf(blob, k, face)[LINK_WORD]);
  const seen = (a) => out.some((b) => b[0] === a[0] && b[1] === a[1]);
  while (at && !seen(at) && at[0] < count(blob) && at[1] <= OWN) {
    out.push(at);
    const [r, f] = at;
    at = linkTarget(f === OWN ? slotOf(blob, r, 1)[LINK_WORD] : slotOf(blob, r, f)[NEXT_WORD]);
  }
  return out;
}

/** What has to hold of a written file if the game reads it as the parser does. */
function verify(blob) {
  const l = levelOf(blob);
  const bad = [];
  const named = new Set();
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    if (v < FIRST_RECORD) continue;
    const r = l.records[v - FIRST_RECORD];
    if (!r) bad.push(`cell ${x},${y},${z} names record ${v - FIRST_RECORD} of ${l.records.length}`);
    else if (r.x !== x || r.y !== y || r.z !== z)
      bad.push(`cell ${x},${y},${z} names a record elsewhere`);
    named.add(v - FIRST_RECORD);
  }
  l.records.forEach((r, k) => {
    if (r.kind !== SETTINGS_KIND && !named.has(k)) bad.push(`record ${k} is named by no cell`);
    if (r.kind === PLATFORM_KIND || r.kind === LASER_KIND) {
      const ends = [r.f.slice(2, 5), r.f.slice(5, 8)];
      if (!ends.some((e) => e[0] === r.x && e[1] === r.y && e[2] === r.z))
        bad.push(`record ${k} stands at neither end of its span`);
    }
  });
  const tail = words(blob, l.records.length);
  if (tail[0] !== TRAILER_KIND || tail.slice(-3).some((w) => w !== -1)) bad.push("the trailer");
  const colour = new Map();
  l.records.forEach((r, k) => {
    if (r.kind === LASER_KIND) colour.set(`${k},${OWN}`, r.colour);
    for (const o of r.on)
      if (o.type === SWITCH || o.type === TELEPORTER) colour.set(`${k},${o.face}`, o.f[1]);
  });
  for (const [where, c] of colour) {
    const [k, face] = where.split(",").map(Number);
    if (face === OWN) continue;
    const same = [...colour].filter(([, d]) => d === c).map(([w]) => w);
    if (l.records[k].on.find((o) => o.face === face).type === SWITCH) {
      const flips = circuit(blob, k, face).map((a) => a.join());
      if (flips.sort().join(";") !== same.sort().join(";"))
        bad.push(`the switch on record ${k} face ${face} flips ${flips}, not ${same}`);
      continue;
    }
    const to = linkTarget(slotOf(blob, k, face)[LINK_WORD]);
    const target = to && l.records[to[0]]?.on.find((o) => o.face === to[1]);
    if (!to || colour.get(to.join()) !== c || to[1] === OWN || target?.type !== TELEPORTER)
      bad.push(`the teleporter on record ${k} face ${face} sends the ball to ${to}`);
  }
  return bad;
}

const kindAt = (l) => {
  const out = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    const v = l.cells[i + 3];
    const kind = v < FIRST_RECORD ? v : l.records[v - FIRST_RECORD].kind;
    out.set(l.cells.slice(i, i + 3).join(), kind);
  }
  return out;
};

const FACING_TYPES = new Set([5, 28, 29, 30, 50, 51, 52, 53, 56]);
const VARIANT_TYPES = new Set([5, 9, 11, 36, 37, 56]);

/** A level as the game plays it: what the fields the loader reads say, by cell. */
function inPlay(l) {
  const records = new Map();
  for (const r of l.records) {
    if (r.kind === SETTINGS_KIND || (r.kind < FIRST_RECORD && !r.on.length)) continue;
    const d = { kind: r.kind };
    if (r.kind < FIRST_RECORD)
      d.on = r.on
        .map((o) => ({
          face: o.face,
          type: o.type,
          facing: FACING_TYPES.has(o.type) ? o.f[0] : null,
          variant: VARIANT_TYPES.has(o.type) ? o.f[1] : null,
          state: o.f[2],
        }))
        .sort((a, b) => a.face - b.face);
    if (r.kind === PLATFORM_KIND || r.kind === LASER_KIND) {
      d.span = [r.f.slice(2, 5), r.f.slice(5, 8)].sort(compareCells);
    }
    if (r.kind === LASER_KIND) Object.assign(d, { colour: r.colour, lit: r.f[1] === 1 });
    if (r.kind === PLATFORM_KIND) Object.assign(d, { length: r.length, speed: r.speed ?? 30 });
    if (r.kind === 7) d.phase = r.f[0];
    records.set(`${r.x},${r.y},${r.z}`, d);
  }
  const settings = l.records.filter((r) => r.kind === SETTINGS_KIND);
  return {
    kinds: kindAt(l),
    records,
    time: l.time,
    hidden: settings.some((r) => r.type === 1),
    flip: settings.some((r) => r.f[0] === 1),
  };
}

// --- the shipped levels --------------------------------------------------------

test("the writer's bytes and their deflate are the Python writer's, on every shipped level", () => {
  assert.equal(Object.keys(digests).length, mapData.levels.length);
  assert.equal(mapData.levels.length, 230);
  assert.match(ZLIB, /^\d+\.\d+/);
  for (const l of mapData.levels) {
    const want = digests[levelKey(l)];
    assert.ok(want, levelKey(l));
    const bytes = writeKwl(projectOf(l));
    assert.equal(sha256(bytes), want.kwl, l.name);
    const z = deflate(bytes, 6);
    const differs = (level) =>
      `${l.name}: the page's deflate at level ${level} differs from the fixture's, written with zlib ${ZLIB}`;
    assert.equal(sha256(z), want.deflate, differs(6));
    assert.equal(z.length, want.size, differs(6));
    assert.equal(sha256(deflate(bytes, 9)), want.deflate9, differs(9));
  }
});

test("a shipped level's project is a fixed point of writing and reading it back", () => {
  for (const l of mapData.levels) {
    const p = projectOf(l);
    const meta = { name: l.name, shown: l.shown, theme: l.theme, pack: l.pack, index: l.index };
    assert.deepEqual(projectOf(levelOf(writeKwl(p), meta)), p, l.name);
  }
});

test("the level written back keeps everything the game reads of the shipped one", () => {
  for (const l of mapData.levels) {
    const bytes = writeKwl(projectOf(l));
    assert.deepEqual(verify(bytes), [], l.name);
    const c = levelOf(bytes, { name: l.name, theme: l.theme });
    assert.deepEqual(inPlay(c), inPlay(l), l.name);
    assert.equal(c.placed, l.placed, l.name);
    assert.deepEqual([c.min, c.max], [l.min, l.max], l.name);
    assert.equal(c.header, l.placed, l.name);
    assert.equal(bytes.length, GRID_BYTES + HEAD + RECORD * (c.records.length + 1), l.name);
  }
});

test("the settings record goes only where a flag is set, and the file ends in the trailer's empty cell", () => {
  let settings = 0;
  for (const l of mapData.levels) {
    const p = projectOf(l);
    const bytes = writeKwl(p);
    const c = levelOf(bytes);
    const last = c.records[c.records.length - 1];
    assert.equal(last?.kind === SETTINGS_KIND, p.hidden || p.invisibleFromAfar, l.name);
    if (last?.kind === SETTINGS_KIND) {
      settings++;
      assert.deepEqual([last.type, last.f[0]], [p.hidden ? 1 : 0, p.invisibleFromAfar ? 1 : 0]);
      assert.deepEqual([last.x, last.y, last.z], [0, 0, 0]);
    }
    assert.deepEqual([...bytes.slice(-6)], Array(6).fill(0xff), l.name);
  }
  assert.equal(settings, 16);
});

// --- the playground, with one of everything --------------------------------------

test("a level read from its bytes is written back to bytes that read the same", () => {
  const p = projectOf(levelOf(playground(), { theme: WORLD }));
  assert.deepEqual(p, PLAYGROUND);
  const out = writeKwl(p);
  const c = levelOf(out, { theme: WORLD });
  assert.deepEqual(verify(out), []);
  assert.deepEqual(projectOf(c), p);
  assert.deepEqual([c.header, c.records.length], [9, 8]);
  assert.equal(c.records[7].kind, SETTINGS_KIND);
  assert.deepEqual(words(out, 7).slice(0, 4), [SETTINGS_KIND, 1, 1, 0]);
  assert.deepEqual([c.records[7].x, c.records[7].y, c.records[7].z], [0, 0, 0]);
  assert.deepEqual(words(out, 8).slice(0, 7), [TRAILER_KIND, 10, 10, 17, 0, 0, 45]);
  assert.deepEqual([...out.slice(-6)], Array(6).fill(0xff));
  const wandering = c.records[4].on.find((o) => o.face === 1);
  const corkscrew = c.records[4].on.find((o) => o.face === 3);
  assert.deepEqual([wandering.f[0], corkscrew.f[0]], [4, 0]);
});

test("the writer derives what the file never stores", () => {
  const out = writeKwl(PLAYGROUND);
  assert.deepEqual(
    [0, 1, 5].map((j) => slotOf(out, 0, j)[5]),
    [-1, 0, 1],
  );
  assert.deepEqual([slotOf(out, 3, 0)[4], slotOf(out, 6, 0)[3]], [2, 0]);
  assert.deepEqual(slotOf(out, 6, 0).slice(1, 4), [1, 1, 0]);
  assert.deepEqual(slotOf(out, 5, 0).slice(1, 10), [2, 2, 1, 14, 10, 17, 14, 13, 17]);
  assert.deepEqual(slotOf(out, 5, 1).slice(0, 5), [0, 2, 30, -1, FIRST_RECORD + 5]);
  assert.deepEqual(words(out, 5).slice(119, 125), [14 * 512, 10 * 512, 17 * 512, 256, 256, 256]);
  assert.deepEqual(slotOf(out, 1, 0).slice(0, 5), [6, 1, 10 * 512, 12 * 512, 17 * 512]);
  assert.deepEqual(slotOf(out, 2, 0).slice(0, 3), [7, 0, 2]);
  assert.deepEqual(slotOf(out, 3, 1), [-1, 0, -1, -1, 0, -1, -1, -1, 0, ...Array(7).fill(-1)]);
  assert.deepEqual(slotOf(out, 1, 1), Array(16).fill(-1));
  assert.deepEqual(slotOf(out, 5, 2), Array(16).fill(-1));
});

test("the settings record goes only where a flag is set", () => {
  const p = project(PLAYGROUND.blocks, { circuits: { 1: "off" } });
  const c = levelOf(writeKwl(p));
  assert.equal(c.records.length, 7);
  assert.ok(!c.records.some((r) => r.kind === SETTINGS_KIND));
  assert.equal(levelOf(writeKwl({ ...p, hidden: true })).records.length, 8);
  assert.equal(levelOf(writeKwl({ ...p, invisibleFromAfar: true })).records.length, 8);
});

test("the bytes are undefined for what the lattice cannot hold", () => {
  assert.throws(
    () => writeKwl(project([plain([34, 5, 5], 0, { 0: start() })])),
    /outside the lattice/,
  );
  assert.throws(
    () => writeKwl(project([plain([5, 5, 5], 0, { 0: start() }), plain([5, 5, 5])])),
    /two blocks on cell 5,5,5/,
  );
  assert.throws(
    () =>
      writeKwl(
        project([
          plain([5, 5, 5], 0, { 0: start() }),
          { cell: [6, 6, 6], kind: LASER_KIND, far: [8, 8, 6], colour: 0 },
        ]),
      ),
    /no one axis/,
  );
  assert.throws(
    () =>
      writeKwl(
        project([
          plain([5, 5, 5], 0, { 0: start(), 2: { type: TELEPORTER, facing: 1, variant: 7 } }),
        ]),
      ),
    /not one of the four/,
  );
  assert.throws(() => writeKwl(project([plain([5, 5, 5], 12)])), /kind 12 is not a kind of block/);
  assert.throws(
    () => writeKwl(project([plain([5, 5], 0, { 0: start() })])),
    /cell 5,5 is outside the lattice/,
  );
  for (const key of ["top", " 5", "+5"])
    assert.throws(
      () => writeKwl(project([plain([5, 5, 5], 0, { 0: start(), [key]: { type: COIN } })])),
      new RegExp(`face "${key.replace("+", "\\+")}" is not one of the six`),
    );
  assert.throws(
    () => writeKwl(project([plain([5, 5, 5], 0, { 0: start(), 7: { type: COIN } })])),
    /face 7 is not one of the six/,
  );
  for (const far of [undefined, [6, 9]])
    assert.throws(
      () =>
        writeKwl(
          project([
            plain([5, 5, 5], 0, { 0: start() }),
            { cell: [6, 6, 6], kind: LASER_KIND, far, colour: 0 },
          ]),
        ),
      /the span at 6,6,6 needs a far end/,
    );
  assert.throws(
    () =>
      writeKwl(
        project([
          plain([5, 5, 5], 0, { 0: start() }),
          { cell: [6, 6, 6], kind: LASER_KIND, far: [6, 6, 34], colour: 0 },
        ]),
      ),
    /the far end 6,6,34 of the span at 6,6,6 is outside the lattice/,
  );
  assert.throws(
    () =>
      writeKwl(
        project([
          plain([5, 5, 5], 0, { 0: start() }),
          { cell: [6, 6, 6], kind: PLATFORM_KIND, far: [6, -1, 6] },
        ]),
      ),
    /the far end 6,-1,6 of the span at 6,6,6 is outside the lattice/,
  );
  // a key that stands nothing is no face at all, whatever it is called
  assert.deepEqual(
    writeKwl(
      project([
        plain([5, 5, 5], 0, { 0: start() }),
        plain([6, 6, 6], 0, { top: { type: 0 }, x: null }),
      ]),
    ),
    writeKwl(project([plain([5, 5, 5], 0, { 0: start() }), plain([6, 6, 6])])),
  );
  assert.throws(
    () =>
      writeKwl(
        project([plain([5, 5, 5], 0, { 0: start(), 5: { type: COIN }, "05": { type: KEY } })]),
      ),
    /face 5 of the block at 5,5,5 is named twice/,
  );
  assert.throws(
    () => writeKwl(project([plain([5, 5, 5], 0, { 0: start() })], { time: 100000 })),
    /a time of 100000 is outside the file's range/,
  );
  assert.throws(
    () =>
      writeKwl(project([plain([5, 5, 5], 0, { 0: start(), 1: { type: COIN, variant: 70000 } })])),
    /a word of the block at 5,5,5 is outside the file's range/,
  );
  assert.doesNotThrow(() => writeKwl(project([plain([0, 0, 0]), plain([33, 33, 33])])));
});

test("a face key names its face by number, however it is spelled", () => {
  const teleporter = { type: TELEPORTER, facing: 1, variant: 0 };
  const spelled = project([plain([5, 5, 5], 0, { "00": start(), "05": teleporter })]);
  const plainly = project([plain([5, 5, 5], 0, { 0: start(), 5: teleporter })]);
  assert.deepEqual(writeKwl(spelled), writeKwl(plainly));
});

// --- links and numbers -----------------------------------------------------------

test("a colour's members each name the one before, every switch starts at the last, and the teleporters ring", () => {
  const blob = writeKwl(
    project([
      plain([10, 10, 17], 0, {
        0: { type: SWITCH, variant: 2 },
        3: { type: TELEPORTER, facing: 1, variant: 2 },
      }),
      plain([10, 12, 17], 0, { 0: { type: TELEPORTER, facing: 1, variant: 2 } }),
      { cell: [12, 10, 17], kind: LASER_KIND, far: [12, 10, 13], colour: 2 },
      plain([14, 10, 17], 0, {
        0: { type: SWITCH, variant: 2 },
        5: { type: TELEPORTER, facing: 2, variant: 2 },
      }),
      plain([16, 10, 17], 0, { 0: start() }),
    ]),
  );
  assert.deepEqual(verify(blob), []);
  const next = (k, f) => slotOf(blob, k, f)[NEXT_WORD];
  const to = (k, f) => slotOf(blob, k, f)[LINK_WORD];
  assert.deepEqual(
    [next(0, 0), next(0, 3), next(1, 0), slotOf(blob, 2, 1)[LINK_WORD], next(3, 0), next(3, 5)],
    [-1, 0, 3, 16, 38, 48],
  );
  assert.deepEqual([to(0, 0), to(3, 0)], [53, 53]);
  assert.deepEqual([to(0, 3), to(1, 0), to(3, 5)], [53, 3, 16]);
  assert.deepEqual(circuit(blob, 0, 0), [
    [3, 5],
    [3, 0],
    [2, OWN],
    [1, 0],
    [0, 3],
    [0, 0],
  ]);
  assert.deepEqual(circuit(blob, 3, 0), circuit(blob, 0, 0));
});

test("a lone teleporter names itself, and a colour without a switch starts on", () => {
  const blob = writeKwl(
    project([
      plain([10, 10, 17], 0, { 0: start(), 2: { type: TELEPORTER, facing: 1, variant: 3 } }),
    ]),
  );
  assert.equal(slotOf(blob, 0, 2)[LINK_WORD], 2);
  assert.equal(slotOf(blob, 0, 2)[4], 1);
  assert.deepEqual(verify(blob), []);
});

test("pickups are numbered in record then face order, and nothing else is", () => {
  const c = levelOf(
    writeKwl(
      project([
        plain([10, 10, 17], 0, { 0: start(), 2: { type: GEM, variant: 1 }, 5: { type: KEY } }),
        plain([10, 12, 17], 0, { 1: { type: EXIT }, 3: { type: COIN, variant: 0 } }),
        plain([12, 10, 17], 0, { 0: { type: 46 } }),
      ]),
    ),
  );
  const f5 = c.records.flatMap((r, k) => r.on.map((o) => [k, o.face, o.f[3]]));
  assert.deepEqual(f5, [
    [0, 0, -1],
    [0, 2, 0],
    [0, 5, 1],
    [1, 1, -1],
    [1, 3, 2],
    [2, 0, 3],
  ]);
});

// --- the importer's policy -------------------------------------------------------

test("a trailerless file gets the default time", () => {
  const { project: p, report } = readKwl(playground().slice(0, -RECORD), WORLD);
  assert.equal(p.time, 99);
  assert.deepEqual(p.blocks, PLAYGROUND.blocks);
  assert.ok(
    report.some((line) => line.includes("no trailer")),
    report,
  );
});

test("a reversed laser pair reads lower end first", () => {
  const beam = slot(4, [1, 1, 20, 10, 17, 16, 10, 17]);
  const blob = level(cells([[[16, 10, 17], FIRST_RECORD]]), [
    block([16, 10, 17], {
      kind: LASER_KIND,
      faces: { 0: beam },
      second: slot(1, [-1, -1, 5, -1, 0, -1]),
    }),
  ]);
  const { project: p } = readKwl(blob);
  assert.deepEqual(p.blocks, [
    { cell: [16, 10, 17], kind: LASER_KIND, far: [20, 10, 17], colour: 0 },
  ]);
  assert.deepEqual(slotOf(writeKwl(p), 0, 0).slice(1, 10), [1, 1, 1, 16, 10, 17, 20, 10, 17]);
});

test("a span whose block is at neither end is moved onto its cell", () => {
  const beam = slot(1, [1, 1, 20, 10, 17, 24, 10, 17]);
  const blob = level(cells([[[16, 10, 17], FIRST_RECORD]]), [
    block([16, 10, 17], {
      kind: LASER_KIND,
      faces: { 0: beam },
      second: slot(1, [-1, -1, 5, -1, 0, -1]),
    }),
  ]);
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks[0].far, [24, 10, 17]);
  assert.ok(
    report.some((line) => line.includes("lower end is now its cell")),
    report,
  );
});

test("a span to nowhere or to its own cell is dropped", () => {
  const laser = (far) =>
    block([16, 10, 17], {
      kind: LASER_KIND,
      faces: { 0: slot(1, [1, 1, 16, 10, 17, ...far]) },
      second: slot(1, [-1, -1, 5, -1, 0, -1]),
    });
  for (const [far, text] of [
    [[16, 10, 17], "record 1 spans nothing: both of its ends are its own cell 16,10,17"],
    [[16, 10, 34], "record 1 spans to 16,10,34, outside the lattice"],
    [[16, 10, -5], "record 1 spans to 16,10,-5, outside the lattice"],
    [[16, 10, 32767], "record 1 spans to 16,10,32767, outside the lattice"],
  ]) {
    const blob = level(
      cells([
        [[5, 5, 5], FIRST_RECORD],
        [[16, 10, 17], FIRST_RECORD + 1],
      ]),
      [block([5, 5, 5], { faces: { 0: obj(START, 3, 0, 0) } }), laser(far)],
    );
    const { project: p, report } = readKwl(blob);
    assert.deepEqual(
      p.blocks.map((b) => b.cell),
      [[5, 5, 5]],
      String(far),
    );
    assert.ok(
      report.some(
        (line) => line.startsWith(text) && line.endsWith("it is dropped and its cell left empty"),
      ),
      report,
    );
    assert.deepEqual(verify(writeKwl(p)), []);
  }
});

test("a facing of 0 on a type that needs one is read as 1, the way the game heads", () => {
  const blob = level(cells([[[1, 2, 3], FIRST_RECORD]]), [
    block([1, 2, 3], {
      faces: { 0: obj(START, 0, 0, 0), 2: obj(TELEPORTER, 0, 1, 1), 3: obj(53, 0, 0, 0) },
    }),
  ]);
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks[0].faces, {
    0: { type: START, facing: 1 },
    2: { type: TELEPORTER, facing: 1, variant: 1 },
    3: { type: 53 },
  });
  assert.deepEqual(report, [
    "type 30 on face 0 of the block at 1,2,3 has a facing of 0, which the game heads as 1; it is 1",
    "type 5 on face 2 of the block at 1,2,3 has a facing of 0, which the game heads as 1; it is 1",
    REWIRED,
  ]);
  assert.deepEqual(verify(writeKwl(p)), []);
});

test("the lattice decides where a record stands", () => {
  const blob = level(cells([[[1, 2, 3], FIRST_RECORD]]), [
    block([4, 5, 6], { faces: { 0: obj(START, 3, 0, 0) } }),
  ]);
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks[0].cell, [1, 2, 3]);
  assert.ok(
    report.some((line) => line.includes("the lattice puts it at 1,2,3")),
    report,
  );
  assert.deepEqual(verify(writeKwl(p)), []);
});

test("a record no cell names is dropped, and a cell naming nothing is emptied", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[7, 7, 7], FIRST_RECORD + 5],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
      block([4, 5, 6], { faces: { 0: obj(COIN, 0, 1) } }),
    ],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(
    p.blocks.map((b) => b.cell),
    [[1, 2, 3]],
  );
  assert.ok(
    report.some((l) => l.includes("record 1 of kind 0 at 4,5,6 is named by no cell")),
    report,
  );
  assert.ok(
    report.some((l) => l.includes("cell 7,7,7 names record 5, which is not a block")),
    report,
  );
});

test("an unwired teleporter is wired on the way out", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[1, 4, 3], FIRST_RECORD + 1],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0), 2: obj(TELEPORTER, 1, 3, 1) } }),
      block([1, 4, 3], { faces: { 0: obj(TELEPORTER, 1, 3, 1) } }),
    ],
  );
  assert.ok(verify(blob).length > 0);
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(report, [REWIRED]);
  const out = writeKwl(p);
  assert.deepEqual(verify(out), []);
  assert.deepEqual([slotOf(out, 0, 2)[LINK_WORD], slotOf(out, 1, 0)[LINK_WORD]], [16, 2]);
  assert.deepEqual(readKwl(out).report, []);
  for (const l of mapData.levels.filter((l) => l.theme === "HIRO"))
    assert.deepEqual(readKwl(writeKwl(projectOf(l))).report, [], l.name);
  // a next word nothing walks, on a colour with no switch, is no difference in play
  const unwalked = new Uint8Array(out);
  const view = new DataView(unwalked.buffer);
  view.setInt16(GRID_BYTES + HEAD + RECORD + 2 * NEXT_WORD, -1, true);
  assert.deepEqual(readKwl(unwalked).report, []);
});

test("a count one too high is read from the length", () => {
  const blob = new Uint8Array(playground());
  new DataView(blob.buffer).setUint16(GRID_BYTES + 4, 9, true);
  assert.throws(() => levelOf(blob), /expected/);
  const { project: p, report } = readKwl(blob, WORLD);
  assert.deepEqual(p, PLAYGROUND);
  assert.ok(report.includes("the header counts 9 records and the file holds 8"), report);
});

test("several settings records give the flags of all of them, wherever they stand", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[1, 4, 3], FIRST_RECORD + 2],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
      block([0, 0, 0], { kind: SETTINGS_KIND, faces: { 0: slot(1) } }),
      block([1, 4, 3], { faces: { 0: obj(COIN, 0, 1) } }),
      block([0, 0, 0], { kind: SETTINGS_KIND, faces: { 0: slot(0, [1]) } }),
    ],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual([p.hidden, p.invisibleFromAfar], [true, true]);
  assert.ok(report.includes("2 settings records; the flags of all of them are taken"), report);
  const out = levelOf(writeKwl(p));
  assert.equal(out.records.filter((r) => r.kind === SETTINGS_KIND).length, 1);
  assert.equal(out.records[out.records.length - 1].kind, SETTINGS_KIND);
});

test("a cell naming a record another cell already names is left empty, and a bare record folds", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[1, 4, 3], FIRST_RECORD],
      [[1, 6, 3], FIRST_RECORD + 1],
    ]),
    [block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }), block([1, 6, 3], { kind: 2 })],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks, [
    { cell: [1, 2, 3], kind: 0, faces: { 0: start() } },
    { cell: [1, 6, 3], kind: 2 },
  ]);
  assert.ok(
    report.includes(
      "cell 1,4,3 names record 0, which cell 1,2,3 already names; the cell is left empty",
    ),
    report,
  );
  assert.ok(report.includes("folded 1 records carrying nothing into plain blocks"), report);
});

test("a platform's length and speed and a vanishing block's phase are kept and reported", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[5, 2, 3], FIRST_RECORD + 1],
      [[9, 2, 3], FIRST_RECORD + 2],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
      block([5, 2, 3], {
        kind: PLATFORM_KIND,
        faces: { 0: slot(2, [2, 1, 5, 2, 3, 5, 6, 3]) },
        second: slot(4, [20, -1, FIRST_RECORD + 1], { kind: 0 }),
      }),
      block([9, 2, 3], { kind: 7, faces: { 0: slot(0, [4]) } }),
    ],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks[1], {
    cell: [5, 2, 3],
    kind: PLATFORM_KIND,
    far: [5, 6, 3],
    length: 4,
    speed: 20,
  });
  assert.deepEqual(p.blocks[2], { cell: [9, 2, 3], kind: 7, phase: 4 });
  assert.ok(report.includes("the platform at 5,2,3 is 4 blocks long"), report);
  assert.ok(report.includes("the platform at 5,2,3 runs at 20"), report);
  assert.ok(
    report.includes("the vanishing block at 9,2,3 has phase 4, which dims at once"),
    report,
  );
});

test("a platform's length the lattice cannot hold is cut to what it holds, and the writer refuses it", () => {
  const platform = (length) =>
    level(
      cells([
        [[1, 2, 3], FIRST_RECORD],
        [[5, 2, 3], FIRST_RECORD + 1],
      ]),
      [
        block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
        block([5, 2, 3], {
          kind: PLATFORM_KIND,
          faces: { 0: slot(2, [2, 1, 5, 2, 3, 5, 6, 3]) },
          second: slot(length, [30, -1, FIRST_RECORD + 1], { kind: 0 }),
        }),
      ],
    );
  for (const [length, held] of [
    [32767, 28],
    [29, 28],
    [0, 1],
    [-32768, 1],
  ]) {
    const { project: p, report } = readKwl(platform(length));
    assert.equal(p.blocks[1].length, held, String(length));
    assert.deepEqual(report, [
      `the platform at 5,2,3 is ${length} blocks long, which the lattice cannot hold; it is ${held}`,
    ]);
    assert.deepEqual(verify(writeKwl(p)), []);
    assert.throws(
      () => writeKwl({ ...p, blocks: p.blocks.with(1, { ...p.blocks[1], length }) }),
      (e) =>
        e.message ===
        `the platform at 5,2,3 is ${length} blocks long, which the lattice cannot hold`,
      String(length),
    );
  }
  const { project: p, report } = readKwl(platform(28));
  assert.equal(p.blocks[1].length, 28);
  assert.deepEqual(report, ["the platform at 5,2,3 is 28 blocks long"]);
});

test("a switch whose list loops back on itself reads, and is rewired on the way out", () => {
  const cycle = [1, 2, 3];
  const blob = level(cells([[cycle, FIRST_RECORD]]), [
    block(cycle, {
      faces: {
        0: obj(START, 3, 0, 0),
        2: slot(SWITCH, [0, 1, 1, -1, 2, 2, 0]),
        3: slot(TELEPORTER, [1, 1, 1, -1, 3, 3, 0]),
      },
    }),
  ]);
  assert.deepEqual(circuit(blob, 0, 2), [[0, 2]]);
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(Object.keys(p.blocks[0].faces), ["0", "2", "3"]);
  assert.ok(report.includes(REWIRED), report);
  const out = writeKwl(p);
  assert.deepEqual(verify(out), []);
  assert.deepEqual(circuit(out, 0, 2), [
    [0, 3],
    [0, 2],
  ]);
});

test("records out of lattice order are reported where the order decides play", () => {
  const at = cells([
    [[5, 5, 5], FIRST_RECORD],
    [[3, 3, 3], FIRST_RECORD + 1],
  ]);
  const twoStarts = [
    block([5, 5, 5], { faces: { 0: obj(START, 3, 0, 0) } }),
    block([3, 3, 3], { faces: { 0: obj(START, 1, 0, 0) } }),
  ];
  const { project: p, report } = readKwl(level(at, twoStarts));
  assert.ok(
    report.some((l) => l.includes("not in lattice order")),
    report,
  );
  assert.deepEqual(
    p.blocks.map((b) => b.cell),
    [
      [3, 3, 3],
      [5, 5, 5],
    ],
  );
  const oneStart = [
    block([5, 5, 5], { faces: { 0: obj(START, 3, 0, 0) } }),
    block([3, 3, 3], { faces: { 0: obj(COIN, 0, 1) } }),
  ];
  assert.ok(!readKwl(level(at, oneStart)).report.some((l) => l.includes("lattice order")));
  const captive = [
    block([5, 5, 5], { faces: { 0: obj(START, 3, 0, 0) } }),
    block([3, 3, 3], { faces: { 0: obj(53, 0, 0, 0) } }),
  ];
  assert.ok(readKwl(level(at, captive)).report.some((l) => l.includes("not in lattice order")));
});

test("what stands on the kinds the game never walks is counted and left out", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[1, 4, 3], FIRST_RECORD + 1],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
      block([1, 4, 3], {
        kind: 6,
        faces: { 0: slot(1, [512, 2048, 1536]), 2: obj(COIN, 0, 1), 5: obj(KEY) },
      }),
    ],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.blocks[1], { cell: [1, 4, 3], kind: 6 });
  assert.ok(report.includes("left out 2 objects standing on records the game never walks"), report);
  assert.deepEqual(levelOf(blob).records[1].on, []);
  const flagged = level(cells([[[1, 2, 3], FIRST_RECORD]]), [
    block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0) } }),
    block([0, 0, 0], { kind: SETTINGS_KIND, faces: { 0: slot(1), 2: obj(COIN, 0, 1) } }),
  ]);
  const read = readKwl(flagged);
  assert.deepEqual([read.project.hidden, read.project.invisibleFromAfar], [true, false]);
  assert.ok(
    read.report.includes("left out 1 objects standing on records the game never walks"),
    read.report,
  );
});

test("a colour whose devices disagree takes its first device's state, and says so", () => {
  const blob = level(
    cells([
      [[1, 2, 3], FIRST_RECORD],
      [[1, 4, 3], FIRST_RECORD + 1],
    ]),
    [
      block([1, 2, 3], { faces: { 0: obj(START, 3, 0, 0), 2: obj(SWITCH, 0, 2, 2) } }),
      block([1, 4, 3], { faces: { 0: obj(TELEPORTER, 1, 2, 1) } }),
    ],
  );
  const { project: p, report } = readKwl(blob);
  assert.deepEqual(p.circuits, { 2: "off" });
  assert.ok(
    report.some((l) => l.startsWith("colour 2 starts on for some")),
    report,
  );
});

test("only a length that is not a level is refused", () => {
  assert.throws(() => readKwl(playground().slice(0, -1)), /is not a level/);
  assert.throws(() => readKwl(new Uint8Array(100).fill(0xff)), /is not a level/);
  const { project: p, report } = readKwl(playground().slice(0, GRID_BYTES + HEAD));
  assert.deepEqual(
    p.blocks.map((b) => b.kind),
    [2, 3],
  );
  assert.equal(p.time, 99);
  assert.equal(report.filter((l) => l.includes("is not a block")).length, 3);
  assert.ok(report.includes("4 more lines like the one above"), report);
  assert.throws(() => levelOf(new Uint8Array(100)), /too short/);
});

test("lines of one shape are kept to three and the rest counted, in place", () => {
  const at = new Map();
  for (let x = 1; x < 33; x++)
    for (let y = 1; y < 33; y++) at.set([x, y, 17].join(), FIRST_RECORD + 1);
  at.set("5,5,5", FIRST_RECORD);
  at.set("1,1,1", FIRST_RECORD + 1);
  const { project: p, report } = readKwl(
    level(at, [block([5, 5, 5], { faces: { 0: obj(START, 3, 0, 0) } })]),
  );
  assert.deepEqual(
    p.blocks.map((b) => b.cell),
    [[5, 5, 5]],
  );
  assert.deepEqual(report, [
    "cell 1,1,1 names record 1, which is not a block; the cell is left empty",
    "cell 1,1,17 names record 1, which is not a block; the cell is left empty",
    "cell 1,2,17 names record 1, which is not a block; the cell is left empty",
    "1022 more lines like the one above",
  ]);
});

test("a level file's name, world, pack and index come from the caller alone", () => {
  const bytes = writeKwl(PLAYGROUND);
  const bare = levelOf(bytes);
  assert.deepEqual(
    [bare.name, bare.theme, "pack" in bare, "draft" in bare],
    ["", "", false, false],
  );
  const draft = levelOf(bytes, {
    name: "Spiral",
    theme: "HAZE",
    pack: "/DRAFT/DRAFT.PAK",
    index: 7,
    draft: 7,
  });
  assert.deepEqual(
    [draft.name, draft.theme, draft.pack, draft.index, draft.draft],
    ["Spiral", "HAZE", "/DRAFT/DRAFT.PAK", 7, 7],
  );
  assert.deepEqual([draft.placed, draft.header, draft.time], [9, 9, 45]);
  assert.deepEqual(
    [draft.min, draft.max],
    [
      [10, 10, 17],
      [16, 14, 17],
    ],
  );
  assert.equal(draft.records.find((r) => r.kind === PLATFORM_KIND).speed, 30);
});
