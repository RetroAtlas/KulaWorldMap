// A Mode 2 Form 1 sector as the disc has it: sync, the address in BCD and the
// mode, the subheader twice, 2048 bytes of user data, then the EDC, a CRC-32
// over the subheader and the data, and the ECC, Reed-Solomon parity over the
// header, subheader, data and EDC with the header read as zero. The ECC reads
// the bytes it covers as two planes, the even bytes and the odd; P closes each
// column of a plane laid out as 24 rows of 43, and Q each diagonal of the
// plane and its P parity laid out as 26 rows of 43. tools/kula_sector.py is
// the same arithmetic, and the fixture holds the two to each other.

export const SECTOR_RAW = 2352;
export const USER = 2048;
export const USER_OFF = 24;
export const DATA_SUBMODE = 0x08;
export const EOF_SUBMODE = 0x89;

const SYNC = Uint8Array.of(0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0);
const HEADER_OFF = 12;
const SUBHEADER_OFF = 16;
const EDC_OFF = 2072;
const ECC_OFF = 2076;
const MODE = 2;
const PREGAP = 150;
const FRAMES = 75;

const EDC_POLY = 0xd8018001;
const GF_POLY = 0x11d;
const PLANES = 2;
const P_ROWS = 24;
const P_COLS = 43;
const Q_ROWS = 26;
const Q_COLS = 43;
const P_STRIDE = PLANES * P_COLS;
const Q_STRIDE = PLANES * (Q_COLS + 1);
const P_SPAN = EDC_OFF + 4 - HEADER_OFF;
const P_PARITY = 2 * P_STRIDE;
const Q_SPAN = P_SPAN + P_PARITY;
const Q_PARITY = 2 * PLANES * Q_ROWS;

const EDC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let x = i;
  for (let k = 0; k < 8; k++) x = (x >>> 1) ^ (x & 1 ? EDC_POLY : 0);
  EDC_TABLE[i] = x;
}
const TIMES_ALPHA = new Uint8Array(256);
const OVER_ALPHA1 = new Uint8Array(256);
for (let v = 0; v < 256; v++) TIMES_ALPHA[v] = (v << 1) ^ (v & 0x80 ? GF_POLY : 0);
for (let v = 0; v < 256; v++) OVER_ALPHA1[v ^ TIMES_ALPHA[v]] = v;

/** The CRC-32 of a sector's subheader and user data. */
export function edc(raw) {
  let e = 0;
  for (let i = SUBHEADER_OFF; i < EDC_OFF; i++) e = (e >>> 8) ^ EDC_TABLE[(e ^ raw[i]) & 0xff];
  return e >>> 0;
}

// The two bytes that close the codeword read from body at start, every step
// bytes, round again at wrap, under a check matrix of a row of ones over a row
// of descending powers of alpha.
function parity(body, start, step, count, wrap, out, at, apart) {
  let s0 = 0;
  let s1 = 0;
  for (let k = 0, i = start; k < count; k++, i = (i + step) % wrap) {
    s0 ^= body[i];
    s1 = TIMES_ALPHA[s1 ^ body[i]];
  }
  const p = OVER_ALPHA1[TIMES_ALPHA[s1] ^ s0];
  out[at] = p;
  out[at + apart] = p ^ s0;
}

/** The 276 parity bytes of a sector's header, subheader, user data and EDC. */
export function ecc(raw) {
  const body = new Uint8Array(Q_SPAN);
  body.set(raw.subarray(HEADER_OFF + 4, EDC_OFF + 4), 4);
  for (let m = 0; m < P_STRIDE; m++)
    parity(body, m, P_STRIDE, P_ROWS, P_SPAN, body, P_SPAN + m, P_STRIDE);
  const out = new Uint8Array(P_PARITY + Q_PARITY);
  out.set(body.subarray(P_SPAN));
  for (let m = 0; m < PLANES * Q_ROWS; m++) {
    const first = (m >> 1) * P_STRIDE + (m & 1);
    parity(body, first, Q_STRIDE, Q_COLS, Q_SPAN, out, P_PARITY + m, PLANES * Q_ROWS);
  }
  return out;
}

const bcd = (n) => Math.floor(n / 10) * 16 + (n % 10);

function close(raw) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  view.setUint32(EDC_OFF, edc(raw), true);
  raw.set(ecc(raw), ECC_OFF);
  return raw;
}

function withUser(raw, user) {
  if (user.length !== USER) throw new RangeError(`a sector carries ${USER} bytes of user data`);
  raw.set(user, USER_OFF);
  return close(raw);
}

/** A sector at an address, carrying the user data given. */
export function sector(lba, user, submode, file = 0, channel = 0) {
  const raw = new Uint8Array(SECTOR_RAW);
  raw.set(SYNC);
  const address = lba + PREGAP;
  const minutes = Math.floor(address / (60 * FRAMES));
  const seconds = Math.floor(address / FRAMES) % 60;
  raw.set([bcd(minutes), bcd(seconds), bcd(address % FRAMES), MODE], HEADER_OFF);
  raw.set([file, channel, submode, 0], SUBHEADER_OFF);
  raw.set([file, channel, submode, 0], SUBHEADER_OFF + 4);
  return withUser(raw, user);
}

/** The sector with its user data replaced and its sync, header and subheader kept. */
export function rewrite(raw, user) {
  const out = new Uint8Array(SECTOR_RAW);
  out.set(raw.subarray(0, USER_OFF));
  return withUser(out, user);
}

/** Whether the sector's EDC and ECC are those of its bytes. */
export function check(raw) {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (view.getUint32(EDC_OFF, true) !== edc(raw)) return false;
  const want = ecc(raw);
  for (let i = 0; i < want.length; i++) if (raw[ECC_OFF + i] !== want[i]) return false;
  return true;
}
