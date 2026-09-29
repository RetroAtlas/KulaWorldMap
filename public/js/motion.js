// What moves on the spot moves at the game's own rate, from the table the
// build reads off the executable: a rate is per frame, an angle is in 4096ths
// of a turn and a reach is in units of which a block is 512. A frame here is
// the game's, a sixtieth of a second, counted from the level's first frame,
// and a thing's phase is either the one its record gives it or, where the
// game draws one at random on every visit, one hashed from its cell and
// face, so the map shows the same thing on every visit.
import { hashes } from "./hash.js";

/** The game's frame count at a page time in milliseconds. */
export const frameAt = (table, ms) => (ms / 1000) * table.hz;

const sin = (table, angle) => Math.sin((angle / table.turn) * Math.PI * 2);
const turns = (table, angle) => angle / table.turn;

/** Three starting angles for a thing the game starts at random, by its place. */
export function phasesOf(table, x, y, z, face) {
  const next = hashes(x, y, z, face);
  return [next() % table.turn, next() % table.turn, next() % table.turn];
}

// The moving spikes and the corkscrew read their phase from f3, one of four values.
export const phaseField = (m) => m.f[1] & 3;

/**
 * Where a thing stands at a frame: turns about its own axes, x across the
 * face, y along the normal and z the way it points; a lift and a bob along
 * the normal, in units; a squash, as a share of its width it is wider by and
 * twice of which it is shorter; and which frame of its model to show. The
 * ball breathes faster the less time the level gives, so the level's time is
 * what its rate is read from.
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

// The catalogue star's orbit runs at one rate in the one form and another in
// the other, and the form changes on its own clock, so the orbit's angle is
// the sum of every frame's step, kept per star between draws.
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

/** A vanishing block's state and brightness at a frame, from its phase field. */
export function blockPhase(entry, r, frame) {
  const phase = r.f[0] & 3;
  const k = Math.floor(frame) % entry.cycle[phase].length;
  return { state: entry.cycle[phase][k], level: entry.level[phase][k] };
}

// An invisible block is lit afresh every frame from where the ball is: a
// corner is full within the near distance of the ball's middle and fades in
// fixed point to nothing at the far one, measured by the game's own square
// root, and on a level whose settings turn the light round, the other way
// about. The game looks only at the blocks in a box of cells the far
// distance either way of the ball on each axis.

/** The light on a level: the game's distances, or the pair the level's
    settings turn it round with, where they carry the value that asks it. */
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

/** How brightly the ball lights a corner a distance from its middle, of full. */
export function glow(light, d) {
  if (d <= light.near) return light.full;
  const unit = 2 ** light.bits;
  const step = Math.floor((light.full * unit) / (light.far - light.near));
  return Math.max(0, light.full - Math.floor(((d - light.near) * step) / unit));
}

/** How brightly each of a face's corners is lit, of full, by the nearest of
    the balls whose box holds the face's block, at `cell`, or null where none
    does. The balls and the corners are in the game's units, of which a
    block is `block`. */
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

/** Whether a ball at a point is within a boost button's reach of it, both in
    the game's units, the button's point being where it stands on its face. */
export const inReach = (entry, ball, button) =>
  Math.hypot(ball[0] - button[0], ball[1] - button[1], ball[2] - button[2]) < entry.press.reach;

// A boost button's count steps as the game steps it, down to flat while a
// ball is in reach and back up after, and it is drawn that count over full
// high while it moves and at full once it is back, where the game stops
// scaling it. The count is kept per button between draws; a draw that finds
// what presses it changed counts the change from its own frame, so a press
// after a still spell starts then rather than having run all along.
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
