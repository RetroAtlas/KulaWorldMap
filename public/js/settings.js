import { $ } from "./dom.js";
import { openDialog } from "./dialog.js";

// The panel only shows its switches; each is wired, saved and keyed as any other.

export function openSettings() {
  const panel = $("settings");
  for (const box of panel.querySelectorAll("input[type=checkbox]")) mark(box);
  openDialog(panel);
}

export function wireSettings() {
  $("settingsBtn").onclick = openSettings;
  $("settings").addEventListener("change", (e) => mark(e.target));
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
