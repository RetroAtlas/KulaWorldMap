// No DOM, so it stays importable in bare Node.
import { state } from "../state.js";
import { worldName, levelTitle } from "../data.js";
import { matchesBy, rankFor } from "./searchquery.js";
import { indexed, answers } from "./searchtext.js";

// The game numbers The Final's levels on from this.
const ARCADE = 150;

function candidates(levels) {
  const out = [];
  for (const w of state.data.themes) {
    const name = worldName(w.id);
    out.push({ world: w, name, ...indexed([w.id, name]) });
  }
  levels.forEach((l, li) => {
    const final = /^FINAL (\d+)$/.exec(levelTitle(l));
    const also = final ? `level ${ARCADE + Number(final[1])}` : null;
    const name = levelTitle(l);
    out.push({
      li,
      level: l,
      name,
      ...indexed([name, l.name, l.theme, worldName(l.theme), also]),
    });
  });
  return out;
}

// Nothing the index reads changes after boot.
const cache = new WeakMap();

export function placeCandidates(levels) {
  let rows = cache.get(levels);
  if (!rows) cache.set(levels, (rows = candidates(levels)));
  return rows;
}

export function matchPlaces(levels, groups, terms, current) {
  return placeCandidates(levels)
    .filter((c) => matchesBy(groups, answers(c)))
    .map((c) => ({ ...c, rank: rankFor(c.name, terms) }))
    .sort((a, b) => a.rank - b.rank || (b.li === current) - (a.li === current));
}
