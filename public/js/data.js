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
/** The rates the build read off the executable, or null where the file has none. */
export const motionTable = () => shapes.motion;
/** What the game paints on every face, read off the executable, or null where the file has none. */
export const skinsTable = () => shapes.skins;
/** The game's shadow sprites, each a row of texels to a string, in base 32. */
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

// The game never shows the name the disc files a numbered level under, so
// where it differs from the number shown it is a curiosity for the note.
export const levelNote = (l) =>
  [
    levelTitle(l) !== l.name ? `On the disc this level is named ${l.name}.` : "",
    ann.levels[`${l.pack}#${l.index}`]?.note,
  ]
    .filter(Boolean)
    .join(" ");
/** The maximum a level can score where that is less than everything it holds, else null. */
export const levelScore = (l) => ann.levels[`${l.pack}#${l.index}`]?.score ?? null;
// The game numbers the levels it shows a number for itself rather than reading
// the pack's name, and five packs name a level something else.
export const levelTitle = (l) => l.shown || l.name;

const BEAM_KIND = 8;
const RAIL_KIND = 5;
// The kinds whose record is a block and nothing more, so all it carries is
// what stands on its faces. The others are a thing in their own right as well.
const PLAIN_KINDS = new Set([0, 1, 2, 3, 4]);
const PLAIN = 0;
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

// A raw word goes by its place in its slot, counted from the kind word.
const FIRST_FIELD = 2;
const VALUE_WORD = 14;
/** The name of the field at index `i` of a marker's fields. */
export const fieldKey = (i) => `f${i + FIRST_FIELD}`;
/** The index into a marker's fields of the field a name like `f3` names. */
export const fieldIndex = (key) => Number(key.slice(1)) - FIRST_FIELD;
/** The name of a slot's value word. */
export const VALUE_KEY = `f${VALUE_WORD}`;

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
    const variant = by ? String(o.f[fieldIndex(by)]) : null;
    const id = variant === null ? `t${o.type}` : `t${o.type}/${variant}`;
    out.push({ id, type: o.type, face: o.face, f: o.f, v: o.v, variant });
  }
  return out;
}

const SETTINGS_KIND = 9;
/** Whether a marker is a thing on a face, a block that is its own thing, or
    the level's settings, which are neither. */
export const markerGroup = (m) =>
  m.face !== null ? "object" : m.kind === SETTINGS_KIND ? "settings" : "block";

/** Among a cell's markers, the one for its block's own kind, or null where the kind is only a block. */
export const ownMarker = (marks, kind) =>
  marks.find((m) => m.face === null && m.kind === kind) ?? null;

// A variant may carry its own name, colour and points; what it leaves unsaid
// falls back to the type, and a marker for a record itself reads the kind.
const entry = (m) => (m.face === null ? ann.kinds[String(m.kind)] : ann.types[String(m.type)]);
const variant = (m) => (m.variant === null ? null : entry(m)?.variants?.[m.variant] || null);
export const markerName = (m) => variant(m)?.name || entry(m)?.name || null;
/** The name of the type or kind itself, whatever variant the marker is. */
export const entryName = (m) => entry(m)?.name || null;
export const markerLabel = (m) =>
  markerName(m) || (m.face === null ? `kind ${m.kind}` : `type ${m.type}`);
export const markerNote = (m) => entry(m)?.note || "";
export const markerHazard = (m) => entry(m)?.hazard === true;
export const markerColour = (m) =>
  variant(m)?.colour || (m.face === null ? kindColour(m.kind) : OBJECT_COLOUR);
export const markerPoints = (m) => variant(m)?.points ?? entry(m)?.points ?? 0;
// A thing that points is turned on its face in quarter turns about the inward
// normal, from a first tangent that is the world's +y laid onto the face, or
// the world's up on the +y face and its down on the -y face.
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
/** The way a marker's thing points, as a unit vector in the world, or null. */
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
/** The same, as an index into FACE_NORMAL, or null. */
export const markerFacing = (m) => {
  const v = markerHeading(m);
  if (!v) return null;
  const d = FACE_NORMAL.findIndex((n) => n.every((c, i) => c === v[i]));
  return d < 0 ? null : d;
};
// The field that numbers a level's pickups, set on the pickup types and no other.
const NUMBER_FIELD = 3;
/** The number the disc gives a pickup within its level, or null for anything unnumbered. */
export const markerNumber = (m) =>
  m.face === null || m.f[NUMBER_FIELD] === -1 ? null : m.f[NUMBER_FIELD];
// How the game writes a switched device's starting state.
const STATE_ON = 1;
const STATE_OFF = 2;
/** Whether a device a switch toggles starts on or off, or null for anything else. */
export const markerState = (m) => {
  const by = entry(m)?.state;
  if (!by || m.face === null) return null;
  const v = m.f[fieldIndex(by)];
  return v === STATE_ON ? "on" : v === STATE_OFF ? "off" : null;
};
/** The circuit a device a switch toggles is on, which is its colour, or null for anything else. */
export const markerCircuit = (m) => (markerState(m) === null ? null : m.f[fieldIndex(entry(m).by)]);
const pressesOf = (circuit) => state.presses.get(circuit) ?? [];
/** Whether a circuit has been turned over from how the level starts it. */
const turned = (circuit) => pressesOf(circuit).length % 2 === 1;
/** Whether a device a switch toggles is on or off now, or null for anything else. */
export const markerNow = (m) => {
  const start = markerState(m);
  if (start === null || !turned(markerCircuit(m))) return start;
  return start === "on" ? "off" : "on";
};
/** Whether a beam is lit now. */
export const litNow = (ray) => ray.lit !== turned(ray.colour);
/** Turn a circuit over at a frame of the clock, as pressing one of its switches does. */
export function flip(circuit, frame) {
  state.presses.set(circuit, [...pressesOf(circuit), frame]);
}
/** Keep every circuit turned as it is, as if turned before the clock's first frame. */
export function settleCircuits() {
  for (const [circuit, at] of state.presses) state.presses.set(circuit, at.length % 2 ? [0] : []);
}
/** How many frames of the clock up to `frame` a device has been on, from
    whether it starts on and the frames its circuit was turned over at. */
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
/** The frames a thing has moved for by `frame`: all of them, or for a device
    a switch toggles only those it has been on, since it stands still off. */
export const movedFor = (m, frame) =>
  markerState(m) === null
    ? frame
    : framesOn(markerState(m) === "on", pressesOf(markerCircuit(m)), frame);
/** Whether a device a switch toggles casts its light at `frame`, turning it
    over every `every` frames it has been on. */
export const lightOnAt = (m, every, frame) =>
  markerState(m) !== null &&
  glowing(every, markerState(m) === "on", pressesOf(markerCircuit(m)), frame);
const SWITCH = 9;
/** Whether a marker is a switch, whose press turns its circuit over. */
export const isSwitch = (m) => m.face !== null && m.type === SWITCH;
/** The colour the map gives a circuit, which its switches wear, or null where none is named. */
export const circuitColour = (circuit) =>
  ann.types[String(SWITCH)]?.variants?.[String(circuit)]?.colour ?? null;
// A teleporter names the one it sends the ball to by that one's record, times
// sixteen, plus its face.
const TELEPORTER = 5;
const DESTINATION = fieldIndex("f7");
/** Where a teleporter sends the ball, as a cell and a face, or null for anything else. */
export function markerDestination(m, l) {
  if (m.face === null || m.type !== TELEPORTER || m.f[DESTINATION] < 0) return null;
  const r = l.records[m.f[DESTINATION] >> 4];
  const face = m.f[DESTINATION] & 15;
  if (!r?.on.some((o) => o.face === face && o.type === TELEPORTER)) return null;
  return { x: r.x, y: r.y, z: r.z, face };
}
/** What the raw field at index `i` of a marker's fields holds, where that is settled, or null. */
export const fieldName = (m, i) => {
  if (i === NUMBER_FIELD && markerNumber(m) !== null) return "pickup number";
  const f = fieldKey(i);
  if (entry(m)?.facing === f) return "facing";
  if (entry(m)?.state === f) return "state";
  return entry(m)?.fields?.[f] ?? null;
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
// The start is where the ball is, on a plain face or on a clock, and the
// ball is thematic: the game picks the design by the world's place for an
// arcade level, one of three others for a bonus level in an order the
// player's path decides, and the glass one with the shards inside for a
// hidden level.
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
/** Where the ball stands as a level starts: the cell and the face. */
export const startsOf = (l) =>
  l.records.flatMap((r) =>
    r.on.filter((o) => STARTS.has(o.type)).map((o) => ({ x: r.x, y: r.y, z: r.z, face: o.face })),
  );
/** The model a marker draws, or null for one the game draws on the face; a
    thing that changes its form in play names the form to draw. */
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
/** The axis a moving platform is laid and runs along, 0 to 2 for x to z. */
export const platformAxis = (r) => PLATFORM_AXIS[r.f[0]] ?? 2;
/** The cells a moving platform's blocks stand on where its record puts it, its own first. */
export function platformCells(r) {
  const axis = platformAxis(r);
  return Array.from({ length: r.length || 1 }, (_, k) => {
    const at = [r.x, r.y, r.z];
    at[axis] += k;
    return at;
  });
}

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
  // A moving platform's route is laid the same way, from the middle of the
  // cell at one end of its run to the middle of the cell at the other.
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

/** Every block of a kind that is only a block, but a plain one, with its cell
    and a marker for it: the lattice keeps the kind as the cell's value, or
    the record the cell names keeps it where something stands on the block. */
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

/** A marker for every block of a kind that is only a block, but a plain one, one per block. */
export const blockMarkers = (l) => kindBlocks(l, state.data.firstRecord).map((b) => b.marker);

/** How many blocks a level puts in play: the lattice's, and the ones the game
    stands where the lattice leaves a cell empty, at the ends of a beam and
    along a moving platform. */
export function blockCount(l) {
  const cells = new Set();
  for (let i = 0; i < l.cells.length; i += 4) cells.add(cellKey(...l.cells.slice(i, i + 3)));
  for (const r of beams(l)) for (const c of [r.a, r.b]) cells.add(cellKey(...c));
  for (const r of l.records)
    if (r.kind === RAIL_KIND) for (const c of platformCells(r)) cells.add(cellKey(...c));
  return cells.size;
}
/** How many things stand on a level's faces. */
export const objectCount = (l) => l.records.reduce((n, r) => n + r.on.length, 0);
/** A count with its noun, singular for one. */
export const counted = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

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
