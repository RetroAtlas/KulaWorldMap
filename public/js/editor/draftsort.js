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
