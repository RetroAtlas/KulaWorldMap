// The editor, loaded only when the page is opened to make levels: the mode,
// its tools and keys, and what it draws over the map through the frame's hooks.
import { $, emit, on } from "../viewer/ui/dom.js";
import { state, BLOCK, facing as turnedToView, screen, sliceZ } from "../viewer/state.js";
import { SIDE, cellKey, FACE_NORMAL, FACE_NAME } from "../format/lattice.js";
import { circuitPhrase, levelTitle, markerLabel } from "../viewer/data.js";
import { provideLevels, setSlice } from "../viewer/chrome/navigate.js";
import { cellAt, drawSoon, overlayWith } from "../viewer/draw/render.js";
import { facePoints, outline, outlineStroke } from "../viewer/draw/blocks.js";
import { CLICK, dragWith, onCellClick, hoverBy, tipWith } from "../viewer/chrome/interaction.js";
import { clearDetail, showCell } from "../viewer/chrome/detail.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { describeLevel, say } from "../viewer/chrome/a11y.js";
import {
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  FACING_TYPES,
  LASER_KIND,
  PLAIN_ONLY,
  PLATFORM_KIND,
  SPAN_KINDS,
  VARIANT_TYPES,
  cellText,
  facesOf,
  inner,
  sameCell,
} from "../format/kwl.js";
import {
  blockAt,
  faceAt,
  moveBlocks,
  removeBlock,
  same,
  setBlock,
  setFace,
} from "../format/project.js";
import { runOf } from "../format/checks.js";
import { load } from "./drafts.js";
import { canRedo, canUndo, redo, undo } from "./trail.js";
import { copyShown, levelFor, wireDrafts } from "./draftlist.js";
import {
  BRITTLE,
  LOOKS_INTO,
  aWord,
  across as beside,
  brittle,
  brushWord,
  commit,
  current,
  holding,
  kindWord,
  lower,
  newErrors,
  place3,
  plainOnly,
  plural,
  refuse,
  sentence,
  spanAt,
  status,
  thingOn,
} from "./editing.js";
import { wireForm } from "./editform.js";
import * as palette from "./palette.js";

const EDGE = "The game builds nothing past the edge.";
const HELD = "That cell holds a block already.";
const LAST = "A level keeps its last block.";
const ONE_CELL = "A run needs two cells.";
const FLOOR_THING = "The grid lays blocks; a thing goes on a block's face.";
const HEIGHT_HINT = "The grid follows the slice: , lowers it and . raises it.";
const CHANGED = "The run's own block changed while it waited.";
const WAITING = "The run waits for its far end. Click where it ends, or press Esc.";
const WAITING_TOUCH = "The run waits for its far end. Tap where it ends, or change the tool.";
const NOTHING = "Nothing selected";
const setLine = (n) =>
  `${plural(n, "block")} selected. Drag ${n === 1 ? "it" : "them"} to move, Shift-drag to lift, Delete to erase, Esc to clear.`;
const TOOL_KEYS = { a: "place", z: "erase", i: "select" };
const WASH = "rgba(111 211 255 / 0.28)";
const RIM = "#6fd3ff";
const GHOST = "#ffffffd0";
const BLOCKED = "#ff6b6b";
const FREE = "#7ee2a8";
const FREE_TINT = "rgba(126 226 168 / 0.22)";
const BLOCKED_TINT = "rgba(255 107 107 / 0.25)";
// a run's cells by what else lies in them: nothing, a block or the edge, a beam, another run
const VERDICT = {
  free: [FREE, FREE_TINT],
  blocked: [BLOCKED, BLOCKED_TINT],
  beam: ["#f3c969", "rgba(243 201 105 / 0.25)"],
  run: ["#9fb4ff", "rgba(159 180 255 / 0.25)"],
};
const ICON = 28;
const TURNS = 4;
const HOLD_MS = 500;

const mode = { on: false, tool: "place" };
// What Place lays: a kind of block, or a thing for a face, turned as `facing` says.
let brush = { id: "k0", kind: 0 };
let facing = 1;
// A run waiting for its far end: its own cell, whether it re-lays the span
// there, and whether a finger began it.
let pending = null;
// A finger has no hover, so its first tap arms a face or a floor cell, which a
// second tap on the same confirms; a long press selects instead, and the lift
// of the finger that made it is swallowed.
let armed = null;
let press = null;
let swallow = null;
// A finger's tap while editing consumes its click: a sheet it raised may move the strip under it.
let consumed = false;
// A selection being made without the panel, which the sheets leave alone.
let quiet = false;
// Where the mouse is over the map, for the grid's ghost where no cell is under it.
let mouse = null;
let floorKey = null;
let hinted = false;
let paletteOpen = !sidebarOverlays();
// The blocks selected together, by the key of each block's own cell, and the
// marquee or the move a drag has in hand.
const set = new Set();
let gesture = null;

const onDraft = () => state.lvl?.draft !== undefined;
export const editing = () => mode.on && onDraft();
// a platform's block builds against the cell it stands in, which its record names only for the first
const cellOf = (c) => c.body ?? [c.x, c.y, c.z];
const across = (c, face) => beside(cellOf(c), face);
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const phone = () => sidebarOverlays();
const hovered = () => armed?.c ?? state.hover;
const waiting = () => (pending.touch ? WAITING_TOUCH : WAITING);
const spanWord = (b) =>
  b.kind === LASER_KIND ? circuitPhrase(b.colour ?? 0, kindWord(b.kind)) : kindWord(b.kind);
const toCell = ([x, y, z]) => ({ x, y, z });

export function bootEditor() {
  load();
  provideLevels(levelFor);
  wireDrafts();
  wireTools();
  wireForm({ editing, placeHere, buildAgainst, holdsBrush });
}

// --- the mode and the strip ---------------------------------------------------------

function setMode(onNow, said = onNow ? "Editing on" : "Editing off") {
  if (mode.on === onNow) return;
  mode.on = onNow;
  pending = null;
  armed = null;
  set.clear();
  dropGesture();
  document.body.classList.toggle("editing", onNow);
  status("");
  strip();
  emit("editing-changed", onNow);
  if (said) say(said);
  if (onNow) showGrid();
  drawSoon();
}

// blocks are laid against the floor, so editing begins with the grid shown
function showGrid() {
  if (state.show.base) return;
  const box = $("showBase");
  box.checked = true;
  box.dispatchEvent(new Event("change"));
}

function setTool(tool) {
  if (tool !== mode.tool) {
    set.clear();
    dropGesture();
  }
  mode.tool = tool;
  dropRun();
  disarm();
  status(set.size ? setLine(set.size) : "");
  strip();
  drawSoon();
}

function togglePalette(open) {
  paletteOpen = open;
  if (open && phone()) clearDetail();
  strip();
}

// On a phone the palette and the panel are sheets, one at a time, and the
// strip stands above whichever is open.
function sheets() {
  const open = phone() && editing() && (paletteOpen || !$("detail").hidden);
  document.body.classList.toggle("sheet-open", open);
}

function dropRun() {
  if (!pending) return;
  pending = null;
  status("");
}

export function toggleEditing() {
  if (!state.lvl) return;
  if (onDraft()) {
    setMode(!mode.on);
    return;
  }
  const title = levelTitle(state.lvl);
  copyShown();
  if (!onDraft()) return;
  setMode(true, `Copied ${title}. ${describeLevel(state.lvl)} Editing on.`);
}

function strip() {
  const tools = $("tools");
  tools.hidden = !onDraft();
  $("editBtn").setAttribute("aria-pressed", String(mode.on));
  for (const b of tools.querySelectorAll(".tool")) {
    b.hidden = !mode.on;
    b.setAttribute("aria-pressed", String(b.dataset.tool === mode.tool));
  }
  const id = state.lvl?.draft;
  for (const b of [$("turnBtn"), $("undoBtn"), $("redoBtn"), $("paletteBtn")]) b.hidden = !mode.on;
  $("undoBtn").disabled = !canUndo(id);
  $("redoBtn").disabled = !canRedo(id);
  $("paletteBtn").setAttribute("aria-pressed", String(paletteOpen));
  const shown = editing() && paletteOpen;
  if (shown) palette.sync();
  $("palette").hidden = !shown;
  sheets();
}

function wireTools() {
  $("editBtn").onclick = toggleEditing;
  for (const b of $("tools").querySelectorAll(".tool")) b.onclick = () => setTool(b.dataset.tool);
  $("turnBtn").onclick = () => turn(1);
  $("undoBtn").onclick = stepBack;
  $("redoBtn").onclick = stepAgain;
  $("paletteBtn").onclick = () => togglePalette(!paletteOpen);
  palette.wirePalette(
    (e) => {
      brush = e.kind !== undefined ? { id: e.id, kind: e.kind } : { id: e.id, type: e.type };
      if (e.variant !== undefined) brush.variant = e.variant;
      if (e.colour !== undefined) brush.colour = e.colour;
      setTool("place");
      say(`Brush: ${e.label}`);
      emit("brush-changed");
    },
    () => togglePalette(false),
  );
  on("level-changed", () => {
    // the level chosen has been announced, and leaving with it needs no word of its own
    if (!onDraft() && mode.on) setMode(false, null);
    dropRun();
    disarm();
    dropGesture();
    clearSet();
    strip();
  });
  on("selection-changed", () => {
    if (quiet) return;
    if (phone() && !$("detail").hidden && paletteOpen) togglePalette(false);
    else sheets();
  });
  wireTouch();
  wireMouse();
  // the palette stands on the strip, however tall its line makes it
  new ResizeObserver(([e]) =>
    $("palette").style.setProperty("--strip-h", `${e.target.offsetHeight}px`),
  ).observe($("tools"));
  on("level-updated", strip);
  on("level-updated", prune);
  on("trail-changed", strip);
  // a level made to be edited opens editing, said after what made it has been said
  on("edit-wanted", () => {
    if (!onDraft() || mode.on) return;
    const said = $("say").textContent;
    setMode(true, said ? `${said} Editing on.` : undefined);
  });
  on("play-changed", (playing) => {
    if (playing) setMode(false);
  });
  document.addEventListener("keydown", keys, { capture: true });
  onCellClick((c, e) => {
    const taken = take(c, e);
    consumed = e.pointerType === "touch" && editing();
    return taken;
  });
  dragWith(dragStart);
  // the face, and for a platform's block the body block it is on, place the wash and the ghost
  hoverBy((c) => (editing() && mode.tool !== "select" ? `${c.face ?? ""}/${c.k ?? 0}` : null));
  tipWith((c) => {
    if (!editing() || mode.tool !== "place" || c?.face == null) return [];
    if (pending) return ["End the run here"];
    const side = FACE_NAME[c.face];
    const what = aWord(brushWord());
    return [holdsBrush(c) ? `The ${side} holds ${what} already` : `Place ${what} on the ${side}`];
  });
  overlayWith({ under: drawFloor, cell: drawCell, frame: drawGhost });
  strip();
}

function take(c, e) {
  if (!editing()) return false;
  if (e.pointerId === swallow) {
    swallow = null;
    return true;
  }
  if (e.altKey) return pick(c);
  if (e.pointerType === "touch" && !e.shiftKey && mode.tool !== "select") return tap(c, e);
  if (e.shiftKey || mode.tool === "erase") return erase(c, e);
  if (mode.tool === "place") return place(c, e);
  clearSet();
  return false;
}

// --- a mouse over the grid ----------------------------------------------------------------

// A pointer over no cell hovers nothing, so the grid's cell under it is read here.
function wireMouse() {
  const cv = $("cv");
  cv.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    mouse = { x: e.clientX, y: e.clientY };
    if (e.buttons) return;
    const cell = floorCell();
    const key = cell ? cellKey(...cell) : null;
    if (key === floorKey) return;
    floorKey = key;
    if (cell && sliceZ() > 0 && !hinted && !pending) {
      hinted = true;
      status(HEIGHT_HINT);
    }
    drawSoon();
  });
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "touch") return;
    mouse = null;
    if (floorKey === null) return;
    floorKey = null;
    drawSoon();
  });
}

/** The grid's cell under the mouse, where the grid is on, Place is the tool and no cell is hovered. */
function floorCell() {
  if (!mouse || !editing() || mode.tool !== "place" || !state.show.base || state.hover) return null;
  const r = $("cv").getBoundingClientRect();
  const cell = floorAt(mouse.x - r.left, mouse.y - r.top);
  return cell?.every(inner) ? cell : null;
}

// --- a finger on the map ------------------------------------------------------------------

function wireTouch() {
  const cv = $("cv");
  cv.addEventListener("pointerdown", (e) => {
    if (!editing() || e.pointerType !== "touch" || !e.isPrimary) return;
    clearTimeout(press?.timer);
    const timer = setTimeout(() => longPress(e), HOLD_MS);
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer };
  });
  cv.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) < CLICK) return;
    clearTimeout(press.timer);
    press = null;
    disarm();
  });
  const release = (e) => {
    if (press?.id === e.pointerId) {
      clearTimeout(press.timer);
      press = null;
    }
    if (swallow === e.pointerId) swallow = null;
  };
  cv.addEventListener("pointerup", release);
  cv.addEventListener("pointercancel", (e) => {
    consumed = false;
    release(e);
  });
  cv.addEventListener(
    "touchend",
    (e) => {
      if (!consumed) return;
      consumed = false;
      e.preventDefault();
    },
    { passive: false },
  );
  cv.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length < 2) return;
      clearTimeout(press?.timer);
      press = null;
      disarm();
    },
    { passive: true },
  );
  // a lifted finger leaves the map, which takes the hover with it
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch" || !armed?.c) return;
    state.hover = armed.c;
    drawSoon();
  });
}

function longPress(e) {
  press = null;
  const r = $("cv").getBoundingClientRect();
  const c = cellAt(e.clientX - r.left, e.clientY - r.top);
  swallow = e.pointerId;
  disarm();
  if (c) showCell(c);
  else clearDetail();
  drawSoon();
}

/** A tap arms the face or the floor cell under it, or confirms the one armed. */
function tap(c, e) {
  const target = c ? faceTarget(c) : floorTarget(e);
  if (!target) {
    disarm();
    return false;
  }
  if (target.cell && brush.kind === undefined) {
    disarm();
    return refuse(FLOOR_THING);
  }
  if (mode.tool === "place" && target.c && holdsBrush(target.c)) {
    disarm();
    return refuse(holding());
  }
  if (armed && armed.key === target.key && armed.face === target.face && armed.k === target.k) {
    const at = armed.c;
    disarm();
    return mode.tool === "erase" ? erase(at, e) : place(at, e);
  }
  armed = target;
  if (armed.c) state.hover = armed.c;
  status(`Tap again to ${tapWord(target)}.`);
  drawSoon();
  return true;
}

function faceTarget(c) {
  const key = cellKey(c.x, c.y, c.z);
  return { key, face: c.face ?? null, k: c.k ?? 0, c: { ...c, key }, cell: null };
}

function floorTarget(e) {
  if (mode.tool !== "place" || !state.show.base) return null;
  const cell = onFloor(e);
  if (!cell || !cell.every(inner)) return null;
  return { key: cellKey(...cell), face: null, c: null, cell };
}

function tapWord(target) {
  if (mode.tool === "erase") return "erase here";
  if (pending) return "end the run here";
  if (!target.c) return `lay ${aWord(brushWord())} on the floor`;
  return `place ${aWord(brushWord())} on the ${FACE_NAME[target.face]}`;
}

function disarm() {
  if (!armed) return;
  armed = null;
  status(pending ? waiting() : "");
  drawSoon();
}

// A form field keeps the browser's own keys, and an open dialog keeps every key.
function keys(e) {
  if (!state.lvl || dialogOpen()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
  if (typing) return;
  if (e.key === "Escape") disarm();
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (editing() && !e.altKey && mod && key === "z") e.shiftKey ? stepAgain() : stepBack();
  else if (editing() && !e.altKey && e.ctrlKey && !e.metaKey && key === "y") stepAgain();
  else if (editing() && !mod && !e.altKey && (e.key === "Delete" || e.key === "Backspace"))
    set.size ? eraseSet() : eraseSelection();
  else if (editing() && !mod && !e.altKey && e.shiftKey && set.size && NUDGE[e.key])
    moveSet(NUDGE[e.key]());
  else if (mod || e.altKey) return;
  else if (e.key === "Escape" && editing() && set.size) clearSet();
  else if (e.key === "Escape" && editing() && pending) {
    dropRun();
    drawSoon();
  } else if (e.key === "Escape" && editing() && phone() && paletteOpen) togglePalette(false);
  else if (e.key === "w") toggleEditing();
  else if (editing() && TOOL_KEYS[e.key]) setTool(TOOL_KEYS[e.key]);
  else if (editing() && key === "r") turn(e.shiftKey ? -1 : 1);
  else if (editing() && key === "j") palette.step(1);
  else if (editing() && key === "k") palette.step(-1);
  else if (editing() && /^[1-9]$/.test(e.key)) palette.pickDigit(Number(e.key));
  else return;
  e.preventDefault();
  e.stopPropagation();
}

function stepBack() {
  const d = current();
  const label = d && undo(d.id);
  if (!label) return;
  clearSet();
  say(`Undid ${label}`);
}

function stepAgain() {
  const d = current();
  const label = d && redo(d.id);
  if (!label) return;
  clearSet();
  say(`Redid ${label}`);
}

function eraseSelection() {
  const s = state.selected;
  if (s) erase({ x: s.x, y: s.y, z: s.z, face: s.face ?? null });
}

// --- a set of blocks, chosen with a marquee and moved whole ------------------------------

const GROUND = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
];
const NUDGE = {
  ArrowRight: () => groundAxes().right,
  ArrowLeft: () => groundAxes().right.map((v) => -v),
  ArrowDown: () => groundAxes().down,
  ArrowUp: () => groundAxes().down.map((v) => -v),
  PageUp: () => [0, 0, -1],
  PageDown: () => [0, 0, 1],
};

/** The ground axis nearest the screen's right, and of the other two the one running down the screen. */
function groundAxes() {
  const o = screen(0, 0, 0);
  const on = (v) => {
    const [x, y] = screen(...v).map((k, i) => k - o[i]);
    const n = Math.hypot(x, y) || 1;
    return [x / n, y / n];
  };
  let right = GROUND[0];
  for (const v of GROUND) if (on(v)[0] > on(right)[0] + 1e-9) right = v;
  const other = GROUND.filter((v) => !v.some((k, i) => k && right[i]));
  const down = on(other[0])[1] >= on(other[1])[1] ? other[0] : other[1];
  return { right, down };
}

const members = (doc) => doc.blocks.filter((b) => set.has(cellKey(...b.cell)));
const shifted = (cell, delta) => cell.map((v, i) => v + delta[i]);
const CELL_IN_TEXT = /(\d+),(\d+),(\d+)/g;
const cellsNamed = (text) => [...text.matchAll(CELL_IN_TEXT)].map((m) => m.slice(1).map(Number));

function clearSet() {
  if (!set.size) return;
  set.clear();
  status("");
  drawSoon();
}

/** Let go of the marquee or the move in hand; the drag that holds it then does nothing until the lift. */
function dropGesture() {
  gesture = null;
  document.body.classList.remove("marquee", "moving");
}

/** Keep the set to the blocks the draft still has, which another tab's update or an erase from Select can take from under it. */
function prune() {
  if (!set.size) return;
  const d = current();
  const keys = new Set(d ? d.doc.blocks.map((b) => cellKey(...b.cell)) : []);
  const was = set.size;
  for (const key of [...set]) if (!keys.has(key)) set.delete(key);
  if (set.size !== was) status(set.size ? setLine(set.size) : "");
}

/** Select the blocks whose middles lie in a rectangle of the canvas, a span whole where any cell of its run does. */
function selectWithin(x0, y0, x1, y1) {
  const d = current();
  if (!d) return;
  set.clear();
  const inside = (cell) => {
    if (cell[2] < sliceZ()) return false;
    const [px, py] = screen(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);
    return px >= x0 && px <= x1 && py >= y0 && py <= y1;
  };
  for (const b of d.doc.blocks) {
    const cells = SPAN_KINDS.has(b.kind) && b.far ? runOf(b) : [b.cell];
    if (cells.some(inside)) set.add(cellKey(...b.cell));
  }
  if (!set.size) clearDetail();
  const line = set.size ? setLine(set.size) : "";
  status(line);
  say(line || NOTHING);
  drawSoon();
}

/** Where the set would land moved by `delta`: each block's cell, which of
    them are blocked, the project moved and the refusal where there is one. */
function destination(doc, delta) {
  const blocks = members(doc);
  const cells = blocks.map((b) => shifted(b.cell, delta));
  const staying = new Set(
    doc.blocks.filter((b) => !set.has(cellKey(...b.cell))).map((b) => cellKey(...b.cell)),
  );
  const blocked = new Set();
  let why = null;
  blocks.forEach((b, i) => {
    const far = b.far && shifted(b.far, delta);
    const past = !cells[i].every(inner) || (far && !far.every(inner));
    if (!past && !staying.has(cellKey(...cells[i]))) return;
    blocked.add(i);
    why ??= past ? EDGE : HELD;
  });
  let next = null;
  if (!why) {
    next = moveBlocks(
      doc,
      blocks.map((b) => b.cell),
      delta,
    );
    // an error the draft already had is the same one once the blocks it names have moved with the set
    const moving = (cell) => (set.has(cellKey(...cell)) ? shifted(cell, delta) : cell);
    const carried = (f) => ({
      ...f,
      text: f.text.replace(CELL_IN_TEXT, (_, ...xyz) =>
        cellText(moving(xyz.slice(0, 3).map(Number))),
      ),
      at: f.at && { ...f.at, cell: moving(f.at.cell) },
    });
    const grew = newErrors(doc, next, carried);
    if (grew.length) {
      why = sentence(grew[0].text);
      // a check names the cells it is about where it stands and in its words
      const named = new Set(grew.filter((f) => f.at).map((f) => cellKey(...f.at.cell)));
      for (const f of grew) for (const c of cellsNamed(f.text)) named.add(cellKey(...c));
      const hit = cells.flatMap((c, i) => (named.has(cellKey(...c)) ? [i] : []));
      for (const i of hit.length ? hit : cells.keys()) blocked.add(i);
    }
  }
  return { cells, blocked, why, next };
}

/** Where the set in hand would land and which of its blocks the lift would refuse; null with no move in hand. */
export function movePreview() {
  if (!gesture?.move) return null;
  const { delta, cells, blocked } = gesture.move;
  return { delta, cells, blocked: [...blocked].sort((a, b) => a - b) };
}

/** Move the set by `delta` as one step, or say why not and move nothing; whether it moved. */
function moveSet(delta) {
  const d = current();
  if (!d || !set.size || !delta.some(Boolean)) return false;
  const { cells, why, next } = destination(d.doc, delta);
  if (why) {
    refuse(why);
    return false;
  }
  const s = state.selected;
  const follow = s && set.has(s.key) ? shifted([s.x, s.y, s.z], delta) : null;
  set.clear();
  for (const c of cells) set.add(cellKey(...c));
  const top = Math.min(...cells.map((c) => c[2]));
  if (top < sliceZ()) setSlice(SIDE - 1 - top);
  commit(d.id, next, `moved ${plural(cells.length, "block")} by ${delta.join(", ")}`);
  if (follow) select(follow, s.face ?? null);
  status(setLine(cells.length));
  return true;
}

/** Erase every block of the set as one step, a level keeping its last block. */
function eraseSet() {
  const d = current();
  const blocks = d ? members(d.doc) : [];
  if (!blocks.length) return false;
  if (blocks.length >= d.doc.blocks.length) return refuse(LAST);
  set.clear();
  commit(
    d.id,
    blocks.reduce((p, b) => removeBlock(p, b.cell), d.doc),
    `removed ${plural(blocks.length, "block")}`,
  );
  return true;
}

/** The drag a press begins in Select: a marquee from no cell, a move from a
    block of the set, and from anywhere else nothing, so the camera has it;
    `at` reads the cell under the press. */
function dragStart(at, e) {
  if (!editing() || mode.tool !== "select" || e.pointerType === "touch") return null;
  if (e.button !== 0 || e.altKey || !current()) return null;
  const c = at();
  if (c && set.has(cellKey(c.x, c.y, c.z))) return moveDrag(c, e);
  if (c || e.shiftKey || state.panMode) return null;
  return marqueeDrag(e);
}

const canvasPoint = (e) => {
  const r = $("cv").getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function marqueeDrag(e) {
  const from = canvasPoint(e);
  const own = (gesture = { marquee: [...from, ...from] });
  document.body.classList.add("marquee");
  return {
    move(ev) {
      if (gesture !== own) return;
      own.marquee = [...from, ...canvasPoint(ev)];
      drawSoon();
    },
    end(ev) {
      if (gesture !== own) return;
      const [x, y] = canvasPoint(ev);
      dropGesture();
      selectWithin(
        Math.min(from[0], x),
        Math.min(from[1], y),
        Math.max(from[0], x),
        Math.max(from[1], y),
      );
    },
    cancel() {
      if (gesture !== own) return;
      dropGesture();
      drawSoon();
    },
  };
}

/** A cell's height on the screen, held to a quarter of its side where the view looks nearly straight down. */
const cellHeight = () =>
  Math.max((BLOCK * state.cam.zoom) / 4, screen(0, 0, 1)[1] - screen(0, 0, 0)[1]);

/** The set carried by the pointer: across the plane through the pressed cell
    at its height, or with Shift up and down, a cell for each cell's height. */
function moveDrag(c, e) {
  const z = c.z + 0.5;
  const lift = e.shiftKey;
  const start = [e.clientX, e.clientY];
  const own = (gesture = { move: { delta: [0, 0, 0], cells: [], blocked: new Set() } });
  document.body.classList.add("moving");
  const deltaAt = (ev) => {
    const dx = ev.clientX - start[0];
    const dy = ev.clientY - start[1];
    if (lift) return [0, 0, Math.round(dy / cellHeight())];
    const a = onPlane(0, 0, z);
    const b = onPlane(dx, dy, z);
    return a && b ? [Math.round(b[0] - a[0]), Math.round(b[1] - a[1]), 0] : [0, 0, 0];
  };
  return {
    move(ev) {
      if (gesture !== own) return;
      const delta = deltaAt(ev);
      const d = current();
      if (d && !sameCell(delta, own.move.delta)) {
        const { cells, blocked } = destination(d.doc, delta);
        own.move = { delta, cells, blocked };
      }
      drawSoon();
    },
    end(ev) {
      if (gesture !== own) return;
      const delta = deltaAt(ev);
      dropGesture();
      if (!moveSet(delta)) drawSoon();
    },
    cancel() {
      if (gesture !== own) return;
      dropGesture();
      drawSoon();
    },
  };
}

// --- the tools -----------------------------------------------------------------------------

/** Select what a tool placed or cleared; on a phone a finger's selection leaves the panel's sheet down. */
function select(cell, face = null, e = null) {
  const at = state.idx.cells.get(cellKey(...cell));
  if (!at) return;
  const quietly = e?.pointerType === "touch" && phone();
  quiet = quietly;
  showCell(face === null ? at : { ...at, face });
  quiet = false;
  if (!quietly) return;
  const box = $("detail");
  if (box.contains(document.activeElement)) $("cv").focus();
  box.hidden = true;
  sheets();
}

/** The cell a block would be laid in: across the clicked face, or on the floor
    through the grid; null where the click lands on nothing to build against. */
function landing(c, e) {
  if (c) return c.face == null ? null : across(c, c.face);
  const target = state.show.base ? onFloor(e) : null;
  return target && target.every(inner) ? target : null;
}

function place(c, e) {
  const d = current();
  if (!d) return false;
  if (pending) return finishRun(c, e, d);
  if (brush.kind === undefined) {
    if (c) return placeThing(c, d, e);
    return e && landing(null, e) ? refuse(FLOOR_THING) : false;
  }
  if (SPAN_KINDS.has(brush.kind)) return startRun(c, e, d);
  const target = landing(c, e);
  if (!target) return false;
  return layBlock(d, target, brush.kind, e);
}

/** Why a block of `kind` cannot be laid at `target`, or null where it can. */
function blockRefusal(doc, target, kind) {
  if (!target.every(inner)) return EDGE;
  if (blockAt(doc, target)) return HELD;
  const grew = newErrors(doc, setBlock(doc, target, { kind }));
  return grew.length ? sentence(grew[0].text) : null;
}

/** Lay a block of `kind` at `target`, refusing what the game would not load. */
function layBlock(d, target, kind, e = null) {
  const why = blockRefusal(d.doc, target, kind);
  if (why) return refuse(why);
  const next = setBlock(d.doc, target, { kind });
  if (target[2] < sliceZ()) setSlice(SIDE - 1 - target[2]);
  commit(d.id, next, `placed ${aWord(kindWord(kind))} at ${place3(target)}`);
  select(target, null, e);
  return true;
}

/** Place the brush against a cell's face as a click there would, for a control without a pointer. */
export function placeHere(c) {
  return editing() && c?.face != null ? place(c, null) : false;
}

/** Lay a plain block across a cell's face, whatever the brush, for a control without a pointer. */
export function buildAgainst(c) {
  const d = current();
  if (!editing() || !d || c?.face == null) return false;
  return layBlock(d, across(c, c.face), 0);
}

// --- runs: a platform or a laser laid in two clicks ------------------------------------------

/** The far end a run would take toward `cand`: along the axis it leaves the
    anchor by most, or null where it leaves it by nothing. */
function snap(anchor, cand) {
  const d = cand.map((v, i) => v - anchor[i]);
  const axis = d.reduce((best, v, i) => (Math.abs(v) > Math.abs(d[best]) ? i : best), 0);
  if (!d[axis]) return null;
  const far = [...anchor];
  far[axis] = cand[axis];
  return far;
}

/** The cell a run's far end would be read from: the hovered cell itself where a
    laser may end on it, else the cell across the hovered face. */
function candidate(c, e, doc) {
  if (!c) return e ? landing(null, e) : null;
  const cell = [c.x, c.y, c.z];
  const kind = ownSpan(doc)?.kind ?? brush.kind;
  if (kind === LASER_KIND) {
    const b = blockAt(doc, cell);
    if (b && ((b.kind === 0 && !facesOf(b).length) || b.kind === LASER_KIND)) return cell;
  }
  return c.face == null ? null : across(c, c.face);
}

/** The span the pending run re-lays, as the document holds it now; null where it lays a new one. */
function ownSpan(doc) {
  const own = pending?.respan ? blockAt(doc, pending.anchor) : null;
  return own && SPAN_KINDS.has(own.kind) ? own : null;
}

/** Why the pending run can no longer be laid from its anchor, or null. */
function anchorRefusal(doc) {
  if (pending.respan) return ownSpan(doc) ? null : CHANGED;
  return blockAt(doc, pending.anchor) ? HELD : null;
}

/** The span the pending run would lay toward `far`: its own, re-laid, or the brush's span. */
function spanToward(doc, far) {
  const own = ownSpan(doc);
  if (own) return { ...own, far };
  if (brush.kind === PLATFORM_KIND)
    return { kind: PLATFORM_KIND, far, length: DEFAULT_LENGTH, speed: DEFAULT_SPEED };
  return { kind: LASER_KIND, far, colour: brush.colour ?? 0 };
}

function startRun(c, e, d) {
  const touch = e?.pointerType === "touch";
  const own = c && blockAt(d.doc, [c.x, c.y, c.z]);
  if (own && SPAN_KINDS.has(own.kind)) {
    pending = { anchor: [...own.cell], respan: true, touch };
  } else {
    const target = landing(c, e);
    if (!target) return false;
    const why = blockRefusal(d.doc, target, 0);
    if (why) return refuse(why);
    pending = { anchor: target, respan: false, touch };
  }
  status(waiting());
  say(waiting());
  drawSoon();
  return true;
}

function finishRun(c, e, d) {
  const cand = candidate(c, e, d.doc);
  if (!cand) return false;
  const why = anchorRefusal(d.doc);
  if (why) {
    dropRun();
    drawSoon();
    return refuse(why);
  }
  const far = snap(pending.anchor, cand);
  if (!far) return refuse(ONE_CELL);
  const span = spanToward(d.doc, far);
  const next = setBlock(d.doc, pending.anchor, span);
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
  const { anchor, respan } = pending;
  pending = null;
  if (Math.min(anchor[2], far[2]) < sliceZ()) setSlice(SIDE - 1 - Math.min(anchor[2], far[2]));
  commit(
    d.id,
    next,
    respan
      ? `moved the run of the ${spanWord(span)} to ${place3(far)}`
      : `laid ${aWord(spanWord(span))} from ${place3(anchor)} to ${place3(far)}`,
  );
  select(anchor, null, e);
  return true;
}

let preview = null;

/** What the pending run would be toward the hovered cell, and whether it can be laid. */
export function runPreview() {
  const d = current();
  if (!pending || !d) return null;
  const h = hovered();
  const cand = h ? candidate(h, null, d.doc) : (armed?.cell ?? floorCell());
  const far = cand && snap(pending.anchor, cand);
  if (!far) return { anchor: pending.anchor, far: null, cells: [], verdicts: [], blocked: false };
  const span = { ...spanToward(d.doc, far), cell: pending.anchor };
  const key = `${pending.anchor}|${JSON.stringify(span)}`;
  if (preview?.doc !== d.doc || preview.key !== key) {
    const cells = runOf(span);
    const blocked =
      anchorRefusal(d.doc) !== null ||
      newErrors(d.doc, setBlock(d.doc, pending.anchor, span)).length > 0;
    preview = { doc: d.doc, key, cells, verdicts: verdicts(d.doc, span, cells), blocked };
  }
  const { cells, verdicts: by, blocked } = preview;
  return { anchor: pending.anchor, far, cells, verdicts: by, blocked };
}

/** Each cell of a run by what else lies in it: a block or the edge, which the
    checks refuse, or another laser's beam or another platform's run, which they
    do not, a laser's far end on a plain or a laser's block being one it may end on. */
function verdicts(doc, span, cells) {
  const beams = new Set();
  const runs = new Set();
  for (const b of doc.blocks) {
    if (!SPAN_KINDS.has(b.kind) || !b.far || sameCell(b.cell, span.cell)) continue;
    const laser = b.kind === LASER_KIND;
    const taken = laser ? runOf(b).slice(1, -1) : runOf(b);
    for (const c of taken) (laser ? beams : runs).add(cellKey(...c));
  }
  return cells.map((c) => {
    if (sameCell(c, span.cell)) return "free";
    if (!c.every(inner)) return "blocked";
    const other = blockAt(doc, c);
    if (other) {
      const end = span.kind === LASER_KIND && sameCell(c, span.far);
      return end && (other.kind === 0 || other.kind === LASER_KIND) ? "free" : "blocked";
    }
    const key = cellKey(...c);
    return beams.has(key) ? "beam" : runs.has(key) ? "run" : "free";
  });
}

/** What Place puts on a face: the brush's thing, turned as the next placement faces; null for a block. */
function brushThing() {
  if (brush.kind !== undefined) return null;
  const o = { type: brush.type };
  if (brush.variant !== undefined) o.variant = brush.variant;
  if (FACING_TYPES.has(brush.type)) o.facing = facing;
  return o;
}

/** A thing as the game reads it: its type, and the facing and the variant its type has, at their defaults where left out. */
const asRead = ({ type, facing, variant }) => ({
  type,
  facing: FACING_TYPES.has(type) ? (facing ?? 1) : null,
  variant: VARIANT_TYPES.has(type) ? (variant ?? 0) : null,
});

/** Whether the face of `c` holds what Place would put there, as the game reads the two. */
function holdsBrush(c) {
  const d = current();
  const o = d && c?.face != null ? faceAt(d.doc, [c.x, c.y, c.z], c.face) : null;
  const t = brushThing();
  return o !== null && t !== null && same(asRead(o), asRead(t));
}

/** Put the brush's thing on the clicked face, in place of whatever stood there. */
function placeThing(c, d, e) {
  if (!c || c.face == null) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) return false;
  const entry = palette.chosen();
  if (PLAIN_ONLY.has(brush.type) && b.kind !== 0) return refuse(plainOnly(entry));
  if (brittle(b)) return refuse(BRITTLE);
  if (blockAt(d.doc, across(c, c.face))) return refuse(LOOKS_INTO);
  if (holdsBrush(c)) return refuse(holding());
  const next = setFace(d.doc, cell, c.face, brushThing());
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
  state.hiddenKinds.delete(brush.id);
  commit(
    d.id,
    next,
    `placed ${aWord(lower(entry.label))} on the ${FACE_NAME[c.face]} of ${place3(cell)}`,
  );
  select(cell, c.face, e);
  return true;
}

function erase(c, e = null) {
  const d = current();
  if (!c || !d) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) {
    const s = spanAt(d.doc, cell);
    if (!s) return false;
    if (d.doc.blocks.length === 1) return refuse(LAST);
    commit(d.id, removeBlock(d.doc, s.cell), `removed the ${spanWord(s)} at ${place3(s.cell)}`);
    return true;
  }
  const face = c.face ?? null;
  if (face !== null && faceAt(d.doc, cell, face)) {
    const m = thingOn(cell, face);
    const name = m ? lower(markerLabel(m)) : "object";
    commit(
      d.id,
      setFace(d.doc, cell, face, null),
      `removed the ${name} from the ${FACE_NAME[face]} of ${place3(cell)}`,
    );
    select(cell, face, e);
    return true;
  }
  if (d.doc.blocks.length === 1) return refuse(LAST);
  commit(d.id, removeBlock(d.doc, cell), `removed the ${spanWord(b)} at ${place3(cell)}`);
  return true;
}

/** Take what is under the pointer as the brush: the thing on the face, else the block's kind. */
function pick(c) {
  const d = current();
  if (!c || !d) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) return false;
  const o = c.face == null ? null : faceAt(d.doc, cell, c.face);
  if (o) {
    if (o.facing) facing = o.facing;
    return palette.choose(palette.idOf(o));
  }
  return palette.choose(palette.kindId(b));
}

/** Turn the selected thing a quarter turn where its kind faces, else the brush. */
function turn(delta) {
  const s = state.selected;
  const d = current();
  const cell = s && [s.x, s.y, s.z];
  const o = s && s.face != null && d ? faceAt(d.doc, cell, s.face) : null;
  if (o && FACING_TYPES.has(o.type)) {
    const turned = ((((o.facing ?? 1) - 1 + delta) % TURNS) + TURNS) % TURNS;
    const m = thingOn(cell, s.face);
    const name = m ? lower(markerLabel(m)) : "thing";
    commit(
      d.id,
      setFace(d.doc, cell, s.face, { ...o, facing: turned + 1 }),
      `turned the ${name} on the ${FACE_NAME[s.face]} of ${place3(cell)}`,
    );
    select(cell, s.face);
    return;
  }
  facing = ((((facing - 1 + delta) % TURNS) + TURNS) % TURNS) + 1;
  say(`Brush facing ${facing} of ${TURNS}`);
}

/** The plane the grid stands on: under the topmost layer the slice shows while
    it is lowered, else under the lowest block, or at the lattice's foot where
    the level has none. */
function floorZ(l) {
  if (sliceZ() > 0) return sliceZ() + 1;
  return l.cells.length ? l.max[2] + 1 : SIDE - 1;
}

// The screen is affine in a point of a level plane, so three points of the
// plane give the point of it under a point of the canvas; null where the
// plane is seen edge-on.
function onPlane(px, py, z) {
  const o = screen(0, 0, z);
  const [ax, ay] = screen(1, 0, z).map((v, i) => v - o[i]);
  const [bx, by] = screen(0, 1, z).map((v, i) => v - o[i]);
  const det = ax * by - bx * ay;
  if (Math.abs(det) < 1e-6) return null;
  const dx = px - o[0];
  const dy = py - o[1];
  return [(by * dx - bx * dy) / det, (ax * dy - ay * dx) / det];
}

/** The grid's cell under a point of the canvas. */
function floorAt(px, py) {
  const z0 = floorZ(state.lvl);
  const p = onPlane(px, py, z0);
  return p && [Math.floor(p[0]), Math.floor(p[1]), z0 - 1];
}

function onFloor(e) {
  const r = $("cv").getBoundingClientRect();
  return floorAt(e.clientX - r.left, e.clientY - r.top);
}

// --- what the editor draws ---------------------------------------------------------------

function drawFloor(ctx, l) {
  if (!editing() || !state.show.base) return false;
  const z0 = floorZ(l);
  ctx.save();
  ctx.strokeStyle = "#ffffff20";
  ctx.lineWidth = 1;
  const line = (a, b) => {
    const p = screen(...a),
      q = screen(...b);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  for (let x = 1; x < SIDE; x++) line([x, 1, z0], [x, SIDE - 1, z0]);
  for (let y = 1; y < SIDE; y++) line([1, y, z0], [SIDE - 1, y, z0]);
  ctx.restore();
  return true;
}

function drawCell(ctx, c, home, key, ghost) {
  if (!editing() || ghost) return;
  if (set.has(key)) outline(ctx, c, state.idx, RIM);
  drawHover(ctx, c, home, key);
}

function drawHover(ctx, c, home, key) {
  if (mode.tool === "select") return;
  const h = hovered();
  if (!h || h.key !== key || h.face == null || (c.k ?? 0) !== (h.k ?? 0)) return;
  ctx.save();
  ctx.beginPath();
  facePoints(c, h.face).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = WASH;
  ctx.fill();
  outlineStroke(ctx, RIM);
  ctx.stroke();
  ctx.restore();
}

let icon = null;
on("atlas-loaded", (world) => {
  if (world === state.lvl?.theme) icon = null;
});

/** A cell's faces turned to the view, tinted. */
function tint(ctx, cell, fill) {
  ctx.fillStyle = fill;
  for (let face = 0; face < FACE_NORMAL.length; face++) {
    if (!turnedToView(FACE_NORMAL[face])) continue;
    ctx.beginPath();
    facePoints(cell, face).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }
}

function drawRun(ctx) {
  const run = runPreview();
  if (!run) return;
  outline(ctx, toCell(run.anchor), state.idx, GHOST, [4, 3]);
  if (!run.far) return;
  ctx.save();
  run.cells.forEach((cell, i) => tint(ctx, toCell(cell), VERDICT[run.verdicts[i]][1]));
  ctx.restore();
  run.cells.forEach((cell, i) =>
    outline(ctx, toCell(cell), state.idx, VERDICT[run.verdicts[i]][0], [2, 2]),
  );
  outline(ctx, toCell(run.far), state.idx, run.blocked ? BLOCKED : GHOST, [4, 3]);
}

/** The marquee as it is drawn, or the set's ghosts where a move would put it. */
function drawGesture(ctx) {
  if (gesture.marquee) {
    const [x0, y0, x1, y1] = gesture.marquee;
    ctx.save();
    ctx.fillStyle = WASH;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
    return;
  }
  const { delta, cells, blocked } = movePreview();
  if (!delta.some(Boolean)) return;
  const verdict = (i) => VERDICT[blocked.includes(i) ? "blocked" : "free"];
  ctx.save();
  cells.forEach((cell, i) => tint(ctx, toCell(cell), verdict(i)[1]));
  ctx.restore();
  cells.forEach((cell, i) => outline(ctx, toCell(cell), state.idx, verdict(i)[0], [4, 3]));
}

function drawGhost(ctx) {
  if (!editing()) return;
  if (gesture) return drawGesture(ctx);
  if (mode.tool !== "place") return;
  if (pending) return drawRun(ctx);
  const h = hovered();
  if (brush.kind === undefined && h?.face != null) {
    if (icon?.id !== brush.id || icon.theme !== state.lvl.theme)
      icon = { id: brush.id, theme: state.lvl.theme, cv: palette.brushIcon(ICON) };
    if (!icon.cv) return;
    const n = FACE_NORMAL[h.face];
    const [x, y] = screen(h.x + 0.5 + n[0] / 2, h.y + 0.5 + n[1] / 2, h.z + 0.5 + n[2] / 2);
    ctx.drawImage(icon.cv, x - ICON / 2, y - ICON / 2, ICON, ICON);
    return;
  }
  const g = ghostPreview();
  if (g) outline(ctx, toCell(g.cell), state.idx, g.blocked ? BLOCKED : GHOST, [4, 3]);
}

let ghost = null;

/** The cell Place would fill, from the hovered face or on the grid, and whether the click would be refused. */
export function ghostPreview() {
  const d = current();
  if (!d) return null;
  const floor = armed?.cell ?? floorCell();
  const h = floor ? null : hovered();
  if (!floor && h?.face == null) return null;
  const cell = floor ?? across(h, h.face);
  const kind = SPAN_KINDS.has(brush.kind) ? 0 : brush.kind;
  const key = `${cell}|${kind}`;
  if (ghost?.doc !== d.doc || ghost.key !== key) {
    const blocked = kind === undefined ? !!floor : blockRefusal(d.doc, cell, kind) !== null;
    ghost = { doc: d.doc, key, blocked };
  }
  return { cell, blocked: ghost.blocked };
}
