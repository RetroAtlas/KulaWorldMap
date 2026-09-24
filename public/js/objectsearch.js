// Every object the game places, one candidate each, as search targets: what
// it is, where it stands, and the fields its record carries, decoded where
// the map decodes them and raw beside that. No DOM, so it stays importable
// in bare Node.
import { cellKey } from "./state.js";
import {
  FACE_NAME,
  DIRECTION_NAME,
  markersOf,
  markerLabel,
  entryName,
  markerNumber,
  markerFacing,
  markerState,
  markerPoints,
  fieldKey,
  VALUE_KEY,
} from "./data.js";
import { matchesBy, rankFor } from "./searchquery.js";
import { indexed, answers } from "./searchtext.js";

// The pairs a row always shows are what tells two of a thing apart in play;
// the rest show only when a term matched them, the number of the type first,
// so a search by number says on every row why the row is there.
function pairs(m) {
  const shown = [];
  const number = markerNumber(m);
  if (number !== null) shown.push(`number=${number}`);
  const facing = markerFacing(m);
  if (facing !== null) shown.push(`facing=${DIRECTION_NAME[facing]}`);
  const state = markerState(m);
  if (state !== null) shown.push(`starts=${state}`);
  const more = [];
  if (m.face === null) more.push(`kind=${m.kind}`);
  more.push(`type=${m.type}`);
  const points = markerPoints(m);
  if (points) more.push(`points=${points}`);
  m.f.forEach((v, i) => {
    if (v !== -1) more.push(`${fieldKey(i)}=${v}`);
  });
  if (m.v !== undefined && m.v !== -1) more.push(`${VALUE_KEY}=${m.v}`);
  return { shown, more };
}

function candidate(li, l, r, m) {
  const name = markerLabel(m);
  const family = entryName(m);
  const face = m.face === null ? null : FACE_NAME[m.face];
  const cell = `${r.x},${r.y},${r.z}`;
  const { shown, more } = pairs(m);
  const words = [
    name,
    family !== name ? family : null,
    m.face === null ? `kind ${m.kind}` : null,
    `type ${m.type}`,
    m.id,
    face,
    ...shown,
    ...more,
  ];
  return {
    li,
    level: l,
    record: r,
    marker: m,
    key: cellKey(r.x, r.y, r.z),
    name,
    where: face ? `${face} · ${cell}` : cell,
    shown,
    more,
    ...indexed(words),
  };
}

function candidates(data) {
  const out = [];
  data.levels.forEach((l, li) => {
    for (const r of l.records) for (const m of markersOf(r)) out.push(candidate(li, l, r, m));
  });
  return out;
}

// The index reads the records and the names, which nothing changes after
// boot, so the key needs no invalidation.
const cache = new WeakMap();

export function objectCandidates(data) {
  let rows = cache.get(data);
  if (!rows) cache.set(data, (rows = candidates(data)));
  return rows;
}

/** Every object a query matches, in the disc's order, each with its name's rank. */
export function matchObjects(data, groups, terms) {
  return objectCandidates(data)
    .filter((c) => matchesBy(groups, answers(c)))
    .map((c) => ({ ...c, rank: rankFor(c.name, terms) }));
}
