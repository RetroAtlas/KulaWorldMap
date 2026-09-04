import { $ } from "./dom.js";
import { state, cellKey } from "./state.js";
import { kindName, kindNote, kindColour, kindStats } from "./data.js";

let stats = null;

const row = (k, v) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`;

export function showCell(c) {
  const l = state.lvl;
  const objs = state.idx.objects.get(cellKey(c.x, c.y, c.z)) || [];
  if (!stats) stats = kindStats(state.data);
  const box = $("detail");
  const plain = c.v === state.data.plain;
  let html = `<button class="x" title="Close (Esc)">×</button>`;
  html += `<h3>${plain ? "Plain block" : `Block with record ${c.v - state.data.firstRecord}`}</h3>`;
  html += `<p class="sub">${l.name} · cell ${c.x},${c.y},${c.z}</p>`;
  html += `<table>${row("lattice value", c.v)}${row("cell", `${c.x}, ${c.y}, ${c.z}`)}</table>`;

  for (const o of objs) {
    const key = `${o.kind}/${o.type}`;
    const name = kindName(o.kind, o.type);
    const s = stats.get(key);
    html += `<h3 style="margin-top:12px">
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${kindColour(o.kind)}"></span>
      ${name ? name : `<span class="unnamed">kind ${o.kind} / type ${o.type}</span>`}</h3>`;
    if (name) html += `<p class="sub">kind ${o.kind} · type ${o.type}</p>`;
    const note = kindNote(o.kind, o.type);
    if (note) html += `<p class="sub">${note}</p>`;
    html += "<table>";
    if (o.slot) html += row("entity slot", o.slot);
    if (o.kind === state.data.startKind) {
      const st = l.start;
      html += row("looks at", st.look.join(", "));
      html += row("angles", st.angle.join(", "));
      html += row("time", st.time);
    } else {
      o.f.forEach((v, i) => {
        if (v !== -1) html += row(`f${i + 5}`, v);
      });
      const dead = o.f.filter((v) => v === -1).length;
      if (dead) html += row("unset", `${dead} of ${o.f.length} fields`);
    }
    html += "</table>";
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
