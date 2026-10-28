// A patch read back: which kind a file is by its head, the stretches of the
// image a PPF's records or a VCDIFF's windows change, those stretches laid
// over the original's own slices, and the slots whose level the patched image
// then carries changed, which only the image the patch was made for gives.
import {
  BLOCK,
  BLOCK_AT,
  COPY as COPY_CODE,
  PACKS,
  PPF_MAGIC,
  PPF_VERSION,
  VCDIFF_MAGIC,
  adler32,
  runs,
  varint,
} from "./patch.js";
import { openDisc } from "./iso.js";
import { readPak } from "./pak.js";

export const PPF = "ppf";
export const VCDIFF = "vcdiff";

const PPF_HEAD = 60;
const PPF_DESCRIPTION_AT = 6;
const PPF_DESCRIPTION = 50;
const PPF_IMAGE_TYPE_AT = 56;
const PPF_BLOCK_CHECK_AT = 57;
const PPF_UNDO_AT = 58;
const DIZ_BEGIN = "@BEGIN_FILE_ID.DIZ";
const DIZ_END = "@END_FILE_ID.DIZ";
const DIZ_MOST = 4096;

const VCD_DECOMPRESS = 1;
const VCD_CODETABLE = 2;
const VCD_APPHEADER = 4;
const VCD_SOURCE = 1;
const VCD_TARGET = 2;
const VCD_ADLER32 = 4;
const NEAR = 4;
const SAME = 3;
const MODES = 2 + NEAR + SAME;
const NOOP = 0;
const ADD = 1;
const RUN = 2;
const COPY = 3;

const ascii = (bytes) =>
  Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : "�")).join("");
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const startsWith = (bytes, head) =>
  bytes.length >= head.length && same(bytes.subarray(0, head.length), head);
const bytesOf = async (blob, start, end) =>
  new Uint8Array(await blob.slice(start, end).arrayBuffer());
const text = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Which patch the file is by its head: PPF 3.0 or VCDIFF, else null. */
export function patchKind(bytes) {
  if (startsWith(bytes, PPF_MAGIC)) return PPF;
  if (startsWith(bytes, VCDIFF_MAGIC)) return VCDIFF;
  return null;
}

// Where the records end: before a FILE_ID.DIZ at the tail, else at the end.
function recordsEnd(bytes) {
  const end = text(DIZ_END);
  const begin = text(DIZ_BEGIN);
  for (const word of [2, 4]) {
    const at = bytes.length - word - end.length;
    if (at < PPF_HEAD || !same(bytes.subarray(at, at + end.length), end)) continue;
    for (let pos = at - begin.length; pos >= Math.max(PPF_HEAD, at - DIZ_MOST); pos--)
      if (same(bytes.subarray(pos, pos + begin.length), begin)) return pos;
  }
  return bytes.length;
}

/**
 * A PPF 3.0 patch read: its description, the block check it expects of the
 * original, 1024 bytes at 0x9320, or null where it carries none, and its
 * records as stretches [offset, bytes] in address order.
 */
export function ppfPatch(bytes) {
  if (
    patchKind(bytes) !== PPF ||
    bytes.length < PPF_HEAD ||
    bytes[PPF_MAGIC.length] !== PPF_VERSION
  )
    throw new Error("the file is not a PPF 3.0 patch");
  if (bytes[PPF_IMAGE_TYPE_AT] !== 0)
    throw new Error("the patch is written for an image of 2336-byte sectors, not one of 2352");
  const undo = bytes[PPF_UNDO_AT] !== 0;
  const description = ascii(
    bytes.subarray(PPF_DESCRIPTION_AT, PPF_DESCRIPTION_AT + PPF_DESCRIPTION),
  )
    .replace(/\0[^]*$/, "")
    .replace(/\s+$/, "");
  let pos = PPF_HEAD;
  let block = null;
  if (bytes[PPF_BLOCK_CHECK_AT] !== 0) {
    if (bytes.length < pos + BLOCK) throw new Error("the patch ends inside its block check");
    block = bytes.slice(pos, pos + BLOCK);
    pos += BLOCK;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = recordsEnd(bytes);
  const stretches = [];
  while (pos < end) {
    const n = pos + 9 <= end ? bytes[pos + 8] : 0;
    const span = 9 + n * (undo ? 2 : 1);
    if (pos + span > end) throw new Error("a record of the patch runs past its end");
    stretches.push([Number(view.getBigUint64(pos, true)), bytes.slice(pos + 9, pos + 9 + n)]);
    pos += span;
  }
  stretches.sort((a, b) => a[0] - b[0]);
  return { description, block, stretches };
}

/** Whether the PPF's block check is the original's bytes at its address, read by one slice; null where it carries none. */
export async function ppfCheck(original, patch) {
  const { block } = patch instanceof Uint8Array ? ppfPatch(patch) : patch;
  if (!block) return null;
  if (original.size < BLOCK_AT + BLOCK) return false;
  return same(await bytesOf(original, BLOCK_AT, BLOCK_AT + BLOCK), block);
}

// An integer in base 128 from pos: the value and the position after it.
function varintAt(bytes, pos, end = bytes.length, what = "the patch") {
  let n = 0;
  for (;;) {
    if (pos >= end) throw new Error(`${what} ends inside a number`);
    const b = bytes[pos++];
    n = n * 128 + (b & 0x7f);
    if (!(b & 0x80)) return [n, pos];
  }
}

/**
 * A VCDIFF patch's windows, each { indicator, srcPos, srcLen, start, targetLen,
 * adler, data, inst, addr }: where its source segment lies, where its target
 * begins in the patched image, the checksum it carries or null, and its three
 * sections. Secondary compression and a code table of the patch's own are
 * refused, since the decoder knows neither.
 */
export function vcdiffPatch(bytes) {
  if (patchKind(bytes) !== VCDIFF || bytes.length < VCDIFF_MAGIC.length + 1)
    throw new Error("the file is not a VCDIFF patch");
  const header = bytes[VCDIFF_MAGIC.length];
  if (header & VCD_DECOMPRESS)
    throw new Error("the patch uses secondary compression, which is not decoded");
  if (header & VCD_CODETABLE) throw new Error("the patch carries a code table of its own");
  let pos = VCDIFF_MAGIC.length + 1;
  if (header & VCD_APPHEADER) {
    let n;
    [n, pos] = varintAt(bytes, pos);
    pos += n;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const windows = [];
  let start = 0;
  while (pos < bytes.length) {
    const k = windows.length;
    const indicator = bytes[pos++];
    let srcLen = 0;
    let srcPos = 0;
    if (indicator & (VCD_SOURCE | VCD_TARGET)) {
      [srcLen, pos] = varintAt(bytes, pos);
      [srcPos, pos] = varintAt(bytes, pos);
    }
    let deltaLen, targetLen, dataLen, instLen, addrLen;
    [deltaLen, pos] = varintAt(bytes, pos);
    const end = pos + deltaLen;
    if (end > bytes.length) throw new Error(`window ${k} runs past the end of the patch`);
    [targetLen, pos] = varintAt(bytes, pos, end);
    if (bytes[pos++] !== 0) throw new Error(`window ${k} has compressed sections`);
    [dataLen, pos] = varintAt(bytes, pos, end);
    [instLen, pos] = varintAt(bytes, pos, end);
    [addrLen, pos] = varintAt(bytes, pos, end);
    let adler = null;
    if (indicator & VCD_ADLER32) {
      if (pos + 4 > end) throw new Error(`window ${k} ends inside its checksum`);
      adler = view.getUint32(pos, false);
      pos += 4;
    }
    if (pos + dataLen + instLen + addrLen !== end)
      throw new Error(`window ${k}'s length does not count its sections`);
    const data = bytes.subarray(pos, pos + dataLen);
    const inst = bytes.subarray(pos + dataLen, pos + dataLen + instLen);
    const addr = bytes.subarray(pos + dataLen + instLen, end);
    windows.push({ indicator, srcPos, srcLen, start, targetLen, adler, data, inst, addr });
    start += targetLen;
    pos = end;
  }
  return windows;
}

// The default code table: for each code, its two instructions as [type, size, mode].
function codeTable() {
  const none = [NOOP, 0, 0];
  const table = [[[RUN, 0, 0], none]];
  for (let size = 0; size <= 17; size++) table.push([[ADD, size, 0], none]);
  for (let mode = 0; mode < MODES; mode++) {
    table.push([[COPY, 0, mode], none]);
    for (let size = 4; size <= 18; size++) table.push([[COPY, size, mode], none]);
  }
  for (let mode = 0; mode < 6; mode++)
    for (let add = 1; add <= 4; add++)
      for (let copy = 4; copy <= 6; copy++)
        table.push([
          [ADD, add, 0],
          [COPY, copy, mode],
        ]);
  for (let mode = 6; mode < MODES; mode++)
    for (let add = 1; add <= 4; add++)
      table.push([
        [ADD, add, 0],
        [COPY, 4, mode],
      ]);
  for (let mode = 0; mode < MODES; mode++)
    table.push([
      [COPY, 4, mode],
      [ADD, 1, 0],
    ]);
  return table;
}

const TABLE = codeTable();

// Whether the window is one COPY of its own stretch of the source, which changes nothing.
const unchanged = (w) =>
  w.srcPos === w.start &&
  w.srcLen === w.targetLen &&
  w.data.length === 0 &&
  same(w.inst, concat([Uint8Array.of(COPY_CODE), varint(w.targetLen)])) &&
  same(w.addr, Uint8Array.of(0));

// The window's target built from its source segment, every section consumed whole.
function decodeWindow(w, segment, k) {
  const fail = (what) => new Error(`window ${k} ${what}`);
  const number = (bytes, pos) => varintAt(bytes, pos, bytes.length, `window ${k}`);
  const target = new Uint8Array(w.targetLen);
  const near = new Array(NEAR).fill(0);
  const seen = new Array(SAME * 256).fill(0);
  let next = 0;
  let tp = 0;
  let ip = 0;
  let dp = 0;
  let ap = 0;
  const address = (mode) => {
    const here = segment.length + tp;
    let at;
    let n;
    if (mode < 2 + NEAR) {
      [n, ap] = number(w.addr, ap);
      at = mode === 0 ? n : mode === 1 ? here - n : near[mode - 2] + n;
    } else {
      if (ap >= w.addr.length) throw fail("reads an address past its section");
      at = seen[(mode - 2 - NEAR) * 256 + w.addr[ap++]];
    }
    near[next] = at;
    next = (next + 1) % NEAR;
    seen[at % (SAME * 256)] = at;
    if (at < 0 || at >= here) throw fail("copies from outside its window");
    return at;
  };
  const run = (type, size, mode) => {
    if (type === NOOP) return;
    if (size === 0) [size, ip] = number(w.inst, ip);
    if (tp + size > target.length) throw fail("builds more than its target");
    if (type === ADD) {
      if (dp + size > w.data.length) throw fail("adds more than its data");
      target.set(w.data.subarray(dp, dp + size), tp);
      dp += size;
    } else if (type === RUN) {
      if (dp >= w.data.length) throw fail("adds more than its data");
      target.fill(w.data[dp++], tp, tp + size);
    } else {
      const at = address(mode);
      for (let i = 0; i < size; i++) {
        const from = at + i;
        target[tp + i] = from < segment.length ? segment[from] : target[from - segment.length];
      }
    }
    tp += size;
  };
  while (ip < w.inst.length) {
    const [first, second] = TABLE[w.inst[ip++]];
    run(...first);
    run(...second);
  }
  if (tp !== target.length || dp !== w.data.length || ap !== w.addr.length)
    throw fail("does not build its target from its sections");
  if (w.adler !== null && adler32(target) !== w.adler)
    throw fail("carries a checksum that is not its target's");
  return target;
}

/**
 * The stretches [offset, bytes] where the VCDIFF's windows change the source
 * image, read a slice at a time through its slice and arrayBuffer; a window
 * that is one COPY of itself is not read, and one whose instructions or
 * checksum fail is refused in a sentence.
 */
export async function vcdiffStretches(source, patch) {
  const windows = patch instanceof Uint8Array ? vcdiffPatch(patch) : patch;
  const out = [];
  for (const [k, w] of windows.entries()) {
    if (unchanged(w)) continue;
    const sourced = w.indicator & VCD_SOURCE;
    const segment = sourced
      ? await bytesOf(source, w.srcPos, w.srcPos + w.srcLen)
      : new Uint8Array(0);
    const target = decodeWindow(w, segment, k);
    const old =
      sourced && w.srcPos === w.start && w.srcLen === w.targetLen
        ? segment
        : await bytesOf(source, w.start, w.start + w.targetLen);
    const common = Math.min(old.length, target.length);
    for (const [at, n] of runs(old.subarray(0, common), target.subarray(0, common)))
      out.push([w.start + at, target.slice(at, at + n)]);
    if (target.length > common) out.push([w.start + common, target.slice(common)]);
  }
  return out;
}

/** The image with the stretches laid in: the original's own slices with the stretches between them. */
export function appliedImage(blob, stretches) {
  const parts = [];
  let at = 0;
  for (const [start, bytes] of [...stretches].sort((a, b) => a[0] - b[0])) {
    if (start < at) throw new Error(`the stretch at ${start} overlaps the one before it`);
    if (start + bytes.length > blob.size)
      throw new Error(`the stretch at ${start} lies past the end of the image`);
    if (start > at) parts.push(blob.slice(at, start));
    parts.push(bytes);
    at = start + bytes.length;
  }
  if (at < blob.size) parts.push(blob.slice(at));
  return new Blob(parts);
}

/**
 * The slots whose level the patched image carries changed, each { pack, index,
 * name, stream } with the name the patched pack's table gives the slot, read
 * from every pack of both images; a record that only recompresses the same
 * level is not one. inflate turns a zlib stream into its bytes, asynchronously,
 * however the host does that.
 */
export async function changedSlots(original, applied, inflate) {
  const before = await openDisc(original);
  const after = await openDisc(applied);
  const out = [];
  for (const pack of PACKS) {
    if (!after.files.has(pack)) continue;
    const now = readPak(await after.readFile(pack));
    const was = before.files.has(pack) ? readPak(await before.readFile(pack)) : null;
    for (const [index, stream] of now.streams.entries()) {
      const old = was?.streams[index];
      if (old && same(old, stream)) continue;
      let level;
      try {
        level = await inflate(stream);
      } catch (e) {
        throw new Error(`${pack}#${index} is not one the game inflates: ${e.message ?? e}`);
      }
      if (old && same(await inflate(old).catch(() => new Uint8Array(0)), level)) continue;
      out.push({ pack, index, name: now.names[index], stream });
    }
  }
  return out;
}
