import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PARTS } from "../frame/parts.js";

const dir = fileURLToPath(new URL("../../public/js", import.meta.url));

// The frame tool charges a sample to the outermost of these functions on its
// stack; a part whose function no module defines counts to the draw itself.
test("every part the frame tool names is a function some module defines", () => {
  const files = readdirSync(dir, { recursive: true }).filter(
    (f) => f.endsWith(".js") && !f.startsWith("vendor/"),
  );
  const source = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  const defines = (name) =>
    new RegExp(`\\b(function\\s+${name}\\b|(const|let)\\s+${name}\\s*=)`).test(source);
  const missing = Object.keys(PARTS).filter((name) => !defines(name));
  assert.deepEqual(missing, [], `no module under public/js defines ${missing.join(", ")}`);
});
