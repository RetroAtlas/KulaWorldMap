import { emit } from "./dom.js";

// A dialog is an overlay holding its box, shown and hidden by its `hidden`
// attribute, and one is open at a time. While it is open the keys are its
// own: Tab goes round its controls, Escape closes it and nothing reaches the
// page behind. A click on the overlay lands beside the box and closes it, one
// inside reaches the box first and does not. The dialog stands on a history
// entry of its own, a copy of the one under it, so that Back closes it rather
// than leaving the page, and closing it spends the entry. The focus goes back
// to where it was.

const FOCUSABLE = "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";

let open = null;
let entries = 0;
// Closing a dialog gives its entry back with a Back of its own, which lands a
// moment later, and a dialog opened before then takes its entry once it has.
let returning = false;

export function openDialog(overlay) {
  if (!entries) {
    addEventListener("keydown", keys, { capture: true });
    addEventListener("popstate", backed);
  }
  if (open) {
    if (open.overlay === overlay) return;
    open.overlay.hidden = true;
    open.overlay = overlay;
  } else {
    emit("dialog-opened");
    open = { overlay, back: document.activeElement, entry: ++entries };
    if (!returning) stand();
  }
  overlay.hidden = false;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeDialog();
  };
  for (const x of overlay.querySelectorAll(".x")) x.onclick = closeDialog;
  controls(overlay)[0]?.focus();
}

export function closeDialog() {
  if (!open) return;
  const { entry } = open;
  shut();
  if (history.state?.dialog !== entry) return;
  returning = true;
  history.back();
}

const stand = () => history.pushState({ dialog: open.entry }, "", location.href);

function shut() {
  const { overlay, back } = open;
  open = null;
  overlay.hidden = true;
  back?.focus();
}

function backed() {
  if (returning) {
    returning = false;
    if (open) stand();
  } else if (open) shut();
}

const controls = (overlay) =>
  [...overlay.querySelectorAll(FOCUSABLE)].filter((c) => !c.disabled && c.getClientRects().length);

function keys(e) {
  if (!open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeDialog();
  } else if (e.key === "Tab") {
    e.preventDefault();
    const all = controls(open.overlay);
    const i = all.indexOf(document.activeElement);
    all[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
  }
  e.stopImmediatePropagation();
}
