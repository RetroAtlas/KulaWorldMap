// The hazards routine's work under and about the ball, in its order, the hit test after it, and
// the draw's part of the frame, the crumbling blocks breaking up.
import { REST, acrossOf, aloft, blockUnder, cellOf, faceUnder, place, progressOf } from "./ball.js";
import { cellKey, FACE_NORMAL } from "../format/lattice.js";
import { layHeading, markerCircuit, markerDestination, TANGENT } from "../viewer/data.js";
import { phaseField, pose } from "../viewer/motion.js";
import { fell } from "./world.js";

const FIRE = 1;
const ICE = 2;
const ACID = 4;
const PLATFORM = 5;
const CRUMBLING = 6;
const LASER = 8;
const BUTTON = 10;
const MOVING_SPIKES = 11;
const SPIKES = 12;
const ARROW = 28;
export const BALL = 30;
export const INVINCIBLE = 34;
// a crumbling block's type word
const WHOLE = 1;
const BROKEN = 2;
const BREAKING = 3;

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const within = (v, [low, high]) => v >= low && v <= high;
const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);
const differs = (a, b) => a.some((c, i) => c !== b[i]);
const station = (b) => ({ cell: blockUnder(b), face: faceUnder(b) });
const standingOf = (motion, kind) => motion.kinds[String(kind)].standing;

/** The death `cause` as a countdown, refused once the outcome stands, while a wait runs or the
    invincibility pill stands, or while the ending is this cause's own ending where it
    `overrides` another cause's ending; whether it took. */
export function die(live, out, cause, how = {}) {
  const { freeze = false, mark = false, kept = false, wait = null, overrides = false } = how;
  const w = live.words;
  const b = live.ball;
  const { play } = live.tables.motion;
  const code = play.ending[cause];
  const refused = overrides ? w.ending === code : w.wait !== 0 || w.pills[INVINCIBLE] >= 0;
  if (w.outcome || refused) return false;
  w.ending = code;
  w.wait = wait ?? play.wait[cause];
  if (freeze) w.frozen = 1;
  if (mark) w.dying = 1;
  if (!kept) {
    b.speed = 0;
    b.spinSpeed = 0;
  }
  out.push({ dying: { cause, wait: w.wait } });
  return true;
}

// The arrow under the ball, on the ground or in the air, lets the forward request stand along its
// way alone, said where the ball is at rest and no jump is asked, and ice makes the request,
// dropping a turn's request and the refusal the pad's reading said; the arrow's way, where one is
// under the ball.
function steered(live, out) {
  const w = live.words;
  const b = live.ball;
  let way = null;
  if (w.standing === ARROW) {
    const under = add(cellOf(b), b.n, -1);
    const m = (live.idx.markers.get(cellKey(...under)) ?? []).find((o) => o.face === faceUnder(b));
    if (m?.type === ARROW) {
      way = (layHeading(m) ?? TANGENT[m.face]).map((c) => c || 0);
      if (differs(b.h, way)) {
        if (b.forward && !b.wantJump && b.state === REST) out.push({ refused: "arrow" });
        b.forward = false;
      }
    }
  }
  if (w.standing === standingOf(live.tables.motion, ICE)) {
    b.forward = true;
    b.turn = 0;
    b.waiting = 0;
    const refused = out.findIndex((e) => e.refused);
    if (refused >= 0) out.splice(refused, 1);
  }
  return way;
}

// On the ground the cold grows on ice and is set back past its top, the heat cooling by the
// chill besides, and wanes off ice.
function chilled(live) {
  const w = live.words;
  const ice = live.tables.motion.kinds[String(ICE)];
  if (w.standing === ice.standing) {
    w.heat = Math.max(0, w.heat - ice.chill);
    w.cold += ice.cold.gain;
    if (w.cold > ice.cold.over) w.cold = ice.cold.back;
  } else w.cold = Math.max(0, w.cold - ice.cold.wane);
}

/** A lit beam in the ball's own cell, the arrow's and the ice's word on the requests, fire under
    the ball and the cooling off fire, the arrow's way kept while the ball is in the air over
    one, and on the ground acid and the ice's cold, in the routine's order. */
export function harms(live, out) {
  const w = live.words;
  const b = live.ball;
  const { motion } = live.tables;
  const laser = motion.kinds[String(LASER)].harm;
  if (w.cell === laser.cell && die(live, out, "laser")) w.heat = laser.heat;
  const way = steered(live, out);
  const fire = motion.kinds[String(FIRE)].heat;
  const guarded = w.pills[INVINCIBLE] >= 0;
  if (w.standing === standingOf(motion, FIRE)) {
    if (!aloft(b) && !guarded) w.heat += fire.burn;
    if (b.landed && !guarded) w.heat += fire.land;
    if (w.heat > fire.limit) die(live, out, "fire", { freeze: true });
  } else w.heat = Math.max(0, w.heat - fire.cool);
  if (aloft(b)) {
    if (way) w.way = way;
    return;
  }
  w.way = null;
  const acid = motion.kinds[String(ACID)].melt;
  w.melt = Math.min(w.melt, acid.top);
  if (w.standing === standingOf(motion, ACID) && die(live, out, "acid", { kept: true }))
    w.melt += acid.gain;
  chilled(live);
}

/** What grows while a death's countdown runs: the burning ball's swell and the acid's melt. */
export function counting(live) {
  const w = live.words;
  const { play, kinds } = live.tables.motion;
  if (w.ending === play.ending.fire) w.swell += kinds[String(FIRE)].heat.swell;
  if (w.ending === play.ending.acid) w.melt += kinds[String(ACID)].melt.gain;
}

/** The crumbling block under the ball on the ground: its points while its word is still whole,
    and the word written broken on every frame the ball stands there, whatever it held. */
export function broken(live) {
  const w = live.words;
  const b = live.ball;
  const entry = live.tables.motion.kinds[String(CRUMBLING)];
  if (w.standing !== entry.standing) return;
  const block = live.world.crumbling.get(cellKey(...add(cellOf(b), b.n, -1)));
  if (!block) return;
  if (block.type === WHOLE) w.score += entry.points;
  block.type = BROKEN;
}

/** The draw's part of the frame: a block broken under the ball breaks up, and a breaking block
    shrinks by the table's step a frame until its size goes negative, when it is gone from the
    lattice. */
export function crumble(live, out) {
  const { shrink } = live.tables.motion.kinds[String(CRUMBLING)];
  for (const [key, block] of live.world.crumbling) {
    if (block.type === BROKEN) {
      block.type = BREAKING;
      out.push({ broke: { key } });
    }
    if (block.type !== BREAKING) continue;
    block.size -= shrink;
    if (block.size >= 0) continue;
    fell(live.world, key);
    out.push({ fell: { key } });
  }
}

/** The spikes under the ball on the ground, the moving ones by the table's flag on the frame
    before this one, which is the frame the hazards read. */
export function spiked(live, out) {
  const w = live.words;
  const b = live.ball;
  if (w.standing === SPIKES) die(live, out, "spikes", { freeze: true, mark: true });
  if (w.standing !== MOVING_SPIKES) return;
  const entry = live.tables.motion.types[String(MOVING_SPIKES)];
  const { cell, face } = station(b);
  const m = (live.idx.markers.get(cellKey(...cell)) ?? []).find((o) => o.face === face);
  const deadly = entry.deadly[phaseField(m)];
  if (!deadly[(w.frame + deadly.length - 1) % deadly.length]) return;
  const wait = b.landed ? null : entry.harm.standing;
  die(live, out, "spikes", { freeze: true, mark: true, wait });
}

/** The boost button under the ball on the ground: from the roll's progress the self-roll's count
    is written on every frame, and from the fire's progress, or on the frame after a landing on
    the button, the launch: the count put at nothing, the jump and the roll asked, the turn
    dropped and the long jump's word armed where it is nothing, so the frame's intents start the
    forward jump as the long one. */
export function boosting(live, out) {
  const w = live.words;
  const b = live.ball;
  if (w.standing !== BUTTON) return;
  const { boost, arm } = live.tables.motion.types[String(BALL)].jump;
  if (b.progress >= boost.roll) w.rolled = boost.frames;
  if (b.progress < boost.fire && !b.landed) return;
  w.rolled = 0;
  b.wantJump = true;
  b.forward = true;
  b.turn = 0;
  if (!b.long) b.long = arm;
  const { cell, face } = station(b);
  out.push({ boosted: { key: cellKey(...cell), face } });
}

/** The ball's position as the game's words hold it: while it rides a platform, relative to the
    platform's position and biased by the table's block. */
function wordsOf(live) {
  const b = live.ball;
  if (!b.riding) return b.pos;
  const { home } = live.world.platforms.get(b.riding.key);
  const { bias } = live.tables.motion.kinds[String(PLATFORM)].ride;
  return b.pos.map((v, i) => v - home[i] + bias);
}

/** Where the captivator's point is at `frame`: a walker's position where one stands in its slot,
    else its home lifted along its face's normal as the frame draws it. */
function pointOf(live, c, frame) {
  const w = live.world.walkers.get(c.slot);
  if (w) return w.pos;
  const { lift } = pose(live.tables.motion, c.entry, c.m, frame, c.phase);
  return lift ? add(c.at, FACE_NORMAL[c.m.face], lift) : c.at;
}

/** The first captivator within its reach of the ball's position words as they stand, a walker
    where it has stepped to and any other entry where its bounce has lifted it on this frame,
    catches the ball, over any countdown but a catch's own countdown; the words of a ball riding
    a platform are relative to it, which puts it out of every captivator's reach. */
export function catching(live, out) {
  const pos = wordsOf(live);
  const { frame } = live.words;
  for (const c of live.world.captivators) {
    if (squared(pos, pointOf(live, c, frame)) > c.square) continue;
    die(live, out, "captivator", { freeze: true, mark: true, overrides: true });
    return;
  }
}

// Thrown as the progress word and the measure across both come within the band of the middle.
function throwing(live, out, m, at) {
  const w = live.words;
  const b = live.ball;
  const { band } = live.tables.motion.types[String(m.type)].throw;
  if (!within(b.progress, band) || !within(acrossOf(b), band)) return;
  w.marker = m.type;
  const circuit = markerCircuit(m);
  live.circuits.flip(circuit, w.frame);
  out.push({ threw: { key: at.key, face: at.face, circuit } });
}

// The count runs on the frames the ball stands within the band of an on teleporter, the wait
// held and the requests cleared, stands while the ball is off the band, and is dropped where the
// teleporter is off; the send lays the ball on the far face with its body as it stood within its
// frame.
function sending(live, out, m, at) {
  const w = live.words;
  const b = live.ball;
  const { send } = live.tables.motion.types[String(m.type)];
  const to = live.circuits.on(m) ? markerDestination(m, live.level) : null;
  if (!to) {
    w.send = -1;
    return;
  }
  if (!within(b.progress, send.band)) return;
  if (w.send < 0) {
    w.send = send.wait;
    out.push({ sending: { key: at.key, face: at.face } });
  }
  w.send -= 1;
  w.wait = send.hold;
  b.forward = false;
  b.wantJump = false;
  b.turn = 0;
  if (w.send >= 0) return;
  const from = station(b);
  const cell = [to.x, to.y, to.z];
  const far = live.world.devices.get(`${cellKey(...cell)}/${to.face}`);
  w.marker = m.type;
  place(b, cell, to.face, (far && layHeading(far)) ?? TANGENT[to.face], { kept: true });
  if (progressOf(b) > send.rearm[1]) w.marker = 0;
  out.push({ sent: { from, to: { cell, face: to.face } } });
}

/** The devices under the ball on the ground; in the air the marker is cleared with the count. */
export function devices(live, out) {
  const w = live.words;
  const b = live.ball;
  if (aloft(b)) {
    w.marker = 0;
    w.send = -1;
    return;
  }
  const { types } = live.tables.motion;
  const at = { key: cellKey(...blockUnder(b)), face: faceUnder(b) };
  const m = live.world.devices.get(`${at.key}/${at.face}`);
  const own = m && m.type === w.standing && w.marker !== m.type ? m : null;
  const entry = own && types[String(own.type)];
  if (entry?.throw) throwing(live, out, own, at);
  if (entry?.send) sending(live, out, own, at);
  else w.send = -1;
}

/** The marker cleared once the centre has left the middle by more than the device's reach. */
export function rearm(live) {
  const w = live.words;
  if (!w.marker) return;
  const b = live.ball;
  const entry = live.tables.motion.types[String(w.marker)];
  const band = (entry.throw ?? entry.send).rearm;
  if (!within(progressOf(b), band) || !within(acrossOf(b), band)) w.marker = 0;
}
