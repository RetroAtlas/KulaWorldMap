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
  settle();
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

// Browsers rate-limit replaceState and throw past the limit, so the bar
// follows a change once the view has rested.
const SETTLE = 350;
let timer = 0;
// The hash the viewer last read or wrote. The address bar holding another has
// a hashchange yet to arrive, and a waiting write would put the view on screen
// over it.
let known = location.hash;

let slots = null;
const levelAt = (slot) => {
  if (!slots) slots = new Map(state.data.levels.map((l, i) => [slotOf(l), i]));
  return slots.get(slot);
};

/** Write the view to the address bar once it has rested, or at once as a
    history entry. */
export function writeHash(push = false) {
  drop();
  if (push) flush(true);
  else timer = setTimeout(flush, SETTLE);
  emit("view-changed");
}

function currentHash() {
  const l = state.lvl;
  const s = state.selected;
  return (
    l &&
    formatHash({
      slot: slotOf(l),
      cam: state.cam,
      target: state.target,
      slice: state.slice,
      picked: s && [s.x, s.y, s.z],
      fitted: state.framing === fit,
    })
  );
}

function flush(push = false) {
  drop();
  const h = currentHash();
  if (!h || location.hash !== known || location.hash === h) return;
  try {
    if (push) history.pushState(null, "", h);
    else history.replaceState(history.state, "", h);
  } catch {
    // a browser past its limit of writes keeps the bar as it was
  }
  known = location.hash;
}

/** Write what waits now, before the view it holds is left. */
export function settle() {
  if (timer) flush();
}

function drop() {
  clearTimeout(timer);
  timer = 0;
}

// A dialog opens on an entry of its own, so what is waiting to be written
// goes onto the entry under it first; a page on its way out, or put out of
// sight, writes it too.
on("dialog-opened", settle);
addEventListener("pagehide", settle);
document.addEventListener("visibilitychange", () => document.hidden && settle());

export function applyHash() {
  if (!state.data) return false;
  // the bar has moved under a waiting write, which has no entry left to go to
  drop();
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
