import { $ } from "./dom.js";
import { state, cellKey } from "./state.js";
import {
  OFF_LATTICE,
  FACE_NAME,
  DIRECTION_NAME,
  levelTitle,
  kindName,
  kindNote,
  markerName,
  markerNote,
  markerColour,
  markerPoints,
  markerFacing,
  markerState,
  markerNumber,
  markerModel,
  markerStats,
} from "./data.js";
import { iconFor } from "./icons.js";

let stats = null;

const row = (k, v) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`;

const dot = (colour) =>
  `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colour}"></span>`;

export function showCell(c) {
  const l = state.lvl;
  const key = cellKey(c.x, c.y, c.z);
  const records = state.idx.records.get(key) || [];
  const marks = state.idx.markers.get(key) || [];
  if (!stats) stats = markerStats(state.data);
  const box = $("detail");
  const off = c.v === OFF_LATTICE;
  const plain = c.v < state.data.firstRecord;
  const kind = off ? null : plain ? c.v : records[0]?.kind;
  const what = kind === null ? "Block at a beam's end" : kindName(kind) || `Block of kind ${kind}`;
  let html = `<button class="x" title="Close (Esc)">×</button>`;
  html += `<h3>${what}${plain || off ? "" : `, with record ${c.v - state.data.firstRecord}`}</h3>`;
  html += `<p class="sub">${levelTitle(l)} · cell ${c.x},${c.y},${c.z}</p>`;
  if (off)
    html += `<p class="sub">The lattice holds nothing here. A beam record names this cell as one
      of its two ends, and the game stands a block on it.</p>`;
  else if (kindNote(kind)) html += `<p class="sub">${kindNote(kind)}</p>`;
  html += `<table>${row("lattice value", off ? "empty" : c.v)}${row("cell", `${c.x}, ${c.y}, ${c.z}`)}`;
  if (kind !== null) html += row("block kind", kind);
  html += "</table>";

  const icons = [];
  for (const m of marks) {
    const name = markerName(m);
    const model = markerModel(m, l);
    const mark = model
      ? `<span class="icon-at" data-icon="${icons.push(model) - 1}"></span>`
      : dot(markerColour(m));
    html += `<h3 style="margin-top:12px">${mark}
      ${name ? name : `<span class="unnamed">${m.face === null ? `kind ${m.kind}` : `type ${m.type}`}</span>`}</h3>`;
    html += `<p class="sub">${m.face === null ? `kind ${m.kind} · type ${m.type}` : `type ${m.type} · on the ${FACE_NAME[m.face]}`}</p>`;
    const note = markerNote(m);
    if (note) html += `<p class="sub">${note}</p>`;
    html += "<table>";
    const points = markerPoints(m);
    if (points) html += row("points", points);
    const facing = markerFacing(m);
    if (facing !== null) html += row("facing", DIRECTION_NAME[facing]);
    const started = markerState(m);
    if (started !== null) html += row("starts", started);
    const number = markerNumber(m);
    if (number !== null) html += row("pickup number", number);
    m.f.forEach((v, i) => {
      if (v !== -1) html += row(`f${i + 5}`, v);
    });
    if (m.v !== undefined && m.v !== -1) html += row("v", m.v);
    const dead = m.f.filter((v) => v === -1).length;
    if (dead) html += row("unset", `${dead} of ${m.f.length} fields`);
    html += "</table>";
    const s = stats.get(m.id);
    if (s) {
      html += `<p class="sub" style="margin-top:6px">Placed ${s.total} times in ${s.levels} level${s.levels === 1 ? "" : "s"}`;
      if (s.only === s.levels) html += `, never more than once`;
      html += `.</p>`;
    }
  }
  box.innerHTML = html;
  for (const at of box.querySelectorAll(".icon-at"))
    at.replaceWith(iconFor(icons[at.dataset.icon], 26));
  box.hidden = false;
  box.querySelector(".x").onclick = clearDetail;
}

export function clearDetail() {
  $("detail").hidden = true;
  state.selected = null;
}
