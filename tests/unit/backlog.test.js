import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../backlog", import.meta.url));
const files = readdirSync(dir)
  .filter((f) => f.startsWith("item-"))
  .sort();

test("no two items share a number", () => {
  const ids = files.map((f) => Number(/^item-(\d+)-/.exec(f)[1]));
  assert.equal(new Set(ids).size, ids.length);
});

test("every item titles itself with its own number", () => {
  for (const f of files) {
    const text = readFileSync(`${dir}/${f}`, "utf8");
    const id = Number(/^item-(\d+)-/.exec(f)[1]);
    assert.match(text, new RegExp(`^# ${id}\\. `), f);
  }
});

test("every link between items points at a file that is there", () => {
  const present = new Set(files);
  for (const f of files) {
    const text = readFileSync(`${dir}/${f}`, "utf8");
    for (const [, target] of text.matchAll(/\]\((item-[^)]+)\)/g)) {
      assert.ok(present.has(target), `${f} links to a missing ${target}`);
    }
  }
});
