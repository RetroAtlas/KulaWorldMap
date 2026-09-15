import { $, on } from "./dom.js";
import { state } from "./state.js";
import { resize, onFirstSize } from "./render.js";
import { loadJson, setAnnotations, setObjects } from "./data.js";
import { buildWorlds, buildKinds, wireDisplay, restore, setSidebar } from "./sidebar.js";
import { applyHash, selectLevel, fit, chip, writeHash } from "./navigate.js";
import { openModal } from "./modal.js";
import "./a11y.js";
import "./interaction.js";
import "./search.js";

// Open beside the map where there is room for both, closed where it would
// float over what it is for.
setSidebar(innerWidth > 860);
restore();

on("help", showHelp);
$("aboutBtn").onclick = showAbout;

const HELP = [
  ["drag", "turn the level"],
  ["shift-drag, right-drag, arrows", "pan"],
  ["wheel, pinch, + −", "zoom"],
  ["q e", "snap the turn to 45°"],
  [", .", "lower and raise the slice"],
  ["\\", "put the whole level back"],
  ["[ ]", "previous and next level (shift crosses worlds)"],
  ["f", "fit the level to the window"],
  ["t o d s l g", "textures, objects, objects as themselves, look-at, labels, ground grid"],
  ["/", "search"],
  ["m", "show and hide the sidebar"],
  ["Esc", "clear the selection"],
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
    Every level here is read from the game's own data on the ${d.release} disc: the
    ${d.side}&times;${d.side}&times;${d.side} lattice each level is built in, and the records the
    engine attaches to individual blocks.</p>
    <p>Blocks wear the game's own textures, lifted from each world's artwork file, in the three
    brightness levels the game itself ships them pre-shaded with, one per face orientation. The
    objects are the game's own meshes in the game's own colours, stood on the face each one
    stands on; which texture a block carrying an object wears is not decoded, so those draw the
    world's plain stone.</p>
    <p>Objects are the game's own numbers, because the game names none of them. Names appear
    here as they are identified and curated in <code>annotations.json</code>.</p>
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
    $("chip").textContent = "map_data.json failed to load";
    return;
  }
  setAnnotations(ann);
  setObjects(objects);
  state.data = data;
  const cells = data.levels.reduce((n, l) => n + l.cells.length / 4, 0);
  $("about").innerHTML =
    `${data.levels.length} levels across ${data.themes.length} worlds, ` +
    `${cells.toLocaleString()} placed blocks, read off the ${data.release} disc. ` +
    `Press <kbd style="margin:0">?</kbd> for the keys.`;
  buildWorlds();
  wireDisplay();
  onFirstSize(() => {
    fit();
    chip();
    writeHash();
  });
  resize();
  if (!applyHash()) selectLevel(0);
  buildKinds();
});
