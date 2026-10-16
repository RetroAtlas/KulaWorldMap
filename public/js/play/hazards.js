// The devices under the ball, in the hazards routine's order, and the marker that keeps one
// from acting twice in a visit.
import { acrossOf, aloft, blockUnder, faceUnder, place, progressOf } from "./ball.js";
import { cellKey } from "../format/lattice.js";
import { layHeading, markerCircuit, markerDestination, TANGENT } from "../viewer/data.js";

const within = (v, [low, high]) => v >= low && v <= high;
const station = (b) => ({ cell: blockUnder(b), face: faceUnder(b) });

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
