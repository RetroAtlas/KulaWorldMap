import { $, on } from "./dom.js";
import { state } from "./state.js";
import { resize, onFirstSize } from "./render.js";
import { loadJson, setAnnotations } from "./data.js";
import { buildWorlds, buildKinds, wireDisplay, restore } from "./sidebar.js";
import { applyHash, selectLevel, fit, chip, writeHash } from "./navigate.js";
import "./interaction.js";
import "./search.js";

if (innerWidth > 860) document.body.classList.add("sidebar-open");
$("menuBtn").setAttribute(
  "aria-expanded",
  String(document.body.classList.contains("sidebar-open")),
);
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
  ["o s l g", "objects, start, labels, ground grid"],
  ["/", "search"],
  ["m", "show and hide the sidebar"],
  ["Esc", "clear the selection"],
  ["?", "this list"],
];

function showHelp() {
  const box = $("help");
  box.innerHTML = `<div class="box"><h3>Keyboard</h3><dl>${HELP.map(
    ([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`,
  ).join("")}</dl></div>`;
  box.hidden = false;
  box.onclick = () => {
    box.hidden = true;
  };
}

function showAbout() {
  const d = state.data;
  const box = $("help");
  box.innerHTML = `<div class="box"><h3>About this map</h3>
    <p>An unofficial fan project, unaffiliated with the rights holders in <em>Kula World</em>.
    Every level here is read from the game's own data on the ${d.release} disc: the
    ${d.side}&times;${d.side}&times;${d.side} lattice each level is built in, and the records the
    engine attaches to individual blocks.</p>
    <p>The artwork is not decoded. Blocks are drawn in a stand-in palette per world, so the shape,
    the objects and the routes are the game's and the colours are not.</p>
    <p>Object kinds are the game's own numbers, because the game names none of them. Names appear
    here as they are identified and curated in <code>annotations.json</code>.</p>
    <p><a href="https://github.com/RetroAtlas/KulaWorldMap">Source and tooling</a> ·
    <a href="https://retroatlas.org/">RetroAtlas</a></p></div>`;
  box.hidden = false;
  box.onclick = () => {
    box.hidden = true;
  };
}

Promise.all([loadJson("map_data.json"), loadJson("annotations.json", {})]).then(([data, ann]) => {
  if (!data) {
    $("chip").textContent = "map_data.json failed to load";
    return;
  }
  setAnnotations(ann);
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
