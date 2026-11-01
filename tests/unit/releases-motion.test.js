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

test("the US entry carries no motion and no skins of its own, and the Japanese neither yet", () => {
  assert.deepEqual([us.objects.motion, us.objects.skins], [{}, {}]);
  assert.deepEqual([jp.objects.motion, jp.objects.skins], [{}, {}]);
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
