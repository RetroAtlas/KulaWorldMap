import { $, on } from "../ui/dom.js";
import { state } from "../state.js";
import { BASE, current, discWord, releaseOf } from "../release.js";
import {
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelScore,
  levelClock,
} from "../data.js";
import { levelPoints } from "../draw/points.js";

export function describeLevel(l) {
  const parts = [levelTitle(l), worldName(l.theme), counted(blockCount(l), "block")];
  if (l.tag !== undefined) parts.unshift(l.tag);
  if (current() !== BASE) parts.unshift(releaseOf(current()).name);
  const n = objectCount(l);
  if (n) parts.push(counted(n, "object"));
  const points = levelPoints(l);
  const score = levelScore(l);
  if (score !== null) parts.push(`${score} of ${points} points`);
  else if (points) parts.push(`${points} points`);
  if (l.time !== undefined) parts.push(`time ${levelClock(l)}`);
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

let spoken = BASE;

/** Speak the level, its disc first where it is not the one the level was last spoken under. */
function speak() {
  const changed = current() !== spoken;
  spoken = current();
  say((changed ? `Showing the ${discWord(spoken)} release. ` : "") + label());
}

export function wireA11y() {
  on("level-changed", speak);
  on("level-updated", label);
  on("release-changed", speak);
  on("link-opening", () => (current() === spoken ? label() : speak()));
}
