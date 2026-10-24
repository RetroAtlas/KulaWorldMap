// The way the ball has come and the planner handshake: the stops the ball has come to and the
// steps between them, the rests a forgiven ball goes back to, the planner's route taken up from
// the stop the ball stands on or from the first and let go, and the way handed to the planner as
// the route.
import { adoptCourse, current } from "../viewer/chrome/course.js";
import { toast } from "../viewer/ui/toast.js";
import { stepBetween, tangent } from "../viewer/walk.js";
import { REST, blockUnder, faceUnder } from "./ball.js";
import { courseDriver } from "./drive.js";
import { DONE_WHY, KEEPING, KEPT, NO_FIRST_STOP, ROUTE_STANDS, isFollowing } from "./phrases.js";
import { routing, say, status } from "./strip.js";

const sameStation = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);

/** One more stop on the way the ball has come, joined by the roll or the jump that reaches it, or by
    a leap where it was sent or where no step does. */
export function walked(live, station, leap = false) {
  const w = live.walk;
  const last = w.stations.at(-1);
  if (last && sameStation(last, station)) return;
  if (last) w.steps.push(leap ? null : stepBetween(last, station));
  w.stations.push(station);
  if (live.keeping) hand(live);
}

// The last two stations the ball rested on, the heading the latest at each.
export function rested(live, b) {
  const rests = live.rests;
  const last = rests.at(-1);
  if (last && sameStation(last, b.rest)) rests[rests.length - 1] = b.rest;
  else live.rests = [...rests.slice(-1), b.rest];
}

/** Where a forgiven ball is put back: its last rest, or the rest before where it died at rest
    there. */
export function refuge(live) {
  const b = live.run.ball;
  const here = { cell: blockUnder(b), face: faceUnder(b) };
  const [earlier, last] = live.rests.length > 1 ? live.rests.slice(-2) : [null, b.rest];
  return earlier && b.state === REST && sameStation(last, here) ? earlier : b.rest;
}

/** Where following `route` begins: the stop the ball stands on, short of the last, with no station
    to put it on, else the first, with the station to put it on there, or the error where the first
    has nothing to stand on. */
export function followFrom(live, route) {
  const b = live.run.ball;
  const here = { cell: blockUnder(b), face: faceUnder(b) };
  const last = route.stations.length - 1;
  const i = route.stations.findIndex((s, j) => j < last && sameStation(s, here));
  if (i >= 0) return { i, at: null };
  const [first] = route.stations;
  if (!live.probe.standable(first.cell, first.face)) return { error: NO_FIRST_STOP };
  const h = tangent(first.face, route.steps[0]?.k ?? 0);
  return { i: 0, at: { cell: first.cell, face: first.face, h } };
}

/** The driver set on `route` from its stop `i`. */
export function drive(live, route, i) {
  live.driver = courseDriver(route, i);
  live.route = route;
  routing(live);
}

/** The driver let go, the keys and the pad having the ball. */
export function retire(live) {
  if (!live?.driver) return;
  live.driver = null;
  live.route = null;
  if (isFollowing(live.status)) status(live, null);
  routing(live);
}

/** The driver done, and why said. */
export function followed(live, why) {
  retire(live);
  status(live, DONE_WHY[why]);
  say(DONE_WHY[why]);
}

/** Hand the way the ball has come to the planner as the route: whether it took it, and where
    another route stands keeping ends. */
function hand(live) {
  const { stations, steps } = live.walk;
  const c = {
    stations: [...stations],
    steps: [...steps],
    marks: new Set([0, stations.length - 1]),
  };
  // the hand-over's own course-changed is not a change from the planner's side
  live.kept = null;
  const taken = adoptCourse(c);
  if (taken) live.kept = current();
  else live.keeping = false;
  routing(live);
  return taken;
}

/** Keep: pressed, the way the ball has come is the route and grows under the ball
    as it goes on; pressed again, the route stays as it is; once the level has ended the whole
    way is handed over once. */
export function keep(live) {
  if (!live) return;
  if (live.keeping) {
    live.keeping = false;
    routing(live);
    return;
  }
  if (!hand(live)) {
    status(live, ROUTE_STANDS);
    return;
  }
  live.keeping = !live.ended;
  const text = live.keeping ? KEEPING : KEPT;
  say(text);
  toast(text);
  routing(live);
}
