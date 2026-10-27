import { $, on } from "../ui/dom.js";
import { state } from "../state.js";
import { BASE, current, releaseOf } from "../release.js";
import {
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelScore,
} from "../data.js";
import { levelPoints } from "../draw/points.js";

export function describeLevel(l) {
  const parts = [levelTitle(l), worldName(l.theme), counted(blockCount(l), "block")];
  if (l.draft !== undefined) parts.unshift("Draft");
  if (current() !== BASE) parts.unshift(releaseOf(current()).name);
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
on("release-changed", label);
on("link-opening", label);
