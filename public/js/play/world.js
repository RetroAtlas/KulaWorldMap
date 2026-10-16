// The level as play holds it: what stands where, what travels and what has gone, built once from
// the level and probed as the ball rolls, in the game's units.
import { SIDE, cellKey, FACE_NORMAL } from "../format/lattice.js";
import { OFF_LATTICE, beams, platformCells, startsOf } from "../viewer/data.js";
import { probe, walkers, dice } from "../viewer/travel.js";
import { faceUnder } from "./ball.js";

const LOW = 1;
const HIGH = SIDE - 2;
const PLAIN = 0;
const ICE = 2;
const PLATFORM = 5;
const CRUMBLING = 6;
const CLOCK_START = 29;

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const inside = (cell) => cell.every((v) => v >= LOW && v <= HIGH);
const slot = (key, face) => `${key}/${face}`;
const byVariant = (v, m) => (Array.isArray(v) ? (v[Number(m.variant)] ?? v[0]) : v);
const cellOf = (b, p) => p.map((c) => Math.floor((c + b.half) / b.unit));

/** The level as play holds it, the walkers laid at `frame`: the lattice's words and kinds by
    cell, the faces' types, the word each kind reads as under the ball, the pickups with where
    each stands, the devices, the crumbling blocks, the platforms, what travels and the dice, the
    live sets and the index the frame draws. */
export function worldOf(l, idx, tables, circuits, frame = 0) {
  const { motion, unit, first, styles } = tables;
  const cells = new Map();
  for (let i = 0; i < l.cells.length; i += 4)
    cells.set(cellKey(l.cells[i], l.cells[i + 1], l.cells[i + 2]), l.cells[i + 3]);
  for (const ray of beams(l))
    for (const end of [ray.a, ray.b])
      if (!cells.has(cellKey(...end))) cells.set(cellKey(...end), PLAIN);
  const kinds = new Map([...cells].map(([k, v]) => [k, v < first ? v : l.records[v - first].kind]));
  const standing = new Map();
  for (const [kind, entry] of Object.entries(motion.kinds))
    if (entry.standing !== undefined) standing.set(Number(kind), entry.standing);
  const bodies = new Set();
  const platforms = new Map();
  const crumbling = new Map();
  const faces = new Map();
  for (const r of l.records) {
    const key = cellKey(r.x, r.y, r.z);
    if (r.kind === PLATFORM) {
      platforms.set(key, { r, home: [r.x, r.y, r.z].map((v) => v * unit) });
      for (const c of platformCells(r)) bodies.add(cellKey(...c));
    }
    if (r.kind === CRUMBLING)
      crumbling.set(key, { type: r.type, size: motion.kinds[String(CRUMBLING)].size });
    for (const o of r.on) faces.set(slot(key, o.face), o.type);
  }
  // the loader stands the ball on a clock where the start it takes asks for one
  const start = startsOf(l).at(-1);
  if (start?.type === CLOCK_START)
    faces.set(slot(cellKey(start.x, start.y, start.z), start.face), motion.play.clock.face);
  const pickups = new Map();
  const devices = new Map();
  for (const [key, marks] of idx.markers) {
    const c = idx.cells.get(key);
    if (!c || idx.records.get(key)[0].kind >= styles) continue;
    for (const m of marks) {
      if (m.face === null) continue;
      const entry = motion.types[String(m.type)];
      if (entry?.take) {
        const stand = byVariant(entry.take.stand, m);
        const at = add(
          [c.x, c.y, c.z].map((v) => v * unit),
          FACE_NORMAL[m.face],
          stand,
        );
        pickups.set(slot(key, m.face), { m, take: entry.take, at });
      }
      if (entry?.send || entry?.throw) devices.set(slot(key, m.face), m);
    }
  }
  return {
    first,
    cells,
    kinds,
    standing,
    faces,
    bodies,
    pickups,
    devices,
    crumbling,
    platforms,
    walkers: walkers(l, idx, motion, frame),
    probe: probe(l, circuits.lit),
    roll: dice(motion.dice),
    taken: new Set(),
    gone: new Set(),
    marked: new Set(),
    view: idx,
  };
}

const kindAt = (world, cell) => world.kinds.get(cellKey(...cell));

/** The game's word for what stands at `cell`, read on `face`: a plain block's face the type of
    the slot there, a bare block or no block the lattice's empty word, each other kind its own
    word, and undefined where the game writes none. */
function standingAt(world, cell, face) {
  const key = cellKey(...cell);
  const kind = world.kinds.get(key);
  if (kind === undefined) return OFF_LATTICE;
  if (kind !== PLAIN) return world.standing.get(kind);
  return world.cells.get(key) >= world.first
    ? (world.faces.get(slot(key, face)) ?? 0)
    : OFF_LATTICE;
}

/** The game's word for what the ball stands on: the block under the cell its centre lies in,
    read on the face under it, and the word as it was where the game writes none. */
export function standingOf(live) {
  const b = live.ball;
  return (
    standingAt(live.world, add(cellOf(b, b.pos), b.n, -1), faceUnder(b)) ?? live.words.standing
  );
}

/** The lattice as the ball's rules ask it, over the world as it stands when asked. */
export function probeOf(live) {
  const world = () => live.world;
  const solid = (cell) => {
    if (!inside(cell)) return false;
    const key = cellKey(...cell);
    return world().cells.has(key) || world().bodies.has(key);
  };
  return {
    solid,
    standable: (cell, face) => solid(cell) && !solid(add(cell, FACE_NORMAL[face])),
    slick: (cell) => kindAt(world(), cell) === ICE,
    brittle: (cell) => kindAt(world(), cell) === CRUMBLING,
    value: (cell) =>
      inside(cell) ? (world().cells.get(cellKey(...cell)) ?? OFF_LATTICE) : OFF_LATTICE,
    standing: (cell, face) => standingAt(world(), cell, face),
  };
}

/** What travels, for the frame to draw where the rules have stepped it. */
export const travelOf = ({ world: { walkers, probe, roll } }) => ({ walkers, probe, roll });
