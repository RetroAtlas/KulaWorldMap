// The bundle's card: the form that sets the bundle's title, author and notes
// and the order of its levels, saves the bundle, takes a level out or takes
// the bundle apart, and the button that saves a bundle wherever it stands.
import { $, el } from "../viewer/ui/dom.js";
import { say } from "../viewer/chrome/a11y.js";
import { TEXT_MOST, TITLE_MOST } from "../format/project.js";
import { UNTITLED_BUNDLE } from "../format/bundle.js";
import {
  bundleName,
  captioned,
  field,
  nameOf,
  saveBundle,
  some,
  twice,
  unsavedIn,
} from "./levelcard.js";
import { bundleLine } from "./draftwords.js";
import * as drafts from "./drafts.js";

const SAVE = "Save the bundle, every level of it in order, as one file";

const levelName = (l) => nameOf(drafts.get(l).doc);

// --- the save ------------------------------------------------------------------------------
/** A button that saves bundle `id`, with what brings it up to date: greyed while the bundle holds no level, and wearing the dot while a level of it is not saved to a file. */
export function saveButton(id) {
  const button = el("button", { type: "button", textContent: "save the bundle", title: SAVE });
  button.onclick = () => saveBundle(id);
  return {
    button,
    sync(b) {
      button.disabled = !b.levels.length;
      button.classList.toggle("unsaved", unsavedIn(b) > 0);
    },
  };
}

// --- the form ------------------------------------------------------------------------------
/** The card's form for bundle `id` in `box`, with `choose`, which shows a level of the bundle. */
export function buildBundleCard(id, box, choose) {
  box.textContent = "";
  /** Typing into `control` writes `key` of the bundle. */
  const typed = (control, key) => {
    control.oninput = () => {
      if (drafts.bundle(id)) drafts.updateBundle(id, { [key]: control.value });
    };
  };

  const title = el("input", {
    className: "title",
    type: "text",
    placeholder: UNTITLED_BUNDLE,
    maxLength: TITLE_MOST,
    autocomplete: "off",
    spellcheck: false,
    title: "The bundle's title, which names its file",
  });
  typed(title, "title");
  const author = el("input", {
    className: "author",
    type: "text",
    maxLength: TITLE_MOST,
    autocomplete: "off",
    spellcheck: false,
    title: "Your name, shown with the bundle wherever it goes",
  });
  typed(author, "author");
  const notes = el("textarea", {
    className: "notes",
    rows: 3,
    maxLength: TEXT_MOST,
    title: "A few words about the bundle, shown with it wherever it goes",
  });
  typed(notes, "notes");
  const state = el("p", { className: "state" });
  const save = saveButton(id);
  const caption = el("p", {
    id: "bundleOrder",
    className: "order",
    textContent: "Levels, in play order",
  });
  const levels = el("ol", { className: "levels" });
  levels.setAttribute("aria-labelledby", caption.id);

  const apart = el("button", { className: "quiet far", type: "button" });
  const disarm = twice(apart, "take apart", "Keep the levels and forget the bundle", () => {
    const b = drafts.bundle(id);
    if (!b) return;
    const n = b.levels.length;
    drafts.removeBundle(id);
    $("draftNew").focus();
    say(
      `Took ${bundleName(b)} apart${n ? `, leaving its ${some(n, "level")} among your levels` : ""}.`,
    );
  });

  box.append(
    el("h3", { id: "bundleCardHeading", textContent: "Bundle" }),
    field("Title", title),
    state,
    captioned("bundleFileCaption", "File", save.button),
    field("Author", author),
    field("Notes", notes),
    caption,
    levels,
    el("div", { className: "row last" }, apart),
  );

  const set = (control, value) => {
    if (document.activeElement !== control) control.value = value;
  };
  return {
    id,
    sync(b, shown) {
      set(title, b.title);
      set(author, b.author);
      set(notes, b.notes);
      state.textContent = bundleLine(b.levels.length, unsavedIn(b));
      save.sync(b);
      caption.hidden = !b.levels.length;
      list(levels, id, b, shown, choose);
    },
    drop: disarm,
  };
}

// --- the levels in order -------------------------------------------------------------------
/** The rows for the levels in play order, built afresh, the name of the level `shown` on screen marked as the current one and the keyboard kept on the row it was on. */
function list(ol, id, b, shown, choose) {
  const active = document.activeElement;
  const was = ol.contains(active)
    ? {
        level: active.closest("li").dataset.level,
        act: active.dataset.act,
        at: [...ol.children].indexOf(active.closest("li")),
      }
    : null;
  ol.replaceChildren(
    ...b.levels.map((l, i) => row(id, l, i, b.levels.length, l === shown, choose)),
  );
  if (was) refocus(ol, was);
}

function row(id, l, i, n, current, choose) {
  const name = levelName(l);
  const link = el("button", {
    className: "name linkish",
    type: "button",
    textContent: name,
    title: `Show ${name}`,
  });
  if (current) link.setAttribute("aria-current", "true");
  link.onclick = () => choose(l);
  const button = (act, text, title, disabled) => {
    const b = el("button", { type: "button", textContent: text, title, disabled });
    b.dataset.act = act;
    b.onclick = () => ACTS[act](id, l);
    return b;
  };
  const li = el(
    "li",
    {},
    el("span", { className: "num", textContent: String(i + 1) }),
    link,
    button("up", "up", `Move ${name} up`, i === 0),
    button("down", "down", `Move ${name} down`, i === n - 1),
    button("out", "take out", `Take ${name} out of the bundle; the level stays`, false),
  );
  li.dataset.level = l;
  return li;
}

// The button that held the focus where it still stands and still works, else
// the row's first button with an act that works, else the row that took a
// gone row's place, else what follows the rows. A level's name is the row's
// one button with no act.
function refocus(ol, { level, act, at }) {
  const held = act ? `[data-act="${act}"]` : ".name";
  const li = ol.querySelector(`li[data-level="${level}"]`);
  if (li) {
    const b = li.querySelector(held);
    (b.disabled ? li.querySelector("[data-act]:enabled") : b).focus();
    return;
  }
  const rows = ol.children;
  const next = rows[Math.min(at, rows.length - 1)];
  (next?.querySelector(held) ?? ol.nextElementSibling.querySelector("button:enabled"))?.focus();
}

/** Move level `l` of bundle `id` by `by` places, saying where it then stands. */
function move(id, l, by) {
  const b = drafts.bundle(id);
  const i = b ? b.levels.indexOf(l) : -1;
  const j = i + by;
  if (i < 0 || j < 0 || j >= b.levels.length) return;
  const levels = [...b.levels];
  [levels[i], levels[j]] = [levels[j], levels[i]];
  drafts.updateBundle(id, { levels });
  say(`Moved ${levelName(l)} ${by < 0 ? "up" : "down"}, to level ${j + 1} of ${levels.length}.`);
}

function out(id, l) {
  const b = drafts.bundle(id);
  if (!b || !b.levels.includes(l)) return;
  const [name, bundle] = [levelName(l), bundleName(b)];
  drafts.updateBundle(id, { levels: b.levels.filter((x) => x !== l) });
  say(`Took ${name} out of ${bundle}.`);
}

const ACTS = { up: (id, l) => move(id, l, -1), down: (id, l) => move(id, l, 1), out };
