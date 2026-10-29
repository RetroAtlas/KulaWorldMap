import { state } from "../state.js";
import { SIDE, FACE_NORMAL, COUNTED_KINDS } from "../../format/lattice.js";
import { OFF_LATTICE, index, levelMarkers, markerPoints, skinsTable } from "../data.js";
import { keyed, simonRoom } from "../skins.js";
import { hasFace } from "./blocks.js";

// A level with no key scores every block the ball rolls onto, the first time,
// counted as the game builds the blocks: the kinds its walk over the inner
// lattice builds, with at least one face built. A beam's empty end is the
// plain block the loader stands there first.
const BLOCK_POINTS = 50;
const inner = (v) => v >= 1 && v <= SIDE - 2;

/** Whether the level plays by the bonus rules: no key, outside the Simon rooms. */
export function playsBonus(l) {
  const skins = skinsTable();
  return !!skins && !keyed(skins, l) && !simonRoom(skins, l);
}

/** The blocks a level with no key counts. */
export function tallied(l) {
  const idx = index(l);
  const first = state.data.firstRecord;
  let n = 0;
  for (const c of idx.cells.values()) {
    if (!inner(c.x) || !inner(c.y) || !inner(c.z)) continue;
    const kind = c.v === OFF_LATTICE ? 0 : c.v < first ? c.v : l.records[c.v - first].kind;
    if (COUNTED_KINDS.has(kind) && FACE_NORMAL.some((_, g) => hasFace(idx, c, g))) n++;
  }
  return n;
}

export function levelPoints(l) {
  let points = levelMarkers(l).reduce((sum, m) => sum + markerPoints(m), 0);
  if (playsBonus(l)) points += BLOCK_POINTS * tallied(l);
  return points;
}
