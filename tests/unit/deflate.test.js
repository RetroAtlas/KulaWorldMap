import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflate } from "../../public/js/format/deflate.js";

// Streams zlib itself wrote, at the two levels the page compresses at.
const { vectors } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/deflate-vectors.json", import.meta.url)), "utf8"),
);
const bytes = (b64) => new Uint8Array(Buffer.from(b64, "base64"));

test("the page's deflate writes the bytes zlib writes, at level 6 and at level 9", () => {
  assert.ok(vectors.length >= 4);
  for (const v of vectors) {
    const input = bytes(v.input);
    for (const level of [6, 9]) {
      const out = deflate(input, level);
      assert.deepEqual(
        Buffer.from(out),
        Buffer.from(bytes(v[`level${level}`])),
        `${v.name} at ${level}`,
      );
    }
    assert.deepEqual([...deflate(input, 6).slice(0, 2)], [0x78, 0x9c], v.name);
    assert.deepEqual([...deflate(input, 9).slice(0, 2)], [0x78, 0xda], v.name);
  }
});
