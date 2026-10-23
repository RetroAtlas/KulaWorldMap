import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const docs = ["", "docs/", "backlog/"].flatMap((dir) =>
  readdirSync(root + dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => dir + f),
);
const lines = (path) => readFileSync(root + path, "utf8").split("\n");

// What may follow a line directly; any other line that does is a wrapped paragraph.
const OPENS = /^(#{1,6} |\||```|!\[|\s*([-*+]|\d+\.) )/;

test("a paragraph of the docs is one line, never wrapped", () => {
  for (const path of docs) {
    let fenced = false;
    lines(path).forEach((line, i, all) => {
      if (line.startsWith("```")) fenced = !fenced;
      if (fenced || i === 0 || !line.trim() || !all[i - 1].trim()) return;
      if (OPENS.test(line) || /^(#{1,6} |\||!\[)/.test(all[i - 1])) return;
      assert.fail(`${path}:${i + 1} runs on from the line before it`);
    });
  }
});

const LONGEST_LINE = 1000;

test("every line of the docs is short enough to diff whole", () => {
  const long = [];
  for (const path of docs)
    lines(path).forEach((line, i) => {
      if (line.length > LONGEST_LINE) long.push(`${path}:${i + 1} (${line.length})`);
    });
  assert.deepEqual(long, [], "cut each where its sentences or clauses join, a point to a line");
});
