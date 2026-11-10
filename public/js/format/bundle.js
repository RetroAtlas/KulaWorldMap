// A bundle: levels in play order under a title, an author and notes, saved as one file.
import {
  COPYCAT_SLOTS,
  FINAL_SLOTS,
  FORMAT,
  VERSION,
  WORLDS,
  WORLD_SLOTS,
  collapse,
} from "./kwl.js";
import {
  TEXT_MOST,
  TITLE_MOST,
  UNTITLED,
  projectLines,
  readProject,
  readVersion,
  text,
} from "./project.js";

export const BUNDLE_FORMAT = "kula-world-bundle";
/** The most levels a bundle holds: as many as the disc has slots. */
export const BUNDLE_MOST = WORLDS.length * (WORLD_SLOTS + FINAL_SLOTS) + COPYCAT_SLOTS;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isLevelDocument = (v) => isObject(v) && v.format === FORMAT;

/** { bundle, report, repairs, levels } for a bundle file, as text or parsed, each of `levels` a level's read with `at`, its place in the file's list; throws on another format's file. */
export function readBundle(source) {
  const raw = typeof source === "string" ? JSON.parse(source) : source;
  if (!isObject(raw) || raw.format !== BUNDLE_FORMAT)
    throw new Error(`not a ${BUNDLE_FORMAT} file`);
  const report = [];
  const noted = readVersion(raw, report);
  const bundle = {
    format: BUNDLE_FORMAT,
    version: VERSION,
    title: text(raw, "title", TITLE_MOST, report),
    author: text(raw, "author", TEXT_MOST, report),
    notes: text(raw, "notes", TEXT_MOST, report),
    levels: [],
  };
  const levels = [];
  let carried = 0;
  let theirs = 0;
  if (!Array.isArray(raw.levels)) report.push("no levels");
  else {
    for (const [i, entry] of raw.levels.slice(0, BUNDLE_MOST).entries()) {
      if (!isLevelDocument(entry)) {
        report.push(`level ${i} is not a ${FORMAT} document; it is left out`);
        continue;
      }
      const read = readProject(entry, { collapsed: false });
      const where = `level ${i} (${read.project.title || UNTITLED})`;
      for (const line of read.report) report.push(`${where}: ${line}`);
      carried += read.report.length;
      theirs += read.repairs;
      bundle.levels.push(read.project);
      levels.push({
        project: read.project,
        report: collapse(read.report),
        repairs: read.repairs,
        at: i,
      });
    }
    if (raw.levels.length > BUNDLE_MOST)
      report.push(
        `levels lists ${raw.levels.length} levels, more than the ${BUNDLE_MOST} kept; it is cut to ${BUNDLE_MOST}`,
      );
  }
  return {
    bundle,
    report: collapse(report),
    repairs: report.length - carried - noted + theirs,
    levels,
  };
}

/** The bundle file's text, written the same way every time, each level as its own file indented. */
export function writeBundle(bundle) {
  const head = {
    format: BUNDLE_FORMAT,
    version: VERSION,
    title: bundle.title ?? "",
    author: bundle.author ?? "",
    notes: bundle.notes ?? "",
  };
  const lines = Object.entries(head).map(
    ([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`,
  );
  const levels = (bundle.levels ?? []).map((project) => {
    const inside = projectLines(project).map((line) => `    ${line}`);
    return `    {\n${inside.join("\n")}\n    }`;
  });
  if (levels.length) lines.push(`  "levels": [`, levels.join(",\n"), `  ]`);
  else lines.push(`  "levels": []`);
  return `{\n${lines.join("\n")}\n}\n`;
}
