// The order and the filter of the community levels, over records with no page in them.

const byName = new Intl.Collator("en", { numeric: true }).compare;
// the level sent in last first, since the ids are given in order
const byNewest = (a, b) => b.id - a.id;
// the levels that name an author before those that name none
const byNamed = (a, b) => Number(b.author !== "") - Number(a.author !== "");

const ORDERS = {
  newest: () => byNewest,
  title: () => (a, b) => byName(a.title, b.title) || byNewest(a, b),
  author: () => (a, b) => byNamed(a, b) || byName(a.author, b.author) || byNewest(a, b),
  world: (worlds) => (a, b) => worlds.indexOf(a.world) - worlds.indexOf(b.world) || byNewest(a, b),
};

/** The sorts, in the order the control offers them. */
export const SORTS = Object.keys(ORDERS);

/** The comparator of `sort` over `{ id, title, author, world }` records, `worlds` the worlds' names in the game's order. */
export const ordering = (sort, worlds = []) =>
  (Object.hasOwn(ORDERS, sort) ? ORDERS[sort] : ORDERS.newest)(worlds);

/** Whether a record's title, author or world holds `query`, whatever the case; an empty query holds all. */
export function matches(record, query) {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    record.title.toLowerCase().includes(q) ||
    record.author.toLowerCase().includes(q) ||
    record.world.toLowerCase().includes(q)
  );
}
