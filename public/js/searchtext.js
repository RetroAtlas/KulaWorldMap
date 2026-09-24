// What a search candidate is made of: its words, lowercased and run together
// with single spaces, and the same words one by one. A number or a key=value
// pair is answered by a whole word only, so `level 45` does not also bring
// back LEVEL 145 and `f3=2` does not bring back f3=20; any other term is a
// substring, so `inc` still finds Inca and `starts=` every starts= pair. No
// DOM, so it stays importable in bare Node.

const WHOLE = /^(\d+|[^=\s]+=[^=\s]+)$/;

/** Whether a term is answered by a whole word rather than a substring. */
export const whole = (term) => WHOLE.test(term);

export function indexed(words) {
  const text = words
    .filter((w) => w !== null && w !== undefined && w !== "")
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return { text, tokens: text.split(" ") };
}

export const answers = (c) => (term) =>
  whole(term) ? c.tokens.includes(term) : c.text.includes(term);

/** Where the terms fall in a text, as sorted spans with overlaps merged: a
    whole term only where it is a whole word or the value of a name=value
    word, so a number is not marked inside a cell's coordinates. */
export function spans(text, terms) {
  const found = [];
  for (const { 0: word, index: at } of text.toLowerCase().matchAll(/\S+/g))
    for (const t of terms) {
      if (!whole(t))
        for (let i = word.indexOf(t); i >= 0; i = word.indexOf(t, i + t.length))
          found.push([at + i, at + i + t.length]);
      else if (word === t) found.push([at, at + t.length]);
      else if (word.endsWith(`=${t}`)) found.push([at + word.length - t.length, at + word.length]);
    }
  found.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of found) {
    const last = merged.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}
