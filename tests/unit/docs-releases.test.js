import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { packs, releases } from "./fixtures.js";

const disc = readFileSync(fileURLToPath(new URL("../../docs/disc.md", import.meta.url)), "utf8");
const number = (s) => Number(s.replace(/,/g, ""));
const rows = (pattern) => [...disc.matchAll(pattern)].map((m) => m.slice(1));
// The US layout is packs.json, which its release file repeats.
const layouts = releases.map((r) => (r.id === "us" ? packs : r.packs));

test("disc.md's image table names each release, counts its sectors and puts its room where its layout does", () => {
  const found = rows(
    /^\| ([^|`]+), ([A-Z]{4}-\d{5}) \| ([\d,]+) \| \d{4}-\d{2}-\d{2} \| `([^`]+)` at \d+ to \d+ \| [\d,]+ \| [\d,]+ \| \d+ \| \d+ \| (\d+) \|$/gm,
  );
  assert.deepEqual(
    found.map(([name, serial, sectors, boot, room]) => [
      name,
      serial,
      number(sectors),
      boot,
      number(room),
    ]),
    releases.map((r, i) => [r.name, r.serial, r.sectors, r.boot, layouts[i].room.lba]),
  );
});

test("disc.md's pack sector table is where each release's layout puts every pack", () => {
  assert.deepEqual(
    rows(/^\| `([^`]+)` \| (\d+) \| (\d+) \| (\d+) \|$/gm).map(([path, ...at]) => [
      path,
      ...at.map(number),
    ]),
    layouts[0].packs.map((p, k) => [p.path, ...layouts.map((l) => l.packs[k].lba)]),
  );
});
