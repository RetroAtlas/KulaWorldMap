import { $, emit, escaped, on } from "../ui/dom.js";
import { state, fitLevel, sliceZ } from "../state.js";
import { SIDE, cellKey } from "../../format/lattice.js";
import {
  index,
  worldName,
  levelNote,
  levelTitle,
  objectCount,
  blockCount,
  counted,
  levelScore,
} from "../data.js";
import { levelPoints } from "../draw/points.js";
import { draw, drawSoon, invalidatePick } from "../draw/render.js";
import { showCell, clearDetail } from "./detail.js";
import { slotOf, formatHash, parseHash } from "../permalink.js";
import { levelOn, current } from "../release.js";

// The level on screen, by its slot, and the release it came from.
let shown = null;
let shownRelease = null;

/** Install a level: one of the disc's levels at index `i`, or one from elsewhere with
    -1. The same level from elsewhere installed again is an update, as is any level
    where `update` asks, which keeps the selection named by `keep` where its cell is
    still there; `keepView` keeps the view and the slice, and `refit` beside it frames
    the level afresh where the view was fitted. */
function install(
  l,
  i,
  { keepView = false, push = true, keep = null, update = false, refit = false } = {},
) {
  settle();
  // Nothing lies behind the first level shown, so arriving there is no entry.
  const left = state.lvl !== null;
  const key = slotOf(l);
  if (key !== shown) state.presses = new Map();
  const updated = update || (i < 0 && key === shown);
  shown = key;
  shownRelease = current();
  state.li = i;
  state.lvl = l;
  state.idx = index(l);
  const kept = updated && keep !== null ? state.idx.cells.get(keep) : undefined;
  const face = kept && state.selected?.key === keep ? state.selected.face : undefined;
  if (!kept) clearDetail();
  state.hover = null;
  if (!keepView) {
    state.slice = SIDE - 1;
    fit();
  } else if (refit && state.framing === fit) fit();
  invalidatePick();
  emit(updated ? "level-updated" : "level-changed", i);
  if (kept) showCell(face == null ? kept : { ...kept, face }, { raise: false });
  chip();
  draw();
  writeHash(left && !keepView && push);
}

export function selectLevel(i, opts = {}) {
  const l = state.data.levels[i];
  if (!l) return;
  install(levelOn(l), i, opts);
}

/** Show a level that is not among the disc's levels. */
export const showLevel = (l, opts = {}) => install(l, -1, opts);

/** Install the slot shown again as an update, the selection kept at `keep` where its
    cell still stands, and frame the level afresh where the view was fitted. */
const reinstall = (keep) =>
  selectLevel(state.li, { update: true, keepView: true, refit: true, keep, push: false });

/** Reinstall the slot shown in place, the selection kept where its cell still stands
    unless `keep` is off; a draft has no other release, so its line alone is drawn again. */
export function reshow({ keep = true } = {}) {
  if (state.li < 0) chip();
  else reinstall(keep ? (state.selected?.key ?? null) : null);
}

let framer = null;
/** Register what frames the view in the fit's place, given the level; null gives the fit back. */
export function fitWith(fn) {
  framer = fn;
}

export function fit() {
  const l = state.lvl;
  if (!l) return;
  state.framing = fit;
  // Fitting against a view of no size yields the zoom clamp rather than a fit,
  // so the fit waits for the size to arrive.
  if (!state.view.w || !state.view.h) return;
  (framer ?? fitLevel)(l);
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

// The level whose note stands under the line, and the release it was read on.
let noted = null;
let notedOn = null;
// Registered note makers, each given the level and answering with an element, HTML or nothing.
const notes = [];
export function noteWith(fn) {
  notes.push(fn);
  noted = null;
  chip();
}
function noteOf(l) {
  for (const fn of notes) {
    const note = fn(l);
    if (note) return note;
  }
  return levelNote(l);
}

export function chip() {
  const l = state.lvl;
  if (!l) return;
  const parts = [
    `<b>${escaped(levelTitle(l))}</b>${l.draft === undefined ? "" : '<span class="tag">Draft</span>'}`,
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
  if (noted === l && notedOn === current()) return;
  noted = l;
  notedOn = current();
  const note = noteOf(l);
  if (typeof note === "string") $("chipNote").innerHTML = note;
  else $("chipNote").replaceChildren(note);
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

// Where a link may find a level beyond the disc's slots.
const sources = [];
export const provideLevels = (fn) => sources.push(fn);
const levelFrom = (slot) => {
  for (const fn of sources) {
    const l = fn(slot);
    if (l) return l;
  }
  return null;
};

const tails = [];
/** Register a segment of the link's tail: `write()` answers it, or null for
    none; `read`, where given, is handed an opened link's segment of that letter,
    or null where the link carries none; and `before`, where given, is told the
    segment before the link's slot is resolved, and where the link cannot be
    honoured is told the segment it wrote before the link was read, so that it
    puts itself back. */
export function tailWith({ letter, write, read = null, before = null }) {
  tails.push({ letter, write, read, before });
}

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
  const view = state.parked ?? {
    cam: state.cam,
    target: state.target,
    fitted: state.framing === fit,
    slice: state.slice,
  };
  return (
    l &&
    formatHash({
      slot: slotOf(l),
      cam: view.cam,
      target: view.target,
      slice: view.slice,
      picked: s && [s.x, s.y, s.z],
      fitted: view.fitted,
      tails: tails.map((t) => t.write()).filter((segment) => segment != null),
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
  const segmentOf = (letter) => link.tails.find((segment) => segment[0] === letter) ?? null;
  const held = tails.map(({ write }) => write());
  for (const { letter, before } of tails) before?.(segmentOf(letter));
  const i = levelAt(link.slot);
  if (i === undefined) {
    const l = levelFrom(link.slot);
    if (!l) {
      tails.forEach(({ before }, k) => before?.(held[k]));
      return false;
    }
    if (state.lvl?.draft !== l.draft) showLevel(l, { keepView: true });
  } else if (i !== state.li) selectLevel(i, { keepView: true });
  else if (shownRelease !== current()) reinstall(link.picked ? cellKey(...link.picked) : null);
  emit("link-opening");
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
  for (const { letter, read } of tails) read?.(segmentOf(letter));
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
  if (!state.data || state.li < 0) return;
  const order = state.data.themes.flatMap((t) => t.levels);
  const i = order[order.indexOf(state.li) + delta];
  if (i !== undefined) selectLevel(i, { push });
}
