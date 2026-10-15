// A draft's overview for the level line's note: how it plays, its counts and the findings.
import { el } from "../viewer/ui/dom.js";
import { state, cellKey } from "../viewer/state.js";
import { FACE_NAME } from "../viewer/faces.js";
import { skinsTable } from "../viewer/data.js";
import { showCell } from "../viewer/chrome/detail.js";
import { noteWith } from "../viewer/chrome/navigate.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { get } from "./drafts.js";
import { CAPS, COUNTER_WORDS, DISC_MAX } from "../format/kwl.js";
import { ERROR, counts, describe, playsAs, validate } from "../format/project.js";
import { place3, plural } from "./editing.js";

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
  const findings = validate(d.doc, hides);
  const out = el(
    "div",
    { className: "overview" },
    el("p", { className: "plays", textContent: playsAs(d.doc) }),
    more(findings, countsLine(counts(d.doc, hides))),
  );
  keepFocus(out);
  return out;
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
