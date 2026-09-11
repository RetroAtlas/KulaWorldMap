import { $ } from "./dom.js";
import { state, cellKey } from "./state.js";
import { OFF_LATTICE, kindName, kindNote, kindColour, kindStats } from "./data.js";

let stats = null;

const row = (k, v) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`;

const dot = (colour) =>
  `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colour}"></span>`;

export function showCell(c) {
  const l = state.lvl;
  const objs = state.idx.objects.get(cellKey(c.x, c.y, c.z)) || [];
  if (!stats) stats = kindStats(state.data);
  const box = $("detail");
  const off = c.v === OFF_LATTICE;
  const plain = c.v < state.data.firstRecord;
  let html = `<button class="x" title="Close (Esc)">×</button>`;
  html += `<h3>${off ? "Block at a beam's end" : plain ? `Block, style ${c.v}` : `Block with record ${c.v - state.data.firstRecord}`}</h3>`;
  html += `<p class="sub">${l.name} · cell ${c.x},${c.y},${c.z}</p>`;
  if (off)
    html += `<p class="sub">The lattice holds nothing here. A beam record names this cell as one
      of its two ends, and the game stands a block on it.</p>`;
  html += `<table>${row("lattice value", off ? "empty" : c.v)}${row("cell", `${c.x}, ${c.y}, ${c.z}`)}</table>`;

  for (const o of objs) {
    const name = kindName(o.kind, o.type);
    html += `<h3 style="margin-top:12px">${dot(kindColour(o.kind))}
      ${name ? name : `<span class="unnamed">kind ${o.kind} / type ${o.type}</span>`}</h3>`;
    if (name) html += `<p class="sub">kind ${o.kind} · type ${o.type}</p>`;
    const note = kindNote(o.kind, o.type);
    if (note) html += `<p class="sub">${note}</p>`;
    html += "<table>";
    o.f.forEach((v, i) => {
      if (v !== -1) html += row(`f${i + 5}`, v);
    });
    const dead = o.f.filter((v) => v === -1).length;
    if (dead) html += row("unset", `${dead} of ${o.f.length} fields`);
    html += "</table>";
    const s = stats.get(`${o.kind}/${o.type}`);
    if (s) {
      html += `<p class="sub" style="margin-top:6px">Placed ${s.total} times in ${s.levels} level${s.levels === 1 ? "" : "s"}`;
      if (s.only === s.levels) html += `, never more than once`;
      html += `.</p>`;
    }
  }
  box.innerHTML = html;
  box.hidden = false;
  box.querySelector(".x").onclick = clearDetail;
}

export function clearDetail() {
  $("detail").hidden = true;
  state.selected = null;
}
