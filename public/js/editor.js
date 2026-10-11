// The editor, loaded only when the page is opened to make levels: the mode,
// its tools and keys, and what it draws over the map through the frame's hooks.
import { $, emit, on } from "./dom.js";
import { state, SIDE, facing as turnedToView, screen, cellKey, sliceZ } from "./state.js";
import { FACE_NORMAL, FACE_NAME } from "./faces.js";
import { entryName, kindName, levelTitle, markerLabel, skinsTable } from "./data.js";
import { provideLevels, setSlice } from "./navigate.js";
import { cellAt, drawSoon, overlayWith } from "./render.js";
import { facePoints, outline, outlineStroke } from "./blocks.js";
import { onCellClick, hoverFaces, tipWith } from "./interaction.js";
import { clearDetail, showCell } from "./detail.js";
import { sidebarOverlays } from "./sidebar.js";
import { describeLevel, say } from "./a11y.js";
import { toast } from "./toast.js";
import {
  CRUMBLING_KIND,
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  FACING_TYPES,
  LASER_KIND,
  PLAIN_ONLY,
  PLATFORM_KIND,
  SPAN_KINDS,
  VANISHING_KIND,
  facesOf,
  inner,
  sameCell,
  spanAxis,
} from "./kwl.js";
import {
  ERROR,
  blockAt,
  describe,
  faceAt,
  removeBlock,
  setBlock,
  setFace,
  validate,
} from "./project.js";
import { get, load } from "./drafts.js";
import { canRedo, canUndo, edit, redo, undo } from "./trail.js";
import { copyShown, levelFor, wireDrafts } from "./draftlist.js";
import { wireForm } from "./editform.js";
import * as palette from "./palette.js";

const EDGE = "The game builds nothing past the edge.";
const HELD = "That cell holds a block already.";
const LAST = "A level keeps its last block.";
const BRITTLE = "Nothing stands on a platform's, laser's, crumbling or vanishing block's faces.";
const LOOKS_INTO = "That face looks into another block.";
const ONE_CELL = "A run needs two cells.";
const FLOOR_THING = "The grid lays blocks; a thing goes on a block's face.";
const CHANGED = "The run's own block changed while it waited.";
const WAITING = "The run waits for its far end. Click where it ends, or press Esc.";
const WAITING_TOUCH = "The run waits for its far end. Tap where it ends, or change the tool.";
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
const SLIP = 5;

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
let paletteOpen = !matchMedia("(max-width: 760px)").matches;

const onDraft = () => state.lvl?.draft !== undefined;
export const editing = () => mode.on && onDraft();
const current = () => {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : get(id);
  return d && { id, doc: d.doc };
};
const across = (c, face) => [c.x, c.y, c.z].map((v, i) => v + FACE_NORMAL[face][i]);
const lower = (name) => name.charAt(0).toLowerCase() + name.slice(1);
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const article = (word) => (/^([aeiou]|hour)/i.test(word) ? "an" : "a");
const aWord = (word) => `${article(word)} ${word}`;
const kindWord = (kind) => lower(kindName(kind) || "plain block");
const sentence = (text) => `${capital(text)}.`;
const place3 = (cell) => cell.join(", ");
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const phone = () => sidebarOverlays();
const hovered = () => armed?.c ?? state.hover;
const waiting = () => (pending.touch ? WAITING_TOUCH : WAITING);
const brushWord = () => {
  if (brush.kind === LASER_KIND)
    return `${palette.colourName(brush.colour)} ${kindWord(brush.kind)}`;
  return brush.kind !== undefined
    ? kindWord(brush.kind)
    : lower(palette.chosen()?.label ?? "thing");
};
const spanWord = (b) =>
  b.kind === LASER_KIND
    ? `${palette.colourName(b.colour ?? 0)} ${kindWord(b.kind)}`
    : kindWord(b.kind);
const toCell = ([x, y, z]) => ({ x, y, z });
const thingOn = (cell, face) =>
  (state.idx.markers.get(cellKey(...cell)) || []).find((m) => m.face === face) ?? null;
const plainOnly = (e) => {
  const name = lower(entryName(e.marker) ?? e.label);
  return name.endsWith("s")
    ? `${capital(name)} work on a plain block only.`
    : `${capital(aWord(name))} works on a plain block only.`;
};

export function bootEditor() {
  load();
  provideLevels(levelFor);
  wireDrafts();
  wireTools();
  wireForm();
}

// --- the mode and the strip ---------------------------------------------------------

function setMode(onNow, said = onNow ? "Editing on" : "Editing off") {
  if (mode.on === onNow) return;
  mode.on = onNow;
  pending = null;
  armed = null;
  document.body.classList.toggle("editing", onNow);
  status("");
  strip();
  if (said) say(said);
  drawSoon();
}

function setTool(tool) {
  mode.tool = tool;
  dropRun();
  disarm();
  status("");
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

const status = (text) => {
  $("toolStatus").textContent = text;
};

function refuse(text) {
  toast(text);
  status(text);
  return true;
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
      dropRun();
      disarm();
      say(`Brush: ${e.label}`);
      emit("brush-changed");
      drawSoon();
    },
    () => togglePalette(false),
  );
  on("level-changed", () => {
    // the level chosen has been announced, and leaving with it needs no word of its own
    if (!onDraft() && mode.on) setMode(false, null);
    dropRun();
    disarm();
    strip();
  });
  on("selection-changed", () => {
    if (quiet) return;
    if (phone() && !$("detail").hidden && paletteOpen) togglePalette(false);
    else sheets();
  });
  wireTouch();
  // the palette stands on the strip, however tall its line makes it
  new ResizeObserver(([e]) =>
    $("palette").style.setProperty("--strip-h", `${e.target.offsetHeight}px`),
  ).observe($("tools"));
  on("level-updated", strip);
  on("trail-changed", strip);
  document.addEventListener("keydown", keys, { capture: true });
  onCellClick((c, e) => {
    const taken = take(c, e);
    consumed = e.pointerType === "touch" && editing();
    return taken;
  });
  hoverFaces(() => editing() && mode.tool !== "select");
  tipWith((c) => {
    if (!editing() || mode.tool !== "place" || c?.face == null) return [];
    return [
      pending ? "End the run here" : `Place ${aWord(brushWord())} on the ${FACE_NAME[c.face]}`,
    ];
  });
  overlayWith({ under: drawFloor, cell: drawHover, frame: drawGhost });
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
  return false;
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
    if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) < SLIP) return;
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
  if (armed && armed.key === target.key && armed.face === target.face) {
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
  return { key, face: c.face ?? null, c: { ...c, key }, cell: null };
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
    eraseSelection();
  else if (mod || e.altKey) return;
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
  if (label) say(`Undid ${label}`);
}

function stepAgain() {
  const d = current();
  const label = d && redo(d.id);
  if (label) say(`Redid ${label}`);
}

function eraseSelection() {
  const s = state.selected;
  if (s) erase({ x: s.x, y: s.y, z: s.z, face: s.face ?? null });
}

// --- the tools -----------------------------------------------------------------------------

function commit(id, next, label) {
  edit(id, next, label);
  status("");
  say(capital(label));
}

/** Select what a tool placed or cleared; on a phone a finger's leaves the panel's sheet down. */
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

/** The errors `next` has that `before` had not. */
function newErrors(before, next) {
  const hides = skinsTable()?.hides;
  if (!hides) return [];
  const errorsOf = (p) => validate(p, hides).filter((f) => f.level === ERROR);
  const seen = new Set(errorsOf(before).map(describe));
  return errorsOf(next).filter((f) => !seen.has(describe(f)));
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
  if (brush.kind === undefined) return placeThing(c, d, e);
  if (SPAN_KINDS.has(brush.kind)) return startRun(c, e, d);
  const target = landing(c, e);
  if (!target) return false;
  return layBlock(d, target, brush.kind, e);
}

/** Lay a block of `kind` at `target`, refusing what the game would not load. */
function layBlock(d, target, kind, e = null) {
  if (!target.every(inner)) return refuse(EDGE);
  if (blockAt(d.doc, target)) return refuse(HELD);
  const next = setBlock(d.doc, target, { kind });
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
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

/** Every cell a span takes: its run, and for a platform the blocks beyond the far end. */
function runCells(b) {
  const axis = spanAxis(b.cell, b.far);
  if (axis === null) return [b.cell];
  const lo = Math.min(b.cell[axis], b.far[axis]);
  const extra = b.kind === PLATFORM_KIND ? (b.length ?? DEFAULT_LENGTH) - 1 : 0;
  const hi = Math.max(b.cell[axis], b.far[axis]) + extra;
  const cells = [];
  for (let t = lo; t <= hi; t++) {
    const c = [...b.cell];
    c[axis] = t;
    cells.push(c);
  }
  return cells;
}

const spanAt = (doc, cell) =>
  doc.blocks.find(
    (b) => SPAN_KINDS.has(b.kind) && b.far && runCells(b).some((c) => sameCell(c, cell)),
  ) ?? null;

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

/** The span the pending run would lay toward `far`: its own, re-laid, or the brush's. */
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
    if (!target.every(inner)) return refuse(EDGE);
    if (blockAt(d.doc, target)) return refuse(HELD);
    const grew = newErrors(d.doc, setBlock(d.doc, target, { kind: 0 }));
    if (grew.length) return refuse(sentence(grew[0].text));
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
      ? `moved the ${spanWord(span)}'s run to ${place3(far)}`
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
  const cand = h ? candidate(h, null, d.doc) : (armed?.cell ?? null);
  const far = cand && snap(pending.anchor, cand);
  if (!far) return { anchor: pending.anchor, far: null, cells: [], verdicts: [], blocked: false };
  const span = { ...spanToward(d.doc, far), cell: pending.anchor };
  const key = `${pending.anchor}|${JSON.stringify(span)}`;
  if (preview?.doc !== d.doc || preview.key !== key) {
    const cells = runCells(span);
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
    do not, a laser's far end on a plain or a laser's block being its to end on. */
function verdicts(doc, span, cells) {
  const beams = new Set();
  const runs = new Set();
  for (const b of doc.blocks) {
    if (!SPAN_KINDS.has(b.kind) || !b.far || sameCell(b.cell, span.cell)) continue;
    const laser = b.kind === LASER_KIND;
    const taken = laser ? runCells(b).slice(1, -1) : runCells(b);
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

/** Put the brush's thing on the clicked face, in place of whatever stood there. */
function placeThing(c, d, e) {
  if (!c || c.face == null) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) return false;
  const entry = palette.chosen();
  if (PLAIN_ONLY.has(brush.type) && b.kind !== 0) return refuse(plainOnly(entry));
  if (SPAN_KINDS.has(b.kind) || b.kind === CRUMBLING_KIND || b.kind === VANISHING_KIND)
    return refuse(BRITTLE);
  if (blockAt(d.doc, across(c, c.face))) return refuse(LOOKS_INTO);
  const o = { type: brush.type };
  if (brush.variant !== undefined) o.variant = brush.variant;
  if (FACING_TYPES.has(brush.type)) o.facing = facing;
  const next = setFace(d.doc, cell, c.face, o);
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

// The floor the ground grid draws lies one layer under the lowest block, and
// the screen is affine in a point of it, so three points of the plane give the
// cell under a click.
function onFloor(e) {
  const r = $("cv").getBoundingClientRect();
  const z0 = state.lvl.max[2] + 1;
  const o = screen(0, 0, z0);
  const [ax, ay] = screen(1, 0, z0).map((v, i) => v - o[i]);
  const [bx, by] = screen(0, 1, z0).map((v, i) => v - o[i]);
  const det = ax * by - bx * ay;
  if (Math.abs(det) < 1e-6) return null;
  const dx = e.clientX - r.left - o[0];
  const dy = e.clientY - r.top - o[1];
  const x = (by * dx - bx * dy) / det;
  const y = (ax * dy - ay * dx) / det;
  return [Math.floor(x), Math.floor(y), z0 - 1];
}

// --- what the editor draws ---------------------------------------------------------------

function drawFloor(ctx, l) {
  if (!editing() || !state.show.base) return false;
  const z0 = l.max[2] + 1;
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

function drawHover(ctx, c, home, key, ghost) {
  if (!editing() || mode.tool === "select" || ghost || c.k) return;
  const h = hovered();
  if (!h || h.key !== key || h.face == null) return;
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
on("atlas-loaded", () => {
  icon = null;
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

function drawGhost(ctx) {
  if (!editing() || mode.tool !== "place") return;
  if (pending) return drawRun(ctx);
  if (armed?.cell) return outline(ctx, toCell(armed.cell), state.idx, GHOST, [4, 3]);
  const h = hovered();
  if (!h || h.face == null) return;
  if (brush.kind === undefined) {
    if (icon?.id !== brush.id || icon.theme !== state.lvl.theme)
      icon = { id: brush.id, theme: state.lvl.theme, cv: palette.brushIcon(ICON) };
    if (!icon.cv) return;
    const n = FACE_NORMAL[h.face];
    const [x, y] = screen(h.x + 0.5 + n[0] / 2, h.y + 0.5 + n[1] / 2, h.z + 0.5 + n[2] / 2);
    ctx.drawImage(icon.cv, x - ICON / 2, y - ICON / 2, ICON, ICON);
    return;
  }
  const target = across(h, h.face);
  const d = current();
  const blocked = !target.every(inner) || (d && blockAt(d.doc, target) !== null);
  const at = { x: target[0], y: target[1], z: target[2] };
  outline(ctx, at, state.idx, blocked ? BLOCKED : GHOST, [4, 3]);
}
