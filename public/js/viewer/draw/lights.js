// A device's light takes its own face all over and, past each edge, the first
// face there of those the game tries, at the corners on the edge.
import { state } from "../state.js";
import { cellKey } from "../../format/lattice.js";
import { motionTable, markerCircuit, markerNow, isExit, exitsOpen, lightOnAt } from "../data.js";
import { hasFace } from "./blocks.js";

const FULL = 2;
const PART = 1;

/** The faces a light cast from `face` of the block at `home` takes, each by
    its cell and its number, with the level at each corner. */
function spillOf(idx, glow, home, face) {
  const faces = [];
  for (const group of glow.spill[face]) {
    const found = group.find(([dx, dy, dz, g]) => {
      const c = idx.cells.get(cellKey(home.x + dx, home.y + dy, home.z + dz));
      return c && hasFace(idx, c, g);
    });
    if (!found) continue;
    const [dx, dy, dz, g, levels] = found;
    faces.push({ key: `${cellKey(home.x + dx, home.y + dy, home.z + dz)}/${g}`, levels });
  }
  return faces;
}

const takes = new WeakMap();
function takenBy(idx, glow) {
  if (takes.has(idx)) return takes.get(idx);
  const out = [];
  for (const [key, ms] of idx.markers) {
    for (const m of ms) {
      const colours = m.face === null ? null : glow.colours[m.type];
      if (!colours) continue;
      out.push({ m, faces: spillOf(idx, glow, idx.cells.get(key), m.face), colours });
    }
  }
  takes.set(idx, out);
  return out;
}

function cast(lit, faces, colour, [part, of]) {
  const shade = {
    [FULL]: colour.map((v) => v & ~1),
    [PART]: colour.map((v) => Math.floor((v * part) / of) & ~1),
  };
  for (const { key, levels } of faces) {
    const sum = lit.get(key) ?? levels.map(() => [0, 0, 0]);
    levels.forEach((v, k) => {
      if (shade[v]) sum[k] = sum[k].map((s, ch) => s + shade[v][ch]);
    });
    lit.set(key, sum);
  }
}

// What casts a light besides the devices: a module may hand the frame lights
// of its own, each from a cell and a face and in a colour word of the
// devices' kind, and each takes the faces a device there would, at the same
// levels.
const casters = [];
/** Let `fn(l, idx, frame)` give lights of its own, each `{ x, y, z, face, colour }`. */
export const lightsWith = (fn) => {
  casters.push(fn);
};

/** For each face lit, keyed by its cell and its number among the game's six faces, the
    colour added at each corner in the order of its texture's first turn; and
    whether any device is on or a module casts a light. */
export function deviceLights(l, idx, frame) {
  const glow = motionTable()?.glow;
  const lit = new Map();
  let on = false;
  if (!glow) return { lit, on };
  const world = Math.max(
    0,
    state.data.themes.findIndex((t) => t.id === l.theme),
  );
  for (const { m, faces, colours } of takenBy(idx, glow)) {
    if (state.hiddenKinds.has(m.id)) continue;
    if (markerNow(m) === "on" || (isExit(m) && exitsOpen())) on = true;
    if (!lightOnAt(m, glow.every, frame)) continue;
    cast(lit, faces, colours[world][markerCircuit(m) ?? 0] ?? colours[world][0], glow.part);
  }
  for (const fn of casters) {
    for (const { x, y, z, face, colour } of fn(l, idx, frame) ?? []) {
      const home = idx.cells.get(cellKey(x, y, z));
      if (!home) continue;
      cast(lit, spillOf(idx, glow, home, face), colour, glow.part);
      on = true;
    }
  }
  return { lit, on };
}
