import { SIDE, cellKey } from "./state.js";

export const WORLD_TINT = {
  HIRO: "#7f8db0",
  HILLS: "#6fae5a",
  INCA: "#b99451",
  ARCTIC: "#7fc6e0",
  COWBOY: "#c98a4b",
  FIELD: "#8ab84f",
  ATLANT: "#4fb3a8",
  HAZE: "#9a7fc0",
  MARS: "#c4643f",
  HELL: "#b04a4a",
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
  } catch (e) {
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

export const levelLabel = (l) => l.name;

/** A cell lookup plus the per-cell object list, built once per level. */
export function index(l) {
  const cells = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    cells.set(cellKey(x, y, z), { x, y, z, v });
  }
  const objects = new Map();
  for (const o of l.objects) {
    const k = cellKey(o.x, o.y, o.z);
    if (!objects.has(k)) objects.set(k, []);
    objects.get(k).push(o);
  }
  return { cells, objects };
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

export function kindColour(kind) {
  const hue = (kind * 47 + 200) % 360;
  return `hsl(${hue} 78% 62%)`;
}

export const inLattice = (v) => Number.isInteger(v) && v >= 0 && v < SIDE;
