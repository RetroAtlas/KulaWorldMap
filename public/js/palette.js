// The palette: every kind of block and every thing the disc places, grouped as
// a player meets them, with one row pressed as the brush.
import { $, el, on } from "./dom.js";
import { state } from "./state.js";
import {
  kindName,
  markerColour,
  markerHazard,
  markerLabel,
  markerNote,
  objectId,
  paintsFace,
} from "./data.js";
import { blockIcon, markerIcon } from "./icons.js";
import {
  COLOURS,
  FACING_TYPES,
  FRUIT,
  LASER_KIND,
  PICKUPS,
  PLAIN_ONLY,
  PLAYED,
  SETTINGS_KIND,
  STAR,
  STARTS,
  SWITCH,
  VARIANTS,
} from "./kwl.js";

export const GROUPS = ["Blocks", "On the face", "Devices", "Hazards", "Pickups"];
// The acid patch works by the code and is untested in play, so it is not offered.
const UNTRIED = 4;
// Every fruit shows as the one the player needs next, so one entry stands for all.
const FRUIT_SHOWN = 46;
const FRUIT_NOTE = "The game shows the player's next fruit, whichever is placed";
const PICKUP_SET = new Set(PICKUPS);
const NO_WORDS = Array(16).fill(0);

const markerFor = (type, variant) => ({
  id: variant === null ? `t${type}` : `t${type}/${variant}`,
  type,
  face: 0,
  f: NO_WORDS,
  v: 0,
  variant,
});

/** Whether the legend tells a type's rows apart by a field. */
const split = (type) => objectId({ type, f: NO_WORDS }).includes("/");

/** The legend's key for a thing of the project's shape, every fruit under the row that stands for them. */
export const idOf = ({ type, variant }) => {
  const t = FRUIT.includes(type) ? FRUIT_SHOWN : type;
  return split(t) ? `t${t}/${variant ?? 0}` : `t${t}`;
};

/** The key of a block's row: its kind, and for a laser its colour as well. */
export const kindId = (b) => (b.kind === LASER_KIND ? `k${b.kind}/${b.colour ?? 0}` : `k${b.kind}`);

/** A colour's word, as the annotations name a switch of it. */
export const colourName = (colour) =>
  /\(([^)]*)\)/.exec(markerLabel(markerFor(SWITCH, String(colour))))?.[1] ?? String(colour);

// What belongs to the face: its paint, the ball's start, and a thing that only
// points a way and is neither a device nor a hazard.
function groupOf(marker) {
  const { type } = marker;
  if (PICKUP_SET.has(type)) return "Pickups";
  const points = FACING_TYPES.has(type) && !PLAIN_ONLY.has(type) && !markerHazard(marker);
  if (STARTS.has(type) || paintsFace(type) || points) return "On the face";
  return markerHazard(marker) ? "Hazards" : "Devices";
}

let entries = null;

function build() {
  const out = [];
  for (let kind = 0; kind < SETTINGS_KIND; kind++) {
    const name = kindName(kind) ?? `kind ${kind}`;
    const colours = kind === LASER_KIND ? [...Array(COLOURS).keys()] : [undefined];
    for (const colour of colours) {
      const id = kindId({ kind, colour });
      const label = colour === undefined ? name : `${name} (${colourName(colour)})`;
      const marker = { id, kind, face: null, f: NO_WORDS, variant: null };
      const e = { id, group: GROUPS[0], kind, label, title: label, marker };
      if (colour !== undefined) e.colour = colour;
      out.push(e);
    }
  }
  const types = [...PLAYED]
    .filter((t) => t !== UNTRIED && (!FRUIT.includes(t) || t === FRUIT_SHOWN))
    .sort((a, b) => a - b);
  for (const type of types) {
    const variants = split(type) ? [...Array(VARIANTS[type] ?? 1).keys()].map(String) : [null];
    for (const v of variants) {
      const marker = markerFor(type, v);
      const label = markerLabel(marker);
      const e = { id: marker.id, group: groupOf(marker), type, label, title: label, marker };
      if (v !== null) e.variant = Number(v);
      if (FRUIT.includes(type)) e.title = FRUIT_NOTE;
      else if (type === STAR && markerNote(marker)) e.title = markerNote(marker);
      out.push(e);
    }
  }
  return out.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
}

export const all = () => (entries ??= build());
export const entryOf = (id) => all().find((e) => e.id === id) ?? null;

let group = GROUPS[0];
let pressed = "k0";
let chose = () => {};
let closed = () => {};
let builtFor = null;

export const chosen = () => entryOf(pressed);

export function wirePalette(onChoose, onClose = () => {}) {
  chose = onChoose;
  closed = onClose;
  on("atlas-loaded", (world) => {
    if (world === state.lvl?.theme && !$("palette").hidden) render();
  });
}

/** Build the rows anew where the world's artwork changed under them. */
export function sync() {
  if (builtFor !== state.lvl?.theme) render();
}

export function render() {
  const box = $("palette");
  const l = state.lvl;
  if (!l) return;
  const held = box.contains(document.activeElement) ? document.activeElement : null;
  box.textContent = "";
  const grip = el("div", { className: "grip" });
  grip.setAttribute("aria-hidden", "true");
  const close = el("button", {
    className: "x",
    type: "button",
    textContent: "×",
    title: "Close the palette (Esc)",
  });
  close.setAttribute("aria-label", "Close the palette");
  close.onclick = () => closed();
  const tabs = el("div", { className: "tabs" });
  for (const g of GROUPS) {
    const b = el("button", { type: "button", textContent: g, title: g });
    b.dataset.group = g;
    b.setAttribute("aria-pressed", String(g === group));
    b.onclick = () => {
      group = g;
      render();
    };
    tabs.append(b);
  }
  const rows = el("div", { className: "rows" });
  all()
    .filter((e) => e.group === group)
    .forEach((e, i) => {
      const b = el("button", { type: "button", className: "kind", title: e.title });
      b.dataset.id = e.id;
      b.setAttribute("aria-pressed", String(e.id === pressed));
      const icon =
        e.colour === undefined
          ? markerIcon(e.marker, l)
          : blockIcon(l, e.kind, { size: 22, plate: e.colour });
      b.append(
        icon ?? el("span", { className: "dot", style: `background:${markerColour(e.marker)}` }),
        el("span", { textContent: e.label }),
      );
      if (i < 9) {
        const digit = el("kbd", { textContent: String(i + 1) });
        digit.setAttribute("aria-hidden", "true");
        b.append(digit);
      }
      b.onclick = () => choose(e.id);
      rows.append(b);
    });
  box.append(grip, close, tabs, rows);
  builtFor = l.theme;
  if (held) refocus(box, held);
}

// The control that held the focus takes it again where it stands, or the
// pressed row does where that control left with its group.
function refocus(box, held) {
  const { id, group } = held.dataset;
  const same = id
    ? box.querySelector(`.rows [data-id="${id}"]`)
    : group
      ? box.querySelector(`.tabs [data-group="${group}"]`)
      : box.querySelector(".x");
  (same ?? box.querySelector('.rows [aria-pressed="true"]'))?.focus();
}

/** Press the row of `id`, showing its group; false where there is none. */
export function choose(id) {
  const e = entryOf(id);
  if (!e) return false;
  pressed = id;
  group = e.group;
  render();
  chose(e);
  return true;
}

/** Press the row `delta` places on from the pressed one, across the groups. */
export function step(delta) {
  const list = all();
  const i = list.findIndex((e) => e.id === pressed);
  choose(list[(i + delta + list.length) % list.length].id);
}

/** Press the nth row of the shown group. */
export function pickDigit(n) {
  const e = all().filter((e) => e.group === group)[n - 1];
  if (e) choose(e.id);
}

/** The pressed row's icon, for the map to draw. */
export const brushIcon = (size) => {
  const e = chosen();
  if (!e || !state.lvl) return null;
  if (e.colour !== undefined) return blockIcon(state.lvl, e.kind, { size, plate: e.colour });
  return markerIcon(e.marker, state.lvl, size);
};
