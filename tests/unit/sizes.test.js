import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** The files under `dir` with one of the `ends`, into subdirectories where `deep`. */
function under(dir, ends, deep = false) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) return deep ? under(path, ends, deep) : [];
    return ends.some((end) => name.endsWith(end)) ? [path] : [];
  });
}

// A file is read whole, so each kind stays under a size; the vendored library
// and the fixtures are not written here and are left out.
const KINDS = [
  [
    "public/js",
    800,
    () => under("public/js", [".js"], true).filter((f) => !f.includes("/vendor/")),
  ],
  ["tests/browser", 800, () => under("tests/browser", [".js"])],
  ["tests/unit", 1000, () => under("tests/unit", [".js"])],
  ["tools", 1000, () => [...under("tools", [".py", ".js"]), ...under("tools/tests", [".py"])]],
];

// A file already over its cap stands here at the next hundred above its size,
// a row a commit may lower and none may raise.
const OVER = {
  "public/js/play/play.js": 1100,
  "public/js/editor/editor.js": 1300,
  "public/js/format/kwl.js": 1000,
  "public/js/editor/patchdialog.js": 900,
  "tests/browser/course.spec.js": 900,
  "tests/unit/docs.test.js": 1300,
  "tests/unit/kwl.test.js": 1300,
  "tests/unit/motion.test.js": 1300,
  "tests/unit/patch.test.js": 1200,
  "tools/kula_kwl.py": 2300,
  "tools/tests/test_kula_kwl.py": 1800,
};

const lines = (path) => readFileSync(join(root, path), "utf8").split("\n").length - 1;
const nextHundred = (n) => Math.floor(n / 100) * 100 + 100;
const capOf = (path) => KINDS.find(([dir]) => path.startsWith(`${dir}/`))[1];
const CUT = "split it where its sections join, a subject to a file";

test("every module, spec, unit test and tool is short enough to read whole", () => {
  const over = [];
  for (const [, cap, files] of KINDS)
    for (const path of files()) {
      const n = lines(path);
      const row = OVER[path];
      if (row !== undefined && n > row)
        over.push(
          `${path}: ${n} lines, over its ${row} on the table; ${CUT}, since a row is never raised`,
        );
      else if (row === undefined && n > cap)
        over.push(`${path}: ${n} lines, over ${cap}; ${CUT}, and add no row`);
    }
  assert.deepEqual(over, []);
});

test("the table names only files still over their cap, at the next hundred above their size", () => {
  const stale = [];
  for (const [path, row] of Object.entries(OVER)) {
    if (!existsSync(join(root, path))) {
      stale.push(`${path}: gone; move or take out its row`);
      continue;
    }
    const n = lines(path);
    const cap = capOf(path);
    if (n <= cap) stale.push(`${path}: ${n} lines, under ${cap}; take its row out`);
    else if (row !== nextHundred(n))
      stale.push(
        `${path}: ${n} lines, its row ${row}; write the next hundred above, ${nextHundred(n)}`,
      );
  }
  assert.deepEqual(stale, []);
});
