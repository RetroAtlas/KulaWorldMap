import { $, on } from "./dom.js";
import { state } from "./state.js";
import {
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelPoints,
  levelScore,
} from "./data.js";

export function describeLevel(l) {
  const parts = [levelTitle(l), worldName(l.theme), counted(blockCount(l), "block")];
  const n = objectCount(l);
  if (n) parts.push(counted(n, "object"));
  const points = levelPoints(l);
  const score = levelScore(l);
  if (score !== null) parts.push(`${score} of ${points} points`);
  else if (points) parts.push(`${points} points`);
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
  $("cv").setAttribute("aria-label", line);
});
