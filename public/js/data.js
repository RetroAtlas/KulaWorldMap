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

export function kindName(kind, type) {
  const t = ann.types[`${kind}/${type}`];
  if (t?.name) return t.name;
  const k = ann.kinds[String(kind)];
  if (k?.name) return type === undefined ? k.name : `${k.name} ${type}`;
  return null;
}

export const kindNote = (kind, type) =>
  ann.types[`${kind}/${type}`]?.note || ann.kinds[String(kind)]?.note || "";

export const levelNote = (l) => ann.levels[`${l.pack}#${l.index}`]?.note || "";

const BEAM_KIND = 8;
/** A cell the lattice does not carry, so nothing about it can be read as a style. */
export const OFF_LATTICE = -1;

// A beam record spans two cells on one axis and nothing stands between them in
// any of the game's. The blocks at its ends are not always in the lattice, so
// the level is wider than the lattice alone says it is.
export const beams = (l) =>
  l.objects
    .filter((o) => o.kind === BEAM_KIND)
    .map((o) => ({ a: o.f.slice(2, 5), b: o.f.slice(5, 8), lit: o.f[1] === 1, colour: o.colour }));

// A laser's circuit number, in the colour the game paints that circuit. Which
// is which was read off LEVEL 109, whose five beams line up red, yellow,
// green, yellow, red, and LEVEL 98, whose blue switch carries the number of
// the beam it turns off; a circuit not yet seen in play has no entry.
const BEAM_COLOUR = { 0: "#f5c542", 1: "#4f8ef7", 2: "#3ad07c", 3: "#ff4a4a" };
export const beamColour = (circuit) => BEAM_COLOUR[circuit] || null;

/** A cell lookup plus the per-cell object list, built once per level. */
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
  const objects = new Map();
  for (const o of l.objects) {
    const k = cellKey(o.x, o.y, o.z);
    if (!objects.has(k)) objects.set(k, []);
    objects.get(k).push(o);
  }
  return { cells, objects, rays };
}

/** How often a (kind, type) is placed, and in how many levels, across the game. */
export function kindStats(data) {
  const stats = new Map();
  for (const l of data.levels) {
    const seen = new Map();
    for (const o of l.objects) {
      const k = `${o.kind}/${o.type}`;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
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

// Nine kinds is few enough to pick colours for: spacing that many by formula
// leaves several of them a few degrees apart. Kind 0 is three markers in every
// four, so it takes the quiet one and the rest read as the exceptions they are.
const KIND_COLOUR = {
  0: "#9fb3d1",
  1: "#a78bfa",
  2: "#e879f9",
  3: "#a3e635",
  5: "#22d3ee",
  6: "#fbbf24",
  7: "#60a5fa",
  8: "#34d399",
  9: "#fb7185",
};

export const kindColour = (kind) => KIND_COLOUR[kind] || "#94a3b8";

export const inLattice = (v) => Number.isInteger(v) && v >= 0 && v < SIDE;
