import { $, el, on } from "./dom.js";
import { state, SIDE } from "./state.js";
import { WORLD_TINT, worldName, kindName, kindColour } from "./data.js";
import { selectLevel } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";
import { setSlice } from "./interaction.js";

const KEY = "kula.display";

export function buildWorlds() {
  const box = $("worlds");
  box.textContent = "";
  for (const w of state.data.themes) {
    const d = el("details", { className: "world" });
    d.append(
      el(
        "summary",
        {},
        el("span", { className: "swatch", style: `background:${WORLD_TINT[w.id] || "#889"}` }),
        el("span", {}, worldName(w.id)),
        el("span", { className: "n" }, String(w.levels.length)),
      ),
    );
    const list = el("div", { className: "levels" });
    for (const i of w.levels) {
      const l = state.data.levels[i];
      const b = el("button", { type: "button", textContent: short(l.name), title: l.name });
      b.dataset.i = i;
      b.onclick = () => selectLevel(i);
      list.append(b);
    }
    d.append(list);
    box.append(d);
  }
  markLevel();
}

const short = (name) => {
  const m = /^([A-Z]+)\s*(\d+)?$/.exec(name);
  if (!m) return name;
  return m[2] ? (m[1] === "LEVEL" ? m[2] : `${m[1][0]}${m[2]}`) : m[1];
};

function markLevel() {
  for (const b of $("worlds").querySelectorAll(".levels button")) {
    const on = Number(b.dataset.i) === state.li;
    b.setAttribute("aria-current", on ? "true" : "false");
    if (on) {
      b.closest("details").open = true;
      b.scrollIntoView({ block: "nearest" });
    }
  }
}

export function buildKinds() {
  const box = $("kinds");
  box.textContent = "";
  const counts = new Map();
  for (const o of state.lvl.objects) {
    const k = `${o.kind}/${o.type}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  if (!counts.size) {
    box.append(el("p", { className: "about", textContent: "This level places no objects." }));
    return;
  }
  const keys = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  for (const k of keys) {
    const [kind, type] = k.split("/").map(Number);
    const b = el(
      "button",
      { className: "kind", type: "button" },
      el("span", { className: "dot", style: `background:${kindColour(kind)}` }),
      el("span", {}, kindName(kind, type) || `kind ${kind} / ${type}`),
      el("span", { className: "n" }, String(counts.get(k))),
    );
    b.setAttribute("aria-pressed", state.hiddenKinds.has(k) ? "false" : "true");
    b.onclick = (e) => {
      if (e.shiftKey) {
        const only = state.hiddenKinds.size === keys.length - 1 && !state.hiddenKinds.has(k);
        state.hiddenKinds = new Set(only ? [] : keys.filter((x) => x !== k));
      } else if (state.hiddenKinds.has(k)) state.hiddenKinds.delete(k);
      else state.hiddenKinds.add(k);
      buildKinds();
      invalidatePick();
      draw();
    };
    box.append(b);
  }
}

export function wireDisplay() {
  for (const [id, key] of [
    ["showSkins", "skins"],
    ["showObjects", "objects"],
    ["showStart", "start"],
    ["showLabels", "labels"],
    ["showBase", "base"],
    ["showHidden", "hidden"],
  ]) {
    const box = $(id);
    box.checked = state.show[key];
    box.addEventListener("change", () => {
      state.show[key] = box.checked;
      save();
      invalidatePick();
      draw();
    });
  }
  $("panMode").checked = !!state.panMode;
  $("panMode").addEventListener("change", (e) => {
    state.panMode = e.target.checked;
    save();
  });
  $("slice").addEventListener("input", (e) => setSlice(Number(e.target.value)));
  $("resetDisplay").onclick = () => {
    state.show = {
      objects: true,
      start: true,
      labels: false,
      base: false,
      hidden: false,
      skins: true,
    };
    for (const [id, key] of [
      ["showSkins", "skins"],
      ["showObjects", "objects"],
      ["showStart", "start"],
      ["showLabels", "labels"],
      ["showBase", "base"],
      ["showHidden", "hidden"],
    ]) {
      $(id).checked = state.show[key];
    }
    state.panMode = false;
    $("panMode").checked = false;
    setSlice(SIDE - 1);
    save();
    invalidatePick();
    draw();
  };
  $("resetKinds").onclick = () => {
    state.hiddenKinds.clear();
    buildKinds();
    invalidatePick();
    draw();
  };

  $("menuBtn").onclick = () => {
    const open = document.body.classList.toggle("sidebar-open");
    $("menuBtn").setAttribute("aria-expanded", String(open));
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state.show, panMode: !!state.panMode }));
  } catch {}
}

export function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v) {
      state.panMode = !!v.panMode;
      delete v.panMode;
      Object.assign(state.show, v);
    }
  } catch {}
}

function syncSlice() {
  $("slice").max = SIDE - 1;
  $("slice").value = state.slice;
  $("sliceVal").textContent =
    state.slice >= (state.lvl?.max[2] ?? 33) ? "off" : `z \u2264 ${state.slice}`;
}

on("slice-changed", syncSlice);

on("level-changed", () => {
  markLevel();
  state.hiddenKinds.clear();
  buildKinds();
  syncSlice();
});
