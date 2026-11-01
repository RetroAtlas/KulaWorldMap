import { test } from "node:test";
import assert from "node:assert/strict";
import { objects, releases } from "./fixtures.js";
import {
  kindMotion,
  motionOf,
  motionTable,
  setObjects,
  skinsTable,
} from "../../public/js/viewer/data.js";
import { BASE, setCurrent, setReleases } from "../../public/js/viewer/release.js";

const [us, eu, jp] = releases;
setObjects(objects);
setReleases(releases);
const { motion, skins } = objects;
const NESTED = ["types", "kinds"];
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

test("every release's motion and skins carry only keys of the base's tables, their types and kinds only entries of the base's, each differing from it", () => {
  for (const r of releases) {
    for (const [k, v] of Object.entries(r.objects.motion)) {
      assert.ok(k in motion, `${r.id} motion ${k}`);
      if (NESTED.includes(k)) {
        for (const [e, entry] of Object.entries(v)) {
          assert.ok(e in motion[k], `${r.id} ${k} ${e}`);
          assert.ok(differs(entry, motion[k][e]), `${r.id} ${k} ${e} is the base's entry`);
        }
      } else assert.ok(differs(v, motion[k]), `${r.id} motion ${k} is the base's`);
    }
    for (const [k, v] of Object.entries(r.objects.skins)) {
      assert.ok(k in skins, `${r.id} skins ${k}`);
      assert.ok(differs(v, skins[k]), `${r.id} skins ${k} is the base's`);
    }
  }
});

test("the US entry carries no motion and no skins of its own", () => {
  assert.deepEqual([us.objects.motion, us.objects.skins], [{}, {}]);
});

test("the PAL table runs fifty frames a second: the pills' 300 and 700 frames, the platform's 30 a frame with a dwell of 40, the spikes' cycle of 119, the breath's 5000, the clock's 50 ticks a second and the hourglass's 4999", () => {
  const m = eu.objects.motion;
  assert.equal(m.hz, 50);
  assert.equal(motion.hz, 60);
  assert.equal(m.types["32"].lasts.word, 300);
  assert.equal(motion.types["32"].lasts.word, 360);
  for (const t of ["33", "34", "38"]) {
    assert.equal(m.types[t].lasts.word, 700, t);
    assert.equal(motion.types[t].lasts.word, 840, t);
  }
  assert.deepEqual([m.kinds["5"].speed, m.kinds["5"].dwell], [30, 40]);
  assert.deepEqual([motion.kinds["5"].speed, motion.kinds["5"].dwell], [25, 48]);
  for (const cycle of m.types["11"].cycle) assert.equal(cycle.length, 119);
  for (const cycle of motion.types["11"].cycle) assert.equal(cycle.length, 143);
  assert.equal(m.types["30"].breathe.full, 5000);
  assert.equal(motion.types["30"].breathe.full, 6000);
  assert.equal(m.play.clock.second, 50);
  assert.equal(m.types["35"].take.clock.from, 4999);
  assert.equal(motion.types["35"].take.clock.from, 5999);
});

test("the PAL table has no skip for the jump and no constant for a hop's fall, its mesh readings say so and its arc is 28 rows, the hop's last among them", () => {
  const ball = eu.objects.motion.types["30"];
  assert.equal(ball.jump.skip, null);
  assert.equal(ball.fall.hop, null);
  assert.ok(Number.isInteger(motion.types["30"].jump.skip));
  assert.ok(Number.isInteger(motion.types["30"].fall.hop));
  assert.deepEqual(eu.objects.readings, { ...us.objects.readings, "jump.skip": null });
  assert.deepEqual(jp.objects.readings, us.objects.readings);
  assert.equal(eu.objects.jump.count, 28);
  assert.equal(eu.objects.jump.rows.length, 28);
});

test("the fast star's face scores 5 a frame on the base's table and on the PAL's, whose entry for it is whole", () => {
  assert.equal(motion.types["52"].points, 5);
  assert.equal(eu.objects.motion.types["52"].points, 5);
  assert.equal(
    Object.keys(eu.objects.motion.types["52"]).length,
    Object.keys(motion.types["52"]).length,
  );
});

test("the PAL skins change in their cycles alone, fire running 45 frames", () => {
  assert.deepEqual(Object.keys(eu.objects.skins), ["cycles"]);
  assert.equal(eu.objects.skins.cycles.fire.frames.length, 45);
  assert.equal(skins.cycles.fire.frames.length, 54);
});

test("the PAL table and the PAL rules agree where both readers read the same instructions", () => {
  const m = eu.objects.motion;
  const { rules } = eu;
  assert.equal(m.hz, rules.hz);
  assert.equal(m.play.clock.second, rules.clock.fill);
  const { take } = m.types["35"];
  assert.deepEqual(
    [take.clock.from, take.clock.second, take.points],
    [rules.hourglass.from, rules.hourglass.second, rules.hourglass.points],
  );
});

test("the Japanese table runs sixty frames a second as the base's does, its clock filling 60 ticks a second, the breath measured against 7200 and a fiftieth, the hourglass turning the clock from 7199 with no seconds and no points, and the ending's view stepping -5, 2 and 7", () => {
  const m = jp.objects.motion;
  assert.deepEqual(Object.keys(m).sort(), ["play", "types"]);
  assert.deepEqual(Object.keys(m.types).sort(), ["30", "35", "52"]);
  assert.equal(m.play.clock.second, 60);
  assert.equal(motion.play.clock.second, 50);
  const [ball, base] = [m.types["30"], motion.types["30"]];
  assert.deepEqual([ball.breathe.full, ball.breathe.over, ball.breathe.tick], [7200, 50, 60]);
  assert.deepEqual([base.breathe.full, base.breathe.over, base.breathe.tick], [6000, 40, 50]);
  assert.deepEqual([ball.breathe.rate, ball.rolling.over], [base.breathe.rate, base.rolling.over]);
  const { take } = m.types["35"];
  assert.deepEqual([take.clock.from, take.clock.second, take.points], [7199, null, null]);
  assert.deepEqual(m.play.view.angles, [-5, 2, 7]);
  assert.deepEqual(motion.play.view.angles, [-8, 3, 10]);
});

test("the fast star's face scores nothing on the Japanese disc, whose entry for it is whole, and a Simon match there is won past two points rather than five", () => {
  const star = jp.objects.motion.types["52"];
  assert.equal(star.points, null);
  assert.deepEqual(Object.keys(star), Object.keys(motion.types["52"]));
  assert.equal(jp.objects.motion.play.simon.points, 2);
  assert.equal(motion.play.simon.points, 5);
});

test("the Japanese words are the end screen's own for every ending the base's table names, the Perfect! pair among them nowhere", () => {
  const { words } = jp.objects.motion.play;
  assert.deepEqual(Object.keys(words).sort(), Object.keys(motion.play.words).sort());
  for (const [name, word] of Object.entries(words))
    assert.notEqual(word, motion.play.words[name], name);
  assert.equal(words.lost, "落ちた");
  assert.equal(words.time, "タイムアウト");
  assert.equal(words.exit, "良くできました");
  assert.equal(words.over, "Game Over");
  assert.ok(!Object.values(words).some((w) => /Perfect/.test(w)));
});

test("the Japanese table and the Japanese rules agree where both readers read the same instructions", () => {
  const m = jp.objects.motion;
  const { rules } = jp;
  assert.equal(m.hz ?? motion.hz, rules.hz);
  assert.equal(m.play.clock.second, rules.clock.fill);
  const { take } = m.types["35"];
  assert.deepEqual(
    [take.clock.from, take.clock.second, take.points],
    [rules.hourglass.from, rules.hourglass.second, rules.hourglass.points],
  );
});

test("the Japanese skins change in the swirl's colour cycles alone, four of 256 colours against the base's 192 in colours of their own, the other cycles and the swirl's frames the base's", () => {
  assert.deepEqual(Object.keys(jp.objects.skins), ["cycles"]);
  const theirs = jp.objects.skins.cycles;
  const base = skins.cycles;
  for (const name of ["fire", "invisible", "spread"])
    assert.deepEqual(theirs[name], base[name], name);
  for (const key of ["frames", "shadowed", "marked"])
    assert.deepEqual(theirs.bonus[key], base.bonus[key], key);
  assert.equal(theirs.bonus.colour.length, base.bonus.colour.length);
  for (const cycle of theirs.bonus.colour) assert.equal(cycle.length, 256);
  for (const cycle of base.bonus.colour) assert.equal(cycle.length, 192);
  assert.deepEqual(
    theirs.bonus.colour.map((c) => c[0]),
    [
      [160, 0, 160],
      [240, 128, 0],
      [160, 0, 160],
      [0, 160, 240],
    ],
  );
  assert.deepEqual(
    base.bonus.colour.map((c) => c[0]),
    [
      [168, 0, 168],
      [224, 120, 0],
      [168, 0, 168],
      [0, 144, 224],
    ],
  );
});

test("under the US release the viewer's motion and skins tables are the base's own objects", () => {
  assert.equal(motionTable(), motion);
  assert.equal(skinsTable(), skins);
});

test("under the PAL release the viewer's tables are the base's with the PAL file's keys written over, a type or a kind the file carries its own object and one it does not the base's, composed once", (t) => {
  setCurrent("eu");
  t.after(() => setCurrent(BASE));
  const m = motionTable();
  assert.equal(m.hz, 50);
  assert.equal(motionTable(), m);
  assert.notEqual(m, motion);
  assert.equal(m.glow, eu.objects.motion.glow);
  assert.equal(m.turn, motion.turn);
  assert.equal(m.dice, motion.dice);
  assert.equal(m.types["5"], eu.objects.motion.types["5"]);
  assert.equal(m.types["9"], motion.types["9"]);
  assert.equal(m.kinds["5"], eu.objects.motion.kinds["5"]);
  assert.equal(m.kinds["1"], motion.kinds["1"]);
  assert.equal(kindMotion(5).speed, 30);
  assert.equal(motionOf({ face: 0, type: 32 }), eu.objects.motion.types["32"]);
  assert.equal(motionOf({ face: 0, type: 9 }), motion.types["9"]);
  const s = skinsTable();
  assert.equal(skinsTable(), s);
  assert.equal(s.cycles, eu.objects.skins.cycles);
  assert.equal(s.shade, skins.shade);
});

test("under the Japanese release the viewer's tables are the base's with the Japanese file's keys written over, its play, its three types and its cycles the file's own objects and the rest the base's", (t) => {
  setCurrent("jp");
  t.after(() => setCurrent(BASE));
  const m = motionTable();
  assert.equal(m.hz, jp.rules.hz);
  assert.equal(motionTable(), m);
  assert.notEqual(m, motion);
  assert.equal(m.play, jp.objects.motion.play);
  assert.equal(m.glow, motion.glow);
  for (const type of ["30", "35", "52"])
    assert.equal(m.types[type], jp.objects.motion.types[type], type);
  assert.equal(m.types["9"], motion.types["9"]);
  assert.equal(m.kinds, motion.kinds);
  assert.equal(motionOf({ face: 0, type: 35 }), jp.objects.motion.types["35"]);
  assert.equal(kindMotion(5), motion.kinds["5"]);
  const s = skinsTable();
  assert.equal(skinsTable(), s);
  assert.notEqual(s, skins);
  assert.equal(s.cycles, jp.objects.skins.cycles);
  assert.equal(s.shade, skins.shade);
});
