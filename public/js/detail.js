import { $, emit } from "./dom.js";
import { state, cellKey } from "./state.js";
import {
  OFF_LATTICE,
  FACE_NAME,
  DIRECTION_NAME,
  levelTitle,
  kindName,
  kindNote,
  blockHazard,
  farEnd,
  ownMarker,
  markerName,
  markerNote,
  markerHazard,
  markerColour,
  markerPoints,
  markerFacing,
  markerState,
  markerNow,
  markerCircuit,
  isSwitch,
  flip,
  markerDestination,
  fieldName,
  fieldKey,
  VALUE_KEY,
  markerModel,
  markerStats,
} from "./data.js";
import { iconFor } from "./icons.js";
import { draw } from "./render.js";

let stats = null;

const row = (k, v) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`;
const STORED = `<tr><th colspan="2">on the disc</th></tr>`;
const HAZARD = `<span class="tag">Hazard</span>`;

const dot = (colour) =>
  `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colour}"></span>`;

const decoded = (m, c) => {
  let html = "";
  const points = markerPoints(m);
  if (points) html += row("points", points);
  const facing = markerFacing(m);
  if (facing !== null) html += row("facing", DIRECTION_NAME[facing]);
  const started = markerState(m);
  if (started !== null) html += row("starts", started);
  const to = markerDestination(m, state.lvl);
  if (to) html += row("leads to", destination(to, m, c));
  return html;
};

// Where a teleporter leads is a place on the map to go to, as a find is.
const destination = (to, m, c) => {
  if (to.x === c.x && to.y === c.y && to.z === c.z && to.face === m.face) return "itself";
  const where = `${to.x}, ${to.y}, ${to.z} · ${FACE_NAME[to.face]}`;
  const there = (state.idx.markers.get(cellKey(to.x, to.y, to.z)) || []).find(
    (n) => n.face === to.face,
  );
  const said = [markerName(there), FACE_NAME[to.face], `${to.x},${to.y},${to.z}`].join(", ");
  return `<button type="button" class="goto" data-to="${to.x},${to.y},${to.z}" data-said="${said}">${where}</button>`;
};

const label = (m, i) => {
  const name = fieldName(m, i);
  return `${fieldKey(i)}${name ? ` <span class="field-name">${name}</span>` : ""}`;
};

const fields = (m) => {
  let html = "";
  m.f.forEach((v, i) => {
    if (v !== -1) html += row(label(m, i), v);
  });
  if (m.v !== undefined && m.v !== -1) html += row(VALUE_KEY, m.v);
  const dead = m.f.filter((v) => v === -1).length;
  if (dead) html += row("unset", `${dead} of ${m.f.length} fields`);
  return html;
};

// A switch is pressed from its panel as in play, which turns its whole circuit
// over; the button says whether the circuit is on now.
const press = (m) => {
  const on = markerNow(m) === "on";
  return `<p class="press"><button type="button" data-circuit="${markerCircuit(m)}">
    <span class="lamp${on ? "" : " off"}" style="--lamp:${markerColour(m)}"></span>
    ${on ? "On" : "Off"} · press to turn ${on ? "off" : "on"}</button></p>`;
};

const placed = (m) => {
  const s = stats.get(m.id);
  if (!s) return "";
  let html = `<p class="sub" style="margin-top:6px">Placed ${s.total} times in ${s.levels} level${s.levels === 1 ? "" : "s"}`;
  if (s.only === s.levels) html += `, never more than once`;
  return `${html}.</p>`;
};

/** Select a cell, and say in the panel what the game stores on it. */
export function showCell(c) {
  const l = state.lvl;
  const key = cellKey(c.x, c.y, c.z);
  state.selected = { ...c, key };
  const records = state.idx.records.get(key) || [];
  const marks = state.idx.markers.get(key) || [];
  if (!stats) stats = markerStats(state.data);
  const box = $("detail");
  const off = c.v === OFF_LATTICE;
  const plain = c.v < state.data.firstRecord;
  const kind = off ? null : plain ? c.v : records[0]?.kind;
  const own = ownMarker(marks, kind);
  const what = kind === null ? "Laser end" : kindName(kind) || `Block, kind ${kind}`;
  let html = `<button class="x" title="Close (Esc)">×</button>`;
  const end = state.idx.beamEnds.has(key);
  html += `<h3>${what}${blockHazard(kind, end) ? HAZARD : ""}</h3>`;
  html += `<p class="sub">${levelTitle(l)} · cell ${c.x},${c.y},${c.z}</p>`;
  if (off)
    html += `<p class="sub">The level leaves this cell empty, and the game puts a block here as
      the level loads, as one end of a laser.</p>`;
  else if (kindNote(kind)) html += `<p class="sub">${kindNote(kind)}</p>`;
  if (farEnd(kind, end)) html += `<p class="sub">One end of a laser.</p>`;
  html += `<table>${own ? decoded(own, c) : ""}${STORED}`;
  html += `${row("cell", `${c.x}, ${c.y}, ${c.z}`)}${row("cell value", off ? "empty" : c.v)}`;
  if (!plain && !off) html += row("record", c.v - state.data.firstRecord);
  if (kind !== null) html += row("kind", kind);
  if (own) html += row("type", own.type) + fields(own);
  html += "</table>";
  if (own) html += placed(own);

  const icons = [];
  for (const m of marks) {
    if (m === own) continue;
    const name = markerName(m);
    const model = markerModel(m, l);
    const mark = model
      ? `<span class="icon-at" data-icon="${icons.push(model) - 1}"></span>`
      : dot(markerColour(m));
    html += `<h3 style="margin-top:12px">${mark}
      ${name ? name : `<span class="unnamed">${m.face === null ? `kind ${m.kind}` : `type ${m.type}`}</span>`}${markerHazard(m) ? HAZARD : ""}</h3>`;
    html += `<p class="sub">${m.face === null ? `kind ${m.kind} · type ${m.type}` : `type ${m.type} · on the ${FACE_NAME[m.face]}`}</p>`;
    const note = markerNote(m);
    if (note) html += `<p class="sub">${note}</p>`;
    if (isSwitch(m)) html += press(m);
    html += `<table>${decoded(m, c)}${STORED}${fields(m)}</table>${placed(m)}`;
  }
  box.innerHTML = html;
  for (const at of box.querySelectorAll(".icon-at"))
    at.replaceWith(iconFor(icons[at.dataset.icon], 26));
  box.hidden = false;
  for (const b of box.querySelectorAll(".press button")) {
    b.onclick = () => {
      flip(Number(b.dataset.circuit));
      showCell(state.selected);
      box.querySelector(`.press button[data-circuit="${b.dataset.circuit}"]`)?.focus();
      draw();
    };
  }
  for (const b of box.querySelectorAll(".goto")) {
    const [x, y, z] = b.dataset.to.split(",").map(Number);
    b.onclick = () => emit("go-to", { x, y, z, said: b.dataset.said });
  }
  box.querySelector(".x").onclick = () => {
    clearDetail();
    draw();
  };
  emit("selection-changed");
}

export function clearDetail() {
  $("detail").hidden = true;
  state.selected = null;
  emit("selection-changed");
}
