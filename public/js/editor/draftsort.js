// The order and the filter of Your levels, over records with no page in them.

const byName = new Intl.Collator("en", { numeric: true }).compare;
const unsaved = (r) => r.saved === null || r.edits > 0;
// the latest change first, the higher id first among levels changed at one time
const byChange = (a, b) => b.updated - a.updated || b.id - a.id;

const ORDERS = {
  changed: () => byChange,
  title: () => (a, b) => byName(a.title, b.title) || byChange(a, b),
  world: (worlds) => (a, b) => worlds.indexOf(a.world) - worlds.indexOf(b.world) || byChange(a, b),
  unsaved: () => (a, b) => Number(unsaved(b)) - Number(unsaved(a)) || byChange(a, b),
};

/** The sorts, in the order the control offers them. */
export const SORTS = Object.keys(ORDERS);

/** The comparator of `sort` over `{ id, title, world, updated, saved, edits }` records, `worlds` the worlds' names in the game's order. */
export const ordering = (sort, worlds = []) =>
  (Object.hasOwn(ORDERS, sort) ? ORDERS[sort] : ORDERS.changed)(worlds);

/** Whether a record's title or world holds `query`, whatever the case; an empty query holds all. */
export function matches(record, query) {
  const q = query.trim().toLowerCase();
  return !q || record.title.toLowerCase().includes(q) || record.world.toLowerCase().includes(q);
}

/** The bundles as groups over `records` by id: each with the records of its levels the filter keeps, in the bundle's order, and whether it hides, which it does with none kept while the filter has text; and the ids of every level in a bundle. */
export function grouping(bundles, records, query) {
  const grouped = new Set();
  const groups = bundles.map((b) => {
    const levels = b.levels.filter((id) => records.has(id)).map((id) => records.get(id));
    for (const r of levels) grouped.add(r.id);
    const kept = levels.filter((r) => matches(r, query));
    return { b, kept, hidden: !kept.length && query.trim() !== "" };
  });
  return { groups, grouped };
}

/** The ids of the levels the list shows, in its order: each group's kept levels, group after group, then the levels in no bundle. */
export const listed = (groups, loose) => [
  ...groups.flatMap((g) => g.kept.map((r) => r.id)),
  ...loose.map((r) => r.id),
];

/** The id `delta` places on from `id` among `ids`, or null past either end; from an id the list does not hold, the first id for a step on and the last for a step back. */
export function stepFrom(ids, id, delta) {
  const i = ids.indexOf(id);
  if (i < 0) return ids.at(delta > 0 ? 0 : -1) ?? null;
  return ids[i + delta] ?? null;
}
