// A level carried whole in its link: decoded once from the segment at the link's tail,
// answered for the slot the link names, written back at the tail while it is on screen, and
// noted under the level line with the way to copy it.
import { $, el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { skinsTable } from "../viewer/data.js";
import { parseHash } from "../viewer/permalink.js";
import { noteWith, provideLevels, tailWith } from "../viewer/chrome/navigate.js";
import { LETTER, SHARED_PACK, decodeSegment, digestOf } from "../format/share.js";
import { toLevel, writeProject } from "../format/project.js";
import { overCaps } from "../format/checks.js";

export const UNREAD =
  "The level in that link could not be read. Ask for the link again, or for the level file.";
const SHARED = "SHARED/";
const TAG = "Shared";

// The levels decoded, by the segment each came from: the one last decoded and the one on
// screen as it was decoded, no other.
const levels = new Map();
// The segment of the link being applied, noted before its slot is resolved.
let noted = null;

const segmentIn = (hash) => parseHash(hash).tails.find((s) => s[0] === LETTER) ?? null;

function segmentOf(l) {
  for (const [segment, held] of levels) if (held === l) return segment;
  return null;
}

/** Decode the level `hash` carries and hold it for the link to open, once for a segment;
    a segment that carries none the map can show is refused with the one sentence the toast shows. */
export async function prepare(hash) {
  const segment = segmentIn(hash);
  if (segment === null) throw new Error(UNREAD);
  if (levels.has(segment)) return;
  let project;
  try {
    ({ project } = await decodeSegment(segment));
  } catch {
    throw new Error(UNREAD);
  }
  const hides = skinsTable()?.hides;
  if (!hides || overCaps(project, hides)) throw new Error(UNREAD);
  const level = toLevel(project, digestOf(writeProject(project)), { pack: SHARED_PACK, tag: TAG });
  level.project = project;
  for (const [key, l] of levels) if (l !== state.lvl) levels.delete(key);
  levels.set(segment, level);
}

provideLevels((slot) =>
  slot.startsWith(SHARED) && noted !== null ? (levels.get(noted) ?? null) : null,
);

tailWith({
  letter: LETTER,
  write: () => segmentOf(state.lvl),
  before: (segment) => {
    noted = segment;
  },
});

noteWith((l) => {
  if (l.pack !== SHARED_PACK || !l.project) return null;
  const { author, notes } = l.project;
  const copy = el("button", {
    type: "button",
    className: "linkish",
    textContent: "copy this level",
    title: "Make a level of your own out of this one",
  });
  copy.onclick = () => $("draftCopy").click();
  return el(
    "div",
    { className: "shared" },
    author ? el("p", { textContent: `By ${author}.` }) : [],
    notes ? el("p", { className: "notes", textContent: notes }) : [],
    el("p", {}, "This level came by its link and is not kept in this browser. ", copy),
  );
});
