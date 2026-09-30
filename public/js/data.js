import { state, SIDE, cellKey } from "./state.js";
import { platesOf } from "./skins.js";
import { glowing } from "./motion.js";

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

let shapes = { block: 512, types: {}, balls: [], shadows: [], motion: null, skins: null };
export const setObjects = (o) => {
  shapes = { block: 512, types: {}, balls: [], shadows: [], motion: null, skins: null, ...o };
};
export const modelUnit = () => 1 / shapes.block;
export const motionTable = () => shapes.motion;
export const skinsTable = () => shapes.skins;
export const shadowSprites = () => shapes.shadows;
export const motionOf = (m) =>
  m.face === null
    ? null
    : (shapes.motion?.types[String(STARTS.has(m.type) ? START : m.type)] ?? null);
export const kindMotion = (kind) => shapes.motion?.kinds[String(kind)] ?? null;

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

export const levelNote = (l) =>
  [
    levelTitle(l) !== l.name ? `The game's files name this level ${l.name}.` : "",
    ann.levels[`${l.pack}#${l.index}`]?.note,
  ]
    .filter(Boolean)
    .join(" ");
/** The maximum a level can score where that is less than everything it holds, else null. */
export const levelScore = (l) => ann.levels[`${l.pack}#${l.index}`]?.score ?? null;
export const levelTitle = (l) => l.shown || l.name;

const BEAM_KIND = 8;
const RAIL_KIND = 5;
// The kinds whose record is a block and nothing more; the others are a thing
// in their own right as well.
const PLAIN_KINDS = new Set([0, 1, 2, 3, 4]);
const PLAIN = 0;
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

// A raw word goes by its place in its slot, counted from the kind word.
const FIRST_FIELD = 2;
const VALUE_WORD = 14;
export const fieldKey = (i) => `f${i + FIRST_FIELD}`;
export const fieldIndex = (key) => Number(key.slice(1)) - FIRST_FIELD;
export const VALUE_KEY = `f${VALUE_WORD}`;

export function markersOf(r) {
  const out = [];
  if (!PLAIN_KINDS.has(r.kind))
    out.push({ id: `k${r.kind}`, kind: r.kind, type: r.type, f: r.f, face: null, variant: null });
  for (const o of r.on) {
    const by = ann.types[String(o.type)]?.by;
    const variant = by ? String(o.f[fieldIndex(by)]) : null;
    const id = variant === null ? `t${o.type}` : `t${o.type}/${variant}`;
    out.push({ id, type: o.type, face: o.face, f: o.f, v: o.v, variant });
  }
  return out;
}

const SETTINGS_KIND = 9;
export const markerGroup = (m) =>
  m.face !== null ? "object" : m.kind === SETTINGS_KIND ? "settings" : "block";

export const ownMarker = (marks, kind) =>
  marks.find((m) => m.face === null && m.kind === kind) ?? null;

const entry = (m) => (m.face === null ? ann.kinds[String(m.kind)] : ann.types[String(m.type)]);
const variant = (m) => (m.variant === null ? null : entry(m)?.variants?.[m.variant] || null);
export const markerName = (m) => variant(m)?.name || entry(m)?.name || null;
export const entryName = (m) => entry(m)?.name || null;
export const markerLabel = (m) =>
  markerName(m) || (m.face === null ? `kind ${m.kind}` : `type ${m.type}`);
export const markerNote = (m) => entry(m)?.note || "";
export const markerHazard = (m) => entry(m)?.hazard === true;
export const markerColour = (m) =>
  variant(m)?.colour || (m.face === null ? kindColour(m.kind) : OBJECT_COLOUR);
export const markerPoints = (m) => variant(m)?.points ?? entry(m)?.points ?? 0;
// A thing that points is turned in quarter turns about its face's inward
// normal, from this first tangent.
export const TANGENT = [
  [0, 1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 0],
];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const markerHeading = (m) => {
  const by = entry(m)?.facing;
  if (!by || m.face === null) return null;
  const turns = m.f[fieldIndex(by)] - 1;
  if (turns < 0 || turns > 3) return null;
  const axis = FACE_NORMAL[m.face].map((v) => -v);
  let v = TANGENT[m.face];
  for (let i = 0; i < turns; i++) v = cross(axis, v);
  return v;
};
export const markerFacing = (m) => {
  const v = markerHeading(m);
  if (!v) return null;
  const d = FACE_NORMAL.findIndex((n) => n.every((c, i) => c === v[i]));
  return d < 0 ? null : d;
};
const NUMBER_FIELD = 3;
export const markerNumber = (m) =>
  m.face === null || m.f[NUMBER_FIELD] === -1 ? null : m.f[NUMBER_FIELD];
const STATE_ON = 1;
const STATE_OFF = 2;
/** How a device a switch toggles starts, or null for anything else. */
export const markerState = (m) => {
  const by = entry(m)?.state;
  if (!by || m.face === null) return null;
  const v = m.f[fieldIndex(by)];
  return v === STATE_ON ? "on" : v === STATE_OFF ? "off" : null;
};
/** A switched device's circuit, which is its colour. */
export const markerCircuit = (m) => (markerState(m) === null ? null : m.f[fieldIndex(entry(m).by)]);
const pressesOf = (circuit) => state.presses.get(circuit) ?? [];
const turned = (circuit) => pressesOf(circuit).length % 2 === 1;
export const markerNow = (m) => {
  const start = markerState(m);
  if (start === null || !turned(markerCircuit(m))) return start;
  return start === "on" ? "off" : "on";
};
export const litNow = (ray) => ray.lit !== turned(ray.colour);
export function flip(circuit, frame) {
  state.presses.set(circuit, [...pressesOf(circuit), frame]);
}
/** Keep every circuit turned as it is, as if turned before the clock's first frame. */
export function settleCircuits() {
  for (const [circuit, at] of state.presses) state.presses.set(circuit, at.length % 2 ? [0] : []);
}
export function framesOn(on, presses, frame) {
  let total = 0;
  let from = 0;
  for (const at of presses) {
    if (at >= frame) break;
    if (on) total += at - from;
    on = !on;
    from = at;
  }
  return on ? total + frame - from : total;
}
export const movedFor = (m, frame) =>
  markerState(m) === null
    ? frame
    : framesOn(markerState(m) === "on", pressesOf(markerCircuit(m)), frame);
/** Whether a switched device casts its light at `frame`, turning it over
    every `every` frames it has been on. */
export const lightOnAt = (m, every, frame) =>
  markerState(m) !== null &&
  glowing(every, markerState(m) === "on", pressesOf(markerCircuit(m)), frame);
const SWITCH = 9;
export const isSwitch = (m) => m.face !== null && m.type === SWITCH;
export const circuitColour = (circuit) =>
  ann.types[String(SWITCH)]?.variants?.[String(circuit)]?.colour ?? null;
// A teleporter names the one it sends the ball to by that one's record, times
// sixteen, plus its face.
const TELEPORTER = 5;
const DESTINATION = fieldIndex("f7");
export function markerDestination(m, l) {
  if (m.face === null || m.type !== TELEPORTER || m.f[DESTINATION] < 0) return null;
  const r = l.records[m.f[DESTINATION] >> 4];
  const face = m.f[DESTINATION] & 15;
  if (!r?.on.some((o) => o.face === face && o.type === TELEPORTER)) return null;
  return { x: r.x, y: r.y, z: r.z, face };
}
export const fieldName = (m, i) => {
  if (i === NUMBER_FIELD && markerNumber(m) !== null) return "pickup number";
  const f = fieldKey(i);
  if (entry(m)?.facing === f) return "facing";
  if (entry(m)?.state === f) return "state";
  return entry(m)?.fields?.[f] ?? null;
};
export const kindName = (kind) => ann.kinds[String(kind)]?.name || null;

// Where the game numbers a level, every fruit shows as the one the player
// needs next: the level's number counted round the fruit.
const FRUIT_FIRST = 43;
const FRUIT = 5;
// The variant a level opens on where no field picks one.
const OPENS_ON = { 7: 1 }; // the exit, red until the keys are found
// The ball starts on a plain face or on a clock.
const START = 30;
const STARTS = new Set([29, START]);
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
export const startsOf = (l) =>
  l.records.flatMap((r) =>
    r.on
      .filter((o) => STARTS.has(o.type))
      .map((o) => ({ x: r.x, y: r.y, z: r.z, face: o.face, type: o.type, f: o.f })),
  );
/** Null for a thing the game draws on the face; `form` names the form to draw
    of a thing that changes in play. */
export function markerModel(m, l, form = null) {
  if (m.face === null) return null;
  if (STARTS.has(m.type)) return ballFor(l);
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
export const kindHazard = (kind) => ann.kinds[String(kind)]?.hazard === true;
// A beam's ends belong to the laser, so a block standing at either one carries
// its mark whatever the lattice holds there.
export const blockHazard = (kind, end) =>
  (kind !== null && kindHazard(kind)) || (end && kindHazard(BEAM_KIND));
/** A beam's end that holds a block of its own rather than the laser's record. */
export const farEnd = (kind, end) => end && kind !== null && kind !== BEAM_KIND;

// A beam record spans two cells on one axis, and the blocks at its ends are
// not always in the lattice.
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
    .map((r) => {
      const a = r.f.slice(2, 5),
        b = r.f.slice(5, 8);
      return {
        a,
        b,
        axis: [0, 1, 2].find((i) => a[i] !== b[i]),
        cell: [r.x, r.y, r.z],
        length: r.length || 1,
      };
    });

// A moving platform is as many blocks as its record says, laid from its cell
// along the axis its first field names.
const PLATFORM_AXIS = { 1: 0, 2: 1 };
export const platformAxis = (r) => PLATFORM_AXIS[r.f[0]] ?? 2;
export function platformCells(r) {
  const axis = platformAxis(r);
  return Array.from({ length: r.length || 1 }, (_, k) => {
    const at = [r.x, r.y, r.z];
    at[axis] += k;
    return at;
  });
}

export function index(l) {
  const cells = new Map();
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    cells.set(cellKey(x, y, z), { x, y, z, v });
  }
  const rays = beams(l);
  // A beam is split a cell at a time, so each stretch sorts among the blocks
  // as a block in its empty cell would.
  const beamCells = new Map();
  const beamEnds = new Set();
  for (const r of rays) {
    for (const [x, y, z] of [r.a, r.b]) {
      const k = cellKey(x, y, z);
      beamEnds.add(k);
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
  // A platform's route is split the same way, over its run's end cells too.
  const railCells = new Map();
  for (const r of rails(l)) {
    const lo = Math.min(r.a[r.axis], r.b[r.axis]);
    const hi = Math.max(r.a[r.axis], r.b[r.axis]);
    for (let t = lo; t <= hi; t++) {
      const cell = [...r.a];
      cell[r.axis] = t;
      const k = cellKey(...cell);
      if (!railCells.has(k)) railCells.set(k, { x: cell[0], y: cell[1], z: cell[2], rails: [] });
      railCells.get(k).rails.push(r);
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
    for (const m of markersOf(r)) markers.get(k).push(m);
  }
  return { cells, records, markers, beamCells, railCells, beamEnds, plates: platesOf(rays) };
}

export const levelMarkers = (l) => l.records.flatMap(markersOf);

/** Every block of a kind that is only a block, but not a plain one. The lattice
    keeps the kind as the cell's value, or the record the cell names keeps it
    where something stands on the block. */
export function kindBlocks(l, first) {
  const out = [];
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    const kind = v < first ? v : l.records[v - first].kind;
    if (kind !== PLAIN && PLAIN_KINDS.has(kind))
      out.push({
        x,
        y,
        z,
        marker: { id: `k${kind}`, kind, type: null, f: [], face: null, variant: null },
      });
  }
  return out;
}

export const blockMarkers = (l) => kindBlocks(l, state.data.firstRecord).map((b) => b.marker);

export function blockCount(l) {
  const cells = new Set();
  for (let i = 0; i < l.cells.length; i += 4) cells.add(cellKey(...l.cells.slice(i, i + 3)));
  for (const r of beams(l)) for (const c of [r.a, r.b]) cells.add(cellKey(...c));
  for (const r of l.records)
    if (r.kind === RAIL_KIND) for (const c of platformCells(r)) cells.add(cellKey(...c));
  return cells.size;
}
export const objectCount = (l) => l.records.reduce((n, r) => n + r.on.length, 0);
export const counted = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// Every world pack keeps its bonus levels in the same slots, and a bonus level
// scores each block rolled over.
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

export function levelPoints(l) {
  let points = levelMarkers(l).reduce((sum, m) => sum + markerPoints(m), 0);
  if (BONUS_SLOTS.includes(l.index)) points += BLOCK_POINTS * tallied(l);
  return points;
}

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
