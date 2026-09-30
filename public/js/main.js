import { $, on } from "./dom.js";
import { state } from "./state.js";
import { resize, onResize } from "./render.js";
import { loadJson, setAnnotations, setObjects } from "./data.js";
import { buildWorlds, buildKinds, wireDisplay, restore, setSidebar } from "./sidebar.js";
import { applyHash, selectLevel, writeHash } from "./navigate.js";
import { openModal } from "./modal.js";
import { wireSettings } from "./settings.js";
import "./a11y.js";
import "./interaction.js";
import "./search.js";

// Open beside the map where there is room for both, closed where it would
// float over what it is for.
setSidebar(innerWidth > 860);
restore();
wireSettings();

on("help", showHelp);
$("aboutBtn").onclick = showAbout;

const HELP = [
  ["drag", "turn the level"],
  ["shift-drag, right-drag, arrows", "pan"],
  ["wheel, pinch, + −", "zoom"],
  ["q e", "snap the turn to 45°"],
  [", .", "lower and raise the slice"],
  ["\\", "put the whole level back"],
  ["h", "dim what the slice hides rather than take it off, while the slice cuts"],
  ["[ ]", "previous and next level, on from one world into the next"],
  ["f", "fit the level to the window"],
  ["t o", "textures, objects"],
  ["d", "objects as models, with objects on"],
  ["v", "motion: everything moving as in play, or the level held still as it starts"],
  ["x", "see what stands on the far faces through the blocks, with objects on"],
  ["l", "object labels, with objects on"],
  ["n", "name in each label the face its object stands on, with labels on"],
  [
    "b",
    "outlines: the blocks' edges, the broken outlines, the platforms' routes and the beams switched off",
  ],
  ["g", "ground grid"],
  ["p", "drag pans instead of turning"],
  ["s", "settings"],
  ["c", "camera target, in the settings"],
  ["/", "search"],
  ["m", "show and hide the sidebar"],
  ["Esc", "close, or clear the selection"],
  ["?", "this list"],
];

function showHelp() {
  openModal("Keyboard", `<dl>${HELP.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`);
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
    <p><a href="https://github.com/RetroAtlas/KulaWorldMap">Source and tooling</a> &middot;
    <a href="https://retroatlas.org/">RetroAtlas</a></p>`,
  );
}

Promise.all([
  loadJson("map_data.json"),
  loadJson("annotations.json", {}),
  loadJson("objects.json", {}),
]).then(([data, ann, objects]) => {
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
  onResize(() => {
    if (!state.framing) return;
    state.framing();
    writeHash();
  });
  resize();
  if (!applyHash()) selectLevel(0);
  buildKinds();
});
