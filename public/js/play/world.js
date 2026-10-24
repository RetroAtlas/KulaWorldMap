// The level as play holds it: what stands where, what travels and what has gone, built once from
// the level and probed as the ball rolls, in the game's units.
import { SIDE, cellKey, FACE_NORMAL } from "../format/lattice.js";
import {
  OFF_LATTICE,
  beams,
  markersOf,
  platformAxis,
  platformCells,
  startsOf,
} from "../viewer/data.js";
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
// The game starts an entry's angles at zero, where a pickup's angles are random.
const ENTRY_PHASE = [0, 0, 0];

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const inside = (cell) => cell.every((v) => v >= LOW && v <= HIGH);
const slot = (key, face) => `${key}/${face}`;
const byVariant = (v, m) => (Array.isArray(v) ? (v[Number(m.variant)] ?? v[0]) : v);

/** How many keys the level holds for the ball to take. */
export const keysOf = (world) => [...world.pickups.values()].filter((p) => p.m.type === KEY).length;

/** The index with its fruit placed as the loader places them under a run whose pickups' word is
    `fruit`: each takes the type of the first of the five whose bit in the word is clear, or keeps
    its own where every bit is set, in a copy of its marker that says so; the index itself where
    no run stands. */
function placed(idx, motion, fruit) {
  if (fruit === null) return idx;
  const five = Object.entries(motion.types)
    .filter(([, entry]) => entry.take?.fruit)
    .map(([type, entry]) => ({ type: Number(type), bit: entry.take.fruit }))
    .sort((a, b) => a.bit - b.bit);
  const types = new Set(five.map((f) => f.type));
  const next = five.find((f) => !(fruit & f.bit));
  const markers = new Map();
  for (const [key, marks] of idx.markers)
    markers.set(
      key,
      marks.map((m) =>
        m.face !== null && types.has(m.type)
          ? { ...m, type: next?.type ?? m.type, placed: true }
          : m,
      ),
    );
  return { ...idx, markers };
}

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

/** The level as play holds it, the walkers laid at `frame` and the fruit placed by the run's
    pickups' word `fruit` where a run stands: the index as play holds it, the lattice's words and
    kinds by cell, the faces' types, the word each kind reads as under the ball, the beams' ends
    and the word a lit beam's cell holds, the pickups with where each stands, the devices, the
    captivators with where each entry stands at home, its reach and what its pose needs, the
    crumbling blocks, the platforms, the blocks a level with no key counts, the starts with the
    marker each leaves while the ball is on the level, what travels and the dice, the live sets
    and the index the frame draws. */
export function worldOf(l, given, tables, circuits, frame = 0, fruit = null) {
  const { motion, unit, first, styles, skins } = tables;
  const idx = placed(given, motion, fruit);
  const laid = [];
  for (let i = 0; i < l.cells.length; i += 4) laid.push(l.cells.slice(i, i + 4));
  const cells = new Map(laid.map(([x, y, z, v]) => [cellKey(x, y, z), v]));
  const ends = new Set();
  for (const ray of beams(l))
    for (const end of [ray.a, ray.b]) {
      ends.add(cellKey(...end));
      if (!cells.has(cellKey(...end))) {
        cells.set(cellKey(...end), PLAIN);
        laid.push([...end, PLAIN]);
      }
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
  const platforms = new Map();
  const crumbling = new Map();
  const faces = new Map();
  for (const r of l.records) {
    const key = cellKey(r.x, r.y, r.z);
    if (r.kind === PLATFORM)
      platforms.set(key, {
        r,
        home: [r.x, r.y, r.z].map((v) => v * unit),
        axis: platformAxis(r),
        body: platformCells(r),
      });
    if (r.kind === CRUMBLING)
      crumbling.set(key, { type: r.type, size: motion.kinds[String(CRUMBLING)].size });
    for (const o of r.on) faces.set(slot(key, o.face), o.type);
  }
  // the loader stands the ball on a clock where the start it takes asks for one
  const clock = motion.play.clock.face;
  const found = startsOf(l);
  const start = found.at(-1);
  const starts = found.map((s) => {
    const key = cellKey(s.x, s.y, s.z);
    const m = idx.markers.get(key).find((m) => m.face === s.face && m.type === s.type);
    const left =
      s === start && s.type === CLOCK_START
        ? markersOf({ kind: PLAIN, on: [{ ...m, type: clock }] })
        : [];
    return { key, m, left };
  });
  if (start?.type === CLOCK_START)
    faces.set(slot(cellKey(start.x, start.y, start.z), start.face), clock);
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
          m,
          slot: slot(key, m.face),
          entry,
          at: add(
            [c.x, c.y, c.z].map((v) => v * unit),
            FACE_NORMAL[m.face],
            motion.standoff,
          ),
          phase: ENTRY_PHASE,
          square: entry.catch.square,
        });
    }
  }
  const gone = new Set();
  return {
    unit,
    first,
    idx,
    cells,
    kinds,
    standing,
    ends,
    beam: motion.kinds[String(LASER)].harm.cell,
    faces,
    pickups,
    devices,
    captivators,
    crumbling,
    platforms,
    counted,
    starts,
    walkers: walkers(l, idx, motion, frame),
    probe: emptied(probe(l, circuits.lit), gone),
    roll: dice(motion.dice),
    taken: new Set(),
    gone,
    marked: new Map(),
    view: null,
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
/** The frame the level stands at between the game's frames: the last one run, which the frame draws
    and the next frame's read of the cells about the ball sees, and the first before any has run. */
export const frameShown = (live) => Math.max(0, (live.words.frame ?? 0) - 1);
const sameCell = (a, b) => a.every((v, i) => v === b[i]);

/** Where the platform at `key` stands less its home, in the game's units. */
export function shiftOf(world, key) {
  const { home } = world.platforms.get(key);
  const w = world.walkers.get(`${key}/null`);
  return w ? add(w.pos, home, -1) : [0, 0, 0];
}

/** The platform whose body fills `cell` now, as its key, its shift, the axis of its run, its first
    block's centre where it stands now and its count of blocks, or null. */
export function platformAt(world, cell) {
  const { unit } = world;
  for (const [key, { home, axis, body }] of world.platforms) {
    const travel = shiftOf(world, key);
    const by = travel.map((v) => Math.floor((v + unit / 2) / unit));
    if (body.some((c) => sameCell(add(c, by), cell)))
      return { key, travel, axis, at: add(home, travel), count: body.length };
  }
  return null;
}

/** The game's word for what stands at `cell` at `frame`, read on `face`: a plain block's face
    the type of the slot there, a bare block, no block or one the lattice does not hold at that
    frame the lattice's empty word, a beam's end the same, since the loader lays a bare block at
    each, each other kind its own word, and undefined where the game writes none and the word
    stands as it was, a lit beam's cell among them. */
function standingAt(world, cell, face, frame) {
  const key = cellKey(...cell);
  const kind = world.kinds.get(key);
  const word = world.probe.value(cell, frame);
  if (word === world.beam) return undefined;
  if (kind === undefined || word === OFF_LATTICE || world.ends.has(key)) return OFF_LATTICE;
  if (kind !== PLAIN) return world.standing.get(kind);
  return world.cells.get(key) >= world.first
    ? (world.faces.get(slot(key, face)) ?? 0)
    : OFF_LATTICE;
}

/** The game's word for what the ball stands on, the platform's while it rides one. */
export function standingOf(live) {
  const b = live.ball;
  if (b.riding) return live.world.standing.get(PLATFORM);
  const under = add(cellOf(b), b.n, -1);
  return standingAt(live.world, under, faceUnder(b), frameShown(live)) ?? live.words.standing;
}

/** The lattice as the ball's rules ask it, over the world as the last frame's step left it, which
    is what the game's read of the cells about the ball sees: a vanishing block is there where its
    cycle's entry for the frame before says so, the entry the frame drawn before showed, a gone
    block never, and a platform's body where the platform stands now, its home cell empty while it
    is away, the platform named with its shift, the axis of its run, its first block's centre and
    its count of blocks; to a ball riding a platform the platform's own blocks at home are solid
    and nothing else. */
export function probeOf(live) {
  const world = () => live.world;
  const value = (cell) => world().probe.value(cell, frameShown(live));
  const filled = (cell) =>
    (value(cell) >= 0 && kindAt(world(), cell) !== PLATFORM) ||
    (inside(cell) && platformAt(world(), cell) !== null);
  const aboard = (cell) =>
    world()
      .platforms.get(live.ball.riding.key)
      .body.some((c) => sameCell(c, cell));
  return {
    solid: (cell) => (live.ball.riding ? aboard(cell) : filled(cell)),
    filled,
    standable: (cell, face) => filled(cell) && !filled(add(cell, FACE_NORMAL[face])),
    platform: (cell) => (inside(cell) ? platformAt(world(), cell) : null),
    slick: (cell) =>
      standingAt(world(), cell, faceUnder(live.ball), frameShown(live)) ===
      world().standing.get(ICE),
    brittle: (cell) => kindAt(world(), cell) === CRUMBLING,
    value,
    standing: (cell, face) => standingAt(world(), cell, face, frameShown(live)),
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

/** A block the ball has marked on a level with no key, with `frame`, the first frame it is
    drawn marked on: kept among the marked, and carried into the index the frame draws. */
export function marked(world, key, frame) {
  world.marked.set(key, frame);
  world.view = null;
}

/** The index the frame draws from: the one play holds less the things taken and the blocks
    gone, with what stood on them, with the blocks marked and the frame each was first drawn
    marked on as `marked`, and, until the level's outcome stands, less the starts, whose ball the
    ball on the level is, the start the game takes leaving the clock where it stands on one;
    shaped as the level's index, play's own index itself where nothing is dropped or marked, and
    rebuilt only when any of those changes. */
export function viewOf(live) {
  const world = live.world;
  const ended = !!live.words.outcome;
  if (!world.view || world.view.ended !== ended) world.view = { ended, idx: drawn(world, ended) };
  return world.view.idx;
}

function drawn(world, ended) {
  const { idx } = world;
  const starts = ended ? [] : world.starts;
  if (!world.taken.size && !world.gone.size && !world.marked.size && !starts.length) return idx;
  const markers = new Map(idx.markers);
  const less = (key, dropped, left = []) =>
    markers.set(key, [...(markers.get(key) ?? []).filter((m) => !dropped(m)), ...left]);
  for (const taken of world.taken) {
    const [key, face] = taken.split("/").map(Number);
    less(key, (m) => m.face === face);
  }
  for (const s of starts) less(s.key, (m) => m === s.m, s.left);
  const view = { ...idx, markers, marked: new Map(world.marked) };
  if (world.gone.size) {
    view.cells = new Map(idx.cells);
    view.records = new Map(idx.records);
    for (const key of world.gone)
      for (const part of [view.cells, view.records, markers]) part.delete(key);
  }
  return view;
}

/** What travels, for the frame to draw where the rules have stepped it. */
export const travelOf = ({ world: { walkers, probe, roll } }) => ({ walkers, probe, roll });
