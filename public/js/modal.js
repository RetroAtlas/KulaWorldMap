import { $ } from "./dom.js";
import { openDialog } from "./dialog.js";

/** Open `body` under `title` as the dialog; closing it gives the focus back to `opener`, or to whatever held it. */
export function openModal(title, body, opener) {
  const box = $("help");
  box.innerHTML = `<div class="box"><button class="x" type="button" title="Close (Esc)" aria-label="Close">×</button><h3>${title}</h3>${body}</div>`;
  box.setAttribute("aria-label", title);
  openDialog(box, opener);
}
