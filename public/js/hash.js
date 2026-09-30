/** A place's stream of 32-bit numbers, standing in for the game's random draws. */
export function hashes(x, y, z, face) {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ ((face + 1) * 2971215073);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
    return h;
  };
}

export const seed = (x, y, z, face) => hashes(x, y, z, face)();
