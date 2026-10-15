import { test } from "node:test";
import assert from "node:assert/strict";
import { SLUG_MOST, slug } from "../../public/js/editor/files.js";

test("a slug is the title composed and lower-cased, every run of anything but letters, their marks and digits one hyphen, trimmed and cut", () => {
  assert.equal(slug("E\u0301pe\u0301e, a\u0300 la mode!!"), "\u00e9p\u00e9e-\u00e0-la-mode");
  assert.equal(
    slug("\u0939\u093f\u0902\u0926\u0940 \u0969"),
    "\u0939\u093f\u0902\u0926\u0940-\u0969",
  );
  assert.equal(slug("q\u0303 marks"), "q\u0303-marks");
  assert.equal(slug("Ti\u1ebfng Vi\u1ec7t"), "ti\u1ebfng-vi\u1ec7t");
  assert.equal(slug(" -- Spiral -- "), "spiral");
  assert.equal(slug("***"), "level");
  assert.equal(slug(""), "level");
  const long = slug(`abc ${"x".repeat(80)}`);
  assert.equal(long.length, SLUG_MOST);
  assert.ok(long.startsWith("abc-xxxx"));
});
