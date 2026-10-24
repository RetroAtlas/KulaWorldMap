// The editor's document: a level as blocks, faces and circuits, edited copy on write.
import {
  BLOCK_KINDS,
  COLOURS,
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  DEFAULT_TIME,
  FACES,
  FACING_NEEDED,
  FACING_TYPES,
  FORMAT,
  HEADS_AS_ONE,
  LASER_KIND,
  PLATFORM_KIND,
  SETTINGS_KIND,
  SPAN_KINDS,
  START,
  VANISHING_KIND,
  VARIANTS,
  VARIANT_TYPES,
  VERSION,
  byCell,
  cellText,
  collapse,
  direction,
  facesOf,
  heldLength,
  inWord,
  inner,
  innerRoomFor,
  levelOf,
  onLattice,
  projectOf,
  sameCell,
  spelled,
  writeKwl,
} from "./kwl.js";

export const DRAFT_PACK = "/DRAFT/DRAFT.PAK";
export const UNTITLED = "Untitled level";
/** The most characters a reader keeps of a title, and of any other text. */
export const TITLE_MOST = 80;
export const TEXT_MOST = 2000;
const CENTRE = [17, 17, 17];
const META = [
  "title",
  "author",
  "notes",
  "world",
  "into",
  "time",
  "hidden",
  "invisibleFromAfar",
  "simon",
];

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
  simon: false,
  circuits: {},
  blocks: [{ cell: [...CENTRE], kind: 0, faces: { 0: { type: START, facing: 3 } } }],
});

export const keyOf = (cell) => cell.join();
export const isSpan = (b) => SPAN_KINDS.has(b.kind);

// --- reading and editing -------------------------------------------------------

export const blockAt = (project, cell) =>
  project.blocks.find((b) => sameCell(b.cell, cell)) ?? null;
export const faceAt = (project, cell, face) =>
  blockAt(project, cell)?.faces?.[String(face)] ?? null;

/** Whether two documents, or two parts of them, hold the same, whatever order their keys were written in. */
export function same(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]))
  );
}

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
      `written as version ${raw.version} of the format, newer than this reader's version ${VERSION}; what it knows is read`,
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
  project.simon = flag("simon");
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
  head.simon = !!project.simon;
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

/** The level the viewer draws for a draft: what the game would load of it, and whether it is a
    Simon room. */
export const toLevel = (project, id) =>
  levelOf(writeKwl(project), {
    name: project.title || UNTITLED,
    theme: project.world,
    pack: DRAFT_PACK,
    index: id,
    draft: id,
    simon: !!project.simon,
  });
