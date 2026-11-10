// The levels the discs ship, as the editor names them and judges a level of your own against
// them: a slot named by the title the map shows it under, with its disc where that is not the US
// one, and the shapes of every level of every disc, built once, for the rule that finds a level a
// copy of one of the game's levels.
import { state } from "../viewer/state.js";
import { levelTitle } from "../viewer/data.js";
import { BASE, discWord, levelOn, releaseOf, releases } from "../viewer/release.js";
import { levelKey } from "../format/kwl.js";
import { fromLevel } from "../format/project.js";
import { kinOf, shapesOf } from "../format/kinship.js";

/** The levels of the discs as `{ slot, project }`, `levels` under `pack#index` and each of the
    release `files`' variants under `pack#index@release`, as the catalogue's tool keys them. */
export const shippedEntries = (levels, files) => [
  ...levels.map((l) => ({ slot: levelKey(l.pack, l.index), project: fromLevel(l) })),
  ...files.flatMap((r) =>
    Object.entries(r.levels ?? {}).map(([slot, l]) => ({
      slot: `${slot}@${r.id}`,
      project: fromLevel(l),
    })),
  ),
];

let cache = { data: null, shapes: null };
/** The shapes of every level the discs ship, built once from the levels the map holds. */
function shipped() {
  if (cache.data !== state.data)
    cache = { data: state.data, shapes: shapesOf(shippedEntries(state.data.levels, releases())) };
  return cache.shapes;
}

/** The title the map shows the level at `slot` under, with its disc after it where `disc` is a
    release other than the base, or "" where no level stands at the slot. */
export function slotName(slot, disc) {
  const l = state.data.levels.find((b) => levelKey(b.pack, b.index) === slot);
  if (!l) return "";
  const on = releaseOf(disc) ? disc : BASE;
  const title = levelTitle(levelOn(l, on));
  return on === BASE ? title : `${title} on the ${discWord(on)} disc`;
}

/** The name of the shipped level `project` is a copy of by the rule of the format, the level its
    `from` names where the rule refuses it, or null where it is none, a level that merely resembles
    one of the game's levels or keeps a part of its source among them. */
export function kinName(project) {
  const kin = kinOf(project, shipped());
  if (kin === null || !kin.refused) return null;
  const at = kin.slot.indexOf("@");
  return at < 0 ? slotName(kin.slot) : slotName(kin.slot.slice(0, at), kin.slot.slice(at + 1));
}
