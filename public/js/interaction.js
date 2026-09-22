import { $, emit } from "./dom.js";
import { state, SIDE, BLOCK, PITCH_MIN, PITCH_MAX, cellKey } from "./state.js";
import { draw, cellAt, invalidatePick } from "./render.js";
import { chip, writeHash, stepLevel, fit, pivot } from "./navigate.js";
import { showCell, clearDetail } from "./detail.js";
import { surveying, place } from "./survey.js";
import { OFF_LATTICE, FACE_NAME, kindName, markerLabel, markerState } from "./data.js";
import { setSidebar, sidebarOverlays } from "./sidebar.js";
import { closeModal, modalOpen } from "./modal.js";

const cv = $("cv");
const tip = $("tip");
const redraw = () => {
  invalidatePick();
  draw();
};

const ORBIT = 0.42; // degrees per pixel dragged

let drag = null;
let moved = 0;

const panning = (e) => e.shiftKey || e.button === 1 || e.button === 2 || state.panMode;

cv.addEventListener("contextmenu", (e) => e.preventDefault());

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, pan: panning(e) };
  moved = 0;
});

cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect();
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
  const c = cellAt(e.clientX - r.left, e.clientY - r.top);
  const key = c ? cellKey(c.x, c.y, c.z) : null;
  if ((state.hover?.key ?? null) !== key) {
    state.hover = c ? { ...c, key } : null;
    draw();
  }
  readout(c);
  hoverTip(c, e.clientX - r.left, e.clientY - r.top);
});

cv.addEventListener("pointerup", (e) => {
  const r = cv.getBoundingClientRect();
  if (drag && moved < 5) {
    const c = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (c && surveying()) {
      place(c, e.altKey);
    } else if (c) {
      state.selected = { ...c, key: cellKey(c.x, c.y, c.z) };
      showCell(c);
    } else {
      clearDetail();
    }
    draw();
  }
  drag = null;
});
cv.addEventListener("pointercancel", () => {
  drag = null;
});
cv.addEventListener("pointerleave", () => {
  state.hover = null;
  tip.hidden = true;
  $("readout").textContent = "";
  draw();
});

export function orbit(dx, dy) {
  pivot();
  // Dragging turns the level under the hand, so the camera goes the other way.
  state.cam.yaw = (state.cam.yaw - dx * ORBIT) % 360;
  state.cam.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, state.cam.pitch + dy * ORBIT));
  redraw();
  chip();
  writeHash();
}

export function pan(dx, dy) {
  const k = state.cam.zoom * BLOCK;
  state.cam.panX -= dx / k;
  state.cam.panY -= dy / k;
  redraw();
  writeHash();
}

export function setYaw(deg) {
  pivot();
  state.cam.yaw = ((deg % 360) + 360) % 360;
  redraw();
  chip();
  writeHash();
}

function readout(c) {
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
  if (kind && kindName(kind) && !marks.some((m) => m.face === null && m.kind === kind)) {
    lines.push(kindName(kind));
  }
  for (const m of marks) {
    const off = markerState(m) === "off" ? " · off" : "";
    lines.push(markerLabel(m) + off + (m.face ? ` · ${FACE_NAME[m.face]}` : ""));
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
  const { w, h } = state.view;
  const before = state.cam.zoom * BLOCK;
  state.cam.zoom = Math.max(0.08, Math.min(5, state.cam.zoom * factor));
  const after = state.cam.zoom * BLOCK;
  // keep whatever sits under the pointer where it is
  const ox = px - w / 2,
    oy = py - h / 2;
  state.cam.panX += ox / before - ox / after;
  state.cam.panY += oy / before - oy / after;
  redraw();
  writeHash();
}

// Two fingers pinch to zoom and slide to pan; one finger orbits, handled above.
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
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === "/" && !typing) {
    e.preventDefault();
    $("search").focus();
    $("search").select();
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
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
      stepLevel(-1, e.shiftKey);
      break;
    case "]":
      stepLevel(1, e.shiftKey);
      break;
    case "f":
      fit();
      redraw();
      chip();
      writeHash();
      break;
    case "t":
      toggle("showSkins");
      break;
    case "o":
      toggle("showObjects");
      break;
    case "d":
      toggle("showModels");
      break;
    case "s":
      toggle("showStart");
      break;
    case "l":
      toggle("showLabels");
      break;
    case "g":
      toggle("showBase");
      break;
    case "v":
      toggle("showTravel");
      break;
    case "m":
      $("menuBtn").click();
      break;
    case "?":
      emit("help");
      break;
    case "Escape":
      if (modalOpen()) {
        closeModal();
        break;
      }
      if (sidebarOverlays() && document.body.classList.contains("sidebar-open")) {
        setSidebar(false);
        break;
      }
      state.selected = null;
      clearDetail();
      draw();
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
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change"));
}
