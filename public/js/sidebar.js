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
import { selectLevel, setSlice } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";
import { toast } from "./toast.js";

const KEY = "kula.display";
const SHOWN = [
  ["showSkins", "skins"],
  ["showObjects", "objects"],
  ["showModels", "models"],
  ["showMotion", "motion"],
  ["showThrough", "through"],
  ["showLabels", "labels"],
  ["showOutlines", "outlines"],
  ["showBase", "base"],
  ["showFaces", "faces"],
  ["showHidden", "hidden"],
  ["showCamera", "camera"],
  ["showCompass", "compass"],
];
const DEFAULTS = { ...state.show };

export const sidebarOverlays = () => matchMedia("(max-width: 760px)").matches;

export function setSidebar(open) {
  document.body.classList.toggle("sidebar-open", open);
  $("sidebar").inert = !open;
  const btn = $("menuBtn");
  const label = `${open ? "Hide" : "Show"} the sidebar`;
  btn.setAttribute("aria-expanded", String(open));
  btn.setAttribute("aria-label", label);
  btn.title = `${label} (m)`;
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

const SECTIONS = [
  ["Objects", ["object"]],
  ["Blocks and faces", ["block", "face"]],
  [null, ["settings"]],
];
const COUNT_ONLY = new Set(["block"]);
const byName = new Intl.Collator("en", { numeric: true }).compare;

export function buildKinds() {
  const box = $("kinds");
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
  const keys = [...counts.keys()].sort(
    (a, b) =>
      counts.get(b) - counts.get(a) ||
      byName(markerLabel(first.get(a)), markerLabel(first.get(b))) ||
      byName(a, b),
  );
  const toggled = keys.filter((k) => !COUNT_ONLY.has(markerGroup(first.get(k))));
  for (const [title, groups] of SECTIONS) {
    const mine = keys.filter((k) => groups.includes(markerGroup(first.get(k))));
    if (!mine.length) continue;
    // Safari drops the list role from a list whose bullets are styled away.
    const list = el("ul");
    list.setAttribute("role", "list");
    if (title) {
      const head = el("h3", { id: `kinds-${groups[0]}`, textContent: title });
      list.setAttribute("aria-labelledby", head.id);
      box.append(head);
    } else box.append(el("hr"));
    for (const k of mine) {
      const [m, n] = [first.get(k), counts.get(k)];
      list.append(
        COUNT_ONLY.has(markerGroup(m))
          ? el("li", { className: "kind" }, rowOf(m, n))
          : el("li", {}, kindButton(k, m, n, toggled)),
      );
    }
    box.append(list);
  }
  if (focused) [...box.querySelectorAll("button")].find((b) => b.dataset.kind === focused)?.focus();
}

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
    box.defaultChecked = DEFAULTS[key];
    box.checked = state.show[key];
    box.addEventListener("change", () => {
      state.show[key] = box.checked;
      choose(key, box.checked, DEFAULTS[key]);
      syncNeeds();
      invalidatePick();
      draw();
    });
  }
  $("panMode").checked = !!state.panMode;
  $("panMode").addEventListener("change", (e) => {
    state.panMode = e.target.checked;
    choose("panMode", state.panMode, false);
  });
  $("slice").addEventListener("input", (e) => setSlice(Number(e.target.value)));
  $("resetDisplay").onclick = () => {
    for (const [id, key] of SHOWN) {
      if (!$("display").contains($(id))) continue;
      state.show[key] = $(id).checked = DEFAULTS[key];
      delete chosen[key];
    }
    state.panMode = $("panMode").checked = false;
    delete chosen.panMode;
    setSlice(SIDE - 1);
    save();
    syncNeeds();
    invalidatePick();
    draw();
  };
  for (const box of document.querySelectorAll("input[data-needs]"))
    box.closest("label").addEventListener("click", () => {
      if (box.disabled) toast(`${held(box)}.`);
    });
  syncNeeds();
  $("resetKinds").onclick = () => {
    state.hiddenKinds.clear();
    buildKinds();
    invalidatePick();
    draw();
  };

  $("menuBtn").onclick = () => setSidebar(!document.body.classList.contains("sidebar-open"));
  $("scrim").onclick = () => setSidebar(false);
}

// Only the switches set away from their defaults, so a default that changes
// reaches whoever left that switch alone.
let chosen = {};

function choose(key, value, fallback) {
  if (value === fallback) delete chosen[key];
  else chosen[key] = value;
  save();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    /* ignore */
  }
}

export function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && typeof v === "object") {
      for (const k of Object.keys(DEFAULTS))
        if (typeof v[k] === typeof DEFAULTS[k]) state.show[k] = chosen[k] = v[k];
      if (typeof v.panMode === "boolean") state.panMode = chosen.panMode = v.panMode;
    }
  } catch {
    /* ignore */
  }
}

on("show-changed", (key) => choose(key, state.show[key], DEFAULTS[key]));

const slicing = () => sliceZ() > (state.lvl?.min[2] ?? 0);
const isOn = (el) => (el.type === "range" ? slicing() : el.checked);

function holder(box) {
  const up = box.dataset.needs && $(box.dataset.needs);
  if (!up) return null;
  return isOn(up) ? holder(up) : up;
}

function nameOf(box) {
  const label = box.closest("label").cloneNode(true);
  for (const aside of label.querySelectorAll("kbd, .def")) aside.remove();
  return label.textContent.replace(/\s+/g, " ").trim();
}

export function held(box) {
  const up = holder(box);
  if (!up) return null;
  return `“${nameOf(box)}” needs ${up.type === "range" ? "the slice lowered" : `“${nameOf(up)}” on`}`;
}

function syncNeeds() {
  for (const box of document.querySelectorAll("input[data-needs]")) {
    const why = held(box);
    box.disabled = !!why;
    box.title = box.closest("label").title = why ? `${why}.` : "";
  }
}

function syncSlice() {
  $("slice").max = SIDE - 1;
  $("slice").value = state.slice;
  $("sliceVal").textContent = slicing() ? `z \u2265 ${sliceZ()}` : "off";
  syncNeeds();
}

on("slice-changed", syncSlice);

on("density-changed", () => state.data && buildKinds());
on("atlas-loaded", (world) => {
  if (world === state.lvl?.theme) buildKinds();
});

on("level-changed", () => {
  markLevel();
  state.hiddenKinds.clear();
  buildKinds();
  syncSlice();
});
