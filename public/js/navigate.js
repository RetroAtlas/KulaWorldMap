import { $, emit, on } from "./dom.js";
import { state, SIDE, BLOCK, project, levelCentre, cellKey, sliceZ } from "./state.js";
import {
  index,
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelPoints,
  levelScore,
} from "./data.js";
import { draw, invalidatePick } from "./render.js";
import { showCell, clearDetail } from "./detail.js";

export function selectLevel(i, { keepView = false } = {}) {
  const l = state.data.levels[i];
  if (!l) return;
  // Nothing lies behind the first level shown, so arriving there is no entry.
  const left = state.lvl !== null;
  if (i !== state.li) state.presses = new Map();
  state.li = i;
  state.lvl = l;
  state.idx = index(l);
  clearDetail();
  state.hover = null;
  if (!keepView) {
    state.slice = SIDE - 1;
    fit();
  }
  invalidatePick();
  emit("level-changed", i);
  chip();
  draw();
  writeHash(left && !keepView);
}

/** Centre on the level and pick a zoom that shows all of it. */
export function fit() {
  const l = state.lvl;
  if (!l) return;
  // Fitting against a view of no size yields the zoom clamp rather than a fit,
  // so wait for the size to arrive and fit then.
  if (!state.view.w || !state.view.h) {
    state.needsFit = true;
    return;
  }
  state.needsFit = false;
  state.target = levelCentre(l);
  state.cam.panX = state.cam.panY = 0;
  const [tx, ty] = project(...state.target);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z] = l.cells.slice(i, i + 3);
    for (const dx of [0, 1])
      for (const dy of [0, 1])
        for (const dz of [0, 1]) {
          const [px, py] = project(x + dx, y + dy, z + dz);
          x0 = Math.min(x0, px - tx);
          x1 = Math.max(x1, px - tx);
          y0 = Math.min(y0, py - ty);
          y1 = Math.max(y1, py - ty);
        }
  }
  if (!Number.isFinite(x0)) return;
  const { w, h } = state.view;
  const pad = 60;
  const zx = (w - pad) / Math.max(1e-3, (x1 - x0) * BLOCK);
  const zy = (h - pad) / Math.max(1e-3, (y1 - y0) * BLOCK);
  state.cam.zoom = Math.max(0.08, Math.min(3, Math.min(zx, zy)));
}

export function centreOn(x, y, z) {
  state.target = [x + 0.5, y + 0.5, z + 0.5];
  state.cam.panX = state.cam.panY = 0;
}

export function chip() {
  const l = state.lvl;
  if (!l) return;
  const parts = [
    `<b>${levelTitle(l)}</b>`,
    `<span class="sep">·</span>${worldName(l.theme)}`,
    `<span class="sep">·</span>${counted(blockCount(l), "block")}`,
  ];
  const n = objectCount(l);
  if (n) parts.push(`<span class="sep">·</span>${counted(n, "object")}`);
  const points = levelPoints(l);
  const score = levelScore(l);
  if (score !== null) parts.push(`<span class="sep">·</span>${score} points`);
  else if (points) parts.push(`<span class="sep">·</span>${points} points`);
  if (l.camera?.time !== undefined)
    parts.push(`<span class="sep">·</span><span class="t">time ${l.camera.time}</span>`);
  if (sliceZ() > l.min[2]) parts.push(`<span class="sep">·</span>sliced to z\u2265${sliceZ()}`);
  if (score !== null) parts.push(`<span class="sep">·</span>${points} points on the disc`);
  const note = levelNote(l);
  if (note) parts.push(`<div class="note">${note}</div>`);
  $("chip").innerHTML = parts.join("");
}

// While the hash is being read back, the camera is still at its defaults until
// the last line of applyHash. Anything that writes the hash before then would
// put those defaults in the URL, and the next reload would believe them.
let restoring = false;
const r2 = (v) => Math.round(v * 100) / 100;

// Browsers rate-limit replaceState (Safari at 100 per 30s, Firefox at 50 per
// 10s) and throw once past it, so a drag that wrote on every pointer event
// would take the throw inside the drag rather than merely lose the URL.
let queued = 0;
// A change of level or a find is a history entry, so Back returns to what
// was left behind; a turn, a pan, a zoom or a slice only brings the entry up
// to date. The entry outlives the quieter writes that ride on its heels in
// the same frame, so the one write carries it.
let entry = false;

// A level is keyed by its pack and its slot in it, which is the disc's own
// address and the one the cheat takes.
const slotOf = (l) => `${/([^/]+)\.PAK$/.exec(l.pack)[1]}/${l.index}`;
let slots = null;
const levelAt = (slot) => {
  if (!slots) slots = new Map(state.data.levels.map((l, i) => [slotOf(l), i]));
  return slots.get(slot.toUpperCase());
};

export function writeHash(push = false) {
  entry ||= push;
  if (!queued) queued = requestAnimationFrame(flushHash);
}

function flushHash() {
  queued = 0;
  const push = entry;
  entry = false;
  const l = state.lvl;
  if (!l || restoring) return;
  const c = state.cam;
  const s = state.selected;
  const t = state.target.map((v) => r2(v)).join(",");
  const h =
    `#${slotOf(l)}/${Math.round(c.yaw)},${Math.round(c.pitch)}/${c.zoom.toFixed(2)}` +
    `/${t}/${r2(c.panX)},${r2(c.panY)}/${state.slice}` +
    (s ? `/${s.x},${s.y},${s.z}` : "");
  if (location.hash === h) return;
  if (push) history.pushState(null, "", h);
  else history.replaceState(null, "", h);
}

/** A segment of the hash as `n` numbers, or null where it is missing or is not that. */
const numbers = (segment, n) => {
  const v = segment ? segment.split(",").map(Number) : [];
  return v.length === n && v.every(Number.isFinite) ? v : null;
};

export function applyHash() {
  const [pack, slot, turn, zoom, target, pan, slice, picked] = location.hash.slice(1).split("/");
  const i = levelAt(`${pack}/${slot}`);
  if (i === undefined) return false;
  restoring = true;
  // Going back to another view of the level in hand keeps what was set on it,
  // the kinds hidden in the legend among them.
  if (i !== state.li) selectLevel(i, { keepView: true });
  const angles = numbers(turn, 2);
  if (angles) [state.cam.yaw, state.cam.pitch] = angles;
  const scale = numbers(zoom, 1)?.[0];
  if (scale > 0) state.cam.zoom = scale;
  const centre = numbers(target, 3);
  if (centre) state.target = centre;
  else fit();
  const offset = numbers(pan, 2);
  if (offset) [state.cam.panX, state.cam.panY] = offset;
  const ceiling = numbers(slice, 1)?.[0];
  state.slice = Number.isInteger(ceiling) && ceiling >= 0 ? Math.min(SIDE - 1, ceiling) : SIDE - 1;
  const at = numbers(picked, 3);
  const cell = at && state.idx.cells.get(cellKey(...at));
  if (cell) showCell(cell);
  else clearDetail();
  restoring = false;
  writeHash();
  invalidatePick();
  emit("slice-changed");
  chip();
  draw();
  return true;
}

on("selection-changed", () => writeHash());

// The viewer's own writes raise no hashchange, so what arrives here is a hash
// typed, followed or gone back to. One the viewer cannot honour would
// otherwise sit in the address bar naming a level that is not on screen.
addEventListener("hashchange", () => {
  if (!applyHash()) writeHash();
});

export function stepLevel(delta, crossWorld) {
  const data = state.data;
  const world = data.themes.find((t) => t.id === state.lvl.theme);
  const next = world.levels.indexOf(state.li) + delta;
  if (next >= 0 && next < world.levels.length) return selectLevel(world.levels[next]);
  if (!crossWorld) return;
  const w2 = data.themes[data.themes.indexOf(world) + Math.sign(delta)];
  if (w2) selectLevel(delta > 0 ? w2.levels[0] : w2.levels[w2.levels.length - 1]);
}
