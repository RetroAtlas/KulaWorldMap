export const $ = (id) => document.getElementById(id);

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) n.append(k);
  return n;
}
