import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const text = (path) => readFileSync(new URL(path, root), "utf8");
const partials = readdirSync(new URL("public/css/", root))
  .filter((name) => !name.startsWith("."))
  .sort();

/** The hrefs of a page's stylesheet links, in the page's order, its comments apart. */
const linked = (page) =>
  [
    ...text(`public/${page}`)
      .replace(/<!--[\s\S]*?-->/g, "")
      .matchAll(/<link\b[^>]*>/g),
  ]
    .map(([tag]) => tag)
    .filter((tag) => /\brel="[^"]*\bstylesheet\b/.test(tag))
    .map((tag) => /\bhref="([^"]*)"/.exec(tag)?.[1] ?? "");

// The link order is the cascade, and the partials' names carry it.
test("the page links every partial under css/, each once and in name order, and no other stylesheet", () => {
  assert.ok(partials.length > 0, "a partial under public/css");
  assert.deepEqual(
    linked("index.html"),
    partials.map((name) => `css/${name}`),
  );
});

test("a partial is named NN-word.css, its rank first", () => {
  for (const name of partials) assert.match(name, /^\d\d-[a-z]+\.css$/, name);
});

// A rule under either query wins a tie against the rule it narrows by coming later.
test("no partial but the one linked last opens a block under a phone's width or under reduced motion", () => {
  const narrow = (name) =>
    [...text(`public/css/${name}`).matchAll(/@media\b([^{]*)\{/g)]
      .map(([, query]) => query.trim())
      .filter((query) => /max-width|\bwidth\s*<|prefers-reduced-motion/.test(query));
  assert.ok(narrow(partials.at(-1)).length > 0, "a block under either query in the last partial");
  for (const name of partials.slice(0, -1)) assert.deepEqual(narrow(name), [], name);
});

// A script that follows a stylesheet still loading waits for it.
test("the page links its stylesheet after its inline script", () => {
  const page = text("public/index.html").replace(/<!--[\s\S]*?-->/g, "");
  const first = page.search(/<link\b[^>]*\brel="[^"]*\bstylesheet\b/);
  assert.ok(first >= 0 && page.lastIndexOf("</script>", first) >= 0);
  assert.doesNotMatch(page.slice(first), /<script\b(?![^>]*\bsrc=)/);
});

test("the docs list every partial, a bullet a partial, in name order", () => {
  const listed = [...text("docs/viewer.md").matchAll(/^- `(\d\d-[a-z]+\.css)` holds /gm)];
  assert.deepEqual(
    listed.map(([, name]) => name),
    partials,
  );
});

test("the page for a missing path links partials by paths from the root, in name order, that declare every custom property it reads, and no partial it leaves out sets one again", () => {
  const hrefs = linked("404.html");
  assert.ok(hrefs.length > 0, "a stylesheet link");
  for (const href of hrefs)
    assert.ok(
      href.startsWith("/css/") && partials.includes(href.slice(5)),
      `${href} is no partial`,
    );
  assert.deepEqual(hrefs, [...new Set(hrefs)].sort(), "each once, in name order");
  const declared = hrefs.map((href) => text(`public${href}`)).join("\n");
  const sets = (sheet, name) => new RegExp(`(^|[\\s{;])${name}\\s*:`).test(sheet);
  for (const [, name] of `${text("public/404.html")}\n${declared}`.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(sets(declared, name), `${name} is declared in no partial the page links`);
    for (const partial of partials)
      assert.ok(
        hrefs.includes(`/css/${partial}`) || !sets(text(`public/css/${partial}`), name),
        `${name} is set again in ${partial}, which the page does not link`,
      );
  }
});
