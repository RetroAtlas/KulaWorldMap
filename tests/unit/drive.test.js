import { test } from "node:test";
import assert from "node:assert/strict";
import { recorder, replayDriver, pack, unpack } from "../../public/js/play/drive.js";

const at = (frame) => ({ words: { frame } });

test("a recorder answers as its driver does and keeps the word it gave each frame", () => {
  const script = [0, 16, 16, 16, 128, 0, 16384];
  const driver = {
    pad: (live) => script[live.words.frame] ?? 0,
    done: (live) => live.words.frame > 6,
  };
  const rec = recorder(driver);
  const given = script.map((_, f) => rec.pad(at(f)));
  assert.deepEqual(given, script);
  assert.deepEqual(rec.pads, script);
  assert.equal(rec.done(at(3)), false);
  assert.equal(rec.done(at(7)), true);
});

test("a replay gives the recording's word for each frame and nothing past its end", () => {
  const replay = replayDriver([16, 16, 128]);
  assert.deepEqual(
    [0, 1, 2, 3, 9].map((f) => replay.pad(at(f))),
    [16, 16, 128, 0, 0],
  );
  assert.equal(replay.done(at(2)), false);
  assert.equal(replay.done(at(3)), true);
});

test("a recording packs into runs and unpacks to the same words", () => {
  const pads = [0, 0, 0, 16, 16, 128, 0, 0, 16384];
  const packed = pack({ slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(packed, {
    v: 1,
    slot: "HIRO/0",
    seed: 1,
    pads: [
      [0, 3],
      [16, 2],
      [128, 1],
      [0, 2],
      [16384, 1],
    ],
  });
  assert.deepEqual(unpack(packed), { slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(unpack(JSON.parse(JSON.stringify(packed))), { slot: "HIRO/0", seed: 1, pads });
  assert.deepEqual(pack({ slot: "x", seed: 1, pads: [] }), { v: 1, slot: "x", seed: 1, pads: [] });
  assert.deepEqual(pack({ slot: "x", seed: 1, pads: [16, undefined, 16] }).pads, [
    [16, 1],
    [0, 1],
    [16, 1],
  ]);
  assert.equal(unpack({ v: 2, slot: "x", seed: 1, pads: [] }), null);
  assert.equal(unpack(null), null);
  assert.equal(unpack({ v: 1, slot: "x", seed: 1 }), null);
});
