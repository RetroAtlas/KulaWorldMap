// The slot each row of the disc box takes: the slots of every pack, grouped
// by world with the Simon rooms last and listed in every row, the passes that
// settle a slot for each row, whose place the level takes and how the game
// reaches it, and the rows that clash on one slot. The box hands in its state,
// the packs' layout and the line under its rows the clashes go on.
import { el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { levelTitle, skinsTable, worldName } from "../viewer/data.js";
import {
  COPYCAT_PACK,
  COPYCAT_SLOTS,
  FINAL_SLOTS,
  WORLDS,
  WORLD_SLOTS,
  spelled,
} from "../format/kwl.js";
import { playsRoom } from "../format/checks.js";
import { guessSlot } from "./slotguess.js";

// --- the words and the constants -----------------------------------------------------------

const FIRST = "/HIRO/HIRO.PAK#0";
const ROOMS = "Simon rooms";
export const CHOOSE = "Choose a slot above.";
const IN_SIMON = "The game plays it in Simon mode there.";
const AS_BONUS = "The game plays it as a bonus level there.";
const clash = (n, title) => `error: ${spelled(n)} levels take ${title}'s place`;
const unlisted = (key) =>
  keyShaped(key) ? `${key}, which this image has not` : `${key}, which is no slot`;
// The first row's parts carry these ids, the rows after the same ids numbered.
const IDS = {
  plays: "patchPlays",
  checks: "patchChecks",
  slot: "patchSlot",
  reach: "patchReach",
  mode: "patchMode",
  wear: "patchWear",
  fit: "patchFit",
};

// --- the helpers ---------------------------------------------------------------------------

export const split = (key) => {
  const hash = key.lastIndexOf("#");
  const index = key.slice(hash + 1);
  return [key.slice(0, hash), /^\d+$/.test(index) ? Number(index) : NaN];
};
const themeOf = (pack) => pack.split("/")[1];
const copycat = () => skinsTable()?.copycat ?? COPYCAT_PACK;
export const keyShaped = (key) => {
  if (typeof key !== "string") return false;
  const [pack, index] = split(key);
  if (pack === copycat()) return index >= 0 && index < COPYCAT_SLOTS;
  const theme = themeOf(pack);
  const finals = pack === `/${theme}/${theme}FI.PAK`;
  return (
    WORLDS.includes(theme) &&
    (finals || pack === `/${theme}/${theme}.PAK`) &&
    index >= 0 &&
    index < (finals ? FINAL_SLOTS : WORLD_SLOTS)
  );
};
const slotTitle = (d, key) => d.titles.get(key) ?? `slot ${split(key)[1] + 1}`;
const slotTheme = (d, key) => d.themes.get(key) ?? themeOf(split(key)[0]);

// --- the slots -----------------------------------------------------------------------------

// Every row's slot list and the slot it shows, in passes so a guess never takes
// a slot chosen for another row: its target, or none where that is no slot, else
// a guess from its title, else its template's slot, else the first free slot of
// its kind, a room's slot for a level that plays as a Simon room, else the first
// free slot.
export function retarget(d, layout, errors) {
  const keys = state.data.levels.map((l) => [`${l.pack}#${l.index}`, l]);
  d.titles = new Map(keys.map(([key, l]) => [key, levelTitle(l)]));
  d.themes = new Map(keys.map(([key, l]) => [key, l.theme]));
  const groups = optionGroups(d, layout);
  const taken = new Set();
  const open = [];
  d.rows.forEach((row, i) => {
    for (const [part, id] of Object.entries(IDS)) row.u[part].id = i ? `${id}${i + 1}` : id;
    slots(d, row, groups);
    placeholder(row);
    const { into } = row.doc;
    row.into = null;
    if (into == null) open.push(row);
    else if (optionsOf(row).has(String(into))) row.into = String(into);
    if (row.into) taken.add(row.into);
  });
  const settle = (pick) => {
    for (const row of open) {
      if (row.into !== null) continue;
      row.into = pick(row) ?? null;
      if (row.into) taken.add(row.into);
    }
  };
  settle((row) => guessSlot(row.doc.title, listedOf(row), taken));
  settle((row) => {
    const { from } = row.doc;
    return from != null && optionsOf(row).has(String(from)) ? String(from) : null;
  });
  const rooms = copycat();
  settle((row) => {
    const room = playsRoom(row.doc);
    return [...optionsOf(row)].find((key) => !taken.has(key) && (split(key)[0] === rooms) === room);
  });
  settle((row) => [...optionsOf(row)].find((key) => !taken.has(key)));
  for (const row of d.rows) {
    row.u.slot.value = row.into ?? "";
    target(d, row);
  }
  clashes(d, errors);
}

// --- the slot lists, whose place a level takes and the clashes -----------------------------

/** The slots of every pack, grouped by world with the Simon rooms last, or null where neither the layout nor the image is read. */
function optionGroups(d, layout) {
  const packs = layout?.packs ?? d.packs;
  if (!packs) return null;
  const worlds = new Map();
  const rooms = el("optgroup", { label: ROOMS });
  for (const p of packs) {
    const theme = themeOf(p.path);
    const room = p.path === copycat();
    if (!room && !worlds.has(theme)) worlds.set(theme, el("optgroup", { label: worldName(theme) }));
    const group = room ? rooms : worlds.get(theme);
    p.slots.forEach((s, i) => {
      const key = `${p.path}#${i}`;
      group.append(el("option", { value: key, textContent: d.titles.get(key) ?? s.name }));
    });
  }
  return [...worlds.values(), ...(rooms.childElementCount ? [rooms] : [])];
}

function slots(d, row, groups) {
  row.u.slot.textContent = "";
  if (groups) {
    row.u.slot.append(...groups.map((g) => g.cloneNode(true)));
    return;
  }
  const own = [row.doc.into, row.doc.from].find(keyShaped) ?? FIRST;
  row.u.slot.append(el("option", { value: own, textContent: d.titles.get(own) ?? own }));
}

function placeholder(row) {
  const into = row.doc.into;
  if (into != null && ![...row.u.slot.options].some((o) => o.value === String(into)))
    row.u.slot.prepend(
      el("option", { value: "", textContent: unlisted(String(into)), disabled: true }),
    );
}

/** The slots a row's select lists, each a key and the title shown for it. */
const listedOf = (row) =>
  [...row.u.slot.options].filter((o) => o.value).map((o) => [o.value, o.textContent]);
const optionsOf = (row) => new Set(listedOf(row).map(([key]) => key));

// Whose place the level takes and how the game reaches it, and under that where
// the level and the slot disagree on how it plays, and whose artwork it wears.
function target(d, row) {
  const { u, into } = row;
  if (into === null) {
    u.reach.textContent = CHOOSE;
    u.mode.textContent = "";
    u.wear.textContent = "";
    u.fit.textContent = "";
    return;
  }
  const [pack] = split(into);
  const room = pack === copycat();
  const theme = slotTheme(d, into);
  const title = slotTitle(d, into);
  const world = worldName(theme);
  if (room)
    u.reach.textContent = `It takes ${title}'s place, the room Simon mode plays in ${world} on its first round.`;
  else if (into === FIRST)
    u.reach.textContent = `It takes ${title}'s place, where a new game starts.`;
  else if (pack.endsWith("FI.PAK"))
    u.reach.textContent = `It takes ${title}'s place among ${world}'s finals, reached once the arcade is finished.`;
  else
    u.reach.textContent = `It takes ${title}'s place, reached with a save that has got that far in ${world}.`;
  const plays = playsRoom(row.doc);
  u.mode.textContent = room === plays ? "" : room ? IN_SIMON : AS_BONUS;
  u.wear.textContent = theme === row.doc.world ? "" : `It will wear ${world}'s artwork there.`;
}

// Rows on one slot, each an error line under the rows that keeps the patches back.
function clashes(d, errors) {
  const onSlot = new Map();
  for (const row of d.rows) if (row.into) onSlot.set(row.into, (onSlot.get(row.into) ?? 0) + 1);
  errors.textContent = "";
  d.clashed = false;
  for (const [into, n] of onSlot) {
    if (n < 2) continue;
    d.clashed = true;
    errors.append(el("p", { textContent: clash(n, slotTitle(d, into)) }));
  }
}
