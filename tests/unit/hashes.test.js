import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const TEXT = new Set([".md", ".js", ".mjs", ".py", ".json", ".html", ".css", ".yml", ".txt"]);
const GENERATED = new Set(["public/map_data.json", "public/objects.json", "package-lock.json"]);

// A run of hex with a letter and a digit in it, standing alone: an address
// keeps its 0x and a colour its #, so neither reads as one.
const HASH = /(?<![\w#./-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?!\w)/;

test("nothing in the repo cites a commit by its hash", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
  for (const path of tracked) {
    if (!TEXT.has(extname(path)) || GENERATED.has(path)) continue;
    const hit = HASH.exec(readFileSync(join(root, path), "utf8"));
    assert.ok(!hit, `${path}: "${hit?.[0]}"`);
  }
});
