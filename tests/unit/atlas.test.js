import { test } from "node:test";
import assert from "node:assert/strict";
import { releases } from "./fixtures.js";
import { BASE, setCurrent, setReleases } from "../../public/js/viewer/release.js";
import { atlasFor, landed } from "../../public/js/viewer/draw/atlas.js";

// An image the page would fetch, recorded as it is asked for and landing only
// when the test says so.
const images = [];
globalThis.Image = class {
  constructor() {
    this.listeners = {};
    images.push(this);
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  land() {
    this.naturalWidth = this.naturalHeight = 64;
    this.listeners.load();
  }
};

const asked = (from) => images.slice(from).map((img) => img.src);
const settled = () => new Promise((done) => setTimeout(done, 0));

test("a world never asked for has not landed, and the asking starts no fetch", () => {
  const before = images.length;
  assert.equal(landed("INCA"), false);
  assert.deepEqual(asked(before), []);
  assert.equal(atlasFor("INCA"), null);
  assert.deepEqual(asked(before), ["tex/INCA.png"]);
});

test("a world's atlas has landed once its image has, and no other world's atlas with it", async () => {
  const before = images.length;
  assert.equal(atlasFor("MARS"), null);
  const [img] = images.slice(before);
  assert.equal(landed("MARS"), false);
  img.land();
  await settled();
  assert.equal(landed("MARS"), true);
  assert.ok(atlasFor("MARS").ready);
  assert.equal(landed("HELL"), false);
  assert.deepEqual(asked(before), ["tex/MARS.png"]);
});

test("on a disc that names sheets for the world, the atlas has landed once they are drawn over it, and on another disc once that disc's own atlas has", async (t) => {
  setReleases(releases);
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) };
  t.after(() => {
    setCurrent(BASE);
    delete globalThis.document;
  });
  setCurrent("eu");
  const before = images.length;
  assert.equal(landed("HIRO"), false);
  assert.deepEqual(asked(before), []);
  assert.equal(atlasFor("HIRO"), null);
  assert.deepEqual(asked(before), ["tex/HIRO.png", "tex/eu/HIRO.png"]);
  const [base, sheet] = images.slice(before);
  base.land();
  await settled();
  assert.equal(landed("HIRO"), false);
  setCurrent(BASE);
  assert.equal(landed("HIRO"), true);
  setCurrent("eu");
  sheet.land();
  await settled();
  assert.equal(landed("HIRO"), true);
  assert.ok(atlasFor("HIRO").ready);
  setCurrent("jp");
  assert.equal(landed("HIRO"), false);
  assert.deepEqual(asked(before), ["tex/HIRO.png", "tex/eu/HIRO.png"]);
});
