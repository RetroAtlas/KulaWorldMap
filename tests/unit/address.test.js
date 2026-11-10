import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { address } from "../../public/js/viewer/ui/address.js";

const site = fileURLToPath(new URL("../../public", import.meta.url));
const TEXT = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".txt", ".xml", ".svg"]);
const JOINED = "hello@retroatlas.org";

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "vendor") yield* files(p);
    } else if (TEXT.has(extname(e.name))) yield p;
  }
}

test("the address is joined from its parts at the call", () => {
  assert.equal(address(), JOINED);
});

// The About joins the address when it opens, so a scraper that reads the source never finds it.
test("nothing the site serves holds the contact address whole", () => {
  for (const path of files(site))
    assert.ok(!readFileSync(path, "utf8").includes(JOINED), path.slice(site.length + 1));
});
