// The questions a level from elsewhere asks: which of a pack's or a disc
// image's levels to open, in one box with the packs where there are several,
// the levels of the chosen pack and a line on which world the level will
// wear; and, for a shared level, the link to paste.
import { $, el } from "../viewer/ui/dom.js";
import { state } from "../viewer/state.js";
import { levelTitle, worldName } from "../viewer/data.js";
import { closeDialog, openDialog } from "../viewer/ui/dialog.js";
import { WORLDS } from "../format/kwl.js";

const PASTE_NOTE =
  "Paste the link to a level shared from the community's level viewer. It opens as a level of your own, in the world on screen or in the world the link names.";
const PASTE_FIRST = "Paste the link first.";

let ui = null;
let pending = null;

/** The disc's world a pack's path lies under, or null for a pack from elsewhere. */
function worldOf(path) {
  const world = path.split("/")[1];
  return WORLDS.includes(world) ? world : null;
}

const shippedAt = (path, index) =>
  state.data?.levels.find((l) => l.pack === path && l.index === index);

/** What a slot is called: the pause screen's title where a shipped level lies there, else the pack's name for it. */
export function slotTitle(path, index, name) {
  const shipped = shippedAt(path, index);
  if (shipped) return levelTitle(shipped);
  return name || `slot ${index + 1}`;
}

/** The world a slot opens in: the one the map lists the shipped level there under, else its pack's, else null. */
export function slotWorld(path, index) {
  return shippedAt(path, index)?.theme ?? worldOf(path);
}

function packWorld(path) {
  const worlds = new Set(state.data?.levels.filter((l) => l.pack === path).map((l) => l.theme));
  if (worlds.size > 1) return null;
  return worlds.size ? [...worlds][0] : worldOf(path);
}

const packLabel = (path) => {
  const file = path.split("/").pop();
  const world = packWorld(path);
  return world ? `${file} (${worldName(world)})` : file;
};
const onScreen = (world) =>
  `the level opens with ${worldName(world)}'s artwork, the world on screen. The Level card's World changes it.`;
const packNote = (path, world) => {
  if (!worldOf(path))
    return `This pack lies under none of the disc's worlds, so ${onScreen(world)}`;
  const own = packWorld(path);
  return own
    ? `A level opens in the world its pack belongs to, ${worldName(own)}.`
    : "A level opens in the world the game plays it in, the one the map lists it under.";
};

// A closed dialog gives its history entry back with a Back of its own, which
// lands a moment later; an answer handed over before then would push a level
// the Back then undoes, so every answer waits for it. Dialogs number their
// entries as they open, so what is waited on is the entry current when the
// box opened or any later one, never an older dialog's that the bar was moved
// back onto.
let opened = Infinity;
const settled = () =>
  new Promise((resolve) => {
    const wait = () =>
      (history.state?.dialog ?? -1) >= opened
        ? addEventListener("popstate", wait, { once: true })
        : resolve();
    wait();
  });
const stood = () => {
  opened = history.state?.dialog ?? Infinity;
};

function settle(choice) {
  const done = pending;
  pending = null;
  done?.(settled().then(() => choice));
}

function build() {
  const x = el("button", {
    className: "x",
    type: "button",
    title: "Close (Esc)",
    textContent: "×",
  });
  x.setAttribute("aria-label", "Close");
  const u = {
    title: el("h3", { id: "importTitle" }),
    note: el("p", { id: "importNote" }),
    pack: el("select", { id: "importPack", title: "The pack to open a level from" }),
    slot: el("select", { id: "importSlot", title: "The level to open" }),
    open: el("button", { id: "importOpen", type: "button", textContent: "open" }),
    cancel: el("button", { id: "importCancel", type: "button", textContent: "cancel" }),
    packRow: null,
    packs: [],
  };
  u.packRow = el("label", { className: "field" }, el("span", { textContent: "Pack" }), u.pack);
  u.pack.onchange = () => slots(u.packs[u.pack.selectedIndex]);
  u.open.onclick = () => {
    const choice = { path: u.packs[u.pack.selectedIndex].path, slot: u.slot.selectedIndex };
    closeDialog();
    settle(choice);
  };
  u.cancel.onclick = () => {
    closeDialog();
    settle(null);
  };
  const enter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      u.open.click();
    }
  };
  u.slot.onkeydown = enter;
  u.pack.onkeydown = enter;
  const box = el(
    "div",
    { className: "box settings import" },
    x,
    u.title,
    u.note,
    u.packRow,
    el("label", { className: "field" }, el("span", { textContent: "Level" }), u.slot),
    el("div", { className: "row" }, u.open, u.cancel),
  );
  u.overlay = el("div", { id: "import", className: "modal", hidden: true }, box);
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "importTitle");
  new MutationObserver(() => {
    if (u.overlay.hidden) settle(null);
  }).observe(u.overlay, { attributes: true, attributeFilter: ["hidden"] });
  document.body.append(u.overlay);
  return u;
}

function slots(pack) {
  ui.note.textContent = pack.note;
  ui.slot.textContent = "";
  pack.slots.forEach((label) => ui.slot.append(el("option", { textContent: label })));
  ui.slot.selectedIndex = 0;
}

function pick({ heading, packs }) {
  ui ??= build();
  settle(null);
  ui.title.textContent = heading;
  ui.packs = packs;
  ui.pack.textContent = "";
  for (const p of packs) ui.pack.append(el("option", { textContent: p.label }));
  ui.packRow.hidden = packs.length < 2;
  slots(packs[0]);
  return new Promise((resolve) => {
    pending = resolve;
    openDialog(ui.overlay, $("draftOpen"));
    stood();
    ui.slot.focus();
  });
}

/** Which slot of a pack to open, by the pack's names for them, or null where the visitor declines. */
export async function pickFromPack(names, world) {
  const choice = await pick({
    heading: "Open a level from a pack",
    packs: [
      {
        path: null,
        label: "",
        note: `A pack does not say which world it is from, so ${onScreen(world)}`,
        slots: names.map((name, i) => name || `slot ${i + 1}`),
      },
    ],
  });
  return choice ? choice.slot : null;
}

/**
 * Which level of a disc image to open: { path, slot } of the chosen pack, or
 * null where the visitor declines. packs are [{ path, names }] as the image
 * has them, and a pack under none of the disc's worlds opens in the world given.
 */
export function pickFromDisc(packs, world) {
  return pick({
    heading: "Open a level from a disc",
    packs: packs.map(({ path, names }) => ({
      path,
      label: packLabel(path),
      note: packNote(path, world),
      slots: names.map((name, i) => slotTitle(path, i, name)),
    })),
  });
}

// --- a shared level's link -------------------------------------------------------------

let paste = null;
let pendingPaste = null;

function settlePaste(result) {
  const done = pendingPaste;
  pendingPaste = null;
  done?.(settled().then(() => result));
}

function buildPaste() {
  const x = el("button", {
    className: "x",
    type: "button",
    title: "Close (Esc)",
    textContent: "×",
  });
  x.setAttribute("aria-label", "Close");
  const u = {
    link: el("input", {
      id: "pasteLink",
      type: "text",
      placeholder: "https://…?level=…",
      autocomplete: "off",
      spellcheck: false,
      title: "The link to the shared level",
    }),
    says: el("p", { id: "pasteSays", className: "says" }),
    open: el("button", { id: "pasteOpen", type: "button", textContent: "open" }),
    cancel: el("button", { id: "pasteCancel", type: "button", textContent: "cancel" }),
    world: WORLDS[0],
  };
  u.says.setAttribute("aria-live", "polite");
  u.open.onclick = readPasted;
  u.cancel.onclick = () => {
    closeDialog();
    settlePaste(null);
  };
  u.link.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      readPasted();
    }
  };
  u.link.oninput = () => {
    u.says.textContent = "";
  };
  const box = el(
    "div",
    { className: "box settings paste" },
    x,
    el("h3", { id: "pasteTitle", textContent: "Open a shared level" }),
    el("p", { textContent: PASTE_NOTE }),
    el("label", { className: "field" }, el("span", { textContent: "Link" }), u.link),
    u.says,
    el("div", { className: "row" }, u.open, u.cancel),
  );
  u.overlay = el("div", { id: "paste", className: "modal", hidden: true }, box);
  u.overlay.setAttribute("role", "dialog");
  u.overlay.setAttribute("aria-modal", "true");
  u.overlay.setAttribute("aria-labelledby", "pasteTitle");
  new MutationObserver(() => {
    if (u.overlay.hidden) settlePaste(null);
  }).observe(u.overlay, { attributes: true, attributeFilter: ["hidden"] });
  document.body.append(u.overlay);
  return u;
}

// A read answers the ask it was made for, and not one that came after it.
async function readPasted() {
  if (paste.open.disabled) return;
  const text = paste.link.value.trim();
  if (!text) {
    paste.says.textContent = PASTE_FIRST;
    paste.link.focus();
    return;
  }
  const asked = pendingPaste;
  paste.open.disabled = true;
  let read;
  try {
    read = await paste.read(text, paste.world);
  } catch (e) {
    if (pendingPaste !== asked) return;
    paste.says.textContent = e.message;
    paste.link.focus();
    paste.link.select();
    return;
  } finally {
    if (pendingPaste === asked) paste.open.disabled = false;
  }
  if (pendingPaste !== asked) return;
  closeDialog();
  settlePaste(read);
}

/**
 * Ask for the link to a shared level and read it with `read(text, world)` in
 * the world given: what readLevelFile gives for a file, or null where the
 * visitor declines. A text that is no such link is refused under the field,
 * which stays for another paste.
 */
export function pasteLevelLink(world, read) {
  paste ??= buildPaste();
  settlePaste(null);
  paste.world = world;
  paste.read = read;
  paste.link.value = "";
  paste.says.textContent = "";
  paste.open.disabled = false;
  return new Promise((resolve) => {
    pendingPaste = resolve;
    openDialog(paste.overlay, $("draftPaste"));
    stood();
    paste.link.focus();
  });
}
