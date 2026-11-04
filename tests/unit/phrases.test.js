import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, objects, releases } from "./fixtures.js";
import { index, levelClock, setObjects } from "../../public/js/viewer/data.js";
import { setCurrent, setReleases } from "../../public/js/viewer/release.js";
import { end, startRun } from "../../public/js/play/rules.js";
import { conclude, startGame, startSimon } from "../../public/js/play/game.js";
import { banked, howEnded, hudOf, roomTold, thenOn } from "../../public/js/play/phrases.js";
import {
  ROOMS,
  TABLES,
  begin,
  circuits,
  counted,
  level,
  play,
  room,
  row,
  settings,
  start,
} from "./rules-level.js";

const AGAIN = "Space or Enter starts the level again.";

test("what a key goes on to names the level the game loads next, or this one again, and the pad while it shows", () => {
  const next = mapData.levels.find((l) => l.shown === "LEVEL 2");
  assert.equal(thenOn(null, false), AGAIN);
  assert.equal(thenOn(null, true), "Space, Enter or a tap on the pad starts the level again.");
  assert.equal(thenOn(next, false), "Space or Enter goes on to LEVEL 2.");
  assert.equal(thenOn(next, true), "Space, Enter or a tap on the pad goes on to LEVEL 2.");
});

/** A level of each form: the arcade's with a key far off, one with no key, and a hidden one. */
const forms = () => ({
  exit: level(row(10, 18), [start()]),
  bonus: level(row(10, 18), [start()], 99, false),
  hidden: level(row(10, 18), [start(), settings(objects.skins.hidden.type)]),
});

/** A run of `l` scoring `score`, ended by `code` over `game`: how it ended, in `table`'s words. */
function endedBy(l, code, score, game = null, table = play) {
  const live = begin(l, null, game);
  live.words.score = score;
  end(live, code, []);
  return howEnded(code, live.words, conclude(live), table);
}

/** The US table with the Japanese disc's words, which end in no mark. */
const japanese = () => ({
  ...play,
  words: releases.find((r) => r.id === "jp").objects.motion.play.words,
});

test("how the level ended gives the map's word for each way out and the end screen's for each death, with the points and the seconds left, a death past the arcade's mode scoring nothing", () => {
  const ways = {
    exit: "Out by the exit: the level is done.",
    bonus: "Every block is marked: the level is done.",
    hidden: "Out by the hidden exit: the level is done.",
  };
  const levels = forms();
  for (const [name, l] of Object.entries(levels))
    assert.equal(
      endedBy(l, play.ending[name], 1500),
      `${ways[name]} 1500 points, 99 seconds left.`,
      name,
    );
  for (const [name, code] of Object.entries(play.ending)) {
    if (code > 0) continue;
    const word = play.words[name];
    assert.equal(endedBy(levels.exit, code, 50), `${word} 50 points, 99 seconds left.`, name);
    assert.equal(endedBy(levels.bonus, code, 50), `${word} 0 points, 99 seconds left.`, name);
    assert.equal(endedBy(levels.hidden, code, 50), `${word} 0 points, 99 seconds left.`, name);
  }
  const run = begin(levels.exit);
  run.words.score = 1;
  run.words.clock = play.clock.second;
  end(run, play.ending.exit, []);
  assert.equal(
    howEnded(play.ending.exit, run.words, conclude(run), play),
    `${ways.exit} 1 point, 1 second left.`,
  );
});

test("with a run on, how the level ended adds the points banked or the penalty taken and the total, and the game's word where the total has gone below nothing", () => {
  const first = () => counted(forms().exit, 0, 0);
  assert.equal(
    endedBy(first(), play.ending.exit, 1500, startGame()),
    "Out by the exit: the level is done. 1500 points, 99 seconds left. 1500 points banked, 1500 points in all.",
  );
  const game = { ...startGame(), total: 1000 };
  assert.equal(
    endedBy(first(), play.ending.lost, 50, game),
    `${play.words.lost} 50 points, 99 seconds left. 100 points off the total, 900 points in all.`,
  );
  assert.equal(
    endedBy(first(), play.ending.lost, 50, startGame()),
    `${play.words.lost} 50 points, 99 seconds left. 100 points off the total, -100 points in all. ${play.words.over} The run starts afresh.`,
  );
});

test("what the ending did to the run's total: the points banked or the penalty taken, the total, and the game's word where it has gone below nothing", () => {
  const { words } = play;
  const did = (settled) => banked({ over: false, ...settled }, words);
  assert.equal(
    did({ penalty: 0, banked: 1500, total: 1500 }),
    "1500 points banked, 1500 points in all.",
  );
  assert.equal(did({ penalty: 0, banked: 1, total: 1 }), "1 point banked, 1 point in all.");
  assert.equal(
    did({ penalty: 800, banked: 0, total: 700 }),
    "800 points off the total, 700 points in all.",
  );
  assert.equal(
    did({ penalty: 800, banked: 0, total: -800, over: true }),
    `800 points off the total, -800 points in all. ${words.over} The run starts afresh.`,
  );
});

test("the game's word is closed with a full stop before the run starts afresh where it ends in a letter or a digit, and keeps the mark it ends in", () => {
  const did = (over) =>
    banked({ penalty: 800, banked: 0, total: -800, over: true }, { ...play.words, over });
  const sum = "800 points off the total, -800 points in all.";
  assert.equal(did("Game Over"), `${sum} Game Over. The run starts afresh.`);
  assert.equal(did("Game Over 2"), `${sum} Game Over 2. The run starts afresh.`);
  assert.equal(did("Game Over!"), `${sum} Game Over! The run starts afresh.`);
  assert.equal(did("Game Over."), `${sum} Game Over. The run starts afresh.`);
});

test("how the level ended closes the Japanese disc's word for a death with a full stop before the points, and keeps the mark the US word ends in", () => {
  const l = forms().exit;
  assert.equal(
    endedBy(l, play.ending.lost, 50, null, japanese()),
    "落ちた. 50 points, 99 seconds left.",
  );
  assert.equal(endedBy(l, play.ending.lost, 50), "FELL OFF! 50 points, 99 seconds left.");
});

test("a room's word says the round is done, or lost, with whose point it is where a match is on, and names the winner where the match is won", () => {
  const { exit, simon, won1 } = play.words;
  assert.equal(roomTold(play.ending.exit, exit, null), `${exit} The round is done.`);
  assert.equal(
    roomTold(play.ending.exit, exit, { point: null, won: null }),
    `${exit} The round is done.`,
  );
  assert.equal(roomTold(play.ending.simon, simon, null), `${simon} The round is lost.`);
  assert.equal(
    roomTold(play.ending.simon, simon, { point: 1, won: null }),
    `${simon} The round is lost, a point to Player 2.`,
  );
  assert.equal(
    roomTold(play.ending.simon, simon, { point: 0, won: won1 }),
    `${won1} The round is lost, a point to Player 1.`,
  );
});

test("a room's word is closed with a full stop before the round's verdict where it is the Japanese disc's, the winner's too, and the US words keep their marks", () => {
  const { exit, simon, won1 } = japanese().words;
  assert.equal(roomTold(play.ending.exit, exit, null), "良くできました. The round is done.");
  assert.equal(roomTold(play.ending.simon, simon, null), "間違えた. The round is lost.");
  assert.equal(
    roomTold(play.ending.simon, simon, { point: 0, won: won1 }),
    "1プレイヤーの勝ち. The round is lost, a point to Player 1.",
  );
  assert.equal(roomTold(play.ending.exit, play.words.exit, null), "Well Done! The round is done.");
  assert.equal(
    roomTold(play.ending.simon, play.words.simon, { point: 0, won: play.words.won1 }),
    "Player 1 Won! The round is lost, a point to Player 1.",
  );
});

test("in a Simon room how the level ended is the room's word with the points and the seconds left, and a match won starts afresh", () => {
  const { exit, simon, won2 } = play.words;
  assert.equal(
    endedBy(room(), play.ending.exit, 0, startSimon(ROOMS)),
    `${exit} The round is done. 0 points, 99 seconds left.`,
  );
  assert.equal(
    endedBy(room(), play.ending.simon, 0, startSimon(ROOMS)),
    `${simon} The round is lost, a point to Player 2. 0 points, 99 seconds left.`,
  );
  assert.equal(
    endedBy(room(), play.ending.simon, 0),
    `${simon} The round is lost. 0 points, 99 seconds left.`,
  );
  // the first room, the other player a point short of the table's points, loses the match on the
  // first player's wrong move
  const first = { ...room(), index: 0 };
  const game = { ...startSimon(ROOMS), points: [0, ROOMS.points] };
  assert.equal(
    endedBy(first, play.ending.simon, 0, game),
    `${won2} The round is lost, a point to Player 2. 0 points, 99 seconds left. The match starts afresh.`,
  );
});

test("the HUD's figures count the time, the keys or the blocks left and the points, with a run's total, and in a Simon room the round and its moves, with the match's turn and points", () => {
  const keyed = begin(forms().exit);
  const figures = {
    clock: "Time 99",
    keys: "Keys 1",
    keysTitle: "The keys left to take",
    points: "0 points",
  };
  assert.deepEqual(hudOf(keyed.words, null, null, play), figures);
  assert.deepEqual(hudOf(keyed.words, { ...startGame(), total: 1500 }, null, play), {
    ...figures,
    total: "Total 1500",
  });
  const bonus = begin(forms().bonus);
  bonus.words.score = 50;
  bonus.words.clock = play.clock.second - 1;
  assert.deepEqual(hudOf(bonus.words, null, null, play), {
    clock: "Time 0",
    keys: "9 blocks",
    keysTitle: "The blocks left to roll onto",
    points: "50 points",
  });
  const played = begin(room());
  const room1 = {
    clock: "Time 99",
    keys: "Keys 0",
    keysTitle: "The keys left to take",
    points: "0 points",
    round: "Round 1",
    moves: "2 moves",
  };
  assert.deepEqual(hudOf(played.words, null, played.match, play), room1);
  const match = begin(room(), null, startSimon(ROOMS));
  match.game.points = [1, 0];
  assert.deepEqual(hudOf(match.words, match.game, match.match, play), {
    ...room1,
    turn: "Player 1's turn",
    match: "Match 1 : 0",
  });
});

test("under a release's rules the HUD counts the time as that disc's HUD does, one more than the whole seconds the clock holds in its ticks, 83 as a 99-second level starts on the US disc, 100 on the PAL disc and 120 on the Japanese, and 1 as the clock runs out, while the ending's seconds left are the whole seconds alone, and with no rules the table's seconds count with nothing added, and once the clock has ticked the HUD reads the figure the level line gives, 83, 99 and 119", (t) => {
  t.after(() => {
    setObjects({});
    setReleases([]);
  });
  const l = forms().exit;
  const under = (rules) => startRun(l, index(l), { ...TABLES, rules }, circuits());
  const exit = "Out by the exit: the level is done.";
  assert.deepEqual(
    releases.map((r) => {
      const { words } = under(r.rules);
      return [
        hudOf(words, null, null, play, r.rules).clock,
        howEnded(play.ending.exit, words, null, play, r.rules),
      ];
    }),
    [
      ["Time 83", `${exit} 0 points, 82 seconds left.`],
      ["Time 100", `${exit} 0 points, 99 seconds left.`],
      ["Time 120", `${exit} 0 points, 119 seconds left.`],
    ],
  );
  setObjects(objects);
  setReleases(releases);
  assert.deepEqual(
    releases.map((r) => {
      setCurrent(r.id);
      const { words } = under(r.rules);
      words.clock -= play.clock.tick;
      return [hudOf(words, null, null, play, r.rules).clock, levelClock(l)];
    }),
    [
      ["Time 83", 83],
      ["Time 99", 99],
      ["Time 119", 119],
    ],
  );
  const us = releases[0].rules;
  const out = under(us);
  for (const clock of [0, -2]) {
    out.words.clock = clock;
    assert.equal(hudOf(out.words, null, null, play, us).clock, "Time 1");
    assert.equal(
      howEnded(play.ending.time, out.words, null, play, us),
      `${play.words.time} 0 points, 0 seconds left.`,
    );
  }
  out.words.clock = us.clock.shown;
  assert.equal(hudOf(out.words, null, null, play, us).clock, "Time 2");
  assert.equal(
    howEnded(play.ending.time, out.words, null, play, us),
    `${play.words.time} 0 points, 1 second left.`,
  );
  const none = under(null);
  assert.equal(hudOf(none.words, null, null, play).clock, "Time 99");
  assert.equal(
    howEnded(play.ending.exit, none.words, null, play),
    `${exit} 0 points, 99 seconds left.`,
  );
});
