// The ball's contact with what stands about it: the pickups within reach of its centre are taken,
// each type by its own case, over the cells about the ball in the game's order.
import { FACE_NORMAL, cellKey } from "../format/lattice.js";
import { LAST_KEY, layHeading, TANGENT } from "../viewer/data.js";
import { faceAxes, orbit, pose } from "../viewer/motion.js";
import { cellOf } from "./ball.js";
import { die } from "./hazards.js";
import { KEY, took } from "./world.js";

const add = (p, v, k = 1) => p.map((c, i) => c + v[i] * k);
const squared = (a, b) => a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0);

/** Where the thing stands this frame, bobbing or circling as drawn, and the form it shows. */
function placeOf(live, p) {
  const { motion } = live.tables;
  const entry = motion.types[String(p.m.type)];
  const n = FACE_NORMAL[p.m.face];
  const frame = live.words.frame;
  let at = p.at;
  let form = null;
  if (entry.bob) at = add(at, n, pose(motion, entry, p.m, frame, p.phase).bob);
  if (entry.orbit) {
    const round = orbit(motion, entry, p.slot, frame, p.phase);
    const axes = faceAxes(n, layHeading(p.m) ?? TANGENT[p.m.face]);
    at = at.map((c, i) => c + axes[i][0] * round.offset[0] + axes[i][1] * round.offset[1]);
    form = round.form;
  }
  return { at, form };
}

function take(live, p, at, out) {
  const w = live.words;
  const { m, take: t } = p;
  const entry = live.tables.motion.types[String(m.type)];
  took(live.world, p.slot);
  let points = p.points;
  let turned = null;
  if (t.clock) {
    turned = { from: w.clock, to: t.clock.from - w.clock };
    w.clock = turned.to;
    points = t.points * Math.trunc(w.clock / t.clock.second);
  }
  w.score += points;
  out.push({ took: { key: p.key, face: m.face, type: m.type, variant: m.variant, points, at } });
  if (turned) out.push({ clock: turned });
  if (m.type === KEY) {
    w.keys -= 1;
    out.push({ keys: { left: w.keys } });
    if (w.keys === 0) {
      live.circuits.flip(LAST_KEY, w.frame);
      out.push({ opened: {} });
    }
  }
  if (entry.lasts) {
    w.pills[m.type] = entry.lasts.word;
    out.push({ pill: { type: m.type, frames: entry.lasts.word } });
  }
}

/** The walk over the cells about the ball: a pickup still on its face is taken where its place
    lies within its reach of the ball's centre, or, where it shows the form that is a hazard's,
    catches the ball as a captivator does. */
export function contact(live, out) {
  const b = live.ball;
  const world = live.world;
  const { types } = live.tables.motion;
  const first = add(add(add(cellOf(b), b.n, -1), b.h, -1), b.s);
  for (let up = 0; up < 3; up++)
    for (let on = 0; on < 3; on++)
      for (let over = 0; over < 3; over++) {
        const cell = add(add(add(first, b.n, up), b.h, on), b.s, -over);
        const key = cellKey(...cell);
        for (let face = 0; face < FACE_NORMAL.length; face++) {
          const p = world.pickups.get(`${key}/${face}`);
          if (!p || world.taken.has(p.slot)) continue;
          const { at, form } = placeOf(live, p);
          if (squared(b.pos, at) >= p.take.reach ** 2 + b.radius ** 2) continue;
          const harm = types[String(p.m.type)].harm;
          if (harm?.form !== undefined && form === harm.form)
            die(live, out, "captivator", { freeze: true, mark: true });
          else take(live, p, at, out);
        }
      }
}
