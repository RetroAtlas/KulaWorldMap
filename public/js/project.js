// The editor's document: a level as blocks, faces and circuits, edited copy on write.
import { SIDE } from "./state.js";
import { FACE_NORMAL } from "./faces.js";
import { circuitWord, entryName, kindName } from "./data.js";
import {
  BLOCK_KINDS,
  BONUS_UNDRAWN_KINDS,
  BONUS_UNDRAWN_TYPES,
  CAPS,
  CAPTIVATORS,
  COLOURS,
  COUNTED_KINDS,
  COUNTER_WORDS,
  CRUMBLING_KIND,
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  DEFAULT_TIME,
  DIM_AT_ONCE,
  DISC_MAX,
  EXIT,
  FACES,
  FACING_NEEDED,
  FACING_TYPES,
  FINAL_SLOTS,
  FORMAT,
  FRUIT,
  HEADS_AS_ONE,
  HIDDEN_EXIT,
  KEY,
  LASER_KIND,
  LENGTHS,
  LENGTH_CAP,
  LIGHTS,
  LINK_RECORDS,
  MOVING_SPIKES,
  NUMBERED,
  PHASES,
  PLAIN_ONLY,
  PLATFORM_KIND,
  PLAYED,
  SETTINGS_KIND,
  SPAN_KINDS,
  STAR,
  START,
  STARTS,
  SWITCH,
  TELEPORTER,
  TIME_MAX,
  VANISHING_KIND,
  VARIANTS,
  VARIANT_TYPES,
  VERSION,
  WORLDS,
  WORLD_SLOTS,
  byCell,
  carries,
  cellText,
  collapse,
  direction,
  faceNamedTwice,
  facesOf,
  heldLength,
  inWord,
  inner,
  innerRoomFor,
  levelOf,
  onLattice,
  projectOf,
  roomFor,
  sameCell,
  spanAxis,
  spelled,
  strayFaceKeys,
  writeKwl,
} from "./kwl.js";

export const DRAFT_PACK = "/DRAFT/DRAFT.PAK";
export const UNTITLED = "Untitled level";
/** The most characters a reader keeps of a title, and of any other text. */
export const TITLE_MOST = 80;
export const TEXT_MOST = 2000;
export const ERROR = "error";
export const WARNING = "warning";
const FRUIT_SET = new Set(FRUIT);
const CAPTIVATOR_SET = new Set(CAPTIVATORS);
const UNDRAWN_KINDS = new Set(BONUS_UNDRAWN_KINDS);
const UNDRAWN_TYPES = new Set(BONUS_UNDRAWN_TYPES);
const CENTRE = [17, 17, 17];
const META = ["title", "author", "notes", "world", "into", "time", "hidden", "invisibleFromAfar"];

export const fromLevel = projectOf;

/** A new level: one plain block in the middle of the lattice with a start on top. */
export const blank = (world) => ({
  format: FORMAT,
  version: VERSION,
  title: UNTITLED,
  author: "",
  notes: "",
  world,
  time: DEFAULT_TIME,
  hidden: false,
  invisibleFromAfar: false,
  circuits: {},
  blocks: [{ cell: [...CENTRE], kind: 0, faces: { 0: { type: START, facing: 3 } } }],
});

// --- reading and editing -------------------------------------------------------

export const blockAt = (project, cell) =>
  project.blocks.find((b) => sameCell(b.cell, cell)) ?? null;
export const faceAt = (project, cell, face) =>
  blockAt(project, cell)?.faces?.[String(face)] ?? null;

export const setBlock = (project, cell, block) => ({
  ...project,
  blocks: [
    ...project.blocks.filter((b) => !sameCell(b.cell, cell)),
    { ...block, cell: [...cell] },
  ].sort(byCell),
});

export const removeBlock = (project, cell) => ({
  ...project,
  blocks: project.blocks.filter((b) => !sameCell(b.cell, cell)),
});

export function setFace(project, cell, face, object) {
  const i = project.blocks.findIndex((b) => sameCell(b.cell, cell));
  if (i < 0) throw new Error(`no block at ${cellText(cell)}`);
  const block = { ...project.blocks[i] };
  const faces = { ...block.faces };
  if (object) faces[String(face)] = { ...object };
  else delete faces[String(face)];
  if (Object.keys(faces).length) block.faces = faces;
  else delete block.faces;
  return { ...project, blocks: project.blocks.with(i, block) };
}

/** The blocks at `cells` lifted and laid again at their cells plus `delta`, a
    span's far end with it; null where one would land past the edge or on a
    block that is not moving. */
export function moveBlocks(project, cells, delta) {
  const moving = new Set(cells.map(keyOf));
  const rest = project.blocks.filter((b) => !moving.has(keyOf(b.cell)));
  const held = new Set(rest.map((b) => keyOf(b.cell)));
  const shift = (c) => c.map((v, i) => v + delta[i]);
  const moved = [];
  for (const b of project.blocks) {
    if (!moving.has(keyOf(b.cell))) continue;
    const cell = shift(b.cell);
    const far = b.far ? shift(b.far) : null;
    if (!cell.every(inner) || held.has(keyOf(cell)) || (far && !far.every(inner))) return null;
    moved.push(far ? { ...b, cell, far } : { ...b, cell });
  }
  return { ...project, blocks: [...rest, ...moved].sort(byCell) };
}

export function setCircuit(project, colour, state) {
  const circuits = { ...project.circuits };
  if (state === "off") circuits[String(colour)] = "off";
  else delete circuits[String(colour)];
  return { ...project, circuits };
}

export function setMeta(project, meta) {
  const out = { ...project };
  for (const key of META) {
    if (!(key in meta)) continue;
    if (key === "into" && meta[key] == null) delete out[key];
    else out[key] = meta[key];
  }
  return out;
}

// --- what the game would make of it ----------------------------------------------

const keyOf = (cell) => cell.join();
const beyond = (cell, d) => [cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]];
const isSpan = (b) => SPAN_KINDS.has(b.kind);
const hasFar = (b) => Array.isArray(b.far) && b.far.length === 3;

/** The lattice as the loader leaves it before building faces: a beam's far end
    stands a plain block where the file has none. */
function kindsAt(blocks) {
  const kinds = new Map(blocks.map((b) => [keyOf(b.cell), b.kind]));
  for (const b of blocks)
    if (b.kind === LASER_KIND && hasFar(b) && !kinds.has(keyOf(b.far))) kinds.set(keyOf(b.far), 0);
  return kinds;
}

/** How many of a block's six faces the game builds, by the rule the renderer draws them. */
function built(hides, kinds, cell, kind) {
  const own = hides.kinds[String(kind)] ?? hides.other;
  const unseen = String(kind) in hides.kinds ? [] : hides.unseen;
  let n = 0;
  for (const d of FACE_NORMAL) {
    let theirs = kinds.get(keyOf(beyond(cell, d)));
    if (theirs === LASER_KIND) theirs = 0;
    if (theirs === undefined || !own.includes(theirs) || unseen.includes(theirs)) n++;
  }
  return n;
}

export const COUNTERS = [
  "records",
  "cells",
  "faces",
  "blocks",
  "objects",
  "platforms",
  "lasers",
  "vanishing",
  "crumbling",
  "captivators",
  "keys",
  "lights",
  "spikes",
];

/** The counters that need the skins table, null when the table is missing. */
export const TABLE_COUNTERS = ["faces", "blocks"];

/** The counters the caps and the disc's maxima are read against; without the
    skins table the faces and the blocks are null. */
export function counts(project, hides) {
  const { blocks } = project;
  const at = new Map(blocks.map((b) => [keyOf(b.cell), b]));
  const kinds = kindsAt(blocks);
  const n = Object.fromEntries(COUNTERS.map((what) => [what, 0]));
  n.cells = blocks.length;
  if (!hides) for (const what of TABLE_COUNTERS) n[what] = null;
  for (const [key, kind] of hides ? kinds : []) {
    const cell = key.split(",").map(Number);
    if (!cell.every(inner)) continue;
    if (kind === PLATFORM_KIND) {
      const length = lengthOf(at.get(key));
      n.faces += length < 2 ? FACES : 4 * length + 2;
      continue;
    }
    const faces = built(hides, kinds, cell, kind);
    n.faces += faces;
    if (COUNTED_KINDS.has(kind) && faces) n.blocks++;
  }
  for (const b of blocks) {
    if (b.kind === PLATFORM_KIND) n.platforms++;
    else if (b.kind === LASER_KIND) n.lasers++;
    else if (b.kind === VANISHING_KIND) n.vanishing++;
    else if (b.kind === CRUMBLING_KIND) n.crumbling++;
    if (carries(b)) n.records++;
    for (const [, o] of facesOf(b)) {
      if (NUMBERED.has(o.type)) n.objects++;
      if (CAPTIVATOR_SET.has(o.type)) n.captivators++;
      if (o.type === KEY) n.keys++;
      if (LIGHTS.has(o.type)) n.lights++;
      if (o.type === MOVING_SPIKES) n.spikes++;
    }
  }
  if (project.hidden || project.invisibleFromAfar) n.records++;
  return n;
}

export function playsAs(project) {
  const keyed = project.blocks.some((b) => facesOf(b).some(([, o]) => o.type === KEY));
  if (project.hidden)
    return keyed
      ? "Plays as a hidden level, with the glass ball on half-seen blocks."
      : "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks.";
  return keyed ? "Plays as an arcade level." : "Plays as a bonus level since it has no key.";
}

/** Whether a target names a slot of a world pack or a finals pack. */
function slotOf(pack, index) {
  return WORLDS.some(
    (w) =>
      (pack === `/${w}/${w}.PAK` && index >= 0 && index < WORLD_SLOTS) ||
      (pack === `/${w}/${w}FI.PAK` && index >= 0 && index < FINAL_SLOTS),
  );
}

const at = (cell, face) => {
  if (cell === null) return null;
  const where = { cell: [...cell] };
  if (face !== null) where.face = face;
  return where;
};

const facingOk = (v) => Number.isInteger(v) && v >= 1 && v <= 4;

/** A platform's length as the loader walks it: the file's word, or the default where the value is none. */
const lengthOf = (b) => (inWord(b.length) ? b.length : DEFAULT_LENGTH);

/** The cells a span covers: a platform's from its lower end to its upper end
    plus its length, a laser's from end to end. */
export function runOf(b) {
  const axis = spanAxis(b.cell, b.far);
  const [lower, upper] = b.cell[axis] < b.far[axis] ? [b.cell, b.far] : [b.far, b.cell];
  const extra = b.kind === PLATFORM_KIND ? lengthOf(b) - 1 : 0;
  const cells = [];
  for (let t = Math.max(lower[axis], 0); t <= Math.min(upper[axis] + extra, SIDE - 1); t++) {
    const c = [...lower];
    c[axis] = t;
    cells.push(c);
  }
  return cells;
}

const spans = (blocks, kind) =>
  blocks.filter((b) => b.kind === kind && hasFar(b) && direction(b.cell, b.far) !== null);

/** The cells the loaders fill for the spans: a beam's cells between its ends,
    its far end, and a platform's whole run, each naming the span that fills it. */
function filled(blocks) {
  const beams = new Map();
  const ends = new Map();
  const runs = new Map();
  for (const b of spans(blocks, LASER_KIND)) {
    for (const c of runOf(b).slice(1, -1)) beams.set(keyOf(c), [...(beams.get(keyOf(c)) ?? []), b]);
    ends.set(keyOf(b.far), b);
  }
  for (const b of spans(blocks, PLATFORM_KIND)) for (const c of runOf(b)) runs.set(keyOf(c), b);
  return { beams, ends, runs };
}

function validateSpan(b, blocksAt, loader, err, warn) {
  const { cell, far } = b;
  if (!far) return err("a span needs a far end", cell);
  if (!hasFar(b)) return err("the far end is not along one axis from the block", cell);
  if (sameCell(far, cell)) return err("the far end is the block's own cell", cell);
  if (direction(cell, far) === null)
    return err("the far end is not along one axis from the block", cell);
  if (!far.every(onLattice)) return err("the far end is past the edge", cell);
  const length = b.kind === PLATFORM_KIND ? (b.length ?? DEFAULT_LENGTH) : 1;
  if (b.kind === PLATFORM_KIND) {
    if (!inWord(length)) return err(`a length of ${length}, outside the file's range`, cell);
    if (length < 1)
      return err(`a platform ${length} blocks long, which is less than one block`, cell);
    if (length > roomFor(cell, far))
      return err(`a platform ${length} blocks long, which the lattice cannot hold`, cell);
  }
  if (!far.every(inner)) return err("the far end is past the edge", cell);
  const { beams, ends, runs } = loader;
  if (b.kind === PLATFORM_KIND) {
    const speed = b.speed ?? DEFAULT_SPEED;
    const axis = spanAxis(cell, far);
    if (!inner(Math.max(cell[axis], far[axis]) + length - 1))
      return err("the platform's run reaches past the edge", cell);
    if (length > LENGTH_CAP)
      err(
        `a platform ${length} blocks long, more than the ${LENGTH_CAP} the game's grid holds`,
        cell,
      );
    else if (!LENGTHS.includes(length)) warn(`a platform ${length} blocks long`, cell);
    if (!inWord(speed)) err(`a speed of ${speed}, outside the file's range`, cell);
    else if (speed !== DEFAULT_SPEED) warn(`a platform running at ${speed}`, cell);
    for (const c of runOf(b)) {
      const key = keyOf(c);
      if (!sameCell(c, cell) && blocksAt.has(key))
        err(`the platform's run crosses the block at ${cellText(c)}`, cell);
      for (const laser of beams.get(key) ?? [])
        err(`the platform's run crosses the beam from ${cellText(laser.cell)}`, cell);
      if (ends.has(key))
        err(
          `the platform's run crosses the end of the beam from ${cellText(ends.get(key).cell)}`,
          cell,
        );
    }
    return;
  }
  for (const c of runOf(b)) {
    const key = keyOf(c);
    const other = blocksAt.get(key);
    if (sameCell(c, cell)) continue;
    if (sameCell(c, far)) {
      if (other && other.kind === 0 && facesOf(other).length)
        warn(
          "the beam's end makes a bare plain block of the block there; what stands on it still works but its faces paint plain",
          cell,
        );
      else if (other && other.kind !== 0 && other.kind !== LASER_KIND)
        err("a beam ends on an empty cell, a plain block or another laser's block", cell);
      for (const laser of beams.get(key) ?? [])
        err(`the beam ends in the beam from ${cellText(laser.cell)}`, cell);
      continue;
    }
    if (other) err(`the beam crosses the block at ${cellText(c)}`, cell);
    if (runs.has(key))
      err(`the beam crosses the platform's run from ${cellText(runs.get(key).cell)}`, cell);
    for (const laser of beams.get(key) ?? [])
      if (laser !== b)
        warn(
          `the beam crosses the beam from ${cellText(laser.cell)}; where two cross, the lit one fills the cell`,
          cell,
        );
  }
}

function validateOutlook(cell, j, kinds, beams, warn) {
  const next = beyond(cell, FACE_NORMAL[j]);
  const theirs = kinds.get(keyOf(next));
  if (theirs === undefined) {
    if (beams.has(keyOf(next))) warn("looks into a beam", cell, j);
  } else if (theirs === CRUMBLING_KIND) warn("looks into a crumbling block", cell, j);
  else if (theirs === VANISHING_KIND) warn("looks into a vanishing block", cell, j);
  else warn(`looks into the block at ${cellText(next)}`, cell, j);
}

const lower = (name) => name[0].toLowerCase() + name.slice(1);
const listed = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0];

/** The things a keyless level places that the bonus artwork has no picture for, by name. */
function undrawnInBonus(blocks) {
  const names = [];
  const add = (name) => {
    if (!names.includes(name)) names.push(name);
  };
  for (const b of blocks) {
    if (UNDRAWN_KINDS.has(b.kind))
      add(kindName(b.kind) ? `the ${lower(kindName(b.kind))}` : `kind ${b.kind}`);
    for (const [, o] of facesOf(b))
      if (UNDRAWN_TYPES.has(o.type)) {
        const name = entryName({ face: 0, type: o.type });
        add(name ? `the ${lower(name)}` : `type ${o.type}`);
      }
  }
  return names;
}

/** Each colour's switches, teleporters and lasers, counted on the faces the game walks. */
export function circuitMembers(project) {
  const members = Array.from({ length: COLOURS }, () => ({
    switches: 0,
    teleporters: 0,
    lasers: 0,
  }));
  const memberOf = (colour) => (Number.isInteger(colour) ? members[colour] : undefined);
  for (const b of project.blocks) {
    if (b.kind === LASER_KIND) {
      const m = memberOf(b.colour ?? 0);
      if (m) m.lasers++;
      continue;
    }
    for (const [, o] of facesOf(b)) {
      const m = memberOf(o.variant ?? 0);
      if (!m) continue;
      if (o.type === TELEPORTER) m.teleporters++;
      else if (o.type === SWITCH) m.switches++;
    }
  }
  return members;
}

function validateCircuits(project, warn) {
  const circuits = project.circuits ?? {};
  circuitMembers(project).forEach((m, c) => {
    const word = circuitWord(c);
    if (circuits[String(c)] === "off" && !m.switches && (m.lasers || m.teleporters))
      warn(
        `${word ? `the ${word} circuit` : `circuit ${c}`} starts off and has no switch to turn it on`,
      );
    if (m.teleporters === 1)
      warn(
        word
          ? `the one ${word} teleporter leads to itself`
          : `the one teleporter of circuit ${c} leads to itself`,
      );
    if (m.switches && !m.teleporters && !m.lasers)
      warn(
        word
          ? `the ${word} switches have nothing to switch`
          : `the switches of circuit ${c} have nothing to switch`,
      );
  });
}

const overCap = (what, n) =>
  `${n} ${COUNTER_WORDS[what]}, over the ${CAPS[what]} the game has room for`;

/** The checks' sentence for a project whose blocks carry more records than a link word can
    name, which the writer has no bytes for; null where it has room. */
export function recordOverflow(project) {
  const carried = project.blocks.filter(carries).length;
  return carried > LINK_RECORDS ? overCap("records", counts(project).records) : null;
}

/** What the game would make of the project, as findings with a level, a text and a place. */
export function validate(project, hides) {
  const out = [];
  const err = (text, cell = null, face = null) =>
    out.push({ level: ERROR, text, at: at(cell, face) });
  const warn = (text, cell = null, face = null) =>
    out.push({ level: WARNING, text, at: at(cell, face) });

  const world = typeof project.world === "string" ? project.world : "";
  if (!WORLDS.includes(world)) err(`the world '${world}' is not one of the disc's ten`);
  if (project.into != null) {
    const text = typeof project.into === "string" ? project.into : JSON.stringify(project.into);
    const hash = text.lastIndexOf("#");
    const pack = hash < 0 ? "" : text.slice(0, hash);
    const index = text.slice(hash + 1);
    if (!/^\d+$/.test(index) || !slotOf(pack, Number(index)))
      err(`the target '${text}' is not a slot of a world or a finals pack`);
  }
  const time = project.time ?? DEFAULT_TIME;
  if (!inWord(time)) err(`a time of ${time} seconds, outside the file's range`);
  else if (time < 1) err(`a time of ${time} seconds`);
  else if (time > TIME_MAX)
    warn(`a time of ${time} seconds, above the ${TIME_MAX} the game's levels keep to`);

  const blocks = [...project.blocks].sort(byCell);
  const blocksAt = new Map();
  for (const b of blocks) {
    const key = keyOf(b.cell);
    if (blocksAt.has(key)) err("two blocks on one cell", b.cell);
    blocksAt.set(key, b);
    if (!b.cell.every(inner)) err("the game builds nothing past the edge", b.cell);
  }
  const kinds = kindsAt(blocks);
  const loader = filled(blocks);
  const beams = new Set(loader.beams.keys());
  const starts = [];
  for (const b of blocks) {
    const { cell, kind } = b;
    if (!Number.isInteger(kind) || kind < 0 || kind >= SETTINGS_KIND) {
      err(`kind ${kind} is not a kind of block`, cell);
      continue;
    }
    if (kind >= BLOCK_KINDS && b.faces && Object.keys(b.faces).length)
      err("nothing stands on a platform's, laser's, crumbling or vanishing block's faces", cell);
    const twice = faceNamedTwice(b);
    if (twice !== null) err(`face ${twice} is named twice`, cell);
    if (kind === VANISHING_KIND) {
      const phase = b.phase ?? 0;
      if (DIM_AT_ONCE.includes(phase)) warn(`a phase of ${phase} dims at once`, cell);
      else if (!Number.isInteger(phase) || phase < 0 || phase >= PHASES)
        err(`a phase of ${phase}`, cell);
    }
    if (kind === LASER_KIND && !(Number.isInteger(b.colour) && b.colour >= 0 && b.colour < COLOURS))
      err(`a colour of ${b.colour ?? "none"}`, cell);
    if (isSpan(b)) validateSpan(b, blocksAt, loader, err, warn);
    for (const [j, o] of facesOf(b)) {
      const t = o.type;
      if (j < 0 || j >= FACES) {
        err(`face ${j} is not one of the six`, cell);
        continue;
      }
      if (!PLAYED.has(t)) err(`type ${t} is nothing the game plays`, cell, j);
      if (PLAIN_ONLY.has(t) && kind !== 0) err("a device works on a plain block only", cell, j);
      if (t === HIDDEN_EXIT && kind !== 0)
        warn(
          "the game has not been seen to take a hidden exit on a block that is not plain",
          cell,
          j,
        );
      if (FACING_NEEDED.has(t) && !facingOk(o.facing)) err("a facing of 1 to 4 is needed", cell, j);
      else if (FACING_TYPES.has(t) && o.facing !== undefined && !facingOk(o.facing))
        err("a facing of 1 to 4, or none", cell, j);
      if (VARIANT_TYPES.has(t)) {
        const v = o.variant ?? 0;
        if (!Number.isInteger(v) || v < 0 || v >= VARIANTS[t])
          err(`a variant of ${o.variant}`, cell, j);
      }
      if (STARTS.has(t)) starts.push([cell, j]);
      if (t === STAR) warn("the star is untested in play", cell, j);
      if (FRUIT_SET.has(t))
        warn("the game shows the player's next fruit, whichever is placed", cell, j);
      validateOutlook(cell, j, kinds, beams, warn);
    }
    for (const key of strayFaceKeys(b))
      err(`face ${JSON.stringify(key)} is not one of the six`, cell);
  }
  if (!starts.length) err("no start");
  else if (starts.length > 1) {
    const [cell, j] = starts[starts.length - 1];
    warn(
      `${starts.length} starts; the game takes the one on face ${j} of the block at ${cellText(cell)}`,
    );
  }

  validateCircuits(project, warn);
  const n = counts(project, hides);
  const undrawn = n.keys || project.hidden ? [] : undrawnInBonus(blocks);
  if (undrawn.length)
    warn(
      `with no key the game draws the bonus artwork, which has no picture for ${listed(undrawn)}`,
    );
  if (!hides) warn("the face count could not be read, so the faces and the blocks are not counted");
  if (
    n.keys &&
    !blocks.some((b) => facesOf(b).some(([, o]) => o.type === EXIT || o.type === HIDDEN_EXIT))
  )
    warn("a key and no exit");
  for (const [what, cap] of Object.entries(CAPS))
    if (n[what] !== null && n[what] > cap) err(overCap(what, n[what]));
  for (const [what, most] of Object.entries(DISC_MAX))
    if (n[what] !== null && n[what] > most)
      warn(`${n[what]} ${COUNTER_WORDS[what]}, more than any level on the disc`);
  return [...out.filter((f) => f.level === ERROR), ...out.filter((f) => f.level !== ERROR)];
}

/** One finding as a line: its level, where it is, and what it says. */
export function describe({ level, text, at }) {
  let where = "";
  if (at) {
    where = ` at ${cellText(at.cell)}`;
    if ("face" in at) where += ` face ${at.face}`;
  }
  return `${level}${where}: ${text}`;
}

// --- the project file ------------------------------------------------------------

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const show = (v) => JSON.stringify(v);
/** A whole number as the reader takes one: within the integers a double holds exactly. */
const safe = Number.isSafeInteger;
const safeCell = (v) => Array.isArray(v) && v.length === 3 && v.every(safe);
const onLatticeCell = (c) => safeCell(c) && c.every(onLattice);

/** The value under `key`, or `fallback` where it is missing; a value that is not a whole
    number is reported and takes the fallback too. */
function whole(raw, key, fallback, where, report) {
  const v = raw[key];
  if (v === undefined || safe(v)) return v ?? fallback;
  report.push(
    `${where} has a ${key} of ${show(v)}, which is not a whole number; it is ${show(fallback)}`,
  );
  return fallback;
}

/** `v` where the file's word holds it, else the nearest word with a line. */
function word(v, key, where, report) {
  if (inWord(v)) return v;
  const held = v < 0 ? -(2 ** 15) : 2 ** 15 - 1;
  report.push(`${where} has a ${key} of ${v}, outside the file's range; it is ${held}`);
  return held;
}

/** The value under `key` where it is one of `n`, else 0 with a line; missing is 0. */
function oneOf(raw, key, n, where, report) {
  const v = raw[key];
  if (v === undefined) return 0;
  if (safe(v) && v >= 0 && v < n) return v;
  report.push(
    `${where} has a ${key} of ${show(v)}, which is not one of the ${spelled(n)}; it is 0`,
  );
  return 0;
}

function readFaces(faces, where, report) {
  const out = {};
  for (const [key, o] of Object.entries(faces)) {
    if (!/^\d+$/.test(key) || Number(key) >= FACES) {
      report.push(`${where} names a face "${key}", which is not one of the six; it is left out`);
      continue;
    }
    const face = String(Number(key));
    if (face in out) {
      report.push(`${where} names face ${face} again as "${key}"; it is left out`);
      continue;
    }
    if (!isObject(o) || !safe(o.type)) {
      report.push(`${where} face ${key} holds nothing that could stand on a face; it is left out`);
      continue;
    }
    if (o.type <= 0) {
      report.push(
        `${where} face ${key} has a type of ${o.type}, which is nothing standing there; it is left out`,
      );
      continue;
    }
    const at = `${where} face ${key}`;
    const object = { type: word(o.type, "type", at, report) };
    if (o.facing !== undefined) {
      if (safe(o.facing)) object.facing = word(o.facing, "facing", at, report);
      else
        report.push(
          `${at} has a facing of ${show(o.facing)}, which is not a whole number; it is left out`,
        );
    }
    if (FACING_NEEDED.has(object.type) && !object.facing) {
      report.push(
        `${at} has ${object.facing === undefined ? "no facing" : "a facing of 0"}, ${HEADS_AS_ONE}`,
      );
      object.facing = 1;
    }
    if (VARIANT_TYPES.has(object.type))
      object.variant = oneOf(o, "variant", VARIANTS[object.type], at, report);
    else if (o.variant !== undefined) {
      if (safe(o.variant)) object.variant = word(o.variant, "variant", at, report);
      else
        report.push(
          `${at} has a variant of ${show(o.variant)}, which is not a whole number; it is left out`,
        );
    }
    out[face] = object;
  }
  return out;
}

function readBlock(raw, i, report, seen) {
  const where = `block ${i}`;
  if (!isObject(raw) || !safeCell(raw.cell) || !safe(raw.kind)) {
    report.push(`${where} has no cell of three whole numbers and a kind; it is left out`);
    return null;
  }
  const b = { cell: [...raw.cell], kind: raw.kind };
  const at = `${where} at ${cellText(b.cell)}`;
  if (!b.cell.every(onLattice)) {
    report.push(`${at} stands outside the lattice; it is left out`);
    return null;
  }
  if (b.kind < 0 || b.kind >= SETTINGS_KIND) {
    report.push(`${at} has a kind of ${b.kind}, which is not a kind of block; it is left out`);
    return null;
  }
  if (seen.has(cellText(b.cell))) {
    report.push(`${at} stands on the cell of block ${seen.get(cellText(b.cell))}; it is left out`);
    return null;
  }
  if (raw.faces !== undefined) {
    if (!isObject(raw.faces))
      report.push(`${at} has faces that are not a table of the six; they are left out`);
    else {
      const faces = readFaces(raw.faces, at, report);
      if (Object.keys(faces).length) b.faces = faces;
    }
  }
  if (isSpan(b)) {
    const { far } = raw;
    const left = (why) => report.push(`${at} ${why}; it is left out`);
    if (far === undefined) left("is a span with no far end");
    else if (!safeCell(far)) left("has a far end that is not a cell of three whole numbers");
    else if (sameCell(far, b.cell)) left("has its far end on its own cell");
    else if (!onLatticeCell(far)) left(`has its far end at ${cellText(far)}, outside the lattice`);
    else if (direction(b.cell, far) === null) left(`spans to ${cellText(far)} along no one axis`);
    if (!onLatticeCell(far) || sameCell(far, b.cell) || direction(b.cell, far) === null)
      return null;
    b.far = [...far];
  }
  if (b.kind === PLATFORM_KIND) {
    b.length = whole(raw, "length", DEFAULT_LENGTH, at, report);
    const held = heldLength(b.length, innerRoomFor(b.cell, b.far));
    if (held !== b.length) {
      const why = b.length < 1 ? "is less than one block" : "runs past the edge";
      report.push(`${at} has a length of ${b.length}, which ${why}; it is ${held}`);
      b.length = held;
    }
    b.speed = word(whole(raw, "speed", DEFAULT_SPEED, at, report), "speed", at, report);
  }
  if (b.kind === LASER_KIND) b.colour = oneOf(raw, "colour", COLOURS, at, report);
  if (b.kind === VANISHING_KIND)
    b.phase = word(whole(raw, "phase", 0, at, report), "phase", at, report);
  seen.set(cellText(b.cell), i);
  return b;
}

/** { project, report, repairs } for a project file, as text or parsed, the report collapsed and
    the repairs the count of its lines before that, less the note on a newer file; throws on
    another format's file. */
export function readProject(source) {
  const raw = typeof source === "string" ? JSON.parse(source) : source;
  if (!isObject(raw) || raw.format !== FORMAT) throw new Error(`not a ${FORMAT} file`);
  const report = [];
  let notes = 0;
  if (raw.version !== undefined && !safe(raw.version))
    report.push(
      `a version of ${show(raw.version)} is not a whole number; the file is read as version ${VERSION}`,
    );
  else if (safe(raw.version) && raw.version > VERSION) {
    report.push(
      `written as version ${raw.version} of the format, newer than this reader's ${VERSION}; what it knows is read`,
    );
    notes++;
  }
  const cut = (key, most) => {
    const chars = [...raw[key]];
    if (chars.length <= most) return raw[key];
    report.push(
      `${key} is ${chars.length} characters long, more than the ${most} kept; it is cut to ${most}`,
    );
    return chars.slice(0, most).join("");
  };
  const text = (key, most = Infinity) => {
    if (raw[key] === undefined) return "";
    if (typeof raw[key] !== "string") {
      report.push(`${key} is not text; it is left empty`);
      return "";
    }
    return cut(key, most);
  };
  const optional = (key, most) => {
    if (raw[key] === undefined) return undefined;
    if (typeof raw[key] !== "string") {
      report.push(`${key} is not text; it is left out`);
      return undefined;
    }
    return cut(key, most);
  };
  const flag = (key) => {
    if (raw[key] === undefined) return false;
    if (typeof raw[key] === "boolean") return raw[key];
    report.push(`${key} is neither true nor false; it is taken as false`);
    return false;
  };
  const project = {
    format: FORMAT,
    version: VERSION,
    title: text("title", TITLE_MOST),
    author: text("author", TEXT_MOST),
    notes: text("notes", TEXT_MOST),
    world: text("world", TEXT_MOST),
  };
  const into = optional("into", TEXT_MOST);
  if (into !== undefined) project.into = into;
  const from = optional("from", TEXT_MOST);
  if (from !== undefined) project.from = from;
  if (raw.time === undefined || safe(raw.time)) project.time = raw.time ?? DEFAULT_TIME;
  else {
    report.push(`a time of ${show(raw.time)} is not a whole number; it is ${DEFAULT_TIME}`);
    project.time = DEFAULT_TIME;
  }
  if (!inWord(project.time)) {
    const held = project.time < 0 ? -(2 ** 15) : 2 ** 15 - 1;
    report.push(`a time of ${project.time} is outside the file's range; it is ${held}`);
    project.time = held;
  }
  project.hidden = flag("hidden");
  project.invisibleFromAfar = flag("invisibleFromAfar");
  project.circuits = {};
  if (raw.circuits !== undefined && !isObject(raw.circuits))
    report.push("circuits is not a table of colours; every colour starts on");
  else
    for (const [colour, state] of Object.entries(raw.circuits ?? {})) {
      if (!/^[0-3]$/.test(colour))
        report.push(`colour ${colour} is not one of the four; it is left out`);
      else if (state === "off") project.circuits[colour] = "off";
      else if (state !== "on") report.push(`colour ${colour} is neither on nor off; it starts on`);
    }
  if (!Array.isArray(raw.blocks)) {
    report.push("no blocks");
    project.blocks = [];
  } else {
    const seen = new Map();
    project.blocks = raw.blocks
      .map((b, i) => readBlock(b, i, report, seen))
      .filter(Boolean)
      .sort(byCell);
  }
  return { project, report: collapse(report), repairs: report.length - notes };
}

function writeFace(o) {
  const out = { type: o.type };
  if (FACING_TYPES.has(o.type) && o.facing !== undefined && o.facing !== 0) out.facing = o.facing;
  if (VARIANT_TYPES.has(o.type)) out.variant = o.variant ?? 0;
  return out;
}

function writeBlock(b) {
  const out = { cell: b.cell, kind: b.kind };
  const faces = facesOf(b);
  if (b.faces && b.kind >= BLOCK_KINDS && Object.keys(b.faces).length) out.faces = b.faces;
  else if (faces.length)
    out.faces = Object.fromEntries(faces.map(([j, o]) => [String(j), writeFace(o)]));
  if (b.kind === VANISHING_KIND) out.phase = b.phase ?? 0;
  if (isSpan(b) && b.far) out.far = b.far;
  if (b.kind === PLATFORM_KIND) {
    out.length = b.length ?? DEFAULT_LENGTH;
    out.speed = b.speed ?? DEFAULT_SPEED;
  }
  if (b.kind === LASER_KIND) out.colour = b.colour ?? 0;
  return out;
}

/** A value on one line, spaced as the document shows a block. */
function inline(value) {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (isObject(value)) {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return entries.length ? `{ ${entries.join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

/** The project file's text, written the same way every time. */
export function writeProject(project) {
  const head = {
    format: FORMAT,
    version: VERSION,
    title: project.title ?? "",
    author: project.author ?? "",
    notes: project.notes ?? "",
    world: project.world,
  };
  if (project.into !== undefined) head.into = project.into;
  if (project.from !== undefined) head.from = project.from;
  head.time = project.time ?? DEFAULT_TIME;
  head.hidden = !!project.hidden;
  head.invisibleFromAfar = !!project.invisibleFromAfar;
  head.circuits = Object.fromEntries(
    Object.entries(project.circuits ?? {})
      .filter(([, state]) => state === "off")
      .sort(([a], [b]) => a - b),
  );
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)},`);
  const blocks = [...project.blocks].sort(byCell).map((b) => `    ${inline(writeBlock(b))}`);
  lines.push(blocks.length ? `  "blocks": [\n${blocks.join(",\n")}\n  ]` : `  "blocks": []`);
  return `{\n${lines.join("\n")}\n}\n`;
}

/** The level the viewer draws for a draft: what the game would load of it. */
export const toLevel = (project, id) =>
  levelOf(writeKwl(project), {
    name: project.title || UNTITLED,
    theme: project.world,
    pack: DRAFT_PACK,
    index: id,
    draft: id,
  });
