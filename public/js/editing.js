// What the tools and the form share: the sentences, the words, the draft on screen and the checks.
import { $ } from "./dom.js";
import { state, cellKey } from "./state.js";
import { FACE_NORMAL } from "./faces.js";
import { circuitPhrase, entryName, kindName, skinsTable } from "./data.js";
import { say } from "./a11y.js";
import { toast } from "./toast.js";
import { get } from "./drafts.js";
import { edit } from "./trail.js";
import { CRUMBLING_KIND, LASER_KIND, SPAN_KINDS, VANISHING_KIND, sameCell } from "./kwl.js";
import { ERROR, describe, runOf, validate } from "./project.js";
import * as palette from "./palette.js";

export const BRITTLE =
  "Nothing stands on a platform's, laser's, crumbling or vanishing block's faces.";
export const LOOKS_INTO = "That face looks into another block.";

export const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
export const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
export const sentence = (text) => `${capital(text)}.`;
export const place3 = (cell) => cell.join(", ");
const article = (word) => (/^([aeiou]|hour)/i.test(word) ? "an" : "a");
export const aWord = (word) => `${article(word)} ${word}`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const kindWord = (kind) => lower(kindName(kind) || "plain block");
/** The brush as a sentence names it, from the palette's pressed row. */
export const brushWord = () => {
  const e = palette.chosen();
  if (!e) return "thing";
  if (e.kind === LASER_KIND) return circuitPhrase(e.colour, kindWord(e.kind));
  return e.kind !== undefined ? kindWord(e.kind) : lower(e.label);
};
export const across = (cell, face) => cell.map((v, i) => v + FACE_NORMAL[face][i]);

/** The draft on screen as the store holds it, or null where the level is not a draft. */
export const current = () => {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : get(id);
  return d && { id, doc: d.doc };
};
export const thingOn = (cell, face) =>
  (state.idx.markers.get(cellKey(...cell)) || []).find((m) => m.face === face) ?? null;
export const plainOnly = (e) => {
  const name = lower(entryName(e.marker) ?? e.label);
  return name.endsWith("s")
    ? `${capital(name)} work on a plain block only.`
    : `${capital(aWord(name))} works on a plain block only.`;
};
export const brittle = (b) =>
  SPAN_KINDS.has(b.kind) || b.kind === CRUMBLING_KIND || b.kind === VANISHING_KIND;
/** The span whose run takes `cell`, its own block's cell included; null where none does. */
export const spanAt = (doc, cell) =>
  doc.blocks.find(
    (b) => SPAN_KINDS.has(b.kind) && b.far && runOf(b).some((c) => sameCell(c, cell)),
  ) ?? null;

export const status = (text) => {
  $("toolStatus").textContent = text;
};

/** Say why a change is refused, on the strip and as a toast; true, for a handler to return. */
export function refuse(text) {
  toast(text);
  status(text);
  return true;
}

/** Make `next` the draft's document as one step, announced as its label reads. */
export function commit(id, next, label) {
  edit(id, next, label);
  status("");
  say(capital(label));
}

/** The errors `next` has that `before` had not, `before`'s read through `as` first. */
export function newErrors(before, next, as = (f) => f) {
  const hides = skinsTable()?.hides;
  const errorsOf = (p) => validate(p, hides).filter((f) => f.level === ERROR);
  const seen = new Set(errorsOf(before).map(as).map(describe));
  return errorsOf(next).filter((f) => !seen.has(describe(f)));
}
