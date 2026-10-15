import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync, gzipSync } from "node:zlib";
import { MOST, inflate } from "../../public/js/format/inflate.js";
import { GRID_BYTES, HEAD, RECORD } from "../../public/js/format/kwl.js";

const same = (a, b) => assert.deepEqual(Buffer.from(a), Buffer.from(b));
const noise = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 7919) & 0xff);

test("a zlib stream and a gzip stream inflate to their bytes, read in chunks", async () => {
  const bytes = noise(300000);
  same(await inflate(deflateSync(bytes)), bytes);
  same(await inflate(gzipSync(bytes), "gzip"), bytes);
  same(await inflate(deflateSync(new Uint8Array(0))), new Uint8Array(0));
});

test("the ceiling leaves room for the largest level and refuses what inflates past it", async () => {
  assert.ok(MOST > GRID_BYTES + HEAD + RECORD * 256);
  const bomb = deflateSync(new Uint8Array(MOST + 1));
  await assert.rejects(inflate(bomb), /inflates to more than 1048576 bytes/);
  await assert.rejects(inflate(deflateSync(noise(5000)), "deflate", 4096), /more than 4096 bytes/);
  same(await inflate(deflateSync(noise(4096)), "deflate", 4096), noise(4096));
});

test("a stream that is no stream is refused by the decompressor itself", async () => {
  await assert.rejects(inflate(Uint8Array.from([1, 2, 3, 4])));
  await assert.rejects(inflate(deflateSync(noise(100)), "gzip"));
});
