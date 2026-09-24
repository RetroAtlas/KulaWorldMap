import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../../public", import.meta.url));
const TEXT = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".txt", ".xml", ".svg"]);

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (TEXT.has(extname(e.name))) yield p;
  }
}

// Everything under public/ is served, comments included, so none of it may
// point at a machine or at the sibling maps this project grew up beside.
const ELSEWHERE = /\/Users\/|\/home\/|~\/|oddworld|hercules|metal ?slug/i;

test("nothing the site serves names a local path or a sibling map", () => {
  for (const path of files(site)) {
    const hit = ELSEWHERE.exec(readFileSync(path, "utf8"));
    assert.ok(!hit, `${path.slice(site.length + 1)}: "${hit?.[0]}"`);
  }
});
