// What moves on the spot moves at the game's own rate, from the table the
// build reads off the executable: a rate is per frame, an angle is in 4096ths
// of a turn and a reach is in units of which a block is 512. A frame here is
// the game's, a sixtieth of a second, counted from wherever the page's clock
// was when it started, and a thing's phase is either the one its record
// gives it or, where the game draws one at random on every visit, one hashed
// from its cell and face, so the map shows the same thing on every visit.

/** The game's frame count at a page time in milliseconds. */
export const frameAt = (table, ms) => (ms / 1000) * table.hz;

const sin = (table, angle) => Math.sin((angle / table.turn) * Math.PI * 2);
const turns = (table, angle) => angle / table.turn;

/** Three starting angles for a thing the game starts at random, by its place. */
export function phasesOf(table, x, y, z, face) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ ((face + 1) * 2971215073);
  const out = [];
  for (let k = 0; k < 3; k++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    out.push(h % table.turn);
  }
  return out;
}

// The moving spikes and the corkscrew read their phase from the field after
// the colour slot, one of four values.
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
