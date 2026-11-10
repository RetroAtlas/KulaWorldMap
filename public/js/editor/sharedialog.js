// The box that shares a level of your own: the link that carries it whole, with the ways to send
// it, or the file alone where the checks find errors.
import { $, el } from "../viewer/ui/dom.js";
import { NAMES, skinsTable } from "../viewer/data.js";
import { closeDialog, openDialog } from "../viewer/ui/dialog.js";
import { toast } from "../viewer/ui/toast.js";
import { say } from "../viewer/chrome/a11y.js";
import { settle, viewParts } from "../viewer/chrome/navigate.js";
import { ERROR, validate } from "../format/checks.js";
import { UNTITLED } from "../format/project.js";
import { LINK_MOST, shareLink } from "./sharelink.js";
import * as drafts from "./drafts.js";

const NOTE =
  "This link carries the whole level, so anyone who opens it sees it on the map and can copy it to make it their own. The link holds the level as it is now. Share it again after you change it.";
const HAS_ERRORS =
  "A level with errors has no link until they are fixed. The level line's note lists them.";
const TOO_LONG = "This level is too large for a link. Save it as a file instead.";
const COPIED = "Link copied.";
const UNCOPIED = "The link could not be copied. Select it in the field and copy it yourself.";

let ui = null;

/** Whether this browser has a share sheet that takes a link. */
const canSend = (url) =>
  typeof navigator.share === "function" && navigator.canShare?.({ url }) === true;

function build() {
  const x = el("button", {
    className: "x",
    type: "button",
    title: "Close (Esc)",
    textContent: "×",
  });
  x.setAttribute("aria-label", "Close");
  const u = {
    note: el("p", { id: "shareNote", textContent: NOTE }),
    link: el("input", {
      id: "shareLink",
      type: "text",
      readOnly: true,
      spellcheck: false,
      title: "The link that carries this level",
    }),
    says: el("p", { id: "shareSays", className: "says" }),
    app: el("button", {
      id: "shareApp",
      type: "button",
      textContent: "send to an app…",
      title: "Hand the link to another app on this device",
    }),
    copy: el("button", {
      id: "shareCopy",
      type: "button",
      textContent: "copy the link",
      title: "Copy the link to the clipboard",
    }),
    mail: el("button", {
      id: "shareMail",
      type: "button",
      textContent: "email it to someone",
      title: "Write an email that carries the link",
    }),
    file: el("button", {
      id: "shareFile",
      type: "button",
      textContent: "save the file instead",
      title: "Save this level as the map's own .json file",
    }),
    cancel: el("button", { id: "shareCancel", type: "button", textContent: "cancel" }),
    row: el("div", { className: "row" }),
    field: null,
    url: "",
    title: "",
    save: null,
  };
  u.field = el("label", { className: "field" }, el("span", { textContent: "Link" }), u.link);
  u.says.setAttribute("aria-live", "polite");
  u.link.onfocus = () => u.link.select();
  u.app.onclick = send;
  u.copy.onclick = copy;
  u.mail.onclick = mail;
  u.file.onclick = () => {
    closeDialog();
    u.save();
  };
  u.cancel.onclick = closeDialog;
  const box = el(
    "div",
    { className: "box settings share" },
    x,
    el("h3", { id: "shareTitle", textContent: "Share this level" }),
    u.note,
    u.field,
    u.says,
    u.row,
  );
  u.overlay = el("div", { id: "share", className: "modal", hidden: true }, box);
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "shareTitle");
  document.body.append(u.overlay);
  return u;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(ui.url);
  } catch {
    ui.says.textContent = UNCOPIED;
    return;
  }
  closeDialog();
  toast(COPIED);
  say(COPIED);
}

// A sheet dismissed says nothing; one the browser cannot show points at the field.
async function send() {
  try {
    await navigator.share({ title: ui.title, url: ui.url });
  } catch (e) {
    if (e?.name !== "AbortError") ui.says.textContent = UNCOPIED;
    return;
  }
  closeDialog();
}

function mail() {
  const subject = encodeURIComponent(ui.title);
  const body = encodeURIComponent(ui.url);
  window.open(`mailto:?subject=${subject}&body=${body}`, "_blank", "noopener");
  closeDialog();
}

/**
 * Open the box for the draft `id`: its link, with the ways to send it, where the checks find no
 * error, the file leading where the link would run past the bound; the file alone, with the
 * sentence that says why, where they find one. `save` writes the draft as the card's save does.
 */
export function shareLevel(id, save) {
  const d = drafts.get(id);
  if (!d) return;
  ui ??= build();
  const u = ui;
  u.save = save;
  u.title = d.doc.title || UNTITLED;
  u.says.textContent = "";
  const refused = validate(d.doc, skinsTable()?.hides, NAMES).some((f) => f.level === ERROR);
  if (refused) {
    u.url = "";
    u.link.value = "";
    u.says.textContent = HAS_ERRORS;
    u.row.replaceChildren(u.file, u.cancel);
  } else {
    settle();
    u.url = shareLink(d.doc, viewParts(), location.href.replace(/#.*$/, ""));
    u.link.value = u.url;
    u.app.hidden = !canSend(u.url);
    const long = u.url.length > LINK_MOST;
    if (long) u.says.textContent = TOO_LONG;
    const ways = long ? [u.file, u.app, u.copy, u.mail] : [u.app, u.copy, u.mail, u.file];
    u.row.replaceChildren(...ways, u.cancel);
  }
  u.note.hidden = refused;
  u.field.hidden = refused;
  openDialog(u.overlay, $("draftShare"));
  if (refused) u.file.focus();
  else {
    u.link.focus();
    u.link.select();
  }
}
