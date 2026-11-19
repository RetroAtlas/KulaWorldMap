// The words Your levels says of a level, over titles and counts with no page in them.

/** Whether a level is saved to a file and, once it has changes, how many, since its save where it has one. */
export function savedWords({ saved, edits }) {
  const base = saved === null ? "not saved to a file" : "saved to a file";
  if (!edits) return base;
  return `${base} · ${edits} change${edits === 1 ? "" : "s"}${saved === null ? "" : " since"}`;
}

/** A level's line of state: its world by the name the map shows, then whether it is saved. */
export const stateLine = (world, level) => `${world} · ${savedWords(level)}`;

/** A level's place in its bundle: the bundle's title, then where the level stands among the bundle's levels, counted from one. */
export const placeLine = (bundle, place, count) => `${bundle} · level ${place} of ${count}`;
