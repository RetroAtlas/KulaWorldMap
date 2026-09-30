import { $ } from "./dom.js";
import { state, camera } from "./state.js";
import { FACE_NAME, DIRECTION_NAME, skinsTable } from "./data.js";
import { FACES, shadeOf, litFace } from "./blocks.js";

// A block turned as the level is, shaded as the map shades a face, and named
// in the panel's words: each face turned to the view on the block, and
// beyond it, where each way points, every way the block leaves unnamed, up
// and down among them.

const cv = $("compass");
const g = cv.getContext("2d");

const EDGE = 0.4; // the block's edge, as a part of the compass's width
const TURNED = 0.25; // how far a face must turn to the view to hold its name
const GAP = 3;
const LINE = 11; // the height a name takes
const FONT = "600 11px ui-sans-serif, system-ui, sans-serif";
const SHADES = ["#3b465b", "#55637c", "#6d7d98"]; // the textures' dark, middle and bright
const EDGES = "rgba(223 230 242 / 0.55)";
const INK = "#dfe6f2";
const FAINT = "rgba(163 177 198 / 0.85)";
const HALO = "rgba(15 20 32 / 0.9)";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

let size = 0;
let painted = "";
// the names written so far in a paint, as boxes, so that a later one steps
// out of their way
let placed = [];

new ResizeObserver(() => {
  size = cv.clientWidth;
  drawCompass();
}).observe(cv);

/** Paint the compass for the view as it now stands, unless it already shows it. */
export function drawCompass() {
  const c = camera();
  const world = state.lvl?.theme;
  const textured = state.show.skins;
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const key = [c.yaw, c.pitch, world, textured, size, dpr, !!skinsTable()].join("/");
  if (!size || key === painted) return;
  painted = key;
  const px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) cv.width = cv.height = px;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, size, size);

  const mid = size / 2;
  const edge = EDGE * size;
  const on = (v) => [dot(v, c.right) * edge, -dot(v, c.up) * edge];
  const at = ([x, y]) => [mid + x, mid + y];
  const corners = FACES.flatMap((f) => f.c.map((v) => on(v.map((k) => k - 0.5))));
  placed = [];

  const faces = FACES.map((f, i) => ({ f, i, toward: dot(f.n, c.toward), way: on(f.n) }));
  for (const { f, i, toward } of faces) {
    if (toward <= 1e-6) continue;
    g.beginPath();
    for (const v of f.c) g.lineTo(...at(on(v.map((k) => k - 0.5))));
    g.closePath();
    g.fillStyle = textured ? SHADES[shadeOf(i, world)] : litFace(SHADES[1], i);
    g.fill();
    g.strokeStyle = EDGES;
    g.lineWidth = 1;
    g.lineJoin = "round";
    g.stroke();
  }
  // a side by the way it faces, as the panel names a side, and the top and
  // the underside by name
  const named = new Set();
  for (const { f, toward, way } of faces) {
    if (toward < TURNED) continue;
    const vertical = f.n[2] !== 0;
    write(vertical ? FACE_NAME[f.game] : DIRECTION_NAME[f.game], at(way.map((k) => k / 2)), INK);
    if (!vertical) named.add(f.game);
  }
  // those turned to the view first, so that they keep their places
  const ways = faces.filter(({ f }) => !named.has(f.game)).sort((a, b) => b.toward - a.toward);
  for (const { f, toward, way } of ways) {
    const len = Math.hypot(...way);
    if (len < 1e-3) continue; // straight into the view or out of it
    const u = way.map((k) => k / len);
    g.font = FONT;
    const w = g.measureText(DIRECTION_NAME[f.game]).width;
    const reach = Math.max(...corners.map((p) => p[0] * u[0] + p[1] * u[1]));
    const half = (Math.abs(u[0]) * w + Math.abs(u[1]) * LINE) / 2;
    const d = reach + GAP + half;
    write(DIRECTION_NAME[f.game], [mid + u[0] * d, mid + u[1] * d], toward > 0 ? INK : FAINT, u);
  }
}

/** Write a name centred at a point, inside the compass. Where it would cross
    one already written, it goes further along `u`, and failing that beside
    the one it crosses, on the side it leans to. */
function write(text, [x, y], colour, u = null) {
  g.font = FONT;
  const w = g.measureText(text).width;
  const inside = ([px, py]) => [
    Math.min(size - GAP - w / 2, Math.max(GAP + w / 2, px)),
    Math.min(size - GAP - LINE / 2, Math.max(GAP + LINE / 2, py)),
  ];
  const crossed = ([cx, cy]) =>
    placed.find((b) => Math.abs(b.x - cx) < (b.w + w) / 2 + 1 && Math.abs(b.y - cy) < LINE);
  let p = inside([x, y]);
  for (let step = 1; u && step <= 3 && crossed(p); step++) {
    p = inside([x + u[0] * 5 * step, y + u[1] * 5 * step]);
  }
  const hit = u && crossed(p);
  if (hit) {
    const by = (hit.w + w) / 2 + 2;
    const sides = [inside([hit.x + by, p[1]]), inside([hit.x - by, p[1]])];
    if (u[0] < 0) sides.reverse();
    p = sides.find((q) => !crossed(q)) ?? p;
  }
  placed.push({ x: p[0], y: p[1], w });
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.strokeStyle = HALO;
  g.strokeText(text, ...p);
  g.fillStyle = colour;
  g.fillText(text, ...p);
}
