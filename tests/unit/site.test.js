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
// point at a path on a machine.
const ELSEWHERE = /\/Users\/|\/home\/|~\//;

test("nothing the site serves names a local path", () => {
  for (const path of files(site)) {
    const hit = ELSEWHERE.exec(readFileSync(path, "utf8"));
    assert.ok(!hit, `${path.slice(site.length + 1)}: "${hit?.[0]}"`);
  }
});

test("the manifest's icons are files, each raster at the size it promises", () => {
  const manifest = JSON.parse(readFileSync(join(site, "site.webmanifest"), "utf8"));
  assert.ok(manifest.icons.length > 0);
  for (const { src, sizes, type } of manifest.icons) {
    const file = readFileSync(join(site, src.replace(/^\//, "")));
    if (type !== "image/png") continue;
    assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, sizes, src);
  }
});
