import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../../public", import.meta.url));
const tools = fileURLToPath(new URL("../../tools", import.meta.url));
const TEXT = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".txt", ".xml", ".svg"]);

function* files(dir, kinds = TEXT) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p, kinds);
    else if (kinds.has(extname(e.name))) yield p;
  }
}

// Everything under public/ is served, comments included, so none of it may
// point at a path on a machine or name a script, test or document of this repo.
const ELSEWHERE = /\/Users\/|\/home\/|~\//;
const scripts = [...files(tools, new Set([".py"]))].map((p) => basename(p).replace(".", "\\."));
const REPO = new RegExp(
  `\\b(tools|tests|docs|backlog)/|(README|CLAUDE)\\.md|\\.(spec|test)\\.js|\\b(${scripts.join("|")})\\b`,
);

const names = (pattern) => {
  for (const path of files(site)) {
    const hit = pattern.exec(readFileSync(path, "utf8"));
    assert.ok(!hit, `${path.slice(site.length + 1)}: "${hit?.[0]}"`);
  }
};

test("nothing the site serves names a local path", () => names(ELSEWHERE));

test("nothing the site serves names a script, test or document of this repo", () => names(REPO));

test("the manifest's icons are files, each raster at the size it promises", () => {
  const manifest = JSON.parse(readFileSync(join(site, "site.webmanifest"), "utf8"));
  assert.ok(manifest.icons.length > 0);
  for (const { src, sizes, type } of manifest.icons) {
    const file = readFileSync(join(site, src.replace(/^\//, "")));
    if (type !== "image/png") continue;
    assert.equal(`${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`, sizes, src);
  }
});
