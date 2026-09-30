import { $ } from "./dom.js";
import { openDialog } from "./dialog.js";

export function openModal(title, body) {
  const box = $("help");
  box.innerHTML = `<div class="box"><button class="x" type="button" title="Close (Esc)" aria-label="Close">×</button><h3>${title}</h3>${body}</div>`;
  box.setAttribute("aria-label", title);
  openDialog(box);
}
