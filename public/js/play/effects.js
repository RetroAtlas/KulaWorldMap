// The game's bursts: the particles the rules resolved this pass, each a sprite of the sheet on a
// square turned by its angle and added to the frame, and a world effect's light on the faces
// about the pickup, cast as a device's is.
import { BLOCK, screen, state } from "../viewer/state.js";
import { blockUnits, motionTable, sparksSheet } from "../viewer/data.js";
import { lightsWith } from "../viewer/draw/lights.js";
import { drawSoon } from "../viewer/draw/render.js";
import { effectLights, particlesOf } from "./passes.js";

// the HUD's points the map has a place for; it has none for the icons
const PLACED = new Set(["teleport"]);
const SHEET = "tex/sparks.png";

let source = () => null;
let sheet = null;

/** Let `fn()` give the run whose effects the frame draws and lights, or null for none. */
export function effectsWith(fn) {
  source = fn;
}

lightsWith(() => {
  const run = source();
  return run ? effectLights(run) : null;
});

// The sheet is fetched as the first particle needs it, and the frame drawn again as it lands.
function sheetOf() {
  if (!sheet) {
    sheet = new Image();
    sheet.addEventListener("load", drawSoon);
    sheet.src = SHEET;
  }
  return sheet.naturalWidth ? sheet : null;
}

const shows = (p) =>
  p.brightness > 0 && p.size !== 0 && (p.icon === null || (p.at !== null && PLACED.has(p.icon)));

/** The particles the pass drew, added over the frame: a world particle where the camera puts its
    place, its size in 16ths of a unit at the map's zoom, a HUD particle at its point and size
    scaled from the game's screen to the canvas, nothing before the sheet has landed. */
export function drawEffects(ctx) {
  const run = source();
  if (!run) return;
  const particles = particlesOf(run).filter(shows);
  if (!particles.length) return;
  const img = sheetOf();
  if (!img) return;
  const { effects, play, turn } = motionTable();
  const { side } = sparksSheet() ?? {};
  if (!side) return;
  const unit = blockUnits();
  const across = state.view.w / play.screen.wide;
  const down = state.view.h / play.screen.high;
  const perBlock = state.cam.zoom * BLOCK;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    let x, y, reach;
    if (p.icon === null) {
      [x, y] = screen(...p.at.map((v) => v / unit + 0.5));
      reach = (p.size / effects.size.world / unit) * perBlock;
    } else {
      [x, y] = [p.at[0] * across, p.at[1] * down];
      reach = (p.size / effects.size.hud) * Math.min(across, down);
    }
    const alpha = p.brightness / effects.sprites.full;
    ctx.save();
    ctx.translate(x, y);
    // the sprite's first corner lies at the angle, the reach from the middle, or the side's length
    // from its third corner, which lies at the point where the reach is below nothing
    if (reach >= 0) {
      const s = reach * Math.SQRT2;
      ctx.rotate((p.angle / turn + 3 / 8) * 2 * Math.PI);
      lay(ctx, img, p.sprite * side, side, -s / 2, -s / 2, s, alpha);
    } else {
      ctx.rotate((p.angle / turn + 1 / 4) * 2 * Math.PI);
      lay(ctx, img, p.sprite * side, side, 0, reach, -reach, alpha);
    }
    ctx.restore();
  }
  ctx.restore();
}

// A sprite of the sheet on the square of side `s` whose top left is at `x`, `y`, added at `alpha`,
// and again for each whole over one.
function lay(ctx, img, sx, side, x, y, s, alpha) {
  for (let a = alpha; a > 0; a -= 1) {
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(img, sx, 0, side, side, x, y, s, s);
  }
}
