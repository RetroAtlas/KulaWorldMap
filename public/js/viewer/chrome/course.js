// The route planner: stops clicked on the faces, joined by the shortest walk, a jump or a leap.
import { $, dialogOpen, emit, on, typing } from "../ui/dom.js";
import { state, effectsOn } from "../state.js";
import { FACE_NAME, cellKey } from "../../format/lattice.js";
import { counted, markerGroup, markerHeading, startsOf } from "../data.js";
import { slotOf } from "../permalink.js";
import { current as release, differs } from "../release.js";
import {
  CAP,
  JUMP,
  LETTER,
  decode,
  encode,
  headingAfter,
  headingOn,
  jumpAt,
  lifted,
  pieces,
  probeOf,
  sameStation,
  shortestWalk,
  step,
  validate,
} from "../walk.js";
import { drawSoon, overlayWith } from "../draw/render.js";
import { facePoints, outlineStroke } from "../draw/blocks.js";
import { drawJumps, drawLeaps, drawPieces, drawRings } from "../draw/ribbon.js";
import { toast } from "../ui/toast.js";
import { holding, hoverBy, onCellClick, tipWith } from "./interaction.js";
import { settle, tailWith, writeHash } from "./navigate.js";
import { sidebarOverlays } from "./sidebar.js";
import { say } from "./a11y.js";

const KEY = "kula.course";
const VERSION = 1;
const MOST = 64;
const SETTLE = 300;
const CONFIRM_MS = 4000;
const GAP = 6;
const WASH = "rgba(255 244 220 / 0.35)";
const RIM = "#f3b640";
const RIM_FROM = 1.5;
const LOOKS_INTO = "That face looks into another block.";
const PLATFORM = "A stop cannot stand on a moving platform.";
const LEAPT = "No roll reaches that face from the last stop, so a leap joins them.";
const LEAPT_SHORT = "No roll reaches that face; a leap joins them.";
const NO_JUMP = "No jump from the last stop comes down on that face.";
const EDITING = "Leave editing to plan a route.";
const FULL = "The route is as long as a link can carry.";
const UNCOPIED = "The link could not be copied; copy it from the address bar.";
const HINT = "Click a face to add a stop, Shift-click to add a jump.";
const HINT_TAP = "Tap a face to add a stop; the shortest roll joins it to the last.";
const hint = () => (matchMedia("(pointer: coarse)").matches ? HINT_TAP : HINT);
const leapNote = () => (sidebarOverlays() ? LEAPT_SHORT : LEAPT);
const DROPPED = "taking the last stop back";
const CLEARED = "clearing the route";
const KEPT = "keeping the route";
const LINKED = "taking the route from the link";

let course = null;
let heading = null;
// the route before each change made on the level shown, and the changes taken back
let past = [];
let future = [];
// the route last handed over, forgotten as any other path changes the route
let handed = null;
let laid = null;
let note = null;
let probe = null;
let probed = null;
let waiting = null;
let timer = 0;
// the key the route on screen is kept under
let under = null;
let disarmClear = () => {};

export const current = () => course;

/** Take `c` as the route where none stands or the last one taken here stands; false otherwise. */
export function adoptCourse(c) {
  if (!c?.stations?.length || (course && course !== handed)) return false;
  if (!course) record(KEPT);
  course = {
    stations: c.stations.slice(0, CAP),
    steps: c.steps.slice(0, CAP - 1),
    marks: new Set([...c.marks].filter((i) => i < CAP)),
  };
  course.marks.add(0).add(course.stations.length - 1);
  handed = course;
  heading = headingAt(course);
  note = null;
  changed();
  return true;
}

const editing = () => document.body.classList.contains("editing");
const active = () => state.show.course && !editing();
const stationOf = (c) => ({ cell: [c.x, c.y, c.z], face: c.face });

function probeNow() {
  if (probed !== state.idx) {
    probed = state.idx;
    probe = probeOf(state.idx);
  }
  return probe;
}

/** The start the game takes, as a station with its heading, where the ball can stand on it. */
function startOf() {
  const s = state.lvl && startsOf(state.lvl).at(-1);
  if (!s) return null;
  const station = { cell: [s.x, s.y, s.z], face: s.face };
  if (!probeNow().standable(station.cell, station.face)) return null;
  return { station, heading: headingOn(s.face, markerHeading(s)) };
}

/** The heading at a course's end: the last step's heading, the start's heading on a course of the start alone, else any. */
function headingAt(c) {
  if (!c.steps.length) {
    const start = startOf();
    return start && sameStation(start.station, c.stations[0]) ? start.heading : null;
  }
  const last = c.steps.at(-1);
  return last ? headingAfter(c.stations.at(-2).face, last.k, last.o) : null;
}

const stands = ({ cell, face }) =>
  (state.idx.markers.get(cellKey(...cell)) ?? []).some(
    (m) => m.face === face && markerGroup(m) !== "face",
  );

/** The course laid out for the frame, a hollow station as a ring and a broken step as a leap. */
function layOut() {
  if (!course) {
    laid = null;
    return;
  }
  const { hollow, broken } = validate(probeNow(), course);
  const { byKey, leaps, jumps } = pieces(course);
  for (const [key, list] of byKey) {
    const kept = list.filter((p) => (p.stop ? !hollow.has(p.i) : !broken.has(p.i)));
    if (kept.length) byKey.set(key, kept);
    else byKey.delete(key);
  }
  for (const i of broken)
    leaps.push({ from: lifted(course.stations[i]), to: lifted(course.stations[i + 1]), i });
  const whole = jumps.filter((j) => !broken.has(j.i));
  // a leap's or a jump's ends keep clear of whatever stands at a stop
  for (const arc of [...leaps, ...whole]) {
    arc.near = stands(course.stations[arc.i]);
    arc.far = stands(course.stations[arc.i + 1]);
  }
  laid = { byKey, leaps, jumps: whole, rings: [...hollow].map((i) => course.stations[i]) };
}

function adopt(next) {
  course = next;
  heading = next ? headingAt(next) : null;
  if (next !== handed) handed = null;
  layOut();
  sync();
  emit("course-changed", course);
}

function changed() {
  adopt(course);
  remember();
  writeHash();
  drawSoon();
}

function refuse(text) {
  toast(text);
  note = text;
  sync();
  return true;
}

/** Keep the route as it stands for Undo before the change `label` names, which leaves Redo nothing. */
function record(label) {
  past.push({ route: course, label });
  future = [];
}

function undo() {
  if (!past.length) return;
  const { route, label } = past.pop();
  future.push({ route: course, label });
  course = route;
  note = null;
  changed();
  say(`Undid ${label}.`);
}

function redo() {
  if (!future.length) return;
  const { route, label } = future.pop();
  past.push({ route: course, label });
  course = route;
  note = null;
  changed();
  say(`Redid ${label}.`);
}

/** The course a first click begins: from the level's start where it has one and the click is elsewhere. */
function opening(station) {
  const start = startOf();
  const first = start && !sameStation(start.station, station) ? start.station : station;
  return {
    course: { stations: [first], steps: [], marks: new Set([0]) },
    heading: start && sameStation(start.station, first) ? start.heading : null,
  };
}

/** The shortest walk from `a` to `b`, setting off along `k`, or a leap where no roll reaches it. */
function walkTo(a, b, k) {
  const walk = shortestWalk(probeNow(), a, b, k === null ? undefined : [k]);
  if (walk)
    return { stations: walk.stations.slice(1), steps: walk.steps, heading: walk.heading, how: "" };
  return {
    stations: [b],
    steps: [null],
    heading: null,
    how: ", joined by a leap",
    note: leapNote(),
  };
}

/** The jump from `a` that comes down on `b`, or null where none does. */
function flightTo(a, b) {
  for (let k = 0; k < 4; k++) {
    const d = jumpAt(probeNow(), a, k);
    if (d !== null && sameStation(step(a, k, JUMP, d), b))
      return { stations: [b], steps: [{ k, o: JUMP, d }], heading: k, how: ", by a jump" };
  }
  return null;
}

/** Add a stop on `station`, joined to the last by the shortest roll, or by a jump where `jumping`. */
function add(station, jumping = false) {
  const from = course ? { course, heading } : opening(station);
  const c = {
    stations: [...from.course.stations],
    steps: [...from.course.steps],
    marks: new Set(from.course.marks),
  };
  const last = c.stations.at(-1);
  let way = null;
  if (!sameStation(last, station)) {
    way = jumping ? flightTo(last, station) : walkTo(last, station, from.heading);
    if (!way) return refuse(NO_JUMP);
    if (c.stations.length + way.steps.length > CAP) return refuse(FULL);
    c.stations.push(...way.stations);
    c.steps.push(...way.steps);
    c.marks.add(c.stations.length - 1);
  }
  const where = `the ${FACE_NAME[station.face]} of ${station.cell.join(",")}`;
  record(`adding stop ${c.marks.size} on ${where}`);
  course = c;
  heading = way ? way.heading : from.heading;
  note = way?.note ?? null;
  changed();
  say(`Stop ${c.marks.size} added on ${where}${way?.how ?? ""}.`);
  return true;
}

/** Take the last stop back, with the walk that joined it. */
function dropLast() {
  if (!course) return;
  const last = course.stations.length - 1;
  const prev = Math.max(-1, ...[...course.marks].filter((i) => i < last));
  record(DROPPED);
  course =
    prev < 0
      ? null
      : {
          stations: course.stations.slice(0, prev + 1),
          steps: course.steps.slice(0, prev),
          marks: new Set([...course.marks].filter((i) => i <= prev)),
        };
  note = null;
  changed();
  say("Last stop removed.");
}

function clear() {
  record(CLEARED);
  course = null;
  note = null;
  changed();
  say("Route cleared.");
}

// --- the store -----------------------------------------------------------------------------

/** The store as it stands, less any entry another version or tab left malformed. */
function readStore() {
  const by = {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v?.version === VERSION && v.by && typeof v.by === "object")
      for (const [key, e] of Object.entries(v.by))
        if (typeof e?.c === "string" && Number.isFinite(e.at)) by[key] = e;
  } catch {
    /* ignore */
  }
  return { version: VERSION, by };
}

/** Change the store as another tab may have left it, keeping the newest routes. */
function writeStore(change) {
  try {
    const store = readStore();
    change(store.by);
    const keys = Object.keys(store.by).sort((a, b) => store.by[b].at - store.by[a].at);
    for (const key of keys.slice(MOST)) delete store.by[key];
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** The key a route on `l` is kept under: its slot, and the disc shown as well where the slot
    differs between the discs. */
const keyOf = (l) => {
  const slot = slotOf(l);
  return differs(`${l.pack}#${l.index}`).length ? `${slot}@${release()}` : slot;
};

function remember() {
  if (!state.lvl) return;
  waiting = { key: keyOf(state.lvl), text: course ? encode(course) : null };
  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE);
}

function flush() {
  clearTimeout(timer);
  timer = 0;
  if (!waiting) return;
  const { key, text } = waiting;
  waiting = null;
  writeStore((by) => {
    if (text) by[key] = { at: Date.now(), c: text };
    else delete by[key];
  });
}

const stored = (key) => {
  const entry = readStore().by[key];
  return entry ? decode(entry.c) : null;
};

/** Take up the route kept for the level shown, a change still waiting written first. */
function recall() {
  flush();
  under = keyOf(state.lvl);
  probed = null;
  note = null;
  past = [];
  future = [];
  disarmClear();
  adopt(stored(under));
}

// --- the strip -----------------------------------------------------------------------------

function sync() {
  const on = state.show.course;
  const idle = editing();
  $("course").hidden = !on && (!course || idle);
  const stops = course ? course.marks.size : 0;
  const jumps = course ? course.steps.filter((s) => s?.o === JUMP).length : 0;
  const leaps = course ? course.steps.filter((s) => !s).length : 0;
  let line = `Route planner · ${counted(stops, "stop")}`;
  if (jumps) line += ` · ${counted(jumps, "jump")}`;
  if (leaps) line += ` · ${counted(leaps, "leap")}`;
  $("courseLine").textContent = line;
  $("courseUndo").disabled = !past.length;
  $("courseRedo").disabled = !future.length;
  for (const id of ["courseClear", "courseCopy"]) $(id).disabled = !course;
  const hinting = on && !idle && !note && !course;
  $("courseStatus").textContent = !on ? "" : idle ? EDITING : hinting ? hint() : (note ?? "");
  $("courseStatus").classList.toggle("hint", hinting);
  if (!course) disarmClear();
}

/** Make `button` ask to be pressed again within a moment before it does `act`; returns what disarms it. */
function twice(button, label, title, act) {
  let armed = 0;
  const disarm = () => {
    clearTimeout(armed);
    armed = 0;
    button.textContent = label;
    button.title = title;
    button.classList.remove("warn");
  };
  button.onclick = () => {
    if (!armed) {
      button.textContent = `${label}?`;
      button.title = `Press again to ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
      button.classList.add("warn");
      armed = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    act();
  };
  return disarm;
}

async function copyLink() {
  settle();
  try {
    await navigator.clipboard.writeText(location.href);
  } catch {
    toast(UNCOPIED);
    return;
  }
  toast("Link copied.");
  say("Link copied.");
}

const forget = () => {
  note = null;
  sync();
};

/** Keep `variable` on the map at `strip`'s height plus the gap between the strips, for
    whatever stands above it: measured now and on every resize, and the measure is returned. */
export function measureStrip(strip, variable) {
  const map = strip.parentElement;
  const set = () =>
    map.style.setProperty(variable, strip.offsetHeight ? `${strip.offsetHeight + GAP}px` : "0px");
  new ResizeObserver(set).observe(strip);
  set();
  return set;
}

function measure(strip) {
  measureStrip($("tools"), "--under-h");
  measureStrip(strip, "--course-h");
}

// --- what the planner draws ----------------------------------------------------------------

function drawRibbon(ctx, c, home, key, ghost, scene) {
  if (!laid || ghost || c.k !== undefined) return;
  const list = laid.byKey.get(key);
  if (list) drawPieces(ctx, list, { slide: effectsOn() ? scene.frame : null });
}

function drawWash(ctx, c, home, key, ghost) {
  if (ghost || c.k !== undefined) return;
  const h = state.hover;
  if (!h || h.key !== key || h.face == null || holding() || !active()) return;
  ctx.save();
  ctx.beginPath();
  facePoints(c, h.face).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = WASH;
  ctx.fill();
  outlineStroke(ctx, RIM);
  if (state.cam.zoom >= RIM_FROM) ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawOver(ctx) {
  if (!laid) return false;
  drawLeaps(ctx, laid.leaps);
  drawJumps(ctx, laid.jumps);
  drawRings(ctx, laid.rings);
  return effectsOn();
}

export function wireCourse() {
  const strip = $("course");
  $("courseUndo").onclick = undo;
  $("courseRedo").onclick = redo;
  disarmClear = twice($("courseClear"), "Clear", "Clear the route", clear);
  $("courseCopy").onclick = copyLink;
  $("showCourse").addEventListener("change", forget);
  $("resetDisplay").addEventListener("click", forget);
  on("editing-changed", forget);
  measure(strip);

  onCellClick((c, e) => {
    if (!active() || c?.face == null) return false;
    if (c.k !== undefined) return refuse(PLATFORM);
    const station = stationOf(c);
    if (course && sameStation(station, course.stations.at(-1))) {
      dropLast();
      return true;
    }
    if (!probeNow().standable(station.cell, station.face)) return refuse(LOOKS_INTO);
    return add(station, e.shiftKey);
  });
  hoverBy((c) => (active() && !holding() ? c.face : null));
  tipWith((c) => {
    if (!active() || holding() || c?.face == null || c.k !== undefined) return [];
    if (course && sameStation(stationOf(c), course.stations.at(-1)))
      return ["Take the last stop back"];
    return [`Add a stop on the ${FACE_NAME[c.face]}`];
  });
  overlayWith({ block: drawRibbon, cell: drawWash, frame: drawOver });

  // Cmd-Y stays the browser's shortcut
  document.addEventListener(
    "keydown",
    (e) => {
      if (!active() || e.altKey || typing(e) || dialogOpen()) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      let act = null;
      if (e.key === "Backspace" && !mod && course && !state.selected) act = dropLast;
      else if (key === "z" && mod) act = e.shiftKey ? redo : undo;
      else if (key === "y" && e.ctrlKey && !e.metaKey) act = redo;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();
      act();
    },
    { capture: true },
  );

  tailWith({
    letter: LETTER,
    write: () => (course ? encode(course) : null),
    read: (segment) => {
      const c = segment === null ? null : decode(segment);
      if (!c) return;
      if (!course || encode(course) !== encode(c)) record(LINKED);
      adopt(c);
      remember();
    },
  });

  on("level-changed", recall);
  on("level-updated", () => {
    if (keyOf(state.lvl) !== under) recall();
    else {
      probed = null;
      adopt(course);
    }
  });
  on("drafts-moved", (pairs) => {
    flush();
    writeStore((by) => {
      const moved = pairs.map(([from, to]) => [`DRAFT/${from}`, `DRAFT/${to}`]);
      const entries = moved.map(([from]) => by[from]);
      for (const [from] of moved) delete by[from];
      moved.forEach(([, to], i) => {
        if (entries[i]) by[to] = entries[i];
      });
    });
  });
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => document.hidden && flush());
  sync();
}
