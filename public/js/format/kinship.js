// Whether a level is a copy of one of the game's levels, keeps part of the one it was copied from
// or resembles one, judged by its blocks alone: a level's shape is its blocks as cells and kinds,
// the blocks two levels hold in common are counted at the best alignment of the one over the
// other, and the share two levels have is that count over the more numerous of the two.
import { SIDE } from "./lattice.js";

/** The share at which a copy of the level its `from` names is refused and a level resembles a
    shipped level, the lower one at which a copy is noted as keeping part of the level its `from`
    names, and the fewest blocks in common a resemblance takes. */
export const NEAR = 1 / 2;
export const FROM_NOTE = 1 / 5;
export const FLOOR = 8;

const onLattice = (v) => Number.isSafeInteger(v) && v >= 0 && v < SIDE;
const isBlock = (b) =>
  b !== null &&
  typeof b === "object" &&
  Array.isArray(b.cell) &&
  b.cell.length === 3 &&
  b.cell.every(onLattice) &&
  Number.isSafeInteger(b.kind);

/** The blocks of `project` as `"x,y,z,kind"`; a block without a cell of three whole numbers on
    the lattice and a whole number for its kind is left out. */
export function shapeOf(project) {
  const blocks = Array.isArray(project?.blocks) ? project.blocks.filter(isBlock) : [];
  return new Set(blocks.map((b) => `${b.cell.join()},${b.kind}`));
}

/** The cells of `shape` as numbers, three to a block, by kind. */
function byKind(shape) {
  const out = new Map();
  for (const block of shape) {
    const [x, y, z, kind] = block.split(",").map(Number);
    let cells = out.get(kind);
    if (cells === undefined) out.set(kind, (cells = []));
    cells.push(x, y, z);
  }
  return out;
}

// An offset between two cells of the lattice, packed as one whole number.
const SPAN = 2 * SIDE - 1;
const packed = (dx, dy, dz) => (dx * SPAN + dy) * SPAN + dz;

/** The most blocks of `a` that lie on blocks of `b` of the same kind at one offset, each pair of
    a block of each with the same kind counted under the offset between them. */
function aligned(a, b) {
  const counts = new Map();
  let best = 0;
  for (const [kind, cells] of a) {
    const others = b.get(kind);
    if (others === undefined) continue;
    for (let i = 0; i < cells.length; i += 3)
      for (let j = 0; j < others.length; j += 3) {
        const at = packed(
          others[j] - cells[i],
          others[j + 1] - cells[i + 1],
          others[j + 2] - cells[i + 2],
        );
        const n = (counts.get(at) ?? 0) + 1;
        counts.set(at, n);
        if (n > best) best = n;
      }
  }
  return best;
}

/** How many blocks `a` and `b` hold in common at the best alignment of the one over the other. */
export const commonOf = (a, b) => aligned(byKind(a), byKind(b));

/** The blocks `a` and `b` hold in common over the more numerous of the two, 0 where either is
    empty, so a level that holds a small one whole is not its edit unless little else stands in it. */
export function shareOf(a, b) {
  if (!a.size || !b.size) return 0;
  return commonOf(a, b) / Math.max(a.size, b.size);
}

/** The shapes of `entries`, each `{ slot, project }`, by slot. */
export const shapesOf = (entries) =>
  new Map(entries.map(({ slot, project }) => [slot, shapeOf(project)]));

/** The slot of `shapes` that `from` names, the variant of `fromRelease` where one is keyed and
    else the slot as written, or null where it names none. */
function named({ from, fromRelease }, shapes) {
  if (typeof from !== "string") return null;
  const variant = `${from}@${fromRelease}`;
  if (typeof fromRelease === "string" && shapes.has(variant)) return variant;
  return shapes.has(from) ? from : null;
}

/** The shipped level `project` is a copy of, keeps part of or resembles, as `{ slot, share, from,
    refused }`, or null where it is none: the level `from` names at FROM_NOTE or more, `from` true
    and `refused` where the share is NEAR or more, else the nearest of all at NEAR or more with
    FLOOR blocks or more in common, `from` and `refused` false. */
export function kinOf(project, shapes) {
  const shape = shapeOf(project);
  if (!shape.size) return null;
  const cells = byKind(shape);
  const against = (other) => aligned(cells, byKind(other));
  const slot = named(project, shapes);
  if (slot !== null) {
    const other = shapes.get(slot);
    const share = other.size ? against(other) / Math.max(shape.size, other.size) : 0;
    if (share >= FROM_NOTE) return { slot, share, from: true, refused: share >= NEAR };
  }
  let best = null;
  for (const [at, other] of shapes) {
    const over = Math.max(shape.size, other.size);
    // every block of the fewer in common would still fall short of the bar
    if (Math.min(shape.size, other.size) < NEAR * over) continue;
    const common = against(other);
    const share = common / over;
    if (common >= FLOOR && share >= NEAR && (best === null || share > best.share))
      best = { slot: at, share, from: false, refused: false };
  }
  return best;
}
