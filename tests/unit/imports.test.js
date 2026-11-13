import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";

const dir = fileURLToPath(new URL("../../public/js", import.meta.url));
const IMPORT = /^import\s(?:[^;]*?\sfrom\s+)?"(\.\.?\/[^"]+)"/gm;
const VENDOR = "vendor";

/** Every module's path relative to js/, the vendored library left out. */
function modules(at = ".") {
  return readdirSync(join(dir, at), { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(at, entry.name);
    if (entry.isDirectory()) return path === VENDOR ? [] : modules(path);
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
// writers reach nothing of the viewer, and nothing of the editor, of play or
// of the community layer reaches the viewer. The lattice every layer lays a
// level in is the one file all may import, and the boot at the root reaches
// the editor, play and the community layer through a dynamic import alone.
const LATTICE = "format/lattice.js";
const LAYERS = {
  viewer: ["viewer", LATTICE],
  "viewer/ui": ["viewer/ui"],
  "viewer/draw": ["viewer", "viewer/ui", "viewer/draw", LATTICE],
  "viewer/chrome": ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", LATTICE],
  format: ["format", VENDOR],
  editor: ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "format", "editor"],
  play: ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "play", LATTICE],
  community: ["viewer", "viewer/ui", "viewer/draw", "viewer/chrome", "format", "community"],
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

/** The rows `row` names, itself left out, a file standing for its folder. */
function named(row) {
  const names = LAYERS[row].map((entry) => (entry.endsWith(".js") ? posix.dirname(entry) : entry));
  return [...new Set(names)].filter((name) => name !== row && Object.hasOwn(LAYERS, name));
}

// Rows that name each other let every module pass, each importing within its row.
test("the table of layers is an order, a row naming only itself and the rows beneath it", () => {
  const cycles = [];
  const seen = new Map();
  const path = [];
  const visit = (row) => {
    if (seen.get(row) === "done") return;
    if (seen.get(row) === "open") {
      cycles.push([...path.slice(path.indexOf(row)), row].join(" -> "));
      return;
    }
    seen.set(row, "open");
    path.push(row);
    for (const below of named(row)) visit(below);
    path.pop();
    seen.set(row, "done");
  };
  for (const row of Object.keys(LAYERS)) visit(row);
  assert.deepEqual(cycles, []);
});

// An entry that names nothing would pass unseen, and a file nothing of its row imports would let
// in what nothing uses.
test("every entry of the table of layers is a row, the vendored folder or a module its row imports", () => {
  const g = graph();
  const imported = (row, file) =>
    [...g].some(([name, imports]) => posix.dirname(name) === row && imports.includes(file));
  const stray = [];
  const unused = [];
  for (const [row, entries] of Object.entries(LAYERS))
    for (const entry of entries) {
      const file = entry.endsWith(".js");
      if (file ? !g.has(entry) : !Object.hasOwn(LAYERS, entry) && entry !== VENDOR)
        stray.push(`${row}: ${entry}`);
      else if (file && !imported(row, entry)) unused.push(`${row}: ${entry}`);
    }
  assert.deepEqual(stray, [], "an entry is a row, the vendored folder or a module");
  assert.deepEqual(unused, [], "a module a row names is imported from that row's folder");
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
  "play/eye.js",
];

test("a pure module of play imports only the model, the lattice and the pure modules", () => {
  const g = graph();
  for (const name of PURE)
    for (const target of g.get(name))
      assert.ok(
        posix.dirname(target) === "viewer" || target === LATTICE || PURE.includes(target),
        `${name} imports ${target}`,
      );
});

// A module of the page declares as it is imported and wires in a function its
// owner calls, so the order the page is wired in is the boot's own list and
// never the order an import graph happens to be evaluated in. The readers and
// writers reach no page, and may build a table as they are imported.
const ACTS =
  "Program > :not(ImportDeclaration, ExportNamedDeclaration, ExportDefaultDeclaration, " +
  "ExportAllDeclaration, FunctionDeclaration, VariableDeclaration, ClassDeclaration)";
const MODULE = { ecmaVersion: "latest", sourceType: "module" };
const source = (name) => readFileSync(join(dir, name), "utf8");

test("no module of the page but the boot acts as it is imported", () => {
  const linter = new Linter();
  const acting = (name) =>
    linter
      .verify(source(name), {
        languageOptions: MODULE,
        rules: { "no-restricted-syntax": ["error", ACTS] },
      })
      .map((e) => `${name}:${e.line}`);
  assert.ok(acting("main.js").length, "the sweep finds the boot's own statements");
  assert.deepEqual(
    modules()
      .filter((name) => name !== "main.js" && posix.dirname(name) !== "format")
      .flatMap(acting),
    [],
  );
});

const WIRES = /^(wire|boot)[A-Z]/;

/** Every name a module exports of its own, declared at the export or listed by it. */
const exported = (ast) =>
  ast.body.flatMap((node) => {
    if (node.type !== "ExportNamedDeclaration" || node.source) return [];
    const made = node.declaration;
    if (!made) return node.specifiers.map((s) => s.exported.name);
    return made.declarations ? made.declarations.map((d) => d.id.name) : [made.id.name];
  });

/** Every use of a name of `names` in a module's tree that is not its declaration, its export
    or its import under its own name: how it is used and the named function it stands in. */
function uses(ast, names) {
  const out = [];
  const own = new Set(exported(ast));
  for (const node of ast.body)
    for (const s of node.type === "ImportDeclaration" ? node.specifiers : []) {
      if (s.type !== "ImportSpecifier") continue;
      if (s.imported.name === s.local.name) own.add(s.local.name);
      else if (names.has(s.imported.name))
        out.push({ name: s.imported.name, how: "imported under another name" });
    }
  const visit = (node, parent, within) => {
    if (!node || typeof node.type !== "string") return;
    if (/^(Import|Export(Named|All|Default)?)Declaration$/.test(node.type) && !node.declaration)
      return;
    let inside = within;
    if (node.type === "FunctionDeclaration") inside = node.id.name;
    else if (node.type === "VariableDeclarator" && /Function/.test(node.init?.type ?? ""))
      inside = node.id.name;
    const called = parent?.type === "CallExpression" && parent.callee === node;
    if (node.type === "Identifier" && names.has(node.name) && own.has(node.name)) {
      const declared =
        (parent.type === "FunctionDeclaration" || parent.type === "VariableDeclarator") &&
        parent.id === node;
      if (!declared) out.push({ name: node.name, how: called ? "called" : "named", within });
    }
    if (node.type === "MemberExpression" && !node.computed && names.has(node.property.name))
      out.push({ name: node.property.name, how: called ? "called" : "named", within });
    for (const [key, child] of Object.entries(node)) {
      if (key === "parent" || (node.type === "MemberExpression" && key === "property")) continue;
      for (const kid of Array.isArray(child) ? child : [child]) visit(kid, node, inside);
    }
  };
  for (const node of ast.body) visit(node, ast, null);
  return out;
}

// A wiring function nobody calls leaves its module dead without an error, and one called
// twice registers every listener twice, where a module that wired itself could be neither.
test("every wiring function a module exports is called once, by the boot or by a wiring function", () => {
  const linter = new Linter();
  const trees = new Map(
    modules().map((name) => {
      assert.deepEqual(linter.verify(source(name), { languageOptions: MODULE }), [], name);
      return [name, linter.getSourceCode().ast];
    }),
  );
  const wired = [...trees.values()].flatMap((ast) => exported(ast).filter((n) => WIRES.test(n)));
  assert.ok(wired.length, "the sweep finds the wiring functions");
  assert.equal(new Set(wired).size, wired.length, "a wiring function's name is its own");
  const calls = new Map(wired.map((name) => [name, []]));
  const wrong = [];
  for (const [module, ast] of trees)
    for (const { name, how, within } of uses(ast, new Set(wired))) {
      if (how !== "called") wrong.push(`${module}: ${name} is ${how}`);
      else if (module !== "main.js" && !WIRES.test(within ?? ""))
        wrong.push(`${module}: ${name} is called in ${within ?? "the module"}`);
      else calls.get(name).push(module);
    }
  for (const [name, by] of calls)
    if (by.length !== 1) wrong.push(`${name} is called ${by.length} times`);
  assert.deepEqual(wrong, []);
});

// A module is parsed whole before any of it runs, so one construct the engine
// does not know is a blank page rather than one broken feature; older WebKit
// does not know a regex lookbehind.
test("no module of the page uses a regex lookbehind", () => {
  for (const name of modules())
    assert.ok(!/\(\?<[=!]/.test(readFileSync(join(dir, name), "utf8")), name);
});

// The Wayback Machine declares these above the first line of every module it serves.
const WAYBACK = ["window", "self", "document", "location", "top", "parent", "frames", "opener"];

test("every module of the page parses as the Wayback Machine serves it", () => {
  const above = WAYBACK.map((name) => `var ${name};`).join(" ");
  const linter = new Linter();
  const errors = modules().flatMap((name) =>
    linter
      .verify(above + readFileSync(join(dir, name), "utf8"), {
        languageOptions: { ecmaVersion: "latest", sourceType: "module" },
      })
      .map((e) => `${name}:${e.line}: ${e.message}`),
  );
  assert.deepEqual(errors, []);
});
