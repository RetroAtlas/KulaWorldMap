// Where the game draws a number at random for a thing on every visit, the
// map hashes one from the thing's cell and face instead, so a level looks the
// same on every visit: a stream of 32-bit numbers, of which a thing takes as
// many as it needs.
export function hashes(x, y, z, face) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ ((face + 1) * 2971215073);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    return h;
  };
}

/** The first number of a place's stream. */
export const seed = (x, y, z, face) => hashes(x, y, z, face)();
