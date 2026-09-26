import { $, el, on } from "./dom.js";
import { state, SIDE, sliceZ } from "./state.js";
import {
  WORLD_TINT,
  worldName,
  levelTitle,
  levelMarkers,
  blockMarkers,
  markerGroup,
  markerLabel,
  markerColour,
} from "./data.js";
import { markerIcon } from "./icons.js";
import { selectLevel } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";
import { setSlice } from "./interaction.js";

const KEY = "kula.display";
const SHOWN = [
  ["showSkins", "skins"],
  ["showOutlines", "outlines"],
  ["showObjects", "objects"],
  ["showModels", "models"],
  ["showTravel", "travel"],
  ["showThrough", "through"],
  ["showLabels", "labels"],
  ["showFaces", "faces"],
  ["showBase", "base"],
  ["showStart", "start"],
  ["showHidden", "hidden"],
];
const DEFAULTS = { ...state.show };

/** Where the drawer floats over the map rather than sitting beside it. */
export const sidebarOverlays = () => matchMedia("(max-width: 760px)").matches;

export function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("menuBtn").setAttribute("aria-expanded", String(open));
}

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
      const b = el("button", {
        type: "button",
        textContent: short(levelTitle(l)),
        title: levelTitle(l),
      });
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

// What stands on the faces is listed apart from the blocks, and the level's
// settings, which are neither, come last. Each group is a list, named by its
// heading where it has one.
const GROUPS = [
  ["object", "Objects"],
  ["block", "Blocks"],
  ["settings", null],
];
// A row of a group here only counts; any other row shows and hides what it
// lists on the map.
const COUNT_ONLY = new Set(["block"]);

export function buildKinds() {
  const box = $("kinds");
  // A row that has the focus has it again once the rows are built anew.
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.kind : null;
  box.textContent = "";
  const counts = new Map();
  const first = new Map();
  for (const m of [...levelMarkers(state.lvl), ...blockMarkers(state.lvl)]) {
    counts.set(m.id, (counts.get(m.id) || 0) + 1);
    if (!first.has(m.id)) first.set(m.id, m);
  }
  if (!counts.size) {
    box.append(el("p", { className: "about", textContent: "This level places no objects." }));
    return;
  }
  const keys = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const toggled = keys.filter((k) => !COUNT_ONLY.has(markerGroup(first.get(k))));
  for (const [group, title] of GROUPS) {
    const mine = keys.filter((k) => markerGroup(first.get(k)) === group);
    if (!mine.length) continue;
    // Safari drops the list role from a list whose bullets are styled away.
    const list = el("ul");
    list.setAttribute("role", "list");
    if (title) {
      const head = el("h3", { id: `kinds-${group}`, textContent: title });
      list.setAttribute("aria-labelledby", head.id);
      box.append(head);
    } else box.append(el("hr"));
    for (const k of mine) {
      const [m, n] = [first.get(k), counts.get(k)];
      list.append(
        COUNT_ONLY.has(group)
          ? el("li", { className: "kind" }, rowOf(m, n))
          : el("li", {}, kindButton(k, m, n, toggled)),
      );
    }
    box.append(list);
  }
  if (focused) [...box.querySelectorAll("button")].find((b) => b.dataset.kind === focused)?.focus();
}

// The settings have no icon, and a row of them shows a dot.
const iconOf = (m) =>
  markerIcon(m, state.lvl) ??
  el("span", { className: "dot", style: `background:${markerColour(m)}` });

const rowOf = (m, n) => [
  iconOf(m),
  el("span", {}, markerLabel(m)),
  el("span", { className: "n" }, String(n)),
];

function kindButton(k, m, n, keys) {
  const b = el("button", { className: "kind", type: "button" }, rowOf(m, n));
  b.dataset.kind = k;
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
  return b;
}

export function wireDisplay() {
  for (const [id, key] of SHOWN) {
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
    state.show = { ...DEFAULTS };
    for (const [id, key] of SHOWN) $(id).checked = state.show[key];
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

  $("menuBtn").onclick = () => setSidebar(!document.body.classList.contains("sidebar-open"));
  $("scrim").onclick = () => setSidebar(false);
}

/** Keeps only the switches set away from their defaults, so that a default
    that changes reaches whoever left that switch alone. */
function save() {
  const set = Object.fromEntries(Object.entries(state.show).filter(([k, v]) => v !== DEFAULTS[k]));
  if (state.panMode) set.panMode = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(set));
  } catch {
    /* ignore */
  }
}

export function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v) {
      state.panMode = !!v.panMode;
      // a saved switch the display does not have is left behind
      for (const k of Object.keys(DEFAULTS)) if (k in v) state.show[k] = v[k];
    }
  } catch {
    /* ignore */
  }
}

function syncSlice() {
  $("slice").max = SIDE - 1;
  $("slice").value = state.slice;
  $("sliceVal").textContent = sliceZ() <= (state.lvl?.min[2] ?? 0) ? "off" : `z \u2265 ${sliceZ()}`;
}

on("slice-changed", syncSlice);

on("atlas-loaded", (world) => {
  if (world === state.lvl?.theme) buildKinds();
});

on("level-changed", () => {
  markLevel();
  state.hiddenKinds.clear();
  buildKinds();
  syncSlice();
});
