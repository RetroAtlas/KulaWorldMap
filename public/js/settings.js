import { $ } from "./dom.js";
import { openDialog } from "./dialog.js";

// The panel only shows its switches; each is wired, saved and keyed as any
// other, and its key works inside the panel as well.

export function openSettings() {
  const panel = $("settings");
  for (const box of panel.querySelectorAll("input[type=checkbox]")) mark(box);
  openDialog(panel);
}

export function wireSettings() {
  const panel = $("settings");
  $("settingsBtn").onclick = openSettings;
  panel.addEventListener("change", (e) => mark(e.target));
  document.addEventListener(
    "keydown",
    (e) => {
      if (panel.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
      const box = [...panel.querySelectorAll("label.check")]
        .find((label) => label.querySelector("kbd")?.textContent === e.key)
        ?.querySelector("input");
      if (!box || box.disabled) return;
      box.click();
      e.preventDefault();
    },
    { capture: true },
  );
}

function mark(box) {
  const note = box.closest("label")?.querySelector(".def");
  if (!note) return;
  note.textContent =
    box.checked === box.defaultChecked
      ? ""
      : box.defaultChecked
        ? "on by default"
        : "off by default";
}
