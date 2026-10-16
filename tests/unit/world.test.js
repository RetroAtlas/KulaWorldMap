import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, mapData, annotations } from "./fixtures.js";
import { state } from "../../public/js/viewer/state.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { setObjects, setAnnotations, index } from "../../public/js/viewer/data.js";
import { ballAt } from "../../public/js/play/ball.js";
import { worldOf, standingOf, probeOf, travelOf } from "../../public/js/play/world.js";

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
  assert.equal(w.view, idx, "the index is what the frame draws");
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
  const keyAt = w.pickups.get(`${key([11, 10, 17])}/0`);
  assert.equal(keyAt.take.reach, motion.types["31"].take.reach);
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
  assert.ok(w.bodies.has(key([20, 15, 17])), "the body's second block at rest");
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
  ];
  const l = level(blocks, [
    own(15, 10, 17, 6),
    { x: 16, y: 10, z: 17, kind: 0, on: [object(0, 37)] },
    { x: 17, y: 10, z: 17, kind: 0, on: [object(1, 31)] },
    { x: 18, y: 10, z: 17, kind: 0, on: [object(0, 29, 3)] },
    { x: 19, y: 10, z: 17, kind: 8, type: 1, f: [1, 1, 19, 10, 17, 23, 10, 17, -1, -1, -1] },
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
  assert.equal(standingOf(laser), 37, "a laser block leaves the word as it was");
  assert.equal(probeOf(laser).standing([19, 10, 17], TOP), undefined);
});

test("the probe answers the lattice as the planner's did, and names the kind and the word under a cell", () => {
  const l = level(
    [...row(10, 13, 10, 17), [12, 10, 17, 2], [20, 14, 17]],
    [own(11, 10, 17, 6), platform(20, 14, 17)],
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
  assert.equal(p.slick([10, 10, 17]), false);
  assert.equal(p.brittle([11, 10, 17]), true);
  assert.equal(p.brittle([12, 10, 17]), false);
  assert.equal(p.standing([11, 10, 17], TOP), 96);
  assert.equal(p.standing([12, 10, 17], TOP), 2);
  live.world = world(level(row(10, 11, 10, 17)));
  assert.equal(p.solid([12, 10, 17]), false, "the probe reads the world as it now stands");
});
