import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData } from "./fixtures.js";
import { carriesLevel, parseHash, slotOf } from "../../public/js/viewer/permalink.js";
import { TEXT_MOST, fromLevel, writeProject } from "../../public/js/format/project.js";
import { SHARED_PACK, digestOf } from "../../public/js/format/share.js";
import { encodeLevel } from "../../public/js/format/sharewrite.js";
import { LINK_MOST, shareLink } from "../../public/js/editor/sharelink.js";

const ORIGIN = "https://example.test/map/";
const cam = { yaw: 45, pitch: 35, zoom: 0.9, panX: 1.5, panY: -0.25 };
// a view with a zoom, a pan and a selected cell, none of which the link is to carry
const parts = { cam, target: [17, 12, 17], fitted: false, slice: 20, picked: [17, 12, 17] };
const templates = mapData.levels.map((l) => fromLevel(l));
const hashOf = (link) => link.slice(ORIGIN.length);
const seeded = (seed) => () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
/** `n` characters drawn from the whole of the planes above the first, which deflate shortens little. */
const wide = (n, next) =>
  Array.from({ length: n }, () =>
    String.fromCodePoint(0x10000 + Math.floor(next() * 0x100000)),
  ).join("");

test("every template's link is the origin and a full-form hash: the shared slot at the digest of its text, the turn, fit, the slice, no cell and its segment as the one tail", () => {
  for (const [i, p] of templates.entries()) {
    const name = mapData.levels[i].name;
    const link = shareLink(p, parts, ORIGIN);
    const slot = slotOf({ pack: SHARED_PACK, index: digestOf(writeProject(p)) });
    assert.equal(link, `${ORIGIN}#${slot}/45,35/fit/20/${encodeLevel(p)}`, name);
    const read = parseHash(hashOf(link));
    assert.equal(read.slot, `SHARED/${digestOf(writeProject(p))}`, name);
    assert.deepEqual(read.tails, [encodeLevel(p)], name);
    assert.deepEqual(read.turn, [45, 35], name);
    assert.equal(read.slice, 20, name);
    assert.deepEqual(
      [read.zoom, read.target, read.pan, read.picked],
      [null, null, null, null],
      name,
    );
    assert.ok(carriesLevel(hashOf(link)), name);
    assert.ok(link.length <= LINK_MOST, `${name}: ${link.length}`);
  }
});

test("the link takes the turn and the slice the view hands it, the yaw wrapped to a circle and the pitch rounded", () => {
  const turned = {
    cam: { ...cam, yaw: -30.4, pitch: 20.3 },
    target: [1, 2, 3],
    fitted: true,
    slice: 12,
    picked: null,
  };
  const read = parseHash(hashOf(shareLink(templates[3], turned, ORIGIN)));
  assert.deepEqual(read.turn, [330, 20]);
  assert.equal(read.slice, 12);
  assert.deepEqual([read.zoom, read.target, read.pan, read.picked], [null, null, null, null]);
});

test("the bound stands at eight thousand characters, which an author and notes at their longest in a wide script pass", () => {
  assert.equal(LINK_MOST, 8000);
  const next = seeded(7);
  const long = { ...templates[0], author: wide(TEXT_MOST, next), notes: wide(TEXT_MOST, next) };
  assert.ok(shareLink(long, parts, ORIGIN).length > LINK_MOST);
  assert.ok(carriesLevel(hashOf(shareLink(long, parts, ORIGIN))));
});
