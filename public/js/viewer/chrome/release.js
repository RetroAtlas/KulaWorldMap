import { $, el, emit, on } from "../ui/dom.js";
import { state } from "../state.js";
import { current, releaseOf, releases, setCurrent } from "../release.js";
import { reshow, writeHash } from "./navigate.js";
import { describeLevel, say } from "./a11y.js";

const KEY = "kula.release";
const BASE = "us";
const LOCKED = "Leave play to change the release";
const WORDS = { us: "North American", eu: "PAL", jp: "Japanese" };

/** The word for a release's disc, or its region as the file gives it where the map has no word. */
export const discWord = (id) => WORDS[id] ?? releaseOf(id)?.region ?? id;

const nameOf = (r) => `${r.name}, the ${discWord(r.id)} release${r.serial ? ` (${r.serial})` : ""}`;

function kept() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function keep(id) {
  try {
    if (id === BASE) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

const buttons = () => $("release").querySelectorAll("button");

function reflect() {
  for (const b of buttons())
    b.setAttribute("aria-pressed", String(b.dataset.release === current()));
}

function choose(id) {
  if (id === current() || !releaseOf(id)) return;
  setCurrent(id);
  keep(id);
  reshow();
  writeHash(true);
  emit("release-changed", id);
  reflect();
  const r = releaseOf(id);
  say(`Showing ${r.name}, the ${discWord(id)} release. ${describeLevel(state.lvl)}`);
}

/** Build the bar from the releases that loaded, taking the kept choice where the link names no level. */
export function wireRelease() {
  const stored = kept();
  if (stored && /^#?$/.test(location.hash)) setCurrent(stored);
  const group = $("release");
  group.replaceChildren(
    ...releases().map((r) => {
      const b = el("button", { type: "button", textContent: r.label, title: nameOf(r) });
      b.setAttribute("aria-label", nameOf(r));
      b.dataset.release = r.id;
      b.onclick = () => choose(r.id);
      return b;
    }),
  );
  reflect();
  on("play-changed", (playing) => {
    for (const b of buttons()) b.disabled = playing;
    if (playing) group.title = LOCKED;
    else group.removeAttribute("title");
  });
}
