import { SIDE, cellKey } from "./state.js";

export const WORLD_TINT = {
  HIRO: "#93a8d4",
  HILLS: "#7fc96b",
  INCA: "#d8ad62",
  ARCTIC: "#96dcf2",
  COWBOY: "#e59a5c",
  FIELD: "#a8d963",
  ATLANT: "#5ad2c3",
  HAZE: "#b799e2",
  MARS: "#e5744c",
  HELL: "#d65a52",
};

let ann = { worlds: {}, kinds: {}, types: {}, levels: {} };
export const setAnnotations = (a) => {
  ann = { worlds: {}, kinds: {}, types: {}, levels: {}, ...a };
};

export async function loadJson(url, fallback) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    if (fallback !== undefined) return fallback;
    return null;
  }
}

export const worldName = (id) => ann.worlds[id]?.name || id;
export const worldNote = (id) => ann.worlds[id]?.note || "";

export const levelNote = (l) => ann.levels[`${l.pack}#${l.index}`]?.note || "";

const BEAM_KIND = 8;
// The kinds whose record is a block and nothing more, so all it carries is
// what stands on its faces. The others are a thing in their own right as well.
const PLAIN_KINDS = new Set([0, 1, 2, 3]);
/** A cell the lattice does not carry, so nothing about it can be read as a style. */
export const OFF_LATTICE = -1;

// The six faces of a block, in the order the game numbers them.
export const FACE_NORMAL = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, 1],
];
export const FACE_NAME = ["top", "+x side", "+y side", "-y side", "-x side", "underside"];

// What a record puts on the map: an object on each face that carries one and,
// for a kind that is its own thing, a marker for the record itself. Each has
// an id that names what it is rather than where, for the legend and search.
export function markersOf(r) {
  const out = [];
  if (!PLAIN_KINDS.has(r.kind))
    out.push({ id: `k${r.kind}`, kind: r.kind, type: r.type, f: r.f, face: null });
  for (const o of r.on) out.push({ id: `t${o.type}`, type: o.type, face: o.face, f: o.f, v: o.v });
  return out;
}

export const markerName = (m) =>
  (m.face === null ? ann.kinds[String(m.kind)] : ann.types[String(m.type)])?.name || null;
export const markerLabel = (m) =>
  markerName(m) || (m.face === null ? `kind ${m.kind}` : `type ${m.type}`);
export const markerNote = (m) =>
  (m.face === null ? ann.kinds[String(m.kind)] : ann.types[String(m.type)])?.note || "";
export const markerColour = (m) => (m.face === null ? kindColour(m.kind) : OBJECT_COLOUR);
export const kindName = (kind) => ann.kinds[String(kind)]?.name || null;

// A beam record spans two cells on one axis and nothing stands between them in
// any of the game's. The blocks at its ends are not always in the lattice, so
// the level is wider than the lattice alone says it is.
export const beams = (l) =>
  l.records
    .filter((r) => r.kind === BEAM_KIND)
    .map((r) => ({ a: r.f.slice(2, 5), b: r.f.slice(5, 8), lit: r.f[1] === 1, colour: r.colour }));

// A laser's circuit number, in the colour the game paints that circuit. Which
// is which was read off LEVEL 109, whose five beams line up red, yellow,
// green, yellow, red, and LEVEL 98, whose blue switch carries the number of
// the beam it turns off; a circuit not yet seen in play has no entry.
const BEAM_COLOUR = { 0: "#f5c542", 1: "#4f8ef7", 2: "#3ad07c", 3: "#ff4a4a" };
export const beamColour = (circuit) => BEAM_COLOUR[circuit] || null;

/** A cell lookup plus the per-cell records and markers, built once per level. */
export function index(l) {
  const cells = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    cells.set(cellKey(x, y, z), { x, y, z, v });
  }
  const rays = beams(l);
  for (const r of rays) {
    for (const [x, y, z] of [r.a, r.b]) {
      const k = cellKey(x, y, z);
      if (!cells.has(k)) cells.set(k, { x, y, z, v: OFF_LATTICE });
    }
  }
  const records = new Map();
  const markers = new Map();
  for (const r of l.records) {
    const k = cellKey(r.x, r.y, r.z);
    if (!records.has(k)) {
      records.set(k, []);
      markers.set(k, []);
    }
    records.get(k).push(r);
    markers.get(k).push(...markersOf(r));
  }
  return { cells, records, markers, rays };
}

export const levelMarkers = (l) => l.records.flatMap(markersOf);

/** How often each marker id is placed, and in how many levels, across the game. */
export function markerStats(data) {
  const stats = new Map();
  for (const l of data.levels) {
    const seen = new Map();
    for (const m of levelMarkers(l)) seen.set(m.id, (seen.get(m.id) || 0) + 1);
    for (const [k, n] of seen) {
      const s = stats.get(k) || { total: 0, levels: 0, only: 0 };
      s.total += n;
      s.levels += 1;
      if (n === 1) s.only += 1;
      stats.set(k, s);
    }
  }
  return stats;
}

// An object on a face is the marker in nine of every ten, so it takes the
// quiet colour and a record that is its own thing reads as the exception it
// is. Few enough kinds to pick by hand: spacing them by formula leaves several
// a few degrees apart.
const OBJECT_COLOUR = "#9fb3d1";
const KIND_COLOUR = {
  5: "#22d3ee",
  6: "#fbbf24",
  7: "#60a5fa",
  8: "#34d399",
  9: "#fb7185",
};

export const kindColour = (kind) => KIND_COLOUR[kind] || "#94a3b8";

export const inLattice = (v) => Number.isInteger(v) && v >= 0 && v < SIDE;
