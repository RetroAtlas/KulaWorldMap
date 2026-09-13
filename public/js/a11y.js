import { $, on } from "./dom.js";
import { state } from "./state.js";
import { worldName, levelNote, levelTitle, levelMarkers, levelPoints } from "./data.js";

/** What a reader who cannot see the map is told on arriving somewhere. */
export function describeLevel(l) {
  const parts = [levelTitle(l), worldName(l.theme), `${l.placed} blocks`];
  const n = levelMarkers(l).length;
  if (n) parts.push(`${n} objects`);
  const points = levelPoints(l);
  if (points) parts.push(`${points} points`);
  if (l.camera?.time !== undefined) parts.push(`time ${l.camera.time}`);
  const note = levelNote(l);
  return parts.join(", ") + (note ? `. ${note}` : ".");
}

export const say = (text) => {
  $("say").textContent = text;
};

on("level-changed", () => {
  const line = describeLevel(state.lvl);
  say(line);
  // the map is named with the same line rather than being an anonymous picture
  $("cv").setAttribute("aria-label", line);
});
