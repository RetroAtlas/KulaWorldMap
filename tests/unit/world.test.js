import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { setObjects, setAnnotations, index, objectId } from "../../public/js/viewer/data.js";
import { phasesOf } from "../../public/js/viewer/motion.js";
import { ballAt } from "../../public/js/play/ball.js";
import {
  worldOf,
  standingOf,
  probeOf,
  travelOf,
  viewOf,
  took,
  fell,
  marked,
  frameShown,
  keysOf,
  shiftOf,
  platformAt,
} from "../../public/js/play/world.js";
import { advance } from "../../public/js/viewer/travel.js";

setObjects(objects);
setAnnotations(annotations);
state.data = mapData;
const motion = objects.motion;
const UNIT = objects.block;
const TABLES = {
  motion,
  jump: objects.jump,
  unit: UNIT,
  first: mapData.firstRecord,
  styles: mapData.styles,
  skins: objects.skins,
};
const RULES = { table: motion.types[30], turn: motion.turn, unit: UNIT, jump: objects.jump };
const CIRCUITS = { on: () => true, lit: (ray) => ray.lit, flip: () => {} };
const UP = [0, -1, 0];
const TOP = 0;

/** A level of blocks of the kinds given, some carrying a record, laid out to order. */
function level(blocks, records = []) {
  const cells = [];
  const placed = new Map(records.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z, kind = 0] of blocks) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? kind : mapData.firstRecord + i);
  }
  return { cells, records: records.map((r) => ({ on: [], ...r })), time: 99 };
}
const object = (face, type, facing = 0, f3 = 0) => ({
  face,
  type,
  f: [facing, f3, 1, 0, -1, -1, -1, 386, 1, -1, -1],
  v: 0,
});
const own = (x, y, z, kind, type = 1) => ({ x, y, z, kind, type, f: Array(11).fill(0) });
const patch = (x, y, z, face) => ({ x, y, z, kind: 0, on: [object(face, 2)] });
const platform = (x, y, z) => ({
  x,
  y,
  z,
  kind: 5,
  type: 3,
  f: [2, 1, x, y - 4, z, x, y, z, -1, -1, -1],
  length: 2,
});
const row = (x0, x1, y, z) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, z]);
const world = (l) => worldOf(l, index(l), TABLES, CIRCUITS);
const key = (c) => cellKey(...c);
/** The world with the ball at rest on `face` of `cell`, as the rules hold them. */
const standing = (l, cell, face = TOP) => ({
  ball: ballAt(RULES, cell, face, UP),
  world: world(l),
  words: { standing: 0 },
});

test("the world keys every block's kind by its cell, a beam's empty end a plain block", () => {
  const l = level(
    [
      [10, 10, 17],
      [11, 10, 17, 1],
      [12, 10, 17, 2],
      [13, 10, 17, 3],
      [14, 10, 17, 4],
      [15, 10, 17],
      [16, 10, 17],
      [18, 10, 17],
    ],
    [
      own(15, 10, 17, 6),
      own(16, 10, 17, 7, 0),
      { x: 18, y: 10, z: 17, kind: 8, type: 1, f: [1, 1, 18, 10, 17, 22, 10, 17, -1, -1, -1] },
    ],
  );
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  assert.deepEqual(
    [10, 11, 12, 13, 14, 15, 16, 18, 22].map((x) => w.kinds.get(key([x, 10, 17]))),
    [0, 1, 2, 3, 4, 6, 7, 8, 0],
  );
  assert.equal(w.kinds.has(key([17, 10, 17])), false);
  assert.equal(w.cells.get(key([22, 10, 17])), 0, "the beam's far end stands a plain block");
  assert.deepEqual(w.crumbling.get(key([15, 10, 17])), { type: 1, size: motion.kinds["6"].size });
  assert.equal(w.crumbling.size, 1);
  assert.equal(w.first, mapData.firstRecord);
  assert.deepEqual(
    [...w.standing],
    Object.entries(motion.kinds)
      .filter(([, k]) => "standing" in k)
      .map(([k, v]) => [Number(k), v.standing]),
    "the word each kind reads as under the ball is the table's",
  );
  assert.equal(
    viewOf({ world: w, idx, words: { outcome: 0 } }),
    idx,
    "the index is what the frame draws",
  );
});

test("a pickup stands off its block's centre by its type's stand, and a device is one the ball throws or takes", () => {
  const l = level(row(10, 16, 10, 17), [
    { x: 10, y: 10, z: 17, kind: 0, on: [object(0, 37, 0, 2)] },
    { x: 11, y: 10, z: 17, kind: 0, on: [object(0, 31), object(2, 36, 0, 1)] },
    { x: 12, y: 10, z: 17, kind: 0, on: [object(5, 35)] },
    { x: 13, y: 10, z: 17, kind: 0, on: [object(0, 5, 1), object(1, 9)] },
    { x: 14, y: 10, z: 17, kind: 0, on: [object(0, 7)] },
    { x: 15, y: 10, z: 17, kind: 2, on: [object(0, 37)] },
    { ...own(16, 10, 17, 6), on: [object(0, 37)] },
  ]);
  const w = world(l);
  const coin = w.pickups.get(`${key([10, 10, 17])}/0`);
  assert.equal(coin.take, motion.types["37"].take);
  assert.equal(coin.m.type, 37);
  assert.deepEqual(coin.at, [10 * UNIT, 10 * UNIT, 17 * UNIT - motion.types["37"].take.stand]);
  assert.equal(coin.points, motion.types["37"].take.points[2], "a coin's points by its tier");
  assert.equal(coin.key, key([10, 10, 17]));
  assert.equal(coin.slot, `${key([10, 10, 17])}/0`);
  assert.deepEqual(
    coin.phase,
    phasesOf(motion, 10, 10, 17, 0),
    "its angles as the draw hashes them",
  );
  const keyAt = w.pickups.get(`${key([11, 10, 17])}/0`);
  assert.equal(keyAt.take.reach, motion.types["31"].take.reach);
  assert.equal(keyAt.points, motion.types["31"].take.points);
  assert.equal(keysOf(w), 1);
  const gem = w.pickups.get(`${key([11, 10, 17])}/2`);
  assert.equal(gem.m.variant, "1");
  assert.deepEqual(gem.at, [11 * UNIT, 10 * UNIT + motion.types["36"].take.stand[1], 17 * UNIT]);
  const hourglass = w.pickups.get(`${key([12, 10, 17])}/5`);
  assert.deepEqual(hourglass.at, [12 * UNIT, 10 * UNIT, 17 * UNIT + motion.types["35"].take.stand]);
  assert.ok(w.pickups.has(`${key([15, 10, 17])}/0`), "a coin on ice is taken");
  assert.equal(w.pickups.has(`${key([16, 10, 17])}/0`), false, "one on a crumbling block never is");
  assert.deepEqual([...w.devices.keys()].sort(), [
    `${key([13, 10, 17])}/0`,
    `${key([13, 10, 17])}/1`,
  ]);
  assert.equal(w.devices.get(`${key([13, 10, 17])}/0`).type, 5);
  assert.equal(w.pickups.has(`${key([14, 10, 17])}/0`), false, "an exit is neither");
  assert.equal(w.devices.has(`${key([14, 10, 17])}/0`), false);
  assert.equal(w.taken.size + w.gone.size + w.marked.size, 0);
});

test("the world keeps each captivator's entry where the loader stands it, with its type's reach, its marker and what its pose needs", () => {
  const l = level(row(10, 12, 10, 17), [
    { x: 10, y: 10, z: 17, kind: 0, on: [object(0, 50, 4), object(1, 56, 0, 3)] },
    { x: 11, y: 10, z: 17, kind: 0, on: [object(0, 53, 4)] },
    { x: 12, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const { standoff, types } = motion;
  const marker = (cell, face) => idx.markers.get(key(cell)).find((m) => m.face === face);
  assert.deepEqual(w.captivators, [
    {
      m: marker([10, 10, 17], 0),
      slot: `${key([10, 10, 17])}/0`,
      entry: types["50"],
      at: [10 * UNIT, 10 * UNIT, 17 * UNIT - standoff],
      phase: [0, 0, 0],
      square: types["50"].catch.square,
    },
    {
      m: marker([10, 10, 17], 1),
      slot: `${key([10, 10, 17])}/1`,
      entry: types["56"],
      at: [10 * UNIT + standoff, 10 * UNIT, 17 * UNIT],
      phase: [0, 0, 0],
      square: types["56"].catch.square,
    },
    {
      m: marker([11, 10, 17], 0),
      slot: `${key([11, 10, 17])}/0`,
      entry: types["53"],
      at: [11 * UNIT, 10 * UNIT, 17 * UNIT - standoff],
      phase: [0, 0, 0],
      square: types["53"].catch.square,
    },
  ]);
  assert.equal(w.captivators[1].m.f[1], 3, "the corkscrew's marker carries its phase field");
  assert.ok(types["53"].catch.square < types["50"].catch.square, "the wandering ball's is shorter");
  assert.deepEqual(
    [...w.walkers.keys()].sort(),
    [`${key([10, 10, 17])}/0`, `${key([11, 10, 17])}/0`],
    "the two that walk are walkers too, the corkscrew not",
  );
  assert.deepEqual(w.walkers.get(`${key([10, 10, 17])}/0`).pos, w.captivators[0].at);
});

test("the world lays the walkers and the dice and keeps a platform's home and body", () => {
  const l = level(
    [...row(10, 14, 10, 17), [20, 14, 17]],
    [{ x: 12, y: 10, z: 17, kind: 0, on: [object(0, 50, 4)] }, platform(20, 14, 17)],
  );
  const w = world(l);
  assert.equal(w.walkers.size, 2);
  assert.ok(w.walkers.has(`${key([12, 10, 17])}/0`));
  assert.ok(w.walkers.has(`${key([20, 14, 17])}/null`));
  assert.equal(typeof w.roll, "function");
  assert.equal(w.probe.free([10, 10, 17], 0, 0), true);
  assert.deepEqual(w.platforms.get(key([20, 14, 17])).home, [20 * UNIT, 14 * UNIT, 17 * UNIT]);
  assert.deepEqual(
    w.platforms.get(key([20, 14, 17])).body,
    [
      [20, 14, 17],
      [20, 15, 17],
    ],
    "the body's cells at home",
  );
  const travel = travelOf({ world: w });
  assert.deepEqual(Object.keys(travel).sort(), ["probe", "roll", "walkers"]);
  assert.equal(travel.walkers, w.walkers);
  const later = worldOf(l, index(l), TABLES, CIRCUITS, 40);
  assert.equal([...later.walkers.values()][0].at, 40, "laid at the frame asked for");
});

test("the word for what the ball stands on is the game's: a face's type on a plain block, each other kind its own", () => {
  const blocks = [
    [10, 10, 17],
    [11, 10, 17, 1],
    [12, 10, 17, 2],
    [13, 10, 17, 3],
    [14, 10, 17, 4],
    [15, 10, 17],
    [16, 10, 17],
    [17, 10, 17],
    [18, 10, 17],
    [19, 10, 17],
    [23, 10, 17],
  ];
  const l = level(blocks, [
    own(15, 10, 17, 6),
    { x: 16, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
    { x: 17, y: 10, z: 17, kind: 0, on: [object(1, 31)] },
    { x: 18, y: 10, z: 17, kind: 0, on: [object(0, 29, 3)] },
    { x: 19, y: 10, z: 17, kind: 8, type: 1, f: [1, 1, 19, 10, 17, 23, 10, 17, -1, -1, -1] },
    { x: 23, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const at = (x, face = TOP) => standingOf(standing(l, [x, 10, 17], face));
  assert.equal(at(10), -1, "a bare plain block");
  assert.equal(at(11), 1);
  assert.equal(at(12), 2);
  assert.equal(at(13), 93);
  assert.equal(at(14), 4);
  assert.equal(at(15), 96);
  assert.equal(at(16), 37, "the coin's face");
  assert.equal(at(17), 0, "a plain block's bare face beside a key");
  assert.equal(at(17, 1), 31);
  assert.equal(at(18), motion.play.clock.face, "the start the game takes on a clock");
  const hopping = standing(l, [18, 10, 17]);
  hopping.ball.pos = hopping.ball.pos.map((v, i) => v + FACE_NORMAL[TOP][i] * 300);
  assert.equal(standingOf(hopping), motion.play.clock.face, "still the clock's a hop's height up");
  const aloft = standing(l, [18, 10, 17]);
  aloft.ball.pos = aloft.ball.pos.map((v, i) => v + FACE_NORMAL[TOP][i] * UNIT);
  assert.equal(standingOf(aloft), -1, "nothing a block above the clock's face");
  const laser = standing(l, [19, 10, 17]);
  laser.words.standing = 37;
  assert.equal(
    standingOf(laser),
    -1,
    "a laser block a bare block, which the loader lays at a beam's ends",
  );
  assert.equal(probeOf(laser).standing([19, 10, 17], TOP), -1);
  assert.equal(at(23), -1, "the far end the same, whatever the level stands there");
  const over = standing(l, [21, 10, 17]);
  over.words.standing = 37;
  assert.equal(standingOf(over), 37, "a lit beam's cell under the ball's cell leaves the word");
  assert.equal(probeOf(over).standing([21, 10, 17], TOP), undefined);
  over.world = worldOf(l, index(l), TABLES, { ...CIRCUITS, lit: () => false });
  assert.equal(standingOf(over), -1, "a dark beam's nothing");
});

test("the probe answers the lattice as the planner's did, and names the kind and the word under a cell", () => {
  const l = level(
    [...row(10, 13, 10, 17), [12, 10, 17, 2], [15, 10, 17], [20, 14, 17]],
    [own(11, 10, 17, 6), patch(13, 10, 17, TOP), patch(15, 10, 17, 1), platform(20, 14, 17)],
  );
  const live = standing(l, [10, 10, 17]);
  const p = probeOf(live);
  assert.equal(p.solid([10, 10, 17]), true);
  assert.equal(p.solid([14, 10, 17]), false);
  assert.equal(p.solid([20, 15, 17]), true, "a platform's body at rest");
  assert.equal(p.solid([0, 10, 17]), false, "the lattice's rim is never solid");
  assert.equal(p.standable([10, 10, 17], TOP), true);
  assert.equal(p.standable([10, 10, 17], 1), false, "a face against a neighbour");
  assert.equal(p.value([10, 10, 17]), 0);
  assert.equal(p.value([11, 10, 17]), mapData.firstRecord);
  assert.equal(p.value([14, 10, 17]), -1);
  assert.equal(p.value([40, 10, 17]), -1);
  assert.equal(p.slick([12, 10, 17]), true);
  assert.equal(p.slick([13, 10, 17]), true, "an ice patch on the face the ball stands on");
  assert.equal(p.slick([15, 10, 17]), false, "a patch on another face of the block");
  assert.equal(p.slick([10, 10, 17]), false);
  assert.equal(p.brittle([11, 10, 17]), true);
  assert.equal(p.brittle([12, 10, 17]), false);
  assert.equal(p.standing([11, 10, 17], TOP), 96);
  assert.equal(p.standing([12, 10, 17], TOP), 2);
  assert.equal(p.standing([13, 10, 17], TOP), 2);
  assert.equal(p.standing([15, 10, 17], TOP), 0);
  live.world = world(level(row(10, 11, 10, 17)));
  assert.equal(p.solid([12, 10, 17]), false, "the probe reads the world as it now stands");
});

test("the world counts the blocks a level with no key marks: the kinds the game builds, inside the lattice, with a face built", () => {
  const plain = (x, y, z) => [x, y, z];
  const about = (x, y, z) => FACE_NORMAL.map((n) => [x + n[0], y + n[1], z + n[2]]);
  const l = level(
    [
      [10, 10, 17],
      [11, 10, 17, 1],
      [12, 10, 17, 2],
      [13, 10, 17, 3],
      [14, 10, 17, 4],
      [15, 10, 17],
      [16, 10, 17],
      [18, 10, 17],
      [20, 14, 17],
      plain(25, 25, 25),
      ...about(25, 25, 25),
      [0, 20, 17],
      [1, 20, 17],
      [33, 20, 17],
      [28, 10, 20, 1],
      ...about(28, 10, 20).filter(([x]) => x !== 29),
      [29, 10, 20, 3],
      [28, 20, 20],
      ...about(28, 20, 20).filter(([x]) => x !== 29),
      [29, 20, 20],
    ],
    [
      own(15, 10, 17, 6),
      own(16, 10, 17, 7, 0),
      { x: 18, y: 10, z: 17, kind: 8, type: 1, f: [1, 1, 18, 10, 17, 22, 10, 17, -1, -1, -1] },
      platform(20, 14, 17),
      own(29, 20, 20, 6),
    ],
  );
  const w = world(l);
  const counted = (c) => w.counted.has(key(c));
  assert.deepEqual(
    [10, 11, 12, 13, 14, 15, 16, 18, 22].map((x) => counted([x, 10, 17])),
    [true, true, true, false, true, true, true, false, true],
    "the plain, fire, ice, acid, crumbling and vanishing kinds, and a beam's end, never the invisible block or a laser's own",
  );
  assert.equal(counted([20, 14, 17]), false, "nor a platform");
  assert.equal(counted([25, 25, 25]), false, "nor a block sealed on every side");
  assert.ok(about(25, 25, 25).every(counted), "which its neighbours are not");
  assert.deepEqual(
    [0, 1, 33].map((x) => counted([x, 20, 17])),
    [false, true, false],
    "the rim is never built",
  );
  assert.equal(
    counted([28, 10, 20]),
    true,
    "a fire block builds its face toward an invisible block",
  );
  assert.equal(
    counted([28, 20, 20]),
    true,
    "and a plain block one toward a crumbling block, unseen",
  );
  assert.equal(w.counted.size, 27);
});

test("the index the frame draws is the level's own until something is taken, and then the same less that marker alone", () => {
  const l = level(row(10, 12, 10, 17), [
    { x: 10, y: 10, z: 17, kind: 0, on: [object(0, 37), object(1, 31)] },
    { x: 11, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const live = { world: w, idx, words: { outcome: 0 } };
  assert.equal(viewOf(live), idx);
  took(w, `${key([10, 10, 17])}/0`);
  assert.ok(w.taken.has(`${key([10, 10, 17])}/0`));
  const view = viewOf(live);
  assert.notEqual(view, idx);
  assert.deepEqual(
    view.markers.get(key([10, 10, 17])).map((m) => [m.type, m.face]),
    [[31, 1]],
    "the coin gone, the key on the side kept",
  );
  assert.equal(
    view.markers.get(key([11, 10, 17])),
    idx.markers.get(key([11, 10, 17])),
    "an untouched cell's list is the level's own",
  );
  for (const part of ["cells", "records", "beamCells", "railCells", "beamEnds", "plates"])
    assert.equal(view[part], idx[part], `${part} untouched`);
  assert.deepEqual(
    idx.markers.get(key([10, 10, 17])).map((m) => m.type),
    [37, 31],
    "the level as installed keeps the marker",
  );
  assert.equal(viewOf(live), view, "kept until the next take");
  took(w, `${key([11, 10, 17])}/0`);
  const again = viewOf(live);
  assert.notEqual(again, view);
  assert.deepEqual(again.markers.get(key([11, 10, 17])), []);
  assert.deepEqual(
    again.markers.get(key([10, 10, 17])).map((m) => m.type),
    [31],
  );
});

test("the index the frame draws carries each marked block with the frame it is first drawn marked on, rebuilt as one is marked, and is the level's own while none stands", () => {
  const l = level(row(10, 12, 10, 17));
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const live = { world: w, idx, words: { outcome: 0 } };
  assert.equal(viewOf(live), idx);
  assert.equal(idx.marked, undefined, "the level's own index carries no mark");
  marked(w, key([10, 10, 17]), 4);
  assert.deepEqual([...w.marked], [[key([10, 10, 17]), 4]]);
  const view = viewOf(live);
  assert.notEqual(view, idx);
  assert.deepEqual([...view.marked], [[key([10, 10, 17]), 4]]);
  for (const part of ["cells", "records", "plates"]) assert.equal(view[part], idx[part]);
  assert.equal(viewOf(live), view, "kept until the next mark");
  marked(w, key([11, 10, 17]), 9);
  const again = viewOf(live);
  assert.notEqual(again, view);
  assert.deepEqual(
    [...again.marked],
    [
      [key([10, 10, 17]), 4],
      [key([11, 10, 17]), 9],
    ],
  );
  assert.deepEqual([...view.marked], [[key([10, 10, 17]), 4]], "the view before keeps its own");
});

test("the index the frame draws leaves the starts out until the level's outcome stands, the start the game takes leaving the clock on its face where it stands on one, and holds them again after it", () => {
  const clocked = object(0, 29, 2);
  const l = level(row(10, 12, 10, 17), [
    { x: 10, y: 10, z: 17, kind: 0, on: [object(0, 30, 1), object(1, 31), object(2, 29)] },
    { x: 11, y: 10, z: 17, kind: 0, on: [clocked] },
    { x: 12, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const live = { world: w, idx, words: { outcome: 0 } };
  const clock = motion.play.clock.face;
  const view = viewOf(live);
  assert.notEqual(view, idx);
  assert.deepEqual(
    view.markers.get(key([10, 10, 17])).map((m) => [m.type, m.face]),
    [[31, 1]],
    "the starts gone, the clock start the game does not take bare, the key on the side kept",
  );
  assert.deepEqual(
    view.markers.get(key([11, 10, 17])),
    [
      {
        id: objectId({ type: clock, f: clocked.f }),
        type: clock,
        face: 0,
        f: clocked.f,
        v: 0,
        variant: null,
      },
    ],
    "the start the game takes leaves the clock on its face",
  );
  const word = (cell, face) => probeOf(live).standing(cell, face);
  assert.equal(
    word([11, 10, 17], 0),
    clock,
    "the rules read the clock on the start the game takes",
  );
  assert.equal(word([10, 10, 17], 2), 29, "and the start's own type on one it does not");
  assert.equal(
    view.markers.get(key([12, 10, 17])),
    idx.markers.get(key([12, 10, 17])),
    "an untouched cell's list is the level's own",
  );
  for (const part of ["cells", "records"]) assert.equal(view[part], idx[part], `${part} untouched`);
  assert.deepEqual(
    idx.markers.get(key([10, 10, 17])).map((m) => m.type),
    [30, 31, 29],
    "the level as installed keeps the starts",
  );
  assert.equal(viewOf(live), view, "kept while nothing changes");
  took(w, `${key([12, 10, 17])}/0`);
  const taken = viewOf(live);
  assert.deepEqual(taken.markers.get(key([12, 10, 17])), []);
  assert.deepEqual(
    taken.markers.get(key([10, 10, 17])).map((m) => m.type),
    [31],
    "the start still out after a take",
  );
  live.words.outcome = motion.play.ending.time;
  const ended = viewOf(live);
  assert.notEqual(ended, taken);
  assert.equal(
    ended.markers.get(key([10, 10, 17])),
    idx.markers.get(key([10, 10, 17])),
    "the start back once the level has ended",
  );
  assert.equal(
    ended.markers.get(key([11, 10, 17])),
    idx.markers.get(key([11, 10, 17])),
    "the start on the clock too",
  );
  assert.deepEqual(ended.markers.get(key([12, 10, 17])), [], "the coin still taken");
  assert.equal(viewOf(live), ended, "kept while the outcome stands");
  live.words.outcome = 0;
  assert.deepEqual(
    viewOf(live)
      .markers.get(key([10, 10, 17]))
      .map((m) => m.type),
    [31],
    "and out again with the ball back on the level",
  );
});

test("fell empties a block's cell: nothing stands or rolls on it, the walkers' probe reads it empty, the kinds and the crumbling blocks forget it, and the index the frame draws leaves it out with its record and its marker", () => {
  const l = level(row(10, 12, 10, 17), [
    own(11, 10, 17, 6),
    { x: 12, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
  ]);
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const live = { ball: ballAt(RULES, [10, 10, 17], TOP, UP), world: w, idx, words: { frame: 0 } };
  const p = probeOf(live);
  const k = key([11, 10, 17]);
  assert.equal(p.solid([11, 10, 17]), true);
  assert.equal(p.brittle([11, 10, 17]), true);
  assert.equal(w.probe.free([11, 10, 17], TOP, 0), true);
  assert.equal(idx.markers.get(k).length, 1, "the kind's own marker");
  fell(w, k);
  assert.ok(w.gone.has(k));
  assert.equal(w.cells.has(k), false);
  assert.equal(w.kinds.has(k), false);
  assert.equal(w.crumbling.has(k), false);
  assert.equal(p.solid([11, 10, 17]), false);
  assert.equal(p.value([11, 10, 17]), -1);
  assert.equal(p.brittle([11, 10, 17]), false);
  assert.equal(p.standing([11, 10, 17], TOP), -1);
  assert.equal(p.standable([11, 10, 17], TOP), false);
  assert.equal(w.probe.value([11, 10, 17], 0), -1, "empty to the walkers too");
  assert.equal(w.probe.free([11, 10, 17], TOP, 0), false);
  assert.equal(w.probe.empty([11, 10, 17], 0), true);
  assert.equal(w.probe.free([10, 10, 17], TOP, 0), true, "its neighbours as before");
  assert.equal(p.solid([10, 10, 17]), true);
  const view = viewOf(live);
  assert.notEqual(view, idx);
  assert.equal(view.cells.has(k), false);
  assert.equal(view.records.has(k), false);
  assert.equal(view.markers.has(k), false);
  assert.ok(view.cells.has(key([10, 10, 17])) && view.cells.has(key([12, 10, 17])));
  assert.equal(view.records.get(key([12, 10, 17])), idx.records.get(key([12, 10, 17])));
  assert.equal(view.markers.get(key([12, 10, 17])), idx.markers.get(key([12, 10, 17])));
  for (const part of ["beamCells", "railCells", "beamEnds", "plates"])
    assert.equal(view[part], idx[part], `${part} untouched`);
  assert.ok(
    idx.cells.has(k) && idx.records.has(k) && idx.markers.has(k),
    "the level as installed keeps the block",
  );
  assert.equal(viewOf(live), view, "kept until the next change");
  took(w, `${key([12, 10, 17])}/0`);
  const again = viewOf(live);
  assert.notEqual(again, view);
  assert.equal(again.cells.has(k), false, "still out as a take lays the index anew");
  assert.deepEqual(again.markers.get(key([12, 10, 17])), []);
});

test("the probe answers the lattice as the last frame's step left it, the cycle's entry for the frame before the one running, so a vanishing block is solid from the frame after the first it is drawn there to the frame after the last, and empty, the word under the ball nothing, from the frame after the first it is drawn absent, the first frame reading the first entry", () => {
  const vanishing = { ...own(11, 10, 17, 7, 0), f: [2, ...Array(10).fill(0)] };
  const l = level(row(10, 12, 10, 17), [vanishing]);
  const idx = index(l);
  const w = worldOf(l, idx, TABLES, CIRCUITS);
  const entry = motion.kinds["7"];
  const cycle = entry.cycle[2];
  const absent = cycle.indexOf(0);
  const back = cycle.findIndex((s, i) => i > absent && s !== 0);
  const live = { ball: ballAt(RULES, [11, 10, 17], TOP, UP), world: w, idx, words: { frame: 0 } };
  const p = probeOf(live);
  const at = (frame) => {
    live.words.frame = frame;
    return {
      shown: frameShown(live),
      solid: p.solid([11, 10, 17]),
      value: p.value([11, 10, 17]),
      standing: standingOf(live),
      standable: p.standable([11, 10, 17], TOP),
    };
  };
  assert.equal(at(0).shown, 0, "before any frame has run, the first frame's own entry");
  assert.equal(
    at(1).shown,
    0,
    "the first frame's read sees the first entry, which is the loader's lattice",
  );
  assert.equal(at(absent + 1).shown, absent, "a frame's read sees the step before it");
  for (const f of [0, 1, absent, back + 1, cycle.length]) {
    const seen = at(f);
    assert.notEqual(cycle[seen.shown], 0, `frame ${f}: in the lattice`);
    assert.deepEqual(
      [seen.solid, seen.value, seen.standing, seen.standable],
      [true, mapData.firstRecord, entry.standing, true],
      `frame ${f}`,
    );
  }
  for (const f of [absent + 1, back, cycle.length + absent + 1]) {
    const seen = at(f);
    assert.equal(cycle[seen.shown % cycle.length], 0, `frame ${f}: absent`);
    assert.deepEqual(
      [seen.solid, seen.value, seen.standing, seen.standable],
      [false, -1, -1, false],
      `frame ${f}`,
    );
  }
  assert.equal(p.solid([10, 10, 17]), true, "a plain block whatever the frame");
  assert.equal(w.probe.value([11, 10, 17], absent), -1, "and the walkers read the same lattice");
  delete live.words.frame;
  assert.equal(p.solid([11, 10, 17]), true, "the level's first frame where the run has none");
});

test("the probe follows a platform's body: solid where the body stands now and empty at its home cell while it is away, the platform named with its shift, the axis of its run, its first block's centre and its count, and to a riding ball the platform's own blocks at home alone, the word under it the platform's", () => {
  const l = level([...row(10, 13, 10, 17), [20, 14, 17]], [platform(20, 14, 17)]);
  const live = standing(l, [10, 10, 17]);
  const p = probeOf(live);
  const rail = key([20, 14, 17]);
  const { speed, standing: word } = motion.kinds["5"];
  assert.equal(p.filled([20, 14, 17]), true);
  assert.equal(p.filled([20, 15, 17]), true, "the body's second block at home");
  assert.deepEqual(p.platform([20, 15, 17]), {
    key: rail,
    travel: [0, 0, 0],
    axis: 1,
    at: [20 * UNIT, 14 * UNIT, 17 * UNIT],
    count: 2,
  });
  assert.equal(p.platform([10, 10, 17]), null, "a plain block is no platform's");
  assert.equal(p.standable([20, 14, 17], TOP), true);
  const { walkers, probe: lattice, roll } = live.world;
  advance([...walkers.values()], lattice, 41, roll);
  const w = walkers.get(`${rail}/null`);
  assert.deepEqual(
    w.pos,
    [20 * UNIT, 14 * UNIT - 41 * speed, 17 * UNIT],
    "two blocks on toward -y",
  );
  assert.deepEqual(shiftOf(live.world, rail), [0, -41 * speed, 0]);
  assert.equal(p.filled([20, 14, 17]), false, "the home cell empty while the body is away");
  assert.equal(p.solid([20, 14, 17]), false);
  assert.equal(
    p.value([20, 14, 17]),
    mapData.firstRecord,
    "though the lattice's word stands there",
  );
  assert.equal(p.filled([20, 15, 17]), false);
  assert.equal(p.filled([20, 12, 17]), true, "the body where it stands now");
  assert.equal(p.filled([20, 13, 17]), true);
  assert.equal(p.filled([20, 11, 17]), false);
  const carried = {
    key: rail,
    travel: [0, -41 * speed, 0],
    axis: 1,
    at: [20 * UNIT, 14 * UNIT - 41 * speed, 17 * UNIT],
    count: 2,
  };
  assert.deepEqual(p.platform([20, 12, 17]), carried);
  assert.deepEqual(platformAt(live.world, [20, 13, 17]), carried);
  assert.equal(p.platform([20, 14, 17]), null);
  assert.equal(p.standable([20, 12, 17], TOP), true);
  assert.equal(p.standable([20, 14, 17], TOP), false);
  live.ball.riding = { key: rail };
  live.ball.travel = [0, -41 * speed, 0];
  assert.equal(p.solid([20, 14, 17]), true, "riding, the platform's blocks at home are solid");
  assert.equal(p.solid([20, 15, 17]), true);
  assert.equal(p.solid([20, 12, 17]), false, "not where the body is drawn");
  assert.equal(p.solid([10, 10, 17]), false, "nor the level's blocks");
  assert.equal(p.filled([10, 10, 17]), true, "which stand to everyone else");
  assert.equal(p.standable([10, 10, 17], TOP), true);
  assert.equal(standingOf(live), word, "the platform's word under a riding ball");
  live.ball.riding = null;
  live.ball.travel = null;
  assert.equal(p.solid([10, 10, 17]), true);
  assert.equal(standingOf(live), -1);
});

// The five fruit by their bits, as the loader checks them.
const FRUITS = Object.entries(motion.types)
  .filter(([, entry]) => entry.take?.fruit)
  .sort(([, a], [, b]) => a.take.fruit - b.take.fruit)
  .map(([type]) => Number(type));

test("while a run stands a fruit takes the type of the first of the five the run's word has not, its own where the word has every one, in a copy of its marker, and keeps the index's where no run stands", () => {
  const [first, second, third, , fifth] = FRUITS;
  const c = [17, 17, 17];
  const l = level([c], [{ x: 17, y: 17, z: 17, kind: 0, on: [object(TOP, third)] }]);
  const idx = index(l);
  const marks = idx.markers.get(key(c));
  const was = [...marks];
  const slot = `${key(c)}/${TOP}`;
  const fruitOf = (word) => worldOf(l, idx, TABLES, CIRCUITS, 0, word).pickups.get(slot).m.type;
  assert.equal(fruitOf(1), second, "the first taken, the second placed");
  assert.equal(fruitOf(0), first);
  assert.equal(fruitOf(15), fifth);
  assert.equal(fruitOf(31), third, "every fruit taken, the level's own");
  assert.equal(fruitOf(null), third, "no run, the level's own");
  const w = worldOf(l, idx, TABLES, CIRCUITS, 0, 1);
  const m = w.idx.markers.get(key(c)).find((m) => m.face === TOP);
  assert.equal(m.type, second);
  assert.equal(m.placed, true);
  assert.equal(w.pickups.get(slot).m, m, "the pickup is the placed marker");
  assert.equal(w.pickups.get(slot).take.fruit, motion.types[String(second)].take.fruit);
  const live = { idx, world: w, words: { outcome: 0 } };
  assert.equal(viewOf(live).markers.get(key(c))[0], m, "and the frame draws it");
  assert.equal(idx.markers.get(key(c)), marks, "the viewer's index as it was");
  assert.deepEqual(marks, was);
  assert.equal(marks[0].type, third);
  assert.equal(marks[0].placed, undefined);
  const alone = worldOf(l, idx, TABLES, CIRCUITS);
  assert.equal(alone.idx, idx, "no run, the index itself");
  assert.equal(alone.pickups.get(slot).m, marks[0]);
});
