// Which part of Your levels stands under its heading, over what happens with no page in it.

/** The parts, of which one stands. */
export const LIST = "list";
export const LEVEL = "level";

/** What bears on the part that stands. */
export const SHOWN = "shown";
export const STEPPED = "stepped";
export const MOVED = "moved";
export const CHOSEN = "chosen";
export const BACK = "back";

/** The part that stands once `what` has happened while `stood` stood, `own` where the level on screen is one of your own. */
export function partAfter(stood, what, own) {
  if (!own || what === BACK) return LIST;
  // a step along the list and a level under a new number keep what stood
  return what === SHOWN || what === CHOSEN ? LEVEL : stood;
}
