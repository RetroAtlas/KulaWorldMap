import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DATA_SUBMODE,
  EOF_SUBMODE,
  SECTOR_RAW,
  USER,
  USER_OFF,
  check,
  ecc,
  edc,
  rewrite,
  sector,
} from "../../public/js/format/sectors.js";

// Sectors the Python side built once the disc's own had come out of it bit
// for bit, so the port is held to the disc through them.
const { cases, broken } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/sectors.json", import.meta.url)), "utf8"),
);
const bytes = (b64) => new Uint8Array(Buffer.from(b64, "base64"));
const same = (a, b, name) => assert.deepEqual(Buffer.from(a), Buffer.from(b), name);
const EDC_OFF = 2072;
const ECC_OFF = 2076;
const storedEdc = (raw) => new DataView(raw.buffer, raw.byteOffset).getUint32(EDC_OFF, true);

test("every fixture sector comes out of its address, subheader and user data", () => {
  assert.ok(cases.length >= 12);
  for (const c of cases) {
    const raw = bytes(c.sector);
    const user = bytes(c.user);
    assert.deepEqual([raw.length, user.length], [SECTOR_RAW, USER], c.name);
    same(sector(c.lba, user, c.submode, c.file, c.channel), raw, c.name);
    assert.ok(check(raw), c.name);
    same(rewrite(raw, user), raw, c.name);
    assert.equal(edc(raw), storedEdc(raw), c.name);
    same(ecc(raw), raw.subarray(ECC_OFF), c.name);
  }
});

test("the fixture covers both submodes a pack is written with", () => {
  const submodes = new Set(cases.map((c) => c.submode));
  assert.ok(submodes.has(DATA_SUBMODE) && submodes.has(EOF_SUBMODE));
});

test("a sector with one user byte flipped fails the check, on its EDC and on its ECC", () => {
  assert.equal(broken.length, 2);
  for (const b of broken) {
    const raw = bytes(b.sector);
    const whole = bytes(cases[b.from].sector);
    const differ = [...raw].flatMap((v, i) => (v !== whole[i] ? [i] : []));
    assert.deepEqual(differ, [b.at], b.name);
    assert.equal(b.check, false);
    assert.equal(check(raw), false, b.name);
    assert.notEqual(edc(raw), storedEdc(raw), b.name);
    assert.notDeepEqual(Buffer.from(ecc(raw)), Buffer.from(raw.subarray(ECC_OFF)), b.name);
  }
  for (const c of cases) {
    const raw = bytes(c.sector);
    raw[USER_OFF + 1234] ^= 0x40;
    assert.equal(check(raw), false, c.name);
  }
});

test("a rewrite keeps the sync, header and subheader and recomputes the rest", () => {
  const [a, b] = cases.filter((c) => c.name.startsWith("noise"));
  const raw = bytes(a.sector);
  const out = rewrite(raw, bytes(b.user));
  same(out.subarray(0, USER_OFF), raw.subarray(0, USER_OFF));
  same(out.subarray(USER_OFF, EDC_OFF), bytes(b.user));
  assert.notDeepEqual(Buffer.from(out.subarray(EDC_OFF)), Buffer.from(raw.subarray(EDC_OFF)));
  same(out, sector(a.lba, bytes(b.user), a.submode, a.file, a.channel));
  assert.ok(check(out));
});

test("the parity covers the subheader and the data but not the address", () => {
  const user = bytes(cases.find((c) => c.name === "noise 1").user);
  const here = sector(16, user, DATA_SUBMODE);
  const there = sector(93953, user, DATA_SUBMODE);
  assert.notDeepEqual(
    Buffer.from(here.subarray(0, USER_OFF)),
    Buffer.from(there.subarray(0, USER_OFF)),
  );
  same(here.subarray(EDC_OFF), there.subarray(EDC_OFF));
  const last = sector(16, user, EOF_SUBMODE);
  assert.notEqual(edc(last), edc(here));
  assert.notDeepEqual(Buffer.from(ecc(last)), Buffer.from(ecc(here)));
});

test("user data is one length", () => {
  assert.throws(() => sector(0, new Uint8Array(USER - 1), DATA_SUBMODE), RangeError);
  assert.throws(() => rewrite(new Uint8Array(SECTOR_RAW), new Uint8Array(USER + 1)), RangeError);
});
