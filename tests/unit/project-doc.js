import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { annotations, mapData, objects } from "./fixtures.js";
import { NAMES, setAnnotations, setObjects } from "../../public/js/viewer/data.js";
import { state } from "../../public/js/viewer/state.js";
import { FORMAT } from "../../public/js/format/kwl.js";
import { SIDE } from "../../public/js/format/lattice.js";
import { moveBlocks } from "../../public/js/format/project.js";
import { validate } from "../../public/js/format/checks.js";

setAnnotations(annotations);

setObjects(objects);

state.data = mapData;

export const HIDES = objects.skins.hides;

export const START = 30;

export const EXIT = 7;

export const KEY = 31;

export const COIN = 37;

export const GEM = 36;

export const TELEPORTER = 5;

export const SWITCH = 9;

export const WANDERING = 53;

export const WORLD = "HIRO";

export const project = (blocks, more = {}) => ({
  format: FORMAT,
  version: 1,
  title: "t",
  author: "",
  notes: "",
  world: WORLD,
  time: 99,
  hidden: false,
  invisibleFromAfar: false,
  simon: false,
  circuits: {},
  blocks,
  ...more,
});

export const plain = (cell, kind = 0, faces = null) =>
  faces ? { cell, kind, faces } : { cell, kind };

export const start = (facing = 3) => ({ type: START, facing });

export const coin = { type: COIN, variant: 0 };

export const texts = (findings, level) =>
  findings.filter((f) => f.level === level).map((f) => f.text);

export const errors = (blocks, more) =>
  texts(validate(project(blocks, more), HIDES, NAMES), "error");

export const warnings = (blocks, more) =>
  texts(validate(project(blocks, more), HIDES, NAMES), "warning");

export const level = (title) => mapData.levels.find((l) => (l.shown || l.name) === title);

export const doc = readFileSync(
  fileURLToPath(new URL("../../docs/editor.md", import.meta.url)),
  "utf8",
);

/** `p` with its last `k` blocks moved past its far side on x, so what the two share is the rest. */
export function nudged(p, k) {
  const xs = p.blocks.map((b) => b.cell[0]);
  const cells = k > 0 ? p.blocks.slice(-k).map((b) => b.cell) : [];
  return moveBlocks(p, cells, [Math.max(...xs) - Math.min(...xs) + 1, 0, 0]);
}

/** `p` with its first `kept` blocks as they are and the rest laid again as plain blocks in a tower
    a cell past its far side on x, or a cell before its near side where the lattice ends too soon
    past the far side, a square footprint standing on the layer of its lowest blocks, or below it
    where the lattice above that layer is too short for it, laid from the top down, and a start on
    the first laid block where no kept block carries one, so the kept blocks are what the two
    share, the tower a shape unlike the shape of `p` that lies on few of its blocks at any offset. */
export function rebuilt(p, kept) {
  const least = [0, 1].map((i) => Math.min(...p.blocks.map((b) => b.cell[i])));
  const most = [0, 2].map((i) => Math.max(...p.blocks.map((b) => b.cell[i])));
  const k = p.blocks.length - kept;
  const side = Math.max(1, Math.ceil(Math.sqrt(k / SIDE)));
  const layers = Math.ceil(k / (side * side));
  const x0 = most[0] + 1 + side < SIDE ? most[0] + 2 : least[0] - 1 - side;
  const z0 = Math.max(most[1], layers - 1) - layers + 1;
  const cells = [...Array(k).keys()].map((i) => [
    x0 + (i % side),
    least[1] + (Math.floor(i / side) % side),
    z0 + Math.floor(i / (side * side)),
  ]);
  const held = p.blocks.slice(0, kept);
  const started = held.some((b) => Object.values(b.faces ?? {}).some((o) => o.type === START));
  const laid = cells.map((c, i) => (i === 0 && !started ? plain(c, 0, { 0: start() }) : plain(c)));
  return { ...p, blocks: [...held, ...laid] };
}

/** `p` with a plain block added at the cell before its lowest corner on every axis, so what the
    two share is every block of `p` while its corner moves. */
export const cornered = (p) => ({
  ...p,
  blocks: [
    plain([0, 1, 2].map((i) => Math.min(...p.blocks.map((b) => b.cell[i])) - 1)),
    ...p.blocks,
  ],
});

/** `p` with `k` plain blocks laid in columns past its far side on x, a cell between, on the layer
    of its highest blocks, so what the two share is every block of `p`. */
export function grown(p, k) {
  const least = [0, 1, 2].map((i) => Math.min(...p.blocks.map((b) => b.cell[i])));
  const most = [0, 1].map((i) => Math.max(...p.blocks.map((b) => b.cell[i])));
  const rows = most[1] - least[1] + 1;
  const laid = [...Array(k).keys()].map((i) =>
    plain([most[0] + 2 + Math.floor(i / rows), least[1] + (i % rows), least[2]]),
  );
  return { ...p, blocks: [...p.blocks, ...laid] };
}

/** `p` without the slot a copy came from. */
export const own = (p) =>
  Object.fromEntries(Object.entries(p).filter(([k]) => !["from", "fromRelease"].includes(k)));
