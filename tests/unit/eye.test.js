import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { state, camera, levelCentre } from "../../public/js/viewer/state.js";
import { FORM } from "../../public/js/play/game.js";
import { probeOf } from "../../public/js/play/world.js";
import { stateOf } from "../../public/js/play/traveller.js";
import {
  arrive,
  easeOn,
  easing,
  eyeOf,
  finishEase,
  follow,
  frameBall,
  frameEnding,
  matOf,
  quatOf,
  radiusOf,
  rocked,
  slerp,
  startEase,
  turning,
  viewNow,
  viewOf,
} from "../../public/js/play/eye.js";
import { rockOf } from "../../public/js/play/passes.js";
import { LETHARGY, begin, level, motion, play, row, start } from "./rules-level.js";

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const levelNamed = (name) => mapData.levels.find((l) => l.name === name);
const near = (a, b, what = "") =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${what}${a} against ${b}`));
const close = (a, b, what = "") => assert.ok(Math.abs(a - b) < 1e-9, `${what}${a} against ${b}`);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const unit = (q) => Math.abs(Math.hypot(...q) - 1) < 1e-9;
const angle = (a, b) => Math.acos(Math.min(1, Math.abs(dot(a, b))));

/** The view as a page opens it, 800 by 600 with the orbit at its default, Motion as given. */
function fresh(motionOn = true) {
  state.cam = { yaw: 45, pitch: 35, zoom: 1, panX: 0, panY: 0 };
  state.target = [17, 17, 17];
  state.frame = null;
  state.view = { w: 800, h: 600, dpr: 1 };
  state.show.motion = motionOn;
}

/** Play as it is held on `l`, the ball on the start and the view not yet framed. */
function playOn(l = level(row(10, 18), [start()])) {
  const run = begin(l);
  return { level: l, run, probe: probeOf(run), still: null, framed: false, ended: null };
}

const drawnBall = (live) => stateOf(live.run.ball, live.probe);

/** The level ended under `live`, the eye standing by `form`, as the ending is built. */
function ended(live, form = FORM.arcade) {
  live.ended = {
    frame: 0,
    length: Math.floor(motion.turn / play.view.swing),
    theta: 0,
    view: eyeOf(play.view, form),
    radius: radiusOf(live.level),
    free: 0,
    base: 1,
  };
  return live;
}

/** The zoom and the yaw the ending's view draws at, one a frame, through the frames one swing of
    the quicker eye takes, the eye standing by `form`. */
function swings(form) {
  fresh();
  const live = ended(playOn(levelNamed("LEVEL 1")), form);
  frameEnding(live, 600);
  const seen = [];
  for (let i = 0; i < Math.ceil(motion.turn / play.view.bonus.swing) + 1; i++) {
    seen.push({ zoom: state.cam.zoom, yaw: state.cam.yaw });
    turning(live);
  }
  return seen;
}

test("a rotation goes to a quaternion and back, and the slerp stands at its ends, keeps the unit length and the middle between them, and takes the shorter way round", () => {
  const live = playOn();
  const f = live.run.ball.frame;
  for (const m of [viewOf(null, 20, 30), f, viewOf(f, 45, 35)]) {
    const q = quatOf(m);
    assert.ok(unit(q));
    near(matOf(q), m, "back to the matrix: ");
    close(Math.abs(dot(quatOf(matOf(q)), q)), 1, "back to the quaternion: ");
  }
  const a = quatOf(viewOf(null, 45, 35));
  for (const b of [quatOf(viewOf(null, 20, 30)), quatOf(viewOf(null, 45, 35.01))]) {
    near(slerp(a, b, 0), a, "at the start: ");
    close(Math.abs(dot(slerp(a, b, 1), b)), 1, "at the end: ");
    const half = slerp(a, b, 0.5);
    assert.ok(unit(half));
    close(angle(half, a), angle(half, b), "halfway: ");
    near(
      slerp(
        a,
        b.map((v) => -v),
        0.5,
      ),
      half,
      "the shorter way: ",
    );
  }
});

test("the view's rotation is the orbit's basis turned by the frame, as the camera holds it, and the view as it stands is read with its target copied", () => {
  fresh();
  const f = playOn().run.ball.frame;
  const held = () => {
    const c = camera();
    return [...c.right, ...c.up, ...c.toward];
  };
  near(viewOf(null, 45, 35), held(), "no frame: ");
  state.frame = f;
  state.cam.yaw = 20;
  state.cam.pitch = 30;
  near(viewOf(f, 20, 30), held(), "the ball's frame: ");
  Object.assign(state.cam, { zoom: 2, panX: 1, panY: -1 });
  const now = viewNow();
  near(now.rot, held(), "as it stands: ");
  assert.deepEqual([now.zoom, now.panX, now.panY], [2, 1, -1]);
  assert.deepEqual(now.target, state.target);
  assert.notEqual(now.target, state.target);
});

test("the level's radius is half its box's diagonal, in blocks", () => {
  for (const [name, radius] of [
    ["LEVEL 1", 4.06201920231798],
    ["BONUS 17", 20.512191496766015],
    ["SIMON10", 1.6583123951777],
  ])
    close(radiusOf(levelNamed(name)), radius, `${name}: `);
});

test("the ending's view frames the level's middle in what the strip leaves free, zoomed so that the whole level fits, the base zoom standing at the swing's start", () => {
  fresh();
  const live = ended(playOn(levelNamed("LEVEL 1")));
  frameEnding(live, 600);
  const e = live.ended;
  assert.deepEqual(state.target, levelCentre(live.level));
  assert.equal(e.free, 600);
  close(e.base, 1.954982503789402, "the base: ");
  assert.equal(state.cam.zoom, e.base);
  assert.equal(state.cam.panX, 0);
  close(state.cam.panY, 0, "the pan: ");
  frameEnding(live, 500);
  assert.equal(e.free, 500);
  close(e.base, 1.5929487067913646, "the base over a strip: ");
  assert.equal(state.cam.zoom, e.base);
  close(state.cam.panY, 0.9231861823449956, "the pan over a strip: ");
});

test("through one swing of the quicker eye the arcade eye only draws further off than it stood", () => {
  const zooms = swings(FORM.arcade).map((s) => s.zoom);
  assert.ok(zooms.length > 1);
  assert.equal(Math.max(...zooms), zooms[0]);
  assert.ok(Math.min(...zooms) < zooms[0]);
});

test("within one swing of its eye a level with no key draws nearer than it stood", () => {
  const zooms = swings(FORM.bonus).map((s) => s.zoom);
  assert.ok(Math.max(...zooms) > zooms[0]);
});

test("a hidden level's eye holds its zoom while its yaw turns", () => {
  const seen = swings(FORM.hidden);
  assert.equal(new Set(seen.map((s) => s.zoom)).size, 1);
  assert.equal(new Set(seen.map((s) => s.yaw)).size, seen.length);
});

test("each frame of the ending's view turns the yaw by the game's third angle and the pitch by its first, and the view says its length has run out on the 341st, one swing of an arcade level's eye", () => {
  fresh();
  const live = ended(playOn(levelNamed("LEVEL 1")));
  frameEnding(live, 600);
  let ran = turning(live);
  assert.equal(ran, false);
  assert.equal(state.cam.yaw, 45.87890625);
  assert.equal(state.cam.pitch, 34.296875);
  while (!ran) ran = turning(live);
  assert.equal(live.ended.frame, 341);
});

test("the view behind the ball stands at yaw 20 and pitch 30 the first time it is framed and keeps them as turned after, zoomed to eight blocks across the smaller of the view's width and what the strip leaves free, within its bounds, and panned so the ball stands a fifth below the middle of the free height", () => {
  fresh();
  const live = playOn();
  const s = drawnBall(live);
  frameBall(live.level, live, s, 600);
  assert.equal(live.framed, true);
  assert.deepEqual(state.target, s.centre);
  assert.equal(state.cam.yaw, 20);
  assert.equal(state.cam.pitch, 30);
  close(state.cam.zoom, 2.2058823529411766, "the zoom: ");
  assert.equal(state.cam.panX, 0);
  close(state.cam.panY, -1.6, "the pan: ");
  state.cam.yaw = 50;
  frameBall(live.level, live, s, 500);
  assert.equal(state.cam.yaw, 50);
  close(state.cam.zoom, 1.838235294117647, "the zoom over a strip: ");
  close(state.cam.panY, -0.8, "the pan over a strip: ");
  frameBall(live.level, live, s, 100);
  assert.equal(state.cam.zoom, 0.8);
  state.view = { w: 2000, h: 2000, dpr: 1 };
  frameBall(live.level, live, s, 2000);
  assert.equal(state.cam.zoom, 3);
});

test("the framer falls back to the level's own fit where the level is not the one played, letting the camera's frame go, and to the ending's view once the level has ended", () => {
  fresh();
  const live = playOn(levelNamed("LEVEL 1"));
  const s = drawnBall(live);
  state.frame = live.run.ball.frame;
  frameBall(live.level, live, s, 600);
  const other = levelNamed("LEVEL 68");
  frameBall(other, live, s, 600);
  assert.equal(state.frame, null);
  assert.deepEqual(state.target, levelCentre(other));
  ended(live);
  frameBall(live.level, live, s, 500);
  assert.deepEqual(state.target, levelCentre(live.level));
  assert.equal(live.ended.free, 500);
  assert.equal(state.cam.zoom, live.ended.base);
});

test("the ease runs from one view to another by the clock it is given, the rotation slerped, the zoom by its logarithm and the rest straight, says when it has ended with its done run, and with Motion off is done at once", () => {
  fresh();
  const from = { rot: viewOf(null, 45, 35), zoom: 1, panX: 0, panY: 0, target: [17, 17, 17] };
  const to = {
    rot: () => viewOf(null, 45, 35),
    zoom: 4,
    panX: 2,
    panY: -2,
    target: () => [10, 10, 10],
  };
  let done = 0;
  startEase(from, to, 600, 1000, () => done++);
  assert.equal(easeOn(), true);
  assert.equal(easing(1300), false);
  assert.equal(done, 0);
  near(state.frame, IDENTITY, "the frame: ");
  near([state.cam.zoom, state.cam.panX, state.cam.panY], [2, 1, -1], "the orbit: ");
  near(state.target, [13.5, 13.5, 13.5], "the target: ");
  assert.equal(easing(1600), true);
  assert.equal(done, 1);
  assert.equal(easeOn(), false);
  startEase(from, to, 600, 2000, () => done++);
  finishEase();
  assert.equal(done, 2);
  assert.equal(easeOn(), false);
  finishEase();
  assert.equal(done, 2);
  fresh(false);
  startEase(from, to, 600, 3000, () => done++);
  assert.equal(done, 3);
  assert.equal(easeOn(), false);
});

test("the target draws after the ball as drawn, with Motion on approaching over the follow's time and without at once, landing on it within a hair, and the frame is the ball's, which the follow reports as it changes", () => {
  fresh();
  const live = playOn();
  const s = drawnBall(live);
  const was = [...state.target];
  assert.equal(follow(live, s, 120), true);
  const k = 1 - Math.exp(-1);
  near(
    state.target,
    was.map((v, i) => v + (s.centre[i] - v) * k),
    "the target: ",
  );
  assert.equal(state.frame, live.run.ball.frame);
  assert.equal(follow(live, s, 120), false);
  state.target = s.centre.map((v) => v + 1e-5);
  follow(live, s, 16);
  assert.deepEqual(state.target, s.centre);
  fresh(false);
  assert.equal(follow(live, s, 16), true);
  assert.deepEqual(state.target, s.centre);
  assert.equal(state.frame, s.frame);
});

test("the pill's roll gives the frame itself while its word is not positive, else the frame rolled about the line of sight, the same array while the frame, the word and the orbit stand", () => {
  fresh();
  const live = playOn();
  const f = live.run.ball.frame;
  assert.equal(rocked(live, f), f);
  live.run.words.pills[LETHARGY] = 1;
  const out = rocked(live, f);
  assert.notEqual(out, f);
  assert.notDeepEqual(out, f);
  for (const k of [0, 3, 6]) assert.ok(unit(out.slice(k, k + 3)), `column ${k / 3}`);
  assert.equal(rocked(live, f), out);
  state.cam.yaw += 1;
  const turned = rocked(live, f);
  assert.notEqual(turned, out);
  assert.equal(rocked(live, f), turned);
  live.run.words.pills[LETHARGY] = 0;
  assert.equal(rocked(live, f), f);
});

test("the pill's roll turns the view about its line of sight by the table's angle for the word, up tipping left for a positive angle, whichever way the orbit stands, and leaves the frame itself where the angle comes to nothing", () => {
  fresh();
  const live = playOn();
  const f = live.run.ball.frame;
  const { word, step, rock } = motion.types[LETHARGY].lasts;
  const angleOf = (w) => rockOf(w, rock, motion.turn);
  /** The view rolled about its toward by `angle`, up tipping left for a positive one. */
  const rolledBy = (view, angle) => {
    const [right, up, toward] = [0, 3, 6].map((k) => view.slice(k, k + 3));
    const c = Math.cos((angle / motion.turn) * 2 * Math.PI);
    const s = Math.sin((angle / motion.turn) * 2 * Math.PI);
    return [
      ...right.map((v, i) => c * v + s * up[i]),
      ...up.map((v, i) => c * v - s * right[i]),
      ...toward,
    ];
  };
  // the word whose scaled angle is a quarter turn, where the sine is one
  const quarter = motion.turn / (4 * rock.scale);
  assert.ok(angleOf(quarter) > 0);
  for (const [yaw, pitch] of [
    [20, 30],
    [45, 35],
  ]) {
    Object.assign(state.cam, { yaw, pitch });
    const rest = viewOf(f, yaw, pitch);
    for (const w of [word, word - step, word - 2 * step, quarter]) {
      live.run.words.pills[LETHARGY] = w;
      const angle = angleOf(w);
      assert.notEqual(angle, 0);
      near(viewOf(rocked(live, f), yaw, pitch), rolledBy(rest, angle), `word ${w} at yaw ${yaw}: `);
    }
  }
  live.run.words.pills[LETHARGY] = 2 * quarter;
  assert.equal(angleOf(2 * quarter), 0);
  assert.equal(rocked(live, f), f);
});

test("the view comes round behind the ball by an ease from the view given, the frame holding that view in the orbit's basis while it runs and cut to the ball's as it ends, and without Motion at once", () => {
  fresh();
  const live = playOn();
  const s = drawnBall(live);
  frameBall(live.level, live, s, 600);
  const from = { rot: viewOf(null, 45, 35), zoom: 1, panX: 0, panY: 0, target: [17, 17, 17] };
  arrive(live, from, () => s.centre, 1000);
  assert.equal(easeOn(), true);
  near(viewOf(state.frame, state.cam.yaw, state.cam.pitch), from.rot, "the view held: ");
  assert.equal(easing(1600), true);
  assert.equal(state.frame, live.run.ball.frame);
  assert.equal(easeOn(), false);
  fresh(false);
  arrive(live, from, () => s.centre, 2000);
  assert.equal(easeOn(), false);
  assert.equal(state.frame, live.run.ball.frame);
});
