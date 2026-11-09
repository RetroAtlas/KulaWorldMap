// Reading the segment that carries a level whole in a link, and the slot it opens under.
import { WORLDS } from "./kwl.js";
import { readProject } from "./project.js";
import { inflate } from "./inflate.js";

export const SHARED_PACK = "/SHARED/SHARED.PAK";
export const LETTER = "s";
/** The most characters a segment is read at; a longer one is refused before any decoding. */
export const SEGMENT_MOST = 200000;
export const NOT_CARRIED = "That link does not carry a level the map can read.";
export const TOO_LONG = "That link is far longer than any link that carries a level.";
export const NO_WORLD = "That link names a world the disc has not.";
export const NEWER = "Opening a level from a link needs a newer browser, one that can unpack it.";

const BASE64URL = /^[A-Za-z0-9_-]*$/;
const DIGEST_LETTER = "L";
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

function bytesOf(payload) {
  if (!BASE64URL.test(payload)) throw new Error(NOT_CARRIED);
  const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
      c.charCodeAt(0),
    );
  } catch {
    throw new Error(NOT_CARRIED);
  }
}

/** { project, report, repairs } for the level a segment carries, read as a file is, or a thrown
    sentence where it carries none the map can read. */
export async function decodeSegment(segment) {
  if (typeof segment !== "string" || !segment.startsWith(LETTER)) throw new Error(NOT_CARRIED);
  if (segment.length > SEGMENT_MOST) throw new Error(TOO_LONG);
  if (typeof DecompressionStream !== "function") throw new Error(NEWER);
  const bytes = bytesOf(segment.slice(LETTER.length));
  let read;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await inflate(bytes));
    read = readProject(text);
  } catch {
    throw new Error(NOT_CARRIED);
  }
  if (!WORLDS.includes(read.project.world)) throw new Error(NO_WORLD);
  return read;
}

/** The index a carried level opens under: a letter and FNV-1a 32 of its canonical text in base36. */
export function digestOf(text) {
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return DIGEST_LETTER + h.toString(36).toUpperCase();
}
