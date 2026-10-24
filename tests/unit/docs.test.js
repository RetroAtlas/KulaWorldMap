import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, annotations, packs, levelKey } from "./fixtures.js";
import { IN_PLACE, LARGEST, REBUILD, fit, packSize } from "../../public/js/format/pak.js";
import { FACES, PICKUPS } from "../../public/js/format/kwl.js";
import { FACE_NORMAL } from "../../public/js/format/lattice.js";
import { TANGENT, cross, layHeading } from "../../public/js/viewer/data.js";
import { heading } from "../../public/js/viewer/travel.js";
import { PACKS } from "../../public/js/format/patch.js";
import { USER, USER_OFF } from "../../public/js/format/sectors.js";
import { FINALS_AT, PACK_AT, ROOM_AT, ROOM_SECTORS, SYNTHETIC_SECTORS } from "./synthetic.js";

const text = (path) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const format = text("docs/level-format.md");
const disc = text("docs/disc.md");
const reasons = text("docs/annotations.md");
const page = text("public/index.html");

const objectsOf = (levels) => levels.flatMap((l) => l.records.flatMap((r) => r.on));
// What the game has is counted over the levels the game plays: the catalogue is
// not one of them, and two of its types are placed nowhere else.
const played = mapData.levels.filter((l) => l.name !== "OBJ LEVEL");
const objects = objectsOf(played);
const cellValues = mapData.levels.flatMap((l) => l.cells.filter((_, i) => i % 4 === 3));
const count = (v) => cellValues.filter((c) => c === v).length;
const onFace = (test) => objectsOf(mapData.levels).filter((o) => test(o.face)).length;
const catalogue = mapData.levels.find(
  (l) => l.name === "OBJ LEVEL" && l.pack === "/HILLS/HILLS.PAK",
);
const types = new Set(objects.map((o) => o.type));
const here = new Set(objectsOf([catalogue]).map((o) => o.type));
const covered = [...types].filter((t) => here.has(t));
const WORDS = [
  ..."no one two three four five six seven eight nine ten".split(" "),
  ..."eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" "),
];
const TENS = { twenty: 20, thirty: 30 };
const number = (s) => {
  const word = s.toLowerCase();
  return WORDS.includes(word) ? WORDS.indexOf(word) : (TENS[word] ?? Number(s.replace(/,/g, "")));
};
// A capture is a figure where it reads as one, and a name otherwise.
const read = (s) => (Number.isNaN(number(s)) ? s : number(s));

const worldPack = (path) => !/FI\.PAK|COPYCAT/.test(path);
const inWorld = (l) => worldPack(l.pack);
const levels = (test) => mapData.levels.filter(test).length;
const SECTOR = 2048;
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
const held = sum(packs.packs, (p) => p.size);
const capacity = sum(packs.packs, (p) => p.capacity);
const wins = (p) => sum(p.slots, (s) => s.size - s.size9);

const title = (l) => l.shown || l.name;
const named = (t) => mapData.levels.find((l) => title(l) === t);
const records = mapData.levels.flatMap((l) => l.records.map((r) => ({ l, r })));
const ofKind = (k) => records.filter(({ r }) => r.kind === k);
const placements = records.flatMap(({ l, r }) => r.on.map((o) => ({ l, r, o })));
const ofType = (t) => placements.filter(({ o }) => o.type === t);
const on = (t) => (l) => sum(l.records, (r) => r.on.filter((o) => o.type === t).length);
const kindOn = (k) => (l) => l.records.filter((r) => r.kind === k).length;
const field = (x, name) => x.f[Number(name.slice(1)) - 2];
// How many there are where every one passes, and null where one does not.
const all = (xs, ok) => (xs.every(ok) ? xs.length : null);
const uniform = (xs) => (xs.every((x) => x === xs[0]) ? xs[0] : null);
const values = (t, name) => new Set(ofType(t).map(({ o }) => field(o, name))).size;

// The first numbered level that carries a thing, and how many it carries.
const numbered = mapData.levels
  .filter((l) => /^LEVEL \d+$/.test(title(l)))
  .sort((a, b) => number(title(a).slice(6)) - number(title(b).slice(6)));
const first = (carried) => {
  const l = numbered.find((l) => carried(l) > 0);
  return [title(l), carried(l)];
};
// The worlds' levels in the order play reaches them, each hidden and bonus level in its place.
const inPlay = mapData.themes.flatMap(({ id }) => {
  const slot = (i) => mapData.levels.find((l) => l.pack === `/${id}/${id}.PAK` && l.index === i);
  return Array.from({ length: 15 }, (_, i) => [
    slot(i),
    ...(on(26)(slot(i)) ? [slot(18)] : []),
    ...(i % 5 === 4 ? [slot(15 + (i - 4) / 5)] : []),
  ]).flat();
});
// Each level that carries a thing and comes in play before the first numbered level that does.
const ahead = (carried) =>
  inPlay
    .slice(0, inPlay.indexOf(named(first(carried)[0])))
    .filter((l) => carried(l) > 0)
    .flatMap((l) => [title(l), carried(l)]);

const copies = mapData.levels.filter((l) => l.name === "OBJ LEVEL");
// What each copy of the catalogue holds, where every copy holds it alike and no other level any.
const inEachCopy = (carried) =>
  mapData.levels.every((l) => carried(l) === (copies.includes(l) ? carried(copies[0]) : 0))
    ? carried(copies[0])
    : null;
const style = (v) => (l) => l.cells.filter((c, i) => i % 4 === 3 && c === v).length;
const iceBlocks = (l) => style(2)(l) + kindOn(2)(l);
const cellsOf = (l) =>
  Array.from({ length: l.cells.length / 4 }, (_, i) => l.cells.slice(4 * i, 4 * i + 3));
const lattices = new Map(mapData.levels.map((l) => [l, new Set(cellsOf(l).map(String))]));
const inLattice = (l, cell) => lattices.get(l).has(String(cell));

const ends = (r) => [r.f.slice(2, 5), r.f.slice(5, 8)];
const lowerFirst = ({ r }) => ends(r)[0].every((v, i) => v <= ends(r)[1][i]);
const oneAxis = ({ r }) => ends(r)[0].filter((v, i) => v !== ends(r)[1][i]).length === 1;
const beamEnds = ofKind(8).flatMap(({ l, r }) => ends(r).map((end) => inLattice(l, end)));
// A span stands on one end, its type the way to the other in the game's numbering of the six.
const headed = ({ r }) => {
  const own = [r.x, r.y, r.z];
  const others = ends(r).filter((end) => String(end) !== String(own));
  return (
    others.length === 1 &&
    String(FACE_NORMAL[r.type]) === String(others[0].map((v, i) => Math.sign(v - own[i])))
  );
};

const settings = ofKind(9);
const lastRecord = ({ l, r }) => l.records.at(-1) === r;
const hiddenFlag = settings.filter(({ r }) => r.type === 1);
const onHiddenSlot = ({ l }) => inWorld(l) && l.index === 18;
const fromAfar = settings.filter(({ r }) => field(r, "f2") === 1);
const onEmptyCell = settings.filter(({ l, r }) => !inLattice(l, [r.x, r.y, r.z]));

// Every teleporter with the one its link names, a record's index times sixteen plus a face, and
// the rings the links send the ball round.
const teleporters = [];
const rings = [];
for (const l of mapData.levels) {
  const at = new Map();
  l.records.forEach((r, k) => r.on.forEach((o) => o.type === 5 && at.set(k * 16 + o.face, o)));
  for (const o of at.values()) teleporters.push({ o, to: at.get(field(o, "f7")) });
  const seen = new Set();
  for (const [link, o] of at) {
    let size = 0;
    let k = link;
    while (at.has(k) && !seen.has(k)) {
      seen.add(k);
      size++;
      k = field(at.get(k), "f7");
    }
    if (size && k === link) rings.push({ l, colour: field(o, "f3"), size });
  }
}
const toItsColour = ({ o, to }) => to && field(to, "f3") === field(o, "f3");
const [YELLOW, BLUE, GREEN, RED] = [0, 1, 2, 3];
const ring = (t, colour) => rings.find((g) => title(g.l) === t && g.colour === colour)?.size;
const selfRings = (l) => rings.filter((g) => g.l === l && g.size === 1).length;

const devicesOf = (l) => l.records.flatMap((r) => r.on.filter((o) => [5, 9].includes(o.type)));
const lasersOf = (l, colour) => l.records.filter((r) => r.kind === 8 && r.colour === colour);
// The levels where a switch or a teleporter shares its colour with a laser.
const sharing = mapData.levels.filter((l) =>
  devicesOf(l).some((o) => lasersOf(l, field(o, "f3")).length),
);
// Whether every device on a level starts on exactly where the beams of its colour start lit.
const agreeing = (l) =>
  devicesOf(l).every((o) =>
    lasersOf(l, field(o, "f3")).every((r) => (field(r, "f3") === 1) === (field(o, "f4") === 1)),
  );
const listed = (ns) => `${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`;
const sharingAs = (prefix) =>
  listed(
    sharing
      .filter((l) => title(l).startsWith(`${prefix} `))
      .map((l) => Number(title(l).slice(prefix.length + 1)))
      .sort((a, b) => a - b),
  );

const bonus = mapData.levels.filter((l) => inWorld(l) && [15, 16, 17].includes(l.index));
const rooms = mapData.levels.filter((l) => /COPYCAT/.test(l.pack));
const onStart = (l) => on(30)(l) === 1 && !on(29)(l);
const onClock = (l) => on(29)(l) === 1 && !on(30)(l);
const offStart = mapData.levels.filter((l) => !onStart(l));
const coin = annotations.types[37];
const worth = (t, points) =>
  all(
    ofType(37).filter(({ l }) => title(l) === t),
    ({ o }) => coin.variants[field(o, coin.by)]?.points === points,
  );
// The colour every coin on a level shows, by its tier's name, or null where they differ.
const coinColour = (l) =>
  uniform(
    ofType(37)
      .filter((p) => p.l === l)
      .map(({ o }) => /\((\w+)\)$/.exec(coin.variants[field(o, coin.by)].name)[1]),
  );
const withoutCommonFruit = ({ l }) => !on(46)(l);
const hiddenExits = mapData.levels.filter(on(26));
const pickups = placements.filter(({ o }) => PICKUPS.includes(o.type));
const unnumbered = pickups.filter(({ o }) => field(o, "f5") === -1);
// A level's pickups where they are the only ones in the game whose number is unset, else null.
const unnumberedOn = (t) => {
  const its = pickups.filter(({ l }) => title(l) === t);
  return unnumbered.length === its.length && unnumbered.every(({ l }) => title(l) === t)
    ? its.length
    : null;
};
const depths = cellsOf(named("HIDDEN 10")).map(([, , z]) => z);
const frame = depths.filter((z) => z !== 32);
const curated = Object.values(annotations.levels).filter((e) => "score" in e).length;

const extent = (l, axis) => l.max[axis] - l.min[axis];
const thinnestDown = (l) => extent(l, 2) < extent(l, 0) && extent(l, 2) < extent(l, 1);
const atDepth = (l, z) => cellsOf(l).filter(([, , depth]) => depth === z).length;
const high = (l) => l.header >> 16;
const letterRows = [
  ...new Set(cellsOf(named("HIDDEN 10")).flatMap(([, y, z]) => (z === 32 ? [y] : []))),
].sort((a, b) => a - b);
// The height of each line of the lettering, a line being a run of rows next to one another.
const lineHeights = letterRows.reduce(
  (hs, y, i) => (y === letterRows[i - 1] + 1 ? [...hs.slice(0, -1), hs.at(-1) + 1] : [...hs, 1]),
  [],
);
const level98 = named("LEVEL 98");
// How many colours two lists share where they hold the same ones, else null.
const sameColours = (a, b) =>
  String([...new Set(a)].sort()) === String([...new Set(b)].sort()) ? new Set(a).size : null;
const worldPacks = packs.packs.filter((p) => worldPack(p.path));
const catalogueOnly = [...here].filter((t) => !types.has(t)).sort((a, b) => a - b);

const fixture = (name) => JSON.parse(text(`tests/fixtures/${name}`));
const digests = fixture("kwl-digests.json");
const digested = Object.keys(digests).filter((k) => k.includes("#"));
const lastSlot = (test) =>
  uniform(packs.packs.filter((p) => test(p.path)).map((p) => p.slots.length - 1));
const levelsOf = (xs) => new Set(xs.map(({ l }) => l)).size;
const turnedClocks = ofType(8).filter(({ o }) => field(o, "f2") === 4);
const level125 = named("LEVEL 125");
const yellowOn125 = (t) =>
  ofType(t).filter(({ l, o }) => l === level125 && field(o, "f3") === YELLOW).length;

const packOf = (l) => packs.packs.find((p) => p.path === l.pack);
const basename = (path) => path.split("/").pop();
const sectors = fixture("sectors.json");
const patchSets = fixture("patch-digests.json").sets;
const full = packs.packs.filter((p) => p.size === p.capacity);
// Where each shipped level's own stream goes back into its slot, as the page fits it.
const fits = mapData.levels.map((l) => ({
  l,
  over: digests[levelKey(l)].size - packOf(l).slots[l.index].size,
  ...fit(packOf(l), l.index, digests[levelKey(l)].size, title(l)),
}));
const rebuilt = fits.filter((f) => f.path !== IN_PLACE);
const recompressed = rebuilt.filter((f) => f.recompressed);
const level1 = fits.find((f) => title(f.l) === "LEVEL 1");
const laidOut = (p) =>
  packSize(
    p.slots.map((s) => s.name),
    p.slots.map((s) => s.size),
  );

const axisName = (v) => {
  const i = v.findIndex((c) => c !== 0);
  return `${v[i] > 0 ? "+" : "-"}${"xyz"[i]}`;
};
// The docs' name for a tangent of a face, the second being the first turned a quarter.
const tangentName = (face, v) => {
  const first = TANGENT[face];
  const second = cross(
    FACE_NORMAL[face].map((c) => -c),
    first,
  );
  const named = {
    first,
    second,
    "first turned round": first.map((c) => -c),
    "second turned round": second.map((c) => -c),
  };
  return Object.keys(named).find((n) => named[n].every((c, i) => c === v[i]));
};

// Each row is the figure a sentence rests on, so a rebuild that moves it cannot go unnoticed.
const claims = [
  ["README.md", "levels", mapData.levels.length, /All (\d+) levels are here/],
  [
    "README.md",
    "numbered levels",
    levels((l) => inWorld(l) && l.index < 15),
    /(\d+) numbered levels/,
  ],
  ["README.md", "worlds", mapData.themes.length, /across (\w+) worlds/],
  [
    "README.md",
    "bonus levels",
    levels((l) => inWorld(l) && [15, 16, 17].includes(l.index)),
    /(\d+) bonus/,
  ],
  [
    "README.md",
    "hidden levels",
    levels((l) => inWorld(l) && l.index === 18),
    /(\d+) hidden levels/,
  ],
  ["README.md", "finals", levels((l) => /FI\.PAK/.test(l.pack)), /the (\d+) finals/],
  ["README.md", "Simon rooms", levels((l) => /COPYCAT/.test(l.pack)), /the (\d+) Simon rooms/],
  [
    "README.md",
    "catalogue copies",
    levels((l) => l.name === "OBJ LEVEL"),
    /the (\w+) copies of the object catalogue/,
  ],
  [
    "README.md",
    "plain blocks whose records carry nothing",
    all(
      records.filter(({ r }) => r.kind < 5 && !r.on.length),
      ({ r }) => r.kind === 0,
    ),
    /and (\w+) plain blocks on the disc carry one with nothing on them/,
  ],
  ["docs/level-format.md", "lattice side", mapData.side, /\*\*fixed at (\d+) x \d+ x \d+\*\*/],
  [
    "docs/level-format.md",
    "cell/record pairs",
    cellValues.filter((c) => c >= mapData.firstRecord).length,
    /all (\d+) pairs in the game agree/,
  ],
  [
    "docs/level-format.md",
    "cells by style",
    [count(0), count(3), count(2), count(1), count(4)],
    /(\d+) cells are plain, then (\d+) invisible, (\d+) ice, (\d+) fire and (\d+) acid/,
  ],
  [
    "docs/level-format.md",
    "objects by face",
    [onFace((f) => f === 0), onFace((f) => f === 5), onFace((f) => f > 0 && f < 5)],
    /(\d+) on tops, (\d+) on undersides and (\d+) on sides/,
  ],
  ["docs/level-format.md", "distinct types", types.size, /\*\*(\d+) distinct object types\*\*/],
  [
    "docs/level-format.md",
    "levels at time 99 and below it",
    [levels((l) => l.time === 99), mapData.levels.length, levels((l) => l.time < 99)],
    /99 on (\d+) of the (\d+) levels and lower on the other (\w+)/,
  ],
  [
    "docs/level-format.md",
    "catalogue objects",
    objectsOf([catalogue]).length,
    /object catalogue: (\d+) objects and/,
  ],
  [
    "docs/level-format.md",
    "types the catalogue covers",
    [covered.length, types.size],
    /covering \*\*(\d+) of the game's (\d+) object types\*\*/,
  ],
  [
    "docs/level-format.md",
    "levels thinnest along z",
    [levels(thinnestDown), mapData.levels.length],
    /it is the thinnest of the three on (\d+) of the (\d+) levels/,
  ],
  [
    "docs/level-format.md",
    "the catalogue's block above its floor",
    [atDepth(catalogue, 14), atDepth(catalogue, 17)],
    /`OBJ LEVEL` puts (\w+) block at `z=14` against a floor of (\d+) at `z=17`/,
  ],
  [
    "docs/level-format.md",
    "HIDDEN 10's blocks, its frame and its lettering",
    [depths.length, frame.length, depths.length - frame.length, 32 - Math.max(...frame)],
    /carries (\d+) blocks of which only (\d+) are the level; the other (\d+) lie flat on `z=32`, the floor of the lattice, (\d+) blocks below anything the ball can stand on/,
  ],
  [
    "docs/level-format.md",
    "the height of HIDDEN 10's lettering",
    uniform(lineHeights),
    /in block capitals (\w+) blocks tall/,
  ],
  [
    "docs/level-format.md",
    "headers",
    [
      levels((l) => l.header === l.placed),
      mapData.levels.length,
      levels((l) => l.header < 0),
      Math.min(...mapData.levels.map((l) => l.header)),
    ],
    /equals the placed-cell count on (\d+) of the (\d+) levels, is negative on (\d+), down to (-\d+)/,
  ],
  [
    "docs/level-format.md",
    "headers' high halves",
    [levels((l) => high(l) === -1), levels((l) => high(l) === 0)],
    /Its high half is `-1` on exactly the (\d+) levels where the word is negative and `0` on the other (\d+)/,
  ],
  [
    "docs/level-format.md",
    "objects a record carries",
    [FACES, records.filter(({ r }) => r.on.length === 2).length],
    /So a block carries up to (\w+) objects, (\d+) carry two/,
  ],
  [
    "docs/level-format.md",
    "HIDDEN 10's objects",
    all(
      placements.filter(({ l }) => title(l) === "HIDDEN 10"),
      ({ o }) => o.face === 3,
    ),
    /`HIDDEN 10` puts all (\w+) of its objects in slot 3/,
  ],
  [
    "docs/level-format.md",
    "spans whose type is the way to the far end",
    [all(ofKind(8), headed), all(ofKind(5), headed)],
    /far end of the beam, on all (\d+) and on the (\d+) kind-5 records with the same layout/,
  ],
  [
    "docs/level-format.md",
    "levels whose last record is the settings",
    all(settings, lastRecord),
    /Kind 9 is the last record on (\d+) levels/,
  ],
  [
    "docs/level-format.md",
    "hidden levels",
    all(hiddenFlag, onHiddenSlot),
    /and it is 1 on exactly the (\w+);/,
  ],
  [
    "docs/level-format.md",
    "acid blocks",
    inEachCopy(style(4)),
    /Style 4 is (\w+) cell in each copy of `OBJ LEVEL` and nowhere else/,
  ],
  [
    "docs/level-format.md",
    "levels where something cannot be collected",
    curated,
    /on the other (\d+) something cannot be collected/,
  ],
  [
    "docs/level-format.md",
    "curated scores",
    curated,
    /so does the best score on each of the (\d+)/,
  ],
  [
    "docs/level-format.md",
    "lasers on one axis",
    all(ofKind(8), oneAxis),
    /on all (\d+) in the game the pair differs on exactly one axis/,
  ],
  [
    "docs/level-format.md",
    "LEVEL 98's lasers and switches",
    [
      kindOn(8)(level98),
      on(9)(level98),
      sameColours(
        ofKind(8)
          .filter(({ l }) => l === level98)
          .map(({ r }) => r.colour),
        ofType(9)
          .filter(({ l }) => l === level98)
          .map(({ o }) => field(o, "f3")),
      ),
    ],
    /LEVEL 98's (\w+) lasers and (\w+) switches read the same (\w+) numbers/,
  ],
  ["docs/level-format.md", "slots", FACES * records.length, /in all ([\d,]+) slots/],
  [
    "docs/level-format.md",
    "LEVEL 68's arrows on a -y face",
    all(
      ofType(28).filter(({ l, o }) => title(l) === "LEVEL 68" && o.face === 3),
      ({ o }) => field(o, "f2") === 3,
    ),
    /LEVEL 68's (\w+) arrows on a `-y` face, reading 3/,
  ],
  [
    "docs/level-format.md",
    "catalogue-only types",
    [catalogueOnly.length, ...catalogueOnly],
    /the (\w+) catalogue-only types (\d+) and (\d+)/,
  ],
  [
    "docs/level-format.md",
    "pickups whose number is unset",
    all(
      unnumbered,
      ({ l, o }) =>
        title(l) === "BONUS 30" && field(o, "f9") === -1 && field(o, "f10") === -1 && o.v === -1,
    ),
    /The (\d+) pickups whose number is unset, all on BONUS 30 with their `f9`, `f10` and `f14` unset too/,
  ],
  [
    "docs/level-format.md",
    "levels where lasers and switches or teleporters share a colour and agree",
    sharing.every(agreeing) &&
    sharing.every((l) => /^(?:LEVEL|FINAL) \d+$/.test(title(l)) || copies.includes(l))
      ? [sharingAs("LEVEL"), sharingAs("FINAL"), sharing.filter((l) => copies.includes(l)).length]
      : null,
    /no exceptions across LEVEL (\d+(?:, \d+)* and \d+), FINAL (\d+(?:, \d+)* and \d+) and the (\w+) copies of OBJ LEVEL\./,
  ],
  ["docs/level-format.md", "switches", ofType(9).length, /(\d+) switches in all/],
  [
    "docs/level-format.md",
    "teleporters and the rings they send the ball round",
    [
      all(teleporters, toItsColour),
      rings.filter((g) => g.size === 2).length,
      rings.filter((g) => g.size === 1).length,
      inEachCopy(selfRings),
      rings.filter((g) => g.size > 2).length,
      ring("LEVEL 68", BLUE),
      ring("LEVEL 68", YELLOW),
      ring("LEVEL 70", GREEN),
      ring("BONUS 23", RED),
    ],
    /All (\d+) name a teleporter of their own colour, which the build checks as well, and a colour's teleporters on a level send the ball round one ring: (\d+) pairs, (\d+) that name themselves, (\w+) in each copy of OBJ LEVEL, and (\w+) longer rings, LEVEL 68's (\w+) blue and (\w+) yellow, LEVEL 70's (\w+) green and BONUS 23's (\w+) red teleporters/,
  ],
  [
    "docs/level-format.md",
    "a world pack's slots",
    uniform(worldPacks.map((p) => p.slots.length)),
    /A world's pack holds (\w+) slots/,
  ],
  [
    "docs/level-format.md",
    "copies of the catalogue among the worlds",
    [copies.length, mapData.themes.length],
    /ships in (\w+) of the (\w+) worlds, identical every time/,
  ],
  [
    "docs/level-format.md",
    "slots a cheat reaches",
    sum(worldPacks, (p) => p.slots.length),
    /reaches any of the (\d+) without touching the disc/,
  ],
  ["docs/editor.md", "worlds", mapData.themes.length, /one of the (\w+) disc ids/],
  [
    "docs/editor.md",
    "the last slot of a world pack, a finals pack and the Simon rooms' pack",
    [
      lastSlot(worldPack),
      lastSlot((path) => /FI\.PAK/.test(path)),
      lastSlot((path) => /COPYCAT/.test(path)),
    ],
    /a world pack's slot 0 to (\d+), a finals pack's slot 0 or (\d+) or the Simon rooms' pack's slot 0 to (\d+)/,
  ],
  [
    "docs/editor.md",
    "spans with the lower end first",
    all([...ofKind(5), ...ofKind(8)], lowerFirst),
    /lower first on all (\d+) spans of the disc/,
  ],
  [
    "docs/editor.md",
    "switches and teleporters",
    [ofType(9).length, ofType(5).length],
    /the disc's (\d+) switches and (\d+) teleporters follow without exception/,
  ],
  [
    "docs/editor.md",
    "BONUS 30's unnumbered pickups",
    unnumberedOn("BONUS 30"),
    /BONUS 30 having left its (\w+) unnumbered/,
  ],
  [
    "docs/editor.md",
    "types the disc places",
    new Set(placements.map(({ o }) => o.type)).size,
    /anything but the (\d+) types the disc places/,
  ],
  [
    "docs/editor.md",
    "packs a disc image lists",
    packs.packs.length,
    /the (\d+) the disc has and any other `\.PAK` the walk finds/,
  ],
  [
    "docs/editor.md",
    "levels of the community's viewer in the fixture",
    Object.keys(fixture("orbit-levels.json").levels).length,
    /`tests\/fixtures\/orbit-levels\.json` holds (\w+) of the 169/,
  ],
  [
    "docs/editor.md",
    "links of the community's viewer in the fixture",
    Object.keys(fixture("orbit-levels.json").levels).length,
    /makes of each of its (\w+) levels/,
  ],
  [
    "docs/editor.md",
    "levels the digest fixture holds",
    String(digested.sort()) === String(mapData.levels.map(levelKey).sort())
      ? digested.length
      : null,
    /for each of the (\d+) shipped levels keyed by/,
  ],
  [
    "docs/editor.md",
    "templates the digests hold",
    digested.length,
    /both digests over all (\d+) templates/,
  ],
  [
    "docs/editor.md",
    "deflate vectors",
    fixture("deflate-vectors.json").vectors.length,
    /`tests\/fixtures\/deflate-vectors\.json` holds (\w+) inputs/,
  ],
  [
    "docs/editor.md",
    "levels whose rebuild has fewer records",
    [
      levelsOf(settings.filter(({ r }) => r.type !== 1 && field(r, "f2") !== 1)),
      levelsOf(records.filter(({ r }) => r.kind < 5 && !r.on.length)),
    ],
    /(\d+) that carry a settings record with neither flag set and (\d+) that carry a record with nothing on it/,
  ],
  [
    "docs/editor.md",
    "clocks left turned",
    [turnedClocks.length, ofType(8).length],
    /4 left by the editor on (\d+) of (\d+) clocks/,
  ],
  [
    "docs/editor.md",
    "lasers with a deleted object's constants",
    ofKind(8).filter(({ r }) => field(r, "f10") !== -1).length,
    /a deleted object's constants on (\w+) lasers/,
  ],
  [
    "docs/editor.md",
    "LEVEL 125's yellow teleporters",
    yellowOn125(9) === 0 ? yellowOn125(5) : null,
    /LEVEL 125's (\w+) yellow teleporters/,
  ],
  [
    "docs/disc.md",
    "bytes the packs hold, their sectors, capacity and spare",
    [held, capacity / SECTOR, capacity, capacity - held],
    /Between them the packs hold ([\d,]+) bytes in (\d+) sectors, ([\d,]+) bytes of capacity, so ([\d,]+) bytes are spare/,
  ],
  [
    "docs/disc.md",
    "level 9 wins",
    sum(packs.packs, wins),
    /at level 9 saves, ([\d,]+) bytes across the disc/,
  ],
  [
    "docs/disc.md",
    "free room",
    [packs.room.size, packs.room.lba, Math.ceil(packs.room.size / SECTOR)],
    /`\/3\.00`, the last file: ([\d,]+) bytes at sector (\d+), ([\d,]+) sectors/,
  ],
  [
    "docs/disc.md",
    "the Simon rooms' pack's last sector",
    packs.packs.filter((p) => /COPYCAT/.test(p.path)).map((p) => p.lba + p.capacity / SECTOR - 1),
    /`COPYCAT\.PAK` ends at (\d+)/,
  ],
  [
    "docs/disc.md",
    "packs and their sectors",
    [packs.packs.length, capacity / SECTOR],
    /on all (\d+), (\d+) sectors in all/,
  ],
  ["docs/disc.md", "pack sectors the disc test holds", capacity / SECTOR, /the (\d+) pack sectors/],
  [
    "docs/disc.md",
    "sectors the fixture holds",
    [sectors.cases.length, all(sectors.broken, ({ at }) => at >= USER_OFF && at < USER_OFF + USER)],
    /(\w+) synthetic sectors at varied addresses and submodes and (\w+) with a user byte flipped/,
  ],
  ["docs/disc.md", "packs in the table", packs.packs.length, /The (\d+) packs and their room/],
  [
    "docs/disc.md",
    "the pack that fills its sectors",
    full.length === 1 ? basename(full[0].path) : null,
    /`(\w+\.PAK)` fills its sectors exactly/,
  ],
  [
    "docs/disc.md",
    "packs the writer reproduces",
    packs.packs.length,
    /the unit tests hold it to all (\d+)/,
  ],
  [
    "docs/disc.md",
    "LEVEL 1's record, its stream and the room in place",
    [
      packOf(level1.l).slots[level1.l.index].size,
      digests[levelKey(level1.l)].size,
      level1.path === IN_PLACE ? level1.room : null,
    ],
    /LEVEL 1, ([\d,]+) bytes on the disc, comes back from its fields at ([\d,]+) and goes in with (\w+) to spare/,
  ],
  [
    "docs/disc.md",
    "what level 9 wins a world pack",
    [Math.min(...worldPacks.map(wins)), Math.max(...worldPacks.map(wins))],
    /(\d+) to (\d+) a world pack/,
  ],
  [
    "docs/disc.md",
    "shipped levels that go back in place, and the rest",
    [
      fits.length - rebuilt.length,
      fits.length,
      all(rebuilt, (f) => f.path === REBUILD),
      fits.find((f) => title(f.l) === "BONUS 30").over,
      recompressed.length === 1 && recompressed[0].l.pack === "/INCA/INCA.PAK"
        ? title(recompressed[0].l)
        : null,
    ],
    /Written back from their fields, (\d+) of the disc's (\d+) levels go into their own slot in place; (\w+) come out a few bytes longer than the disc's stream, BONUS 30 by (\d+) since its pickups are renumbered, and rebuild their pack, (LEVEL \d+) recompressing INCA's/,
  ],
  [
    "docs/disc.md",
    "sets the patch fixture holds",
    patchSets.length,
    /The fixture below holds (\w+) sets beside its single placements/,
  ],
  [
    "docs/disc.md",
    "sets whose digests the patch fixture holds",
    patchSets.length,
    /and for the (\w+) sets above/,
  ],
  [
    "docs/disc.md",
    "packs laid out with no gap",
    all(packs.packs, (p) => laidOut(p) === p.size),
    /which is the file's length on all (\d+) packs/,
  ],
  [
    "docs/disc.md",
    "the synthetic image's sectors, the sectors of its packs and its free room",
    [SYNTHETIC_SECTORS, uniform([FINALS_AT - PACK_AT, ROOM_AT - FINALS_AT]), ROOM_SECTORS],
    /built with the disc's structure in (\d+) sectors: .* a world pack and a finals pack of (\w+) sector each .* a `\/3\.00` of (\w+) zero sectors and a postgap/,
  ],
  [
    "docs/disc.md",
    "packs the image is known by",
    String([...PACKS].sort()) === String(packs.packs.map((p) => p.path).sort())
      ? PACKS.length
      : null,
    /and the (\d+) packs by path/,
  ],
  [
    "docs/tgi.md",
    "clocks left turned",
    [turnedClocks.length, ofType(8).length],
    /carries 4 in its `f2` on (\d+) of its (\d+) placements/,
  ],
  ["docs/tgi.md", "Simon rooms", rooms.length, /which is the pack the (\w+) Simon rooms are in/],
  ["docs/annotations.md", "curated scores", curated, /each of the other (\d+) curates its `score`/],
  [
    "docs/motion.md",
    "tangent each facing of an arrow gives its way",
    [1, 2, 3, 4].map((k) => tangentName(0, layHeading({ face: 0, f: [k] }))),
    /gives the (\w+) for a facing of 1 or any value but 2, 3 and 4, the (\w+) for 2, the (\w+ turned round) for 3 and the (\w+ turned round) for 4/,
  ],
  [
    "docs/motion.md",
    "tangent a walker with a facing of 1 heads along",
    [tangentName(0, heading(0, 1).d), axisName(heading(0, 1).d)],
    /a facing of 1 heads along the (\w+) tangent, ([+-][xyz]) on the top/,
  ],
];

for (const [file, what, value, pattern] of claims) {
  test(`${file}'s ${what} is what the data holds`, () => {
    const m = pattern.exec(text(file));
    assert.ok(m, `${file} has no sentence matching ${pattern}`);
    assert.deepEqual(m.slice(1).map(read), [].concat(value));
  });
}

// annotations.md's sections by the key of the entry each gives the reasons for.
const sections = new Map();
for (const part of reasons.split(/^(?=#+ )/m)) {
  const heading = part.slice(0, part.indexOf("\n"));
  for (const m of heading.matchAll(/^### ((?:world|kind|type) \w+)|(\/[A-Z]+\/[A-Z]+\.PAK#\d+)/g))
    sections.set(m[1] ?? m[2], part);
}

const reasonClaims = [
  [
    "kind 3",
    "levels whose settings turn the invisible blocks round",
    fromAfar.length,
    /on the (\w+) levels whose settings record carries a first field of 1/,
  ],
  [
    "kind 4",
    "acid blocks",
    inEachCopy((l) => style(4)(l) + kindOn(4)(l)),
    /^(One) cell in each copy of OBJ LEVEL and nowhere else\./m,
  ],
  [
    "kind 5",
    "platforms with the lower end first",
    all(ofKind(5), lowerFirst),
    /the lower along the axis first on all (\d+)/,
  ],
  [
    "kind 5",
    "the first platform",
    first(kindOn(5))[0],
    /^(LEVEL \d+) carries the game's first moving platform\./m,
  ],
  [
    "kind 6",
    "the first crumbling blocks",
    first(kindOn(6)),
    /^(LEVEL \d+) carries the game's first kind 6, (\w+) of them/m,
  ],
  [
    "kind 6",
    "crumbling blocks keeping 512 times their cell",
    all(
      ofKind(6),
      ({ r }) => String(r.f.slice(0, 3)) === String([r.x, r.y, r.z].map((v) => 512 * v)),
    ),
    /512 times its own cell on all (\d+)/,
  ],
  [
    "kind 7",
    "the numbered levels' first vanishing block, and the level before it in play with some",
    [first(kindOn(7))[0], ...ahead(kindOn(7))],
    /^(LEVEL \d+) carries the numbered levels' first kind 7, though ([A-Z]+ \d+), which comes before it in play, carries (\w+)\./m,
  ],
  [
    "kind 8",
    "lasers on one axis",
    all(ofKind(8), oneAxis),
    /It runs on one axis on all (\d+) in the game/,
  ],
  [
    "kind 8",
    "lasers with the lower end first",
    all(ofKind(8), lowerFirst),
    /and the lower first on all (\d+)/,
  ],
  [
    "kind 8",
    "beam ends the lattice leaves empty",
    [beamEnds.filter((inside) => !inside).length, beamEnds.length],
    /which is why (\d+) of the (\d+) ends are cells the level file leaves empty/,
  ],
  [
    "kind 9",
    "levels whose last record it is",
    all(settings, lastRecord),
    /^The last record on (\d+) levels/m,
  ],
  ["kind 9", "hidden levels", all(hiddenFlag, onHiddenSlot), /and is 1 on exactly the (\w+)\./],
  [
    "kind 9",
    "settings records on empty cells",
    [onEmptyCell.length, settings.length],
    /The record stands on an empty cell on (\d+) of the (\d+)\./,
  ],
  [
    "type 2",
    "the first ice patches, and the ice blocks on their level",
    [...first(on(2)), iceBlocks(named(first(on(2))[0]))],
    /^(LEVEL \d+) carries the game's first (\w+) ice patches, as well as (\w+) ice blocks\./m,
  ],
  [
    "type 5",
    "the first teleporters",
    first(on(5)),
    /^(LEVEL \d+) carries the game's first (\w+) teleporters\./m,
  ],
  [
    "type 5",
    "teleporters leading to one of their colour",
    all(teleporters, toItsColour),
    /on all (\d+) one of the same colour/,
  ],
  [
    "type 5",
    "teleporters facing 1 to 4",
    all(teleporters, ({ o }) => field(o, "f2") >= 1 && field(o, "f2") <= 4),
    /It is 1 to 4 on all (\d+)/,
  ],
  [
    "type 7",
    "levels with an exit, and the bonus and Simon levels without",
    [levels((l) => on(7)(l) === 1), all(bonus, (l) => !on(7)(l)), all(rooms, (l) => !on(7)(l))],
    /One on each of (\d+) levels, and none on the (\d+) bonus and (\d+) Simon levels/,
  ],
  [
    "type 8",
    "the first clocks",
    first(on(8)),
    /^(LEVEL \d+) carries the game's first (\w+) clocks, painted/m,
  ],
  ["type 9", "the first switch", first(on(9))[0], /^(LEVEL \d+) carries the game's first switch;/m],
  [
    "type 9",
    "LEVEL 98's lasers",
    kindOn(8)(named("LEVEL 98")),
    /the same circuit numbers its (\w+) lasers carry/,
  ],
  [
    "type 10",
    "the first boost buttons",
    first(on(10)),
    /^(LEVEL \d+) carries the game's first (\w+) boost buttons\./m,
  ],
  [
    "type 11",
    "the first moving spikes, and those on LEVEL 41",
    [...first(on(11)), on(11)(named("LEVEL 41"))],
    /^(LEVEL \d+) carries the game's first (\w+) moving spikes, and LEVEL 41 (\w+)\./m,
  ],
  ["type 11", "the moving spikes' phases", values(11, "f3"), /`f3` takes (\w+) values/],
  [
    "type 12",
    "the first spikes",
    first(on(12)),
    /^(LEVEL \d+) carries the game's first (\w+) spikes\./m,
  ],
  [
    "type 26",
    "levels with a hidden exit, and how many in each world",
    [
      all(hiddenExits, (l) => on(26)(l) === 1),
      uniform(mapData.themes.map((w) => hiddenExits.filter((l) => l.theme === w.id).length)),
    ],
    /^(\w+) levels carry one, (\w+) in each world/m,
  ],
  [
    "type 28",
    "the first arrows",
    first(on(28)),
    /^(LEVEL \d+) carries the game's first (\w+) arrows\./m,
  ],
  [
    "type 29",
    "starts on a clock, each its level's only start",
    [all(ofType(29), ({ l }) => onClock(l)), ...ofType(29).map(({ l }) => title(l))],
    /^(\w+) in the game, on (LEVEL \d+) and (LEVEL \d+) \(`LEVEL 135` on the disc\), and each level's only start/m,
  ],
  [
    "type 30",
    "levels that start on a start, and the others on a clock",
    [levels(onStart), all(offStart, onClock)],
    /^One on each of (\d+) levels; the other (\w+) start the ball on a clock instead/m,
  ],
  [
    "type 31",
    "HIDDEN 10's keys",
    on(31)(named("HIDDEN 10")),
    /HIDDEN 10's (\w+) keys are on the face/,
  ],
  [
    "type 32",
    "the first lethargy pills",
    first(on(32)),
    /^(LEVEL \d+) carries the game's first (\w+) lethargy pills\./m,
  ],
  [
    "type 33",
    "the first bouncy pill, and LEVEL 88's",
    [first(on(33))[0], on(33)(named("LEVEL 88"))],
    /^(LEVEL \d+) carries the game's first bouncy pill, and LEVEL 88 has (\w+)\./m,
  ],
  [
    "type 34",
    "invincibility pills, all in the catalogue",
    [ofType(34).length, inEachCopy(on(34))],
    /^(\w+) in the game, (\w+) in each copy of OBJ LEVEL/m,
  ],
  [
    "type 35",
    "the first hourglass",
    first(on(35))[0],
    /^(LEVEL \d+) carries the game's first hourglass\./m,
  ],
  [
    "type 36",
    "LEVEL 64's green gem",
    all(
      ofType(36).filter(({ l }) => title(l) === "LEVEL 64"),
      ({ o }) => field(o, "f3") === 1,
    ),
    /LEVEL 64's (one) green gem 1/,
  ],
  [
    "type 37",
    "the gold coins of LEVEL 112 and HIDDEN 10",
    [worth("LEVEL 112", 750), worth("HIDDEN 10", 750)],
    /LEVEL 112's (\w+) and HIDDEN 10's (\w+) coins, which show gold, are the 750 kind/,
  ],
  [
    "type 38",
    "the numbered levels' first sunglasses, and the level before them in play with some",
    [...first(on(38)), ...ahead(on(38))],
    /^(LEVEL \d+) carries the numbered levels' first (\w+) sunglasses, though ([A-Z]+ \d+), which comes before it in play, carries (\w+)\./m,
  ],
  [
    "type 42",
    "stars, all in the catalogue",
    [ofType(42).length, inEachCopy(on(42))],
    /^(\w+) in the game, (\w+) in each copy of OBJ LEVEL/m,
  ],
  [
    "type 43",
    "apples",
    [ofType(43).length, ...ofType(43).map(({ l }) => title(l))],
    /^(\w+) placement in the game, on (LEVEL \d+)\./m,
  ],
  [
    "type 44",
    "watermelons",
    all(ofType(44), withoutCommonFruit),
    /^(\w+) in the game, each on a level without the common fruit type/m,
  ],
  [
    "type 45",
    "pumpkins",
    all(ofType(45), withoutCommonFruit),
    /^(\w+) in the game, each on a level without the common fruit type/m,
  ],
  [
    "type 46",
    "levels with the common fruit",
    all(mapData.levels.filter(on(46)), (l) => on(46)(l) === 1),
    /one on each of (\d+) levels/,
  ],
  [
    "type 47",
    "strawberries",
    [all(ofType(47), withoutCommonFruit), ...ofType(47).map(({ l }) => title(l))],
    /^(\w+) placement in the game, on (LEVEL \d+), a level without the common fruit type/m,
  ],
  [
    "type 50",
    "LEVEL 132's slow captivators",
    on(50)(named("LEVEL 132")),
    /LEVEL 132 sends the ball through a gap between (\w+) of them/,
  ],
  [
    "type 51",
    "the first rolling stone, and LEVEL 52's",
    [first(on(51))[0], on(51)(named("LEVEL 52"))],
    /^(LEVEL \d+) carries the game's first rolling stone, and LEVEL 52 (\w+)\./m,
  ],
  [
    "type 52",
    "the first quick captivators",
    first(on(52)),
    /^(LEVEL \d+) carries the game's first (\w+) quick captivators\./m,
  ],
  [
    "type 53",
    "the first wandering captivators",
    first(on(53)),
    /^(LEVEL \d+) carries the game's first (\w+) wandering captivators, and the way one shakes/m,
  ],
  [
    "type 56",
    "the numbered levels' first corkscrews, and the level before them in play with some",
    [...first(on(56)), ...ahead(on(56))],
    /^(LEVEL \d+) carries the numbered levels' first (\w+) bouncing captivators, though ([A-Z]+ \d+), which comes before it in play, carries (\w+)\./m,
  ],
  ["type 56", "the corkscrews' phases", values(56, "f3"), /`f3`, (\w+)-valued/],
  [
    "/HILLS/HILLS.PAK#19",
    "the catalogue's copies",
    copies.length,
    /identical in the (\w+) worlds that ship it/,
  ],
  [
    "/HILLS/HILLS.PAK#15",
    "BONUS 4's gems",
    on(36)(named("BONUS 4")),
    /the (\w+) gems inside that ring/,
  ],
  [
    "/HILLS/HILLS.PAK#18",
    "HIDDEN 2's crumbling blocks",
    kindOn(6)(named("HIDDEN 2")),
    /one of the (\w+) crumbling blocks/,
  ],
  [
    "/HAZE/HAZEFI.PAK#1",
    "FINAL 16's gems on the ring at y=28",
    ofType(36).filter(({ l, r }) => title(l) === "FINAL 16" && r.y === 28).length,
    /ten of the (\w+) gems on the ring at y=28/,
  ],
  [
    "/HELL/HELL.PAK#17",
    "the pickups without a number",
    unnumberedOn("BONUS 30"),
    /Its (\w+) pickups are the only ones in the game without a pickup number/,
  ],
  [
    "/HELL/HELL.PAK#18",
    "the lettering and the frame",
    [depths.length - frame.length, 32 - Math.max(...frame), frame.length],
    /The (\d+) blocks of lettering lie flat on z=32, the floor of the lattice and (\d+) blocks below the playable structure\. The other (\d+)/,
  ],
  [
    "/HELL/HELL.PAK#18",
    "what the level places, all on the frame's -y face",
    all(
      placements.filter(({ l }) => title(l) === "HIDDEN 10"),
      ({ o }) => o.face === 3 && [30, 7, 31, 37, 36].includes(o.type),
    ) && [30, 7].every((t) => on(t)(named("HIDDEN 10")) === 1)
      ? [on(31), on(37), coinColour, on(36)].map((f) => f(named("HIDDEN 10")))
      : null,
    /the start, the exit, (\w+) keys, (\w+) (\w+) coins and (\w+) gems, stands on its `-y` face/,
  ],
];

for (const [entry, what, value, pattern] of reasonClaims) {
  test(`annotations.md's ${entry}, ${what}, is what the data holds`, () => {
    const m = pattern.exec(sections.get(entry) ?? "");
    assert.ok(m, `annotations.md's ${entry} has no sentence matching ${pattern}`);
    assert.deepEqual(m.slice(1).map(read), [].concat(value));
  });
}

// The tally counts the keys on records the game never walks, which the data leaves out.
test("annotations.md's key tally is what the data holds, with the keys the game never walks", () => {
  const section = sections.get("type 31") ?? "";
  const tally =
    /One to (\w+) a level on the disc: (\d+) levels with one, (\d+) with two, (\d+) with three, (\w+) with four, (\w+) with five and (\w+) with six\./.exec(
      section,
    );
  const kept =
    /([A-Z]+ \d+)'s fifth key stands on its settings record and (\w+) of ([A-Z]+ \d+)'s keys on crumbling blocks, records the game never walks, so in play \1 asks for (\w+) and \3 for (\w+)\./.exec(
      section,
    );
  assert.ok(tally && kept, "annotations.md has no sentences tallying the keys");
  const [most, ...byCount] = tally.slice(1).map(read);
  const [fifth, crumbling, sixth, asksFifth, asksSixth] = kept.slice(1).map(read);
  const keys = on(31);
  assert.deepEqual([keys(named(fifth)), keys(named(sixth))], [asksFifth, asksSixth]);
  const extra = (l) => (title(l) === fifth ? 5 - asksFifth : title(l) === sixth ? crumbling : 0);
  const onDisc = mapData.levels.map((l) => keys(l) + extra(l)).filter((n) => n > 0);
  assert.equal(Math.max(...onDisc), most);
  assert.deepEqual(
    byCount,
    [1, 2, 3, 4, 5, 6].map((n) => onDisc.filter((k) => k === n).length),
  );
});

test("level-format.md's catalogue records are the nine that are their own thing", () => {
  const m =
    /object catalogue: \d+ objects and (\w+) records of the kinds that are their own thing/.exec(
      format,
    );
  assert.ok(m, "level-format.md has no sentence about the catalogue's records");
  assert.equal(m[1], "nine");
  assert.equal(catalogue.records.filter((r) => "type" in r).length, 9);
});

test("level-format.md's catalogue arithmetic adds up", () => {
  const missing = [...types].filter((t) => !here.has(t));
  const placed = (set) => objects.filter((o) => set.includes(o.type)).length;
  const m =
    /the (\w+) it misses are placed ([\d,]+) times between them against the \d+ types' ([\d,]+) placements/.exec(
      format,
    );
  assert.ok(m, "level-format.md has no sentence about what the catalogue misses");
  assert.equal(m[1], "seven");
  assert.equal(missing.length, 7);
  assert.equal(number(m[2]), placed(missing));
  assert.equal(number(m[3]), placed(covered));
});

// The points are curated rather than read, and the level format's arithmetic
// is what they rest on, so neither can change without the other.
test("level-format.md's points are the ones annotations.json scores", () => {
  const m =
    /coins at (\d+), (\d+) and (\d+) by the value of their one varying field, gems (\d+), keys (\d+), fruit (\d+), an hourglass (\d+), sunglasses (\d+) and a crumbling block (\d+)/.exec(
      format,
    );
  assert.ok(m, "level-format.md has no sentence giving the points");
  const type = (t) => annotations.types[t];
  const coin = (tier) => type(37).variants[tier].points;
  const fruit = new Set([43, 44, 45, 46, 47].map((t) => type(t).points));
  assert.equal(fruit.size, 1, "the five fruit score differently");
  assert.deepEqual(m.slice(1).map(number), [
    coin(2),
    coin(1),
    coin(0),
    type(36).points,
    type(31).points,
    [...fruit][0],
    type(35).points,
    type(38).points,
    annotations.kinds[6].points,
  ]);
  const star = /Type 42's (\d+) points is the one points value that rests on the executable/.exec(
    format,
  );
  assert.ok(star, "level-format.md has no sentence giving the catalogue star's points");
  assert.equal(number(star[1]), type(42).points);
});

// The page describes itself three times over, to search engines and to the
// sites that unfurl a link, each time by the two figures the README opens on.

test("the page's descriptions count the levels and the worlds the data holds", () => {
  const descriptions = [
    ...page.matchAll(/(?:name|property)="(?:og:|twitter:)?description"\s+content="([^"]*)"/g),
  ].map((m) => m[1]);
  assert.equal(descriptions.length, 3);
  for (const text of descriptions) {
    const m = /\b(\d+) levels\b.*\bacross (\w+) worlds\b/.exec(text);
    assert.ok(m, `the description "${text}" counts no levels across worlds`);
    assert.equal(number(m[1]), mapData.levels.length);
    assert.equal(m[2], WORDS[mapData.themes.length]);
  }
});

// disc.md's two pack tables, row by row: where each pack lies and the room it
// has, then what its records leave a level.
const rows = (pattern) => [...disc.matchAll(pattern)].map((m) => [m[1], ...m.slice(2).map(number)]);

test("disc.md's pack table is where packs.json puts every pack, and the room it has", () => {
  assert.deepEqual(
    rows(/^\| `([^`]+)` \| (\d+) \| ([\d,]+) \| (\d+) \| ([\d,]+) \| ([\d,]+) \|$/gm),
    packs.packs.map((p) => [
      p.path,
      p.lba,
      p.size,
      p.capacity / SECTOR,
      p.capacity,
      p.capacity - p.size,
    ]),
  );
});

test("disc.md's room table is what the packs' records leave a level, slot by slot", () => {
  assert.deepEqual(
    rows(
      /^\| `([^`]+)` \| ([\d,]+) \| ([\d,]+) \| ([\d,]+) to ([\d,]+) \| ([\d,]+) to ([\d,]+) \|$/gm,
    ),
    packs.packs.map((p) => {
      const names = p.slots.map((s) => s.name);
      const sizes = p.slots.map((s) => s.size);
      const limit = Math.min(p.capacity, LARGEST);
      const room = p.slots.map(
        (_, k) =>
          limit -
          packSize(
            names,
            p.slots.map((s, i) => (i === k ? 0 : s.size9)),
          ),
      );
      return [
        p.path,
        p.capacity - p.size,
        wins(p),
        Math.min(...room),
        Math.max(...room),
        Math.min(...sizes),
        Math.max(...sizes),
      ];
    }),
  );
});

test("no section of editor.md takes the word it gives validate's findings as its title", () => {
  const titles = text("docs/editor.md")
    .split("\n")
    .filter((line) => /^#+ /.test(line));
  assert.deepEqual(
    titles.filter((t) => /\bchecks?\b/i.test(t)),
    [],
  );
});
