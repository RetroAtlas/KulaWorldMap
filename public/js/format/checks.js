// The editor's checks: what the game would make of a project, counted and judged as the loader would.
import { FACE_NORMAL, SIDE } from "./lattice.js";
import {
  BLOCK_KINDS,
  BONUS_UNDRAWN_KINDS,
  BONUS_UNDRAWN_TYPES,
  CAPS,
  CAPTIVATORS,
  COLOURS,
  COPYCAT_PACK,
  COPYCAT_SLOTS,
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
  STAR,
  STARTS,
  SWITCH,
  TELEPORTER,
  TIME_MAX,
  VANISHING_KIND,
  VARIANTS,
  VARIANT_TYPES,
  WORLDS,
  WORLD_SLOTS,
  byCell,
  carries,
  cellText,
  direction,
  faceNamedTwice,
  facesOf,
  inWord,
  inner,
  onLattice,
  roomFor,
  sameCell,
  spanAxis,
  strayFaceKeys,
} from "./kwl.js";
import { isSpan, keyOf } from "./project.js";

export const ERROR = "error";
export const WARNING = "warning";
const CAPTIVATOR_SET = new Set(CAPTIVATORS);
const UNDRAWN_KINDS = new Set(BONUS_UNDRAWN_KINDS);
const UNDRAWN_TYPES = new Set(BONUS_UNDRAWN_TYPES);

const beyond = (cell, d) => [cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]];
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

const hasKey = (project) => project.blocks.some((b) => facesOf(b).some(([, o]) => o.type === KEY));

/** Whether the level plays as a Simon room: marked one, with no key, since a key makes an arcade
    level of it. */
export const playsRoom = (project) => !!project.simon && !hasKey(project);

export function playsAs(project) {
  const keyed = hasKey(project);
  const room = !keyed && !!project.simon;
  if (project.hidden) {
    if (keyed) return "Plays as a hidden level, with the glass ball on half-seen blocks.";
    if (room) return "Plays as a hidden Simon room, with the glass ball on half-seen blocks.";
    return "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks.";
  }
  if (keyed) return "Plays as an arcade level.";
  if (room) return "Plays as a Simon room.";
  return "Plays as a bonus level since it has no key.";
}

/** Whether a target names a slot of a world pack, a finals pack or the Simon rooms' pack. */
function slotOf(pack, index) {
  if (pack === COPYCAT_PACK) return index >= 0 && index < COPYCAT_SLOTS;
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

/** The cells a span covers: a platform's cells from its lower end to its upper end
    plus its length, a laser's cells from end to end. */
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
export const listed = (items) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}` : items[0];
// Words for the types the annotations leave unnamed.
const TYPE_WORDS = { [STAR]: "star" };
/** A type as a finding names it, with the article: by its name, else by its number. */
export const typeWord = (type, names) => {
  const name = names.entry?.({ face: 0, type }) ?? TYPE_WORDS[type];
  return name ? `the ${lower(name)}` : `type ${type}`;
};

/** The things a keyless level places that the bonus artwork has no picture for, by name. */
function undrawnInBonus(blocks, names) {
  const found = [];
  const add = (name) => {
    if (!found.includes(name)) found.push(name);
  };
  for (const b of blocks) {
    if (UNDRAWN_KINDS.has(b.kind)) {
      const kind = names.kind?.(b.kind);
      add(kind ? `the ${lower(kind)}` : `kind ${b.kind}`);
    }
    for (const [, o] of facesOf(b)) if (UNDRAWN_TYPES.has(o.type)) add(typeWord(o.type, names));
  }
  return found;
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

function validateCircuits(project, warn, names) {
  const circuits = project.circuits ?? {};
  circuitMembers(project).forEach((m, c) => {
    const word = names.circuit?.(c);
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

export const TIME_LIMIT = 2 ** 15 - 1;

/** The nearest whole second a time yields, or null where it is not from 1 to the limit. */
export const timeOf = (value) => {
  const n = Number(value);
  return n >= 1 && n <= TIME_LIMIT ? Math.round(n) : null;
};

/** What the game would make of the project, as findings with a level, a text and a place,
    naming kinds, things and circuits through `names` and by number where it gives none. */
export function validate(project, hides, names = {}) {
  const out = [];
  const err = (text, cell = null, face = null) =>
    out.push({ level: ERROR, text, at: at(cell, face) });
  const warn = (text, cell = null, face = null) =>
    out.push({ level: WARNING, text, at: at(cell, face) });

  const world = typeof project.world === "string" ? project.world : "";
  if (!WORLDS.includes(world)) err(`the world '${world}' is not one of the disc's ten worlds`);
  if (project.into != null) {
    const text = typeof project.into === "string" ? project.into : JSON.stringify(project.into);
    const hash = text.lastIndexOf("#");
    const pack = hash < 0 ? "" : text.slice(0, hash);
    const index = text.slice(hash + 1);
    if (!/^\d+$/.test(index) || !slotOf(pack, Number(index)))
      err(
        `the target '${text}' is not a slot of a world pack, a finals pack or the Simon rooms' pack`,
      );
  }
  const time = project.time ?? DEFAULT_TIME;
  if (!inWord(time)) err(`a time of ${time} seconds, outside the file's range`);
  else if (timeOf(time) === null) err(`a time of ${time} seconds`);
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
      if (t === STAR) warn(`${typeWord(t, names)} is untested in play`, cell, j);
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

  validateCircuits(project, warn, names);
  const n = counts(project, hides);
  const undrawn = n.keys || project.hidden || project.simon ? [] : undrawnInBonus(blocks, names);
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
