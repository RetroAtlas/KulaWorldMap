// The panel's form while editing: the block, the chosen face and what stands
// on it, the circuits, and what the checks say, every change one step of the
// trail. It rides the panel's onShow seam and draws nothing on the map.
import { $, el, on } from "./dom.js";
import { state, cellKey } from "./state.js";
import { DIRECTION_NAME, FACE_NAME, FACE_NORMAL } from "./faces.js";
import {
  entryName,
  kindName,
  markerColour,
  markerDestination,
  markerFacing,
  markerLabel,
  markerPoints,
  skinsTable,
} from "./data.js";
import { onShow, showCell } from "./detail.js";
import { say } from "./a11y.js";
import { toast } from "./toast.js";
import { buildAgainst, editing, placeHere } from "./editor.js";
import * as palette from "./palette.js";
import * as drafts from "./drafts.js";
import { edit } from "./trail.js";
import {
  ERROR,
  blockAt,
  counts,
  describe,
  playsAs,
  setBlock,
  setCircuit,
  setFace,
  validate,
} from "./project.js";
import {
  BLOCK_KINDS,
  CAPS,
  COLOURS,
  COUNTER_WORDS,
  CRUMBLING_KIND,
  DEFAULT_LENGTH,
  DEFAULT_SPEED,
  DISC_MAX,
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
  sameCell,
  spanAxis,
} from "./kwl.js";

const BRITTLE = "Nothing stands on a platform's, laser's, crumbling or vanishing block's faces.";
const LOOKS_INTO = "That face looks into another block.";
const RUN_ON_MAP = "A run is laid on the map, in two clicks.";
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
const NO_WORDS = Array(16).fill(0);
let wired = false;
let focused = null;
let wasOn = null;

const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const sentence = (text) => `${capital(text)}.`;
const place3 = (cell) => cell.join(", ");
const kindWord = (kind) => lower(kindName(kind) || "plain block");
const article = (word) => (/^([aeiou]|hour)/i.test(word) ? "an" : "a");
const aWord = (word) => `${article(word)} ${word}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const across = (cell, face) => cell.map((v, i) => v + FACE_NORMAL[face][i]);
const current = () => {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : drafts.get(id);
  return d && { id, doc: d.doc };
};
const thingOn = (cell, face) =>
  (state.idx.markers.get(cellKey(...cell)) || []).find((m) => m.face === face) ?? null;
const plainOnly = (e) => {
  const name = lower(entryName(e.marker) ?? e.label);
  return name.endsWith("s")
    ? `${capital(name)} work on a plain block only.`
    : `${capital(aWord(name))} works on a plain block only.`;
};
const brittle = (b) =>
  SPAN_KINDS.has(b.kind) || b.kind === CRUMBLING_KIND || b.kind === VANISHING_KIND;
const brushWord = () => {
  const e = palette.chosen();
  if (!e) return "thing";
  if (e.kind === LASER_KIND) return `${palette.colourName(e.colour)} ${kindWord(e.kind)}`;
  return e.kind !== undefined ? kindWord(e.kind) : lower(e.label);
};
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

function refuse(text) {
  toast(text);
  $("toolStatus").textContent = text;
}

function commit(id, next, label) {
  edit(id, next, label);
  $("toolStatus").textContent = "";
  say(capital(label));
}

/** The errors `next` has that `before` had not. */
function newErrors(before, next) {
  const hides = skinsTable()?.hides;
  if (!hides) return [];
  const errorsOf = (p) => validate(p, hides).filter((f) => f.level === ERROR);
  const seen = new Set(errorsOf(before).map(describe));
  return errorsOf(next).filter((f) => !seen.has(describe(f)));
}

/** Every cell a span takes: its run, and for a platform the blocks beyond the far end. */
function runCells(b) {
  const axis = spanAxis(b.cell, b.far);
  if (axis === null) return [b.cell];
  const lo = Math.min(b.cell[axis], b.far[axis]);
  const extra = b.kind === PLATFORM_KIND ? (b.length ?? DEFAULT_LENGTH) - 1 : 0;
  const hi = Math.max(b.cell[axis], b.far[axis]) + extra;
  const cells = [];
  for (let t = lo; t <= hi; t++) {
    const c = [...b.cell];
    c[axis] = t;
    cells.push(c);
  }
  return cells;
}

const spanOf = (doc, cell) =>
  doc.blocks.find(
    (b) => SPAN_KINDS.has(b.kind) && b.far && runCells(b).some((c) => sameCell(c, cell)),
  ) ?? null;

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

/** Register the form with the panel; once. */
export function wireForm() {
  if (wired) return;
  wired = true;
  onShow(render);
  const edit = $("editBtn");
  new MutationObserver(() => {
    const now = edit.getAttribute("aria-pressed");
    if (now === wasOn) return;
    wasOn = now;
    if (state.selected) showCell(state.selected);
  }).observe(edit, { attributes: true, attributeFilter: ["aria-pressed"] });
  on("brush-changed", () => {
    if (editing() && state.selected) showCell(state.selected);
  });
}

function render(box, c) {
  if (!editing()) return;
  const d = current();
  if (!d) return;
  const cell = [c.x, c.y, c.z];
  let face = c.face ?? null;
  const own = blockAt(d.doc, cell);
  const span = own ? null : spanOf(d.doc, cell);
  if (!own && !span) return;
  const body = box.querySelector("#detailBody");
  const raw = el(
    "details",
    { className: "raw" },
    el("summary", { textContent: "the game's words" }),
    ...[...body.childNodes],
  );
  const form = el("div", { className: "form" });
  if (!own) face = null;
  if (own) form.append(facesRow(d, own, c, face));
  form.append(blockCard(d, own ?? span, own ? null : cell));
  if (own && face !== null) form.append(faceCard(d, own, c, face));
  form.append(circuitsCard(d), checks(d));
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
      const input = el("input", {
        type: "number",
        min,
        step: 1,
        inputMode: "numeric",
        title: name,
      });
      input.dataset.field = key;
      input.value = String(b[key] ?? fallback);
      input.onchange = () => {
        const v = Math.round(Number(input.value));
        if (input.value === "" || !(v >= min)) {
          input.value = String(b[key] ?? fallback);
          return;
        }
        change(
          d,
          setBlock(d.doc, cell, { ...b, [key]: v }),
          `set the ${name.toLowerCase()} of the moving platform at ${place3(cell)} to ${v}`,
          input,
          String(b[key] ?? fallback),
        );
      };
      return field(name, input);
    };
    out.append(
      number("Length", "length", DEFAULT_LENGTH, 1),
      number("Speed", "speed", DEFAULT_SPEED, 1),
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

/** Make `next` the document as one step, or refuse what the checks newly flag and put the control back. */
function change(d, next, label, control = null, back = null, { check = true } = {}) {
  const grew = check ? newErrors(d.doc, next) : [];
  if (grew.length) {
    refuse(sentence(grew[0].text));
    if (control && back !== null) control.value = back;
    return false;
  }
  commit(d.id, next, label);
  return true;
}

function swatches(name, count, chosen, colourOf, nameOf, pick, textOf = () => "") {
  const row = el("span", { className: "swatches" });
  for (let v = 0; v < count; v++) {
    const b = button(`${name}-${v}`, textOf(v), nameOf(v));
    b.style.setProperty("--swatch", colourOf(v));
    b.setAttribute("aria-pressed", String(v === chosen));
    b.setAttribute("aria-label", nameOf(v));
    b.onclick = () => pick(v);
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
        b.setAttribute("aria-pressed", String((o.facing ?? 1) === f));
        b.onclick = () =>
          change(
            d,
            setFace(d.doc, cell, face, { ...o, facing: f }),
            `turned the ${name} on the ${FACE_NAME[face]} of ${place3(cell)} to ${directionOf(o.type, face, f)}`,
          );
        row.append(b);
      }
      out.append(group("Faces", row));
    }
    if (VARIANT_TYPES.has(o.type)) {
      const n = VARIANTS[o.type];
      const labelOf = (v) => palette.entryOf(`t${o.type}/${v}`)?.label ?? `${capital(name)} ${v}`;
      const phases = o.type !== TELEPORTER && o.type !== SWITCH && n === PHASES;
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
    if (o.type === TELEPORTER || o.type === SWITCH) {
      const starts = d.doc.circuits?.[String(o.variant ?? 0)] === "off" ? "off" : "on";
      out.append(line(`Its colour starts ${starts} · change under Circuits.`));
    }
  }
  const here = { ...state.idx.cells.get(cellKey(...cell)), face };
  const brush = aWord(brushWord());
  const run = SPAN_KINDS.has(palette.chosen()?.kind);
  const place = button(
    "place",
    `Place ${brush} here`,
    run ? RUN_ON_MAP : `Put ${brush} against this face, as a click would`,
  );
  place.disabled = run;
  place.onclick = () => placeHere(here);
  const build = button("build", "Build against this face", "Lay a plain block across this face");
  build.onclick = () => buildAgainst(here);
  out.append(el("div", { className: "row" }, place, build));
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

// --- the circuits and the checks ------------------------------------------------------------

function circuitsCard(d) {
  const out = card("Circuits");
  for (let colour = 0; colour < COLOURS; colour++) {
    const off = d.doc.circuits?.[String(colour)] === "off";
    let switches = 0;
    let teleporters = 0;
    let lasers = 0;
    for (const b of d.doc.blocks) {
      if (b.kind === LASER_KIND && (b.colour ?? 0) === colour) lasers++;
      for (const o of Object.values(b.faces ?? {})) {
        if (o.type === SWITCH && (o.variant ?? 0) === colour) switches++;
        if (o.type === TELEPORTER && (o.variant ?? 0) === colour) teleporters++;
      }
    }
    const members = [
      switches && `${switches} ${switches === 1 ? "switch" : "switches"}`,
      teleporters && plural(teleporters, "teleporter"),
      lasers && plural(lasers, "laser"),
    ].filter(Boolean);
    const name = palette.colourName(colour);
    const toggle = button(
      `circuit-${colour}`,
      `starts ${off ? "off" : "on"}`,
      `Turn the ${name} circuit ${off ? "on" : "off"}`,
    );
    toggle.setAttribute("aria-pressed", String(!off));
    toggle.onclick = () =>
      change(
        d,
        setCircuit(d.doc, colour, off ? "on" : "off"),
        `turned the ${name} circuit ${off ? "on" : "off"}`,
      );
    const swatch = el("span", { className: "lamp" });
    swatch.style.setProperty("--lamp", swatchOf(SWITCH, colour));
    out.append(
      el(
        "div",
        { className: "circuit" },
        swatch,
        el("span", { className: "name", textContent: name }),
        toggle,
        el("span", {
          className: "members",
          textContent: members.length ? members.join(", ") : "nothing of this colour",
        }),
      ),
    );
  }
  return out;
}

function checks(d) {
  const hides = skinsTable()?.hides;
  const out = el("div", { className: "checks" });
  if (!hides) return out;
  const n = counts(d.doc, hides);
  const parts = Object.entries(CAPS).map(([what, cap]) => {
    const span = el("span", { textContent: `${n[what]} of ${cap} ${COUNTER_WORDS[what] ?? what}` });
    if (n[what] > cap) span.className = "over";
    else if (DISC_MAX[what] !== undefined && n[what] > DISC_MAX[what]) span.className = "high";
    return span;
  });
  const countsLine = el("p", { className: "counts" });
  parts.forEach((p, i) => countsLine.append(i ? " · " : "", p));
  out.append(line(playsAs(d.doc), "plays"), countsLine);
  const findings = validate(d.doc, hides);
  if (!findings.length) return out;
  const list = el("ul", { className: "findings" });
  for (const f of findings) {
    const li = el("li", { className: f.level });
    if (f.at) {
      const go = el("button", {
        type: "button",
        className: "there",
        textContent: place3(f.at.cell),
      });
      go.dataset.field = `finding-${describe(f)}`;
      go.onclick = () => {
        const at = state.idx.cells.get(cellKey(...f.at.cell));
        if (at) showCell("face" in f.at ? { ...at, face: f.at.face } : at);
      };
      li.append(`${f.level}: ${f.text} at `, go, "face" in f.at ? `, ${FACE_NAME[f.at.face]}` : "");
    } else li.textContent = describe(f);
    list.append(li);
  }
  out.append(list);
  return out;
}
