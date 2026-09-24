import { $, emit } from "./dom.js";
import { state, SIDE, BLOCK, project, retarget, cellKey, sliceZ } from "./state.js";
import {
  index,
  worldName,
  levelNote,
  levelTitle,
  levelMarkers,
  levelPoints,
  levelScore,
} from "./data.js";
import { draw, invalidatePick } from "./render.js";
import { clearDetail } from "./detail.js";

export function selectLevel(i, { keepView = false, entry = true } = {}) {
  const l = state.data.levels[i];
  if (!l) return;
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
  writeHash(entry && !keepView);
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
  state.pinned = null;
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

const levelCentre = (l) => [0, 1, 2].map((i) => (l.min[i] + l.max[i] + 1) / 2);

export function centreOn(x, y, z) {
  state.target = [x + 0.5, y + 0.5, z + 0.5];
  state.pinned = cellKey(x, y, z);
  state.cam.panX = state.cam.panY = 0;
}

// The view turns about the cell a search centred it on for as long as that
// cell stays selected, and about the level otherwise; the change is made
// when a turn begins, without moving the picture, so clearing the selection
// is the whole of the way back.
export function pivot() {
  const l = state.lvl;
  if (!l) return;
  const pinned = state.pinned !== null && state.selected?.key === state.pinned;
  if (!pinned) state.pinned = null;
  const s = state.selected;
  const want = pinned ? [s.x + 0.5, s.y + 0.5, s.z + 0.5] : levelCentre(l);
  if (want.some((v, i) => v !== state.target[i])) retarget(want);
}

export function chip() {
  const l = state.lvl;
  if (!l) return;
  const parts = [
    `<b>${levelTitle(l)}</b>`,
    `<span class="sep">·</span>${worldName(l.theme)}`,
    `<span class="sep">·</span>${l.placed} blocks`,
  ];
  const n = levelMarkers(l).length;
  if (n) parts.push(`<span class="sep">·</span>${n} objects`);
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
// An entry the viewer makes comes back to it as a hashchange like any other,
// and is not read back: reading it would clear the selection it was made for.
let written = null;
let ownEntries = 0;

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
  const t = state.target.map((v) => r2(v)).join(",");
  const h =
    `#${slotOf(l)}/${Math.round(c.yaw)},${Math.round(c.pitch)}/${c.zoom.toFixed(2)}` +
    `/${t}/${r2(c.panX)},${r2(c.panY)}/${state.slice}`;
  if (location.hash === h) return;
  written = h;
  if (push) {
    ownEntries++;
    location.hash = h;
  } else history.replaceState(null, "", h);
}

export function applyHash() {
  const m =
    /^#([A-Za-z0-9]+\/\d+)(?:\/(-?[\d.]+),(-?[\d.]+))?(?:\/([\d.]+))?(?:\/(-?[\d.]+),(-?[\d.]+),(-?[\d.]+))?(?:\/(-?[\d.]+),(-?[\d.]+))?(?:\/(\d+))?/.exec(
      location.hash,
    );
  if (!m) return false;
  const i = levelAt(m[1]);
  if (i === undefined || !state.data.levels[i]) return false;
  restoring = true;
  selectLevel(i, { keepView: true });
  if (m[2] !== undefined) {
    state.cam.yaw = Number(m[2]);
    state.cam.pitch = Number(m[3]);
  }
  if (m[4] !== undefined) state.cam.zoom = Number(m[4]);
  if (m[5] !== undefined) state.target = [Number(m[5]), Number(m[6]), Number(m[7])];
  else fit();
  if (m[8] !== undefined) {
    state.cam.panX = Number(m[8]);
    state.cam.panY = Number(m[9]);
  }
  state.slice = m[10] !== undefined ? Math.min(SIDE - 1, Number(m[10])) : SIDE - 1;
  restoring = false;
  writeHash();
  invalidatePick();
  emit("slice-changed");
  chip();
  draw();
  return true;
}

// A hash the viewer cannot honour would otherwise sit in the address bar
// naming a level that is not the one on screen.
addEventListener("hashchange", () => {
  if (ownEntries && location.hash === written) {
    ownEntries--;
    return;
  }
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
