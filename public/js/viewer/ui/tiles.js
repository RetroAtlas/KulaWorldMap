import { el, on } from "./dom.js";

// A tile is a button, so a click opens its item; its canvas is decoration,
// painted by whoever mounted the list as the tile nears the screen.

const NEAR = "100% 0px";

/** The scroll box `node` lies in, or null where the page itself is the scroll box. */
function scrollRoot(node) {
  for (let n = node; n && n !== document.body; n = n.parentElement)
    if (/auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
  return null;
}

/** Lay `items` out as tiles in `container`, each a button holding a canvas its `paint` fills as
    the tile nears the screen, again when its `stamp` changes or the screen's density does and
    when asked through `repaint`; a paint answering false leaves the tile wanting another. */
export function tiles(container, items) {
  const list = el("ul", { className: "tiles" });
  list.setAttribute("role", "list");
  container.append(list);
  const byKey = new Map();
  let live = true;

  const paint = (t) => {
    if (!t.canvas.clientWidth || !t.canvas.clientHeight) return;
    t.due = t.item.paint(t.canvas) === false;
  };
  const refresh = (t) => {
    t.due = true;
    if (t.near) paint(t);
  };
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const t = byKey.get(e.target.dataset.key);
        if (!t) continue;
        t.near = e.isIntersecting;
        if (t.near && t.due) paint(t);
      }
    },
    { root: scrollRoot(container), rootMargin: NEAR },
  );

  const make = (key) => {
    const canvas = el("canvas", { className: "thumb" });
    canvas.setAttribute("aria-hidden", "true");
    const name = el("span", { className: "name" });
    const line = el("span", { className: "line" });
    const button = el("button", { type: "button", className: "tile" }, canvas, name, line);
    button.dataset.key = key;
    const t = {
      item: null,
      canvas,
      name,
      tag: el("span", { className: "tag" }),
      line,
      button,
      li: el("li", {}, button),
      due: true,
      near: false,
    };
    button.onclick = () => t.item.open();
    return t;
  };

  const word = (t) => {
    const { title, tag, line, current } = t.item;
    t.name.textContent = title;
    t.line.textContent = line;
    if (tag) {
      t.tag.textContent = tag;
      if (!t.tag.isConnected) t.name.after(t.tag);
    } else t.tag.remove();
    t.button.setAttribute("aria-current", current ? "true" : "false");
  };

  function update(items) {
    const focused = list.contains(document.activeElement)
      ? document.activeElement.closest(".tile")?.dataset.key
      : undefined;
    const kept = new Set();
    items.forEach((item, i) => {
      const key = String(item.key);
      kept.add(key);
      let t = byKey.get(key);
      if (!t) {
        byKey.set(key, (t = make(key)));
        watcher.observe(t.button);
      }
      const changed = t.item !== null && t.item.stamp !== item.stamp;
      t.item = item;
      word(t);
      if (list.children[i] !== t.li) list.insertBefore(t.li, list.children[i] ?? null);
      if (changed) refresh(t);
    });
    for (const [key, t] of byKey) {
      if (kept.has(key)) continue;
      watcher.unobserve(t.button);
      t.li.remove();
      byKey.delete(key);
    }
    if (focused !== undefined) byKey.get(focused)?.button.focus();
  }

  function repaint(key) {
    const t = byKey.get(String(key));
    if (t) refresh(t);
  }

  function destroy() {
    live = false;
    watcher.disconnect();
    list.remove();
    byKey.clear();
  }

  on("density-changed", () => {
    if (live) for (const t of byKey.values()) refresh(t);
  });
  update(items);
  return { update, repaint, destroy };
}
