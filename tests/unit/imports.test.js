import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../../public/js", import.meta.url));
const IMPORT = /^import\s(?:[^;]*?\sfrom\s+)?"(\.\.?\/[^"]+)"/gm;

/** Every module's path relative to js/, the vendored library left out. */
function modules(at = ".") {
  return readdirSync(join(dir, at), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(at, entry.name);
    if (entry.isDirectory()) return path === "vendor" ? [] : modules(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });
}

/** Each module's static imports, by the file they name, both relative to js/. */
function graph() {
  const out = new Map();
  for (const name of modules()) {
    const text = readFileSync(join(dir, name), "utf8");
    out.set(
      name,
      [...text.matchAll(IMPORT)].map((m) => posix.join(posix.dirname(name), m[1])),
    );
  }
  return out;
}

test("every static import names one of the page's files", () => {
  for (const [name, imports] of graph())
    for (const target of imports) assert.ok(existsSync(join(dir, target)), `${name}: ${target}`);
});

/** Every module `name` reaches through static imports, itself left out. */
function closure(g, name) {
  const seen = new Set();
  const visit = (n) => {
    for (const target of g.get(n) ?? []) if (!seen.has(target)) seen.add(target) && visit(target);
  };
  visit(name);
  return [...seen].sort();
}

// The page preloads the boot's modules so they load in one round rather than
// as each is found in the last; the list is the graph, nothing more and
// nothing less, so the editor's modules stay off a plain visit.
test("the page preloads every module the boot imports, and no other", () => {
  const page = readFileSync(join(dir, "..", "index.html"), "utf8");
  const preloaded = [...page.matchAll(/<link rel="modulepreload" href="js\/([^"]+)" \/>/g)]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(preloaded, closure(graph(), "main.js"));
});

// Modules talk through the event bus rather than importing each other both
// ways, so a module reached again along its own imports is a cycle.
test("no module imports itself through its imports", () => {
  const g = graph();
  const seen = new Map();
  const path = [];
  const visit = (name) => {
    if (seen.get(name) === "done") return;
    if (seen.get(name) === "open")
      assert.fail(`a cycle: ${[...path.slice(path.indexOf(name)), name].join(" -> ")}`);
    seen.set(name, "open");
    path.push(name);
    for (const target of g.get(name) ?? []) visit(target);
    path.pop();
    seen.set(name, "done");
  };
  for (const name of g.keys()) visit(name);
});

// The folders are layers: what each may import is its own layer and those
// beneath it, so nothing of the screen reaches the model, the readers and
// writers reach nothing of the viewer, and nothing of the editor or of play
// reaches the viewer. The lattice every layer lays a level in is the one file
// all may import, and the boot at the root reaches the editor and play through
// a dynamic import alone.
const LATTICE = "format/lattice.js";
const LAYERS = {
  viewer: ["viewer", LATTICE],
  "viewer/ui": ["viewer/ui"],
  "viewer/draw": ["viewer", "viewer/ui", "viewer/draw", LATTICE],
  "viewer/chrome": ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", LATTICE],
  format: ["format", "vendor"],
  editor: ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "format", "editor"],
  play: ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "play", LATTICE],
  ".": ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "format"],
};

test("a module imports only its own layer and those beneath it", () => {
  for (const [name, imports] of graph()) {
    const allowed = LAYERS[posix.dirname(name)];
    assert.ok(allowed, `${name}: not in a layer the table knows`);
    for (const target of imports)
      assert.ok(
        allowed.includes(posix.dirname(target)) || allowed.includes(target),
        `${name} imports ${target}`,
      );
  }
});

// The simulation and what play composes over it are pure: a module of them
// reaches the model, the lattice and these modules, and nothing that paints or
// touches the page, so the ball can be stepped and what play says read without
// a browser.
const PURE = [
  "play/ball.js",
  "play/world.js",
  "play/rules.js",
  "play/game.js",
  "play/passes.js",
  "play/drive.js",
  "play/contact.js",
  "play/hazards.js",
  "play/phrases.js",
  "play/traveller.js",
];

test("a module of the simulation imports only the model, the lattice and the simulation", () => {
  const g = graph();
  for (const name of PURE)
    for (const target of g.get(name))
      assert.ok(
        posix.dirname(target) === "viewer" || target === LATTICE || PURE.includes(target),
        `${name} imports ${target}`,
      );
});

// A module is parsed whole before any of it runs, so one construct the engine
// does not know is a blank page rather than one broken feature; older WebKit
// does not know a regex lookbehind.
test("no module of the page uses a regex lookbehind", () => {
  for (const name of modules())
    assert.ok(!/\(\?<[=!]/.test(readFileSync(join(dir, name), "utf8")), name);
});
