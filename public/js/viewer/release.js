// The three releases the game shipped on, each a disc the map knows by one shape, and the one shown.
import { state } from "./state.js";

export const BASE = "us";
const FALLBACK = { id: BASE, label: "US", name: "Roll Away", levels: {} };
const WORDS = { us: "North American", eu: "PAL", jp: "Japanese" };

let entries = [FALLBACK];
let shown = BASE;
let cache = { data: null, by: new Map(), slots: null };

export const releases = () => entries;
export const releaseOf = (id) => entries.find((r) => r.id === id) ?? null;
export const current = () => shown;
/** The word for a release's disc, or its region as the file gives it where the map has no word. */
export const discWord = (id) => WORDS[id] ?? releaseOf(id)?.region ?? id;
/** A release named for a tooltip: its game, its disc and its serial where the file gives one. */
export const nameOf = (r) =>
  `${r.name}, the ${discWord(r.id)} release${r.serial ? ` (${r.serial})` : ""}`;

/** The release files in order, a failed load as null and left out; the base is built in where its file is missing. */
export function setReleases(files) {
  entries = files.filter(Boolean);
  if (!releaseOf(BASE)) entries.unshift(FALLBACK);
  if (!releaseOf(shown)) shown = BASE;
  cache = { data: null, by: new Map(), slots: null };
}

export function setCurrent(id) {
  if (releaseOf(id)) shown = id;
}

const keyOf = (l) => `${l.pack}#${l.index}`;

function cached() {
  if (cache.data !== state.data) cache = { data: state.data, by: new Map(), slots: null };
  return cache;
}

/** The index of the base's slot a level stands in, or -1 for a level of no slot. */
function slotIndex(l) {
  const c = cached();
  c.slots ??= new Map(c.data.levels.map((b, i) => [keyOf(b), i]));
  return c.slots.get(keyOf(l)) ?? -1;
}

/** The release's levels in the base's slots, the base's own wherever the release has no variant. */
export function levelsOf(id) {
  const c = cached();
  if (!c.by.has(id)) {
    const variants = releaseOf(id)?.levels ?? {};
    c.by.set(
      id,
      c.data.levels.map((l) => variants[keyOf(l)] ?? l),
    );
  }
  return c.by.get(id);
}

/** The release's level at `l`'s slot, or `l` itself where it stands in no slot. */
export function levelOn(l, id = shown) {
  const i = slotIndex(l);
  return i < 0 ? l : levelsOf(id)[i];
}

/** The ids of the releases whose level at the slot `key` names is not the base's. */
export const differs = (key) =>
  entries.filter((r) => Object.hasOwn(r.levels, key)).map((r) => r.id);

export const layoutOf = (id) => releaseOf(id)?.packs ?? null;
export const rulesOf = (id) => releaseOf(id)?.rules ?? null;

/** The base entry with the overlay's keys written over it, a null taking a key away. */
export function compose(base, overlay) {
  if (!overlay) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}
