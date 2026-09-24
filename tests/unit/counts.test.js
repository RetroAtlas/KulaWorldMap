import { test } from "node:test";
import assert from "node:assert/strict";
import { mapData, annotations } from "./fixtures.js";
import { setAnnotations, markersOf, objectCount, counted } from "../../public/js/data.js";

setAnnotations(annotations);

const level = (title) => mapData.levels.find((l) => (l.shown || l.name) === title);

test("a level's objects are the markers that stand on a face", () => {
  for (const l of mapData.levels) {
    const onFaces = l.records.flatMap(markersOf).filter((m) => m.face !== null).length;
    assert.equal(objectCount(l), onFaces, l.name);
  }
  const atlantis = level("LEVEL 94");
  assert.equal(atlantis.records.flatMap(markersOf).length, 20);
  assert.equal(objectCount(atlantis), 10);
});

test("a count of one takes the singular", () => {
  assert.equal(counted(1, "object"), "1 object");
  assert.equal(counted(0, "object"), "0 objects");
  assert.equal(counted(30, "object"), "30 objects");
});
