import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { mapData } from "./fixtures.js";
import { slotOf } from "../../public/js/permalink.js";

const text = (path) =>
  readFileSync(fileURLToPath(new URL(`../../public/${path}`, import.meta.url)), "utf8");
const page = text("index.html");
const main = text("js/main.js");
const script = /<script>([\s\S]*?)<\/script>/.exec(page)[1];

/** What the page's own script preloads when it opens at `hash`. */
function preloaded(hash) {
  const links = [];
  const document = {
    head: { append: (link) => links.push(link) },
    createElement: (tag) => ({ tag }),
  };
  vm.runInNewContext(script, { location: { hash }, document });
  return links.map((l) => `${l.tag} ${l.rel} ${l.as} ${l.href}`);
}

const texture = (world) => [`link preload image tex/${world}.png`];

test("the page preloads the textures of the world a link opens on, for every slot on the disc", () => {
  for (const l of mapData.levels)
    assert.deepEqual(preloaded(`#${slotOf(l)}/45,35/fit/33`), texture(l.theme), slotOf(l));
});

test("the page preloads the first level's world without a link, whatever the link's case", () => {
  const first = mapData.levels[0].theme;
  assert.deepEqual(preloaded(""), texture(first));
  assert.deepEqual(preloaded("#"), texture(first));
  assert.deepEqual(preloaded("#inca/11/45,35/fit/33"), texture("INCA"));
  assert.deepEqual(preloaded("#hellfi/1"), texture("HELL"));
});

test("the page preloads no texture for a draft or for a link it cannot read", () => {
  for (const hash of [
    "#DRAFT/1/45,35/fit/33",
    "#NOWHERE/0",
    "#INCA%2F11",
    "#COPYCAT/10",
    "#COPYCAT/x",
  ])
    assert.deepEqual(preloaded(hash), [], hash);
});

test("the page preloads the data files the boot fetches, and no other", () => {
  const fetched = [...main.matchAll(/loadJson\("([^"]+)"/g)].map((m) => m[1]).sort();
  const preloads = [
    ...page.matchAll(/<link rel="preload" href="([^"]+)" as="fetch" crossorigin \/>/g),
  ]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(preloads, fetched);
});
