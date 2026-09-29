// A device that is on casts a light of its colour on the faces round it,
// which it turns on and off as the game does: its own face all over, and past
// each edge the first face there of those the game tries, at the corners on
// the edge. A frame's lights are summed at each corner, in the game's units,
// where 128 is a face's own brightness.
import { state, cellKey } from "./state.js";
import { motionTable, markerCircuit, markerNow, lightOnAt } from "./data.js";
import { hasFace } from "./blocks.js";

const FULL = 2;
const PART = 1;

// The faces each device's light takes, found once for a level, since what
// they are found against holds still: for each, its key and the level at
// each of its corners, in the order of its texture's first turn.
const takes = new WeakMap();
function takenBy(idx, glow) {
  if (takes.has(idx)) return takes.get(idx);
  const out = [];
  for (const [key, ms] of idx.markers) {
    for (const m of ms) {
      const colours = m.face === null ? null : glow.colours[m.type];
      if (!colours) continue;
      const home = idx.cells.get(key);
      const faces = [];
      for (const group of glow.spill[m.face]) {
        const found = group.find(([dx, dy, dz, g]) => {
          const c = idx.cells.get(cellKey(home.x + dx, home.y + dy, home.z + dz));
          return c && hasFace(idx, c, g);
        });
        if (!found) continue;
        const [dx, dy, dz, g, levels] = found;
        faces.push({ key: `${cellKey(home.x + dx, home.y + dy, home.z + dz)}/${g}`, levels });
      }
      out.push({ m, faces, colours });
    }
  }
  takes.set(idx, out);
  return out;
}

/** The lights on a level at a frame: for each face lit, keyed by its cell's
    key and its number in the game's six, the colour added at each corner in
    the order of its texture's first turn; and whether any device is on,
    whose light will turn over. */
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
    if (markerNow(m) === "on") on = true;
    if (!lightOnAt(m, glow.every, frame)) continue;
    const colour = colours[world][markerCircuit(m) ?? 0] ?? colours[world][0];
    const [part, of] = glow.part;
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
  return { lit, on };
}
