// The bundle's card, under its group among your levels: the form that sets the
// bundle's title, author and notes and the order of its levels, takes a level
// out, saves the bundle as one file or takes it apart.
import { $, el } from "../viewer/ui/dom.js";
import { say } from "../viewer/chrome/a11y.js";
import { TEXT_MOST, TITLE_MOST } from "../format/project.js";
import { UNTITLED_BUNDLE } from "../format/bundle.js";
import { bundleName, bundleUnsaved, field, nameOf, saveBundle, some, twice } from "./levelcard.js";
import * as drafts from "./drafts.js";

const levelName = (l) => nameOf(drafts.get(l).doc);

// --- the form ------------------------------------------------------------------------------
/** The card's form for bundle `id` in `box`. */
export function buildBundleCard(id, box) {
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
  const levels = el("ol", { className: "levels" });
  levels.setAttribute("aria-label", "The bundle's levels in play order");

  const save = el("button", {
    type: "button",
    textContent: "save as a bundle",
    title: "Save the bundle, every level of it in order, as one file",
  });
  save.onclick = () => saveBundle(id);
  const apart = el("button", { type: "button" });
  const disarm = twice(apart, "take apart", "Keep the levels and forget the bundle", () => {
    const b = drafts.bundle(id);
    if (!b) return;
    const n = b.levels.length;
    $("draftNew").focus();
    drafts.removeBundle(id);
    say(
      `Took ${bundleName(b)} apart${n ? `, leaving its ${some(n, "level")} among your levels` : ""}.`,
    );
  });

  box.append(
    el("h3", { textContent: "Bundle" }),
    field("Title", title),
    field("Author", author),
    field("Notes", notes),
    levels,
    el("div", { className: "row" }, save, apart),
  );

  const set = (control, value) => {
    if (document.activeElement !== control) control.value = value;
  };
  return {
    sync(b) {
      set(title, b.title);
      set(author, b.author);
      set(notes, b.notes);
      save.disabled = !b.levels.length;
      save.classList.toggle("unsaved", bundleUnsaved(b));
      list(levels, id, b);
    },
    drop: disarm,
  };
}

// --- the levels in order -------------------------------------------------------------------
/** The rows for the levels in play order, built afresh, the keyboard kept on the row it was on. */
function list(ol, id, b) {
  const active = document.activeElement;
  const was = ol.contains(active)
    ? {
        level: active.closest("li").dataset.level,
        act: active.dataset.act,
        at: [...ol.children].indexOf(active.closest("li")),
      }
    : null;
  ol.replaceChildren(...b.levels.map((l, i) => row(id, l, i, b.levels.length)));
  if (was) refocus(ol, was);
}

function row(id, l, i, n) {
  const name = levelName(l);
  const button = (act, text, title, disabled) => {
    const b = el("button", { type: "button", textContent: text, title, disabled });
    b.dataset.act = act;
    b.onclick = () => ACTS[act](id, l);
    return b;
  };
  const li = el(
    "li",
    {},
    el("span", { className: "name", textContent: name }),
    button("up", "up", `Move ${name} up`, i === 0),
    button("down", "down", `Move ${name} down`, i === n - 1),
    button("out", "take out", `Take ${name} out of the bundle; the level stays`, false),
  );
  li.dataset.level = l;
  return li;
}

// The button pressed again where it still stands and still works, else the
// row's other button, else the row that took a gone row's place, else what
// follows the rows.
function refocus(ol, { level, act, at }) {
  const li = ol.querySelector(`li[data-level="${level}"]`);
  if (li) {
    const b = li.querySelector(`[data-act="${act}"]`);
    (b.disabled ? li.querySelector("button:enabled") : b).focus();
    return;
  }
  const rows = ol.children;
  const next = rows[Math.min(at, rows.length - 1)];
  (
    next?.querySelector(`[data-act="${act}"]`) ??
    ol.nextElementSibling.querySelector("button:enabled")
  )?.focus();
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
