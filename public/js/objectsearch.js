// No DOM, so it stays importable in bare Node.
import { cellKey } from "./state.js";
import { FACE_NAME, DIRECTION_NAME } from "./faces.js";
import {
  markersOf,
  kindBlocks,
  markerLabel,
  entryName,
  markerFacing,
  markerState,
  markerPoints,
  fieldKey,
  VALUE_KEY,
} from "./data.js";
import { matchesBy, rankFor } from "./searchquery.js";
import { indexed, answers, whole } from "./searchtext.js";

// A row always shows the pairs that tell two of a thing apart in play, and the
// rest only where a term matched them.
function pairs(m) {
  const shown = [];
  const facing = markerFacing(m);
  if (facing !== null) shown.push(`facing=${DIRECTION_NAME[facing]}`);
  const state = markerState(m);
  if (state !== null) shown.push(`starts=${state}`);
  const more = [];
  if (m.face === null) more.push(`kind=${m.kind}`);
  if (m.type !== null) more.push(`type=${m.type}`);
  const points = markerPoints(m);
  if (points) more.push(`points=${points}`);
  m.f.forEach((v, i) => {
    if (v !== -1) more.push(`${fieldKey(i)}=${v}`);
  });
  if (m.v !== undefined && m.v !== -1) more.push(`${VALUE_KEY}=${m.v}`);
  return { shown, more };
}

function candidate(li, l, at, m) {
  const name = markerLabel(m);
  const family = entryName(m);
  const face = m.face === null ? null : FACE_NAME[m.face];
  const cell = `${at.x},${at.y},${at.z}`;
  const { shown, more } = pairs(m);
  const words = [
    name,
    family !== name ? family : null,
    m.face === null ? `kind ${m.kind}` : null,
    m.type !== null ? `type ${m.type}` : null,
    face,
    ...shown,
    ...more,
  ];
  return {
    li,
    level: l,
    at: { x: at.x, y: at.y, z: at.z },
    marker: m,
    key: cellKey(at.x, at.y, at.z),
    name,
    face,
    cell,
    shown,
    more,
    ...indexed(words),
  };
}

function candidates(data) {
  const out = [];
  data.levels.forEach((l, li) => {
    for (const r of l.records) for (const m of markersOf(r)) out.push(candidate(li, l, r, m));
    for (const b of kindBlocks(l, data.firstRecord)) out.push(candidate(li, l, b, b.marker));
  });
  return out;
}

// Nothing the index reads changes after boot.
const cache = new WeakMap();

export function objectCandidates(data) {
  let rows = cache.get(data);
  if (!rows) cache.set(data, (rows = candidates(data)));
  return rows;
}

// A bare number is explained by a type or a kind pair.
const NUMBERED = /^(type|kind)=/;
const explains = (pair, t) =>
  !whole(t)
    ? pair.includes(t)
    : pair === t || (/^\d+$/.test(t) && NUMBERED.test(pair) && pair.endsWith(`=${t}`));

export function rowOf(h, terms) {
  const own = answers(indexed([h.name, h.face, ...h.shown]));
  const missing = terms.filter((t) => !own(t));
  const matched = h.more.filter((s) => missing.some((t) => explains(s, t)));
  return [h.face, h.cell, ...h.shown, ...matched].filter(Boolean);
}

export function matchObjects(data, groups, terms) {
  return objectCandidates(data)
    .filter((c) => matchesBy(groups, answers(c)))
    .map((c) => ({ ...c, rank: rankFor(c.name, terms) }));
}
