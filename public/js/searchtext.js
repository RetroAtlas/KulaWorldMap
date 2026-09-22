// What a search candidate is made of: its words, lowercased and run together
// with single spaces, and the same words one by one. A number or a key=value
// pair is answered by a whole word only, so `level 45` does not also bring
// back LEVEL 145 and `f6=2` does not bring back f6=20; any other term is a
// substring, so `inc` still finds Inca. No DOM, so it stays importable in
// bare Node.

const WHOLE = /^(\d+|[^=\s]+=[^=\s]*)$/;

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
  WHOLE.test(term) ? c.tokens.includes(term) : c.text.includes(term);
