// A draft's overview for the level line's note: how it plays, its counts and the findings.
import { el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { cellKey, FACE_NAME } from "../format/lattice.js";
import { NAMES, index, motionTable, skinsTable, startsOf } from "../viewer/data.js";
import { probeOf, reachable, stationKey } from "../viewer/walk.js";
import { showCell } from "../viewer/chrome/detail.js";
import { noteWith } from "../viewer/chrome/navigate.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { get } from "./drafts.js";
import { BLOCK_KINDS, CAPS, COUNTER_WORDS, DISC_MAX, KEY } from "../format/kwl.js";
import {
  ERROR,
  WARNING,
  counts,
  describe,
  listed,
  playsAs,
  typeWord,
  validate,
} from "../format/project.js";
import { across, place3, plural } from "./editing.js";

let wired = false;
// Whether the author has opened or folded the counts and the findings; null until they do.
let unfolded = null;

/** Register the overview with the level line, once. */
export function wireOverview() {
  if (wired) return;
  wired = true;
  noteWith(overview);
}

function overview(l) {
  const d = l.draft === undefined ? null : get(l.draft);
  if (!d) return null;
  const hides = skinsTable()?.hides;
  const findings = validate(d.doc, hides, NAMES);
  const missed = unreached(l);
  if (missed) findings.push(missed);
  const out = el(
    "div",
    { className: "overview" },
    el("p", { className: "plays", textContent: playsAs(d.doc) }),
    more(findings, countsLine(counts(d.doc, hides))),
  );
  keepFocus(out);
  return out;
}

/** The things the ball takes that no roll from the start reaches, over the blocks alone, as a
    finding naming each with where it stands, keys first; null where every one is reached. */
function unreached(l) {
  const types = motionTable()?.types;
  const start = startsOf(l).at(-1);
  if (!types || !start) return null;
  const idx = index(l);
  const probe = probeOf(idx);
  const from = { cell: [start.x, start.y, start.z], face: start.face };
  if (!probe.standable(from.cell, from.face)) return null;
  const reached = reachable(probe, from);
  const missed = [];
  for (const [key, marks] of idx.markers) {
    const c = idx.cells.get(key);
    if (!c || idx.records.get(key)[0].kind >= BLOCK_KINDS) continue;
    const cell = [c.x, c.y, c.z];
    for (const m of marks) {
      if (m.face === null || !types[String(m.type)]?.take) continue;
      // A face that looks into another block is the checks' finding.
      if (idx.cells.has(cellKey(...across(cell, m.face)))) continue;
      if (!reached.has(stationKey({ cell, face: m.face }))) missed.push({ m, cell });
    }
  }
  if (!missed.length) return null;
  const named = missed
    .sort((a, b) => (b.m.type === KEY) - (a.m.type === KEY))
    .map(
      ({ m, cell }) =>
        `${typeWord(m.type, NAMES)} on the ${FACE_NAME[m.face]} of the block at ${place3(cell)}`,
    );
  return {
    level: WARNING,
    text: `no roll from the start reaches ${listed(named)}, not counting jumps, teleporters, moving platforms, ice or a fall from a crumbling or vanishing block`,
    at: null,
  };
}

/** A finding's link holding the focus hands it to its namesake once the chip has placed the new note. */
function keepFocus(out) {
  const held = document.activeElement?.closest("#chipNote .there");
  if (!held) return;
  queueMicrotask(() =>
    out.querySelector(`[data-field="${CSS.escape(held.dataset.field)}"]`)?.focus(),
  );
}

/** The counts and the findings under one line that tallies them, folded on a phone until opened. */
function more(findings, counts) {
  const fold = el("details", { className: "more", open: unfolded ?? !sidebarOverlays() });
  const summary = el("summary", { textContent: `${tally(findings)}; the counts are below` });
  summary.onclick = () => {
    unfolded = !fold.open;
  };
  fold.append(summary, counts);
  if (findings.length) fold.append(findingsList(findings));
  return fold;
}

function tally(findings) {
  const errors = findings.filter((f) => f.level === ERROR).length;
  const warnings = findings.length - errors;
  const parts = [errors && plural(errors, "error"), warnings && plural(warnings, "warning")];
  return parts.filter(Boolean).join(" and ") || "no findings";
}

function countsLine(n) {
  const line = el("p", { className: "counts" });
  Object.entries(CAPS)
    .filter(([what]) => n[what] !== null)
    .forEach(([what, cap], i) => {
      const span = el("span", {
        textContent: `${n[what]} of ${cap} ${COUNTER_WORDS[what] ?? what}`,
      });
      if (!n[what]) span.className = "zero";
      else if (n[what] > cap) span.className = "over";
      else if (DISC_MAX[what] !== undefined && n[what] > DISC_MAX[what]) span.className = "high";
      line.append(i ? " · " : "", span);
    });
  return line;
}

function findingsList(findings) {
  const list = el("ul", { className: "findings" });
  for (const f of findings) {
    const li = el("li", { className: f.level });
    if (f.at) {
      const cell = place3(f.at.cell);
      const face = "face" in f.at ? `, ${FACE_NAME[f.at.face]}` : "";
      const go = el("button", { type: "button", className: "there", textContent: cell });
      go.dataset.field = `finding-${describe(f)}`;
      go.setAttribute("aria-label", `${f.text} at ${cell}${face}`);
      go.onclick = () => {
        const at = state.idx.cells.get(cellKey(...f.at.cell));
        if (at) showCell("face" in f.at ? { ...at, face: f.at.face } : at);
      };
      li.append(`${f.level}: ${f.text} at `, go, face);
    } else li.textContent = describe(f);
    list.append(li);
  }
  return list;
}
