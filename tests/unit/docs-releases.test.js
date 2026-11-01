import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapData, most, objects, packs, releases } from "./fixtures.js";

const text = (path) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8");
const disc = text("docs/disc.md");
const format = text("docs/level-format.md");
const readme = text("README.md");
const reasons = text("docs/annotations.md");
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

test("annotations.md's line on the shorter levels with an hourglass counts them and scores a take as one starts by the US and PAL rules", () => {
  const m =
    /^The notes put that take on a level of the usual length, since (\d+) of the US disc's (\d+) levels with an hourglass run 99 seconds and the other (\d+) run (\d+) to (\d+), where a take as the level starts scores (\d+) down to (\d+) on that disc and (\d+) down to (\d+) on the PAL disc\.$/m.exec(
      reasons,
    );
  assert.ok(m, "annotations.md has no line on the lengths of the levels with an hourglass");
  const withOne = mapData.levels.filter((l) =>
    l.records.some((r) => r.on.some((o) => o.type === 35)),
  );
  const shorter = withOne.map((l) => l.time).filter((t) => t !== 99);
  const [shortest, longest] = [Math.min(...shorter), Math.max(...shorter)];
  const atStart = ({ clock, hourglass: h }, t) =>
    h.points * Math.trunc((h.from - t * clock.fill) / h.second);
  const [us, eu] = releases;
  assert.deepEqual(m.slice(1).map(figure), [
    withOne.length - shorter.length,
    withOne.length,
    shorter.length,
    shortest,
    longest,
    atStart(us.rules, shortest),
    atStart(us.rules, longest),
    atStart(eu.rules, shortest),
    atStart(eu.rules, longest),
  ]);
});

const motion = text("docs/motion.md");
const tgi = text("docs/tgi.md");
const camera = text("docs/camera.md");
const pal = releases[1].objects;
const signed = (s) => number(s.replace("\u2212", "-"));
const said = (doc, pattern, what) => {
  const m = pattern.exec(doc);
  assert.ok(m, `${what} has no PAL line matching ${pattern}`);
  return m.slice(1).map(signed);
};

test("motion.md's PAL lines on the ball give the figures the PAL table holds", () => {
  const ball = pal.motion.types["30"];
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the breath takes the time against (\d+) and a fortieth/m,
      "The ball",
    ),
    [ball.breathe.full],
  );
  assert.deepEqual(
    said(motion, /^On the PAL disc the speed grows by (\d+) a frame to (\d+) \(/m, "the roll"),
    [ball.rolling.gain, ball.rolling.top],
  );
  assert.deepEqual(
    said(motion, /^On the PAL disc the count is (\d+) and the step (\d+) or −\d+ \(/m, "the turn"),
    [ball.quarter.frames, ball.quarter.step],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the count is (\d+) and the step (\d+) \(`SCES_010\.00`, `0x80030d9c`/m,
      "the edge",
    ),
    [ball.wrap.frames, ball.wrap.step],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the wall tells the view a count of (\d+) and a step of (−\d+)/m,
      "the wall",
    ),
    [ball.climb.frames, ball.climb.step],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the fall adds (−\d+) a frame to no more than (−\d+)/m,
      "the fall",
    ),
    [ball.fall.gain, ball.fall.top],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the jump sets both speeds to (\d+) \(`SCES_010\.00`, `0x8002fea0`\), takes the arc's count of (\d+)/m,
      "the jump",
    ),
    [ball.jump.speed, pal.jump.count],
  );
  assert.equal(ball.jump.skip, null);
  assert.deepEqual(
    said(camera, /^On the PAL disc R1 and R2 add (\d+) a frame/m, "camera.md's view in play"),
    [ball.look.held],
  );
});

test("motion.md's PAL lines on the pills, the platform, the spikes, the vanishing block, the glow and the crumbling block give the figures the PAL table holds", () => {
  const { types, kinds, glow } = pal.motion;
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the lethargy pill sets its word to (\d+) and the other two pills and the sunglasses theirs to (\d+)/m,
      "the pills",
    ),
    [types["32"].lasts.word, types["33"].lasts.word],
  );
  for (const t of ["34", "38"]) assert.equal(types[t].lasts.word, types["33"].lasts.word, t);
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc those words run as this disc's do: .* the bouncy pill's hold is (\d+)/m,
      "the hold",
    ),
    [types["33"].lasts.hold],
  );
  const { blink } = types["38"].lasts;
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the timer is laid at (\d+) \(.*?\), so the first spell is (\d+) frames and every spell after (\d+), (\d+) frames in all/m,
      "the blink",
    ),
    [blink.frames, blink.first, blink.frames, blink.first + (blink.times - 1) * blink.frames],
  );
  assert.deepEqual(
    said(
      reasons,
      /^On the PAL disc the pill's case sets the word to (\d+) \(`SCES_010\.00`, `0x800390d0`\) and the ball's routine counts it down/m,
      "annotations.md's type 34",
    ),
    [types["34"].lasts.word],
  );
  assert.deepEqual(
    said(
      motion,
      /^The PAL loader zeroes the dwell and writes the speed back as the disc holds it \(`SCES_010\.00`, `0x800332e4` to `0x800332ec`\), (\d+) a frame at fifty frames a second, the same 1500 units a second, and its routine sets the dwell to (\d+) at each end/m,
      "the platform",
    ),
    [kinds["5"].speed, kinds["5"].dwell],
  );
  const spikes = types["11"];
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the cycle is (\d+) frames, [\d.]+ s, the states lasting/m,
      "the spikes",
    ),
    [spikes.cycle[0].length],
  );
  assert.deepEqual(
    said(
      motion,
      /so the spikes are deadly for (\d+) frames of the (\d+)/m,
      "the spikes' deadly frames",
    ),
    [spikes.deadly[0].filter(Boolean).length, spikes.deadly[0].length],
  );
  const [vanishing] = kinds["7"].cycle;
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the cycle is (\d+) frames, [\d.]+ s, absent for (\d+), fading in over (\d+), settling over (\d+), solid for (\d+), dimming over (\d+) and flashing out over (\d+)/m,
      "the vanishing block",
    ),
    [
      vanishing.length,
      ...[0, 1, 2, 3, 4, 5].map((state) => vanishing.filter((s) => s === state).length),
    ],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the count is (\d+) \(`SCES_010\.00`, `0x8002dc98`/m,
      "the devices' light",
    ),
    [glow.every],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the routine takes (\d+) off `f2` a frame/m,
      "the crumbling block",
    ),
    [kinds["6"].shrink],
  );
});

test("motion.md's PAL lines on the level's end and the effects give the words, the view, the tables and the HUD's points the PAL table holds", () => {
  const { play, effects } = pal.motion;
  const words =
    /pair 12 letters "([^"]+)" where this disc's letters "([^"]+)", .*? pair 32 "([^"]+)" where this disc's letters "([^"]+)"/.exec(
      motion,
    );
  assert.ok(words, "motion.md has no PAL line on the end screen's pairs");
  assert.deepEqual(words.slice(1), [
    play.words.acid,
    objects.motion.play.words.acid,
    play.words.equal,
    objects.motion.play.words.equal,
  ]);
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the three angles step (−?\d+), (−?\d+) and (−?\d+) a frame \(.*?\) and the fourth (\d+) in the arcade and (\d+) on a level with no key/m,
      "the ending's view",
    ),
    [...play.view.angles, play.view.swing, play.view.bonus.swing],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the seven tables run (\d+), (\d+), (\d+), (\d+), (\d+), (\d+) and (\d+) frames/m,
      "the effects' tables",
    ),
    ["0", "1", "2", "3", "4", "8", "9"].map((k) => effects.tables[k].frames),
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the points lie on a screen (\d+) lines high \(.*?\): the clock's at (\d+) and (\d+) \(.*?\), the icons' at (\d+) and (\d+), (\d+) and (\d+), (\d+) and (\d+), (\d+) and (\d+) and (\d+) and (\d+) \(.*?\) and the teleport's at (\d+) and (\d+)/m,
      "the HUD's points",
    ),
    [play.screen.high, ...effects.hud.clock, ...effects.hud.fruit.flat(), ...effects.hud.teleport],
  );
  assert.deepEqual(
    said(
      motion,
      /^On the PAL disc the strengths are (\d+), \d+ and (\d+) and the steps (\d+), \d+ and (\d+)/m,
      "the flash",
    ),
    [
      effects.flash.teleport.from,
      effects.flash.bonus.from,
      effects.flash.teleport.step,
      effects.flash.bonus.step,
    ],
  );
});

test("tgi.md's and camera.md's PAL lines give the cycles, the flight and the screen as the PAL skins and table hold them", () => {
  const { cycles } = pal.skins;
  assert.deepEqual(
    said(
      tgi,
      /^On the PAL disc the fire's cycle runs (\d+) frames and the invisible block's shimmer (\d+) with a brightness cycle of (\d+)/m,
      "tgi.md's first set",
    ),
    [cycles.fire.frames.length, cycles.invisible.frames.length, cycles.invisible.level.length],
  );
  assert.deepEqual(
    said(
      tgi,
      /^On the PAL disc the swirl's eight frames run a (\d+)-frame cycle against (\d+)/m,
      "tgi.md's swirl",
    ),
    [cycles.bonus.frames.length, objects.skins.cycles.bonus.frames.length],
  );
  const { flight } = pal.motion.play;
  assert.deepEqual(
    said(
      camera,
      /^On the PAL disc the parameter steps 16 while it is under (\d+) and the slowing step starts at (\d+) \(.*?\), so it steps 16 to \d+, then \d+, \d+ and one less each frame, \d+ at the end, (\d+) steps from 0 to/m,
      "camera.md's fly-in",
    ),
    [flight.slow + 1, flight.first, flight.frames],
  );
  const { screen } = pal.motion.types["32"].lasts;
  assert.deepEqual(
    said(
      camera,
      /^On the PAL disc the idle phase steps \d+ a pass, the magnitude wanes by (\d+) and the stretch's phase steps (\d+)/m,
      "camera.md's screen",
    ),
    [screen.wane, screen.step],
  );
});
