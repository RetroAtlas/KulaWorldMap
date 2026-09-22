// The map's own places as search targets: a world, or a level within it. No
// DOM, so it stays importable in bare Node.
import { worldName, levelTitle } from "./data.js";
import { matchesBy, rankFor } from "./searchquery.js";
import { indexed, answers } from "./searchtext.js";

// The Final is counted on from 150 by the game and the walkthrough, so its
// seventh level answers to 157 as well as to 7.
const ARCADE = 150;

function candidates(data) {
  const out = [];
  for (const w of data.themes) {
    const name = worldName(w.id);
    out.push({ world: w, name, ...indexed([w.id, name]) });
  }
  data.levels.forEach((l, li) => {
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

// The index holds names, which nothing changes after boot, so the key needs
// no invalidation.
const cache = new WeakMap();

export function placeCandidates(data) {
  let rows = cache.get(data);
  if (!rows) cache.set(data, (rows = candidates(data)));
  return rows;
}

/** The worlds and levels a query names, best name match first and the level in hand before its peers. */
export function matchPlaces(data, groups, terms, current) {
  return placeCandidates(data)
    .filter((c) => matchesBy(groups, answers(c)))
    .map((c) => ({ ...c, rank: rankFor(c.name, terms) }))
    .sort((a, b) => a.rank - b.rank || (b.li === current) - (a.li === current));
}
