import { $, on } from "./dom.js";
import { state } from "./state.js";
import {
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelScore,
} from "./data.js";
import { levelPoints } from "./points.js";

export function describeLevel(l) {
  const parts = [levelTitle(l), worldName(l.theme), counted(blockCount(l), "block")];
  const n = objectCount(l);
  if (n) parts.push(counted(n, "object"));
  const points = levelPoints(l);
  const score = levelScore(l);
  if (score !== null) parts.push(`${score} of ${points} points`);
  else if (points) parts.push(`${points} points`);
  if (l.time !== undefined) parts.push(`time ${l.time}`);
  const note = levelNote(l);
  return parts.join(", ") + (note ? `. ${note}` : ".");
}

export const say = (text) => {
  $("say").textContent = text;
};

function label() {
  const line = describeLevel(state.lvl);
  $("cv").setAttribute("aria-label", line);
  return line;
}

on("level-changed", () => say(label()));
on("level-updated", label);
