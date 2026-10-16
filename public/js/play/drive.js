// Pad words per frame from a source other than the keys: a recording replayed, and the recorder
// that makes one. A driver is { pad(live), done(live) }, asked once a game frame.

const VERSION = 1;

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
