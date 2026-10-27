import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { most, packs, releases } from "./fixtures.js";

const text = (path) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const disc = text("docs/disc.md");
const format = text("docs/level-format.md");
const readme = text("README.md");
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

const figure = (s) => (s === "nothing" ? 0 : number(s));

test("level-format.md's hourglass sentence gives the other discs' figures as their rules make them", () => {
  const m =
    /^The hourglass scores differently on the other two discs, read off their executables: the PAL disc's turns the clock round from (\d+) ticks rather than (\d+) and scores (\d+) at most, and the Japanese disc's turns it round from (\d+) and scores (\w+)\.$/m.exec(
      format,
    );
  assert.ok(m, "level-format.md has no sentence on the hourglass's points on the other discs");
  const [us, eu, jp] = releases;
  assert.deepEqual(m.slice(1).map(figure), [
    eu.rules.hourglass.from,
    us.rules.hourglass.from,
    most(eu.rules.hourglass),
    jp.rules.hourglass.from,
    most(jp.rules.hourglass),
  ]);
});

test("the README's hourglass sentence gives each disc's figure as its rules make it", () => {
  const m =
    /^The hourglass scores (\d+) at most on the North American disc, (\d+) on the PAL disc and (\w+) on the Japanese one, so the points and the best score the map gives a level are those of the disc shown\.$/m.exec(
      readme,
    );
  assert.ok(m, "the README has no sentence on the hourglass's points on the three discs");
  assert.deepEqual(
    m.slice(1).map(figure),
    releases.map((r) => most(r.rules.hourglass)),
  );
});
