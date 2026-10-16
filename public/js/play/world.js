// The level as play holds it: what stands where, what travels and what has gone, built once from
// the level and probed as the ball rolls, in the game's units.
import { SIDE, cellKey, FACE_NORMAL } from "../format/lattice.js";
import { OFF_LATTICE, beams, platformCells, startsOf } from "../viewer/data.js";
import { phasesOf } from "../viewer/motion.js";
import { probe, walkers, dice } from "../viewer/travel.js";
import { cellOf, faceUnder } from "./ball.js";

const LOW = 1;
const HIGH = SIDE - 2;
const PLAIN = 0;
const ICE = 2;
const PLATFORM = 5;
const CRUMBLING = 6;
const LASER = 8;
const CLOCK_START = 29;
export const KEY = 31;
// The kinds the game's walk over the inner lattice builds and counts.
const COUNTED = new Set([0, 1, 2, 4, 6, 7]);

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const inside = (cell) => cell.every((v) => v >= LOW && v <= HIGH);
const slot = (key, face) => `${key}/${face}`;
const byVariant = (v, m) => (Array.isArray(v) ? (v[Number(m.variant)] ?? v[0]) : v);

/** How many keys the level holds for the ball to take. */
export const keysOf = (world) => [...world.pickups.values()].filter((p) => p.m.type === KEY).length;

// Built where a face looks at no block its kind hides it behind, or at one built unseen behind.
function built(kinds, hides, cell, kind) {
  const hidden = hides.kinds[String(kind)] ?? hides.other;
  const unseen = String(kind) in hides.kinds ? [] : hides.unseen;
  return FACE_NORMAL.some((n) => {
    let theirs = kinds.get(cellKey(...add(cell, n)));
    if (theirs === LASER) theirs = PLAIN;
    return theirs === undefined || !hidden.includes(theirs) || unseen.includes(theirs);
  });
}

/** The level as play holds it, the walkers laid at `frame`: the lattice's words and kinds by
    cell, the faces' types, the word each kind reads as under the ball, the pickups with where
    each stands, the devices, the captivators with where each entry stands and its reach, the
    crumbling blocks, the platforms, the blocks a level with no key counts, what travels and the
    dice, the live sets and the index the frame draws. */
export function worldOf(l, idx, tables, circuits, frame = 0) {
  const { motion, unit, first, styles, skins } = tables;
  const laid = [];
  for (let i = 0; i < l.cells.length; i += 4) laid.push(l.cells.slice(i, i + 4));
  const cells = new Map(laid.map(([x, y, z, v]) => [cellKey(x, y, z), v]));
  for (const ray of beams(l))
    for (const end of [ray.a, ray.b])
      if (!cells.has(cellKey(...end))) {
        cells.set(cellKey(...end), PLAIN);
        laid.push([...end, PLAIN]);
      }
  const kinds = new Map([...cells].map(([k, v]) => [k, v < first ? v : l.records[v - first].kind]));
  const hides = skins?.hides ?? { other: [], unseen: [], kinds: {} };
  const counted = new Set();
  for (const [x, y, z] of laid) {
    const key = cellKey(x, y, z);
    const kind = kinds.get(key);
    if (COUNTED.has(kind) && inside([x, y, z]) && built(kinds, hides, [x, y, z], kind))
      counted.add(key);
  }
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
  const captivators = [];
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
        pickups.set(slot(key, m.face), {
          m,
          key,
          slot: slot(key, m.face),
          take: entry.take,
          at,
          points: byVariant(entry.take.points, m) ?? 0,
          phase: phasesOf(motion, c.x, c.y, c.z, m.face),
        });
      }
      if (entry?.send || entry?.throw) devices.set(slot(key, m.face), m);
      if (entry?.catch)
        captivators.push({
          slot: slot(key, m.face),
          at: add(
            [c.x, c.y, c.z].map((v) => v * unit),
            FACE_NORMAL[m.face],
            motion.standoff,
          ),
          square: entry.catch.square,
        });
    }
  }
  const gone = new Set();
  return {
    first,
    cells,
    kinds,
    standing,
    faces,
    bodies,
    pickups,
    devices,
    captivators,
    crumbling,
    platforms,
    counted,
    walkers: walkers(l, idx, motion, frame),
    probe: emptied(probe(l, circuits.lit), gone),
    roll: dice(motion.dice),
    taken: new Set(),
    gone,
    marked: new Set(),
    view: idx,
  };
}

/** The lattice's probe with every gone cell reading empty, to the walkers as to the ball. */
function emptied(lattice, gone) {
  const stands = (cell) => !gone.has(cellKey(...cell));
  return {
    value: (cell, frame) => (stands(cell) ? lattice.value(cell, frame) : OFF_LATTICE),
    free: (cell, face, frame) => stands(cell) && lattice.free(cell, face, frame),
    empty: (cell, frame) => !stands(cell) || lattice.empty(cell, frame),
  };
}

const kindAt = (world, cell) => world.kinds.get(cellKey(...cell));
const atFrame = (live) => live.words.frame ?? 0;

/** The game's word for what stands at `cell` at `frame`, read on `face`: a plain block's face
    the type of the slot there, a bare block, no block or one the lattice does not hold at that
    frame the lattice's empty word, each other kind its own word, and undefined where the game
    writes none. */
function standingAt(world, cell, face, frame) {
  const key = cellKey(...cell);
  const kind = world.kinds.get(key);
  if (kind === undefined || world.probe.value(cell, frame) === OFF_LATTICE) return OFF_LATTICE;
  if (kind !== PLAIN) return world.standing.get(kind);
  return world.cells.get(key) >= world.first
    ? (world.faces.get(slot(key, face)) ?? 0)
    : OFF_LATTICE;
}

/** The game's word for what the ball stands on: the block under the cell its centre lies in,
    read on the face under it, and the word as it was where the game writes none. */
export function standingOf(live) {
  const b = live.ball;
  const under = add(cellOf(b), b.n, -1);
  return standingAt(live.world, under, faceUnder(b), atFrame(live)) ?? live.words.standing;
}

/** The lattice as the ball's rules ask it, over the world as it stands at the run's frame: a
    vanishing block is there on the frames its cycle says, and a gone block never. */
export function probeOf(live) {
  const world = () => live.world;
  const value = (cell) => world().probe.value(cell, atFrame(live));
  const solid = (cell) =>
    value(cell) >= 0 || (inside(cell) && world().bodies.has(cellKey(...cell)));
  return {
    solid,
    standable: (cell, face) => solid(cell) && !solid(add(cell, FACE_NORMAL[face])),
    slick: (cell) => kindAt(world(), cell) === ICE,
    brittle: (cell) => kindAt(world(), cell) === CRUMBLING,
    value,
    standing: (cell, face) => standingAt(world(), cell, face, atFrame(live)),
  };
}

/** A pickup taken off its face: gone from the world's live set and from the index the frame
    draws. */
export function took(world, slot) {
  world.taken.add(slot);
  world.view = null;
}

/** A block gone from the lattice: its cell emptied, so that nothing stands or rolls on it, kept
    among the gone, and left out of the index the frame draws. */
export function fell(world, key) {
  world.cells.delete(key);
  world.kinds.delete(key);
  world.crumbling.delete(key);
  world.gone.add(key);
  world.view = null;
}

/** The index the frame draws from: the level's own less the things taken and the blocks gone,
    with what stood on them, shaped as the level's, and rebuilt only when either changes. */
export function viewOf(live) {
  const world = live.world;
  if (!world.view) {
    const { idx } = live;
    const markers = new Map(idx.markers);
    for (const taken of world.taken) {
      const [key, face] = taken.split("/").map(Number);
      markers.set(
        key,
        (markers.get(key) ?? []).filter((m) => m.face !== face),
      );
    }
    const view = { ...idx, markers };
    if (world.gone.size) {
      view.cells = new Map(idx.cells);
      view.records = new Map(idx.records);
      for (const key of world.gone)
        for (const part of [view.cells, view.records, markers]) part.delete(key);
    }
    world.view = view;
  }
  return world.view;
}

/** What travels, for the frame to draw where the rules have stepped it. */
export const travelOf = ({ world: { walkers, probe, roll } }) => ({ walkers, probe, roll });
