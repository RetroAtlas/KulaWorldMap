import { $, el } from "./dom.js";
import { state } from "./state.js";
import { worldName, kindName, kindColour, inLattice } from "./data.js";
import { selectLevel, centreOn, writeHash } from "./navigate.js";
import { draw, invalidatePick } from "./render.js";

const box = $("search");
const out = $("results");
let hits = [];
let cursor = -1;

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

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
    if (terms.every((t) => hay.includes(t))) {
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
    if (terms.every((t) => hay.includes(t))) {
      res.push({
        group: "Levels",
        label: l.name,
        hint: `${worldName(l.theme)} · ${l.placed} blocks`,
        rank: i === state.li ? -1 : 0,
        go: () => selectLevel(i),
      });
    }
  });

  const kinds = new Map();
  for (const l of state.data.levels) {
    for (const o of l.objects) {
      const k = `${o.kind}/${o.type}`;
      if (!kinds.has(k)) kinds.set(k, { kind: o.kind, type: o.type, n: 0, levels: new Set() });
      const s = kinds.get(k);
      s.n++;
      s.levels.add(l.name);
    }
  }
  for (const [k, s] of kinds) {
    const name = kindName(s.kind, s.type);
    const hay = norm(`${name || ""} kind ${s.kind} type ${s.type} ${k}`);
    if (terms.every((t) => hay.includes(t))) {
      res.push({
        group: "Object kinds",
        colour: kindColour(s.kind),
        label: name || `kind ${s.kind} / type ${s.type}`,
        hint: `${s.n} placed in ${s.levels.size} levels`,
        go: () => jumpToKind(s.kind, s.type),
      });
    }
  }

  res.sort((a, b) => (a.rank || 0) - (b.rank || 0));
  return res.slice(0, 60);
}

function jumpToKind(kind, type) {
  const here = state.lvl?.objects.find((o) => o.kind === kind && o.type === type);
  if (here) {
    centreOn(here.x, here.y, here.z);
    invalidatePick();
    draw();
    writeHash();
    return;
  }
  const i = state.data.levels.findIndex((l) =>
    l.objects.some((o) => o.kind === kind && o.type === type),
  );
  if (i >= 0) {
    selectLevel(i);
    const o = state.data.levels[i].objects.find((x) => x.kind === kind && x.type === type);
    centreOn(o.x, o.y, o.z);
    invalidatePick();
    draw();
    writeHash();
  }
}

function render() {
  out.textContent = "";
  if (!hits.length) {
    out.hidden = true;
    return;
  }
  let group = null;
  hits.forEach((h, i) => {
    if (h.group !== group) {
      group = h.group;
      out.append(el("div", { className: "group", textContent: group }));
    }
    const b = el("button", { type: "button" });
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
    out.append(b);
  });
  out.hidden = false;
}

const close = () => {
  out.hidden = true;
  cursor = -1;
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
  if (!out.hidden && !out.contains(e.target) && e.target !== box) out.hidden = true;
});
