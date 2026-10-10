// The question a pack or a disc image asks: which of its levels to open. One
// box with the packs where there are several, the levels of the chosen pack,
// and a line on which world the level will wear.
import { el } from "./dom.js";
import { state } from "./state.js";
import { levelTitle, worldName } from "./data.js";
import { closeDialog, openDialog } from "./dialog.js";
import { WORLDS } from "./kwl.js";

let ui = null;
let pending = null;

/** The disc's world a pack's path lies under, or null for a pack from elsewhere. */
export function worldOf(path) {
  const world = path.split("/")[1];
  return WORLDS.includes(world) ? world : null;
}

/** What a slot is called: the pause screen's title where a shipped level lies there, else the pack's name for it. */
export function slotTitle(path, index, name) {
  const shipped = state.data?.levels.find((l) => l.pack === path && l.index === index);
  if (shipped) return levelTitle(shipped);
  return name || `slot ${index + 1}`;
}

const packLabel = (path) => {
  const file = path.split("/").pop();
  const world = worldOf(path);
  return world ? `${file} (${worldName(world)})` : file;
};
const onScreen = (world) =>
  `the level opens with ${worldName(world)}'s artwork, the world on screen. The Level card's World changes it.`;
const packNote = (path, world) =>
  worldOf(path)
    ? `A level opens in the world its pack belongs to, ${worldName(worldOf(path))}.`
    : `This pack lies under none of the disc's worlds, so ${onScreen(world)}`;

function settle(choice) {
  const done = pending;
  pending = null;
  done?.(choice);
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
    openDialog(ui.overlay);
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
