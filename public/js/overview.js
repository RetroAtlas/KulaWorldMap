// A draft's overview for the level line's note: how it plays, its counts and the findings.
import { el } from "./dom.js";
import { state, cellKey } from "./state.js";
import { FACE_NAME } from "./faces.js";
import { skinsTable } from "./data.js";
import { showCell } from "./detail.js";
import { noteWith } from "./navigate.js";
import { get } from "./drafts.js";
import { CAPS, COUNTER_WORDS, DISC_MAX } from "./kwl.js";
import { counts, describe, playsAs, validate } from "./project.js";
import { place3 } from "./editing.js";

let wired = false;

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
  const out = el(
    "div",
    { className: "overview" },
    playsLine(playsAs(d.doc)),
    countsLine(counts(d.doc, hides)),
  );
  const findings = validate(d.doc, hides);
  if (findings.length) out.append(findingsList(findings));
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

/** The sentence's head, with the whole as the tip where a colon starts an explanation. */
function playsLine(sentence) {
  const colon = sentence.indexOf(":");
  const plays = el("p", { className: "plays" });
  plays.textContent = colon < 0 ? sentence : `${sentence.slice(0, colon)}.`;
  if (colon >= 0) plays.title = sentence;
  return plays;
}

function countsLine(n) {
  const line = el("p", { className: "counts" });
  Object.entries(CAPS)
    .filter(([what]) => n[what])
    .forEach(([what, cap], i) => {
      const span = el("span", {
        textContent: `${n[what]} of ${cap} ${COUNTER_WORDS[what] ?? what}`,
      });
      if (n[what] > cap) span.className = "over";
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
