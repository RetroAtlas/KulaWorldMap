// The sidebar's "Your levels": the drafts this browser holds, and the card
// that edits the shown one.
import { $, el, on } from "./dom.js";
import { state } from "./state.js";
import { worldName, levelTitle } from "./data.js";
import { selectLevel, showLevel } from "./navigate.js";
import { say, describeLevel } from "./a11y.js";
import { TIME_MAX } from "./kwl.js";
import { UNTITLED, blank, fromLevel, setMeta, toLevel } from "./project.js";
import * as drafts from "./drafts.js";

const CONFIRM_MS = 4000;
const nameOf = (doc) => doc.title || UNTITLED;

// The disc's level shown last, which deleting the shown draft returns to.
let lastDisc = 0;
// The document the level on screen was drawn from, where it is a draft.
let drawn = null;
let form = null;

/** The level a link to a draft names, or null where this browser has none. */
export function levelFor(slot) {
  const m = /^DRAFT\/(\d+)$/.exec(slot);
  const d = m && drafts.get(Number(m[1]));
  if (!d) return null;
  drawn = d.doc;
  return toLevel(d.doc, Number(m[1]));
}

export function wireDrafts() {
  $("yours").hidden = false;
  $("draftNew").onclick = () => open(drafts.create(blank(state.lvl.theme)), "Made a new level");
  $("draftCopy").onclick = () => {
    const l = state.lvl;
    if (l.draft !== undefined) open(drafts.duplicate(l.draft), "Copied the level");
    else open(drafts.create(fromLevel(l)), `Copied ${levelTitle(l)}`);
  };
  on("drafts-changed", sync);
  on("level-changed", (i) => {
    if (i >= 0) lastDisc = i;
    sync();
  });
  on("level-updated", sync);
  sync();
}

function show(id, doc, opts) {
  drawn = doc;
  showLevel(toLevel(doc, id), opts);
}

function open(id, verb) {
  show(id, drafts.get(id).doc, { push: true });
  say(`${verb}. ${describeLevel(state.lvl)}`);
}

// The shown draft is drawn again whenever the store's copy of it is not the
// one on screen, whichever tab changed it, and gives way to the disc's level
// once it is gone.
function sync() {
  const id = state.lvl?.draft;
  const d = id === undefined ? null : drafts.get(id);
  if (id !== undefined && !d) {
    selectLevel(lastDisc);
    return;
  }
  if (d && d.doc !== drawn) {
    show(id, d.doc, { keepView: true, push: false, keep: state.selected?.key ?? null });
    return;
  }
  rows();
  card(id, d);
}

const status = (d) => {
  const base = d.saved === null ? "not saved to a file" : "saved to a file";
  if (!d.edits) return base;
  return `${base} · ${d.edits} change${d.edits === 1 ? "" : "s"}${d.saved === null ? "" : " since"}`;
};

function rows() {
  const box = $("draftRows");
  const focused = box.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  box.textContent = "";
  const all = drafts.list();
  $("draftEmpty").hidden = all.length > 0;
  for (const d of all) {
    const name = nameOf(d.doc);
    const b = el("button", { type: "button", title: `Show ${name}` });
    b.dataset.id = d.id;
    b.append(
      el("span", { className: "name", textContent: name }),
      el("span", { className: "tag", textContent: "Draft" }),
      el("span", { className: "state", textContent: status(d) }),
    );
    b.setAttribute("aria-current", state.lvl?.draft === d.id ? "true" : "false");
    b.onclick = () => show(d.id, drafts.get(d.id).doc, { push: true });
    box.append(b);
  }
  if (focused) box.querySelector(`[data-id="${focused}"]`)?.focus();
}

function card(id, d) {
  const box = $("draftCard");
  if (!d) {
    form?.drop();
    form = null;
    box.textContent = "";
    box.hidden = true;
    return;
  }
  if (form?.id !== id) {
    form?.drop();
    form = buildForm(id, box);
  }
  form.sync(d.doc);
  box.hidden = false;
}

function buildForm(id, box) {
  box.textContent = "";
  const edit = (meta) => {
    const d = drafts.get(id);
    if (d) drafts.update(id, setMeta(d.doc, meta));
  };
  const field = (text, control) => el("label", {}, el("span", { textContent: text }), control);

  const title = el("input", {
    id: "draftTitle",
    type: "text",
    placeholder: UNTITLED,
    autocomplete: "off",
    spellcheck: false,
    title: "The level's title",
  });
  title.oninput = () => edit({ title: title.value });

  const world = el("select", {
    id: "draftWorld",
    title: "The world whose artwork the level wears",
  });
  for (const t of state.data.themes)
    world.append(el("option", { value: t.id, textContent: worldName(t.id) }));
  world.onchange = () => edit({ world: world.value });

  const time = el("input", {
    id: "draftTime",
    type: "number",
    min: 1,
    max: TIME_MAX,
    step: 1,
    inputMode: "numeric",
    title: "The seconds the clock starts at",
  });
  time.onchange = () => {
    const v = Math.round(Number(time.value));
    if (time.value !== "" && v >= 1 && v <= TIME_MAX) edit({ time: v });
    else time.value = drafts.get(id)?.doc.time ?? "";
  };

  const hidden = el("input", { id: "draftHidden", type: "checkbox" });
  hidden.onchange = () => edit({ hidden: hidden.checked });
  const afar = el("input", { id: "draftAfar", type: "checkbox" });
  afar.onchange = () => edit({ invisibleFromAfar: afar.checked });

  const duplicate = el("button", {
    type: "button",
    textContent: "duplicate",
    title: "Make a copy of this level",
  });
  duplicate.onclick = () => open(drafts.duplicate(id), "Copied the level");

  const DELETE = "Delete this level from this browser";
  const del = el("button", { type: "button", textContent: "delete", title: DELETE });
  let armed = 0;
  const disarm = () => {
    clearTimeout(armed);
    armed = 0;
    del.textContent = "delete";
    del.title = DELETE;
    del.classList.remove("warn");
  };
  del.onclick = () => {
    if (!armed) {
      del.textContent = "delete?";
      del.title = "Press again to delete this level from this browser";
      del.classList.add("warn");
      armed = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    disarm();
    const name = nameOf(drafts.get(id).doc);
    $("draftNew").focus();
    drafts.remove(id);
    say(`Deleted ${name}. ${describeLevel(state.lvl)}`);
  };

  // The map's keys leave a focused list alone, as they do a field.
  box.onkeydown = (e) => {
    if (e.target.tagName === "SELECT") e.stopPropagation();
  };

  box.append(
    el("h3", { textContent: "Level" }),
    field("Title", title),
    field("World", world),
    field("Time", time),
    el("label", { className: "check" }, hidden, " Hidden level"),
    el("label", { className: "check" }, afar, " Invisible blocks show from far away"),
    el("div", { className: "row" }, duplicate, del),
  );

  const set = (control, value) => {
    if (document.activeElement !== control) control.value = value;
  };
  return {
    id,
    sync(doc) {
      set(title, doc.title);
      set(world, doc.world);
      set(time, String(doc.time));
      hidden.checked = !!doc.hidden;
      afar.checked = !!doc.invisibleFromAfar;
    },
    drop: disarm,
  };
}
