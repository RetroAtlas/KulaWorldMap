// A slot guessed from a level's title, over the titles the disc box lists for its slots.

const PLAIN = "LEVEL";
const KINDS = ["BONUS", "FINAL", "HIDDEN", "SIMON"];
const WORD = /[\p{L}\p{N}]/u;
const NUMBER = /\d+/;
const LAST_WORD = /(\p{L}+)[^\p{L}\p{N}]*$/u;
const JOINED = /(\p{L})(\d)/gu;

const normal = (text) => text.trim().replace(/\s+/g, " ").replace(JOINED, "$1 $2").toUpperCase();
const edge = (text, at) => at < 0 || at >= text.length || !WORD.test(text[at]);

/** Whether `part` stands in `text` as whole words. */
function stands(text, part) {
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + 1))
    if (edge(text, at - 1) && edge(text, at + part.length)) return true;
  return false;
}

/** The title the first number in `text` counts to, of the kind the word before the number names where that is one, else a plain level. */
function counted(text) {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const word = LAST_WORD.exec(text.slice(0, m.index))?.[1];
  return `${KINDS.includes(word) ? word : PLAIN} ${Number(m[0])}`;
}

/** The key of the slot `title` names among `listed`, pairs of key and title, the keys in `taken` left out, a word and a number it runs into read as spaced: the slot titled as the level is, else the one whose title stands in the level's title as whole words, the longest where several do, else the one its first number counts to, else null. */
export function guessSlot(title, listed, taken = new Set()) {
  const wanted = normal(title);
  if (!wanted) return null;
  const free = [...listed]
    .filter(([key]) => !taken.has(key))
    .map(([key, name]) => [key, normal(name)])
    .filter(([, name]) => name);
  const named = (name) => free.find((slot) => slot[1] === name)?.[0] ?? null;
  const exact = named(wanted);
  if (exact) return exact;
  let best = null;
  for (const slot of free)
    if ((!best || slot[1].length > best[1].length) && stands(wanted, slot[1])) best = slot;
  if (best) return best[0];
  const name = counted(wanted);
  return name ? named(name) : null;
}
