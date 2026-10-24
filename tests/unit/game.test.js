import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, objects } from "./fixtures.js";
import {
  FORM,
  conclude,
  end,
  nextOf,
  numberOf,
  restart,
  settle,
  startGame,
  stationOf,
} from "../../public/js/play/rules.js";
import {
  COUNT,
  TABLES,
  begin,
  counted,
  level,
  picked,
  play,
  row,
  settings,
  start,
  steps,
} from "./rules-level.js";

/** The pack and the index of the level at `slot` of the world at `place`. */
const slotted = (place, slot) => ({
  pack: `/${TABLES.worlds[place]}/${TABLES.worlds[place]}.PAK`,
  index: slot,
});

test("a level's number is its world's place times the levels a world plus its slot plus one, a final's number twice the place plus the slot plus 151, as every shipped title has it, and a draft or a Simon room stands nowhere in the count", () => {
  const station = (place, slot, final = false) => ({ place, slot, final });
  assert.equal(numberOf(station(1, 1), play), 17);
  assert.equal(numberOf(station(2, 3), play), 34);
  assert.equal(numberOf(station(0, 1, true), play), 152);
  let titled = 0;
  for (const l of mapData.levels) {
    const m = /^(LEVEL|FINAL) (\d+)$/.exec(l.shown ?? "");
    if (!m) continue;
    const at = stationOf(l, TABLES);
    assert.ok(at, l.shown);
    assert.equal(at.final, m[1] === "FINAL", l.shown);
    // the finals are titled from one and numbered on from the worlds' levels
    const on = at.final ? play.next.worlds * play.next.slots : 0;
    assert.equal(numberOf(at, play), Number(m[2]) + on, l.shown);
    titled += 1;
  }
  assert.equal(titled, TABLES.worlds.length * (play.points.levels + play.points.finals));
  const hidden = mapData.levels.find((l) => l.pack === "/HIRO/HIRO.PAK" && l.index === 18);
  assert.deepEqual(stationOf(hidden, TABLES), { place: 0, slot: 18, final: false });
  assert.equal(stationOf({ theme: "HIRO", pack: "/DRAFT/DRAFT.PAK", index: 0 }, TABLES), null);
  assert.equal(stationOf({ theme: "HIRO", pack: objects.skins.copycat, index: 0 }, TABLES), null);
});

test("a way out banks the level's score and the pickups' fruit word, counting a fruit where the word has a bit the bank has not, and the word is carried into the level's next run", () => {
  const game = startGame();
  assert.deepEqual(game, { total: 0, bank: 0, fruit: 0, count: 0, kept: 0 });
  const live = begin(counted(level(row(10, 18), [start()]), 0, 0), null, game);
  live.words.score = 1500;
  live.words.fruit = 2;
  end(live, play.ending.exit, []);
  assert.deepEqual(settle(game, live), { penalty: 0, banked: 1500, total: 1500, over: false });
  assert.deepEqual(game, { total: 1500, bank: 2, fruit: 2, count: 1, kept: 0 });
  const again = begin(counted(level(row(10, 18), [start()]), 0, 1), null, game);
  assert.equal(again.words.fruit, 2, "the pickups' word as the game carries it");
  again.words.score = 250;
  end(again, play.ending.hidden, []);
  assert.deepEqual(settle(game, again), { penalty: 0, banked: 250, total: 1750, over: false });
  assert.deepEqual(
    game,
    { total: 1750, bank: 2, fruit: 2, count: 1, kept: 0 },
    "no new bit, no fruit counted",
  );
  again.words.fruit = 3;
  end(again, play.ending.exit, []);
  settle(game, again);
  assert.deepEqual(game, { total: 2000, bank: 3, fruit: 3, count: 2, kept: 0 });
});

test("a death on an ordinary level takes the score and the penalty off the total, so much a level of its count held at the most, and puts the bank back into the pickups' word", () => {
  const { each, most } = play.points;
  const game = { total: 20000, bank: 1, fruit: 3, count: 1, kept: 0 };
  const one = begin(counted(level(row(10, 18), [start()]), 0, 0), null, game);
  assert.equal(one.words.fruit, 3);
  one.words.score = 250;
  end(one, play.ending.lost, []);
  assert.deepEqual(settle(game, one), {
    penalty: 250 + each,
    banked: 0,
    total: 20000 - 250 - each,
    over: false,
  });
  assert.deepEqual(game, { total: 20000 - 250 - each, bank: 1, fruit: 1, count: 1, kept: 0 });
  assert.equal(one.words.fruit, 1, "the bank is put back into the pickups' word");
  // LEVEL 100, the first whose count's worth reaches the most
  const hundred = begin(counted(level(row(10, 18), [start()]), 6, 9), null, game);
  assert.equal(numberOf(stationOf(hundred.level, TABLES), play), 100);
  assert.equal(each * 100, most);
  hundred.words.score = 1000;
  end(hundred, play.ending.spikes, []);
  let total = game.total - 1000 - most;
  assert.deepEqual(settle(game, hundred), { penalty: 1000 + most, banked: 0, total, over: false });
  // LEVEL 150 costs no more than the most and its score
  const last = begin(counted(level(row(10, 18), [start()]), 9, 14), null, game);
  assert.equal(numberOf(stationOf(last.level, TABLES), play), 150);
  end(last, play.ending.time, []);
  total -= most;
  assert.deepEqual(settle(game, last), { penalty: most, banked: 0, total, over: false });
  // FINAL 2 counts as the second level, not the 152nd
  const final = begin(counted(level(row(10, 18), [start()]), 0, 1, true), null, game);
  assert.equal(numberOf(stationOf(final.level, TABLES), play), 152);
  final.words.score = 500;
  end(final, play.ending.fire, []);
  total -= 500 + 2 * each;
  assert.deepEqual(settle(game, final), { penalty: 500 + 2 * each, banked: 0, total, over: false });
});

test("the ending's step with a game: a death on a level with no key or on a hidden level scores nothing and takes nothing off the total, banking the fruit word as a way out does", () => {
  const game = { total: 3000, bank: 0, fruit: 0, count: 0, kept: 0 };
  const none = begin(counted(level(row(10, 18), [start()], 99, false), 0, 15), null, game);
  assert.equal(none.words.form, FORM.bonus);
  none.words.score = 150;
  none.words.fruit = 4;
  end(none, play.ending.time, []);
  assert.deepEqual(conclude(none), { penalty: 0, banked: 0, total: 3000, over: false });
  assert.equal(none.words.score, 0, "the level's score is left at nothing");
  assert.deepEqual(game, { total: 3000, bank: 4, fruit: 4, count: 1, kept: 0 });
  const hidden = begin(
    counted(level(row(10, 18), [start(), settings(objects.skins.hidden.type)]), 0, 18),
    null,
    game,
  );
  assert.equal(hidden.words.form, FORM.hidden);
  hidden.words.score = 2500;
  end(hidden, play.ending.lost, []);
  assert.deepEqual(conclude(hidden), { penalty: 0, banked: 0, total: 3000, over: false });
  assert.equal(hidden.words.score, 0);
  assert.deepEqual(game, { total: 3000, bank: 4, fruit: 4, count: 1, kept: 0 });
  // a way out on either banks what it scored
  const out = begin(counted(level(row(10, 18), [start()], 99, false), 0, 16), null, game);
  out.words.score = 150;
  end(out, play.ending.bonus, []);
  assert.deepEqual(conclude(out), { penalty: 0, banked: 150, total: 3150, over: false });
  assert.equal(out.words.score, 150);
  // the points routine alone clears nothing: the clear belongs to the step
  const alone = begin(counted(level(row(10, 18), [start()], 99, false), 0, 15), null, game);
  alone.words.score = 150;
  end(alone, play.ending.time, []);
  settle(game, alone);
  assert.equal(alone.words.score, 150);
});

test("the ending's step with no game: a death on a level with no key ends with the score at nothing, one on a keyed level keeps it, and with a game a keyed level's death takes the penalty through the step", () => {
  const { each } = play.points;
  // a level with no key marks the block under the start as it opens, and its clock runs out
  const none = begin(level(row(10, 18), [start()], 1, false));
  assert.equal(none.game, null);
  steps(none, play.clock.second);
  assert.equal(none.words.outcome, play.clock.out);
  assert.equal(none.words.score, play.bonus.block);
  assert.equal(conclude(none), null);
  assert.equal(none.words.score, 0);
  const hidden = begin(level(row(10, 18), [start(), settings(objects.skins.hidden.type)]));
  assert.equal(hidden.words.form, FORM.hidden);
  hidden.words.score = 2500;
  end(hidden, play.ending.lost, []);
  assert.equal(conclude(hidden), null);
  assert.equal(hidden.words.score, 0);
  const keyed = begin(level(row(10, 18), [start()]));
  assert.equal(keyed.words.form, FORM.arcade);
  keyed.words.score = 250;
  end(keyed, play.ending.lost, []);
  assert.equal(conclude(keyed), null);
  assert.equal(keyed.words.score, 250);
  // a way out on a level with no key keeps what it scored
  const out = begin(level(row(10, 18), [start()], 99, false));
  out.words.score = 150;
  end(out, play.ending.bonus, []);
  assert.equal(conclude(out), null);
  assert.equal(out.words.score, 150);
  const game = startGame();
  const run = begin(counted(level(row(10, 18), [start()]), 0, 0), null, game);
  run.words.score = 250;
  end(run, play.ending.lost, []);
  assert.deepEqual(conclude(run), {
    penalty: 250 + each,
    banked: 0,
    total: -(250 + each),
    over: true,
  });
  assert.equal(run.words.score, 250);
});

test("a total below nothing after a death ends the game, which starts afresh at nothing as the level is left, and a total at nothing or above carries on", () => {
  const { each } = play.points;
  const game = startGame();
  const live = begin(counted(level(row(10, 18), [start()]), 0, 0), null, game);
  live.words.fruit = 1;
  end(live, play.ending.lost, []);
  assert.deepEqual(settle(game, live), { penalty: each, banked: 0, total: -each, over: true });
  const next = restart(live);
  assert.notEqual(next.game, game);
  assert.deepEqual(next.game, { total: 0, bank: 0, fruit: 0, count: 0, kept: 0 });
  assert.equal(next.words.fruit, 0);
  const kept = { total: 0, bank: 2, fruit: 2, count: 1 };
  const on = restart(begin(counted(level(row(10, 18), [start()]), 0, 0), null, kept));
  assert.equal(on.game, kept);
  assert.equal(on.words.fruit, 2);
  assert.equal(restart(begin(level(row(10, 18), [start()]))).game, null, "a run with no game");
});

test("an ordinary level with a way out leads to the slot after and a death to the level itself, and the fifteenth leads to the next world's first level", () => {
  const game = startGame();
  assert.deepEqual(picked(game, 0, 3, play.ending.exit), slotted(0, 4));
  assert.deepEqual(game, startGame(), "nothing kept and nothing cleared");
  assert.deepEqual(picked(game, 0, 3, play.ending.lost), slotted(0, 3));
  assert.deepEqual(picked(game, 0, 3, play.ending.time), slotted(0, 3));
  assert.deepEqual(picked(game, 0, 14, play.ending.exit), slotted(1, 0));
  assert.deepEqual(picked(game, 3, 14, play.ending.exit), slotted(4, 0));
  assert.deepEqual(picked(game, 3, 14, play.ending.spikes), slotted(3, 14));
});

test("a way out with every fruit banked clears both fruit words, keeps the slot after and opens the bonus level of the finished slot's third, the fifteenth keeping the pack's count so that its bonus level leads to the next world's first level", () => {
  const { bonus, fruit } = play.next;
  const full = () => ({ total: 100, bank: fruit, fruit, count: 5, kept: 0 });
  let game = full();
  assert.deepEqual(picked(game, 0, 4, play.ending.exit), slotted(0, bonus[0]));
  assert.deepEqual(game, { total: 100, bank: 0, fruit: 0, count: 5, kept: 5 });
  game = full();
  assert.deepEqual(picked(game, 0, 0, play.ending.exit), slotted(0, bonus[0]));
  assert.equal(game.kept, 1);
  game = full();
  assert.deepEqual(picked(game, 0, 9, play.ending.exit), slotted(0, bonus[1]));
  assert.equal(game.kept, 10);
  game = full();
  assert.deepEqual(picked(game, 0, 5, play.ending.exit), slotted(0, bonus[1]));
  assert.equal(game.kept, 6);
  game = full();
  assert.deepEqual(picked(game, 2, 14, play.ending.exit), slotted(2, bonus[2]));
  assert.equal(game.kept, COUNT);
  // the bonus level goes back to the slot kept, the count, which is the next world's first level
  assert.deepEqual(picked(game, 2, bonus[2], play.ending.bonus, { keyed: false }), slotted(3, 0));
  // a bank one fruit short keeps the words and leads to the slot after
  game = { total: 100, bank: fruit - 1, fruit: fruit - 1, count: 4, kept: 0 };
  assert.deepEqual(picked(game, 0, 4, play.ending.exit), slotted(0, 5));
  assert.deepEqual(game, { total: 100, bank: fruit - 1, fruit: fruit - 1, count: 4, kept: 0 });
});

test("the hidden exit keeps the slot after and opens the hidden level, whatever the bank, and the hidden level goes back to the slot kept whatever its outcome", () => {
  const { hidden } = play.next;
  const game = { total: 0, bank: 3, fruit: 3, count: 2, kept: 0 };
  assert.deepEqual(picked(game, 0, 7, play.ending.hidden), slotted(0, hidden));
  assert.deepEqual(game, { total: 0, bank: 3, fruit: 3, count: 2, kept: 8 });
  assert.deepEqual(picked(game, 0, hidden, play.ending.exit, { hidden: true }), slotted(0, 8));
  assert.deepEqual(picked(game, 0, hidden, play.ending.lost, { hidden: true }), slotted(0, 8));
  assert.deepEqual(game, { total: 0, bank: 3, fruit: 3, count: 2, kept: 8 });
  // from the fifteenth the slot kept is the count, so the hidden level leads to the next world
  assert.deepEqual(picked(game, 0, 14, play.ending.hidden), slotted(0, hidden));
  assert.equal(game.kept, COUNT);
  assert.deepEqual(picked(game, 0, hidden, play.ending.exit, { hidden: true }), slotted(1, 0));
});

test("a bonus level, whatever its outcome, goes back to the slot kept, or where the bank has filled meanwhile clears both words and opens the bonus level of the kept slot's third", () => {
  const { bonus, fruit } = play.next;
  const game = { total: 0, bank: 1, fruit: 1, count: 1, kept: 5 };
  for (const code of [play.ending.bonus, play.ending.time, play.ending.lost])
    assert.deepEqual(picked(game, 1, bonus[0], code, { keyed: false }), slotted(1, 5), `${code}`);
  assert.deepEqual(game, { total: 0, bank: 1, fruit: 1, count: 1, kept: 5 });
  const filled = (kept) => ({ total: 0, bank: fruit, fruit, count: 5, kept });
  const from = (kept, at, code) => picked(filled(kept), 1, at, code, { keyed: false });
  assert.deepEqual(from(5, bonus[0], play.ending.bonus), slotted(1, bonus[0]));
  assert.deepEqual(from(6, bonus[0], play.ending.time), slotted(1, bonus[1]));
  assert.deepEqual(from(10, bonus[1], play.ending.lost), slotted(1, bonus[1]));
  assert.deepEqual(from(11, bonus[1], play.ending.bonus), slotted(1, bonus[2]));
  assert.deepEqual(from(COUNT, bonus[2], play.ending.bonus), slotted(1, bonus[2]));
  const g = filled(8);
  assert.deepEqual(
    picked(g, 1, bonus[0], play.ending.bonus, { keyed: false }),
    slotted(1, bonus[1]),
  );
  assert.deepEqual(g, { total: 0, bank: 0, fruit: 0, count: 5, kept: 8 }, "both words cleared");
});

test("the last world's fifteenth level ends the game, and a final, a draft and a total below nothing give no level", () => {
  const game = startGame();
  const last = TABLES.worlds.length - 1;
  assert.deepEqual(picked(game, last, 13, play.ending.exit), slotted(last, 14));
  assert.equal(picked(game, last, 14, play.ending.exit), null);
  // its bonus level, reached with the count kept, leads past the last world too
  const kept = { ...startGame(), kept: COUNT };
  assert.equal(picked(kept, last, play.next.bonus[2], play.ending.bonus, { keyed: false }), null);
  assert.equal(picked(kept, last, play.next.hidden, play.ending.lost, { hidden: true }), null);
  assert.equal(picked(game, 0, 1, play.ending.exit, { final: true }), null);
  const draft = begin({
    ...level(row(10, 18), [start()]),
    theme: "HIRO",
    pack: "/DRAFT/DRAFT.PAK",
    index: 0,
  });
  end(draft, play.ending.exit, []);
  assert.equal(nextOf(startGame(), draft, COUNT), null);
  const broke = { total: -1, bank: 0, fruit: 0, count: 0, kept: 0 };
  assert.equal(picked(broke, 0, 3, play.ending.exit), null);
});
