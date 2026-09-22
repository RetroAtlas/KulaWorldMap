import { $, el, on } from "./dom.js";
import { state, SIDE, cellKey, sliceZ } from "./state.js";
import { worldName, levelTitle, inLattice } from "./data.js";
import { selectLevel, centreOn, writeHash } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";
import { showCell } from "./detail.js";
import { say } from "./a11y.js";
import { parseQuery, queryTerms } from "./searchquery.js";
import { whole } from "./searchtext.js";
import { matchPlaces } from "./placesearch.js";
import { matchObjects } from "./objectsearch.js";
import { setSidebar, sidebarOverlays } from "./sidebar.js";
import { setSlice } from "./interaction.js";

const box = $("search");
const bar = $("scope");
const out = $("results");

const GROUP_MAX = 8;

// all | world | level, relative to the level in hand
let scope = "all";
let expanded = new Set();
let rows = [];
let cursor = -1;
// The row the cursor is on, by what it names rather than by its place in
// the list, so it is found again when a change of level lays the list out
// round the new one.
let current = null;

const SCOPES = [
  ["all", () => "All"],
  ["world", () => worldName(state.lvl.theme)],
  ["level", () => levelTitle(state.lvl)],
];
const scopeLabel = () => SCOPES.find(([key]) => key === scope)[1]();

const inScope = (li, theme) =>
  scope === "all" ||
  (scope === "world" && theme === state.lvl.theme) ||
  (scope === "level" && li === state.li);

function scopeBar() {
  bar.textContent = "";
  for (const [key, label] of SCOPES) {
    const b = el("button", { type: "button", textContent: label() });
    b.setAttribute("aria-pressed", String(scope === key));
    b.onclick = () => {
      scope = key;
      render();
    };
    bar.append(b);
  }
}

// Every occurrence of every term, overlaps merged, as text and <mark> nodes.
function marked(text, terms) {
  const lower = text.toLowerCase();
  const ranges = [];
  for (const term of terms)
    for (let i = lower.indexOf(term); i >= 0; i = lower.indexOf(term, i + term.length))
      ranges.push([i, i + term.length]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const nodes = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) nodes.push(text.slice(pos, s));
    nodes.push(el("mark", { textContent: text.slice(s, e) }));
    pos = e;
  }
  if (pos < text.length) nodes.push(text.slice(pos));
  return nodes;
}

const cell = (q) => {
  const m = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(q);
  if (!m) return null;
  const at = m.slice(1).map(Number);
  return at.every(inLattice) ? at : null;
};

// A find is selected as a click would select it, so the outline and the
// panel say which block the view was centred on; one above the slice's
// ceiling lifts the ceiling to it, since a cell above it is not drawn.
function goTo(x, y, z) {
  if (z < sliceZ()) setSlice(SIDE - 1 - z);
  centreOn(x, y, z);
  const key = cellKey(x, y, z);
  const c = state.idx.cells.get(key);
  if (c) {
    state.selected = { ...c, key };
    showCell(c);
  }
  invalidatePick();
  draw();
  writeHash();
}

function jump(h) {
  if (h.li !== state.li) selectLevel(h.li);
  goTo(h.record.x, h.record.y, h.record.z);
  say(`${h.name}, ${h.where.replace(" · ", ", ")}, ${levelTitle(h.level)}`);
}

// A row is an option the cursor can name; choosing one keeps the list, so
// the next can be chosen after it, and gives the keys back to the map.
function option(key, go, ...kids) {
  const b = el("button", { type: "button" }, ...kids);
  b.setAttribute("role", "option");
  b.dataset.key = key;
  b.onclick = () => {
    current = key;
    const li = state.li;
    go();
    // A change of level scrolls the sidebar to the level's button, which
    // sits under the list; the list, laid out again round the new level with
    // the chosen row at its head, is what the eye is on.
    if (state.li !== li) box.scrollIntoView({ block: "nearest" });
    mark();
    box.blur();
    if (sidebarOverlays()) setSidebar(false);
  };
  rows.push(b);
  return b;
}

const hint = (text) => [" ", el("span", { className: "hint", textContent: text })];

// The index matched every pair but the row shows only the telling ones; a
// hit on any other would look inexplicable, so what matched is appended.
function objectRow(h, terms) {
  const shown = [h.where, ...h.shown];
  const seen = `${h.name} ${shown.join(" ")}`.toLowerCase();
  const missing = terms.filter((t) => !seen.includes(t));
  const matched = h.more.filter((s) => missing.some((t) => (whole(t) ? s === t : s.includes(t))));
  const ex = [...shown, ...matched].join(" · ");
  return option(
    `${h.li}:${h.key}:${h.marker.face}:${h.marker.id}`,
    () => jump(h),
    el("span", { className: "loc", textContent: levelTitle(h.level) }),
    " ",
    ...marked(h.name, terms),
    " ",
    el("span", { className: "ex" }, ...marked(ex, terms)),
  );
}

function group(label, items, make, key) {
  const g = el(
    "div",
    {},
    el("div", { className: "group" }, el("span", {}, label), el("span", {}, String(items.length))),
  );
  g.setAttribute("role", "group");
  g.setAttribute("aria-label", label);
  const all = key === undefined || expanded.has(key);
  for (const item of all ? items : items.slice(0, GROUP_MAX)) g.append(make(item));
  if (!all && items.length > GROUP_MAX) {
    const rest = items.length - GROUP_MAX;
    const more = el("button", {
      className: "showmore",
      type: "button",
      textContent: `show ${rest} more`,
    });
    more.onclick = () => {
      expanded.add(key);
      render();
    };
    g.append(more);
  }
  out.append(g);
}

function render() {
  out.textContent = "";
  rows = [];
  const q = box.value.trim();
  if (!q || !state.lvl) {
    show(false);
    return;
  }
  const groups = parseQuery(q);
  const terms = queryTerms(groups);

  const places = matchPlaces(state.data, groups, terms, state.li);
  const worlds = places.filter(
    (c) => c.world && (scope === "all" || c.world.id === state.lvl.theme),
  );
  const levels = places.filter((c) => c.level && inScope(c.li, c.level.theme));
  const at = cell(q);
  if (at)
    group("Cell", [at], ([x, y, z]) =>
      option(
        `c:${x},${y},${z}`,
        () => goTo(x, y, z),
        `${x}, ${y}, ${z}`,
        hint("centre the view here"),
      ),
    );
  if (worlds.length)
    group("Worlds", worlds, (c) =>
      option(
        `w:${c.world.id}`,
        () => selectLevel(c.world.levels[0]),
        c.name,
        hint(`${c.world.levels.length} levels`),
      ),
    );
  if (levels.length)
    group("Levels", levels, (c) =>
      option(
        `l:${c.li}`,
        () => selectLevel(c.li),
        c.name,
        hint(`${worldName(c.level.theme)} · ${c.level.placed} blocks`),
      ),
    );

  // Objects group by where they stand: the level in hand, the rest of its
  // world, then every other world in the disc's order.
  const hits = matchObjects(state.data, groups, terms).filter((h) => inScope(h.li, h.level.theme));
  const here = {
    key: "level",
    label: `${worldName(state.lvl.theme)} · ${levelTitle(state.lvl)}`,
    hits: [],
  };
  const byWorld = new Map();
  for (const t of [state.lvl.theme, ...state.data.themes.map((t) => t.id)])
    if (!byWorld.has(t)) byWorld.set(t, { key: t, label: worldName(t), hits: [] });
  for (const h of hits) (h.li === state.li ? here : byWorld.get(h.level.theme)).hits.push(h);
  for (const g of [here, ...byWorld.values()]) {
    if (!g.hits.length) continue;
    g.hits.sort((a, b) => a.rank - b.rank);
    group(g.label, g.hits, (h) => objectRow(h, terms), g.key);
  }

  const found = at || worlds.length || levels.length;
  const where = scope === "all" ? "" : ` in ${scopeLabel()}`;
  if (!hits.length && !found) {
    out.append(
      el("div", { className: "empty", textContent: `Nothing matches that${where}.` }, widen()),
    );
  } else {
    const perWorld = state.data.themes
      .map((t) => [worldName(t.id), hits.filter((h) => h.level.theme === t.id).length])
      .filter(([, n]) => n)
      .map(([name, n]) => `${name} ${n}`);
    const text = hits.length
      ? `${hits.length} object${hits.length === 1 ? "" : "s"}${where}` +
        (scope === "all" && perWorld.length > 1 ? ` · ${perWorld.join(" · ")}` : "")
      : `no objects${where}`;
    out.append(el("div", { className: "more", textContent: text }, widen()));
  }
  show(true);
  mark();
}

// A scoped search says so, with the way out beside it.
function widen() {
  if (scope === "all") return [];
  const w = el("span", { className: "widen", textContent: "search everywhere" });
  w.onclick = () => {
    scope = "all";
    render();
  };
  return [" · ", w];
}

// The input drives a listbox it does not contain, so the pairing is spelled
// out: the input owns aria-expanded and points at the row under the cursor,
// and each row is an option the cursor can name.
function show(shown) {
  out.hidden = !shown;
  bar.hidden = !shown;
  if (shown) scopeBar();
  box.setAttribute("aria-expanded", String(shown));
}

function mark() {
  cursor = rows.findIndex((b) => b.dataset.key === current);
  rows.forEach((b, i) => {
    b.id = `hit${i}`;
    b.setAttribute("aria-selected", String(i === cursor));
  });
  if (cursor < 0) {
    box.removeAttribute("aria-activedescendant");
    return;
  }
  box.setAttribute("aria-activedescendant", `hit${cursor}`);
  rows[cursor].scrollIntoView({ block: "nearest" });
}

function moveTo(i) {
  current = rows[i].dataset.key;
  mark();
}

function search() {
  expanded = new Set();
  current = null;
  render();
  if (rows.length) moveTo(0);
}

const clear = () => {
  box.value = "";
  current = null;
  scope = "all";
  render();
  box.blur();
};

box.addEventListener("input", search);
box.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    clear();
    return;
  }
  if (!rows.length) return;
  if (e.key === "ArrowDown") {
    moveTo((cursor + 1) % rows.length);
    e.preventDefault();
  }
  if (e.key === "ArrowUp") {
    moveTo((cursor - 1 + rows.length) % rows.length);
    e.preventDefault();
  }
  if (e.key === "Enter") {
    (rows[cursor] || rows[0]).click();
    e.preventDefault();
  }
});

// The groups are drawn round the level in hand, so a change of level lays
// the same list out again.
on("level-changed", () => {
  if (box.value.trim()) render();
});
