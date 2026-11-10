// The two addresses that send a level of your own in to the community levels, with no DOM: a
// message to the map's makers and the repository's form for a level, each carrying the link.

/** The most characters the form's address is filled at; past it the form opens bare. */
export const ISSUE_MOST = 3500;

/** The form with nothing filled in, which a longer link falls back to. */
export const ISSUE_FORM =
  "https://github.com/RetroAtlas/KulaWorldMap/issues/new?template=level.yml";

const SUBJECT = "A level for the community levels: ";
const GRANT = "I made this level and share it under CC BY 4.0, credited to ";

const isSurrogate = (ch) => ch.length === 1 && ch >= "\ud800" && ch <= "\udfff";
// a lone surrogate, which a title read from a file can carry, is what encodeURIComponent throws on
const encoded = (text) =>
  encodeURIComponent([...text].map((ch) => (isSurrogate(ch) ? "\ufffd" : ch)).join(""));

/** A message to `address` with `link`, the level's `title` and `author` and the author's grant. */
export function mailtoFor({ title, author, link, address }) {
  const body = [`${title}, by ${author}.`, link, `${GRANT}${author}.`, "Anything else goes here."];
  return `mailto:${address}?subject=${encoded(SUBJECT + title)}&body=${encoded(body.join("\r\n\r\n"))}`;
}

/** The form with `title` and `link` filled in, or bare where that would pass `ISSUE_MOST`. */
export function issueFor({ title, link }) {
  const filled = `${ISSUE_FORM}&title=${encoded(SUBJECT + title)}&link=${encoded(link)}`;
  return filled.length > ISSUE_MOST ? ISSUE_FORM : filled;
}
