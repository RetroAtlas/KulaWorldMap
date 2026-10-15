// The panel's form while editing, on the panel's onShow seam: the block, its face and its circuit.
import { $, el, on } from "../viewer/ui/dom.js";
import { state, cellKey } from "../viewer/state.js";
import { DIRECTION_NAME, FACE_NAME } from "../viewer/faces.js";
import {
  circuitPhrase,
  kindName,
  markerColour,
  markerDestination,
  markerFacing,
  markerLabel,
  markerPoints,
  theCircuit,
} from "../viewer/data.js";
import { onShow, showCell } from "../viewer/chrome/detail.js";
import * as palette from "./palette.js";
import { blockAt, circuitMembers, setBlock, setCircuit, setFace } from "../format/project.js";
import {
  BLOCK_KINDS,
  COLOURS,
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  FACING_TYPES,
  LASER_KIND,
  PHASES,
  PLAIN_ONLY,
  PLATFORM_KIND,
  SPAN_KINDS,
  SWITCH,
  TELEPORTER,
  VANISHING_KIND,
  VARIANTS,
  VARIANT_TYPES,
  spanAxis,
} from "../format/kwl.js";
import {
  BRITTLE,
  LOOKS_INTO,
  aWord,
  across,
  brittle,
  brushWord,
  capital,
  commit,
  current,
  holding,
  kindWord,
  lower,
  newErrors,
  place3,
  plainOnly,
  plural,
  refuse,
  sentence,
  spanAt,
  thingOn,
} from "./editing.js";
import { wireOverview } from "./overview.js";

const NOTHING = "nothing";
const FACE_SHORT = ["top", "+x", "+y", "-y", "-x", "under"];
// the signs spelled out, which a reader at its default verbosity would drop
const FACE_SPOKEN = [
  "top",
  "plus x side",
  "plus y side",
  "minus y side",
  "minus x side",
  "underside",
];
const TURNS = 4;
// the types whose one varying field is a phase
const PHASED = new Set([11, 56]);
const NO_WORDS = Array(16).fill(0);
let wired = false;
let focused = null;
let rawOpen = false;
// What the editor hands the form.
let editing = () => false;
let placeHere = () => false;
let buildAgainst = () => false;
let holdsBrush = () => false;

const markerOf = (type, variant) => ({
  type,
  face: 0,
  f: NO_WORDS,
  v: 0,
  variant: variant === null ? null : String(variant),
});
const swatchOf = (type, variant) => markerColour(markerOf(type, variant));
const directionOf = (type, face, facing) => {
  const d = markerFacing({ type, face, f: NO_WORDS.map(() => facing), v: 0, variant: null });
  return d === null ? `facing ${facing}` : DIRECTION_NAME[d];
};

const field = (text, control) =>
  el("label", { className: "field" }, el("span", { textContent: text }), control);
// A button is labelable, so a label's caption would press the first of a row.
const group = (text, row) => {
  const out = el("div", { className: "field" }, el("span", { textContent: text }), row);
  out.setAttribute("role", "group");
  out.setAttribute("aria-label", text);
  return out;
};
const card = (title, ...kids) =>
  el("div", { className: "card" }, el("h4", { textContent: title }), ...kids);
const line = (text, className = "sub") => el("p", { className, textContent: text });
const button = (dataField, text, title) => {
  const b = el("button", { type: "button", textContent: text, title: title ?? text });
  b.dataset.field = dataField;
  return b;
};
const option = (value, text) => el("option", { value, textContent: text });

/** Register the form with the panel, once, with what the editor hands it. */
export function wireForm(handed) {
  ({ editing, placeHere, buildAgainst, holdsBrush } = handed);
  if (wired) return;
  wired = true;
  wireOverview();
  onShow(render);
  // a finger's placement selects its block with the panel left down, which neither raises
  const shown = () => state.selected && !$("detail").hidden;
  on("editing-changed", () => {
    if (shown()) showCell(state.selected);
  });
  on("brush-changed", () => {
    if (editing() && shown()) showCell(state.selected);
  });
}

function render(box, c) {
  if (!editing()) return;
  const d = current();
  if (!d) return;
  const cell = [c.x, c.y, c.z];
  let face = c.face ?? null;
  const own = blockAt(d.doc, cell);
  const span = own ? null : spanAt(d.doc, cell);
  if (!own && !span) return;
  const body = box.querySelector("#detailBody");
  const raw = el(
    "details",
    { className: "raw", open: rawOpen },
    el("summary", { textContent: "Block information" }),
    ...[...body.childNodes],
  );
  raw.addEventListener("toggle", () => (rawOpen = raw.open));
  const form = el("div", { className: "form" });
  if (!own) face = null;
  if (own) form.append(facesRow(d, own, c, face));
  form.append(blockCard(d, own ?? span, own ? null : cell));
  if (own && face !== null) form.append(faceCard(d, own, c, face));
  form.addEventListener("focusin", (e) => {
    const f = e.target.closest("[data-field]");
    if (f) focused = f.dataset.field;
  });
  form.addEventListener("focusout", (e) => {
    if (e.relatedTarget && !form.contains(e.relatedTarget)) focused = null;
  });
  body.append(form, raw);
  const idle = document.activeElement === document.body || document.activeElement === box;
  if (focused && idle) form.querySelector(`[data-field="${CSS.escape(focused)}"]`)?.focus();
}

// --- the faces ---------------------------------------------------------------------------

function facesRow(d, own, c, face) {
  const cell = own.cell;
  const row = el("div", { className: "faces" });
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Faces");
  FACE_NAME.forEach((name, j) => {
    const into = blockAt(d.doc, across(cell, j));
    const b = button(`face-${j}`, FACE_SHORT[j], name);
    b.setAttribute("aria-pressed", String(face === j));
    b.setAttribute("aria-label", FACE_SPOKEN[j]);
    if (into) {
      b.disabled = true;
      b.title = `${name}: looks into the block at ${place3(into.cell)}`;
      b.setAttribute(
        "aria-label",
        `${FACE_SPOKEN[j]}, looks into the block at ${place3(into.cell)}`,
      );
    }
    if (own.faces?.[String(j)]) b.append(el("span", { className: "dot" }));
    b.onclick = () => {
      focused = `face-${j}`;
      showCell({ ...state.idx.cells.get(cellKey(...cell)), face: j });
    };
    row.append(b);
  });
  return row;
}

// --- the block ---------------------------------------------------------------------------

function blockCard(d, b, from) {
  const cell = b.cell;
  const kinds = palette.all().filter((e) => e.kind !== undefined && !SPAN_KINDS.has(e.kind));
  const kind = el("select", { title: "The kind of block" });
  kind.dataset.field = "kind";
  if (SPAN_KINDS.has(b.kind)) {
    kind.append(option(String(b.kind), kindName(b.kind) ?? `kind ${b.kind}`));
    kind.disabled = true;
  } else {
    for (const e of kinds) kind.append(option(String(e.kind), e.label));
    kind.value = String(b.kind);
    kind.onchange = () => changeKind(d, b, Number(kind.value), kind);
  }
  const out = card("Block", field("Kind", kind));
  if (from) out.append(line(`Part of the run of the block at ${place3(cell)}.`));
  if (b.kind === VANISHING_KIND) {
    const phase = el("select", { title: "The phase the block vanishes in" });
    phase.dataset.field = "phase";
    for (let p = 0; p < PHASES; p++) phase.append(option(String(p), String(p)));
    phase.value = String(b.phase ?? 0);
    phase.onchange = () =>
      change(
        d,
        setBlock(d.doc, cell, { ...b, phase: Number(phase.value) }),
        `set the phase of the vanishing block at ${place3(cell)} to ${phase.value}`,
        phase,
        String(b.phase ?? 0),
      );
    out.append(field("Phase", phase));
  }
  if (SPAN_KINDS.has(b.kind) && b.far) {
    const axis = spanAxis(cell, b.far);
    out.append(
      field(
        "Axis",
        el("span", { className: "value", textContent: axis === null ? "none" : "xyz"[axis] }),
      ),
      field("Runs to", el("span", { className: "value", textContent: place3(b.far) })),
    );
  }
  if (b.kind === PLATFORM_KIND) {
    const number = (name, key, fallback, min) => {
      const input = el("input", { type: "number", step: 1, inputMode: "numeric", title: name });
      if (min !== undefined) input.min = min;
      input.dataset.field = key;
      const kept = () => String(b[key] ?? fallback);
      input.value = kept();
      input.onchange = () => {
        if (input.validity.badInput) refuse(`${name} must be a number.`);
        if (input.validity.badInput || input.value === "") {
          input.value = kept();
          return;
        }
        const v = Math.round(Number(input.value));
        change(
          d,
          setBlock(d.doc, cell, { ...b, [key]: v }),
          `set the ${name.toLowerCase()} of the moving platform at ${place3(cell)} to ${v}`,
          input,
          kept(),
        );
      };
      return field(name, input);
    };
    out.append(
      number("Length", "length", DEFAULT_LENGTH, 1),
      number("Speed", "speed", DEFAULT_SPEED),
    );
  }
  if (b.kind === LASER_KIND) {
    out.append(
      group(
        "Colour",
        swatches(
          "laser",
          COLOURS,
          b.colour ?? 0,
          (v) => swatchOf(SWITCH, v),
          (v) => palette.colourName(v),
          (v) =>
            change(
              d,
              setBlock(d.doc, cell, { ...b, colour: v }),
              `set the laser at ${place3(cell)} to ${palette.colourName(v)}`,
            ),
        ),
      ),
      circuitRow(d, b.colour ?? 0),
    );
  }
  return out;
}

function changeKind(d, b, kind, select) {
  const cell = b.cell;
  const keeps = kind < BLOCK_KINDS;
  const block = { kind };
  if (keeps && b.faces) block.faces = b.faces;
  if (kind === VANISHING_KIND) block.phase = b.phase ?? 0;
  const dropped = !keeps && b.faces && Object.keys(b.faces).length > 0;
  change(
    d,
    setBlock(d.doc, cell, block),
    `changed the block at ${place3(cell)} to ${aWord(kindWord(kind))}${dropped ? ", taking what stood on it" : ""}`,
    select,
    String(b.kind),
  );
}

/** Make `next` the document as one step, or put the control back where the checks refuse it or it changes nothing. */
function change(d, next, label, control = null, back = null, { check = true } = {}) {
  const grew = check ? newErrors(d.doc, next) : [];
  if (grew.length) refuse(sentence(grew[0].text));
  else if (commit(d.id, next, label)) return true;
  if (control && back !== null) control.value = back;
  return false;
}

function swatches(name, count, chosen, colourOf, nameOf, pick, textOf = () => "") {
  const row = el("span", { className: "swatches" });
  for (let v = 0; v < count; v++) {
    const b = button(`${name}-${v}`, textOf(v), nameOf(v));
    b.style.setProperty("--swatch", colourOf(v));
    b.setAttribute("aria-pressed", String(v === chosen));
    b.setAttribute("aria-label", nameOf(v));
    b.onclick = () => {
      if (v !== chosen) pick(v);
    };
    row.append(b);
  }
  return row;
}

// --- the face -----------------------------------------------------------------------------

function faceCard(d, own, c, face) {
  const cell = own.cell;
  const o = own.faces?.[String(face)] ?? null;
  const out = card(`The ${FACE_NAME[face]}`);
  const into = blockAt(d.doc, across(cell, face));
  if (into) {
    out.append(line(`This face looks into the block at ${place3(into.cell)}.`));
    return out;
  }
  if (brittle(own)) {
    out.append(line(BRITTLE));
    return out;
  }
  const thing = el("select", { title: "What stands on this face" });
  thing.dataset.field = "thing";
  thing.append(option("", NOTHING));
  for (const g of palette.GROUPS.slice(1)) {
    const group = el("optgroup", { label: g });
    for (const e of palette.all().filter((e) => e.group === g)) group.append(option(e.id, e.label));
    thing.append(group);
  }
  const held = o ? palette.idOf(o) : "";
  // a thing the palette has no row for stays named, and cannot be chosen anew
  if (o && !palette.entryOf(held)) {
    const odd = option(held, markerLabel(markerOf(o.type, o.variant ?? null)));
    odd.disabled = true;
    thing.append(odd);
  }
  thing.value = held;
  thing.onchange = () => changeThing(d, own, face, thing, o);
  out.append(field("Holds", thing));
  if (o) {
    const m = thingOn(cell, face);
    const name = m ? lower(markerLabel(m)) : "thing";
    if (FACING_TYPES.has(o.type)) {
      const row = el("span", { className: "swatches facing" });
      for (let f = 1; f <= TURNS; f++) {
        const b = button(
          `facing-${f}`,
          directionOf(o.type, face, f),
          `Face it ${directionOf(o.type, face, f)}`,
        );
        const pressed = (o.facing ?? 1) === f;
        b.setAttribute("aria-pressed", String(pressed));
        b.onclick = () => {
          if (pressed) return;
          change(
            d,
            setFace(d.doc, cell, face, { ...o, facing: f }),
            `turned the ${name} on the ${FACE_NAME[face]} of ${place3(cell)} to ${directionOf(o.type, face, f)}`,
          );
        };
        row.append(b);
      }
      out.append(group("Facing", row));
    }
    if (VARIANT_TYPES.has(o.type)) {
      const n = VARIANTS[o.type];
      const labelOf = (v) => palette.entryOf(`t${o.type}/${v}`)?.label ?? `${capital(name)} ${v}`;
      const phases = PHASED.has(o.type);
      const coloured = swatchOf(o.type, 0) !== swatchOf(o.type, null);
      const worthOf = (v) => String(markerPoints(markerOf(o.type, v)));
      const row = phases
        ? swatches(
            "variant",
            n,
            o.variant ?? 0,
            () => "transparent",
            (v) => `phase ${v}`,
            (v) =>
              change(
                d,
                setFace(d.doc, cell, face, { ...o, variant: v }),
                `set the phase of the ${name} on the ${FACE_NAME[face]} of ${place3(cell)} to ${v}`,
              ),
            String,
          )
        : swatches(
            "variant",
            n,
            o.variant ?? 0,
            (v) => (coloured ? swatchOf(o.type, v) : "transparent"),
            labelOf,
            (v) =>
              change(
                d,
                setFace(d.doc, cell, face, { ...o, variant: v }),
                `set the ${FACE_NAME[face]} of ${place3(cell)} to ${aWord(lower(labelOf(v)))}`,
              ),
            coloured ? undefined : worthOf,
          );
      out.append(group(phases ? "Phase" : coloured ? "Colour" : "Worth", row));
    }
    if (o.type === TELEPORTER && m) {
      const to = markerDestination(m, state.lvl);
      const where = !to
        ? "nowhere yet"
        : to.x === cell[0] && to.y === cell[1] && to.z === cell[2] && to.face === face
          ? "itself"
          : `${place3([to.x, to.y, to.z])}, ${FACE_NAME[to.face]}`;
      out.append(field("Leads to", el("span", { className: "value", textContent: where })));
    }
    if (o.type === TELEPORTER || o.type === SWITCH) out.append(circuitRow(d, o.variant ?? 0));
  }
  const here = { ...state.idx.cells.get(cellKey(...cell)), face };
  const row = el("div", { className: "row" });
  // a run is laid on the map in two clicks, so a span brush has no place here
  if (!SPAN_KINDS.has(palette.chosen()?.kind)) {
    const brush = aWord(brushWord());
    const place = button(
      "place",
      `Place ${brush} here`,
      `Put ${brush} against this face, as a click would`,
    );
    // greyed yet focusable, so the focus its own press leaves on it stays through the redraw
    if (holdsBrush(here)) {
      place.setAttribute("aria-disabled", "true");
      place.title = holding();
    }
    place.onclick = () => placeHere(here);
    row.append(place);
  }
  const build = button("build", "Build against this face", "Lay a plain block across this face");
  build.onclick = () => buildAgainst(here);
  row.append(build);
  out.append(row);
  return out;
}

function changeThing(d, own, face, select, o) {
  const cell = own.cell;
  const back = o ? palette.idOf(o) : "";
  if (!select.value) {
    if (!o) return;
    const m = thingOn(cell, face);
    const name = m ? lower(markerLabel(m)) : "thing";
    change(
      d,
      setFace(d.doc, cell, face, null),
      `removed the ${name} from the ${FACE_NAME[face]} of ${place3(cell)}`,
      select,
      back,
      { check: false },
    );
    return;
  }
  const e = palette.entryOf(select.value);
  if (!e) return;
  let why = null;
  if (PLAIN_ONLY.has(e.type) && own.kind !== 0) why = plainOnly(e);
  else if (brittle(own)) why = BRITTLE;
  else if (blockAt(d.doc, across(cell, face))) why = LOOKS_INTO;
  if (why) {
    refuse(why);
    select.value = back;
    return;
  }
  const obj = { type: e.type };
  if (e.variant !== undefined) obj.variant = e.variant;
  if (FACING_TYPES.has(e.type)) obj.facing = o?.facing ?? 1;
  const hidden = state.hiddenKinds.delete(e.id);
  const done = change(
    d,
    setFace(d.doc, cell, face, obj),
    `set the ${FACE_NAME[face]} of ${place3(cell)} to ${aWord(lower(e.label))}`,
    select,
    back,
  );
  if (!done && hidden) state.hiddenKinds.add(e.id);
}

// --- the circuit ----------------------------------------------------------------------------

/** The circuit of one colour: its lamp, whether it starts on, as a toggle, and what it counts. */
function circuitRow(d, colour) {
  const off = d.doc.circuits?.[String(colour)] === "off";
  const { switches, teleporters, lasers } = circuitMembers(d.doc)[colour];
  const members = [
    switches && `${switches} ${switches === 1 ? "switch" : "switches"}`,
    teleporters && plural(teleporters, "teleporter"),
    lasers && plural(lasers, "laser"),
  ].filter(Boolean);
  const toggle = button(
    `circuit-${colour}`,
    `starts ${off ? "off" : "on"}`,
    `Turn ${theCircuit(colour)} ${off ? "on" : "off"}`,
  );
  toggle.setAttribute("aria-label", circuitPhrase(colour));
  toggle.setAttribute("aria-pressed", String(!off));
  toggle.onclick = () =>
    change(
      d,
      setCircuit(d.doc, colour, off ? "on" : "off"),
      `turned ${theCircuit(colour)} ${off ? "on" : "off"}`,
    );
  const swatch = el("span", { className: "lamp" });
  swatch.style.setProperty("--lamp", swatchOf(SWITCH, colour));
  swatch.setAttribute("aria-hidden", "true");
  return group(
    "Circuit",
    el(
      "div",
      { className: "circuit" },
      swatch,
      toggle,
      el("span", { className: "members", textContent: members.join(", ") }),
    ),
  );
}
