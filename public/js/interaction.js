import { $, emit } from "./dom.js";
import { state, SIDE, TILE, sx, sy, plane, cellKey } from "./state.js";
import { draw, resize, cellAt, invalidatePick } from "./render.js";
import { chip, writeHash, stepLevel, fit } from "./navigate.js";
import { showCell, clearDetail } from "./detail.js";
import { kindName } from "./data.js";

const cv = $("cv");
const tip = $("tip");
let drag = null;
let moved = 0;

const redraw = () => {
  invalidatePick();
  draw();
};

cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY };
  moved = 0;
  cv.focus();
});

cv.addEventListener("pointermove", (e) => {
  const r = cv.getBoundingClientRect();
  if (drag) {
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    moved += Math.abs(dx) + Math.abs(dy);
    state.cam.x -= dx / state.cam.z;
    state.cam.y -= dy / state.cam.z;
    drag = { x: e.clientX, y: e.clientY };
    invalidatePick();
    draw();
    writeHash();
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

const end = () => {
  drag = null;
};
cv.addEventListener("pointerup", (e) => {
  const r = cv.getBoundingClientRect();
  if (drag && moved < 5) {
    const c = cellAt(e.clientX - r.left, e.clientY - r.top);
    if (c) {
      state.selected = { ...c, key: cellKey(c.x, c.y, c.z) };
      showCell(c);
    } else {
      clearDetail();
    }
    draw();
  }
  end();
});
cv.addEventListener("pointercancel", end);
cv.addEventListener("pointerleave", () => {
  state.hover = null;
  tip.hidden = true;
  $("readout").textContent = "";
  draw();
});

function readout(c) {
  const z = state.cam.z.toFixed(2);
  $("readout").textContent = c
    ? `${c.x}, ${c.y}, ${c.z}   ×${z}   rot ${state.rot}`
    : `×${z}   rot ${state.rot}`;
}

function hoverTip(c, px, py) {
  if (!c) {
    tip.hidden = true;
    return;
  }
  const objs = state.idx.objects.get(cellKey(c.x, c.y, c.z)) || [];
  const lines = [`<b>${c.x}, ${c.y}, ${c.z}</b>`];
  for (const o of objs) {
    lines.push(kindName(o.kind, o.type) || `kind ${o.kind} / type ${o.type}`);
  }
  tip.innerHTML = lines.join("<br>");
  tip.hidden = false;
  const w = tip.offsetWidth,
    h = tip.offsetHeight;
  tip.style.left = `${Math.min(px + 14, state.view.w - w - 8)}px`;
  tip.style.top = `${Math.max(8, py - h - 12)}px`;
}

cv.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0016));
  },
  { passive: false },
);

export function zoomAt(px, py, factor) {
  const wx = (px - state.view.w / 2) / state.cam.z + state.cam.x;
  const wy = (py - state.view.h / 2) / state.cam.z + state.cam.y;
  state.cam.z = Math.max(0.1, Math.min(4, state.cam.z * factor));
  state.cam.x = wx - (px - state.view.w / 2) / state.cam.z;
  state.cam.y = wy - (py - state.view.h / 2) / state.cam.z;
  redraw();
  writeHash();
}

// pinch
let pinch = null;
cv.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) pinch = dist(e.touches);
  },
  { passive: true },
);
cv.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const d = dist(e.touches);
      const r = cv.getBoundingClientRect();
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      zoomAt(cx, cy, d / pinch);
      pinch = d;
    }
  },
  { passive: false },
);
cv.addEventListener(
  "touchend",
  () => {
    pinch = null;
  },
  { passive: true },
);
const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export function setRotation(r) {
  state.rot = r & 3;
  redraw();
  chip();
  writeHash();
}

export function setSlice(z) {
  state.slice = Math.max(0, Math.min(SIDE - 1, z));
  $("slice").value = state.slice;
  $("sliceVal").textContent =
    state.slice >= (state.lvl?.max[2] ?? 33) ? "off" : `z ≤ ${state.slice}`;
  redraw();
  chip();
  writeHash();
}

addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === "/" && !typing) {
    e.preventDefault();
    $("search").focus();
    $("search").select();
    return;
  }
  if (typing) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const pan = (dx, dy) => {
    state.cam.x += dx / state.cam.z;
    state.cam.y += dy / state.cam.z;
    redraw();
    writeHash();
  };
  const step = e.shiftKey ? 220 : 70;
  switch (e.key) {
    case "ArrowLeft":
      pan(-step, 0);
      break;
    case "ArrowRight":
      pan(step, 0);
      break;
    case "ArrowUp":
      pan(0, -step);
      break;
    case "ArrowDown":
      pan(0, step);
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
      setRotation(state.rot - 1);
      break;
    case "e":
      setRotation(state.rot + 1);
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
      writeHash();
      break;
    case "o":
      toggle("showObjects");
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
    case "m":
      $("menuBtn").click();
      break;
    case "?":
      emit("help");
      break;
    case "Escape":
      if (!$("help").hidden) {
        $("help").hidden = true;
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

function toggle(id) {
  const box = $(id);
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change"));
}
