import { $, el } from "./dom.js";
import { state } from "./state.js";
import {
  worldName,
  levelMarkers,
  markersOf,
  markerLabel,
  markerName,
  markerColour,
  inLattice,
} from "./data.js";
import { selectLevel, centreOn, writeHash } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";

const box = $("search");
const out = $("results");
let hits = [];
let cursor = -1;

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// A number is answered as a whole word, so `level 45` does not also bring back
// LEVEL 145. Words stay substrings, so `inc` still finds Inca.
const matches = (hay, terms) => {
  const words = hay.split(/[^a-z0-9]+/).filter(Boolean);
  return terms.every((t) => (/^\d+$/.test(t) ? words.includes(t) : hay.includes(t)));
};

function levelHaystack(l) {
  return norm(`${l.name} ${l.theme} ${worldName(l.theme)}`);
}

function search(q) {
  const terms = norm(q).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const res = [];

  const cell = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(q.trim());
  if (cell) {
    const [x, y, z] = cell.slice(1).map(Number);
    if ([x, y, z].every(inLattice)) {
      res.push({
        group: "Cell",
        label: `${x}, ${y}, ${z}`,
        hint: "centre the view here",
        go: () => {
          centreOn(x, y, z);
          invalidatePick();
          draw();
          writeHash();
        },
      });
    }
  }

  for (const w of state.data.themes) {
    const hay = norm(`${w.id} ${worldName(w.id)}`);
    if (matches(hay, terms)) {
      res.push({
        group: "Worlds",
        label: worldName(w.id),
        hint: `${w.levels.length} levels`,
        go: () => selectLevel(w.levels[0]),
      });
    }
  }

  state.data.levels.forEach((l, i) => {
    const hay = levelHaystack(l);
    if (matches(hay, terms)) {
      res.push({
        group: "Levels",
        label: l.name,
        hint: `${worldName(l.theme)} · ${l.placed} blocks`,
        rank: i === state.li ? -1 : 0,
        go: () => selectLevel(i),
      });
    }
  });

  const things = new Map();
  for (const l of state.data.levels) {
    for (const m of levelMarkers(l)) {
      if (!things.has(m.id)) things.set(m.id, { m, n: 0, levels: new Set() });
      const s = things.get(m.id);
      s.n++;
      s.levels.add(l.name);
    }
  }
  for (const [id, s] of things) {
    const m = s.m;
    const hay = norm(
      `${markerName(m) || ""} ${m.face === null ? `kind ${m.kind}` : `type ${m.type}`} ${id}`,
    );
    if (matches(hay, terms)) {
      res.push({
        group: "Objects",
        colour: markerColour(m),
        label: markerLabel(m),
        hint: `${s.n} placed in ${s.levels.size} levels`,
        go: () => jumpTo(id),
      });
    }
  }

  res.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  return res.slice(0, 60);
}

const firstOf = (l, id) => l.records.find((r) => markersOf(r).some((m) => m.id === id));

function jumpTo(id) {
  const here = state.lvl && firstOf(state.lvl, id);
  if (here) {
    centreOn(here.x, here.y, here.z);
    invalidatePick();
    draw();
    writeHash();
    return;
  }
  const i = state.data.levels.findIndex((l) => firstOf(l, id));
  if (i >= 0) {
    selectLevel(i);
    const r = firstOf(state.data.levels[i], id);
    centreOn(r.x, r.y, r.z);
    invalidatePick();
    draw();
    writeHash();
  }
}

// The input drives a listbox it does not contain, so the pairing is spelled
// out: the input owns aria-expanded and points at the row under the cursor,
// and each row is an option the cursor can name.
function open(expanded) {
  out.hidden = !expanded;
  box.setAttribute("aria-expanded", String(expanded));
  const at = expanded && cursor >= 0 ? `hit${cursor}` : "";
  if (at) box.setAttribute("aria-activedescendant", at);
  else box.removeAttribute("aria-activedescendant");
}

function render() {
  out.textContent = "";
  if (!box.value.trim()) {
    open(false);
    return;
  }
  if (!hits.length) {
    out.append(el("div", { className: "empty", textContent: "Nothing matches that." }));
    open(true);
    return;
  }
  let group = null;
  let list = null;
  hits.forEach((h, i) => {
    if (h.group !== group) {
      group = h.group;
      list = el("div", {}, el("div", { className: "group", textContent: group }));
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", group);
      out.append(list);
    }
    const b = el("button", { type: "button", id: `hit${i}` });
    b.setAttribute("role", "option");
    if (h.colour)
      b.append(
        el("span", {
          className: "dot",
          style: `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${h.colour}`,
        }),
      );
    b.append(h.label, el("span", { className: "hint", textContent: `  ${h.hint}` }));
    b.setAttribute("aria-selected", String(i === cursor));
    b.onclick = () => {
      h.go();
      close();
    };
    list.append(b);
  });
  open(true);
  if (cursor >= 0) $(`hit${cursor}`)?.scrollIntoView({ block: "nearest" });
}

const close = () => {
  cursor = -1;
  open(false);
  box.blur();
};

box.addEventListener("input", () => {
  hits = search(box.value);
  cursor = hits.length ? 0 : -1;
  render();
});
box.addEventListener("focus", () => {
  if (box.value) {
    hits = search(box.value);
    render();
  }
});
box.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    box.value = "";
    close();
    return;
  }
  if (!hits.length) return;
  if (e.key === "ArrowDown") {
    cursor = (cursor + 1) % hits.length;
    render();
    e.preventDefault();
  }
  if (e.key === "ArrowUp") {
    cursor = (cursor - 1 + hits.length) % hits.length;
    render();
    e.preventDefault();
  }
  if (e.key === "Enter" && cursor >= 0) {
    hits[cursor].go();
    close();
    e.preventDefault();
  }
});
document.addEventListener("click", (e) => {
  if (!out.hidden && !out.contains(e.target) && e.target !== box) open(false);
});
