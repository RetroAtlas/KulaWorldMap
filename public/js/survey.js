import { $, el, on } from "./dom.js";
import { state, SIDE, cellKey } from "./state.js";
import { counted, inLattice } from "./data.js";
import { draw } from "./render.js";

// A mark is keyed to a lattice cell and a face, one a face, and never derived
// from the records, so a decode can be scored against it.
const KEY = "kula.survey";
const FACES = [
  ["", "face unset"],
  ["-z", "top"],
  ["+z", "underside"],
  ["+x", "+x side"],
  ["-x", "-x side"],
  ["+y", "+y side"],
  ["-y", "-y side"],
];
// Named as a player meets them, not as the disc files them.
const GROUPS = [
  [
    "Pickups",
    [
      "bronze coin",
      "blue coin",
      "gold coin",
      "blue gem",
      "green gem",
      "red gem",
      "key",
      "fruit",
      "hourglass",
      "sunglasses",
      "lethargy pill",
      "bouncy pill",
    ],
  ],
  [
    "Hazards",
    [
      "spikes",
      "moving spikes",
      "captivator, short spikes",
      "captivator, long spikes",
      "captivator, bouncing",
      "captivator, wandering",
      "rolling stone",
      "laser",
    ],
  ],
  [
    "Blocks",
    [
      "fire",
      "ice",
      "crumbling block",
      "invisible block",
      "vanishing block",
      "moving platform",
      "clock",
      "boost button",
      "arrow",
    ],
  ],
  [
    "Devices",
    [
      "start",
      "exit",
      "hidden exit",
      "yellow teleporter",
      "blue teleporter",
      "green teleporter",
      "red teleporter",
      "yellow switch",
      "blue switch",
      "green switch",
      "red switch",
    ],
  ],
];
const NAMES = GROUPS.flatMap(([, names]) => names);
const byFace = (a, b) =>
  FACES.findIndex(([v]) => v === a.face) - FACES.findIndex(([v]) => v === b.face);

let all = {};
let brush = NAMES[0];
let face = "";

export const surveying = () => state.survey.on;

const levelKey = (l) => `${l.pack}#${l.index}`;

function load() {
  try {
    all = JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    all = {};
  }
  if (!all || typeof all !== "object") all = {};
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    note("could not save to this browser");
  }
}

const isMark = (m) =>
  Array.isArray(m?.cell) &&
  m.cell.length === 3 &&
  m.cell.every(inLattice) &&
  typeof m.name === "string" &&
  (m.face === undefined || FACES.some(([v]) => v === m.face));

export function loadLevel() {
  state.survey.marks = new Map();
  const l = state.lvl;
  if (!l) return;
  const list = all[levelKey(l)];
  for (const m of Array.isArray(list) ? list.filter(isMark) : []) {
    const k = cellKey(...m.cell);
    const marks = state.survey.marks.get(k) || [];
    marks.push({ name: m.name, face: m.face || "" });
    state.survey.marks.set(k, marks.sort(byFace));
  }
  panel();
}

function store() {
  const out = [];
  for (const k of [...state.survey.marks.keys()].sort((a, b) => a - b)) {
    const cell = [Math.floor(k / (SIDE * SIDE)), Math.floor(k / SIDE) % SIDE, k % SIDE];
    for (const m of state.survey.marks.get(k))
      out.push(m.face ? { cell, name: m.name, face: m.face } : { cell, name: m.name });
  }
  const key = levelKey(state.lvl);
  if (out.length) all[key] = out;
  else delete all[key];
  save();
}

/** Mark the chosen face of a block with the brush, or clear that face's mark. */
export function place(c, clear) {
  const k = cellKey(c.x, c.y, c.z);
  const list = (state.survey.marks.get(k) || []).filter((m) => m.face !== face);
  if (!clear) list.push({ name: brush, face });
  if (list.length) state.survey.marks.set(k, list.sort(byFace));
  else state.survey.marks.delete(k);
  store();
  panel();
  draw();
}

function exportText() {
  const levels = {};
  for (const [k, v] of Object.entries(all)) {
    const marks = Array.isArray(v) ? v.filter(isMark) : [];
    if (marks.length) levels[k] = marks;
  }
  return JSON.stringify({ survey: 1, levels }, null, 2);
}

let noteAt = 0;
function note(text) {
  const n = $("surveyNote");
  n.textContent = text;
  const id = ++noteAt;
  setTimeout(() => id === noteAt && (n.textContent = ""), 2600);
}

function panel() {
  const l = state.lvl;
  if (!l || !state.survey.on) return;
  const marks = state.survey.marks;
  const recorded = new Set();
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z, v] = l.cells.slice(i, i + 4);
    if (v >= state.data.firstRecord) recorded.add(cellKey(x, y, z));
  }
  let n = 0,
    off = 0;
  for (const [k, list] of marks) {
    n += list.length;
    if (!recorded.has(k)) off++;
  }
  const missing = [...recorded].filter((k) => !marks.has(k)).length;
  $("surveyCount").innerHTML =
    `<b>${n}</b> marked` +
    (n === marks.size ? "" : ` on ${counted(marks.size, "block")}`) +
    ` · <b>${missing}</b> record cells still bare` +
    (off ? ` · <b class="warn">${off}</b> on cells the file says hold no record` : "");
}

function build() {
  const box = $("survey");
  const pick = el("select", { id: "surveyName" });
  for (const [group, names] of GROUPS) {
    const g = el("optgroup", { label: group });
    for (const n of names) g.append(el("option", { value: n, textContent: n }));
    pick.append(g);
  }
  pick.append(el("option", { value: "?", textContent: "something else…" }));
  pick.onchange = () => {
    if (pick.value !== "?") {
      brush = pick.value;
      return;
    }
    const own = prompt("What is it called?", brush);
    if (own) {
      brush = own.trim();
      if (!NAMES.includes(brush)) {
        NAMES.push(brush);
        pick.insertBefore(el("option", { value: brush, textContent: brush }), pick.lastChild);
      }
    }
    pick.value = NAMES.includes(brush) ? brush : NAMES[0];
  };

  const faces = el("select", { id: "surveyFace" });
  for (const [v, t] of FACES) faces.append(el("option", { value: v, textContent: t }));
  faces.onchange = () => (face = faces.value);

  const copy = el("button", { type: "button", className: "mini", textContent: "copy" });
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      note("copied");
    } catch {
      note("clipboard refused; use download");
    }
  };
  const down = el("button", { type: "button", className: "mini", textContent: "download" });
  down.onclick = () => {
    const a = el("a", {
      href: URL.createObjectURL(new Blob([exportText()], { type: "application/json" })),
      download: "survey.json",
    });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const wipe = el("button", { type: "button", className: "mini", textContent: "clear level" });
  wipe.onclick = () => {
    if (!state.survey.marks.size || !confirm("Forget this level's marks?")) return;
    state.survey.marks.clear();
    store();
    panel();
    draw();
  };

  box.append(
    el("h3", {}, "Survey"),
    el(
      "p",
      { className: "sub" },
      "Click a block to say what stands on the chosen face of it. Alt-click clears that face's mark.",
    ),
    el("div", { className: "row" }, pick, faces),
    el("p", { className: "sub", id: "surveyCount" }),
    el("div", { className: "row" }, copy, down, wipe),
    el("p", { className: "sub", id: "surveyNote" }),
  );
  box.hidden = false;
}

if (new URLSearchParams(location.search).has("survey")) {
  state.survey.on = true;
  load();
  build();
  on("level-changed", loadLevel);
}
