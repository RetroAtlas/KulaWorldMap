// The .PAK container as the disc lays it out: a count, a table of offsets and
// sizes, the name offsets, the names each ending in a newline before a NUL,
// one to four bytes of padding to a four-byte boundary, and the zlib records
// back to back in slot order. The game reads a pack by its directory record's
// size into a fixed buffer and never reads a name, so a level goes into a slot
// by one of three paths, decided here from the packs' layout alone, as
// tools/kula_place.py decides it from the pack itself.

export const IN_PLACE = "in place";
export const REBUILD = "rebuild";
export const RELOCATE = "relocate";
export const BUFFER = 32768;
export const LARGEST = BUFFER - 1;
export const RECOMPRESS = 9;

const ALIGN = 4;
const NAME_END = 2;

/** The length of the container holding records of these sizes under these names. */
export function packSize(names, sizes) {
  const table = 4 + 12 * names.length;
  const text = names.reduce((sum, name) => sum + name.length + NAME_END, 0);
  const pad = ALIGN - ((table + text) % ALIGN);
  return table + text + pad + sizes.reduce((sum, size) => sum + size, 0);
}

/**
 * How a stream of the length given goes into a slot of a pack of packs.json:
 * in place when it is no longer than the record it replaces; else the pack
 * rebuilt within its sectors, first with the other records as they are and
 * then with them recompressed; else moved into the free sectors. The size is
 * the pack's afterwards and the room the bytes to spare on that path.
 */
export function fit(pack, slot, size) {
  const { slots } = pack;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length)
    throw new Error(`the pack has ${slots.length} slots, so #${slot} is not one of them`);
  const old = slots[slot].size;
  if (size <= old)
    return { path: IN_PLACE, recompressed: false, size: pack.size, room: old - size };
  const names = slots.map((s) => s.name);
  const limit = Math.min(pack.capacity, LARGEST);
  const asIs = packSize(
    names,
    slots.map((s, i) => (i === slot ? size : s.size)),
  );
  if (asIs <= limit) return { path: REBUILD, recompressed: false, size: asIs, room: limit - asIs };
  const again = packSize(
    names,
    slots.map((s, i) => (i === slot ? size : s.size9)),
  );
  if (again <= limit)
    return { path: REBUILD, recompressed: true, size: again, room: limit - again };
  for (const [total, recompressed] of [
    [asIs, false],
    [again, true],
  ])
    if (total <= LARGEST)
      return { path: RELOCATE, recompressed, size: total, room: LARGEST - total };
  throw new Error(`a pack of ${again} bytes is more than the game reads`);
}
