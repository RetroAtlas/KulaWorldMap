import { $, el, on } from "./dom.js";
import { state, SIDE, cellKey } from "./state.js";
import { draw } from "./render.js";

// What a player saw, written down against the lattice and nothing else. It is
// never derived from the records, so a decode can be scored against it: a mark
// on a cell the file says carries nothing is exactly the finding worth keeping.
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
// The game's vocabulary as a player meets it, grouped, so a mark can say what
// was seen without first knowing what the disc calls it.
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

/** The stored form is a plain list so the export is the file, not a rendering of it. */
export function loadLevel() {
  state.survey.marks = new Map();
  const l = state.lvl;
  if (!l) return;
  for (const m of all[levelKey(l)] || []) {
    state.survey.marks.set(cellKey(...m.cell), { name: m.name, face: m.face || "" });
  }
  panel();
}

function store() {
  const out = [];
  for (const k of [...state.survey.marks.keys()].sort((a, b) => a - b)) {
    const m = state.survey.marks.get(k);
    const cell = [Math.floor(k / (SIDE * SIDE)), Math.floor(k / SIDE) % SIDE, k % SIDE];
    out.push(m.face ? { cell, name: m.name, face: m.face } : { cell, name: m.name });
  }
  const key = levelKey(state.lvl);
  if (out.length) all[key] = out;
  else delete all[key];
  save();
}

/** Alt-click clears a cell; a plain click writes the brush over whatever is there. */
export function place(c, clear) {
  const k = cellKey(c.x, c.y, c.z);
  if (clear) state.survey.marks.delete(k);
  else state.survey.marks.set(k, { name: brush, face });
  store();
  panel();
  draw();
}

function exportText() {
  const levels = {};
  for (const [k, v] of Object.entries(all)) if (v.length) levels[k] = v;
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
  let off = 0;
  for (const k of marks.keys()) if (!recorded.has(k)) off++;
  const missing = [...recorded].filter((k) => !marks.has(k)).length;
  $("surveyCount").innerHTML =
    `<b>${marks.size}</b> marked · <b>${missing}</b> record cells still bare` +
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
    el("p", { className: "sub" }, "Click a block to say what stands on it. Alt-click clears one."),
    el("div", { className: "row" }, pick, faces),
    el("p", { className: "sub", id: "surveyCount" }),
    el("div", { className: "row" }, copy, down, wipe),
    el("p", { className: "sub", id: "surveyNote" }),
  );
  box.hidden = false;
}

// Kept off the deployed page unless it is asked for, so a reader meets the map
// and not the notebook behind it.
if (new URLSearchParams(location.search).has("survey")) {
  state.survey.on = true;
  load();
  build();
  on("level-changed", loadLevel);
}
