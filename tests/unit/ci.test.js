import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const workflow = text(".github/workflows/ci.yml");
const pin = JSON.parse(text("package.json")).devDependencies["@playwright/test"];

// Only the image of the pinned version is sure to hold its browsers, so the tag moves with the pin.
test("the workflow names Playwright's image once, at the version package.json pins @playwright/test to", () => {
  assert.match(pin, /^\d+\.\d+\.\d+$/, "@playwright/test is pinned to an exact version");
  const tags = Array.from(
    workflow.matchAll(/mcr\.microsoft\.com\/playwright:([^\s"']+)/g),
    (m) => m[1],
  );
  assert.equal(tags.length, 1, "the workflow names Playwright's image once");
  assert.equal(tags[0], `v${pin}-noble`, "the image is tagged with the pinned version");
});

test("no step of the workflow installs a browser, which the image carries", () => {
  const installs = workflow.split("\n").filter((line) => /playwright install/.test(line));
  assert.deepEqual(installs, [], "no step runs playwright install");
});
