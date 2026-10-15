// Levels as the community's viewer keeps them: a JSON of blocks at positions
// in axes of its own, carrying the game's words under names of its own, and a
// share link of the same written as lines of base36, gzipped and base64url.
// Both are read by laying the words back into the game's file and reading
// that, so one reader decides what a level means and what to repair.
import { SIDE } from "../viewer/state.js";
import {
  CELLS,
  DEFAULT_TIME,
  FACES,
  GRID_BYTES,
  HEAD,
  RECORD,
  SETTINGS_KIND,
  SLOT,
  TRAILER_KIND,
  WORDS,
  WORLDS,
  collapse,
  readKwl,
} from "./kwl.js";
import { inflate } from "./inflate.js";

const EMPTY = 0xffff;
const SENTINEL = "~";
const NONE = "_";
const EDGE = SIDE - 1;
const BLOCK_KINDS = 5;
const PLATFORM = 5;
const CRUMBLING = 6;
const VANISHING = 7;
const LASER = 8;
const LEVEL_PARAM = "level";
const THEME_PARAM = "theme";
export const NOT_LINK = "That is not a link to a shared level.";
export const OWN_LEVEL = "That link names one of the viewer's own levels rather than a shared one.";

const isVec = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isInteger);
const isListOrNone = (v) => v == null || Array.isArray(v);

/**
 * Whether a parsed JSON is a level of the viewer's: blocks at positions, with
 * a time, any items and intervals they carry in lists.
 */
export const isOrbit = (json) =>
  !!json &&
  typeof json === "object" &&
  !Array.isArray(json) &&
  typeof json.time === "number" &&
  Array.isArray(json.blocks) &&
  json.blocks.every(
    (b) =>
      b &&
      typeof b === "object" &&
      isVec(b.pos) &&
      Number.isInteger(b.type) &&
      isListOrNone(b.items) &&
      isListOrNone(b.intervals),
  );

// The viewer's position of a cell is (x, 33 - z, y) of the game's, while the
// points a span names keep the game's values with y and z swapped.
const cellOf = ([x, y, z]) => [x, z, EDGE - y];
const pointOf = ([x, y, z]) => [x, z, y];
const text = (cell) => cell.join(", ");

const carries = (b) => b.type >= BLOCK_KINDS || (b.items ?? []).some((it) => it && it.id > 0);
const isWord = (v) => Number.isInteger(v) && v >= 0 && v <= EMPTY;

/** A value as a word of the file: an empty one where it is null, and reported where it is no word. */
function word(v, what, report) {
  if (v == null) return EMPTY;
  if (isWord(v)) return v;
  report.push(
    `${what} is ${JSON.stringify(v)}, not a whole number from 0 to ${EMPTY}; it is left empty`,
  );
  return EMPTY;
}

function point(p, what, report) {
  if (p == null) return [EMPTY, EMPTY, EMPTY];
  if (!isVec(p)) {
    report.push(`${what} is not a point of three whole numbers; it is left empty`);
    return [EMPTY, EMPTY, EMPTY];
  }
  return pointOf(p).map((v, i) => word(v, `${what}'s ${"xyz"[i]}`, report));
}

/** A flag as the viewer writes it, true or false; anything else is said and taken as false. */
function flag(v, what, report) {
  if (v === undefined || typeof v === "boolean") return v === true;
  report.push(`${what} is ${JSON.stringify(v)}, neither true nor false; it is taken as false`);
  return false;
}

function bare(w, at) {
  w[at + 1] = 0;
  w[at + 4] = 0;
}

function record(b, cell, report) {
  const w = new Uint16Array(WORDS).fill(EMPTY);
  const at = `of the block at ${text(cell)}`;
  const one = (v, name) => word(v, `the ${name} ${at}`, report);
  const three = (p, name) => point(p, `the ${name} ${at}`, report);
  w[0] = b.type;
  if (b.type < BLOCK_KINDS) {
    for (let j = 0; j < FACES; j++) {
      const slot = j * SLOT;
      const it = (b.items ?? [])[j];
      if (!it || !(it.id > 0)) {
        bare(w, slot);
        continue;
      }
      const face = (v, name) => word(v, `the ${name} on face ${j} ${at}`, report);
      w[slot + 1] = face(it.id, "id");
      w[slot + 2] = face(it.option, "option");
      w[slot + 3] = face(it.variant, "variant");
      w[slot + 4] = face(it.state, "state");
      if (it.route !== undefined) w[slot + 6] = face(it.route, "route");
      if (it.to !== undefined) w[slot + 7] = face(it.to, "to");
    }
  } else if (b.type === PLATFORM) {
    w[1] = one(b.movement, "movement");
    w[2] = one(b.orientation, "orientation");
    w.set(three(b.from, "from"), 4);
    w.set(three(b.to, "to"), 7);
    w[SLOT] = 0;
    w[SLOT + 1] = one(b.length, "length");
    w[SLOT + 2] = one(b.speed, "speed");
    w[SLOT + 4] = one(b.id, "id");
    w.set(three(b.start, "start"), WORDS - 9);
  } else if (b.type === VANISHING) {
    (b.intervals ?? []).slice(0, 8).forEach((v, i) => (w[1 + i] = one(v, `interval ${i}`)));
  } else if (b.type === LASER) {
    w[2] = one(b.orientation, "orientation");
    w[3] = one(b.length, "length");
    w.set(three(b.from, "from"), 4);
    w.set(three(b.to, "to"), 7);
    w[SLOT + 1] = 1;
    w[SLOT + 4] = one(b.speed, "speed");
    w[SLOT + 6] = one(b.variant, "variant");
    w[SLOT + 7] = one(b.state, "state");
  }
  w.set(cell, WORDS - 3);
  return w;
}

/** The game's file holding the viewer's level, and what could not be laid into it. */
export function kwlOfOrbit(json) {
  const report = [];
  const lattice = new Uint16Array(CELLS).fill(EMPTY);
  const records = [];
  for (const b of json.blocks) {
    const cell = cellOf(b.pos);
    if (!cell.every((v) => v >= 0 && v < SIDE)) {
      report.push(`a block at ${text(cell)} lies outside the lattice and was left out`);
      continue;
    }
    const at = (cell[0] * SIDE + cell[1]) * SIDE + cell[2];
    if (lattice[at] !== EMPTY) {
      report.push(`two blocks stand at ${text(cell)}; the first was kept`);
      continue;
    }
    if (!Number.isInteger(b.type) || b.type < 0 || b.type > LASER) {
      report.push(
        `a block of kind ${b.type} at ${text(cell)} is not one the game has and was left out`,
      );
      continue;
    }
    if (carries(b)) {
      lattice[at] = BLOCK_KINDS + records.length;
      records.push(record(b, cell, report));
    } else lattice[at] = b.type;
  }
  const hidden = flag(json.hidden, "hidden", report);
  const reverse = flag(json.reverse, "reverse", report);
  if (hidden || reverse) {
    const w = new Uint16Array(WORDS).fill(EMPTY);
    w[0] = SETTINGS_KIND;
    w[1] = hidden ? 1 : 0;
    w[2] = reverse ? 1 : 0;
    w.set([0, 0, 0], WORDS - 3);
    records.push(w);
  }
  const trailer = new Uint16Array(WORDS).fill(EMPTY);
  trailer[0] = TRAILER_KIND;
  const time = isWord(json.time) ? json.time : DEFAULT_TIME;
  if (time !== json.time)
    report.push(
      `the time is ${JSON.stringify(json.time)}, not a whole number from 0 to ${EMPTY}; it is ${DEFAULT_TIME}`,
    );
  trailer.set([0, 0, 0, 0, 0, time], 1);
  const placed = lattice.reduce((n, v) => n + (v !== EMPTY ? 1 : 0), 0);
  const out = new Uint8Array(GRID_BYTES + HEAD + RECORD * (records.length + 1));
  const view = new DataView(out.buffer);
  lattice.forEach((v, i) => view.setUint16(2 * i, v, true));
  view.setInt32(GRID_BYTES, placed, true);
  view.setUint16(GRID_BYTES + 4, records.length, true);
  [...records, trailer].forEach((w, k) =>
    w.forEach((v, i) => view.setUint16(GRID_BYTES + HEAD + RECORD * k + 2 * i, v, true)),
  );
  return { bytes: out, report: collapse(report), repairs: report.length };
}

/** { project, report, repairs } for a level of the viewer's, read in the world given. */
export function readOrbit(json, world = WORLDS[0]) {
  const { bytes, report, repairs } = kwlOfOrbit(json);
  const read = readKwl(bytes, world);
  read.report = [...report, ...read.report];
  read.repairs += repairs;
  return read;
}

// --- the share link ----------------------------------------------------------------------

const dec = (s) => {
  if (s === SENTINEL) return EMPTY;
  if (!/^[0-9a-z]+$/i.test(s ?? "")) throw new Error(NOT_LINK);
  return parseInt(s, 36);
};
const vec = (parts, at) => [dec(parts[at]), dec(parts[at + 1]), dec(parts[at + 2])];
// The viewer writes a platform's start over 512 and reads it back with parseInt,
// which stops at the point a start off the grid leaves in base 36.
const start = (s) => {
  if (s === SENTINEL) return EMPTY;
  const m = /^([0-9a-z]+)(?:\.[0-9a-z]*)?$/i.exec(s ?? "");
  if (!m) throw new Error(NOT_LINK);
  return parseInt(m[1], 36) * 512;
};

function item(s) {
  if (s === NONE) return null;
  const f = s.split(":");
  if (f.length !== 4 && f.length !== 6) throw new Error(NOT_LINK);
  const out = { id: dec(f[0]), option: dec(f[1]), variant: dec(f[2]), state: dec(f[3]) };
  if (f.length === 6) Object.assign(out, { route: dec(f[4]), to: dec(f[5]) });
  return out;
}

/** The level a link's text spells, as the viewer's JSON. */
export function parseOrbitText(text) {
  const lines = text.split("\n");
  const head = lines[0].split("|");
  if (head.length !== 3) throw new Error(NOT_LINK);
  const json = {
    time: dec(head[0]),
    hidden: head[1] === "1",
    reverse: head[2] === "1",
    blocks: [],
  };
  for (const line of lines.slice(1)) {
    const parts = line.trim().split(" ");
    if (parts.length === 1 && !parts[0]) continue;
    if (parts.length < 4) throw new Error(NOT_LINK);
    const type = dec(parts[0]);
    const pos = vec(parts, 1);
    if (type < BLOCK_KINDS) json.blocks.push({ type, pos, items: parts.slice(4).map(item) });
    else if (type === PLATFORM) {
      if (parts.length !== 18) throw new Error(NOT_LINK);
      json.blocks.push({
        type,
        pos,
        start: [start(parts[4]), start(parts[5]), start(parts[6])],
        from: vec(parts, 7),
        to: vec(parts, 10),
        movement: dec(parts[13]),
        orientation: dec(parts[14]),
        length: dec(parts[15]),
        speed: dec(parts[16]),
        id: dec(parts[17]),
      });
    } else if (type === CRUMBLING) json.blocks.push({ type, pos });
    else if (type === VANISHING)
      json.blocks.push({ type, pos, intervals: parts.slice(4).map(dec) });
    else if (type === LASER) {
      if (parts.length !== 15) throw new Error(NOT_LINK);
      json.blocks.push({
        type,
        pos,
        from: vec(parts, 4),
        to: vec(parts, 7),
        orientation: dec(parts[10]),
        length: dec(parts[11]),
        speed: dec(parts[12]),
        variant: dec(parts[13]),
        state: dec(parts[14]),
      });
    } else throw new Error(NOT_LINK);
  }
  return json;
}

/** The level parameter and the theme a pasted link carries, or null where it carries none. */
export function linkParts(text) {
  const given = text.trim();
  const query = given.includes("?") ? given.slice(given.indexOf("?") + 1) : given;
  const params = new URLSearchParams(query.replace(/^#/, ""));
  if (params.has(LEVEL_PARAM))
    return { param: params.get(LEVEL_PARAM), theme: params.get(THEME_PARAM) };
  if (/^[A-Za-z0-9_+/-]+=*$/.test(given)) return { param: given, theme: null };
  return null;
}

function gunzip(bytes) {
  if (typeof DecompressionStream !== "function")
    throw new Error("Reading a shared level needs a newer browser, one that can unpack it.");
  return inflate(bytes, "gzip");
}

function unbase64(param) {
  const b64 = param.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  try {
    return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) =>
      c.charCodeAt(0),
    );
  } catch {
    throw new Error(NOT_LINK);
  }
}

/** { project, report, repairs } for a shared level's link, or its level parameter, read in the world given unless the link names one of the disc's. */
export async function readOrbitLink(text, world = WORLDS[0]) {
  const parts = linkParts(text);
  if (!parts) throw new Error(NOT_LINK);
  if (/^\d+$/.test(parts.param)) throw new Error(OWN_LEVEL);
  let unpacked;
  try {
    unpacked = await gunzip(unbase64(parts.param));
  } catch (e) {
    throw new Error(e.message.startsWith("Reading") ? e.message : NOT_LINK);
  }
  const json = parseOrbitText(new TextDecoder().decode(unpacked));
  const report = [];
  let into = world;
  if (parts.theme) {
    const named = parts.theme.toUpperCase();
    if (WORLDS.includes(named)) into = named;
    else report.push(`the link's theme ${parts.theme} is not one of the disc's worlds`);
  }
  const read = readOrbit(json, into);
  read.report = [...report, ...read.report];
  read.repairs += report.length;
  return read;
}
