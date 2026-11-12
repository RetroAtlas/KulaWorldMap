// What the boot loads for a level beyond the disc's levels, carried whole in its link or one of
// the community levels: importing it stands their sources and notes beside the map and the
// panel's tiles in the sidebar, and `prepare` stands the level a link names before the link is
// read.
import { parseHash } from "../viewer/permalink.js";
import { prepare as prepareLink } from "./link.js";
import { openPanel, prepare as preparePanel, wirePanel } from "./panel.js";

const COMMUNITY = "COMMUNITY/";

export { openPanel };

export function bootCommunity() {
  wirePanel();
}

/** Hold the level `hash` names, decoded from the link or built from the catalogue; throws the toast's sentence where it cannot be. */
export const prepare = (hash) =>
  parseHash(hash).slot.startsWith(COMMUNITY) ? preparePanel(hash) : prepareLink(hash);
