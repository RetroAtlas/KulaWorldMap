// The editor, loaded only when the page is opened to make levels: the mode,
// its tools and keys, and what it draws over the map through the frame's hooks.
import { $, on } from "./dom.js";
import { state, SIDE, screen, cellKey, sliceZ } from "./state.js";
import { FACE_NORMAL, FACE_NAME } from "./faces.js";
import { kindName, levelTitle, markerLabel, skinsTable } from "./data.js";
import { provideLevels, setSlice } from "./navigate.js";
import { drawSoon, overlayWith } from "./render.js";
import { facePoints, outline, outlineStroke } from "./blocks.js";
import { onCellClick, hoverFaces, tipWith } from "./interaction.js";
import { showCell } from "./detail.js";
import { describeLevel, say } from "./a11y.js";
import { toast } from "./toast.js";
import { inner } from "./kwl.js";
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
import { get, load, update } from "./drafts.js";
import { copyShown, levelFor, wireDrafts } from "./draftlist.js";

const EDGE = "The game builds nothing past the edge.";
const HELD = "That cell holds a block already.";
const LAST = "A level keeps its last block.";
const TOOL_KEYS = { a: "place", z: "erase", i: "select" };
const WASH = "rgba(111 211 255 / 0.28)";
const RIM = "#6fd3ff";
const GHOST = "#ffffffd0";
const BLOCKED = "#ff6b6b";

const mode = { on: false, tool: "place" };
const brush = { kind: 0 };

const onDraft = () => state.lvl?.draft !== undefined;
export const editing = () => mode.on && onDraft();
const current = () => {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : get(id);
  return d && { id, doc: d.doc };
};
const across = (c, face) => [c.x, c.y, c.z].map((v, i) => v + FACE_NORMAL[face][i]);
const lower = (name) => name.charAt(0).toLowerCase() + name.slice(1);
const kindWord = (kind) => lower(kindName(kind) || "plain block");
const sentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
const place3 = (cell) => cell.join(", ");

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
  on("level-changed", () => {
    // the level chosen has been announced, and leaving with it needs no word of its own
    if (!onDraft() && mode.on) setMode(false, null);
    strip();
  });
  on("level-updated", strip);
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !state.lvl) return;
      const typing =
        /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
      if (typing) return;
      if (e.key === "w") toggleEditing();
      else if (editing() && TOOL_KEYS[e.key]) setTool(TOOL_KEYS[e.key]);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  onCellClick((c, e) => {
    if (!editing()) return false;
    if (e.shiftKey || mode.tool === "erase") return erase(c);
    if (mode.tool === "place") return place(c, e);
    return false;
  });
  hoverFaces(() => editing() && mode.tool !== "select");
  tipWith((c) =>
    editing() && mode.tool === "place" && c?.face != null
      ? [`Place a ${kindWord(brush.kind)} on the ${FACE_NAME[c.face]}`]
      : [],
  );
  overlayWith({ under: drawFloor, cell: drawHover, frame: drawGhost });
  strip();
}

// --- the tools -----------------------------------------------------------------------------

function commit(id, next) {
  update(id, next);
}

function select(cell) {
  const at = state.idx.cells.get(cellKey(...cell));
  if (at) showCell(at);
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
  const next = setBlock(d.doc, target, { ...brush });
  const grew = newErrors(d.doc, next);
  if (grew.length) return refuse(sentence(grew[0].text));
  if (target[2] < sliceZ()) setSlice(SIDE - 1 - target[2]);
  commit(d.id, next);
  select(target);
  status("");
  say(`Placed a ${kindWord(brush.kind)} at ${place3(target)}`);
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
    const m = (state.idx.markers.get(cellKey(...cell)) || []).find((m) => m.face === face);
    const name = m ? markerLabel(m) : "object";
    commit(d.id, setFace(d.doc, cell, face, null));
    select(cell);
    status("");
    say(`Removed the ${name} from the ${FACE_NAME[face]} of ${place3(cell)}`);
    return true;
  }
  if (d.doc.blocks.length === 1) return refuse(LAST);
  commit(d.id, removeBlock(d.doc, cell));
  status("");
  say(`Removed the ${kindWord(b.kind)} at ${place3(cell)}`);
  return true;
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

function drawGhost(ctx) {
  if (!editing() || mode.tool !== "place") return;
  const h = state.hover;
  if (!h || h.face == null) return;
  const target = across(h, h.face);
  const d = current();
  const blocked = !target.every(inner) || (d && blockAt(d.doc, target) !== null);
  const at = { x: target[0], y: target[1], z: target[2] };
  outline(ctx, at, state.idx, blocked ? BLOCKED : GHOST, [4, 3]);
}
