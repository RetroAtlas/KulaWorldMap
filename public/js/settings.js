import { $ } from "./dom.js";
import { openDialog } from "./dialog.js";

// The switches used less, in a dialog behind a button of their own. A switch
// here is wired, saved and keyed as any other; the panel only shows it, and
// says beside it when it stands away from its default.

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
