// Files out of the page and into it: a download whose URL outlives the click,
// a file name out of a title, and a level read out of whatever was picked or
// pasted, by what it holds and never by its name.
import { FORMAT, GRID_BYTES, HEAD, RECORD, WORLDS, readKwl, writeKwl } from "./kwl.js";
import { readProject, recordOverflow } from "./project.js";
import { readPak } from "./pak.js";
import { openDisc } from "./iso.js";
import { PACKS } from "./patch.js";
import { SECTOR_RAW, USER_OFF } from "./sectors.js";
import { isOrbit, readOrbit, readOrbitLink } from "./orbit.js";
import { inflate as unpack } from "./inflate.js";
import { pickFromDisc, pickFromPack, slotTitle, slotWorld } from "./importdialog.js";

const NOT_MAP = "That file is not a level file of the map's.";
const NOT_LEVEL = "That file is neither a level of the map's nor one of the game's.";
const TOO_LARGE =
  "That file is far larger than any level file, and it does not read as a disc image.";
const CUE_SHEET = "That file is a cue sheet; open the disc image it names, the .bin beside it.";
export const RAW_ONLY =
  "is a disc image of 2048-byte sectors; the map reads the raw image of 2352-byte sectors, the .bin a .cue names";
const NO_WORLD = "That file names a world the disc has not.";
const NO_PACKS = "That disc image holds no packs of levels.";
const NOT_PACKED = "That slot does not hold a level the game could unpack.";
const NOT_A_LEVEL = "That slot does not hold a level.";
const NEWER =
  "Opening a level from a pack needs a newer browser, one that can unpack the game's files.";
const SHARED = "Shared level";
const MARK = "CD001";
const PVD_AT = 16 * SECTOR_RAW + USER_OFF;
const ISO_SECTOR = 2048;
const ISO_PVD_AT = 16 * ISO_SECTOR;
export const FILE_MOST = 16 << 20;
const CUE_MOST = 1 << 16;

// Safari and Firefox may still be reading the last URL when the next click comes.
let held = null;

export function download(name, data, type) {
  if (held) URL.revokeObjectURL(held);
  held = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = held;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

export const SLUG_MOST = 60;

export const slug = (title) =>
  title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .slice(0, SLUG_MOST)
    .replace(/^-+|-+$/g, "") || "level";

const stem = (name) => name.replace(/\.[^.]*$/, "");

function parsed(bytes) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/** The pack the bytes hold, or null where the reader finds them no pack. */
function asPak(bytes) {
  try {
    return readPak(bytes);
  } catch {
    return null;
  }
}

const sizeOf = (source) => (source instanceof Blob ? source.size : source.length);

/** Whether the volume descriptor's mark stands one byte into the sector that begins at `at`. */
async function marked(source, sector, at) {
  if (sizeOf(source) % sector || sizeOf(source) < at + MARK.length + 1) return false;
  const head =
    source instanceof Blob
      ? new Uint8Array(await source.slice(at + 1, at + 1 + MARK.length).arrayBuffer())
      : source.subarray(at + 1, at + 1 + MARK.length);
  return String.fromCharCode(...head) === MARK;
}

/** Whether the file is a disc image: whole sectors, with the volume descriptor's mark at sector 16. */
const isDisc = (source) => marked(source, SECTOR_RAW, PVD_AT);

/** Whether the file is a disc image of 2048-byte sectors, the form the map does not read. */
export const isIso = (source) => marked(source, ISO_SECTOR, ISO_PVD_AT);

/** Whether the bytes are a cue sheet: a FILE line and a TRACK line among a little text. */
function isCue(bytes) {
  if (bytes.length > CUE_MOST) return false;
  const text = new TextDecoder().decode(bytes);
  return (
    /^\s*FILE\s.*\s(BINARY|WAVE|MP3|AIFF|MOTOROLA)\s*$/m.test(text) &&
    /^\s*TRACK\s+\d+\s/m.test(text)
  );
}

async function inflate(bytes) {
  if (typeof DecompressionStream !== "function") throw new Error(NEWER);
  try {
    return await unpack(bytes);
  } catch {
    throw new Error(NOT_PACKED);
  }
}

const isLevel = (bytes) => {
  const body = bytes.length - GRID_BYTES - HEAD;
  return body >= 0 && body % RECORD === 0;
};

/** A level the game would load, read in the world given, or a thrown sentence. */
function readGame(bytes, world, refusal) {
  if (!isLevel(bytes)) throw new Error(refusal);
  return readKwl(bytes, world);
}

async function readFromPak(pak, name, world) {
  const slot = await pickFromPack(pak.names, world);
  if (slot === null) return null;
  const read = readGame(await inflate(pak.streams[slot]), world, NOT_A_LEVEL);
  read.project.title = pak.names[slot] || stem(name);
  return read;
}

async function readFromDisc(blob, world) {
  let disc;
  try {
    disc = await openDisc(blob);
  } catch (e) {
    throw new Error(`That file does not read as a disc image: ${e.message}.`);
  }
  const others = [...disc.files.keys()].filter((p) => p.endsWith(".PAK") && !PACKS.includes(p));
  const packs = [];
  for (const path of [...PACKS.filter((p) => disc.files.has(p)), ...others.sort()]) {
    try {
      const pak = readPak(await disc.readFile(path));
      packs.push({ path, names: pak.names, streams: pak.streams });
    } catch {
      continue;
    }
  }
  if (!packs.length) throw new Error(NO_PACKS);
  const choice = await pickFromDisc(packs, world);
  if (!choice) return null;
  const pack = packs.find((p) => p.path === choice.path);
  const read = readGame(
    await inflate(pack.streams[choice.slot]),
    slotWorld(pack.path, choice.slot) ?? world,
    NOT_A_LEVEL,
  );
  read.project.title = slotTitle(pack.path, choice.slot, pack.names[choice.slot]);
  return read;
}

/** The read, once the writer has agreed it is a level; more records than a link word can name
    are refused in the checks' words, before the writer names a block. */
function writable(read) {
  const crowded = recordOverflow(read.project);
  if (crowded) throw new Error(`That file cannot be read as a level: ${crowded}.`);
  try {
    writeKwl(read.project);
  } catch (e) {
    throw new Error(`That file cannot be read as a level: ${e.message}.`);
  }
  return read;
}

/**
 * { project, report, repairs } for a file, read by what it holds: the map's own file,
 * the game's level, a level of the community's viewer, a pack or a disc image,
 * the last two asking which level to take; null where the visitor declines;
 * and a thrown sentence to show where the file holds no level. A disc image
 * handed over as a File is read a slice at a time.
 */
export async function readLevelFile(source, name, world) {
  if (await isDisc(source)) {
    const read = await readFromDisc(source instanceof Blob ? source : new Blob([source]), world);
    return read && writable(read);
  }
  if (await isIso(source)) throw new Error(`That file ${RAW_ONLY}.`);
  if (sizeOf(source) > FILE_MOST) throw new Error(TOO_LARGE);
  const bytes = source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
  const json = parsed(bytes);
  const pak = json === undefined ? asPak(bytes) : null;
  let read;
  if (json !== undefined) {
    if (!json || typeof json !== "object") throw new Error(NOT_MAP);
    if (json.format === FORMAT) {
      read = readProject(json);
      if (!WORLDS.includes(read.project.world)) throw new Error(NO_WORLD);
    } else if (isOrbit(json)) {
      read = readOrbit(json, world);
      read.project.title = stem(name);
    } else throw new Error(NOT_MAP);
  } else if (pak) {
    read = await readFromPak(pak, name, world);
    if (!read) return null;
  } else if (isCue(bytes)) throw new Error(CUE_SHEET);
  else {
    read = readGame(bytes, world, NOT_LEVEL);
    read.project.title = stem(name);
  }
  return writable(read);
}

/** { project, report, repairs } for pasted text: a link to a shared level of the community's viewer. */
export async function readLevelText(text, world) {
  const read = await readOrbitLink(text, world);
  read.project.title = SHARED;
  return writable(read);
}
