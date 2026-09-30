import { $, emit, on } from "./dom.js";
import { state, SIDE, BLOCK, ZOOM_MIN, project, levelCentre, cellKey, sliceZ } from "./state.js";
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
import { slotOf, formatHash, parseHash } from "./permalink.js";

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

export function fit() {
  const l = state.lvl;
  if (!l) return;
  state.framing = fit;
  // Fitting against a view of no size yields the zoom clamp rather than a fit,
  // so the fit waits for the size to arrive.
  if (!state.view.w || !state.view.h) return;
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
  state.cam.zoom = Math.max(ZOOM_MIN, Math.min(3, Math.min(zx, zy)));
}

export function centreOn(x, y, z) {
  state.target = [x + 0.5, y + 0.5, z + 0.5];
  state.cam.panX = state.cam.panY = 0;
  state.framing = null;
}

let noted = null;

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
  if (score !== null) parts.push(`<span class="sep">·</span>${score} of ${points} points`);
  else if (points) parts.push(`<span class="sep">·</span>${points} points`);
  if (l.time !== undefined)
    parts.push(`<span class="sep">·</span><span class="t">time ${l.time}</span>`);
  if (sliceZ() > l.min[2]) parts.push(`<span class="sep">·</span>sliced to z\u2265${sliceZ()}`);
  $("chipLine").innerHTML = parts.join("");
  if (noted === l) return;
  noted = l;
  const note = levelNote(l);
  $("chipNote").innerHTML = note;
  // The line sits in the button that folds the note only where there is a
  // note, and the focus a hidden button held goes to the map.
  if (!note && document.activeElement === $("chipBtn")) $("cv").focus();
  $("chipBtn").hidden = !note;
  (note ? $("chipBtn") : $("chip")).prepend($("chipLine"));
  foldNote();
}

function foldNote() {
  const open = state.show.note;
  const btn = $("chipBtn");
  btn.setAttribute("aria-expanded", String(open));
  btn.title = open ? "Fold the note away" : "Show the note";
  $("chipNote").hidden = btn.hidden || !open;
}

$("chipBtn").onclick = () => {
  state.show.note = !state.show.note;
  emit("show-changed", "note");
  foldNote();
};

// Set while a hash is read back, so no write puts a half-restored view in the URL.
let restoring = false;

// Browsers rate-limit replaceState and throw past the limit, so writes wait
// for the next frame and go out as one.
let queued = 0;
// Whether the waiting write pushes a history entry; a push outlives the
// replacing writes that follow it in the same frame.
let entry = false;
// The hash the viewer last read or wrote. The address bar holding another has
// a hashchange yet to arrive, and a waiting write would put the view on screen
// over it.
let known = location.hash;

let slots = null;
const levelAt = (slot) => {
  if (!slots) slots = new Map(state.data.levels.map((l, i) => [slotOf(l), i]));
  return slots.get(slot);
};

export function writeHash(push = false) {
  entry ||= push;
  if (!queued) queued = requestAnimationFrame(flushHash);
  emit("view-changed");
}

function flushHash() {
  queued = 0;
  const push = entry;
  entry = false;
  const l = state.lvl;
  if (!l || restoring || location.hash !== known) return;
  const s = state.selected;
  const h = formatHash({
    slot: slotOf(l),
    cam: state.cam,
    target: state.target,
    slice: state.slice,
    picked: s && [s.x, s.y, s.z],
    fitted: state.framing === fit,
  });
  if (location.hash === h) return;
  if (push) history.pushState(null, "", h);
  else history.replaceState(history.state, "", h);
  known = location.hash;
}

// A dialog opens on an entry of its own, so what is waiting to be written
// goes onto the entry under it first.
on("dialog-opened", () => {
  if (!queued) return;
  cancelAnimationFrame(queued);
  flushHash();
});

export function applyHash() {
  known = location.hash;
  const link = parseHash(known);
  const i = levelAt(link.slot);
  if (i === undefined) return false;
  restoring = true;
  if (i !== state.li) selectLevel(i, { keepView: true });
  if (link.turn) [state.cam.yaw, state.cam.pitch] = link.turn;
  if (link.target) state.target = link.target;
  else fit();
  if (link.zoom) state.cam.zoom = link.zoom;
  if (link.pan) [state.cam.panX, state.cam.panY] = link.pan;
  if (link.zoom || link.target || link.pan) state.framing = null;
  state.slice = link.slice ?? SIDE - 1;
  const cell = link.picked && state.idx.cells.get(cellKey(...link.picked));
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

// A hash the viewer cannot honour gives way to the view on screen.
addEventListener("hashchange", () => {
  if (!applyHash()) writeHash();
});

export function stepLevel(delta) {
  const order = state.data.themes.flatMap((t) => t.levels);
  const i = order[order.indexOf(state.li) + delta];
  if (i !== undefined) selectLevel(i);
}
