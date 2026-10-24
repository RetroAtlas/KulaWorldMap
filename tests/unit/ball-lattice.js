import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { cellKey } from "../../public/js/format/lattice.js";
import { probeOf } from "../../public/js/viewer/walk.js";
import { FALL, ballAt, moving, step } from "../../public/js/play/ball.js";

export const table = objects.motion.types[30];

export const UNIT = objects.block;

export const TURN = objects.motion.turn;

export const RULES = { table, turn: TURN, unit: UNIT, jump: objects.jump };

export const JUMPS = objects.jump;

export const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

export const nearly = (f, g) => f.forEach((v, i) => near(v, g[i], 1e-9));

/** The body aligned with the ball's frame: the side, the heading and the normal its columns. */
export const aligned = (b) => [...b.s, ...b.h, ...b.n];

/** A lattice of the cells given, probed as the planner probes a level. */
export const lattice = (...cells) =>
  probeOf({
    records: new Map(),
    cells: new Map(cells.map((c) => [cellKey(...c), { x: c[0], y: c[1], z: c[2] }])),
  });

/** A row of blocks along y at x 17, z 17, from `from` to `to`. */
export const row = (from, to, more = []) => {
  const cells = [];
  for (let y = from; y <= to; y++) cells.push([17, y, 17]);
  return lattice(...cells, ...more);
};

export const UP = [0, -1, 0];

export const TOP = 0;

/** Run `n` frames with `pad` held, collecting the events. */
export function run(b, probe, n, pad) {
  const out = [];
  for (let i = 0; i < n; i++) {
    b.pad = pad;
    out.push(...step(b, probe));
  }
  return out;
}

export const rest = (b, probe) => {
  let n = 0;
  while (moving(b) && n < 1000) {
    b.pad = 0;
    step(b, probe);
    n++;
  }
  return n;
};

export const RIDE = objects.motion.kinds["5"].ride;

export const RIDDEN = { ...RULES, ride: RIDE };

/** `lattice` with a platform whose blocks stand on the `body` cells at home, laid along one axis
    from the first, and are carried `travel()` units from them: solid where the lattice is or
    where the body stands now, and to the ball `b` while it rides the body at home alone;
    `platform` names the body's cells now, with the run's axis, the first block's centre as
    carried and the count of blocks. */
export function carried(lattice, body, travel, b, key = "rail") {
  const same = (a, c) => a.every((v, i) => v === c[i]);
  const axis = body.length > 1 ? body[1].findIndex((v, i) => v !== body[0][i]) : 0;
  const now = () => {
    const by = travel().map((v) => Math.floor((v + UNIT / 2) / UNIT));
    return body.map((c) => c.map((v, i) => v + by[i]));
  };
  const on = (cells, cell) => cells.some((c) => same(c, cell));
  const named = () => ({
    key,
    travel: travel(),
    axis,
    at: body[0].map((v, i) => v * UNIT + travel()[i]),
    count: body.length,
  });
  return {
    ...lattice,
    solid: (cell) => (b.riding ? on(body, cell) : lattice.solid(cell) || on(now(), cell)),
    platform: (cell) => (on(now(), cell) ? named() : null),
  };
}

/** A ball with its normal out of `face`, heading `h`, let fall from `pos` over `lattice` and the
    platform whose blocks stand on `body` at home, carried `travel`: the ball, its probe and each
    frame's events, run while it falls, for at most `n` frames. */
export function fallen(lattice, face, h, body, travel, pos, n = 60) {
  const b = ballAt(RIDDEN, [17, 17, 17], face, h);
  const probe = carried(lattice, body, () => travel, b);
  b.pos = pos;
  b.state = FALL;
  b.v = table.fall.start;
  const frames = [];
  for (let f = 0; f < n && b.state === FALL; f++) frames.push(run(b, probe, 1, 0));
  return { b, probe, frames };
}
