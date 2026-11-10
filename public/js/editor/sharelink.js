// The link that carries a level of your own, with no DOM: the shared slot at the digest of the
// level's text, the view's turn, the level framed to fit, the slice and the segment as the one
// tail, in the permalink's full form, since a tail is read only after a full head.
import { formatHash, slotOf } from "../viewer/permalink.js";
import { SHARED_PACK, digestOf } from "../format/share.js";
import { encodeLevel } from "../format/sharewrite.js";
import { writeProject } from "../format/project.js";

/** The most characters a link is offered at; past it the file leads. */
export const LINK_MOST = 8000;

/** The link for `project` at `origin`, the page's address with no hash: the turn and the slice
    of `parts`, the level framed to fit, no cell selected. */
export function shareLink(project, parts, origin) {
  const slot = slotOf({ pack: SHARED_PACK, index: digestOf(writeProject(project)) });
  return (
    origin +
    formatHash({
      slot,
      cam: parts.cam,
      target: parts.target,
      slice: parts.slice,
      picked: null,
      fitted: true,
      tails: [encodeLevel(project)],
    })
  );
}
