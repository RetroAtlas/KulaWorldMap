import { $, on } from "./dom.js";
import { state } from "./state.js";
import { resize, onResize } from "./render.js";
import { loadJson, setAnnotations, setObjects } from "./data.js";
import { buildWorlds, buildKinds, wireDisplay, restore, setSidebar } from "./sidebar.js";
import { applyHash, selectLevel, writeHash } from "./navigate.js";
import { openModal } from "./modal.js";
import { wireSettings } from "./settings.js";
import { toast } from "./toast.js";
import { KEY, heldIn } from "./held.js";
import "./a11y.js";
import "./interaction.js";
import "./search.js";

setSidebar(innerWidth > 860);
restore();
wireSettings();

on("help", showHelp);
$("aboutBtn").onclick = showAbout;

const HELP = [
  ["drag", "turn the level"],
  ["shift-drag, right-drag, arrows", "pan"],
  ["wheel, pinch, `+` `−`", "zoom"],
  ["`q` `e`", "snap the turn to 45°"],
  ["`,` `.`", "lower and raise the slice"],
  ["`\\`", "put the whole level back"],
  ["`h`", "dim what the slice hides rather than take it off"],
  ["`[` `]`", "previous and next level"],
  ["`f`", "fit the level to the window"],
  ["`t` `o`", "textures, objects"],
  ["`d`", "objects as models"],
  ["`v`", "motion"],
  ["`x`", "see what stands on the far faces through the blocks"],
  ["`l`", "object labels"],
  ["`n`", "name in each label the face its object stands on"],
  [
    "`b`",
    "outlines: the blocks' edges, the broken outlines, the platforms' routes and the beams switched off",
  ],
  ["`g`", "ground grid"],
  ["`p`", "drag pans instead of turning"],
  ["`s`", "settings"],
  ["`c`", "start camera"],
  ["`/`", "search"],
  ["`m`", "show and hide the sidebar"],
  ["`w`", "edit the level, or make a copy of this one to edit"],
  ["`a` `z` `i`", "while editing: place, erase, select"],
  ["`j` `k`", "while editing: the next and the previous thing in the palette"],
  ["`1` to `9`", "while editing: a thing of the palette's shown group"],
  ["`r`", "while editing: turn what is selected, or what the next placement faces"],
  ["`Ctrl-Z` `Ctrl-Shift-Z`", "while editing: undo, redo"],
  ["`Delete`", "while editing: erase what is selected, its object first"],
  ["`Esc`", "close, or clear the selection"],
  ["`?`", "this list"],
];

function showHelp() {
  const caps = (keys) => keys.replace(/`(.+?)`/g, "<kbd>$1</kbd>");
  openModal(
    "Keyboard",
    `<dl>${HELP.map(([k, v]) => `<dt>${caps(k)}</dt><dd>${v}</dd>`).join("")}</dl>`,
  );
}

function showAbout() {
  const d = state.data;
  if (!d) return;
  openModal(
    "About this map",
    `<p>An unofficial fan project, unaffiliated with the rights holders in <em>Kula World</em>.
    Every level is read from the game's own data on the ${d.release} disc; the same game
    shipped as <em>Kula World</em> in PAL territories and as <em>Kula Quest</em> in Japan.</p>
    <p>Blocks wear the game's own textures, painted face by face and shaded as the game does
    it, and the objects are the game's own models in its own colours, standing on the faces the
    game puts them on and moving at its pace.</p>
    <p>The game never names its objects; the names here were settled against the game's data and
    in play, with Syonyx's Roll Away walkthrough (GameFAQs, 2006) as a guide. What the Japanese and
    PAL releases changed comes from The Cutting Room Floor's Roll Away page. Anything still
    unnamed shows the number the game gives it.</p>
    <p>You can make levels of your own: build them block by block on the map, keep them in this
    browser, save them as files, the map's own or the level the game loads, and put one on the
    game's disc as a patch an emulator applies. A level is packed for the disc with pako's deflate,
    used under <a href="js/vendor/pako-LICENSE.txt">its licence</a>.</p>
    <p><a href="https://github.com/RetroAtlas/KulaWorldMap">Source and tooling</a> &middot;
    <a href="https://retroatlas.org/">RetroAtlas</a> &middot;
    <a href="mailto:${["hello", "retroatlas.org"].join("@")}">Get in touch</a></p>`,
  );
}

// The editor, pako included, loads only when a level of your own is wanted:
// kept in this browser, linked to and held here, or asked for by the key or a
// control.
const UNLOADED = "The editor could not be loaded; reload the page to try again.";
const ELSEWHERE =
  "That link names a level kept in another browser. Open it there, or ask for the level file.";
let editor = null;
let loading = null;
let broken = false;
let toggling = false;

/** What the store holds, read off its text without the editor. */
function held() {
  let text = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    text = null;
  }
  return heldIn(text);
}

/** The draft a link names, or null. */
function linkedDraft(hash) {
  const m = /^#DRAFT\/(\d+)(?:\/|$)/i.exec(hash);
  return m ? Number(m[1]) : null;
}

function ready(module) {
  try {
    module.bootEditor();
  } catch {
    broken = true;
    return unloaded();
  }
  editor = module;
  return module;
}

function unloaded() {
  loading = null;
  toast(UNLOADED);
  return null;
}

// A fetch that failed is tried again; a boot that threw is not, since it may have half run.
const bootEditor = () =>
  broken ? Promise.resolve(unloaded()) : (loading ??= import("./editor.js").then(ready, unloaded));

const typing = (e) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox";

// Until the editor is up, its controls load it and then do what they do.
function wireEntry() {
  const entry = (id, fire) => {
    const el = $(id);
    const pre = () => bootEditor().then((m) => m && el[fire] !== pre && el[fire]());
    el[fire] = pre;
  };
  if (!editor) {
    for (const id of ["draftNew", "draftCopy", "draftOpen", "draftPaste", "draftExport"])
      entry(id, "onclick");
    entry("draftFile", "onchange");
  }
  $("makeBtn").onclick = () => bootEditor().then((m) => m?.toggleEditing());
  document.addEventListener(
    "keydown",
    (e) => {
      if (editor || e.key !== "w" || e.metaKey || e.ctrlKey || e.altKey || !state.lvl) return;
      if (typing(e) || document.querySelector(".modal:not([hidden])")) return;
      e.preventDefault();
      e.stopPropagation();
      if (toggling) return;
      toggling = true;
      bootEditor().then((m) => {
        toggling = false;
        m?.toggleEditing();
      });
    },
    { capture: true },
  );
}

// A link to a draft arriving after the boot is shown once the editor is up.
function followDraftLink() {
  const id = linkedDraft(location.hash);
  if (id === null || state.lvl?.draft === id) return;
  const { named, shaped } = held();
  if (!named.includes(id)) {
    toast(ELSEWHERE);
    return;
  }
  if (editor || !shaped.includes(id)) return;
  const link = location.hash;
  const shown = state.lvl;
  bootEditor().then((m) => {
    if (!m || state.lvl !== shown) return;
    if (location.hash !== link) history.replaceState(history.state, "", link);
    if (!applyHash()) writeHash();
  });
}

const kept = held();
const linked = linkedDraft(location.hash);
const wanted = kept.shaped.length > 0;

Promise.all([
  loadJson("map_data.json"),
  loadJson("annotations.json", {}),
  loadJson("objects.json", {}),
  wanted ? import("./editor.js").catch(() => null) : null,
]).then(([data, ann, objects, module]) => {
  if (!data) {
    $("chipLine").textContent = "The map's data could not be loaded.";
    return;
  }
  setAnnotations(ann);
  setObjects(objects);
  state.data = data;
  $("about").innerHTML =
    `All ${data.levels.length} levels across ${data.themes.length} worlds. ` +
    `Press <kbd style="margin:0">?</kbd> for the keys.`;
  buildWorlds();
  wireDisplay();
  const up = module && ready(module);
  if (up) loading = Promise.resolve(up);
  else if (wanted && !module) toast(UNLOADED);
  wireEntry();
  onResize(() => {
    if (!state.framing) return;
    state.framing();
    writeHash();
  });
  resize();
  if (!applyHash()) selectLevel(0);
  if (linked !== null && state.lvl?.draft !== linked && !kept.named.includes(linked))
    toast(ELSEWHERE);
  addEventListener("hashchange", followDraftLink);
  buildKinds();
});
