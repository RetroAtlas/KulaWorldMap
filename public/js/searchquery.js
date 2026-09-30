// OR-of-AND groups: space is AND, and a comma or a bare "or" is OR. A bare
// "and" or "or" is never a term.
export function parseQuery(q) {
  return q
    .toLowerCase()
    .split(/\s*,\s*|\s+or\s+/)
    .map((g) => g.split(/\s+/).filter((term) => term && term !== "and" && term !== "or"))
    .filter((g) => g.length);
}

// never an empty string, on which a substring scan would not end
export const queryTerms = (groups) => [...new Set(groups.flat())];

export const matchesBy = (groups, has) => groups.some((g) => g.every((term) => has(term)));

// `text` is lowercased already
export const matchesQuery = (text, groups) => matchesBy(groups, (term) => text.includes(term));

export function rankFor(name, terms) {
  const n = name.toLowerCase();
  let best = 3;
  for (const term of terms) {
    const r = n === term ? 0 : n.startsWith(term) ? 1 : n.includes(term) ? 2 : 3;
    if (r < best) best = r;
  }
  return best;
}
