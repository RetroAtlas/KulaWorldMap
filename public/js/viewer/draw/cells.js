import { state, BLOCK, depth, facing, screen, sliceZ } from "../state.js";
import { cellKey, FACE_NORMAL, KIND } from "../../format/lattice.js";
import { platformCells } from "../data.js";
import { under } from "../travel.js";
import { drawBeams } from "./beams.js";
import { drawBlock, outline } from "./blocks.js";
import { drawRails } from "./overlays.js";
import { drawThing, quietAmongModels } from "./things.js";

export const away = (face) => face !== null && face !== undefined && !facing(FACE_NORMAL[face]);

/** What to draw, back to front. */
export function visible(idx, moving) {
  const out = [];
  for (const cells of [idx.cells, idx.beamCells, idx.railCells]) {
    for (const c of cells.values()) {
      if (c.z < sliceZ() && !state.show.hidden) continue;
      const key = cellKey(c.x, c.y, c.z);
      const r = c.v >= state.data.firstRecord ? idx.records.get(key)?.[0] : null;
      if (r?.kind !== KIND.PLATFORM) {
        const size = cells === idx.cells ? idx.breaking?.get(key) : undefined;
        out.push(size === undefined ? c : { ...c, size });
        // A thing on a face turned away from the view sorts as the cell it
        // stands in, behind its block, so the block hides only what it covers.
        if (cells !== idx.cells) continue;
        for (const m of idx.markers.get(key) || []) {
          if (!away(m.face)) continue;
          const n = FACE_NORMAL[m.face];
          const d = depth(c.x + n[0], c.y + n[1], c.z + n[2]);
          out.push({ x: c.x + n[0], y: c.y + n[1], z: c.z + n[2], d: d + 1e-6, home: c, mark: m });
        }
        continue;
      }
      const offset = moving?.get(`${key}/null`)?.offset || [0, 0, 0];
      platformCells(r).forEach(([x, y, z], k) =>
        out.push({
          ...c,
          x: x + offset[0],
          y: y + offset[1],
          z: z + offset[2],
          home: c,
          k,
          body: [x, y, z],
        }),
      );
    }
  }
  // A travelling thing sorts just in front of the nearest block it stands
  // over, so neither the block it leaves nor the one it rolls onto paints over
  // it. On a face turned away from the view it sorts behind the furthest, so
  // every block it stands over comes in front. One that hands the frame a
  // depth of its own sorts at that.
  if (moving) {
    for (const going of moving.values()) {
      const { w, offset } = going;
      if (w.face === undefined) continue;
      const at = [w.c.x, w.c.y, w.c.z].map((v, i) => v + 0.5 + offset[i]);
      out.push({
        x: at[0],
        y: at[1],
        z: at[2],
        d: going.depth ?? sortDepth(idx, w, offset),
        home: w.c,
        thing: going,
      });
    }
  }
  const far = (e) => e.d ?? depth(e.x, e.y, e.z);
  out.sort((a, b) => far(b) - far(a));
  return out;
}

function sortDepth(idx, w, offset) {
  const cells = under(w, offset);
  const blocks = cells.filter((c) => idx.cells.has(cellKey(...c)));
  // over no block, it sorts as if one were under its middle
  const below = (blocks.length ? blocks : cells.slice(0, 1)).map((c) => depth(...c));
  return away(w.face)
    ? Math.max(...below) + depth(...FACE_NORMAL[w.face]) + 1e-6
    : Math.min(...below) - 1e-6;
}

/** Whether a block at the projected corner can reach into the area, which a
    whole cube about its corner is well within twice its side of. */
export function reaches([px, py], area) {
  const r = BLOCK * state.cam.zoom * 2;
  return px >= area.x0 - r && px <= area.x1 + r && py >= area.y0 - r && py <= area.y1 + r;
}

/** Paint `cells` in their order where they reach into `view`, each block with
    what stands on it and the block and cell hooks run on it, the block `chosen`
    showing what stands on its turned-away faces: `live` says whether anything
    drawn is moving, and `through` is what is to show through the blocks, each
    entry the arguments of its `drawThing`. */
export function paintCells(
  ctx,
  scene,
  cells,
  {
    view,
    moving = null,
    hooks = { block: [], cell: [] },
    chosen,
    selectedKey = null,
    hoverKey = null,
  },
) {
  const { l, idx, atlas, frame, effect } = scene;
  let live = false;
  const through = [];
  const put = (...t) => {
    if (drawThing(ctx, ...t)) live = true;
    const [m, , , , home, going] = t;
    const covered =
      away(m.face) && (state.show.through || cellKey(home.x, home.y, home.z) === chosen);
    if (going?.through) through.push([...t.slice(0, 5), { ...going, shadow: false }]);
    else if (covered) through.push(t);
  };
  const mark = (m, c, home, key) => {
    if (moving?.has(`${key}/${m.face}`)) return;
    if (state.show.models && quietAmongModels(m, !!atlas, key === chosen)) return;
    put(m, c, l, frame, home);
  };

  for (const c of cells) {
    if (!reaches(screen(c.x, c.y, c.z), view)) continue;
    const home = c.home || c;
    const ghost = home.z < sliceZ();
    if (c.beams) {
      if (drawBeams(ctx, c, ghost, effect)) live = true;
      continue;
    }
    if (c.rails) {
      if (state.show.outlines) drawRails(ctx, c, ghost, moving);
      continue;
    }
    if (c.thing) {
      if (state.show.objects && !ghost) put(c.thing.w.m, home, l, frame, home, c.thing);
      continue;
    }
    const key = cellKey(home.x, home.y, home.z);
    if (c.mark) {
      if (state.show.objects && !ghost) mark(c.mark, home, home, key);
      continue;
    }
    const sel = selectedKey === key;
    const hov = hoverKey === key;
    if (drawBlock(ctx, c, home, key, ghost, sel, hov, scene)) live = true;
    for (const fn of hooks.block) fn(ctx, c, home, key, ghost, scene);

    if (state.show.objects && !ghost && !c.k) {
      for (const m of idx.markers.get(key) || []) if (!away(m.face)) mark(m, c, home, key);
    }
    if (sel || hov) outline(ctx, c, idx, sel ? "#ffffff" : "#ffffffb0");
    for (const fn of hooks.cell) fn(ctx, c, home, key, ghost, scene);
  }
  return { live, through };
}
