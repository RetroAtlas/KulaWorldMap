// A file out of the page: a download whose URL outlives the click, and a
// file name out of a title.

// Safari and Firefox may still be reading the last URL when the next click comes.
let held = null;

export function download(name, data, type) {
  if (held) URL.revokeObjectURL(held);
  held = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = held;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
}

export const SLUG_MOST = 60;

export const slug = (title, fallback = "level") =>
  title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
    .slice(0, SLUG_MOST)
    .replace(/^-+|-+$/g, "") || fallback;
