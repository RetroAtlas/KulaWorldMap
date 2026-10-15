import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { cellKey, FACE_NORMAL } from "../../public/js/format/lattice.js";
import { heading } from "../../public/js/viewer/travel.js";
import { index, startsOf } from "../../public/js/viewer/data.js";
import {
  CAP,
  tangent,
  faceOf,
  probeOf,
  outcomeAt,
  step,
  headingAfter,
  headingOn,
  shortestWalk,
  encode,
  decode,
  validate,
  pieces,
  lifted,
} from "../../public/js/viewer/walk.js";

/** A level of plain blocks, some carrying a record, laid out to order. */
function level(blocks, records = []) {
  const cells = [];
  const placed = new Map(records.map((r, i) => [`${r.x},${r.y},${r.z}`, i]));
  for (const [x, y, z] of blocks) {
    const i = placed.get(`${x},${y},${z}`);
    cells.push(x, y, z, i === undefined ? 0 : mapData.firstRecord + i);
  }
  return { cells, records: records.map((r) => ({ on: [], ...r })) };
}
const row = (x0, x1, y, z) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, z]);
const probe = (blocks, records) => probeOf(index(level(blocks, records)));
const top = (x, y, z) => ({ cell: [x, y, z], face: 0 });
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const neg = (v) => v.map((x) => -x || 0);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const toward = (face, d) => [0, 1, 2, 3].find((k) => tangent(face, k).join() === d.join());
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const near = (a, b, what) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${what}: ${a} is not ${b}`));

/** Every station of a walk is the step before it taken from the one before. */
function replays(walk) {
  walk.steps.forEach((s, i) =>
    assert.deepEqual(walk.stations[i + 1], step(walk.stations[i], s.k, s.o)),
  );
}

const sameCourse = (a, b) => {
  assert.deepEqual(a.stations, b.stations);
  assert.deepEqual(a.steps, b.steps);
  assert.deepEqual(
    [...a.marks].sort((x, y) => x - y),
    [...b.marks].sort((x, y) => x - y),
  );
};

const dice = (seed) => {
  let s = seed;
  return (n) => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return (n * ((s >>> 16) & 0xffff)) >>> 16;
  };
};

/** A course of n stations drawn at random, its leaps' targets and its ends stops. */
function randomCourse(roll, n, leaps = false) {
  const station = () => ({ cell: [1 + roll(32), 1 + roll(32), 1 + roll(32)], face: roll(6) });
  const course = { stations: [station()], steps: [], marks: new Set([0]) };
  while (course.stations.length < n) {
    const i = course.stations.length;
    if (leaps && roll(10) === 0) {
      course.steps.push(null);
      course.stations.push(station());
      course.marks.add(i);
      continue;
    }
    const k = roll(4);
    const o = roll(3);
    const next = step(course.stations.at(-1), k, o);
    if (!next.cell.every((c) => c >= 0 && c <= 33)) continue;
    course.steps.push({ k, o });
    course.stations.push(next);
    if (roll(5) === 0) course.marks.add(i);
  }
  course.marks.add(n - 1);
  return course;
}

test("the four tangents of a face are the game's facings in order, a quarter turn apart", () => {
  for (let face = 0; face < 6; face++) {
    const n = FACE_NORMAL[face];
    assert.equal(faceOf(n), face);
    for (let k = 0; k < 4; k++) {
      const t = tangent(face, k);
      assert.deepEqual(t, heading(face, k + 1).d);
      assert.equal(dot(t, n), 0);
      assert.equal(dot(t, tangent(face, (k + 1) % 4)), 0, "a quarter turn is perpendicular");
      assert.deepEqual(tangent(face, (k + 2) % 4), neg(t), "two quarter turns turn about");
    }
  }
});

test("a roll on, an inner corner and an outer edge are what the lattice ahead holds", () => {
  const p = probe([...row(10, 14, 10, 17), [15, 10, 16], [15, 10, 17]]);
  assert.equal(outcomeAt(p, top(10, 10, 17), toward(0, X)), 0);
  assert.deepEqual(step(top(10, 10, 17), toward(0, X), 0), top(11, 10, 17));
  assert.equal(outcomeAt(p, top(14, 10, 17), toward(0, X)), 1, "a block ahead at ball level");
  assert.deepEqual(step(top(14, 10, 17), toward(0, X), 1), { cell: [15, 10, 16], face: 4 });
  assert.equal(outcomeAt(p, top(10, 10, 17), toward(0, neg(X))), 2, "nothing ahead at all");
  assert.deepEqual(step(top(10, 10, 17), toward(0, neg(X)), 2), { cell: [10, 10, 17], face: 4 });
  const gap = probe([...row(10, 12, 10, 17), ...row(14, 16, 10, 17)]);
  assert.equal(outcomeAt(gap, top(12, 10, 17), toward(0, X)), 2, "a gap is an edge");
});

test("an edge is refused beside a block, and taken where the block stands alone", () => {
  const beside = probe([...row(10, 12, 10, 17), [10, 11, 17]]);
  assert.equal(outcomeAt(beside, top(10, 10, 17), toward(0, neg(X))), null);
  assert.equal(outcomeAt(beside, top(10, 10, 17), toward(0, X)), 0, "a floor ahead takes no side");
  assert.equal(outcomeAt(beside, top(12, 10, 17), toward(0, X)), 2);
  assert.equal(outcomeAt(probe(row(10, 12, 10, 17)), top(10, 10, 17), toward(0, neg(X))), 2);
  const other = probe([...row(10, 12, 10, 17), [10, 9, 17]]);
  assert.equal(outcomeAt(other, top(10, 10, 17), toward(0, neg(X))), null, "on either side");
  const wall = probe([...row(10, 12, 10, 17), [10, 11, 17], [9, 10, 16]]);
  assert.equal(outcomeAt(wall, top(10, 10, 17), toward(0, neg(X))), null, "a wall over no floor");
  const newSide = probe([...row(10, 12, 10, 17), [9, 11, 17]]);
  assert.equal(
    outcomeAt(newSide, top(10, 10, 17), toward(0, neg(X))),
    2,
    "a block beside the face wrapped onto refuses nothing",
  );
});

test("the heading keeps through a roll on, turns down over an edge and up at a corner", () => {
  const k = toward(0, X);
  assert.equal(headingAfter(0, k, 0), k);
  assert.deepEqual(tangent(step(top(10, 10, 17), k, 2).face, headingAfter(0, k, 2)), Z);
  assert.deepEqual(tangent(step(top(10, 10, 17), k, 1).face, headingAfter(0, k, 1)), neg(Z));
  for (let face = 0; face < 6; face++)
    for (let k = 0; k < 4; k++)
      for (const o of [1, 2]) {
        const next = step({ cell: [10, 10, 10], face }, k, o);
        const d = tangent(next.face, headingAfter(face, k, o));
        assert.equal(dot(d, FACE_NORMAL[next.face]), 0);
        assert.deepEqual(d, o === 2 ? neg(FACE_NORMAL[face]) : FACE_NORMAL[face]);
      }
});

test("the shortest walk from the top of a block to its underside goes over two edges", () => {
  const p = probe([[10, 10, 17]]);
  const walk = shortestWalk(p, top(10, 10, 17), { cell: [10, 10, 17], face: 5 });
  assert.equal(walk.steps.length, 2);
  assert.ok(walk.steps.every((s) => s.o === 2));
  assert.deepEqual(walk.stations[0], top(10, 10, 17));
  assert.deepEqual(walk.stations.at(-1), { cell: [10, 10, 17], face: 5 });
  replays(walk);
  assert.deepEqual(tangent(5, walk.heading), neg(tangent(0, walk.steps[0].k)));
  assert.deepEqual(shortestWalk(p, top(10, 10, 17), top(10, 10, 17)), {
    steps: [],
    stations: [top(10, 10, 17)],
    heading: 0,
  });
});

test("no walk crosses a gap", () => {
  const p = probe([...row(10, 12, 10, 17), ...row(14, 16, 10, 17)]);
  assert.equal(shortestWalk(p, top(10, 10, 17), top(14, 10, 17)), null);
  assert.ok(shortestWalk(p, top(10, 10, 17), top(12, 10, 17)));
  assert.equal(shortestWalk(p, top(10, 10, 17), top(13, 10, 17)), null, "nor reaches no block");
});

test("a walk sets off along the heading it is given before it turns", () => {
  const ring = [
    ...row(10, 13, 10, 17),
    ...row(10, 13, 13, 17),
    [10, 11, 17],
    [10, 12, 17],
    [13, 11, 17],
    [13, 12, 17],
  ];
  const p = probe(ring);
  const along = shortestWalk(p, top(10, 10, 17), top(13, 13, 17), [toward(0, X)]);
  assert.equal(along.steps.length, 6);
  assert.equal(along.steps[0].k, toward(0, X));
  replays(along);
  const across = shortestWalk(p, top(10, 10, 17), top(13, 13, 17), [toward(0, Y)]);
  assert.equal(across.steps.length, 6);
  assert.equal(across.steps[0].k, toward(0, Y));
  const back = shortestWalk(p, top(12, 10, 17), top(10, 10, 17), [toward(0, X)]);
  assert.deepEqual(
    back.steps.map((s) => s.k),
    [toward(0, neg(X)), toward(0, neg(X))],
    "turning about costs two quarter turns and no roll",
  );
  assert.equal(back.heading, toward(0, neg(X)));
});

test("the ball never stands on a cell outside the lattice's inner 1..32", () => {
  const p = probe([...row(30, 33, 10, 17), [0, 10, 17]]);
  assert.equal(p.solid([33, 10, 17]), false);
  assert.equal(p.solid([0, 10, 17]), false);
  assert.equal(p.standable([33, 10, 17], 0), false);
  assert.equal(outcomeAt(p, top(32, 10, 17), toward(0, X)), 2, "the lattice's end is an edge");
  const walk = shortestWalk(p, top(30, 10, 17), { cell: [32, 10, 17], face: 5 });
  assert.ok(walk);
  replays(walk);
  for (const s of walk.stations)
    assert.ok(
      s.cell.every((v) => v >= 1 && v <= 32),
      s.cell.join(),
    );
});

test("a face with a block before it cannot be stood on", () => {
  const p = probe([
    [10, 10, 17],
    [10, 10, 16],
  ]);
  assert.equal(p.standable([10, 10, 17], 0), false);
  assert.equal(p.standable([10, 10, 16], 0), true);
  assert.equal(p.standable([10, 10, 16], 5), false);
  assert.equal(p.standable([10, 10, 17], 5), true);
  assert.equal(p.standable([10, 10, 17], 1), true);
  assert.equal(p.standable([11, 10, 17], 0), false, "nor a cell with no block");
});

test("a beam's end and a platform's body stand as blocks, as the game stands them", () => {
  const beam = {
    x: 10,
    y: 10,
    z: 17,
    kind: 8,
    type: 1,
    f: [1, 1, 10, 10, 17, 14, 10, 17, -1, -1, -1],
  };
  const platform = {
    x: 20,
    y: 10,
    z: 17,
    kind: 5,
    type: 1,
    f: [1, 1, 20, 10, 17, 24, 10, 17, -1, -1, -1],
    length: 3,
  };
  const p = probe(
    [
      [10, 10, 17],
      [20, 10, 17],
    ],
    [beam, platform],
  );
  assert.equal(p.solid([14, 10, 17]), true, "the far end the lattice leaves empty");
  assert.equal(p.solid([12, 10, 17]), false, "but not the beam between");
  assert.equal(p.solid([21, 10, 17]), true);
  assert.equal(p.solid([22, 10, 17]), true);
  assert.equal(p.solid([23, 10, 17]), false);
  assert.equal(outcomeAt(p, top(20, 10, 17), toward(0, X)), 0);
});

test("the start the game takes stands on a face the ball can stand on, on every level", () => {
  for (const l of mapData.levels) {
    const p = probeOf(index(l));
    const start = startsOf(l).at(-1);
    assert.ok(p.standable([start.x, start.y, start.z], start.face), l.name);
  }
});

test("a course comes back from its segment whole, leaps and stops with it", () => {
  const roll = dice(7);
  for (let trial = 0; trial < 60; trial++) {
    const course = randomCourse(roll, 1 + roll(60), trial % 2 === 1);
    const segment = encode(course);
    assert.match(segment, /^r[A-Za-z0-9_-]+$/);
    sameCourse(decode(segment), course);
  }
});

test("a course of as many stations as the cap comes back whole, and one beyond it is cut there", () => {
  const roll = dice(3);
  const full = randomCourse(roll, CAP);
  const segment = encode(full);
  sameCourse(decode(segment), full);
  assert.ok(segment.length < 360, `${segment.length} characters`);
  const over = randomCourse(roll, CAP + 5);
  const cut = decode(encode(over));
  assert.equal(cut.stations.length, CAP);
  assert.deepEqual(cut.stations, over.stations.slice(0, CAP));
  assert.deepEqual(cut.steps, over.steps.slice(0, CAP - 1));
});

test("LEVEL 1's start and two stops give the plan's stream", () => {
  const l = mapData.levels.find((l) => l.pack === "/HIRO/HIRO.PAK" && l.index === 0);
  const p = probeOf(index(l));
  const start = startsOf(l).at(-1);
  const from = { cell: [start.x, start.y, start.z], face: start.face };
  assert.deepEqual(from, top(17, 18, 17));
  const first = shortestWalk(p, from, top(17, 15, 17), [
    toward(from.face, heading(from.face, start.f[0]).d),
  ]);
  const second = shortestWalk(p, top(17, 15, 17), top(20, 15, 17), [first.heading]);
  const course = {
    stations: [...first.stations, ...second.stations.slice(1)],
    steps: [...first.steps, ...second.steps],
    marks: new Set([0, first.steps.length, first.steps.length + second.steps.length]),
  };
  assert.equal(cellKey(17, 18, 17), 0x4f39);
  const segment = encode(course);
  const nibbles = [...Buffer.from(segment.slice(1), "base64url")].flatMap((b) => [b >> 4, b & 15]);
  assert.deepEqual(nibbles, [4, 15, 3, 9, 0, 6, 6, 6, 13, 9, 9, 9]);
  assert.equal(segment, "r" + b64([0x4f, 0x39, 0x06, 0x66, 0xd9, 0x99]));
  sameCourse(decode(segment), course);
});

test("a segment that is not a course reads as none, and never throws", () => {
  assert.equal(decode("x" + b64([0x4f, 0x39, 0x06, 0x66, 0xd9, 0x99])), null, "another letter");
  assert.equal(decode("rTz+kG"), null, "a character outside the alphabet");
  assert.equal(decode("r"), null);
  assert.equal(decode("rTz"), null, "fewer than five nibbles");
  assert.equal(decode("r" + b64([0xff, 0xff, 0x0f])), null, "a cell off the lattice");
  assert.equal(decode("r" + b64([0x4f, 0x39, 0x6f])), null, "a face that is not one");
  for (const bad of [null, undefined, 7, "", "45,35", "fit"]) assert.equal(decode(bad), null);
});

test("a cut segment keeps what was read", () => {
  const course = randomCourse(dice(11), 40, true);
  const segment = encode(course);
  for (let n = 1; n < segment.length; n++) {
    const part = decode(segment.slice(0, n));
    if (n < 5) {
      assert.equal(part, null);
      continue;
    }
    assert.deepEqual(part.stations, course.stations.slice(0, part.stations.length));
    assert.deepEqual(part.steps, course.steps.slice(0, part.steps.length));
    for (const i of part.marks) assert.ok(course.marks.has(i) || i === part.stations.length - 1);
  }
  const reserved = decode("r" + b64([0x4f, 0x39, 0x06, 0x6e]));
  assert.equal(reserved.stations.length, 3, "a reserved nibble ends the reading");
  const short = decode("r" + b64([0x4f, 0x39, 0x06, 0xc4, 0xf3]));
  assert.deepEqual(short.steps, [{ k: 2, o: 0 }], "a leap with too few nibbles ends it");
  assert.equal(short.stations.length, 2);
  const out = encode({
    stations: [top(33, 10, 17), top(34, 10, 17)],
    steps: [{ k: toward(0, X), o: 0 }],
    marks: new Set([0, 1]),
  });
  assert.deepEqual(decode(out).stations, [top(33, 10, 17)], "a step off the lattice ends it");
});

test("a station whose face is gone is hollow, and a step the lattice no longer agrees with is broken", () => {
  const blocks = row(10, 13, 10, 17);
  const whole = probe(blocks);
  const walk = shortestWalk(whole, top(10, 10, 17), top(13, 10, 17), [toward(0, X)]);
  const course = { stations: walk.stations, steps: walk.steps, marks: new Set([0, 3]) };
  assert.deepEqual(validate(whole, course), { hollow: new Set(), broken: new Set() });
  const gone = validate(probe(blocks.filter(([x]) => x !== 12)), course);
  assert.deepEqual([...gone.hollow], [2]);
  assert.deepEqual([...gone.broken], [1], "the roll onto the missing block");
  const walled = validate(probe([...blocks, [12, 10, 16]]), course);
  assert.deepEqual([...walled.hollow], [2], "a block over the station");
  assert.deepEqual([...walled.broken], [1], "the roll on is a climb now");
  const leap = {
    stations: [top(10, 10, 17), top(13, 10, 17)],
    steps: [null],
    marks: new Set([0, 1]),
  };
  assert.deepEqual(validate(whole, leap), { hollow: new Set(), broken: new Set() });
});

test("a heading is named by the way it goes on a face, and by nothing else", () => {
  assert.equal(headingOn(0, X), toward(0, X));
  assert.equal(headingOn(0, neg(Y)), toward(0, neg(Y)));
  assert.equal(headingOn(1, Z), toward(1, Z));
  assert.equal(headingOn(0, neg(Z)), null, "the face's own normal");
  assert.equal(headingOn(0, null), null);
});

test("a half laid back over one already laid carries no chevron against it", () => {
  const out = toward(0, X);
  const back = toward(0, neg(X));
  const there = { stations: [top(10, 10, 17), top(11, 10, 17)], steps: [{ k: out, o: 0 }] };
  const andBack = {
    stations: [...there.stations, top(10, 10, 17)],
    steps: [...there.steps, { k: back, o: 0 }],
    marks: new Set([0, 1, 2]),
  };
  const { byKey } = pieces(andBack);
  const halves = (x) => byKey.get(cellKey(x, 10, 17)).filter((p) => !p.stop);
  assert.deepEqual(
    halves(10).map((p) => [p.i, p.chevron]),
    [
      [0, X],
      [1, null],
    ],
    "out with its chevron, back with none",
  );
  assert.deepEqual(
    halves(11).map((p) => [p.i, p.chevron]),
    [
      [0, null],
      [1, null],
    ],
    "the return's first half runs back over the roll's second",
  );
  const onward = {
    stations: [...there.stations, top(12, 10, 17)],
    steps: [...there.steps, { k: out, o: 0 }],
    marks: new Set([0, 2]),
  };
  assert.deepEqual(
    pieces(onward)
      .byKey.get(cellKey(11, 10, 17))
      .map((p) => p.chevron),
    [null, X],
    "a roll on keeps its chevron",
  );
  const wrap = {
    stations: [top(10, 10, 17), { cell: [10, 10, 17], face: 1 }, top(10, 10, 17)],
    steps: [
      { k: out, o: 2 },
      { k: toward(1, neg(Z)), o: 2 },
    ],
    marks: new Set([0, 1, 2]),
  };
  assert.deepEqual(
    pieces(wrap)
      .byKey.get(cellKey(10, 10, 17))
      .filter((p) => !p.stop)
      .map((p) => p.chevron),
    [X, null, null, null],
    "a wrap back over a wrap meets the same edge point",
  );
});

test("a step is two half-pieces on the faces it crosses, a chevron on the first, a dot at each stop", () => {
  const k = toward(0, X);
  const course = {
    stations: [
      top(10, 10, 17),
      top(11, 10, 17),
      { cell: [12, 10, 16], face: 4 },
      top(20, 20, 17),
      { cell: [20, 20, 17], face: 1 },
    ],
    steps: [{ k, o: 0 }, { k, o: 1 }, null, { k, o: 2 }],
    marks: new Set([0, 3, 4]),
  };
  const { byKey, leaps } = pieces(course);
  const at = (x, y, z) => byKey.get(cellKey(x, y, z));
  assert.deepEqual(
    [...byKey.keys()].sort((a, b) => a - b),
    [
      [10, 10, 17],
      [11, 10, 17],
      [12, 10, 16],
      [20, 20, 17],
    ]
      .map((c) => cellKey(...c))
      .sort((a, b) => a - b),
  );
  const [rollOut, dot0] = at(10, 10, 17);
  assert.deepEqual(Object.keys(rollOut).sort(), [
    "chevron",
    "face",
    "from",
    "i",
    "key",
    "stop",
    "to",
  ]);
  assert.equal(rollOut.face, 0);
  assert.equal(rollOut.i, 0);
  assert.equal(rollOut.stop, false);
  assert.deepEqual(rollOut.chevron, X);
  near(rollOut.from, [10.5, 10.5, 16.98], "the face's centre, lifted");
  near(rollOut.to, [11, 10.5, 16.98], "to the edge");
  assert.equal(dot0.stop, true);
  assert.equal(dot0.i, 0);
  near(dot0.from, [10.5, 10.5, 16.98], "a dot at the stop");
  near(dot0.to, dot0.from, "with no length");
  const [rollIn, climbOut] = at(11, 10, 17);
  near(rollIn.from, [11, 10.5, 16.98], "the second half from the edge");
  near(rollIn.to, [11.5, 10.5, 16.98], "to the next centre");
  assert.equal(rollIn.chevron, null);
  assert.equal(rollIn.i, 0);
  assert.equal(climbOut.i, 1);
  near(climbOut.to, [11.98, 10.5, 16.98], "to the corner, off the wall and the floor");
  const [climbIn] = at(12, 10, 16);
  assert.equal(climbIn.face, 4);
  near(climbIn.from, [11.98, 10.5, 16.98], "up from the corner");
  near(climbIn.to, [11.98, 10.5, 16.5], "to the wall's centre");
  const [wrapOut, wrapIn, dot3, dot4] = at(20, 20, 17);
  assert.equal(wrapOut.face, 0);
  assert.equal(wrapIn.face, 1);
  near(wrapOut.to, [21.02, 20.5, 16.98], "the edge, off both faces");
  near(wrapIn.from, wrapOut.to, "where the first half ends");
  near(wrapIn.to, [21.02, 20.5, 17.5], "down to the side's centre");
  assert.deepEqual([dot3.i, dot3.face, dot4.i, dot4.face], [3, 0, 4, 1]);
  assert.equal(leaps.length, 1);
  assert.equal(leaps[0].i, 2);
  near(leaps[0].from, [11.98, 10.5, 16.5], "a leap leaves from the face's centre, lifted");
  near(leaps[0].to, [20.5, 20.5, 16.98], "and lands on the next");
  assert.deepEqual(leaps[0].from, lifted(course.stations[2]));
  assert.deepEqual(dot0.from, lifted(course.stations[0]), "where the dot is");
  for (const list of byKey.values())
    for (const piece of list) {
      const n = FACE_NORMAL[piece.face];
      const axis = n.findIndex((v) => v !== 0);
      const cell = course.stations.find((s) => cellKey(...s.cell) === piece.key).cell;
      for (const p of [piece.from, piece.to])
        assert.ok(
          Math.abs((p[axis] - cell[axis] - 0.5) * n[axis] - 0.5 - 0.02) < 1e-9,
          "lifted 0.02",
        );
    }
});
