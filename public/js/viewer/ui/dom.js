export const $ = (id) => document.getElementById(id);

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) n.append(k);
  return n;
}

/** Text made safe for the page's markup. */
export const escaped = (text) =>
  text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** Whether a key event came from a form field, which keeps the browser's own keys. */
export const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";

/** Whether a dialog stands open over the page. */
export const dialogOpen = () => document.querySelector(".modal:not([hidden])") !== null;
