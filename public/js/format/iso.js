// A raw PS1 image as an ISO9660 tree, read a slice at a time from whatever has
// a Blob's slice and arrayBuffer, so a File is walked without being read whole.
// Every file is keyed by its full upper-case path, and every file's directory
// record by where it lies, which is what a writer rewrites.
import { SECTOR_RAW, USER, USER_OFF } from "./sectors.js";

export const PVD = 16;
export const EXTENT = 2;
export const SIZE = 10;
export const FLAGS = 25;
export const NAME_LEN = 32;
export const NAME = 33;
export const DIRECTORY = 2;
export const DIR_MOST = 64;
const MARK = "CD001";

const ascii = (bytes) =>
  Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : "�")).join("");
const u32 = (bytes, at) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);

/** A number as a directory record stores it: little-endian, then big-endian. */
export function bothWays(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, value, true);
  view.setUint32(4, value, false);
  return out;
}

/** Rewrite the extent and the size of the directory record at pos, in both byte orders. */
export function setRecord(data, pos, extent, size) {
  data.set(bothWays(extent), pos + EXTENT);
  data.set(bothWays(size), pos + SIZE);
}

/** A directory record naming a file or a directory, padded to an even length. */
export function record(name, extent, size, flags = 0) {
  const ident =
    typeof name === "string"
      ? Uint8Array.from(name, (c) => c.charCodeAt(0))
      : Uint8Array.from(name);
  let length = NAME + ident.length;
  length += length % 2;
  const out = new Uint8Array(length);
  out[0] = length;
  setRecord(out, 0, extent, size);
  out[FLAGS] = flags;
  out.set([1, 0, 0, 1], 28);
  out[NAME_LEN] = ident.length;
  out.set(ident, NAME);
  return out;
}

class Disc {
  constructor(blob) {
    this.blob = blob;
    this.size = blob.size;
    this.files = new Map();
    this.records = new Map();
    this.walked = new Set();
  }

  /** So many whole sectors from an address, as the image holds them. */
  async raw(lba, count = 1) {
    const start = lba * SECTOR_RAW;
    const end = start + count * SECTOR_RAW;
    if (end > this.size) throw new Error(`the image ends before sector ${lba + count - 1}`);
    return new Uint8Array(await this.blob.slice(start, end).arrayBuffer());
  }

  rawSector(lba) {
    return this.raw(lba);
  }

  /** A sector's user data. */
  async sector(lba) {
    return (await this.raw(lba)).subarray(USER_OFF, USER_OFF + USER);
  }

  /** So many bytes of a file's data from the sector it starts at. */
  async read(lba, size) {
    const count = Math.ceil(size / USER);
    const raw = await this.raw(lba, count);
    const out = new Uint8Array(size);
    for (let i = 0; i < count; i++) {
      const at = i * SECTOR_RAW + USER_OFF;
      out.set(raw.subarray(at, at + Math.min(USER, size - i * USER)), i * USER);
    }
    return out;
  }

  async readFile(path) {
    const file = this.files.get(path.toUpperCase());
    if (!file) throw new Error(`no such file on the disc: ${path}`);
    return this.read(file.lba, file.size);
  }

  async walk() {
    const pvd = await this.sector(PVD);
    if (ascii(pvd.subarray(1, 6)) !== MARK) throw new Error("not a raw ISO9660 image");
    const root = pvd.subarray(156, 156 + 34);
    await this.readDir(u32(root, EXTENT), u32(root, SIZE), "");
  }

  async readDir(lba, size, prefix) {
    if (this.walked.has(lba)) throw new Error(`the directory at sector ${lba} is reached twice`);
    if (size > DIR_MOST * USER)
      throw new Error(`the directory at sector ${lba} is longer than a directory on any disc`);
    this.walked.add(lba);
    const data = await this.read(lba, size);
    let pos = 0;
    while (pos < data.length) {
      const length = data[pos];
      if (length === 0) {
        pos = (Math.floor(pos / USER) + 1) * USER;
        continue;
      }
      if (pos + NAME > data.length || pos + NAME + data[pos + NAME_LEN] > data.length)
        throw new Error(`a directory record at sector ${lba} runs past its table`);
      const extent = u32(data, pos + EXTENT);
      const fileSize = u32(data, pos + SIZE);
      const flags = data[pos + FLAGS];
      let name = ascii(data.subarray(pos + NAME, pos + NAME + data[pos + NAME_LEN]));
      if (name !== "\0" && name !== "\x01") {
        name = name.split(";")[0].toUpperCase();
        if (flags & DIRECTORY) await this.readDir(extent, fileSize, `${prefix}/${name}`);
        else {
          this.files.set(`${prefix}/${name}`, { lba: extent, size: fileSize });
          this.records.set(`${prefix}/${name}`, {
            sector: lba + Math.floor(pos / USER),
            offset: pos % USER,
          });
        }
      }
      pos += length;
    }
  }
}

/** The image's files and their directory records, walked from the volume descriptor. */
export async function openDisc(blob) {
  const disc = new Disc(blob);
  await disc.walk();
  return disc;
}
