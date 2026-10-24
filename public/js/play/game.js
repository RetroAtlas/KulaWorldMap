// The game's words over a run: the mode a level is played in and where it stands in the game's
// count, the points settled as a level ends and the slot the game loads next, and the Simon rooms'
// match, its rounds, its two players' turns and points, the room it goes on to and the moves the
// rooms read from the pad, pack and hold to the sequence.
import { LEFT, PAD, REST, RIGHT, turning } from "./ball.js";
import { simonRoom } from "../viewer/skins.js";

export const UNASKED = { forward: false, jump: false, turn: 0 };

/** The level's mode word, as the loader numbers a level: the arcade's mode, a level with no key or
    a hidden level. */
export const FORM = { arcade: 0, bonus: 1, hidden: 2 };

/** The game's mode word, as the menu that starts a game sets it: the arcade's mode, or the Simon
    rooms' mode, which the Copycat pack is played in. */
export const MODE = { arcade: 0, simon: 1 };
export const SIMON = MODE.simon;

/** A game as its loop starts one: the total, the bank, the pickups' fruit word, the fruit
    counted and the slot kept, all at nothing. */
export const startGame = () => ({ total: 0, bank: 0, fruit: 0, count: 0, kept: 0 });

/** The Simon rooms' game as the menu that starts the mode leaves it: the players' points at
    nothing, the word the loop flips before a reset at the menu's value, and the total at
    nothing, which the game's end puts below it. */
export const startSimon = ({ players, starter }) => ({
  total: 0,
  points: Array(players).fill(0),
  starter,
});

/** A match of the Simon rooms as its reset leaves it: the sequence filled with the empty
    halfword, the table's store long, the count of moves at the table's first, the round at
    nothing and the turn the player the reset is given. */
export const startMatch = ({ store, empty, first }, turn = 0) => ({
  sequence: Array(store).fill(empty),
  count: first,
  round: 0,
  turn,
});

/** The round the match is in and the moves it asks, as the strip counts them from one: the round
    word counted on, and the moves at the indices up to the count of moves. */
export const roundOf = ({ round, count }) => ({ round: round + 1, moves: count + 1 });

/** The other player than `player`'s, the next taken round the players. */
export const other = (player, players) => (player + 1) % players;

/** The game's mode word: the Simon rooms' mode for a room, else the arcade's mode. */
export const modeOf = (l, { skins }) => (simonRoom(skins, l) ? SIMON : MODE.arcade);

/** The game the level is played in: `game` carried on where one stands, else a fresh one, the
    Simon rooms' game for a room and the arcade's game for a level the game counts, or null for a
    level it counts nowhere, a draft. */
export function gameOf(l, tables, game = null) {
  if (modeOf(l, tables) === SIMON) return game ?? startSimon(tables.motion.play.simon);
  return stationOf(l, tables) ? (game ?? startGame()) : null;
}

/** Where the level stands in the game's count, or null where the game counts no such level, a
    draft or a Simon room among them: its world's place among the worlds, its slot in its pack and
    whether the pack is the world's finals. */
export function stationOf(l, { worlds }) {
  const place = worlds.indexOf(l.theme);
  const final = l.pack === `/${l.theme}/${l.theme}FI.PAK`;
  if (place < 0 || (!final && l.pack !== `/${l.theme}/${l.theme}.PAK`)) return null;
  return { place, slot: l.index, final };
}

// The level's count from one: the world's place times the levels a world plus the slot, the
// finals counted by their own levels a world.
const countOf = ({ place, slot, final }, { levels, finals }) =>
  (final ? finals : levels) * place + slot + 1;

/** The level's number as the game counts it: its count, the finals numbered on from the worlds'
    levels. */
export const numberOf = (station, { points, next }) =>
  countOf(station, points) + (station.final ? next.worlds * next.slots : 0);

/** The step the loop runs on the frame an ending stands, with or without a game: a bad ending on
    a level past the arcade's mode scores nothing, and then where a game stands its points are
    settled, as `settle` has them, or in the Simon rooms the match's point given and its end
    judged, as `scored` has them, or nothing where none does. */
export function conclude(live) {
  const w = live.words;
  if (w.outcome < 0 && w.form !== FORM.arcade) w.score = 0;
  if (!live.game) return null;
  return w.mode === SIMON ? scored(live.game, live) : settle(live.game, live);
}

/** The Simon rooms' step on the frame an ending stands, over `game`, the mode's words, in the
    loop's order: a failed round, any outcome below nothing, gives a point to the other player than
    the turn's player, and then, where the room the game loads next is the first and a player's
    points are past the table's points with the outcome below nothing, the end screen names the
    winner, or the draw where the two are equal, and the game is ended as the menu code ends it,
    the total put below nothing. The player given the point, or null, and the screen's word, or
    null. */
export function scored(game, live) {
  const w = live.words;
  const { simon, words } = live.tables.motion.play;
  const failed = w.outcome < 0;
  const point = failed ? other(live.match.turn, simon.players) : null;
  if (failed) game.points[point] += 1;
  const won = failed && roomAfter(game, live) === 0 && game.points.some((p) => p > simon.points);
  if (!won) return { point, won: null };
  game.total = simon.over;
  const [first, second] = game.points;
  return { point, won: first > second ? words.won1 : second > first ? words.won2 : words.equal };
}

// The next-level routine's branch for the rooms, which a failed round alone runs: where the word
// the loop flips is 1 the slot counts on by one, and back to the first room at the worlds' count,
// so each room is played twice over.
function roomAfter(game, live) {
  const { next } = live.tables.motion.play;
  const { index } = live.level;
  if (live.words.outcome >= 0 || game.starter !== 1) return index;
  return index + 1 >= next.worlds ? 0 : index + 1;
}

/** The points routine over `game`, the run's words, in its order: a death on an ordinary level
    takes the level's score and its penalty, so much a level of its count held at the most, off
    the total and puts the bank back into the pickups' word, and any other ending counts a fruit
    where the pickups' word differs from the bank, banks the word and adds the score to the
    total. What the ending did to the total, the total, and whether a total below nothing has
    ended the game. */
export function settle(game, live) {
  const w = live.words;
  const { points } = live.tables.motion.play;
  const died = w.outcome < 0;
  let penalty = 0;
  let banked = 0;
  if (died && w.form === FORM.arcade) {
    const count = countOf(stationOf(live.level, live.tables), points);
    penalty = w.score + Math.min(points.most, points.each * count);
    game.total -= penalty;
    w.fruit = game.bank;
  } else {
    if (w.fruit !== game.bank) game.count += 1;
    game.bank = w.fruit;
    banked = w.score;
    game.total += banked;
  }
  game.fruit = w.fruit;
  return { penalty, banked, total: game.total, over: game.total < 0 };
}

/** The slot the game loads after the level's ending, over `game`, the run's words, as the pack and
    the index of a level, or null where the game ends or the level is one the game does not count,
    a final or a draft among them. A Simon room goes on to the room its branch has: the same room
    after a round done, or after a failed round where the word the loop flips is 0, the next room
    where it is 1, and the first room past the last. An ordinary level with a way out counts the
    slot on, and where the bank holds every fruit clears both fruit words, keeps the slot after
    and opens the bonus level of the finished slot's third, the hidden exit keeping the slot after
    the same way and opening the hidden level; a level past the arcade's mode, whatever its
    outcome, goes back to the slot kept, or where the bank has filled meanwhile clears both words
    and opens the bonus level of the kept slot's third. The slot after the last ordinary level is
    `count`, the pack's levels, wherever it comes up, and a slot at the count or past it is the
    next world's first level. */
export function nextOf(game, live, count) {
  if (live.words.mode === SIMON) return { pack: live.level.pack, index: roomAfter(game, live) };
  const station = stationOf(live.level, live.tables);
  if (!station || station.final || game.total < 0) return null;
  const { ending, next } = live.tables.motion.play;
  const { bonus, hidden, slots, third, fruit } = next;
  const w = live.words;
  const full = () => (game.bank & fruit) === fruit;
  const clear = () => Object.assign(game, { bank: 0, fruit: 0 });
  const after = (s) => (s + 1 === slots ? count : s + 1);
  let { slot, place } = station;
  if (w.form === FORM.arcade) {
    if (w.outcome === ending.hidden) {
      game.kept = after(slot);
      slot = hidden;
    } else if (w.outcome > 0) {
      if (full()) {
        clear();
        game.kept = after(slot);
        slot = bonus[Math.trunc(slot / third) % bonus.length];
      } else slot = after(slot);
    }
  } else if (slot < count) {
    if (full()) {
      clear();
      const { kept } = game;
      slot = kept <= third ? bonus[0] : kept <= 2 * third ? bonus[1] : bonus[2];
    } else slot = game.kept;
  }
  if (slot >= count) {
    slot = 0;
    place += 1;
  }
  if (place >= next.worlds) return null;
  const world = live.tables.worlds[place];
  return { pack: `/${world}/${world}.PAK`, index: slot };
}

/** The Simon rooms' reading of the pad, one frame, over `w`, the level's words, whose `latch` is
    the three words the bouncy pill shares, by `simon`, the table's entry, with `b` the ball as
    the last frame left it: null while a verdict stands, nothing read. Else the idle count grows
    on a frame at rest with no turn running and goes back to nothing on any other; Up held sets
    the Up latch and Cross held the Cross latch, the count grows while either stands, and as it
    reaches the table's latch the jump's request takes Cross's latch and the roll's request Up's
    latch, with the count and both latches cleared, which they are on every frame instead while
    the idle count is under the first gate; while it is under the second gate the three requests
    are nothing, and from it a held Left asks a turn of 1 and a held Right one of -1, each
    putting the idle count back to nothing. */
export function copied(w, pad, simon, b) {
  if (w.verdict) return null;
  const latch = w.latch;
  const [first, second] = simon.idle;
  w.idle = b.state === REST && !turning(b) ? w.idle + 1 : 0;
  if (pad & PAD.up) latch.up = 1;
  if (pad & PAD.cross) latch.cross = 1;
  if (latch.up || latch.cross) latch.count += 1;
  const asked = { ...UNASKED };
  if (latch.count >= simon.latch) {
    asked.jump = latch.cross === 1;
    asked.forward = latch.up === 1;
    Object.assign(latch, { up: 0, cross: 0, count: 0 });
  }
  if (w.idle < first) Object.assign(latch, { up: 0, cross: 0, count: 0 });
  if (w.idle < second) return { ...UNASKED };
  if (pad & PAD.left) {
    asked.turn = LEFT;
    w.idle = 0;
  }
  if (pad & PAD.right) {
    asked.turn = RIGHT;
    w.idle = 0;
  }
  return asked;
}

/** The move the Simon rooms pack from the ball's requests as the pad's reading left them, the
    table's bits added, or nothing where no request is left. */
export const moveOf = ({ turn, forward, wantJump }, bits) =>
  (turn === RIGHT ? bits.right : 0) +
  (turn === LEFT ? bits.left : 0) +
  (forward ? bits.forward : 0) +
  (wantJump ? bits.jump : 0);

/** The move held to the match's sequence at the words' index, as the rooms hold it: where the
    halfword there is empty the move is stored, and where the index is the match's count of
    moves the verdict is the sequence done; where it holds a move, one unlike it is the verdict
    wrong; and the index counts on either way. */
export function stored(w, match, move, { empty, verdict }) {
  const held = match.sequence[w.index];
  if (held === empty) {
    match.sequence[w.index] = move;
    if (w.index === match.count) w.verdict = verdict.done;
  } else if (held !== move) w.verdict = verdict.wrong;
  w.index += 1;
}
