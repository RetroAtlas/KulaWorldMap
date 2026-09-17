import { state, SIDE, cellKey } from "./state.js";

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

let shapes = { block: 512, types: {}, balls: [], motion: null };
export const setObjects = (o) => {
  shapes = { block: 512, types: {}, balls: [], motion: null, ...o };
};
export const modelUnit = () => 1 / shapes.block;
/** The rates the build read off the executable, or null where the file has none. */
export const motionTable = () => shapes.motion;
export const motionOf = (m) =>
  m.face === null ? null : (shapes.motion?.types[String(m.type)] ?? null);

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
/** The maximum a level can score where that is less than everything it holds, else null. */
export const levelScore = (l) => ann.levels[`${l.pack}#${l.index}`]?.score ?? null;
// The game numbers the levels it shows a number for itself rather than reading
// the pack's name, and five packs name a level something else.
export const levelTitle = (l) => l.shown || l.name;

const BEAM_KIND = 8;
const RAIL_KIND = 5;
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
export const DIRECTION_NAME = ["-z", "+x", "+y", "-y", "-x", "+z"];

// What a record puts on the map: an object on each face that carries one and,
// for a kind that is its own thing, a marker for the record itself. Each has
// an id that names what it is rather than where, for the legend and search.
// A type's annotation may single out one field as telling its variants apart,
// a colour or a tier, and then the id carries that field's value too.
export function markersOf(r) {
  const out = [];
  if (!PLAIN_KINDS.has(r.kind))
    out.push({ id: `k${r.kind}`, kind: r.kind, type: r.type, f: r.f, face: null, variant: null });
  for (const o of r.on) {
    const by = ann.types[String(o.type)]?.by;
    const variant = by ? String(o.f[Number(by.slice(1)) - 5]) : null;
    const id = variant === null ? `t${o.type}` : `t${o.type}/${variant}`;
    out.push({ id, type: o.type, face: o.face, f: o.f, v: o.v, variant });
  }
  return out;
}

// A variant may carry its own name, colour and points; what it leaves unsaid
// falls back to the type, and a marker for a record itself reads the kind.
const entry = (m) => (m.face === null ? ann.kinds[String(m.kind)] : ann.types[String(m.type)]);
const variant = (m) => (m.variant === null ? null : entry(m)?.variants?.[m.variant] || null);
export const markerName = (m) => variant(m)?.name || entry(m)?.name || null;
export const markerLabel = (m) =>
  markerName(m) || (m.face === null ? `kind ${m.kind}` : `type ${m.type}`);
export const markerNote = (m) => entry(m)?.note || "";
export const markerColour = (m) =>
  variant(m)?.colour || (m.face === null ? kindColour(m.kind) : OBJECT_COLOUR);
export const markerPoints = (m) => variant(m)?.points ?? entry(m)?.points ?? 0;
// A thing that points is turned on its face in quarter turns about the inward
// normal, from a first tangent that is the world's +y laid onto the face, or
// the world's up where the face runs across y: the arrows of LEVEL 62 on the
// top and of LEVEL 106 on three sides turn that way in play.
export const TANGENT = [
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, -1],
  [0, 1, 0],
  [0, 1, 0],
];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** The way a marker's thing points, as a unit vector in the world, or null. */
export const markerHeading = (m) => {
  const by = entry(m)?.facing;
  if (!by || m.face === null) return null;
  const turns = m.f[Number(by.slice(1)) - 5] - 1;
  if (turns < 0 || turns > 3) return null;
  const axis = FACE_NORMAL[m.face].map((v) => -v);
  let v = TANGENT[m.face];
  for (let i = 0; i < turns; i++) v = cross(axis, v);
  return v;
};
/** The same, as an index into FACE_NORMAL, or null. */
export const markerFacing = (m) => {
  const v = markerHeading(m);
  if (!v) return null;
  const d = FACE_NORMAL.findIndex((n) => n.every((c, i) => c === v[i]));
  return d < 0 ? null : d;
};
// The field that numbers a level's pickups, set on the pickup types and no other.
const NUMBER_FIELD = 3;
/** A pickup's number within its level, or null for anything unnumbered. */
export const markerNumber = (m) =>
  m.face === null || m.f[NUMBER_FIELD] === -1 ? null : m.f[NUMBER_FIELD];
// How the game writes a switched device's starting state.
const STATE_ON = 1;
const STATE_OFF = 2;
/** Whether a device a switch toggles starts on or off, or null for anything else. */
export const markerState = (m) => {
  const by = entry(m)?.state;
  if (!by || m.face === null) return null;
  const v = m.f[Number(by.slice(1)) - 5];
  return v === STATE_ON ? "on" : v === STATE_OFF ? "off" : null;
};
export const kindName = (kind) => ann.kinds[String(kind)]?.name || null;

// The five fruit are five types, and in the arcade levels the game shows the
// one the player needs next, which is the level's number counted round the
// five; every other level shows its type's own.
const FRUIT_FIRST = 43;
const FRUIT = 5;
// A variant the level opens on where no field picks one: the exit is red until
// the keys are found, and its green model comes first.
const OPENS_ON = { 7: 1 };
// The start is where the ball is, and the ball is thematic: the game picks
// the design by the world's place for an arcade level, one of three others
// for a bonus level in an order the player's path decides, and the glass one
// with the shards inside for a hidden level.
const START = 30;
const BONUS_BALL = 10;
const BONUS_BALLS = 3;
const HIDDEN_BALL = 13;
const WORLD_LEVELS = 15;
const HIDDEN = WORLD_LEVELS + BONUS_BALLS;
export function ballFor(l) {
  const world = state.data.themes.findIndex((t) => t.id === l.theme);
  const slot = l.pack.endsWith("FI.PAK") ? 0 : l.index;
  let design = world;
  if (slot === HIDDEN) design = HIDDEN_BALL;
  else if (slot >= WORLD_LEVELS && slot < HIDDEN) design = BONUS_BALL + (slot - WORLD_LEVELS);
  return shapes.balls[design] || shapes.balls[0] || null;
}
/** The model a marker draws, or null for one the game draws on the face; a
    thing that changes its form in play names the form to draw. */
export function markerModel(m, l, form = null) {
  if (m.face === null) return null;
  if (m.type === START) return ballFor(l);
  let type = m.type;
  const n = /^LEVEL (\d+)$/.exec(l.shown || "");
  if (n && type >= FRUIT_FIRST && type < FRUIT_FIRST + FRUIT)
    type = FRUIT_FIRST + ((Number(n[1]) - 1) % FRUIT);
  const models = shapes.types[String(type)];
  if (!models) return null;
  const variant = form ?? (m.variant !== null ? Number(m.variant) : (OPENS_ON[type] ?? 0));
  return models[variant] || models[0];
}
export const kindNote = (kind) => ann.kinds[String(kind)]?.note || "";

// A beam record spans two cells on one axis and nothing stands between them in
// any of the game's. The blocks at its ends are not always in the lattice, so
// the level is wider than the lattice alone says it is.
export const beams = (l) =>
  l.records
    .filter((r) => r.kind === BEAM_KIND)
    .map((r) => {
      const a = r.f.slice(2, 5),
        b = r.f.slice(5, 8);
      return {
        a,
        b,
        axis: [0, 1, 2].find((i) => a[i] !== b[i]),
        lit: r.f[1] === 1,
        colour: r.colour,
      };
    });

// A moving platform's record has the same shape: the block and the far end of
// its run, on one axis.
export const rails = (l) =>
  l.records
    .filter((r) => r.kind === RAIL_KIND)
    .map((r) => ({ a: r.f.slice(2, 5), b: r.f.slice(5, 8) }));

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
  // A beam is drawn a cell at a time so that each stretch takes its place
  // among the blocks: the cells it crosses are empty, so a stretch sorts as
  // a block there would, and a block in front of it hides it.
  const beamCells = new Map();
  for (const r of rays) {
    for (const [x, y, z] of [r.a, r.b]) {
      const k = cellKey(x, y, z);
      if (!cells.has(k)) cells.set(k, { x, y, z, v: OFF_LATTICE });
    }
    const lo = Math.min(r.a[r.axis], r.b[r.axis]);
    const hi = Math.max(r.a[r.axis], r.b[r.axis]);
    for (let t = lo + 1; t < hi; t++) {
      const cell = [...r.a];
      cell[r.axis] = t;
      const k = cellKey(...cell);
      if (!beamCells.has(k)) beamCells.set(k, { x: cell[0], y: cell[1], z: cell[2], beams: [] });
      beamCells.get(k).beams.push({ ray: r, k: t - lo - 1 });
    }
  }
  const records = new Map();
  const markers = new Map();
  // Two pickups with one number are a pair the game cannot tell apart, so
  // each number keeps the markers that carry it, with the cell each stands on.
  const numbered = new Map();
  for (const r of l.records) {
    const k = cellKey(r.x, r.y, r.z);
    if (!records.has(k)) {
      records.set(k, []);
      markers.set(k, []);
    }
    records.get(k).push(r);
    for (const m of markersOf(r)) {
      markers.get(k).push(m);
      const n = markerNumber(m);
      if (n === null) continue;
      if (!numbered.has(n)) numbered.set(n, []);
      numbered.get(n).push({ m, cell: [r.x, r.y, r.z] });
    }
  }
  return { cells, records, markers, numbered, beamCells, rails: rails(l) };
}

export const levelMarkers = (l) => l.records.flatMap(markersOf);

// Every world pack keeps its three bonus levels in the same slots, and a bonus
// level scores each block rolled over rather than an exit reached.
const BONUS_SLOTS = [15, 16, 17];
const BLOCK_POINTS = 50;
const INVISIBLE_KIND = 3;

/** The blocks a bonus level counts: rolling over an invisible one scores nothing. */
function tallied(l) {
  const kindAt = new Map(l.records.map((r) => [cellKey(r.x, r.y, r.z), r.kind]));
  let n = 0;
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    const kind = v < state.data.firstRecord ? v : kindAt.get(cellKey(x, y, z));
    if (kind !== INVISIBLE_KIND) n++;
  }
  return n;
}

/** What collecting everything on a level would score. */
export function levelPoints(l) {
  let points = levelMarkers(l).reduce((sum, m) => sum + markerPoints(m), 0);
  if (BONUS_SLOTS.includes(l.index)) points += BLOCK_POINTS * tallied(l);
  return points;
}

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
