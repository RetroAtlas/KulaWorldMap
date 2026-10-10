// Files out of the page and into it: a download whose URL outlives the click,
// a file name out of a title, and a level read out of whatever was picked.
import { FORMAT, GRID_BYTES, HEAD, RECORD, WORLDS, readKwl, writeKwl } from "./kwl.js";
import { readProject } from "./project.js";

const NOT_MAP = "That file is not a level file of the map's.";
const NOT_LEVEL = "That file is neither a level of the map's nor one of the game's.";
const NO_WORLD = "That file names a world the disc has not.";

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

/** { project, report } for the bytes of a file, read by what they hold; throws
    with the sentence to show where they hold no level. */
export function readLevelFile(bytes, name, world) {
  const json = parsed(bytes);
  let read;
  if (json !== undefined) {
    if (!json || typeof json !== "object" || json.format !== FORMAT) throw new Error(NOT_MAP);
    read = readProject(json);
    if (!WORLDS.includes(read.project.world)) throw new Error(NO_WORLD);
  } else {
    const body = bytes.length - GRID_BYTES - HEAD;
    if (body < 0 || body % RECORD) throw new Error(NOT_LEVEL);
    read = readKwl(bytes, world);
    read.project.title = stem(name);
  }
  try {
    writeKwl(read.project);
  } catch (e) {
    throw new Error(`That file cannot be read as a level: ${e.message}.`);
  }
  return read;
}
