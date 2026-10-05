import { $, emit, on } from "./dom.js";
import { state, SIDE, fitLevel, cellKey, sliceZ } from "./state.js";
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
import { draw, drawSoon, invalidatePick } from "./render.js";
import { showCell, clearDetail } from "./detail.js";
import { slotOf, formatHash, parseHash } from "./permalink.js";

export function selectLevel(i, { keepView = false, push = true } = {}) {
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
  writeHash(left && !keepView && push);
}

export function fit() {
  const l = state.lvl;
  if (!l) return;
  state.framing = fit;
  // Fitting against a view of no size yields the zoom clamp rather than a fit,
  // so the fit waits for the size to arrive.
  if (!state.view.w || !state.view.h) return;
  fitLevel(l);
}

export function setSlice(z) {
  state.slice = Math.max(0, Math.min(SIDE - 1, z));
  emit("slice-changed");
  invalidatePick();
  drawSoon();
  chip();
  writeHash();
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

// Browsers rate-limit replaceState and throw past the limit, so writes wait
// for the next frame and go out as one, and while the camera keeps moving they
// go out a few times a second, with one more as it rests.
const PACE = 100;
let queued = 0;
let timer = 0;
let wrote = -Infinity;
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

/** Write the view to the address bar: a frame later, or, for a camera on the
    move, at the pace above. */
export function writeHash(push = false, moving = false) {
  entry ||= push;
  if (!moving && timer) {
    clearTimeout(timer);
    timer = 0;
  }
  if (!queued && !timer) {
    const wait = moving && !entry ? wrote + PACE - performance.now() : 0;
    if (wait > 0) timer = setTimeout(flushHash, wait);
    else queued = requestAnimationFrame(flushHash);
  }
  emit("view-changed");
}

function flushHash() {
  queued = 0;
  timer = 0;
  const push = entry;
  entry = false;
  const l = state.lvl;
  if (!l || location.hash !== known) return;
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
  wrote = performance.now();
  known = location.hash;
}

// A dialog opens on an entry of its own, so what is waiting to be written
// goes onto the entry under it first.
on("dialog-opened", () => {
  if (!queued && !timer) return;
  cancelAnimationFrame(queued);
  clearTimeout(timer);
  flushHash();
});

export function applyHash() {
  if (!state.data) return false;
  known = location.hash;
  const link = parseHash(known);
  const i = levelAt(link.slot);
  if (i === undefined) return false;
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

export function stepLevel(delta, push = true) {
  if (!state.data) return;
  const order = state.data.themes.flatMap((t) => t.levels);
  const i = order[order.indexOf(state.li) + delta];
  if (i !== undefined) selectLevel(i, { push });
}
