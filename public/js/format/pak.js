// The .PAK container as the disc lays it out: a count, a table of offsets and
// sizes, the name offsets, the names each ending in a newline before a NUL,
// one to four bytes of padding to a four-byte boundary, and the zlib records
// back to back in slot order. The game reads a pack by its directory record's
// size into a fixed buffer and never reads a name, so a level goes into a slot
// by one of three paths, decided here from a pack read off the image or from
// the packs' layout alone.
import { deflate } from "./deflate.js";
import { USER } from "./sectors.js";

export const IN_PLACE = "in place";
export const REBUILD = "rebuild";
export const RELOCATE = "relocate";
export const BUFFER = 32768;
export const LARGEST = BUFFER - 1;
export const RECOMPRESS = 9;
export const SLOTS_MOST = 32;

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
 * the pack's afterwards and the room the bytes to spare on that path. A title
 * names the slot of a rebuilt or moved pack, as writing it will.
 */
export function fit(pack, slot, size, title = null) {
  const { slots } = pack;
  if (!Number.isInteger(slot) || slot < 0 || slot >= slots.length)
    throw new Error(`the pack has ${slots.length} slots, so #${slot} is not one of them`);
  const old = slots[slot].size;
  if (size <= old)
    return { path: IN_PLACE, recompressed: false, size: pack.size, room: old - size };
  const names = slots.map((s) => s.name);
  if (title != null) names[slot] = packName(title, names[slot]);
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

/**
 * How several streams go into the slots of one pack of packs.json, the items
 * { slot, size, size9, title } fitted in order over a copy of the pack that
 * each fit leaves as the placement will: the slot's record at its stream's
 * length, and at size9 once a later rebuild recompresses the others; every
 * other record at its size9 after a rebuild that recompressed them; the pack's
 * size and the sectors it takes after a rebuild or a move; and the slot's name
 * from the title as fit names it. The fits come back in order.
 */
export function fitAll(pack, items) {
  const running = { ...pack, slots: pack.slots.map((s) => ({ ...s })) };
  return items.map(({ slot, size, size9, title }) => {
    const f = fit(running, slot, size, title);
    if (f.path !== IN_PLACE) {
      if (title != null) running.slots[slot].name = packName(title, running.slots[slot].name);
      if (f.recompressed) for (const s of running.slots) s.size = s.size9;
      running.size = f.size;
      running.capacity = Math.ceil(f.size / USER) * USER;
    }
    running.slots[slot].size = size;
    running.slots[slot].size9 = size9;
    return f;
  });
}

const ascii = (bytes) =>
  Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : "\ufffd")).join("");

/**
 * The names, the records and where each record lies in a container read off
 * the image, or a thrown sentence where the count, the table, a record or a
 * name does not lie within the bytes.
 */
export function readPak(bytes) {
  if (bytes.length < 4) throw new Error("the pack ends before its count");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  if (count < 1 || count > SLOTS_MOST) throw new Error(`a count of ${count} is not a pack's`);
  const table = 4 + count * 12;
  if (table > bytes.length) throw new Error("the table runs past the pack");
  const names = [];
  const offsets = [];
  const streams = [];
  for (let i = 0; i < count; i++) {
    const offset = view.getUint32(4 + i * 8, true);
    const size = view.getUint32(8 + i * 8, true);
    const at = view.getUint32(4 + count * 8 + i * 4, true);
    if (offset < table || size < 1 || offset + size > bytes.length)
      throw new Error(`the record of slot ${i} lies outside the pack`);
    if (at < table || at >= offset) throw new Error(`the name of slot ${i} lies outside the names`);
    let end = at;
    while (end < bytes.length && bytes[end] !== 0) end++;
    if (end === bytes.length) throw new Error(`the name of slot ${i} runs past the pack`);
    names.push(ascii(bytes.subarray(at, end)).trim());
    offsets.push(offset);
    streams.push(bytes.slice(offset, offset + size));
  }
  return { size: bytes.length, names, offsets, streams };
}

/** The container holding these records under these names, laid out as the disc has it. */
export function writePak(names, streams) {
  const count = names.length;
  const out = new Uint8Array(
    packSize(
      names,
      streams.map((s) => s.length),
    ),
  );
  const view = new DataView(out.buffer);
  view.setUint32(0, count, true);
  const table = 4 + count * 12;
  const text = names.reduce((sum, name) => sum + name.length + NAME_END, 0);
  let at = table + text + (ALIGN - ((table + text) % ALIGN));
  streams.forEach((s, i) => {
    view.setUint32(4 + i * 8, at, true);
    view.setUint32(8 + i * 8, s.length, true);
    out.set(s, at);
    at += s.length;
  });
  at = table;
  names.forEach((name, i) => {
    view.setUint32(4 + count * 8 + i * 4, at, true);
    for (let k = 0; k < name.length; k++) {
      const code = name.charCodeAt(k);
      if (code > 127) throw new Error(`a pack's name is ASCII, and ${JSON.stringify(name)} is not`);
      out[at + k] = code;
    }
    out[at + name.length] = 0x0a;
    at += name.length + NAME_END;
  });
  return out;
}

/**
 * The name a slot takes from a level's title: upper-case ASCII no longer than
 * the name it replaces, or that name where the title gives nothing.
 */
export function packName(title, old) {
  const text = [...title.toUpperCase()]
    .filter((c) => c >= " " && c <= "~")
    .join("")
    .slice(0, old.length)
    .trim();
  return text || old;
}

/**
 * How the stream goes into the slot of a pack read off the image, with so many
 * bytes of sectors: the three paths of fit, with every slot's record and name
 * as the pack will carry them. Recompressing the other records needs their
 * levels, inflated, in slot order, and a fit that would have to is null until
 * they are given.
 */
export function fitPak(pak, capacity, slot, stream, title = null, levels = null) {
  const count = pak.streams.length;
  if (!Number.isInteger(slot) || slot < 0 || slot >= count)
    throw new Error(`the pack has ${count} slots, so #${slot} is not one of them`);
  const names = [...pak.names];
  const streams = [...pak.streams];
  const old = streams[slot].length;
  streams[slot] = stream;
  const sizes = (ss) => ss.map((s) => s.length);
  if (stream.length <= old)
    return {
      path: IN_PLACE,
      streams,
      names,
      size: pak.size,
      room: old - stream.length,
      recompressed: false,
    };
  if (title != null) names[slot] = packName(title, names[slot]);
  const limit = Math.min(capacity, LARGEST);
  const size = packSize(names, sizes(streams));
  if (size <= limit)
    return { path: REBUILD, streams, names, size, room: limit - size, recompressed: false };
  if (!levels) return null;
  const again = streams.map((s, i) => (i === slot ? s : deflate(levels[i], RECOMPRESS)));
  const size9 = packSize(names, sizes(again));
  if (size9 <= limit)
    return {
      path: REBUILD,
      streams: again,
      names,
      size: size9,
      room: limit - size9,
      recompressed: true,
    };
  for (const [ss, total, recompressed] of [
    [streams, size, false],
    [again, size9, true],
  ])
    if (total <= LARGEST)
      return {
        path: RELOCATE,
        streams: ss,
        names,
        size: total,
        room: LARGEST - total,
        recompressed,
      };
  throw new Error(`a pack of ${size9} bytes is more than the game reads`);
}
