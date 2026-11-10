// Joins the community level records into the index the page reads, and adds a level to them.
//
//     node tools/community.js
//     node tools/community.js --add <link or file> [--author <name>] [--notes <text>]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT, VERSION, writeKwl } from "../public/js/format/kwl.js";
import { UNTITLED, fromLevel, readProject, writeProject } from "../public/js/format/project.js";
import { BUNDLE_FORMAT, readBundle, writeBundle } from "../public/js/format/bundle.js";
import { ERROR, describe, overCaps, recordOverflow, validate } from "../public/js/format/checks.js";
import { LETTER, decodeSegment } from "../public/js/format/share.js";
import {
  BUNDLE_IN_CATALOGUE_MOST,
  LICENCE,
  NOTES_MOST,
  entryOf,
  readCatalogue,
  writeCatalogue,
} from "../public/js/format/catalogue.js";
import { commonOf, kinOf, shapeOf, shapesOf } from "../public/js/format/kinship.js";
import { NAMES, setAnnotations } from "../public/js/viewer/data.js";
import { parseHash } from "../public/js/viewer/permalink.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** Where the records, the ledger and the index stand, from the repository's root. */
export const RECORDS = "catalogue/levels";
export const LEDGER = "catalogue/ids.json";
export const INDEX = "public/community/index.json";
const USAGE =
  "usage: node tools/community.js [--add <link or file> [--author <name>] [--notes <text>]]";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isId = (v) => Number.isSafeInteger(v) && v > 0;
const show = (v) => JSON.stringify(v);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const counted = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const NOTE = /written as version \d+ of the format, newer than this reader's version/;

// --- the text a record shows ------------------------------------------------------

/** The kind of a character that hides or reorders text or breaks its line, or null for any other;
    a line break stands in the notes alone, the one text typed in a text area. */
function hiddenKind(code, key) {
  const breaks = code === 0x0a && key === "notes";
  if ((code < 0x20 && !breaks) || (code >= 0x7f && code <= 0x9f)) return "control";
  if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069))
    return "bidi formatting";
  if ((code >= 0x200b && code <= 0x200d) || code === 0xfeff) return "zero-width";
  return null;
}

const codePoint = (code) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

const shown = (text) =>
  [...text].map((ch) => (hiddenKind(ch.codePointAt(0)) === null ? ch : "�")).join("");

const VERB = { title: "holds", author: "holds", notes: "hold" };

/** The sentence refusing the texts of a document named `name`, or null where they stand. */
function refusedText({ title, author, notes }, name) {
  for (const [key, text] of Object.entries({ title, author, notes }))
    for (const ch of text) {
      const kind = hiddenKind(ch.codePointAt(0), key);
      if (kind !== null)
        return `the ${key} of ${name} ${VERB[key]} a ${kind} character, ${codePoint(ch.codePointAt(0))}`;
    }
  const n = [...notes].length;
  if (n > NOTES_MOST)
    return `the notes of ${name} run to ${n} characters, more than the ${NOTES_MOST} a record carries`;
  return null;
}

// --- the gates ---------------------------------------------------------------------

function repaired(count, lines, name) {
  if (count === 0) return;
  const line = lines.find((l) => !NOTE.test(l));
  throw new Error(
    `${name} reads with ${counted(count, "repair")}${line ? `: ${shown(line)}` : ""}`,
  );
}

/** The digest of `project` past every gate a level passes, with the note that it holds part of a
    shipped level or null, or a thrown sentence naming it `name`. */
function levelOf(project, name, { hides, names, shipped, shapes, titles }) {
  const errors = validate(project, hides, names).filter((f) => f.level === ERROR);
  if (errors.length) {
    const more = errors.length > 1 ? `, and ${counted(errors.length - 1, "more error")}` : "";
    throw new Error(
      `the checks find an error in ${name}${shown(describe(errors[0]).slice(ERROR.length))}${more}`,
    );
  }
  const overflow = recordOverflow(project);
  if (overflow !== null) throw new Error(`${name} cannot be written as a level: ${overflow}`);
  let bytes;
  try {
    bytes = writeKwl(project);
  } catch (e) {
    throw new Error(`${name} cannot be written as a level: ${e.message}`);
  }
  const over = overCaps(project, hides);
  if (over !== null) throw new Error(`${name} is over the game's caps: ${over}`);
  const digest = sha256(bytes);
  if (shipped.has(digest))
    throw new Error(`${name} is the disc's level at ${shipped.get(digest)}, byte for byte`);
  const kin = kinOf(project, shapes);
  if (kin === null) return { digest, note: null };
  const other = shapes.get(kin.slot);
  const percent = Math.round((commonOf(shapeOf(project), other) / other.size) * 100);
  const held = `${name} holds ${percent} percent of the blocks of the game's ${titles.get(kin.slot)}`;
  if (kin.refused)
    throw new Error(
      `${held}, which it was copied from; the community levels take levels of your own`,
    );
  return { digest, note: `${held}, which is worth a look` };
}

/** The document as its reader gives it and its levels named with their digests and notes, or a
    thrown sentence. */
function admitted(raw, deps) {
  if (isObject(raw) && raw.format === FORMAT) {
    const read = readProject(raw, { collapsed: false });
    const name = `"${shown(read.project.title || UNTITLED)}"`;
    repaired(read.repairs, read.report, name);
    const text = refusedText(read.project, name);
    if (text !== null) throw new Error(text);
    return {
      document: read.project,
      levels: [{ name, ...levelOf(read.project, name, deps) }],
    };
  }
  if (!isObject(raw) || raw.format !== BUNDLE_FORMAT)
    throw new Error(`neither a ${FORMAT} nor a ${BUNDLE_FORMAT} document`);
  const read = readBundle(raw);
  const name = read.bundle.title
    ? `the bundle "${shown(read.bundle.title)}"`
    : "the untitled bundle";
  const theirs = read.levels.reduce((n, l) => n + l.repairs, 0);
  const own = read.report.filter(
    (l) => !read.levels.some((lv) => l.startsWith(`level ${lv.at} (`)),
  );
  repaired(read.repairs - theirs, own, name);
  const text = refusedText(read.bundle, name);
  if (text !== null) throw new Error(text);
  if (!read.levels.length) throw new Error(`${name} holds no level`);
  if (read.levels.length > BUNDLE_IN_CATALOGUE_MOST)
    throw new Error(
      `${name} holds ${read.levels.length} levels, more than the ${BUNDLE_IN_CATALOGUE_MOST} a catalogue entry carries`,
    );
  const levels = read.levels.map((l) => {
    const where = `level ${l.at} (${shown(l.project.title || UNTITLED)}) of ${name}`;
    repaired(l.repairs, l.report, where);
    const refused = refusedText(l.project, where);
    if (refused !== null) throw new Error(refused);
    return { name: where, ...levelOf(l.project, where, deps) };
  });
  return { document: read.bundle, levels };
}

/** The entry for a record's document under `id`, or a thrown sentence naming the document it refuses. */
export function recordOf(document, deps, id = 1) {
  return entryOf(id, admitted(document, deps).document);
}

/** A record's text for a document: the project or the bundle file as the editor saves it. */
export function canonicalOf(document) {
  if (isObject(document) && document.format === BUNDLE_FORMAT)
    return writeBundle(readBundle(document).bundle);
  return writeProject(readProject(document).project);
}

/** The document with `author` and `notes` given where its own are empty. */
export function filled(document, { author = "", notes = "" } = {}) {
  if (isObject(document)) {
    if (author && !document.author) document.author = author;
    if (notes && !document.notes) document.notes = notes;
  }
  return document;
}

// --- the ledger and the index -----------------------------------------------------

function ledgerOf(raw, refusals) {
  if (!isObject(raw)) {
    refusals.push("the ledger is not a table of next and retired");
    return { next: null, retired: [] };
  }
  const next = isId(raw.next) ? raw.next : null;
  if (next === null)
    refusals.push(`the ledger's next is ${show(raw.next)}, not a positive whole number`);
  const retired = [];
  if (raw.retired !== undefined && !Array.isArray(raw.retired))
    refusals.push("the ledger's retired is not a list");
  for (const v of Array.isArray(raw.retired) ? raw.retired : []) {
    if (!isId(v))
      refusals.push(`the ledger retires ${show(v)}, which is not a positive whole number`);
    else if (retired.includes(v)) refusals.push(`the ledger retires ${v} twice`);
    else if (next !== null && v >= next)
      refusals.push(`the ledger retires ${v}, an id it has not issued, next being ${next}`);
    else retired.push(v);
  }
  return { next, retired };
}

/** The ledger's text, its two keys one a line and the retired ids in order. */
export function writeLedger({ next, retired }) {
  const ids = [...new Set(retired ?? [])].sort((a, b) => a - b);
  return `{\n  "next": ${next},\n  "retired": [${ids.join(", ")}]\n}\n`;
}

/** { catalogue, notes } for the records under the ledger, the notes `{ id, note }` for each level
    that holds part of one of the game's levels, or a thrown error listing every refusal, one a
    line. */
export function indexOf(records, ledger, deps) {
  const refusals = [];
  const notes = [];
  const { next, retired } = ledgerOf(ledger, refusals);
  const ids = new Set();
  const seen = new Map();
  const entries = [];
  for (const { id, document } of records) {
    const at = `record ${show(id)}`;
    if (!isId(id)) {
      refusals.push(`${at} has an id that is not a positive whole number`);
      continue;
    }
    if (ids.has(id)) {
      refusals.push(`${at} is listed twice`);
      continue;
    }
    ids.add(id);
    if (retired.includes(id)) refusals.push(`${at} has an id the ledger retires`);
    else if (next !== null && id >= next)
      refusals.push(`${at} has an id the ledger has not issued, next being ${next}`);
    let got;
    try {
      got = admitted(document, deps);
    } catch (e) {
      refusals.push(`${at}: ${e.message}`);
      continue;
    }
    for (const { name, digest, note } of got.levels) {
      const other = seen.get(digest);
      if (other !== undefined)
        refusals.push(`${at}: ${name} is the same level as ${other}, byte for byte`);
      else seen.set(digest, `${name} in ${at}`);
      if (note !== null) notes.push({ id, note });
    }
    entries.push(entryOf(id, got.document));
  }
  if (next !== null)
    for (let id = 1; id < next; id++)
      if (!ids.has(id) && !retired.includes(id))
        refusals.push(
          `the ledger has issued ${id}, which no record carries and retired does not list`,
        );
  if (refusals.length) throw new Error(refusals.join("\n"));
  const catalogue = { version: VERSION, licence: LICENCE, entries, retired };
  const { report } = readCatalogue(writeCatalogue(catalogue), { hides: deps.hides });
  if (report.length) throw new Error(`the index written reads back with a line: ${report[0]}`);
  return { catalogue, notes };
}

// --- the files ---------------------------------------------------------------------

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/** The records under `root` by id, none where the directory is missing, a thrown sentence for a bad file. */
export function readRecords(root = ROOT) {
  const dir = join(root, RECORDS);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const path = `${RECORDS}/${name}`;
    const stem = name.slice(0, -".json".length);
    if (!/^[1-9]\d*$/.test(stem) || !Number.isSafeInteger(Number(stem)))
      throw new Error(`${path} is not named by a positive whole number`);
    const text = readFileSync(join(dir, name), "utf8");
    let document;
    try {
      document = JSON.parse(text);
    } catch (e) {
      throw new Error(`${path} is not JSON: ${shown(e.message)}`);
    }
    out.push({ id: Number(stem), document, text, path });
  }
  return out.sort((a, b) => a.id - b.id);
}

/** The ledger under `root` as its file holds it, the empty ledger where there is none. */
export function readLedger(root = ROOT) {
  const path = join(root, LEDGER);
  return existsSync(path) ? read(path) : { next: 1, retired: [] };
}

let discs = null;
/** Every level the discs ship as `{ slot, release, level }`, the US levels in the map's order and
    then each other release's variants, `release` that disc's file and null for the US one. */
function shippedLevels() {
  if (discs === null) {
    discs = read(join(ROOT, "public/map_data.json")).levels.map((level) => ({
      slot: `${level.pack}#${level.index}`,
      release: null,
      level,
    }));
    const releases = join(ROOT, "public/releases");
    for (const name of readdirSync(releases).sort()) {
      const r = read(join(releases, name));
      for (const [slot, level] of Object.entries(r.levels ?? {}))
        discs.push({ slot, release: r, level });
    }
  }
  return discs;
}

/** Every level the discs ship, by the SHA-256 of its canonical file to the first slot that holds it. */
export function shippedDigests() {
  const out = new Map();
  for (const { slot, release, level } of shippedLevels()) {
    const digest = sha256(writeKwl(fromLevel(level)));
    if (!out.has(digest)) out.set(digest, release === null ? slot : `${slot} (${release.id})`);
  }
  return out;
}

const keyed = ({ slot, release }) => (release === null ? slot : `${slot}@${release.id}`);

/** Every level the discs ship by its shape, under its slot, a variant of another disc under
    `slot@release`. */
export function shippedShapes() {
  return shapesOf(shippedLevels().map((l) => ({ slot: keyed(l), project: fromLevel(l.level) })));
}

/** The title a refusal names each shipped level by, under the slot `shippedShapes` keys it by:
    the number the pause screen shows or the disc's name, with the disc's label after a variant's
    title. */
export function shippedTitles() {
  return new Map(
    shippedLevels().map(({ slot, release, level }) => [
      keyed({ slot, release }),
      `${level.shown || level.name}${release === null ? "" : ` (${release.label})`}`,
    ]),
  );
}

let loaded = null;
function readDeps() {
  if (loaded === null) {
    setAnnotations(read(join(ROOT, "public/annotations.json")));
    const hides = read(join(ROOT, "public/objects.json")).skins.hides;
    loaded = {
      hides,
      names: NAMES,
      shipped: shippedDigests(),
      shapes: shippedShapes(),
      titles: shippedTitles(),
    };
  }
  return loaded;
}

/** The segment that carries a level in a link or a hash, or null where there is none. */
export function segmentOf(text) {
  const at = text.indexOf("#");
  if (at < 0) return null;
  return parseHash(text.slice(at)).tails.find((s) => s[0] === LETTER) ?? null;
}

async function documentFrom(source) {
  if (existsSync(source)) {
    try {
      return read(source);
    } catch (e) {
      throw new Error(`${source} is not JSON: ${shown(e.message)}`);
    }
  }
  const segment = segmentOf(source);
  if (segment === null)
    throw new Error(`${source} is neither a file nor a link that carries a level`);
  const { project, report, repairs } = await decodeSegment(segment);
  if (repairs) repaired(repairs, report, "the level in the link");
  return project;
}

// --- the command -------------------------------------------------------------------

function argsOf(argv) {
  const args = { add: null, author: "", notes: "" };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined || !["--add", "--author", "--notes"].includes(flag))
      throw new Error(USAGE);
    args[flag.slice(2)] = value;
  }
  if (args.add === null && (args.author || args.notes)) throw new Error(USAGE);
  return args;
}

function writeUnder(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const written = (r) => {
  try {
    return canonicalOf(r.document) === r.text;
  } catch {
    return true;
  }
};

/** The command over `root`, printing through `out`, a character that would hide or reorder what the
    terminal shows replaced on the way: the index written again, or a level added, and a note for
    each level that holds part of one of the game's levels; its exit code. */
export async function main(argv, root = ROOT, out = console.log) {
  const noted = (notes) => {
    for (const { id, note } of notes) out(`note: record ${id}: ${note}`);
  };
  try {
    const args = argsOf(argv);
    const records = readRecords(root);
    const ledger = readLedger(root);
    const stale = records.filter((r) => !written(r));
    if (stale.length)
      throw new Error(
        stale.map((r) => `${r.path} is not written as the editor saves it`).join("\n"),
      );
    if (args.add === null) {
      const { catalogue, notes } = indexOf(records, ledger, readDeps());
      writeUnder(root, INDEX, writeCatalogue(catalogue));
      const n = catalogue.entries.length;
      out(`${INDEX}: ${n} ${n === 1 ? "entry" : "entries"}`);
      noted(notes);
      return 0;
    }
    const document = filled(await documentFrom(args.add), args);
    const id = isObject(ledger) ? ledger.next : undefined;
    const bumped = {
      next: isId(id) ? id + 1 : id,
      retired: isObject(ledger) ? ledger.retired : undefined,
    };
    const { catalogue, notes } = indexOf([...records, { id, document }], bumped, readDeps());
    writeUnder(root, `${RECORDS}/${id}.json`, canonicalOf(document));
    writeUnder(root, LEDGER, writeLedger(bumped));
    writeUnder(root, INDEX, writeCatalogue(catalogue));
    out(String(id));
    noted(notes.filter((n) => n.id === id));
    return 0;
  } catch (e) {
    for (const line of e.message.split("\n")) out(shown(line));
    return 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main(process.argv.slice(2));
