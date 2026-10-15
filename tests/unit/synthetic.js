// The Python tests' synthetic image, built here from the page's own writers:
// the volume descriptor, the root and one world's directory, SYSTEM.CNF, two
// one-sector packs of small levels, the world pack's at level 1 so that
// recompression wins room, a /3.00 of zero sectors and a postgap. The fixture
// holds its digest, so the two builders cannot drift apart.
import {
  CELLS,
  FORMAT,
  GRID_BYTES,
  HEAD,
  RECORD,
  SLOT,
  VERSION,
  WORDS,
  writeKwl,
} from "../../public/js/format/kwl.js";
import { SIDE } from "../../public/js/format/lattice.js";
import { deflate } from "../../public/js/format/deflate.js";
import { writePak } from "../../public/js/format/pak.js";
import { record } from "../../public/js/format/iso.js";
import { DATA_SUBMODE, EOF_SUBMODE, USER, sector } from "../../public/js/format/sectors.js";
import { BOOT, SYSTEM_ID } from "../../public/js/format/patch.js";

export const ROOT_AT = 22;
export const CNF_AT = 23;
export const WORLD_AT = 24;
export const PACK_AT = 25;
export const FINALS_AT = 26;
export const ROOM_AT = 27;
export const ROOM_SECTORS = 12;
export const POSTGAP = 4;
export const SYNTHETIC_SECTORS = ROOM_AT + ROOM_SECTORS + POSTGAP;
export const SYNTHETIC_PACK = "/HIRO/HIRO.PAK";
export const SYNTHETIC_FINALS = "/HIRO/HIROFI.PAK";
export const WORLD = "HIRO";
const PVD_AT = 16;
const PICKUPS = [37, 36, 31, 32, 33, 34, 35, 38];
const SIDES = [10, 12, 1, 2, 8];

export const bytesOf = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
export const CNF = bytesOf(`${BOOT}\r\nTCB = 4\r\nEVENT = 16\r\nSTACK = 0X801FFF00\r\n`);

/**
 * A project of n blocks scattered through the lattice, the first carrying the
 * start, with pickups and paint cycling over the faces, so that its stream
 * grows with n.
 */
export function synthetic(n, title = "Spiral") {
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const cell = [1 + ((i * 7) % 32), 1 + ((i * 5) % 31), 1 + ((i * 3) % 29)];
    const faces =
      i === 0 ? { 0: { type: 30, facing: 1 } } : { 0: { type: PICKUPS[i % PICKUPS.length] } };
    if (faces[0].type === 36 || faces[0].type === 37) faces[0].variant = i % 3;
    if (i % 2) faces[1] = { type: SIDES[i % SIDES.length] };
    blocks.push({ cell, kind: i === 0 ? 0 : i % 3, faces });
  }
  return {
    format: FORMAT,
    version: VERSION,
    title,
    author: "",
    notes: "",
    world: WORLD,
    time: 99,
    hidden: false,
    invisibleFromAfar: false,
    circuits: {},
    blocks,
  };
}

export const streamOf = (project, level = 6) => deflate(writeKwl(project), level);

const BARE = [-1, 0, -1, -1, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
// A switch of colour 1 whose list head is record 0, its own; a start; a
// teleporter of colour 1 wired to nothing.
const COMMUNITY = [
  [
    [10, 10, 10],
    [0, 9, 0, 1, 1, -1, -1, 0, 0, 256, 0, -1, -1, -1, 0, -1],
  ],
  [
    [11, 10, 10],
    [0, 30, 1, 0, 0, -1, -1, -1, 0, 256, 0, -1, -1, -1, 0, -1],
  ],
  [
    [12, 10, 10],
    [0, 5, 1, 1, 1, -1, -1, -1, 0, 256, 1, -1, -1, -1, 30, -1],
  ],
];

/** A level file as the community's tools leave one: no trailer, the links as they stand. */
export function community() {
  const out = new Uint8Array(GRID_BYTES + HEAD + RECORD * COMMUNITY.length);
  const view = new DataView(out.buffer);
  for (let i = 0; i < CELLS; i++) view.setUint16(2 * i, 0xffff, true);
  COMMUNITY.forEach(([cell, top], k) => {
    view.setUint16(2 * ((cell[0] * SIDE + cell[1]) * SIDE + cell[2]), 5 + k, true);
    const words = [
      ...top,
      ...Array(5).fill(BARE).flat(),
      ...Array(WORDS - 6 * SLOT - 3).fill(-1),
      ...cell,
    ];
    words.forEach((w, i) => view.setInt16(GRID_BYTES + HEAD + RECORD * k + 2 * i, w, true));
  });
  view.setInt32(GRID_BYTES, COMMUNITY.length, true);
  view.setUint16(GRID_BYTES + 4, COMMUNITY.length, true);
  return out;
}

/** So many bytes from a seed, the same in every run and every language. */
export function noise(seed, n = USER) {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out[i] = (x >>> 16) & 0xff;
  }
  return out;
}

/** A zlib stream of exactly n bytes, holding noise in stored blocks. */
export const stored = (n) => deflate(noise(3, n - 11), 0);

/** The two packs of the synthetic image, as [path, sector, bytes]. */
export function syntheticPacks() {
  const world = writePak(
    ["LEVEL 1", "LEVEL 2", "LEVEL 3"],
    [1, 2, 3].map((n) => streamOf(synthetic(n, `LEVEL ${n}`), 1)),
  );
  const finals = writePak(
    ["FINAL 1", "FINAL 2"],
    [4, 5].map((n) => streamOf(synthetic(n, `FINAL ${n}`))),
  );
  return [
    [SYNTHETIC_PACK, PACK_AT, world],
    [SYNTHETIC_FINALS, FINALS_AT, finals],
  ];
}

const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const padded = (bytes) => {
  const out = new Uint8Array(USER);
  out.set(bytes);
  return out;
};

/** The whole image, every sector built whole. */
export function syntheticImage() {
  const packs = syntheticPacks();
  const pvd = new Uint8Array(USER);
  const view = new DataView(pvd.buffer);
  pvd[0] = 1;
  pvd.set(bytesOf("CD001"), 1);
  pvd[6] = 1;
  pvd.set(bytesOf(SYSTEM_ID.padEnd(32)), 8);
  pvd.set(bytesOf(" ".repeat(32)), 40);
  view.setUint32(80, SYNTHETIC_SECTORS, true);
  view.setUint32(84, SYNTHETIC_SECTORS, false);
  view.setUint16(120, 1, true);
  view.setUint16(122, 1, false);
  view.setUint16(124, 1, true);
  view.setUint16(126, 1, false);
  view.setUint16(128, USER, true);
  view.setUint16(130, USER, false);
  pvd.set(record("\0", ROOT_AT, USER, 2), 156);
  const terminator = new Uint8Array(USER);
  terminator[0] = 255;
  terminator.set(bytesOf("CD001"), 1);
  terminator[6] = 1;
  const root = concat([
    record("\0", ROOT_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    record("3.00;1", ROOM_AT, ROOM_SECTORS * USER),
    record("HIRO", WORLD_AT, USER, 2),
    record("SYSTEM.CNF;1", CNF_AT, CNF.length),
  ]);
  const world = concat([
    record("\0", WORLD_AT, USER, 2),
    record("\x01", ROOT_AT, USER, 2),
    ...packs.map(([path, at, blob]) => record(`${path.split("/").pop()};1`, at, blob.length)),
  ]);
  const users = new Map([
    [PVD_AT, [pvd, 0x09]],
    [PVD_AT + 1, [terminator, EOF_SUBMODE]],
    [ROOT_AT, [root, EOF_SUBMODE]],
    [CNF_AT, [CNF, EOF_SUBMODE]],
    [WORLD_AT, [world, EOF_SUBMODE]],
  ]);
  for (const [, at, blob] of packs) users.set(at, [blob, EOF_SUBMODE]);
  for (let i = 0; i < ROOM_SECTORS; i++) users.set(ROOM_AT + i, [new Uint8Array(0), DATA_SUBMODE]);
  const sectors = [];
  for (let lba = 0; lba < SYNTHETIC_SECTORS; lba++) {
    const [user, submode] = users.get(lba) ?? [new Uint8Array(0), 0];
    sectors.push(sector(lba, padded(user), submode));
  }
  return concat(sectors);
}
