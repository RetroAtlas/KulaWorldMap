// A level's stream put into a slot of a pack on the image, or several each
// into its own slot, and what carries the result: the sectors a placement
// writes, each built whole, and the patches made of them.
import {
  DATA_SUBMODE,
  EOF_SUBMODE,
  SECTOR_RAW,
  USER,
  USER_OFF,
  check,
  rewrite,
  sector,
} from "./sectors.js";
import { IN_PLACE, REBUILD, fitPak, readPak, writePak } from "./pak.js";
import { PVD, openDisc, setRecord } from "./iso.js";
import { WORLDS } from "./kwl.js";

export const ROOM = "/3.00";
export const NTSC_U = 109607;
export const SYSTEM_ID = "PLAYSTATION";
export const BOOT = "BOOT = cdrom:SLUS_007.24;1";
export const SERIAL = "SLUS_007.24";
export const PACKS = [
  ...WORLDS.map((w) => `/${w}/${w}.PAK`),
  ...WORLDS.map((w) => `/${w}/${w}FI.PAK`),
  "/HIRO/COPYCAT.PAK",
];

export const PPF_MAGIC = Uint8Array.from("PPF30", (c) => c.charCodeAt(0));
export const PPF_VERSION = 2;
export const DESCRIPTION = 50;
export const BLOCK_AT = 0x9320;
export const BLOCK = 1024;
export const RECORD_MOST = 255;
export const PREFIX = "Kula World Map: ";

export const VCDIFF_MAGIC = Uint8Array.of(0xd6, 0xc3, 0xc4, 0x00);
export const WINDOW = 8 << 20;
export const VCD_SOURCE = 1;
export const VCD_ADLER32 = 4;
export const COPY = 19;
export const ADD = 1;

export const sectorCount = (size) => Math.ceil(size / USER);
const SCAN = 64;
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const ascii = (bytes) =>
  Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : "�")).join("");
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const bytesOf = async (blob, start, end) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function padded(bytes, length) {
  const out = new Uint8Array(length);
  out.set(bytes);
  return out;
}

/** What says the image is not the disc's, each a warning rather than a refusal. */
export async function identify(disc) {
  const out = [];
  if (disc.size % SECTOR_RAW)
    out.push(
      `the image is ${commas(disc.size)} bytes, which is not whole sectors of ${SECTOR_RAW}`,
    );
  else if (disc.size !== NTSC_U * SECTOR_RAW)
    out.push(
      `the image has ${commas(disc.size / SECTOR_RAW)} sectors, not the ${commas(NTSC_U)} of the disc`,
    );
  const pvd = await disc.sector(PVD);
  const system = ascii(pvd.subarray(8, 40)).replace(/\s+$/, "");
  if (system !== SYSTEM_ID) out.push(`the system identifier is '${system}', not ${SYSTEM_ID}`);
  const cnf = disc.files.has("/SYSTEM.CNF") ? ascii(await disc.readFile("/SYSTEM.CNF")) : "";
  if (!cnf.includes(BOOT)) out.push(`SYSTEM.CNF does not say ${BOOT}`);
  const missing = PACKS.filter((p) => !disc.files.has(p)).length;
  if (missing) out.push(`${missing} of the ${PACKS.length} packs are missing`);
  return out;
}

// The sectors of a file's run that differ once it holds the user data given,
// each built whole: data within the file, end of file on its last sector.
async function differing(disc, lba, user, size) {
  const count = user.length / USER;
  const last = sectorCount(size) - 1;
  const have = await disc.raw(lba, count);
  const out = [];
  for (let i = 0; i < count; i++) {
    const submode = i === last ? EOF_SUBMODE : DATA_SUBMODE;
    const raw = sector(lba + i, user.subarray(i * USER, (i + 1) * USER), submode);
    if (!same(raw, have.subarray(i * SECTOR_RAW, (i + 1) * SECTOR_RAW))) out.push([lba + i, raw]);
  }
  return out;
}

// The directory sector with the file's record naming a new extent and size,
// its own subheader kept.
async function directory(disc, key, extent, size) {
  const { sector: at, offset } = disc.records.get(key);
  const have = await disc.rawSector(at);
  const user = have.slice(USER_OFF, USER_OFF + USER);
  setRecord(user, offset, extent, size);
  const raw = rewrite(have, user);
  return same(raw, have) ? [] : [[at, raw]];
}

// Where a pack of this size can move to: the first run of zero sectors in the
// free file that holds it with a clear sector after it, since the game reads
// one sector past a pack, and one before it where the run is not the head.
async function room(disc, size) {
  if (!disc.files.has(ROOM)) throw new Error(`the image has no ${ROOM} to move the pack into`);
  const { lba, size: have } = disc.files.get(ROOM);
  const need = sectorCount(size) + 1;
  const sectors = sectorCount(have);
  if (need > sectors) throw new Error(`${ROOM} has ${sectors} sectors and the pack needs ${need}`);
  let run = 0;
  for (let i = 0; i < sectors; i += SCAN) {
    const raw = await disc.raw(lba + i, Math.min(SCAN, sectors - i));
    for (let k = 0; k < raw.length / SECTOR_RAW; k++) {
      const user = raw.subarray(k * SECTOR_RAW + USER_OFF, k * SECTOR_RAW + USER_OFF + USER);
      run = user.every((b) => b === 0) ? run + 1 : 0;
      const start = lba + i + k + 1 - need;
      if ((run === need && start === lba) || run === need + 1) return start;
    }
  }
  throw new Error(`${ROOM} has no run of ${need} zero sectors left for the pack`);
}

// Every other record's level, which only a rebuild that recompresses them needs.
function levelsOf(pak, slot, inflate) {
  return Promise.all(
    pak.streams.map(async (s, i) => {
      if (i === slot) return null;
      try {
        return await inflate(s);
      } catch (e) {
        throw new Error(
          `the record of ${pak.names[i]} is not one the game inflates: ${e.message ?? e}`,
        );
      }
    }),
  );
}

// The fit, where the pack lies afterwards and the sectors to write, read off the image.
async function planOn(disc, packPath, slot, stream, title, inflate) {
  const key = packPath.toUpperCase();
  if (!disc.files.has(key)) throw new Error(`no such pack on the disc: ${packPath}`);
  try {
    await inflate(stream);
  } catch (e) {
    throw new Error(`the stream is not one the game inflates: ${e.message ?? e}`);
  }
  const { lba, size } = disc.files.get(key);
  const capacity = sectorCount(size) * USER;
  const pak = readPak(await disc.readFile(key));
  const fit =
    fitPak(pak, capacity, slot, stream, title) ??
    fitPak(pak, capacity, slot, stream, title, await levelsOf(pak, slot, inflate));
  let writes;
  let where = lba;
  if (fit.path === IN_PLACE) {
    const user = await disc.read(lba, capacity);
    user.set(stream, pak.offsets[slot]);
    new DataView(user.buffer).setUint32(4 + slot * 8 + 4, stream.length, true);
    writes = await differing(disc, lba, user, size);
  } else if (fit.path === REBUILD) {
    writes = await differing(
      disc,
      lba,
      padded(writePak(fit.names, fit.streams), sectorCount(fit.size) * USER),
      fit.size,
    );
    if (fit.size !== size) writes.push(...(await directory(disc, key, lba, fit.size)));
  } else {
    const blob = writePak(fit.names, fit.streams);
    where = await room(disc, blob.length);
    const user = padded(blob, sectorCount(blob.length) * USER);
    writes = await differing(disc, where, user, blob.length);
    writes.push(...(await directory(disc, key, where, fit.size)));
  }
  writes.sort((a, b) => a[0] - b[0]);
  return { fit, lba: where, writes };
}

/**
 * The sectors that put the stream into the slot, read off the image: the fit,
 * where the pack lies afterwards, the sectors to write as [lba, raw] in
 * address order, and what says the image is not the disc's. inflate turns a
 * zlib stream into its bytes, asynchronously, however the host does that.
 */
export async function plan(disc, packPath, slot, stream, title, inflate) {
  const placed = await planOn(disc, packPath, slot, stream, title, inflate);
  return { ...placed, warnings: await identify(disc) };
}

/**
 * The sectors that put several streams into their slots, the items { pack,
 * slot, stream, title } each planned over the image as the earlier ones left
 * it, in the order given: each item's plan in order, the sectors to write
 * merged in address order, a later one replacing an earlier at the same
 * address, and what says the image is not the disc's.
 */
export async function planAll(blob, items, inflate) {
  const named = new Set();
  for (const { pack, slot } of items) {
    const key = `${pack.toUpperCase()}#${slot}`;
    if (named.has(key)) throw new Error(`two levels name ${pack}#${slot}, which holds one`);
    named.add(key);
  }
  const disc = await openDisc(blob);
  const warnings = await identify(disc);
  const placed = [];
  const merged = new Map();
  for (const { pack, slot, stream, title } of items) {
    const view = merged.size ? await openDisc(patchedImage(blob, [...merged])) : disc;
    const one = await planOn(view, pack, slot, stream, title, inflate);
    placed.push({ ...one, warnings });
    for (const [lba, raw] of one.writes) merged.set(lba, raw);
  }
  return { placed, writes: [...merged].sort((a, b) => a[0] - b[0]), warnings };
}

/**
 * Read the pack back through the readers and hold it to the plan: the slot
 * inflates to the level, every record and name is the plan's, the directory
 * places the pack where the plan put it, and every sector written checks.
 */
export async function verify(disc, packPath, slot, stream, placed, inflate) {
  const key = packPath.toUpperCase();
  const file = disc.files.get(key);
  const at = file ? `${file.lba}, ${file.size}` : "nowhere";
  if (!file || file.lba !== placed.lba || file.size !== placed.fit.size)
    throw new Error(
      `the directory puts ${packPath} at ${at}, not ${placed.lba}, ${placed.fit.size}`,
    );
  const pak = readPak(await disc.readFile(key));
  if (!same(await inflate(pak.streams[slot]), await inflate(stream)))
    throw new Error(`${packPath}#${slot} does not inflate to the level`);
  const planned = placed.fit;
  if (
    pak.streams.length !== planned.streams.length ||
    pak.streams.some((s, i) => !same(s, planned.streams[i])) ||
    pak.names.join("\n") !== planned.names.join("\n")
  )
    throw new Error(`${packPath} does not read back as planned`);
  for (const [lba, raw] of placed.writes)
    if (!check(raw)) throw new Error(`sector ${lba} does not check`);
}

/**
 * Read every pack touched back through the readers and hold it to the plan:
 * the directory places it where the last placement into it put it and it
 * reads back as that placement's records and names, every item's slot
 * inflates to its level, and every merged sector checks.
 */
export async function verifyAll(disc, items, planned, inflate) {
  const last = new Map(items.map(({ pack }, i) => [pack.toUpperCase(), i]));
  for (const [i, { pack, slot, stream }] of items.entries()) {
    if (last.get(pack.toUpperCase()) === i)
      await verify(disc, pack, slot, stream, planned.placed[i], inflate);
    else {
      const pak = readPak(await disc.readFile(pack));
      if (!same(await inflate(pak.streams[slot]), await inflate(stream)))
        throw new Error(`${pack}#${slot} does not inflate to the level`);
    }
  }
  for (const [lba, raw] of planned.writes)
    if (!check(raw)) throw new Error(`sector ${lba} does not check`);
}

/** The image with the sectors written: the original's own slices with the new sectors between them. */
export function patchedImage(blob, writes) {
  const parts = [];
  let at = 0;
  for (const [lba, raw] of [...writes].sort((a, b) => a[0] - b[0])) {
    const start = lba * SECTOR_RAW;
    if (start < at) throw new Error(`sector ${lba} is written twice`);
    if (start + SECTOR_RAW > blob.size)
      throw new Error(`sector ${lba} lies past the end of the image`);
    if (start > at) parts.push(blob.slice(at, start));
    parts.push(raw);
    at = start + SECTOR_RAW;
  }
  if (at < blob.size) parts.push(blob.slice(at));
  return new Blob(parts);
}

/** The cue sheet naming the image, one Mode 2 track, a quote in the name escaped. */
export const cue = (name) =>
  `FILE "${name.replaceAll('"', '\\"')}" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n`;

/** The stretches where now differs from old, as [offset, length]. */
export function runs(old, now) {
  const out = [];
  let start = -1;
  for (let i = 0; i < old.length; i++) {
    if (old[i] !== now[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - start]);
      start = -1;
    }
  }
  if (start >= 0) out.push([start, old.length - start]);
  return out;
}

/** Every stretch of the image the writes change, as [offset, bytes], in address order. */
export async function changes(original, writes) {
  const out = [];
  for (const [lba, raw] of [...writes].sort((a, b) => a[0] - b[0])) {
    const old = await bytesOf(original, lba * SECTOR_RAW, (lba + 1) * SECTOR_RAW);
    for (const [at, n] of runs(old, raw)) out.push([lba * SECTOR_RAW + at, raw.slice(at, at + n)]);
  }
  return out;
}

/** What a PPF says of itself: the prefix and the levels' titles. */
export const description = (titles) => PREFIX + titles.join(", ");

/**
 * A PPF 3.0 patch: the header, a block check of the volume descriptor, and a
 * record of at most 255 bytes for each stretch of each changed sector.
 */
export async function ppf(original, writes, description) {
  const block = await bytesOf(original, BLOCK_AT, BLOCK_AT + BLOCK);
  const text = new Uint8Array(DESCRIPTION).fill(0x20);
  let k = 0;
  for (const c of description) {
    if (k === DESCRIPTION) break;
    const code = c.codePointAt(0);
    text[k++] = code >= 0x20 && code < 0x7f ? code : 0x3f;
  }
  const records = [];
  for (const [at, data] of await changes(original, writes))
    for (let i = 0; i < data.length; i += RECORD_MOST)
      records.push([at + i, data.subarray(i, i + RECORD_MOST)]);
  const head = PPF_MAGIC.length + 1 + DESCRIPTION + 4 + BLOCK;
  const out = new Uint8Array(head + records.reduce((n, [, data]) => n + 9 + data.length, 0));
  const view = new DataView(out.buffer);
  out.set(PPF_MAGIC);
  out[PPF_MAGIC.length] = PPF_VERSION;
  out.set(text, PPF_MAGIC.length + 1);
  out.set([0, 1, 0, 0], PPF_MAGIC.length + 1 + DESCRIPTION);
  out.set(block, head - BLOCK);
  let pos = head;
  for (const [at, data] of records) {
    view.setBigUint64(pos, BigInt(at), true);
    out[pos + 8] = data.length;
    out.set(data, pos + 9);
    pos += 9 + data.length;
  }
  return out;
}

/** An integer in base 128, most significant first, the continuation bit high on all but the last. */
export function varint(n) {
  const out = [n % 128];
  for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) out.push(0x80 | (n % 128));
  return Uint8Array.from(out.reverse());
}

/** The Adler-32 of the bytes, as zlib computes it. */
export function adler32(bytes) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length;) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) {
      a += bytes[i];
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const be32 = (n) => Uint8Array.of(n >>> 24, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

// One VCDIFF window over the source bytes from start: a COPY for every
// unchanged stretch and an ADD for every changed one, with the window's
// Adler-32 for the decoder to check. The changes are laid into the window's
// own bytes, which are then the target.
function encodeWindow(source, start, changed) {
  const data = [];
  const inst = [];
  const addr = [];
  let here = 0;
  for (const [at, piece] of changed) {
    const lo = Math.max(at, start) - start;
    const hi = Math.min(at + piece.length, start + source.length) - start;
    const part = piece.subarray(lo + start - at, hi + start - at);
    if (lo > here) {
      inst.push(COPY, ...varint(lo - here));
      addr.push(...varint(here));
    }
    inst.push(ADD, ...varint(hi - lo));
    data.push(part);
    source.set(part, lo);
    here = hi;
  }
  if (here < source.length) {
    inst.push(COPY, ...varint(source.length - here));
    addr.push(...varint(here));
  }
  const bytes = concat(data);
  const body = concat([
    varint(source.length),
    Uint8Array.of(0),
    varint(bytes.length),
    varint(inst.length),
    varint(addr.length),
    be32(adler32(source)),
    bytes,
    Uint8Array.from(inst),
    Uint8Array.from(addr),
  ]);
  return concat([
    Uint8Array.of(VCD_SOURCE | VCD_ADLER32),
    varint(source.length),
    varint(start),
    varint(body.length),
    body,
  ]);
}

/**
 * A VCDIFF patch as xdelta3 decodes it: windows of at most so many bytes, each
 * copying from the same stretch of the source, with no secondary compression
 * and no application header.
 */
export async function vcdiff(original, writes, window = WINDOW) {
  const changed = await changes(original, writes);
  const parts = [concat([VCDIFF_MAGIC, Uint8Array.of(0)])];
  for (let start = 0; start < original.size; start += window) {
    const source = await bytesOf(original, start, Math.min(start + window, original.size));
    const within = changed.filter(
      ([at, piece]) => at < start + source.length && at + piece.length > start,
    );
    parts.push(encodeWindow(source, start, within));
  }
  return concat(parts);
}

const basename = (path) => path.split("/").pop();
const stem = (name) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

/** Where each emulator wants the PPF, and how the xdelta is applied. */
export function placements(image, out) {
  const imageName = basename(image);
  const outName = basename(out);
  return [
    `DuckStation, with Apply Image Patches on, and PCSX-Redux read the PPF beside the image as ${stem(imageName)}.ppf`,
    `ePSXe and PCSX-ReARMed read it from their patches folder as ${SERIAL}, with no extension`,
    `the xdelta applies with: xdelta3 -d -s "${imageName}" "${outName}.xdelta" "${outName}.bin"`,
  ];
}
