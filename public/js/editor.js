// The editor, loaded only when the page is opened to make levels: the mode,
// its tools and keys, and what it draws over the map through the frame's hooks.
import { $, on } from "./dom.js";
import { state, SIDE, screen, cellKey, sliceZ } from "./state.js";
import { FACE_NORMAL, FACE_NAME } from "./faces.js";
import { entryName, kindName, levelTitle, markerLabel, skinsTable } from "./data.js";
import { provideLevels, setSlice } from "./navigate.js";
import { drawSoon, overlayWith } from "./render.js";
import { facePoints, outline, outlineStroke } from "./blocks.js";
import { onCellClick, hoverFaces, tipWith } from "./interaction.js";
import { showCell } from "./detail.js";
import { describeLevel, say } from "./a11y.js";
import { toast } from "./toast.js";
import { CRUMBLING_KIND, FACING_TYPES, PLAIN_ONLY, VANISHING_KIND, inner } from "./kwl.js";
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
import * as palette from "./palette.js";

const EDGE = "The game builds nothing past the edge.";
const HELD = "That cell holds a block already.";
const LAST = "A level keeps its last block.";
const BRITTLE = "Nothing stands on a crumbling or vanishing block's faces.";
const LOOKS_INTO = "That face looks into another block.";
const TOOL_KEYS = { a: "place", z: "erase", i: "select" };
const WASH = "rgba(111 211 255 / 0.28)";
const RIM = "#6fd3ff";
const GHOST = "#ffffffd0";
const BLOCKED = "#ff6b6b";
const ICON = 28;
const TURNS = 4;

const mode = { on: false, tool: "place" };
// What Place lays: a kind of block, or a thing for a face, turned as `facing` says.
let brush = { id: "k0", kind: 0 };
let facing = 1;
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
const kindWord = (kind) => lower(kindName(kind) || "plain block");
const sentence = (text) => `${capital(text)}.`;
const place3 = (cell) => cell.join(", ");
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const brushWord = () =>
  brush.kind !== undefined ? kindWord(brush.kind) : lower(palette.chosen()?.label ?? "thing");
const thingOn = (cell, face) =>
  (state.idx.markers.get(cellKey(...cell)) || []).find((m) => m.face === face) ?? null;
const plainOnly = (e) => {
  const name = lower(entryName(e.marker) ?? e.label);
  return name.endsWith("s")
    ? `${capital(name)} work on a plain block only.`
    : `A ${name} works on a plain block only.`;
};

export function bootEditor() {
  load();
  provideLevels(levelFor);
  wireDrafts();
  wireTools();
}

// --- the mode and the strip ---------------------------------------------------------

function setMode(onNow, said = onNow ? "Editing on" : "Editing off") {
  if (mode.on === onNow) return;
  mode.on = onNow;
  status("");
  strip();
  if (said) say(said);
  drawSoon();
}

function setTool(tool) {
  mode.tool = tool;
  status("");
  strip();
  drawSoon();
}

function toggleEditing() {
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
  for (const b of [$("undoBtn"), $("redoBtn"), $("paletteBtn")]) b.hidden = !mode.on;
  $("undoBtn").disabled = !canUndo(id);
  $("redoBtn").disabled = !canRedo(id);
  $("paletteBtn").setAttribute("aria-pressed", String(paletteOpen));
  const shown = editing() && paletteOpen;
  if (shown) palette.sync();
  $("palette").hidden = !shown;
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
  $("undoBtn").onclick = stepBack;
  $("redoBtn").onclick = stepAgain;
  $("paletteBtn").onclick = () => {
    paletteOpen = !paletteOpen;
    strip();
  };
  palette.wirePalette((e) => {
    brush = e.kind !== undefined ? { id: e.id, kind: e.kind } : { id: e.id, type: e.type };
    if (e.variant !== undefined) brush.variant = e.variant;
    say(`Brush: ${e.label}`);
    drawSoon();
  });
  on("level-changed", () => {
    // the level chosen has been announced, and leaving with it needs no word of its own
    if (!onDraft() && mode.on) setMode(false, null);
    strip();
  });
  // the palette stands on the strip, however tall its line makes it
  new ResizeObserver(([e]) =>
    $("palette").style.setProperty("--strip-h", `${e.target.offsetHeight}px`),
  ).observe($("tools"));
  on("level-updated", strip);
  on("trail-changed", strip);
  document.addEventListener("keydown", keys, { capture: true });
  onCellClick((c, e) => {
    if (!editing()) return false;
    if (e.altKey) return pick(c);
    if (e.shiftKey || mode.tool === "erase") return erase(c);
    if (mode.tool === "place") return place(c, e);
    return false;
  });
  hoverFaces(() => editing() && mode.tool !== "select");
  tipWith((c) =>
    editing() && mode.tool === "place" && c?.face != null
      ? [`Place a ${brushWord()} on the ${FACE_NAME[c.face]}`]
      : [],
  );
  overlayWith({ under: drawFloor, cell: drawHover, frame: drawGhost });
  strip();
}

// A form field keeps the browser's own keys, and an open dialog keeps every key.
function keys(e) {
  if (!state.lvl || dialogOpen()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
  if (typing) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (editing() && !e.altKey && mod && key === "z") e.shiftKey ? stepAgain() : stepBack();
  else if (editing() && !e.altKey && e.ctrlKey && !e.metaKey && key === "y") stepAgain();
  else if (editing() && !mod && !e.altKey && (e.key === "Delete" || e.key === "Backspace"))
    eraseSelection();
  else if (mod || e.altKey) return;
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

function select(cell, face = null) {
  const at = state.idx.cells.get(cellKey(...cell));
  if (at) showCell(face === null ? at : { ...at, face });
}

/** The errors `next` has that `before` had not. */
function newErrors(before, next) {
  const hides = skinsTable()?.hides;
  if (!hides) return [];
  const errorsOf = (p) => validate(p, hides).filter((f) => f.level === ERROR);
  const seen = new Set(errorsOf(before).map(describe));
  return errorsOf(next).filter((f) => !seen.has(describe(f)));
}

function place(c, e) {
  const d = current();
  if (!d) return false;
  if (brush.kind === undefined) return placeThing(c, d);
  let target;
  if (c) {
    if (c.face == null) return false;
    target = across(c, c.face);
  } else {
    target = state.show.base ? onFloor(e) : null;
    if (!target || !target.every(inner)) return false;
  }
  if (!target.every(inner)) return refuse(EDGE);
  if (blockAt(d.doc, target)) return refuse(HELD);
  const next = setBlock(d.doc, target, { kind: brush.kind });
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
  if (target[2] < sliceZ()) setSlice(SIDE - 1 - target[2]);
  commit(d.id, next, `placed a ${kindWord(brush.kind)} at ${place3(target)}`);
  select(target);
  return true;
}

/** Put the brush's thing on the clicked face, in place of whatever stood there. */
function placeThing(c, d) {
  if (!c || c.face == null) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) return false;
  const e = palette.chosen();
  if (PLAIN_ONLY.has(brush.type) && b.kind !== 0) return refuse(plainOnly(e));
  if (b.kind === CRUMBLING_KIND || b.kind === VANISHING_KIND) return refuse(BRITTLE);
  if (blockAt(d.doc, across(c, c.face))) return refuse(LOOKS_INTO);
  const o = { type: brush.type };
  if (brush.variant !== undefined) o.variant = brush.variant;
  if (FACING_TYPES.has(brush.type)) o.facing = facing;
  const next = setFace(d.doc, cell, c.face, o);
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
  state.hiddenKinds.delete(brush.id);
  commit(d.id, next, `placed a ${lower(e.label)} on the ${FACE_NAME[c.face]} of ${place3(cell)}`);
  select(cell, c.face);
  return true;
}

function erase(c) {
  const d = current();
  if (!c || !d) return false;
  const cell = [c.x, c.y, c.z];
  const b = blockAt(d.doc, cell);
  if (!b) return false;
  const face = c.face ?? null;
  if (face !== null && faceAt(d.doc, cell, face)) {
    const m = thingOn(cell, face);
    const name = m ? lower(markerLabel(m)) : "object";
    commit(
      d.id,
      setFace(d.doc, cell, face, null),
      `removed the ${name} from the ${FACE_NAME[face]} of ${place3(cell)}`,
    );
    select(cell, face);
    return true;
  }
  if (d.doc.blocks.length === 1) return refuse(LAST);
  commit(d.id, removeBlock(d.doc, cell), `removed the ${kindWord(b.kind)} at ${place3(cell)}`);
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
  return palette.choose(`k${b.kind}`);
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
  const h = state.hover;
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

function drawGhost(ctx) {
  if (!editing() || mode.tool !== "place") return;
  const h = state.hover;
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
