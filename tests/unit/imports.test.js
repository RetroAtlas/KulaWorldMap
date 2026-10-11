import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../public/js", import.meta.url));
const IMPORT = /^import\s(?:[^;]*?\sfrom\s+)?"\.\/([^"]+)"/gm;

/** Each module's static imports, by the file they name. */
function graph() {
  const out = new Map();
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".js"))) {
    const text = readFileSync(join(dir, name), "utf8");
    out.set(
      name,
      [...text.matchAll(IMPORT)].map((m) => m[1]),
    );
  }
  return out;
}

test("every static import names a file of the page's", () => {
  for (const [name, imports] of graph())
    for (const target of imports) assert.ok(existsSync(join(dir, target)), `${name}: ${target}`);
});

// Modules talk through the event bus rather than importing each other both
// ways, so a module reached again along its own imports is a cycle.
test("no module imports itself through its imports", () => {
  const g = graph();
  const seen = new Map();
  const path = [];
  const visit = (name) => {
    if (seen.get(name) === "done") return;
    if (seen.get(name) === "open")
      assert.fail(`a cycle: ${[...path.slice(path.indexOf(name)), name].join(" -> ")}`);
    seen.set(name, "open");
    path.push(name);
    for (const target of g.get(name) ?? []) visit(target);
    path.pop();
    seen.set(name, "done");
  };
  for (const name of g.keys()) visit(name);
});
