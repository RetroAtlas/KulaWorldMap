// Files out of the page and into it: a download whose URL outlives the click,
// a file name out of a title, and a level read out of whatever was picked or
// pasted, by what it holds and never by its name.
import {
  COPYCAT_PACK,
  FORMAT,
  GRID_BYTES,
  HEAD,
  RECORD,
  WORLDS,
  levelKey,
  readKwl,
  writeKwl,
} from "../format/kwl.js";
import { readProject } from "../format/project.js";
import { recordOverflow } from "../format/checks.js";
import { readPak } from "../format/pak.js";
import { openDisc } from "../format/iso.js";
import { PACKS, PPF_MAGIC, identify } from "../format/patch.js";
import {
  PPF,
  appliedImage,
  changedSlots,
  patchKind,
  ppfCheck,
  ppfPatch,
  vcdiffPatch,
  vcdiffStretches,
} from "../format/patchread.js";
import { SECTOR_RAW, USER_OFF } from "../format/sectors.js";
import { isOrbit, readOrbit, readOrbitLink } from "../format/orbit.js";
import { inflate as unpack } from "../format/inflate.js";
import { releases } from "../viewer/release.js";
import { pickFromDisc, pickFromPack, pickFromPatch, slotTitle, slotWorld } from "./importdialog.js";

const NOT_MAP = "That file is not one of the map's level files.";
const NOT_LEVEL = "That file is neither one of the map's level files nor a level file of the game.";
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
const PATCH_LARGE = "That file is far larger than any patch the map makes.";
const MADE_FOR = "The patch was made for this image.";
const UNCHECKED = "The patch carries no check of the image it was made for.";
const otherImage = (name) => `${name} is not the image the patch was made for.`;
const notApplied = (name, why) => `The patch does not apply to ${name}: ${why}.`;
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
const bytesOf = async (source) =>
  source instanceof Blob ? new Uint8Array(await source.arrayBuffer()) : source;
const headOf = async (source, n) =>
  source instanceof Blob
    ? new Uint8Array(await source.slice(0, n).arrayBuffer())
    : source.subarray(0, n);

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
  const { release } = await identify(disc, releases());
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
  const choice = await pickFromDisc(packs, world, release);
  if (!choice) return null;
  const pack = packs.find((p) => p.path === choice.path);
  const read = readGame(
    await inflate(pack.streams[choice.slot]),
    slotWorld(pack.path, choice.slot, release) ?? world,
    NOT_A_LEVEL,
  );
  read.project.title = slotTitle(pack.path, choice.slot, pack.names[choice.slot], release);
  return read;
}

/** The image's disc, told by its boot line as the disc box tells it, or a thrown sentence where the file is no image. */
async function releaseOfImage(image) {
  if (await isIso(image)) throw new Error(`${image.name} ${RAW_ONLY}.`);
  let disc;
  try {
    disc = await openDisc(image);
  } catch (e) {
    throw new Error(`${image.name} does not read as a disc image: ${e.message}.`);
  }
  return (await identify(disc, releases())).release;
}

// A patch carries only the stretches that differ, so its levels come back
// whole only over the image it was made for: the box asks for one unless the
// disc box holds one read, and over it the patch is applied and every slot
// whose level changed is listed, then read in the world the map lists the slot
// under, titled as the patched pack names the slot and targeted back at it.
async function readFromPatch(bytes, kind, name, world, held) {
  let patch;
  try {
    patch = kind === PPF ? ppfPatch(bytes) : vcdiffPatch(bytes);
  } catch (e) {
    throw new Error(`That patch cannot be read: ${e.message}.`);
  }
  const read = async (image) => {
    const release = held && image === held.file ? held.release : await releaseOfImage(image);
    let check = null;
    if (kind === PPF) {
      const made = await ppfCheck(image, patch);
      if (made === false) throw new Error(otherImage(image.name));
      check = made === null ? UNCHECKED : MADE_FOR;
    }
    let slots;
    try {
      const stretches = kind === PPF ? patch.stretches : await vcdiffStretches(image, patch);
      slots = await changedSlots(image, appliedImage(image, stretches), inflate);
    } catch (e) {
      throw new Error(notApplied(image.name, e.message));
    }
    const levels = slots.map((slot) => ({
      ...slot,
      title: slotTitle(slot.pack, slot.index, slot.name, release),
      world: slotWorld(slot.pack, slot.index, release) ?? world,
    }));
    return { check, levels };
  };
  const description = kind === PPF ? patch.description : "";
  const levels = await pickFromPatch({ name, description, held }, read);
  if (!levels) return null;
  const reads = [];
  for (const level of levels) {
    const one = readGame(await inflate(level.stream), level.world, NOT_A_LEVEL);
    one.project.title = level.name || level.title;
    one.project.into = levelKey(level.pack, level.index);
    if (level.pack === COPYCAT_PACK) one.project.simon = true;
    reads.push(writable(one));
  }
  return reads;
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
 * the last two asking which level to take; an array of them for a patch, one
 * for each level it puts on the disc, which asks for the image it was made for
 * unless `held` is the disc box's { file, release }; null where the visitor
 * declines; and a thrown sentence to show where the file holds no level. A
 * disc image handed over as a File is read a slice at a time.
 */
export async function readLevelFile(source, name, world, held = null) {
  const kind = patchKind(await headOf(source, PPF_MAGIC.length));
  if (kind) {
    if (sizeOf(source) > FILE_MOST) throw new Error(PATCH_LARGE);
    return readFromPatch(await bytesOf(source), kind, name, world, held);
  }
  if (await isDisc(source)) {
    const read = await readFromDisc(source instanceof Blob ? source : new Blob([source]), world);
    return read && writable(read);
  }
  if (await isIso(source)) throw new Error(`That file ${RAW_ONLY}.`);
  if (sizeOf(source) > FILE_MOST) throw new Error(TOO_LARGE);
  const bytes = await bytesOf(source);
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
