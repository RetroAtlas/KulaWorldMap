// In the game's units throughout: a frame is the game's, counted from the
// level's first, a rate is per frame, an angle is in the table's parts of a
// turn, and a reach is in model units.
import { hashes } from "./hash.js";

export const frameAt = (table, ms) => (ms / 1000) * table.hz;

const sin = (table, angle) => Math.sin((angle / table.turn) * Math.PI * 2);
const turns = (table, angle) => angle / table.turn;

export function phasesOf(table, x, y, z, face) {
  const next = hashes(x, y, z, face);
  return [next() % table.turn, next() % table.turn, next() % table.turn];
}

// A phase read from a field is f3's, one of four values.
export const phaseField = (m) => m.f[1] & 3;

/**
 * Turns about the thing's own axes, x across the face, y along the normal and
 * z the way it points; a lift and a bob along the normal; a squash, the share
 * of its width it widens by, which it shortens by twice over; and the frame of
 * its model to show. The ball breathes faster the less time the level gives.
 */
export function pose(table, entry, m, frame, phase, time = 0) {
  const about = [0, 0, 0];
  const angle = (rate, k) => phase[k] + rate * frame;
  const p = { about, lift: 0, bob: 0, squash: 0, frame: 0 };
  if (entry.turn) about[1] += turns(table, angle(entry.turn, 0));
  if (entry.tilt)
    about[0] += turns(table, entry.tilt.reach * sin(table, angle(entry.tilt.rate, 1)));
  if (entry.swing) {
    about[2] += turns(
      table,
      entry.swing.reach * sin(table, angle(entry.swing.rate, 1)) + entry.swing.lean,
    );
  }
  if (entry.flip) about[2] += turns(table, angle(entry.flip, 1));
  if (entry.roll) about[2] += turns(table, angle(entry.roll, 0));
  // The game names a tumble's three axes x, y and z, and its z is the normal.
  if (entry.tumble)
    [0, 2, 1].forEach((axis, i) => (about[axis] += turns(table, angle(entry.tumble[i], i))));
  if (entry.bob) p.bob = entry.bob.reach * sin(table, angle(entry.bob.rate, 2));
  if (entry.bounce) {
    // A half sine up and down, and a spin that is the sum of the cosine's
    // steps, which the integral gives in closed form.
    const b = entry.bounce;
    const theta = (entry.phases[phaseField(m)] + b.rate * frame) % b.wrap;
    p.lift = b.rise * sin(table, theta);
    about[1] += (b.spin * sin(table, theta)) / (2 * Math.PI * b.rate);
  }
  if (entry.cycle) {
    const program = entry.cycle[phaseField(m)];
    p.frame = program[Math.floor(frame) % program.length];
  }
  if (entry.breathe) {
    const b = entry.breathe;
    const rate = b.rate + Math.trunc((b.full - b.tick * time) / b.over);
    p.squash = turns(table, b.reach * sin(table, angle(rate, 0)));
  }
  return p;
}

// An orbit's rate changes with the thing's form, which runs on a clock of its
// own, so the orbit's angle is the sum of every frame's step, kept between
// draws.
const orbits = new Map();
export function orbit(table, entry, key, frame, phase) {
  const form = (at) => ((phase[0] + entry.form.rate * at) % table.turn >= entry.form.past ? 1 : 0);
  let s = orbits.get(key);
  if (!s || s.at > frame) {
    s = { at: Math.floor(frame), angle: phase[2] };
    orbits.set(key, s);
  }
  for (const now = Math.floor(frame); s.at < now; s.at++) s.angle += entry.orbit.rate[form(s.at)];
  const angle = s.angle % table.turn;
  const r = entry.orbit.radius;
  return {
    form: form(s.at),
    offset: [r * sin(table, angle), r * sin(table, angle + table.turn / 4)],
    turn: turns(table, table.turn / 4 - angle),
  };
}

export function blockPhase(entry, r, frame) {
  const phase = r.f[0] & 3;
  const k = Math.floor(frame) % entry.cycle[phase].length;
  return { state: entry.cycle[phase][k], level: entry.level[phase][k] };
}

// An invisible block's corner is lit full within the near distance of where
// the ball touches its face and fades in fixed point to nothing at the far
// one, or the other way about where the level turns the light round. The game
// looks only at the blocks in a box of cells the far distance either way of
// the ball on each axis.

export function lightOn(entry, l) {
  const t = entry.turned;
  const turned = l.records.some((r) => r.kind === t.kind && r.f[0] === t.value);
  return turned ? { ...entry, near: t.near, far: t.far, turned } : { ...entry, turned };
}

// The game's square root: its table's row for the square's leading zeros
// gives the root of the power of two below and a straight line to the next.
// A square too small to have a row is well within any near distance.
function root(rows, v) {
  const zeros = Math.clz32(v);
  if (zeros >= rows.length) return 0;
  const [below, step] = rows[zeros];
  const past = 2 ** (31 - zeros);
  return below + Math.floor(((v - past) * step) / past);
}

export function glow(light, d) {
  if (d <= light.near) return light.full;
  const unit = 2 ** light.bits;
  const step = Math.floor((light.full * unit) / (light.far - light.near));
  return Math.max(0, light.full - Math.floor(((d - light.near) * step) / unit));
}

/** Null where no ball's box holds the block at `cell`. */
export function cornersLit(light, balls, cell, corners, block) {
  const holding = balls.filter((b) =>
    b.every(
      (v, i) =>
        Math.floor((v - light.far) / block) <= cell[i] &&
        cell[i] <= Math.floor((v + light.far) / block),
    ),
  );
  if (!holding.length) return null;
  return corners.map((c) => {
    const near = Math.max(
      ...holding.map((b) =>
        glow(
          light,
          root(
            light.root,
            c.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0),
          ),
        ),
      ),
    );
    return light.turned ? light.full - near : near;
  });
}

/** While the device is on it counts `every` frames down, from `every` as the
    level starts, and turns its light over each time the count runs out; off,
    it drops the light at once and holds the count. A frame's faces take the
    light as it stood the frame before. `presses` are the frames its circuit
    was turned over at. */
export function glowing(every, on, presses, frame) {
  let count = every;
  let lit = false;
  let from = 0;
  const run = (to) => {
    const walks = to - from;
    if (walks <= 0) return;
    if (!on) lit = false;
    else if (walks < count) count -= walks;
    else {
      const past = walks - count;
      if (Math.floor(past / every) % 2 === 0) lit = !lit;
      count = every - (past % every);
    }
  };
  for (const at of presses) {
    if (at >= frame) break;
    run(at);
    on = !on;
    from = at;
  }
  run(Math.floor(frame));
  return lit;
}

export const inReach = (entry, ball, button) =>
  Math.hypot(ball[0] - button[0], ball[1] - button[1], ball[2] - button[2]) < entry.press.reach;

// A boost button's count steps down to flat while a ball is in reach and back
// up after, and the button is drawn that count over full high. The count is
// kept between draws, and a change in what presses it counts from the frame
// it is found at, so a press after a still spell starts then.
const presses = new Map();
export function press(entry, key, frame, pressed) {
  const e = entry.press;
  const now = Math.floor(frame);
  let s = presses.get(key);
  if (!s || s.at > now) {
    s = { at: now, count: e.start, height: 1, pressed };
    presses.set(key, s);
  }
  if (s.pressed !== pressed) {
    s.at = Math.max(s.at, now - 1);
    s.pressed = pressed;
  }
  for (; s.at < now; s.at++) {
    if (pressed) {
      if (s.count > 0) s.count += e.sink;
      s.height = s.count / e.full;
    } else if (s.count < e.full) {
      s.count += e.rise;
      s.height = s.count / e.full;
    } else s.height = 1;
  }
  return { height: s.height, moving: pressed ? s.count > 0 : s.height !== 1 || s.count < e.full };
}
