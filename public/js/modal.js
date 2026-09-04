import { $ } from "./dom.js";

// The overlay is the dialog, so a click that lands on it landed outside the
// box; one inside reaches the box first and must not dismiss what it is
// reading.
let lastFocus = null;

export const modalOpen = () => !$("help").hidden;

export function openModal(title, body) {
  const box = $("help");
  box.innerHTML = `<div class="box"><button class="x" title="Close (Esc)">×</button><h3>${title}</h3>${body}</div>`;
  box.setAttribute("aria-label", title);
  box.hidden = false;
  lastFocus = document.activeElement;
  const x = box.querySelector(".x");
  x.onclick = closeModal;
  x.focus();
  box.onclick = (e) => {
    if (e.target === box) closeModal();
  };
}

export function closeModal() {
  const box = $("help");
  if (box.hidden) return;
  box.hidden = true;
  lastFocus?.focus();
  lastFocus = null;
}
