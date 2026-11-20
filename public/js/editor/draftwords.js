// The words Your levels says of a level and of a bundle, over titles and counts with no page in them.

/** Whether a level is saved to a file and, once it has changes, how many, since its save where it has one. */
export function savedWords({ saved, edits }) {
  const base = saved === null ? "not saved to a file" : "saved to a file";
  if (!edits) return base;
  return `${base} · ${edits} change${edits === 1 ? "" : "s"}${saved === null ? "" : " since"}`;
}

/** A level's line of state: its world by the name the map shows, then whether it is saved. */
export const stateLine = (world, level) => `${world} · ${savedWords(level)}`;

const PLAYS = { arcade: "arcade level", bonus: "bonus level", simon: "Simon room" };

/** How a level plays, in a few words: the kind of level it plays as, `hidden` before it where it is hidden, then the time its clock starts at where one is given. */
export function playsLine(kind, hidden, clock = null) {
  const how = `${hidden ? "hidden " : ""}${PLAYS[kind]}`;
  return clock === null ? how : `${how} · time ${clock}`;
}

/** A level's place in its bundle: where the level stands among the bundle's levels, counted from one. */
export const placeWords = (place, count) => `level ${place} of ${count}`;

/** What names a bundle's card, where the page says that it stands and on a button that leads to it: the bundle's title, then what the card is. */
export const bundleCardName = (bundle) => `${bundle}, the bundle's card`;

/** A bundle's line of state: how many levels it holds, then how many of them are not saved to a file, or that every one is; the count alone where it holds none. */
export function bundleLine(count, unsaved) {
  const levels = `${count} level${count === 1 ? "" : "s"}`;
  if (!count) return levels;
  return `${levels} · ${unsaved ? `${unsaved} not saved` : "saved"} to a file`;
}
