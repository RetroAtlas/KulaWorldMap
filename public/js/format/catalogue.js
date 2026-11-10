// The community catalogue: the index of the levels players sent in, each carried whole as its
// document under an id, read by shape with defaults and written the same way every time.
import { FORMAT, VERSION, WORLDS, collapse, writeKwl } from "./kwl.js";
import {
  TEXT_MOST,
  TITLE_MOST,
  UNTITLED,
  projectLines,
  readProject,
  readVersion,
  text,
} from "./project.js";
import { BUNDLE_FORMAT, BUNDLE_MOST, readBundle } from "./bundle.js";
import { overCaps, playsAs } from "./checks.js";

export const COMMUNITY_PACK = "/COMMUNITY/COMMUNITY.PAK";
/** The licence every community level is shared under, as its SPDX identifier. */
export const LICENCE = "CC-BY-4.0";
/** The most characters of notes a record carries, a cap sized for the page. */
export const NOTES_MOST = 320;
/** The most levels a bundle holds in a catalogue entry. */
export const BUNDLE_IN_CATALOGUE_MOST = 60;

const LEVEL = "level";
const BUNDLE = "bundle";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isLevelDocument = (v) => isObject(v) && v.format === FORMAT;
const isId = (v) => Number.isSafeInteger(v) && v > 0;
const show = (v) => JSON.stringify(v);
const cutTo = (s, most) => [...(s ?? "")].slice(0, most).join("");

// --- an entry and its document ----------------------------------------------------

/** An entry over `projects`, a level's own alone or a bundle's levels in order, the figures a tile
    shows recomputed from them and the document under `level` or `levels` by the kind. */
function build(id, kind, { title, author, notes }, world, licence, projects) {
  const out = {
    id,
    kind,
    title,
    author,
    notes,
    world,
    playsAs: playsAs(projects[0]),
    blocks: projects.reduce((n, p) => n + p.blocks.length, 0),
    licence,
  };
  if (kind === LEVEL) out.level = projects[0];
  else out.levels = projects;
  return out;
}

const headOf = (d) => ({
  title: d.title ?? "",
  author: d.author ?? "",
  notes: cutTo(d.notes, NOTES_MOST),
});

/** The entry for a record's document under `id`, a project or a bundle as the readers give them,
    its figures filled from the document and the catalogue's licence as its own; throws on an id
    that is not a positive whole number, on a document of neither format and on a bundle with no
    level. */
export function entryOf(id, document) {
  if (!isId(id)) throw new Error(`an id of ${show(id)} is not a positive whole number`);
  if (isLevelDocument(document))
    return build(id, LEVEL, headOf(document), document.world, LICENCE, [document]);
  if (!isObject(document) || document.format !== BUNDLE_FORMAT)
    throw new Error(`not a ${FORMAT} or a ${BUNDLE_FORMAT} document`);
  const levels = Array.isArray(document.levels) ? document.levels : [];
  if (!levels.length) throw new Error("a bundle with no level has no entry");
  return build(id, BUNDLE, headOf(document), levels[0].world, LICENCE, levels);
}

/** The document an entry carries: a level's project, or a bundle's head and levels joined again. */
export function documentOf(entry) {
  if (entry.kind !== BUNDLE) return entry.level;
  return {
    format: BUNDLE_FORMAT,
    version: VERSION,
    title: entry.title,
    author: entry.author,
    notes: entry.notes,
    levels: entry.levels,
  };
}

// --- reading ------------------------------------------------------------------------

/** Why a level's read cannot stand in the catalogue, or null where it passes the gates a link's
    level passes and one more, no repair: a world among the ten, under the game's caps as the
    checks count them, the faces and the blocks among them where `hides` is the face table, and
    the writer agreeing to it. */
function refused({ project, repairs }, hides) {
  if (repairs) return `reads with ${repairs} repair${repairs === 1 ? "" : "s"}`;
  if (!WORLDS.includes(project.world)) return "names a world the disc has not";
  const over = overCaps(project, hides);
  if (over) return `cannot be read as a level: ${over}`;
  try {
    writeKwl(project);
  } catch (e) {
    return `cannot be read as a level: ${e.message}`;
  }
  return null;
}

/** The projects an entry's document gives past the gates, one for a level entry or a bundle
    entry's levels in the list's order, or null with its line: a level that fails leaves a bundle
    entry out whole, since a link names a level by its place in the list. */
function projectsOf(raw, kind, where, hides, report) {
  if (kind === LEVEL) {
    if (!isLevelDocument(raw.level)) {
      report.push(`${where} has no ${FORMAT} document under level; it is left out`);
      return null;
    }
    const read = readProject(raw.level, { collapsed: false });
    for (const line of read.report) report.push(`${where}: ${line}`);
    const why = refused(read, hides);
    if (why === null) return [read.project];
    report.push(`${where} ${why}; it is left out`);
    return null;
  }
  if (!Array.isArray(raw.levels)) {
    report.push(`${where} has no list of levels; it is left out`);
    return null;
  }
  const read = readBundle({ format: BUNDLE_FORMAT, levels: raw.levels });
  for (const line of read.report) report.push(`${where}: ${line}`);
  let lost = read.levels.length < Math.min(raw.levels.length, BUNDLE_MOST);
  const projects = [];
  for (const l of read.levels) {
    const why = refused(l, hides);
    if (why === null) projects.push(l.project);
    else {
      report.push(
        `${where}: level ${l.at} (${l.project.title || UNTITLED}) ${why}; it is left out`,
      );
      lost = true;
    }
  }
  if (!projects.length) {
    report.push(`${where} has no level left; it is left out`);
    return null;
  }
  if (lost) {
    report.push(`${where} has a level left out, so the others would change place; it is left out`);
    return null;
  }
  return projects;
}

/** The entry at place `i` of the file's list, or null with a line where it is left out; `ids` is
    the id each place before it claimed, and `licence` the one at the head. */
function readEntry(raw, i, ids, licence, hides, report) {
  const at = `entry ${i}`;
  if (!isObject(raw)) {
    report.push(`${at} is not a table of keys; it is left out`);
    return null;
  }
  if (raw.id === undefined) {
    report.push(`${at} has no id; it is left out`);
    return null;
  }
  if (!isId(raw.id)) {
    report.push(
      `${at} has an id of ${show(raw.id)}, which is not a positive whole number; it is left out`,
    );
    return null;
  }
  const id = raw.id;
  if (ids.has(id)) {
    report.push(`${at} has the id ${id} of entry ${ids.get(id)}; it is left out`);
    return null;
  }
  ids.set(id, i);
  const where = `${at} (id ${id})`;
  let kind = raw.kind;
  if (kind !== LEVEL && kind !== BUNDLE) {
    if (kind !== undefined)
      report.push(
        `${where} has a kind of ${show(kind)}, which is neither level nor bundle; it is told by the document`,
      );
    kind = raw.level !== undefined ? LEVEL : raw.levels !== undefined ? BUNDLE : null;
    if (kind === null) {
      report.push(`${where} has no level and no levels; it is left out`);
      return null;
    }
  }
  const projects = projectsOf(raw, kind, where, hides, report);
  if (projects === null) return null;
  const own = kind === LEVEL ? projects[0] : { title: "", author: "", notes: "" };
  const lines = [];
  const head = {
    title: text(raw, "title", TITLE_MOST, lines) || own.title,
    author: text(raw, "author", TEXT_MOST, lines) || own.author,
    notes: text(raw, "notes", NOTES_MOST, lines) || cutTo(own.notes, NOTES_MOST),
  };
  const theirs = text(raw, "licence", TITLE_MOST, lines) || licence;
  for (const line of lines) report.push(`${where}: ${line}`);
  let world = projects[0].world;
  if (raw.world !== undefined && raw.world !== world) {
    if (WORLDS.includes(raw.world)) world = raw.world;
    else
      report.push(
        `${where} has a world of ${show(raw.world)}, which is not one of the ten; it is ${world}`,
      );
  }
  return build(id, kind, head, world, theirs, projects);
}

/** The retired ids: positive whole numbers, each once, none an entry among `kept` carries. */
function readRetired(raw, kept, report) {
  if (raw.retired === undefined) return [];
  if (!Array.isArray(raw.retired)) {
    report.push("retired is not a list; it is empty");
    return [];
  }
  const out = new Set();
  for (const v of raw.retired) {
    if (!isId(v))
      report.push(`retired names ${show(v)}, which is not a positive whole number; it is left out`);
    else if (out.has(v)) report.push(`retired names ${v} again; it is left out`);
    else if (kept.has(v))
      report.push(`retired names ${v}, which entry ${kept.get(v)} carries; it is dropped`);
    else out.add(v);
  }
  return [...out];
}

/** { catalogue, report } for the index, as text or parsed: its version, licence, entries and
    retired ids read by shape with defaults, every entry's document past the gates a link's level
    passes and no repair, the faces and the blocks counted where `hides` is the face table, and a line for every
    value that could not be taken as written, collapsed as the project reader collapses them. */
export function readCatalogue(source, { hides } = {}) {
  const raw = typeof source === "string" ? JSON.parse(source) : source;
  const report = [];
  const catalogue = { version: VERSION, licence: LICENCE, entries: [], retired: [] };
  if (!isObject(raw)) {
    report.push("not a table of the catalogue's keys; nothing is read");
    return { catalogue, report };
  }
  readVersion(raw, report);
  catalogue.licence = text(raw, "licence", TITLE_MOST, report) || LICENCE;
  const kept = new Map();
  if (!Array.isArray(raw.entries)) report.push("no entries");
  else {
    const ids = new Map();
    raw.entries.forEach((e, i) => {
      const entry = readEntry(e, i, ids, catalogue.licence, hides, report);
      if (entry === null) return;
      kept.set(entry.id, i);
      catalogue.entries.push(entry);
    });
  }
  catalogue.retired = readRetired(raw, kept, report);
  return { catalogue, report: collapse(report) };
}

// --- writing ------------------------------------------------------------------------

const pad = (lines, by) => lines.map((line) => `${" ".repeat(by)}${line}`);

/** An entry as the index shows one: its keys one a line in the reader's order, then its document
    as `writeProject` writes it, indented inside, or a bundle's levels each inside its own braces. */
function entryText(e) {
  const head = {
    id: e.id,
    kind: e.kind,
    title: e.title ?? "",
    author: e.author ?? "",
    notes: e.notes ?? "",
    world: e.world,
    playsAs: e.playsAs,
    blocks: e.blocks,
    licence: e.licence ?? LICENCE,
  };
  const lines = Object.entries(head).map(
    ([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  if (e.kind === BUNDLE) {
    const levels = (e.levels ?? []).map(
      (p) => `        {\n${pad(projectLines(p), 8).join("\n")}\n        }`,
    );
    if (levels.length) lines.push(`      "levels": [`, levels.join(",\n"), `      ]`);
    else lines.push(`      "levels": []`);
  } else lines.push(`      "level": {`, ...pad(projectLines(e.level), 6), `      }`);
  return `    {\n${lines.join("\n")}\n    }`;
}

/** The index's text, written the same way every time: the head's keys one a line, the entries by
    id and the retired ids in order. */
export function writeCatalogue(catalogue) {
  const lines = [
    `  "version": ${VERSION},`,
    `  "licence": ${JSON.stringify(catalogue.licence ?? LICENCE)},`,
  ];
  const entries = [...(catalogue.entries ?? [])].sort((a, b) => a.id - b.id).map(entryText);
  if (entries.length) lines.push(`  "entries": [`, entries.join(",\n"), `  ],`);
  else lines.push(`  "entries": [],`);
  const retired = [...new Set(catalogue.retired ?? [])].sort((a, b) => a - b);
  lines.push(`  "retired": [${retired.join(", ")}]`);
  return `{\n${lines.join("\n")}\n}\n`;
}
