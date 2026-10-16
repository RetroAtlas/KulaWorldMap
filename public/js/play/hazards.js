// The hazards routine's work under and about the ball, in its order, and the hit test after it.
import { acrossOf, aloft, blockUnder, faceUnder, place, progressOf } from "./ball.js";
import { cellKey } from "../format/lattice.js";
import { layHeading, markerCircuit, markerDestination, TANGENT } from "../viewer/data.js";
import { phaseField } from "../viewer/motion.js";

const FIRE = 1;
const ACID = 4;
const LASER = 8;
const MOVING_SPIKES = 11;
const SPIKES = 12;
export const INVINCIBLE = 34;

const within = (v, [low, high]) => v >= low && v <= high;
const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);
const station = (b) => ({ cell: blockUnder(b), face: faceUnder(b) });
const standingOf = (motion, kind) => motion.kinds[String(kind)].standing;

/** The death `cause` as a countdown, refused once the outcome stands, while a wait runs or the
    invincibility pill stands, or while the ending is this cause's own where it `overrides`
    another's; whether it took. */
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

/** A lit beam in the ball's own cell, fire under it and the cooling off fire, and acid on the ground. */
export function harms(live, out) {
  const w = live.words;
  const b = live.ball;
  const { motion } = live.tables;
  const laser = motion.kinds[String(LASER)].harm;
  if (w.cell === laser.cell && die(live, out, "laser")) w.heat = laser.heat;
  const fire = motion.kinds[String(FIRE)].heat;
  const guarded = w.pills[INVINCIBLE] >= 0;
  if (w.standing === standingOf(motion, FIRE)) {
    if (!aloft(b) && !guarded) w.heat += fire.burn;
    if (b.landed && !guarded) w.heat += fire.land;
    if (w.heat > fire.limit) die(live, out, "fire", { freeze: true });
  } else w.heat = Math.max(0, w.heat - fire.cool);
  if (aloft(b)) return;
  const acid = motion.kinds[String(ACID)].melt;
  w.melt = Math.min(w.melt, acid.top);
  if (w.standing === standingOf(motion, ACID) && die(live, out, "acid", { kept: true }))
    w.melt += acid.gain;
}

/** What grows while a death's countdown runs: the burning ball's swell and the acid's melt. */
export function counting(live) {
  const w = live.words;
  const { play, kinds } = live.tables.motion;
  if (w.ending === play.ending.fire) w.swell += kinds[String(FIRE)].heat.swell;
  if (w.ending === play.ending.acid) w.melt += kinds[String(ACID)].melt.gain;
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

/** The first captivator within its reach of the ball's centre, a walker where it has stepped to,
    catches the ball, over any countdown but a catch's own. */
export function catching(live, out) {
  const { pos } = live.ball;
  const { walkers, captivators } = live.world;
  for (const c of captivators) {
    const at = walkers.get(c.slot)?.pos ?? c.at;
    if (squared(pos, at) > c.square) continue;
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
// teleporter is off.
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
  place(b, cell, to.face, (far && layHeading(far)) ?? TANGENT[to.face]);
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
