import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KIND, TYPE } from "../../public/js/format/lattice.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const TABLES = { KIND, TYPE };
const NAMED = /(?<![\w$.])(KIND|TYPE)\.(\w+)/g;

/** Every script under `dir`, relative to the root, the vendored library left out. */
const scripts = (dir) =>
  readdirSync(join(root, dir), { recursive: true })
    .filter((f) => f.endsWith(".js") && !f.startsWith("vendor/"))
    .map((f) => join(dir, f));

// A name the table lacks reads as undefined and compares false, so a misspelt kind or type
// breaks nothing that would throw.
test("every kind and type a script names is one the tables hold", () => {
  for (const path of [...scripts("public/js"), ...scripts("tests")])
    for (const [, table, name] of readFileSync(join(root, path), "utf8").matchAll(NAMED))
      assert.ok(Object.hasOwn(TABLES[table], name), `${path}: ${table}.${name}`);
});
