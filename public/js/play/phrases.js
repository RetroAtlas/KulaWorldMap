// What play says: every sentence the strip, the HUD and the live region say, composed from what
// each names.
import { counted, levelTitle, markerLabel, motionTable, theCircuit } from "../viewer/data.js";
import { DIRECTION_NAME, FACE_NAME } from "../format/lattice.js";
import { faceOf } from "./ball.js";
import { MODE, roundOf } from "./game.js";

export const REFUSED = {
  arrow: "The ball cannot roll off here: the arrow points another way.",
};
export const LAUNCHED = "Launched by the boost button.";
export const RIDING = "The ball rides the platform.";
export const NO_START = "The level has no start, so the ball stands on the first face it could.";
export const NOWHERE = "The level has no face the ball could stand on.";
export const OBJECTS_ON = "Objects turned on, for the ball.";
const VERDICT = {
  exit: "Out by the exit: the level is done.",
  hidden: "Out by the hidden exit: the level is done.",
  bonus: "Every block is marked: the level is done.",
};
export const DYING = {
  spikes: "On the spikes",
  fire: "Burnt",
  captivator: "Caught",
  acid: "In the acid",
  laser: "In the beam",
};
export const WOULD = {
  spikes: "been killed on the spikes",
  fire: "been burnt",
  captivator: "been caught",
  acid: "been dissolved in the acid",
  laser: "been killed in the beam",
  lost: "fallen off the level",
};
export const FORGIVEN = (name) => `Forgiven: the ball would have ${WOULD[name]}.`;
export const ENDED = "The level has ended";
const ROUND_DONE = "The round is done.";
const ROUND_LOST = "The round is lost.";
const PLAYER = (player) => `Player ${player + 1}`;
const POINT_TO = (player) => `The round is lost, a point to ${PLAYER(player)}.`;
const AFRESH = "The run starts afresh.";
const MATCH_AFRESH = "The match starts afresh.";
export const OPENED = "The last key is taken: the exits are open.";
export const BROKE = "The crumbling block breaks under the ball.";
export const GONE = (cell) => `The crumbling block at ${cell} is gone.`;
export const SENDING = "The teleporter is sending the ball.";
export const WEARING_OFF =
  "The sunglasses are wearing off: the invisible blocks are about to hide again.";
const KEYS_LEFT = "The keys left to take";
const BLOCKS_LEFT = "The blocks left to roll onto";
const AGAIN = "Space or Enter starts the level again.";
const AGAIN_PAD = "Space, Enter or a tap on the pad starts the level again.";
const ON = (title) => `Space or Enter goes on to ${title}.`;
const ON_PAD = (title) => `Space, Enter or a tap on the pad goes on to ${title}.`;
export const KEPT = "The way the ball has come is now the route.";
export const KEEPING = "The way the ball has come is now the route, and grows as the ball goes on.";
export const ROUTE_STANDS = "A route already stands; clear it to keep the walk.";
export const FOLLOWING = "Following the route; an arrow or Space takes the ball back.";
export const FOLLOWING_PAD = "Following the route; an arrow, Space or the pad takes the ball back.";
export const NO_FIRST_STOP = "The route's first stop has nothing to stand on.";
export const DONE_WHY = {
  end: "The route is done: the ball stands at its last stop.",
  leap: "The route leaps from here, which the ball cannot follow.",
  strayed: "The ball has left the route.",
};
export const LEFT_PLAY = "Left play.";
export const LEFT_PLAY_RESTORED = "Left play; the view is as it was.";

export const faceName = (v) => DIRECTION_NAME[faceOf(v)];

export const isFollowing = (text) => text === FOLLOWING || text === FOLLOWING_PAD;

const standing = (face, cell, h) =>
  `on the ${FACE_NAME[face]} of ${cell.join(",")}, facing ${faceName(h)}`;
export const LINE = (face, cell, h) => `Playing · ${standing(face, cell, h)}`;
export const STANDS = (face, cell, h) => `The ball stands ${standing(face, cell, h)}.`;
export const PLAYING = (l, face, cell, h) =>
  `Playing ${levelTitle(l)}. ${STANDS(face, cell, h)} The arrows roll and turn it, Esc leaves.`;
export const STARTED = (l, went, face, cell, h) =>
  `${went ? `On to ${levelTitle(l)}` : `${levelTitle(l)} again`}. ${STANDS(face, cell, h)}`;
export const PUT_ON = (face, cell) =>
  `The ball is put on the ${FACE_NAME[face]} of ${cell.join(",")}.`;
export const SENT = (face, cell) => `Sent to the ${FACE_NAME[face]} of ${cell.join(",")}.`;
export const AT = (cell, face) => `${cell.join(",")}, ${FACE_NAME[face]}`;
export const UNDERFOOT = (face, cell) => `${FACE_NAME[face]} of ${cell.join(",")}, now underfoot`;
export const TOOK = (m, points) =>
  points ? `${markerLabel(m)} taken, ${counted(points, "point")}.` : `${markerLabel(m)} taken.`;
export const TAKEN = (m) => `Taken: ${markerLabel(m)} on the ${FACE_NAME[m.face]}`;
export const THROWN = (circuit) => `Switch thrown: ${theCircuit(circuit)} turned over.`;
export const CLOCK_ROUND = (left) =>
  `The hourglass turns the clock round: ${counted(left, "second")} left.`;

/** A stop's sentence with what happened on the way to it, which a sentence of its own said
    mid-roll would lose to the stop's within the frame. */
export const noted = (notes, text) =>
  notes.length ? `${text}. ${notes.splice(0).join(" ")}` : text;

/** The name of the ending `code` in the table, or null. */
export function endingName(code) {
  const { ending } = motionTable().play;
  return Object.keys(ending).find((k) => ending[k] === code) ?? null;
}

/** The cause of the death whose countdown runs, or null. */
export function deathOf(w) {
  if (w.outcome || !w.ending) return null;
  const name = endingName(w.ending);
  return DYING[name] ? name : null;
}

/** A room's word for its ending `code`: the end screen's `word`, or the winner's where the match
    is won, and whether the round is done or lost, with whose point it is where a match is on. */
export function roomTold(code, word, settled) {
  const named = settled?.won ?? word;
  if (code > 0) return `${named} ${ROUND_DONE}`;
  return settled?.point == null ? `${named} ${ROUND_LOST}` : `${named} ${POINT_TO(settled.point)}`;
}

/** What the ending did to the run's total: the penalty taken or the points banked, the total,
    and where that is below nothing the game's word for its end. */
export function banked({ penalty, banked: points, total, over }, words) {
  const did = penalty
    ? `${counted(penalty, "point")} off the total`
    : `${counted(points, "point")} banked`;
  const sum = `${did}, ${counted(total, "point")} in all.`;
  return over ? `${sum} ${words.over} ${AFRESH}` : sum;
}

/** How the level ended: the end screen's word for the ending, or the map's for a way out, a
    room's with whether the round is done or lost, the points and the time left, and what the
    ending did to the run's total or, where the match is won, that it starts afresh. */
export function howEnded(code, w, settled, play) {
  const { clock, words } = play;
  const name = endingName(code);
  const seconds = Math.max(0, Math.floor(w.clock / clock.second));
  const room = w.mode === MODE.simon;
  const word = words[name] ?? `${ENDED}.`;
  const told = room ? roomTold(code, word, settled) : (VERDICT[name] ?? word);
  const how = `${told} ${counted(w.score, "point")}, ${counted(seconds, "second")} left.`;
  const did = settled && (room ? settled.won && MATCH_AFRESH : banked(settled, words));
  return did ? `${how} ${did}` : how;
}

/** What a key goes on to: the level the game loads next or this one again, the pad named while
    it shows. */
export const thenOn = (next, pad) =>
  next ? (pad ? ON_PAD : ON)(levelTitle(next)) : pad ? AGAIN_PAD : AGAIN;

/** The HUD's figures: the time, the keys or the blocks left with the title that says which, the
    points, and in a Simon room the round and its moves, with the match's turn and points where a
    match is on, else the run's total where a run is on. */
export function hudOf(w, game, match, play) {
  const out = {
    clock: `Time ${Math.max(0, Math.floor(w.clock / play.clock.second))}`,
    keys: w.bonus ? counted(w.unmarked, "block") : `Keys ${w.keys}`,
    keysTitle: w.bonus ? BLOCKS_LEFT : KEYS_LEFT,
    points: counted(w.score, "point"),
  };
  if (w.mode === MODE.simon) {
    const { round, moves } = roundOf(match);
    out.round = `Round ${round}`;
    out.moves = counted(moves, "move");
    if (game) {
      out.turn = `${PLAYER(match.turn)}'s turn`;
      out.match = `Match ${game.points.join(" : ")}`;
    }
  } else if (game) out.total = `Total ${game.total}`;
  return out;
}
