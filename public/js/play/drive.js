// Pad words per frame: the keys as they are pressed, and the drivers, a planned route followed, a
// recording replayed and the recorder that makes one. A driver is { pad(live), done(live) }, asked
// once a game frame; done answers false while the driver drives, and a driver that can end in
// more than one way answers why it ended.
import { PAD, REST, ROLLING, WRAPPING, blockUnder, faceUnder } from "./ball.js";
import { headingOn, outcomeAt } from "../viewer/walk.js";
import { probeOf } from "./world.js";

const VERSION = 1;

const neg = (v) => v.map((x) => -x || 0);
const same = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);
/** At rest with no turn asked, waiting or ramping. */
const settled = (b) => b.state === REST && !b.ramp && !b.turn && !b.waiting && !b.again;
const rolling = (b) => b.state === ROLLING || b.state === WRAPPING;

/** The keys as frames read them: held keys, which every frame samples, read or not, and a tap
    made over frames that do not read the pad, kept for the first that does. */
export function keyPad() {
  let held = 0;
  let last = 0;
  const waiting = new Map();
  return {
    down(bit) {
      held |= bit;
      waiting.set(bit, (waiting.get(bit) ?? 0) + 1);
    },
    up(bits = -1) {
      held &= ~bits;
    },
    busy: () => held !== 0 || waiting.size > 0,
    clear() {
      held = 0;
      last = 0;
      waiting.clear();
    },
    pad(reads, also = 0) {
      let word = held | also;
      if (!reads) {
        for (const bit of waiting.keys()) {
          if (held & bit) waiting.delete(bit);
          else waiting.set(bit, 1);
        }
      } else {
        for (const [bit, n] of waiting) {
          if (last & bit) word &= ~bit;
          else {
            word |= bit;
            if (n > 1) waiting.set(bit, n - 1);
            else waiting.delete(bit);
          }
        }
      }
      last = word;
      return word;
    },
  };
}

/** A driver that rolls the ball along `course` from its station `i`: at rest on a station it
    asks the turn the next step wants, by the shorter way, or the roll, which it holds while the
    ball rolls and the step on from each station it comes to is a roll the way it heads, so the
    ball comes to rest only where the course turns, leaps or ends; done at the course's end, at a
    leap, which no roll follows, a roll the lattice as it stands no longer allows counting as one,
    or where the ball stands on no station of the course's, strayed. */
export function courseDriver(course, i = 0) {
  const { stations, steps } = course;
  let why = false;
  const over = (reason) => {
    why = reason;
    return 0;
  };
  return {
    pad(live) {
      if (why) return 0;
      const b = live.ball;
      const here = { cell: blockUnder(b), face: faceUnder(b) };
      if (i + 1 < stations.length && same(here, stations[i + 1])) i += 1;
      if (!same(here, stations[i])) return over("strayed");
      const step = steps[i];
      const rolls = step && outcomeAt(probeOf(live), here, step.k) === step.o;
      const ahead = rolls && step.k === headingOn(here.face, b.h);
      if (!settled(b)) return ahead && rolling(b) ? PAD.up : 0;
      if (i === stations.length - 1) return over("end");
      if (!rolls) return over("leap");
      if (ahead) return PAD.up;
      if (step.k === headingOn(here.face, neg(b.s))) return PAD.left;
      if (step.k === headingOn(here.face, b.s)) return PAD.right;
      return PAD.down;
    },
    done: () => why,
  };
}

/** A driver that answers as `driver` does and keeps the word it gave each frame in `pads`. */
export function recorder(driver) {
  const pads = [];
  return {
    pads,
    pad(live) {
      const bits = driver.pad(live);
      pads[live.words.frame] = bits;
      return bits;
    },
    done: (live) => driver.done(live),
  };
}

/** A driver that gives a recording's word for each frame, nothing past its end. */
export const replayDriver = (pads) => ({
  pad: (live) => pads[live.words.frame] ?? 0,
  done: (live) => live.words.frame >= pads.length,
});

/** A recording run-length coded: each run a word and how many frames it held. */
export function pack({ slot, seed, pads }) {
  const runs = [];
  for (const word of pads) {
    const bits = word ?? 0;
    const last = runs.at(-1);
    if (last && last[0] === bits) last[1] += 1;
    else runs.push([bits, 1]);
  }
  return { v: VERSION, slot, seed, pads: runs };
}

/** The recording a packed one holds, or null where it is not one this reader knows. */
export function unpack(packed) {
  if (packed?.v !== VERSION || !Array.isArray(packed.pads)) return null;
  const pads = packed.pads.flatMap(([bits, frames]) => Array(frames).fill(bits));
  return { slot: packed.slot, seed: packed.seed, pads };
}
