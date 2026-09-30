const SHOWN_MS = 3000;
const OUT_MS = 150;
const MOST = 3;

const live = []; // oldest first; the stack runs the other way
const waiting = [];
let badge = null;

const stack = () => document.getElementById("toastStack");

export function toast(msg) {
  const newest = live.at(-1);
  if (newest && !newest.leaving && newest.msg === msg) {
    clearTimeout(newest.timer);
    newest.timer = setTimeout(() => retire(newest), SHOWN_MS);
    replay(newest.bar);
    return;
  }
  if (live.length >= MOST) {
    waiting.push(msg);
    count();
    return;
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--toast-ms", `${SHOWN_MS}ms`);
  const text = document.createElement("span");
  text.textContent = msg;
  const bar = document.createElement("i");
  bar.className = "toast-bar";
  el.append(text, bar);
  stack().prepend(el);
  const entry = { el, bar, msg, timer: 0, leaving: false };
  live.push(entry);
  void el.offsetHeight; // lay out the faded state first, so the fade in plays
  el.classList.add("show");
  entry.timer = setTimeout(() => retire(entry), SHOWN_MS);
}

function retire(entry) {
  if (entry.leaving) return;
  entry.leaving = true;
  entry.el.classList.remove("show");
  setTimeout(() => {
    entry.el.remove();
    live.splice(live.indexOf(entry), 1);
    if (!waiting.length) return;
    const next = waiting.shift();
    count();
    toast(next);
  }, OUT_MS);
}

// An animation plays again only once it has been off the element for a layout.
function replay(bar) {
  bar.style.animation = "none";
  void bar.offsetWidth;
  bar.style.animation = "";
}

function count() {
  if (!waiting.length) {
    badge?.remove();
    badge = null;
    return;
  }
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "toast-more";
    badge.setAttribute("aria-hidden", "true");
    stack().append(badge);
  }
  badge.textContent = `+${waiting.length} more`;
}
