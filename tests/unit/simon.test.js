import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { index } from "../../public/js/viewer/data.js";
import { HOP, JUMP, LEFT, PAD, REST, ROLLING, blockUnder } from "../../public/js/play/ball.js";
import { end, frame, heeds, restart } from "../../public/js/play/rules.js";
import {
  conclude,
  gameOf,
  nextOf,
  roundOf,
  scored,
  startGame,
  startSimon,
  stationOf,
} from "../../public/js/play/game.js";
import {
  ASKS,
  ROOMS,
  SIMON,
  TABLES,
  TOP,
  UP,
  begin,
  counted,
  done,
  fresh,
  level,
  motion,
  other,
  play,
  rolled,
  room,
  row,
  second,
  start,
  steps,
  until,
} from "./rules-level.js";

/** Run the level through the start's dead frames, so the next frame is the first that reads the
    pad. */
const opened = (live, pad = 0) => steps(live, play.start.wait - 1, pad);

// --- the Simon match ----------------------------------------------------------------------

const COPYCAT = objects.skins.copycat;

/** The room at `slot` of the Copycat pack, in the world of its place. */
const roomAt = (slot) => ({ ...room(), theme: TABLES.worlds[slot], index: slot });

/** Left held from rest through the turn it asks, a move unlike a roll stored before it, to the
    outcome. */
function wrong(live) {
  for (let i = 1; i <= ROOMS.idle[1]; i++) frame(live, PAD.left);
  assert.ok(live.ball.ramp, "the turn asked");
  assert.ok(
    until(live, 0, (l) => l.words.outcome !== 0, 80),
    "and judged",
  );
}

test("a Simon room opens on a match as the reset leaves it, the sequence filled with the empty halfword, the count of moves at the first, the round at nothing and the turn the first player's turn, with the idle count, the index and the verdict at nothing, a match handed in has its round counted on and its count by the grow, and a level outside the rooms holds no match", () => {
  const live = begin(room());
  const w = live.words;
  assert.equal(w.mode, SIMON);
  assert.deepEqual(live.match, {
    sequence: Array(ROOMS.store).fill(ROOMS.empty),
    count: ROOMS.first,
    round: 0,
    turn: 0,
  });
  assert.equal(live.match.sequence.length, ROOMS.store);
  assert.deepEqual([w.idle, w.index, w.verdict], [0, 0, 0]);
  const carried = fresh();
  const next = begin(room(), null, null, carried);
  assert.equal(next.match, carried, "the match handed in is the run's");
  assert.equal(carried.count, ROOMS.first + ROOMS.grow, "its count of moves counted on");
  assert.equal(carried.round, 1, "and its round");
  assert.equal(begin(level(row(10, 18), [start()])).match, null);
  assert.equal(begin(level(row(10, 18), [start()]), null, null, fresh()).match, null);
});

test("in a Simon room Up held from rest asks the roll on the fifth frame of the latch, which runs from the third frame at rest, the ball rolls one block as one move held at the index 0, a second roll is the move at the index 1, the count of moves, which is the verdict done, and the verdict becomes the exit's ending with the rooms' wait as the ball rests, the pad unread from that frame until the wait's last frame, which reads it", () => {
  const live = begin(room());
  const w = live.words;
  const b = live.ball;
  const { idle, bits, verdict } = ROOMS;
  opened(live, PAD.up);
  assert.deepEqual([w.idle, w.latch.count], [0, 0], "nothing read through the start's wait");
  for (let i = 1; i < ASKS; i++) {
    frame(live, PAD.up);
    assert.equal(w.idle, i, `the idle count on frame ${i} at rest`);
    assert.equal(w.latch.count, Math.max(0, i - idle[0] + 1), `the latch's count on frame ${i}`);
    assert.equal(w.latch.up, i >= idle[0] ? 1 : 0, `Up's latch on frame ${i}`);
    assert.equal(b.state, REST);
    assert.equal(b.forward, false);
  }
  frame(live, PAD.up);
  assert.equal(w.idle, ASKS);
  assert.equal(b.state, ROLLING, "the roll asked as the latch's count reaches the latch");
  assert.deepEqual(w.latch, { up: 0, cross: 0, count: 0 }, "the count and both latches cleared");
  assert.deepEqual([w.index, live.match.sequence[0], w.verdict], [1, bits.forward, 0]);
  assert.ok(until(live, PAD.up, (l) => l.ball.state === REST, 40));
  assert.deepEqual(blockUnder(b), [17, 17, 17], "one block");
  assert.deepEqual(
    [w.idle, w.index, b.forward],
    [0, 1, false],
    "the roll's frames read no request",
  );
  for (let i = 1; i < ASKS; i++) {
    frame(live, PAD.up);
    assert.equal(b.state, REST);
  }
  frame(live, PAD.up);
  assert.equal(b.state, ROLLING);
  assert.deepEqual(live.match.sequence.slice(0, 3), [bits.forward, bits.forward, ROOMS.empty]);
  assert.deepEqual([w.index, w.verdict], [2, verdict.done], "the move at the count of moves");
  assert.equal(w.index, live.match.count + 1);
  assert.ok(until(live, PAD.up, (l) => l.ball.state === REST, 40));
  assert.deepEqual(
    [w.verdict, w.ending, w.wait],
    [verdict.done, 0, 0],
    "standing through the roll",
  );
  assert.equal(heeds(live), false, "the frame that judges the verdict reads no pad");
  assert.deepEqual(frame(live, PAD.up), []);
  assert.deepEqual(
    [w.ending, w.wait, w.verdict],
    [play.ending.exit, play.wait.simon - 1, 0],
    "the ending set and its wait counted on the same frame, the verdict cleared",
  );
  assert.deepEqual(
    [w.idle, w.latch.count, b.forward],
    [ASKS, 0, false],
    "the idle count as the verdict's frame left it, nothing read since",
  );
  for (let i = 0; i < play.wait.simon - 2; i++) assert.deepEqual(frame(live, PAD.up), []);
  assert.equal(w.outcome, 0);
  assert.deepEqual(frame(live, PAD.up), [
    { ended: { code: play.ending.exit, score: 0, clock: 99 * play.clock.second } },
  ]);
  assert.equal(w.outcome, play.ending.exit);
  assert.deepEqual(
    [w.idle, w.latch, w.index],
    [ASKS + 1, { up: 1, cross: 0, count: 1 }, 2],
    "the wait's last frame read Up, which set its latch and made no move",
  );
});

test("the frame a round's wait runs out reads the pad as any wait's last frame does, the idle count as the verdict's frame left it, so a Left held then is a turn and a move held to the sequence, carried into the next round with the count grown", () => {
  const live = begin(room());
  const w = live.words;
  const { bits, verdict, grow, first, empty } = ROOMS;
  opened(live);
  rolled(live);
  rolled(live);
  assert.deepEqual([w.index, w.verdict, w.idle], [2, verdict.done, ASKS]);
  frame(live, PAD.left);
  assert.deepEqual([w.ending, w.wait, w.verdict], [play.ending.exit, play.wait.simon - 1, 0]);
  for (let i = 0; i < play.wait.simon - 2; i++) assert.deepEqual(frame(live, PAD.left), []);
  assert.deepEqual([w.wait, w.idle, w.index], [1, ASKS, 2], "nothing read through the wait");
  assert.equal(heeds(live), true, "the frame the wait runs out on reads the pad");
  const events = frame(live, PAD.left);
  assert.ok(events.some((e) => e.ended?.code === play.ending.exit));
  assert.equal(w.outcome, play.ending.exit);
  assert.deepEqual([w.idle, w.index], [0, 3], "the turn asked and held as the third move");
  assert.deepEqual(live.match.sequence.slice(0, 4), [bits.forward, bits.forward, bits.left, empty]);
  const next = restart(live);
  assert.equal(next.match, live.match, "the match carried");
  assert.equal(next.match.count, first + grow);
  assert.deepEqual(next.match.sequence.slice(0, 4), [bits.forward, bits.forward, bits.left, empty]);
});

test("in a Simon room Cross held within the latch's five frames joins Up's roll as the forward jump, one move of the two bits, and Cross alone is the hop, one move of the jump's bit", () => {
  const live = begin(room());
  const w = live.words;
  const { idle, bits } = ROOMS;
  opened(live);
  for (let i = 1; i < ASKS; i++) frame(live, i >= idle[0] + 2 ? PAD.up | PAD.cross : PAD.up);
  assert.deepEqual([w.latch.up, w.latch.cross], [1, 1]);
  frame(live, PAD.up | PAD.cross);
  assert.equal(live.ball.state, JUMP, "the forward jump");
  assert.deepEqual([w.index, live.match.sequence[0]], [1, bits.forward + bits.jump]);
  const hop = begin(room());
  opened(hop);
  for (let i = 1; i <= ASKS; i++) frame(hop, PAD.cross);
  assert.equal(hop.ball.state, HOP);
  assert.deepEqual([hop.words.index, hop.match.sequence[0]], [1, bits.jump]);
});

test("in a Simon room a held Left turns the ball on the sixth frame at rest, putting the idle count back to nothing, and again on the sixth frame after the turn ends, each a move of the left's bit, and Right held with it is the turn right", () => {
  const live = begin(room());
  const w = live.words;
  const b = live.ball;
  const { idle, bits, verdict } = ROOMS;
  const { frames } = motion.types["30"].quarter;
  opened(live);
  for (let i = 1; i < idle[1]; i++) {
    frame(live, PAD.left);
    assert.equal(w.idle, i);
    assert.equal(b.turn, 0);
    assert.equal(b.ramp, null);
  }
  assert.deepEqual(frame(live, PAD.left), [{ turned: LEFT }]);
  assert.deepEqual([w.idle, w.index, live.match.sequence[0]], [0, 1, bits.left]);
  for (let i = 1; i < frames; i++) {
    assert.ok(b.ramp, `the turn runs on frame ${i} after`);
    frame(live, PAD.left);
    assert.equal(w.idle, 0, "no frame at rest while the turn runs");
  }
  assert.equal(b.ramp, null, "the turn over");
  for (let i = 1; i < idle[1]; i++) {
    frame(live, PAD.left);
    assert.equal(w.idle, i);
  }
  assert.deepEqual(frame(live, PAD.left), [{ turned: LEFT }]);
  assert.deepEqual(live.match.sequence.slice(0, 2), [bits.left, bits.left]);
  assert.deepEqual([w.index, w.verdict], [2, verdict.done]);
  const right = begin(room());
  opened(right);
  for (let i = 1; i < idle[1]; i++) frame(right, PAD.left | PAD.right);
  assert.deepEqual(frame(right, PAD.left | PAD.right), [{ turned: -LEFT }]);
  assert.equal(right.match.sequence[0], bits.right);
});

test("a done round carries the match into the room started again with the count of moves grown, so the next round replays the moves stored and adds two, a move unlike the one stored is the verdict wrong and the rooms' own ending, nothing is read while a verdict stands, and the room that follows an ending not above nothing opens on the match reset", () => {
  const { bits, verdict, grow, first, empty } = ROOMS;
  const live = begin(room());
  opened(live);
  rolled(live);
  rolled(live);
  assert.equal(live.words.verdict, verdict.done);
  assert.ok(until(live, 0, (l) => l.words.outcome !== 0, 60));
  assert.equal(live.words.outcome, play.ending.exit);
  const match = live.match;
  const second = restart(live);
  assert.equal(second.match, match, "the match carried");
  assert.equal(match.count, first + grow);
  assert.deepEqual([second.words.idle, second.words.index, second.words.verdict], [0, 0, 0]);
  assert.deepEqual(match.sequence.slice(0, 4), [bits.forward, bits.forward, empty, empty]);
  opened(second);
  rolled(second);
  assert.deepEqual([second.words.index, second.words.verdict], [1, 0], "the first move replayed");
  rolled(second);
  assert.deepEqual([second.words.index, second.words.verdict], [2, 0], "and the second");
  rolled(second);
  assert.deepEqual([second.words.index, second.words.verdict], [3, 0], "a third stored");
  rolled(second);
  assert.deepEqual([second.words.index, second.words.verdict], [4, verdict.done]);
  assert.deepEqual(match.sequence.slice(0, 5), Array(4).fill(bits.forward).concat(empty));
  assert.ok(until(second, 0, (l) => l.words.outcome !== 0, 60));
  const third = restart(second);
  assert.equal(third.match, match);
  assert.equal(match.count, first + 2 * grow);
  opened(third);
  const w = third.words;
  const b = third.ball;
  for (let i = 1; i <= ROOMS.idle[1]; i++) frame(third, PAD.left);
  assert.ok(b.ramp, "the turn asked");
  assert.deepEqual([w.index, w.verdict], [1, verdict.wrong]);
  assert.equal(match.sequence[0], bits.forward, "the sequence as it was");
  // nothing is read while the verdict stands: Up held through the turn sets no latch and the
  // idle count stays where the turn put it
  while (b.ramp) {
    frame(third, PAD.up);
    assert.deepEqual(
      [w.idle, w.latch.count, w.latch.up, b.forward],
      [0, 0, 0, false],
      "nothing read",
    );
  }
  assert.equal(b.state, REST);
  assert.equal(heeds(third), false);
  frame(third, PAD.up);
  assert.deepEqual([w.ending, w.wait, w.verdict], [play.ending.simon, play.wait.simon - 1, 0]);
  assert.ok(until(third, PAD.up, (l) => l.words.outcome !== 0, 60));
  assert.equal(w.outcome, play.ending.simon);
  assert.equal(w.index, 1);
  const fourth = restart(third);
  assert.notEqual(fourth.match, match, "the match reset after the wrong move");
  assert.deepEqual(fourth.match, fresh());
  opened(fourth);
  rolled(fourth);
  assert.equal(fourth.match.sequence[0], bits.forward);
  end(fourth, play.ending.lost, []);
  const fifth = restart(fourth);
  assert.deepEqual(fifth.match, fresh(), "and after a death");
});

test("in a Simon room a roll asked without a jump toward an edge beside a neighbour is dropped before the move is packed, so nothing is held and the index stands, while the forward jump asked there is a move", () => {
  const live = begin(room([...row(10, 18), [18, 10, 17]]), {
    cell: [17, 10, 17],
    face: TOP,
    h: UP,
  });
  const w = live.words;
  const { bits, empty, latch } = ROOMS;
  opened(live);
  let events = [];
  for (let i = 1; i <= ASKS; i++) events = frame(live, PAD.up);
  assert.deepEqual(events, [{ refused: "edge" }]);
  assert.equal(live.ball.state, REST);
  assert.deepEqual([w.index, live.match.sequence[0], w.idle], [0, empty, ASKS]);
  for (let i = 1; i <= latch; i++) frame(live, PAD.up | PAD.cross);
  assert.equal(live.ball.state, JUMP);
  assert.deepEqual([w.index, live.match.sequence[0]], [1, bits.forward + bits.jump]);
});

test("a room with no game plays alone: a round done carries the match on with the round counted and the count grown, a wrong move resets it to the first round, and nothing is scored or picked", () => {
  const live = begin(roomAt(3));
  assert.equal(live.game, null);
  assert.deepEqual(roundOf(live.match), { round: 1, moves: 2 });
  opened(live);
  done(live);
  assert.equal(conclude(live), null, "nothing to settle");
  const next = restart(live);
  assert.equal(next.match, live.match, "the match carried");
  assert.deepEqual(roundOf(next.match), { round: 2, moves: 4 });
  assert.equal(next.game, null);
  opened(next);
  wrong(next);
  assert.equal(next.words.outcome, play.ending.simon);
  assert.equal(conclude(next), null);
  const again = restart(next);
  assert.notEqual(again.match, next.match, "the match reset");
  assert.deepEqual(roundOf(again.match), { round: 1, moves: 2 });
  assert.equal(again.game, null);
});

test("with a game the first room from the map's entry opens a match as the menu does: the word the menu set flipped and given as the turn, the first player's turn, the round the first with two moves to make and the players' points at nothing, and the game a level is played in is the rooms' game for a room, the arcade's game for a level the game counts, a final among them, and none for a draft", () => {
  const game = startSimon(ROOMS);
  assert.deepEqual(game, { total: 0, points: [0, 0], starter: ROOMS.starter });
  const live = begin(roomAt(0), null, game);
  assert.equal(live.game, game);
  assert.equal(game.starter, other(ROOMS.starter), "the word flipped");
  assert.equal(live.match.turn, game.starter);
  assert.equal(live.match.turn, 0, "the first player opens");
  assert.deepEqual(roundOf(live.match), { round: 1, moves: 2 });
  assert.deepEqual(game.points, [0, 0]);
  assert.deepEqual(gameOf(roomAt(4), TABLES), startSimon(ROOMS));
  assert.equal(gameOf(roomAt(4), TABLES, game), game, "a game carried on");
  const arcade = counted(level(row(10, 18), [start()]), 0, 3);
  assert.deepEqual(gameOf(arcade, TABLES), startGame());
  assert.deepEqual(Object.keys(startGame()), ["total", "bank", "fruit", "count", "kept"]);
  assert.deepEqual(gameOf(counted(level(row(10, 18), [start()]), 0, 1, true), TABLES), startGame());
  assert.equal(
    gameOf({ ...level(row(10, 18), [start()]), pack: "/DRAFT/DRAFT.PAK" }, TABLES),
    null,
  );
  const marked = {
    ...level(row(10, 18), [start()], 99, false),
    pack: "/DRAFT/DRAFT.PAK",
    simon: true,
  };
  assert.deepEqual(
    gameOf(marked, TABLES),
    startSimon(ROOMS),
    "a draft marked a room plays the rooms' game",
  );
  assert.equal(stationOf(marked, TABLES), null, "and stands nowhere in the count");
});

test("a round done passes the turn as the verdict is judged, gives no point, picks the same room and restarts it with the round counted on, the count grown by the table's grow, the index at nothing and the sequence kept, the flipped word standing", () => {
  const game = startSimon(ROOMS);
  const live = begin(roomAt(2), null, game);
  opened(live);
  done(live);
  assert.equal(live.match.turn, 1, "the turn passed");
  assert.deepEqual(conclude(live), { point: null, won: null });
  assert.deepEqual(game.points, [0, 0]);
  assert.deepEqual(nextOf(game, live, 10), { pack: COPYCAT, index: 2 });
  const match = live.match;
  const next = restart(live);
  assert.equal(next.match, match);
  assert.deepEqual(roundOf(match), { round: 2, moves: 4 });
  assert.equal(match.turn, 1);
  assert.equal(game.starter, 0, "no flip on a round done");
  assert.deepEqual([next.words.index, next.words.verdict, next.words.idle], [0, 0, 0]);
  assert.deepEqual(match.sequence.slice(0, 3), [
    ROOMS.bits.forward,
    ROOMS.bits.forward,
    ROOMS.empty,
  ]);
  assert.equal(next.game, game);
});

test("a failed round gives the other player than the turn's player a point and resets the match with the flipped word as the turn: the same room again where the word was 0, the second player opening, and the next room where it was 1, the first player opening, a death a failed round too", () => {
  const game = startSimon(ROOMS);
  const first = begin(roomAt(0), null, game);
  opened(first);
  done(first);
  const next = restart(first);
  assert.equal(next.match.turn, 1, "the second player replays");
  opened(next);
  wrong(next);
  assert.equal(next.words.outcome, play.ending.simon);
  assert.deepEqual(conclude(next), { point: 0, won: null }, "a point to the first player");
  assert.deepEqual(game.points, [1, 0]);
  assert.deepEqual(nextOf(game, next, 10), { pack: COPYCAT, index: 0 }, "the same room");
  const again = restart(next);
  assert.notEqual(again.match, next.match);
  assert.equal(game.starter, 1, "the word flipped");
  assert.equal(again.match.turn, 1, "the second player opens the second match");
  assert.deepEqual(roundOf(again.match), { round: 1, moves: 2 });
  assert.equal(again.game, game, "the game carried, its points standing");
  // the second match: the opener falls off, which fails the round and gives the first player a point
  end(again, play.ending.lost, []);
  assert.deepEqual(conclude(again), { point: 0, won: null });
  assert.deepEqual(game.points, [2, 0]);
  const pick = nextOf(game, again, 10);
  assert.deepEqual(pick, { pack: COPYCAT, index: 1 }, "the next room");
  const third = restart(again, null, { level: roomAt(pick.index), idx: index(roomAt(pick.index)) });
  assert.equal(third.level.index, 1);
  assert.equal(game.starter, 0);
  assert.equal(third.match.turn, 0, "the first player opens the next room");
  assert.deepEqual(roundOf(third.match), { round: 1, moves: 2 });
});

test("the rooms step on from each room's second match alone and wrap to the first after the tenth room's second match", () => {
  const rooms = play.next.worlds;
  for (let slot = 0; slot < rooms; slot++) {
    const firstMatch = begin(roomAt(slot), null, startSimon(ROOMS));
    end(firstMatch, play.ending.lost, []);
    assert.deepEqual(nextOf(firstMatch.game, firstMatch, 10), { pack: COPYCAT, index: slot });
    const secondMatch = begin(roomAt(slot), null, second());
    assert.equal(secondMatch.game.starter, 1);
    end(secondMatch, play.ending.lost, []);
    assert.deepEqual(nextOf(secondMatch.game, secondMatch, 10), {
      pack: COPYCAT,
      index: (slot + 1) % rooms,
    });
  }
});

test("the winner is named once the rooms have come round to the first with a player past the table's points and the outcome below nothing, Equal Time! where both are, and the game ends as a total below nothing, so the next load starts the match afresh with the points at nothing; it is not named on a round done, in another room, under the points or past them in a room that is not the last", () => {
  const last = play.next.worlds - 1;
  const { words } = play;
  const won = (points, code = play.ending.lost) => {
    const live = begin(roomAt(last), null, second(points));
    end(live, code, []);
    return { game: live.game, live, settled: conclude(live) };
  };
  // the second player opens the second match and fails, so the first player takes the point
  let { game, live, settled } = won([ROOMS.points, 2]);
  assert.deepEqual(game.points, [ROOMS.points + 1, 2]);
  assert.deepEqual(settled, { point: 0, won: words.won1 });
  assert.equal(game.total, ROOMS.over);
  assert.ok(game.total < 0, "the game's end");
  assert.deepEqual(nextOf(game, live, 10), { pack: COPYCAT, index: 0 });
  const next = restart(live, null, { level: roomAt(0), idx: index(roomAt(0)) });
  assert.notEqual(next.game, game, "a fresh game");
  assert.deepEqual(next.game, { total: 0, points: [0, 0], starter: 0 });
  assert.equal(next.match.turn, 0, "the first player opens");
  assert.deepEqual(roundOf(next.match), { round: 1, moves: 2 });
  ({ game, settled } = won([2, ROOMS.points + 2]));
  assert.deepEqual(settled, { point: 0, won: words.won2 });
  ({ game, settled } = won([ROOMS.points, ROOMS.points + 1]));
  assert.deepEqual(game.points, [ROOMS.points + 1, ROOMS.points + 1]);
  assert.deepEqual(settled, { point: 0, won: words.equal });
  // a round done names no winner and keeps the game on
  ({ game, settled } = won([ROOMS.points + 3, 0], play.ending.exit));
  assert.deepEqual(settled, { point: null, won: null });
  assert.equal(game.total, 0);
  // under the points the game goes on
  ({ game, settled } = won([ROOMS.points - 1, 1]));
  assert.deepEqual(game.points, [ROOMS.points, 1]);
  assert.deepEqual(settled, { point: 0, won: null });
  assert.equal(game.total, 0);
  // past the points in a room whose branch picks another room than the first
  const mid = begin(roomAt(4), null, second([ROOMS.points + 3, 0]));
  end(mid, play.ending.lost, []);
  assert.deepEqual(scored(mid.game, mid), { point: 0, won: null });
  assert.equal(mid.game.total, 0);
  assert.deepEqual(nextOf(mid.game, mid, 10), { pack: COPYCAT, index: 5 });
});
