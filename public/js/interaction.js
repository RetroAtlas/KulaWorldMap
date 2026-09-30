import { $, emit, on } from "./dom.js";
import {
  state,
  SIDE,
  BLOCK,
  PITCH_MIN,
  PITCH_MAX,
  ZOOM_MIN,
  ZOOM_MAX,
  cellKey,
  pivot,
} from "./state.js";
import { drawSoon, cellAt, invalidatePick, pointing, pressing, onResize } from "./render.js";
import { chip, writeHash, stepLevel, fit } from "./navigate.js";
import { showCell, clearDetail } from "./detail.js";
import { surveying, place } from "./survey.js";
import { OFF_LATTICE, FACE_NAME, kindName, ownMarker, markerLabel, markerNow } from "./data.js";
import { setSidebar, sidebarOverlays, held } from "./sidebar.js";
import { toast } from "./toast.js";
import { openSettings } from "./settings.js";

const cv = $("cv");
const tip = $("tip");
const redraw = () => {
  invalidatePick();
  drawSoon();
};

const ORBIT = 0.42;
const CLICK = 5;

let drag = null;
let moved = 0;
// In client coordinates, since the canvas can move under a still pointer.
let pointer = null;

// A camera moved on purpose stops being framed; a press that has not wandered
// past a click moved it by accident.
function hold() {
  if (!drag || moved >= CLICK) state.framing = null;
}

const panning = (e) => e.shiftKey || e.button === 1 || e.button === 2 || state.panMode;

cv.addEventListener("contextmenu", (e) => e.preventDefault());

cv.addEventListener("pointerdown", (e) => {
  pointing(true);
  pressing(true);
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, pan: panning(e) };
  moved = 0;
});

cv.addEventListener("pointermove", (e) => {
  pointing(true);
  pointer = { x: e.clientX, y: e.clientY };
  if (drag) {
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (drag.pan) pan(dx, dy);
    else orbit(dx, dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    return;
  }
  if (hoverAt(pointer)) readoutSoon();
});

cv.addEventListener("pointerup", (e) => {
  pressing(false);
  const r = cv.getBoundingClientRect();
  if (drag && moved < CLICK) {
    const c = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (c && surveying()) {
      place(c, e.altKey);
    } else if (c) {
      showCell(c);
    } else {
      clearDetail();
    }
    drawSoon();
  }
  drag = null;
  repickSoon();
});
cv.addEventListener("pointercancel", () => {
  pressing(false);
  drag = null;
});
cv.addEventListener("pointerleave", () => {
  pointing(false);
  pointer = null;
  state.hover = null;
  tip.hidden = true;
  readoutSoon();
  drawSoon();
});

function hoverAt({ x, y }) {
  const r = cv.getBoundingClientRect();
  const c = cellAt(x - r.left, y - r.top);
  const key = c ? cellKey(c.x, c.y, c.z) : null;
  const other = (state.hover?.key ?? null) !== key;
  if (other) {
    state.hover = c ? { ...c, key } : null;
    drawSoon();
  }
  hoverTip(c, x - r.left, y - r.top);
  return other;
}

export function orbit(dx, dy) {
  hold();
  pivot();
  // Dragging turns the level under the hand, so the camera goes the other way.
  state.cam.yaw = (state.cam.yaw - dx * ORBIT) % 360;
  state.cam.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.cam.pitch + dy * ORBIT));
  redraw();
  chip();
  writeHash();
}

export function pan(dx, dy) {
  hold();
  const k = state.cam.zoom * BLOCK;
  state.cam.panX -= dx / k;
  state.cam.panY -= dy / k;
  redraw();
  writeHash();
}

export function setYaw(deg) {
  hold();
  pivot();
  state.cam.yaw = ((deg % 360) + 360) % 360;
  redraw();
  chip();
  writeHash();
}

function refit() {
  fit();
  redraw();
  chip();
  writeHash();
}

$("fitBtn").onclick = refit;
on("view-changed", () => {
  $("fitBtn").classList.toggle("fitted", state.framing === fit);
});

// A level changed under a still pointer names no cell until the pointer moves.
on("level-changed", () => {
  $("corner").hidden = false;
  tip.hidden = true;
  pointer = null;
});

// Where the camera moved under a still pointer, the cell under it is hovered
// first; a press leaves the pick unpainted, so that waits for the lift.
let readoutQueued = 0;
let repick = false;
function readoutSoon() {
  if (!readoutQueued) readoutQueued = requestAnimationFrame(readout);
}
function repickSoon() {
  repick = true;
  readoutSoon();
}
on("view-changed", repickSoon);
onResize(repickSoon);

function readout() {
  readoutQueued = 0;
  if (repick && pointer && !drag && !touch) hoverAt(pointer);
  repick = false;
  if (!state.lvl) return;
  const c = state.hover;
  const { zoom, yaw, pitch } = state.cam;
  const view = `×${zoom.toFixed(2)}  ${Math.round(yaw)}° / ${Math.round(pitch)}°`;
  $("readout").textContent = c ? `${c.x}, ${c.y}, ${c.z}   ${view}` : view;
}

function hoverTip(c, px, py) {
  if (!c) {
    tip.hidden = true;
    return;
  }
  const key = cellKey(c.x, c.y, c.z);
  const marks = state.idx.markers.get(key) || [];
  const kind =
    c.v === OFF_LATTICE
      ? null
      : c.v < state.data.firstRecord
        ? c.v
        : state.idx.records.get(key)?.[0]?.kind;
  const lines = [`<b>${c.x}, ${c.y}, ${c.z}</b>`];
  if (kind && kindName(kind) && !ownMarker(marks, kind)) {
    lines.push(kindName(kind));
  }
  for (const m of marks) {
    const off = markerNow(m) === "off" ? " · off" : "";
    lines.push(markerLabel(m) + off + (m.face !== null ? ` · ${FACE_NAME[m.face]}` : ""));
  }
  tip.innerHTML = lines.join("<br>");
  tip.hidden = false;
  tip.style.left = `${Math.min(px + 14, state.view.w - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.max(8, py - tip.offsetHeight - 12)}px`;
}

cv.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(
      e.clientX - r.left,
      e.clientY - r.top,
      Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)),
    );
  },
  { passive: false },
);

export function zoomAt(px, py, factor) {
  hold();
  const { w, h } = state.view;
  const before = state.cam.zoom * BLOCK;
  state.cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.cam.zoom * factor));
  const after = state.cam.zoom * BLOCK;
  // keep whatever sits under the pointer where it is
  const ox = px - w / 2,
    oy = py - h / 2;
  state.cam.panX += ox / before - ox / after;
  state.cam.panY += oy / before - oy / after;
  redraw();
  writeHash();
}

let touch = null;
const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const middle = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];

cv.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      drag = null;
      touch = { d: spread(e.touches), m: middle(e.touches) };
    }
  },
  { passive: true },
);

cv.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length !== 2 || !touch) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const d = spread(e.touches),
      m = middle(e.touches);
    pan(m[0] - touch.m[0], m[1] - touch.m[1]);
    zoomAt(m[0] - r.left, m[1] - r.top, d / touch.d);
    touch = { d, m };
  },
  { passive: false },
);

cv.addEventListener(
  "touchend",
  () => {
    touch = null;
  },
  { passive: true },
);

addEventListener("keydown", (e) => {
  // a focused switch leaves the map its keys, and the slider keeps its arrows
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== "checkbox";
  if (e.key === "/" && !typing) {
    e.preventDefault();
    $("search").focus();
    $("search").select();
    return;
  }
  // Many layouts type punctuation with Option or AltGr, and AltGr arrives as
  // Ctrl with Alt; with a letter, a digit or a named key, Alt is a shortcut.
  const typed = e.altKey && !e.metaKey && /^[^\p{L}\p{N}]$/u.test(e.key);
  if (typing || ((e.metaKey || e.ctrlKey || e.altKey) && !typed)) return;
  const step = e.shiftKey ? 220 : 70;
  switch (e.key) {
    case "ArrowLeft":
      pan(step, 0);
      break;
    case "ArrowRight":
      pan(-step, 0);
      break;
    case "ArrowUp":
      pan(0, step);
      break;
    case "ArrowDown":
      pan(0, -step);
      break;
    case "+":
    case "=":
      zoomAt(state.view.w / 2, state.view.h / 2, 1.2);
      break;
    case "-":
    case "_":
      zoomAt(state.view.w / 2, state.view.h / 2, 1 / 1.2);
      break;
    case "q":
      setYaw(Math.round(state.cam.yaw / 45) * 45 - 45);
      break;
    case "e":
      setYaw(Math.round(state.cam.yaw / 45) * 45 + 45);
      break;
    case ",":
      setSlice(state.slice - 1);
      break;
    case ".":
      setSlice(state.slice + 1);
      break;
    case "\\":
      setSlice(SIDE - 1);
      break;
    case "[":
      stepLevel(-1);
      break;
    case "]":
      stepLevel(1);
      break;
    case "f":
      refit();
      break;
    case "t":
      toggle("showSkins");
      break;
    case "b":
      toggle("showOutlines");
      break;
    case "o":
      toggle("showObjects");
      break;
    case "d":
      toggle("showModels");
      break;
    case "x":
      toggle("showThrough");
      break;
    case "c":
      toggle("showCamera");
      break;
    case "h":
      toggle("showHidden");
      break;
    case "p":
      toggle("panMode");
      break;
    case "s":
      openSettings();
      break;
    case "l":
      toggle("showLabels");
      break;
    case "n":
      toggle("showFaces");
      break;
    case "g":
      toggle("showBase");
      break;
    case "v":
      toggle("showMotion");
      break;
    case "m":
      $("menuBtn").click();
      break;
    case "?":
      emit("help");
      break;
    case "Escape":
      if (sidebarOverlays() && document.body.classList.contains("sidebar-open")) {
        setSidebar(false);
        break;
      }
      clearDetail();
      drawSoon();
      break;
    default:
      return;
  }
  e.preventDefault();
});

export function setSlice(z) {
  state.slice = Math.max(0, Math.min(SIDE - 1, z));
  emit("slice-changed");
  redraw();
  chip();
  writeHash();
}

function toggle(id) {
  const box = $(id);
  const why = held(box);
  if (why) return toast(`${why}.`);
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change"));
}
