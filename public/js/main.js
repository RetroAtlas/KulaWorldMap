import { $, el, on } from "./viewer/ui/dom.js";
import { state } from "./viewer/state.js";
import { resize, onResize } from "./viewer/draw/render.js";
import { loadJson, setAnnotations, setObjects, ballFor } from "./viewer/data.js";
import { iconFor } from "./viewer/draw/icons.js";
import {
  buildWorlds,
  buildKinds,
  wireDisplay,
  restore,
  setSidebar,
} from "./viewer/chrome/sidebar.js";
import { applyHash, selectLevel, writeHash } from "./viewer/chrome/navigate.js";
import { onShow } from "./viewer/chrome/detail.js";
import { probeOf } from "./viewer/walk.js";
import { FACE_NAME } from "./format/lattice.js";
import { wireCourse } from "./viewer/chrome/course.js";
import { openModal } from "./viewer/ui/modal.js";
import { wireSettings } from "./viewer/ui/settings.js";
import { toast } from "./viewer/ui/toast.js";
import { KEY, heldIn } from "./format/held.js";
import { warm } from "./viewer/draw/atlas.js";
import "./viewer/chrome/a11y.js";
import "./viewer/chrome/interaction.js";
import "./viewer/chrome/search.js";

setSidebar(innerWidth > 860);
restore();
wireSettings();

on("help", showHelp);
$("aboutBtn").onclick = () => showAbout($("aboutBtn"));

const HELP = [
  ["drag", "turn the level"],
  ["shift-drag, right-drag, arrows", "pan"],
  ["wheel, pinch, `+` `−`", "zoom"],
  ["`q` `e`", "snap the turn to 45°"],
  [
    "`,` `.`",
    "lower and raise the slice; while editing with the grid on, the height a floor is laid at",
  ],
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
  ["`g`", "ground grid; while editing, a floor to lay blocks on, at the slice where it is lowered"],
  ["`p`", "drag pans instead of turning"],
  ["`u`", "route planner: click the faces the ball should visit, in order"],
  ["`Backspace`", "with the route planner on and nothing selected: take the last stop back"],
  ["`y`", "roll the ball through the level"],
  [
    "arrows",
    "while playing: roll the ball ahead for as long as held, turn it left and right, turn it about",
  ],
  ["`s`", "settings"],
  ["`c`", "start camera"],
  ["`/`", "search"],
  ["`m`", "show and hide the sidebar"],
  ["`w`", "edit the level, or make a copy of this one to edit"],
  ["`a` `z` `i`", "while editing: place, erase, select"],
  ["shift-click", "while editing: erase, from any tool"],
  ["right-click, long press", "while editing: select, from any tool"],
  ["alt-click", "while editing: take what is under the pointer as the brush"],
  ["tap, then tap the same face again", "while editing on a touch screen: place or erase"],
  ["`j` `k`", "while editing: the next and the previous thing in the palette"],
  ["`1` to `9`", "while editing: a thing of the palette's shown group"],
  [
    "`r` `Shift-r`",
    "while editing: turn what is selected, or what the next placement faces, a quarter turn each way",
  ],
  ["`Ctrl-Z` or `Cmd-Z`", "while editing: undo"],
  ["`Ctrl-Shift-Z`, `Cmd-Shift-Z` or `Ctrl-Y`", "while editing: redo"],
  [
    "`Delete` `Backspace`",
    "while editing: erase what is selected, its object first, or every selected block",
  ],
  [
    "drag from empty space, with Select",
    "while editing: select the blocks in a rectangle; drag one of them to move them all, Shift-drag to lift",
  ],
  ["`Shift-arrows`", "while editing with blocks selected: move them a cell along the ground"],
  [
    "`Shift-PageUp` `Shift-PageDown`",
    "while editing with blocks selected: move them a cell up and down",
  ],
  [
    "`Esc`",
    "close, or clear the selection; while editing, clear the selected blocks or cancel a waiting run first; while playing, leave",
  ],
  ["`?`", "this list"],
];

function showHelp() {
  const caps = (keys) => keys.replace(/`(.+?)`/g, "<kbd>$1</kbd>");
  openModal(
    "Keyboard",
    `<dl>${HELP.map(([k, v]) => `<dt>${caps(k)}</dt><dd>${v}</dd>`).join("")}</dl>`,
  );
}

function showAbout(opener) {
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
    opener,
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
  broken
    ? Promise.resolve(unloaded())
    : (loading ??= import("./editor/editor.js").then(ready, unloaded));

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

// Play loads only when the ball is asked for, by its key, the corner's button
// or a block's panel.
const UNPLAYABLE = "Play could not be loaded; reload the page to try again.";
let play = null;
let playLoading = null;
let playBroken = false;
let playToggling = false;

function playReady(module) {
  try {
    module.bootPlay();
  } catch {
    playBroken = true;
    return unplayable();
  }
  play = module;
  return module;
}

function unplayable() {
  playLoading = null;
  toast(UNPLAYABLE);
  return null;
}

const bootPlay = () =>
  playBroken
    ? Promise.resolve(unplayable())
    : (playLoading ??= import("./play/play.js").then(playReady, unplayable));

// Until play is up, its key, its button and the panel's load it and then do what they do.
function wirePlay() {
  const btn = $("playBtn");
  const icon = () => {
    const model = state.lvl && ballFor(state.lvl);
    btn.replaceChildren(model ? iconFor(model, 22) : "");
  };
  on("level-changed", icon);
  on("density-changed", icon);
  on("play-changed", (playing) => btn.setAttribute("aria-pressed", String(playing)));
  btn.onclick = () => bootPlay().then((m) => m?.togglePlay());
  onShow((box, c) => {
    if (c?.face == null || c.k !== undefined) return;
    if (!probeOf(state.idx).standable([c.x, c.y, c.z], c.face)) return;
    const put = el("button", {
      type: "button",
      textContent: "Put the ball here",
      title: `Stand the ball on the ${FACE_NAME[c.face]} of this block and roll it from there`,
    });
    put.onclick = () => bootPlay().then((m) => m?.playAt({ x: c.x, y: c.y, z: c.z, face: c.face }));
    $("detailBody").prepend(el("p", { className: "put" }, put));
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (play || e.key !== "y" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!state.lvl || typing(e) || document.querySelector(".modal:not([hidden])")) return;
      e.preventDefault();
      e.stopPropagation();
      if (playToggling) return;
      playToggling = true;
      bootPlay().then((m) => {
        playToggling = false;
        m?.togglePlay();
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
// A link to a draft held here has nothing to show before the editor is up, so
// the boot waits for it; otherwise the editor comes once the map has drawn.
const awaited = linked !== null && kept.shaped.includes(linked);

Promise.all([
  loadJson("map_data.json"),
  loadJson("annotations.json", {}),
  loadJson("objects.json", {}),
  awaited ? import("./editor/editor.js").catch(() => null) : null,
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
  wireCourse();
  const up = module && ready(module);
  if (up) loading = Promise.resolve(up);
  else if (awaited && !module) toast(UNLOADED);
  wireEntry();
  wirePlay();
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
  if (wanted && !awaited) bootEditor();
  warmOthers();
});

// Once the shown world's textures have landed and the page is idle, the other
// worlds' are fetched ahead, from the next world on, unless the browser is
// set to save data.
function warmOthers() {
  if (navigator.connection?.saveData) return;
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 2000));
  let started = false;
  on("atlas-loaded", (world) => {
    if (started || world !== state.lvl?.theme) return;
    started = true;
    const ids = state.data.themes.map((t) => t.id);
    const from = ids.indexOf(world) + 1;
    idle(() => warm([...ids.slice(from), ...ids.slice(0, from)]));
  });
}
