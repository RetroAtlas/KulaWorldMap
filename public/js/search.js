import { $, el, on } from "./dom.js";
import { state, SIDE, cellKey, sliceZ } from "./state.js";
import {
  worldName,
  levelTitle,
  inLattice,
  blockCount,
  counted,
  markerGroup,
  kindName,
} from "./data.js";
import { selectLevel, centreOn, writeHash } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";
import { showCell } from "./detail.js";
import { say } from "./a11y.js";
import { parseQuery, queryTerms } from "./searchquery.js";
import { spans } from "./searchtext.js";
import { matchPlaces } from "./placesearch.js";
import { matchObjects, rowOf } from "./objectsearch.js";
import { setSidebar, sidebarOverlays } from "./sidebar.js";
import { setSlice } from "./interaction.js";

const box = $("search");
const bar = $("scope");
const found = $("found");
const out = $("results");

const GROUP_MAX = 8;

// all | world | level, relative to the level in hand
let scope = "all";
let cursor = -1;
// The row the cursor is on, by what it names rather than by its place in
// the list, so it is found again when the list grows under it.
let current = null;

const options = () => [...out.querySelectorAll("[role=option]")];

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

function marked(text, terms) {
  const nodes = [];
  let pos = 0;
  for (const [s, e] of spans(text, terms)) {
    if (s > pos) nodes.push(text.slice(pos, s));
    nodes.push(el("mark", { textContent: text.slice(s, e) }));
    pos = e;
  }
  if (pos < text.length) nodes.push(text.slice(pos));
  return nodes;
}

const CELL = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/;

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
  writeHash(true);
}

function jump(h) {
  if (h.li !== state.li) selectLevel(h.li);
  goTo(h.record.x, h.record.y, h.record.z);
  say([h.name, h.face, h.cell, levelTitle(h.level)].filter(Boolean).join(", "));
}

// A row is an option the cursor can name. Choosing one leaves the list as it
// was laid out, so the next row down is the next find wherever the view has
// gone, and gives the keys back to the map.
function option(key, go, ...kids) {
  const b = el("button", { type: "button" }, ...kids);
  b.setAttribute("role", "option");
  b.dataset.key = key;
  b.onclick = () => {
    current = key;
    go();
    mark();
    box.blur();
    if (sidebarOverlays()) setSidebar(false);
  };
  return b;
}

const hint = (text) => [" ", el("span", { className: "hint", textContent: text })];

function objectRow(h, terms) {
  const ex = rowOf(h, terms).join(" · ");
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

// A group's heading is for the eye, and its label for a screen reader. The
// rows past the first few wait behind a row of their own, which the cursor
// reaches like any other and which leaves the cursor on the first it shows.
function group(label, items, make) {
  const head = el("div", { className: "group" }, el("span", {}, label));
  head.append(el("span", {}, String(items.length)));
  head.setAttribute("aria-hidden", "true");
  const g = el("div", {}, head);
  g.setAttribute("role", "group");
  g.setAttribute("aria-label", label);
  const shown = items.slice(0, GROUP_MAX);
  for (const item of shown) g.append(make(item));
  if (shown.length < items.length) {
    const more = el("button", {
      className: "showmore",
      type: "button",
      textContent: `show ${items.length - shown.length} more`,
    });
    more.setAttribute("role", "option");
    more.dataset.key = `more:${label}`;
    more.onclick = () => {
      const rest = items.slice(shown.length).map(make);
      more.replaceWith(...rest);
      current = rest[0].dataset.key;
      mark();
    };
    g.append(more);
  }
  out.append(g);
}

function render() {
  out.textContent = "";
  found.textContent = "";
  const q = box.value.trim();
  if (!q || !state.lvl) {
    show(false);
    return;
  }
  // A cell is answered by itself alone: read as a query, its commas would
  // ask for anything numbered like any of its three.
  const cell = CELL.exec(q)?.slice(1).map(Number);
  if (cell) {
    if (cell.every(inLattice))
      group("Cell", [cell], ([x, y, z]) =>
        option(
          `c:${x},${y},${z}`,
          () => goTo(x, y, z),
          `${x}, ${y}, ${z}`,
          hint("centre the view here"),
        ),
      );
    else found.append("Nothing matches that.");
    show(true);
    mark();
    return;
  }
  const groups = parseQuery(q);
  const terms = queryTerms(groups);

  const places = matchPlaces(state.data, groups, terms, state.li);
  const worlds = places.filter((c) => c.world && scope !== "level" && inScope(-1, c.world.id));
  const levels = places.filter((c) => c.level && inScope(c.li, c.level.theme));
  if (worlds.length)
    group("Worlds", worlds, (c) =>
      option(
        `w:${c.world.id}`,
        () => selectLevel(c.world.levels[0]),
        ...marked(c.name, terms),
        hint(`${c.world.levels.length} levels`),
      ),
    );
  if (levels.length)
    group("Levels", levels, (c) =>
      option(
        `l:${c.li}`,
        () => selectLevel(c.li),
        ...marked(c.name, terms),
        hint(`${worldName(c.level.theme)} · ${counted(blockCount(c.level), "block")}`),
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
    group(g.label, g.hits, (h) => objectRow(h, terms));
  }

  const where = scope === "all" ? "" : ` in ${scopeLabel()}`;
  found.append(
    hits.length
      ? `${tally(hits)}${where}`
      : worlds.length || levels.length
        ? `no objects, blocks or settings${where}`
        : `Nothing matches that${where}.`,
    ...widen(),
  );
  show(true);
  mark();
}

function tally(hits) {
  let objects = 0,
    settings = 0;
  const blocks = new Map();
  for (const h of hits) {
    const group = markerGroup(h.marker);
    if (group === "object") objects++;
    else if (group === "settings") settings++;
    else blocks.set(h.marker.kind, (blocks.get(h.marker.kind) || 0) + 1);
  }
  const parts = objects ? [counted(objects, "object")] : [];
  for (const [kind, n] of [...blocks].sort((a, b) => b[1] - a[1])) {
    const name = kindName(kind);
    parts.push(
      name
        ? counted(n, name[0].toLowerCase() + name.slice(1))
        : `${counted(n, "block")} of kind ${kind}`,
    );
  }
  if (settings)
    parts.push(settings === 1 ? "the level's settings" : `the settings of ${settings} levels`);
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
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
  const listed = shown && out.childElementCount > 0;
  bar.hidden = !shown;
  found.hidden = !shown || !found.textContent;
  out.hidden = !listed;
  if (shown) scopeBar();
  box.setAttribute("aria-expanded", String(listed));
}

function mark() {
  const list = options();
  cursor = list.findIndex((b) => b.dataset.key === current);
  list.forEach((b, i) => {
    b.id = `hit${i}`;
    b.setAttribute("aria-selected", String(i === cursor));
  });
  if (cursor < 0) {
    box.removeAttribute("aria-activedescendant");
    return;
  }
  box.setAttribute("aria-activedescendant", `hit${cursor}`);
  list[cursor].scrollIntoView({ block: "nearest" });
}

function moveTo(i) {
  current = options()[i].dataset.key;
  mark();
}

function search() {
  current = null;
  render();
  if (options().length) moveTo(0);
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
  const list = options();
  if (!list.length) return;
  if (e.key === "ArrowDown") {
    moveTo((cursor + 1) % list.length);
    e.preventDefault();
  }
  if (e.key === "ArrowUp") {
    moveTo((cursor - 1 + list.length) % list.length);
    e.preventDefault();
  }
  if (e.key === "Enter") {
    (list[cursor] || list[0]).click();
    e.preventDefault();
  }
});

// The scope bar names the world and the level in hand, and choosing one lays
// the list out again from there.
on("level-changed", () => {
  if (!bar.hidden) scopeBar();
});
