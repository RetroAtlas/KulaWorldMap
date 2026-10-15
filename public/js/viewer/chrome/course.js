// The route planner: stops clicked on the faces, joined by the shortest walk or a leap.
import { $, emit, on } from "../ui/dom.js";
import { state, effectsOn } from "../state.js";
import { FACE_NAME, cellKey } from "../../format/lattice.js";
import { counted, markerGroup, markerHeading, startsOf } from "../data.js";
import { slotOf } from "../permalink.js";
import {
  CAP,
  LETTER,
  decode,
  encode,
  headingAfter,
  headingOn,
  lifted,
  pieces,
  probeOf,
  shortestWalk,
  validate,
} from "../walk.js";
import { drawSoon, overlayWith } from "../draw/render.js";
import { facePoints, outlineStroke } from "../draw/blocks.js";
import { drawLeaps, drawPieces, drawRings } from "../draw/ribbon.js";
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
const EDITING = "Leave editing to plan a route.";
const FULL = "The route is as long as a link can carry.";
const UNCOPIED = "The link could not be copied; copy it from the address bar.";
const hint = () =>
  `${matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"} a face to add a stop; the shortest roll joins it to the last.`;
const leapNote = () => (sidebarOverlays() ? LEAPT_SHORT : LEAPT);

let course = null;
let heading = null;
let laid = null;
let note = null;
let probe = null;
let probed = null;
let waiting = null;
let timer = 0;
let disarmClear = () => {};

export const current = () => course;

/** Take `c` as the level's route where none stands; false where one does. */
export function adoptCourse(c) {
  if (course || !c?.stations?.length) return false;
  course = {
    stations: c.stations.slice(0, CAP),
    steps: c.steps.slice(0, CAP - 1),
    marks: new Set([...c.marks].filter((i) => i < CAP)),
  };
  course.marks.add(0).add(course.stations.length - 1);
  heading = headingAt(course);
  note = null;
  changed();
  return true;
}

const editing = () => document.body.classList.contains("editing");
const active = () => state.show.course && !editing();
const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";
const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
const stationOf = (c) => ({ cell: [c.x, c.y, c.z], face: c.face });
const sameStation = (a, b) => a.face === b.face && a.cell.every((v, i) => v === b.cell[i]);

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

/** The heading at a course's end: the last step's, the start's on a course of the start alone, else any. */
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
  const { byKey, leaps } = pieces(course);
  for (const [key, list] of byKey) {
    const kept = list.filter((p) => (p.stop ? !hollow.has(p.i) : !broken.has(p.i)));
    if (kept.length) byKey.set(key, kept);
    else byKey.delete(key);
  }
  for (const i of broken)
    leaps.push({ from: lifted(course.stations[i]), to: lifted(course.stations[i + 1]), i });
  // a leap's ends keep clear of whatever stands at a stop
  for (const leap of leaps) {
    leap.near = stands(course.stations[leap.i]);
    leap.far = stands(course.stations[leap.i + 1]);
  }
  laid = { byKey, leaps, rings: [...hollow].map((i) => course.stations[i]) };
}

function adopt(next) {
  course = next;
  heading = next ? headingAt(next) : null;
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

/** The course a first click begins: from the level's start where it has one and the click is elsewhere. */
function opening(station) {
  const start = startOf();
  const first = start && !sameStation(start.station, station) ? start.station : station;
  return {
    course: { stations: [first], steps: [], marks: new Set([0]) },
    heading: start && sameStation(start.station, first) ? start.heading : null,
  };
}

function add(station) {
  const from = course ? { course, heading } : opening(station);
  const c = {
    stations: [...from.course.stations],
    steps: [...from.course.steps],
    marks: new Set(from.course.marks),
  };
  const last = c.stations.at(-1);
  let next = from.heading;
  let leapt = false;
  if (!sameStation(last, station)) {
    const headings = from.heading === null ? undefined : [from.heading];
    const walk = shortestWalk(probeNow(), last, station, headings);
    if (c.stations.length + (walk ? walk.steps.length : 1) > CAP) return refuse(FULL);
    if (walk) {
      c.stations.push(...walk.stations.slice(1));
      c.steps.push(...walk.steps);
      next = walk.heading;
    } else {
      c.stations.push(station);
      c.steps.push(null);
      next = null;
      leapt = true;
    }
    c.marks.add(c.stations.length - 1);
  }
  course = c;
  heading = next;
  note = leapt ? leapNote() : null;
  changed();
  const where = `the ${FACE_NAME[station.face]} of ${station.cell.join(",")}`;
  say(`Stop ${c.marks.size} added on ${where}${leapt ? ", joined by a leap" : ""}.`);
  return true;
}

/** Take the last stop back, with the walk that joined it. */
function dropLast() {
  if (!course) return;
  const last = course.stations.length - 1;
  const prev = Math.max(-1, ...[...course.marks].filter((i) => i < last));
  if (prev < 0) {
    clear("Last stop removed.");
    return;
  }
  course = {
    stations: course.stations.slice(0, prev + 1),
    steps: course.steps.slice(0, prev),
    marks: new Set([...course.marks].filter((i) => i <= prev)),
  };
  note = null;
  changed();
  say("Last stop removed.");
}

function clear(said) {
  course = null;
  note = null;
  changed();
  say(said);
}

// --- the store -----------------------------------------------------------------------------

/** The store as it stands, less any entry another version or tab left malformed. */
function readStore() {
  const by = {};
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v?.version === VERSION && v.by && typeof v.by === "object")
      for (const [slot, e] of Object.entries(v.by))
        if (typeof e?.c === "string" && Number.isFinite(e.at)) by[slot] = e;
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
    const slots = Object.keys(store.by).sort((a, b) => store.by[b].at - store.by[a].at);
    for (const slot of slots.slice(MOST)) delete store.by[slot];
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function remember() {
  if (!state.lvl) return;
  waiting = { slot: slotOf(state.lvl), text: course ? encode(course) : null };
  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE);
}

function flush() {
  clearTimeout(timer);
  timer = 0;
  if (!waiting) return;
  const { slot, text } = waiting;
  waiting = null;
  writeStore((by) => {
    if (text) by[slot] = { at: Date.now(), c: text };
    else delete by[slot];
  });
}

const stored = (slot) => {
  const entry = readStore().by[slot];
  return entry ? decode(entry.c) : null;
};

// --- the strip -----------------------------------------------------------------------------

function sync() {
  const on = state.show.course;
  const idle = editing();
  $("course").hidden = !on && (!course || idle);
  const stops = course ? course.marks.size : 0;
  const leaps = course ? course.steps.filter((s) => !s).length : 0;
  const line = `Route planner · ${counted(stops, "stop")}`;
  $("courseLine").textContent = leaps ? `${line} · ${counted(leaps, "leap")}` : line;
  for (const id of ["courseUndo", "courseClear", "courseCopy"]) $(id).disabled = !course;
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
  drawRings(ctx, laid.rings);
  return effectsOn();
}

export function wireCourse() {
  const strip = $("course");
  $("courseUndo").onclick = dropLast;
  disarmClear = twice($("courseClear"), "Clear", "Clear the route", () => clear("Route cleared."));
  $("courseCopy").onclick = copyLink;
  $("showCourse").addEventListener("change", forget);
  $("resetDisplay").addEventListener("click", forget);
  on("editing-changed", forget);
  measure(strip);

  onCellClick((c) => {
    if (!active() || c?.face == null) return false;
    if (c.k !== undefined) return refuse(PLATFORM);
    const station = stationOf(c);
    if (course && sameStation(station, course.stations.at(-1))) {
      dropLast();
      return true;
    }
    if (!probeNow().standable(station.cell, station.face)) return refuse(LOOKS_INTO);
    return add(station);
  });
  hoverBy((c) => (active() && !holding() ? c.face : null));
  tipWith((c) => {
    if (!active() || holding() || c?.face == null || c.k !== undefined) return [];
    if (course && sameStation(stationOf(c), course.stations.at(-1)))
      return ["Take the last stop back"];
    return [`Add a stop on the ${FACE_NAME[c.face]}`];
  });
  overlayWith({ block: drawRibbon, cell: drawWash, frame: drawOver });

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Backspace" || !active() || !course || state.selected) return;
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e) || dialogOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      dropLast();
    },
    { capture: true },
  );

  tailWith({
    letter: LETTER,
    write: () => (course ? encode(course) : null),
    read: (segment) => {
      const c = segment === null ? null : decode(segment);
      if (!c) return;
      adopt(c);
      remember();
    },
  });

  on("level-changed", () => {
    flush();
    probed = null;
    note = null;
    disarmClear();
    adopt(stored(slotOf(state.lvl)));
  });
  on("level-updated", () => {
    probed = null;
    adopt(course);
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
