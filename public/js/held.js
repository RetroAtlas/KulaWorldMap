// The drafts' store: its key, and what the page can tell of it without the editor.
export const KEY = "kula.drafts";
const FORMAT = "kula-world-level";

const isObject = (v) => !!v && typeof v === "object";

/** The id a key of the store names, or null. */
export function idOf(key) {
  const id = Number(key);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Whether an entry, as the store holds it, has a draft's shape. */
export const draftShaped = (entry) =>
  isObject(entry) &&
  isObject(entry.doc) &&
  entry.doc.format === FORMAT &&
  Array.isArray(entry.doc.blocks);

/** The ids the store's text names, and those among them with a draft's shape. */
export function heldIn(text) {
  let raw = null;
  try {
    raw = JSON.parse(text ?? "null");
  } catch {
    raw = null;
  }
  const drafts = isObject(raw) && isObject(raw.drafts) ? raw.drafts : {};
  const named = [];
  const shaped = [];
  for (const [key, entry] of Object.entries(drafts)) {
    const id = idOf(key);
    if (id === null) continue;
    named.push(id);
    if (draftShaped(entry)) shaped.push(id);
  }
  return { named, shaped };
}
