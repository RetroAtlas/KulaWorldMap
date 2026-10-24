// The pill's screen and the flash on the canvas: the last frame as a ghost over the scene while
// the lethargy pill works, kept tinted for the next pass, the white glow as it fades, and the
// flash's quad added over everything.
import { state } from "../viewer/state.js";
import { motionTable } from "../viewer/data.js";
import { LETHARGY, SCREEN } from "./passes.js";

// the ghost's blend takes half of the last frame and half of the scene
const HALF = 0.5;
// a channel's full byte, the unit the flash's strength is in
const BYTE = 255;

// the frame as last displayed while the pill works, tinted, for the ghost, on a canvas made as
// the first is kept
let lastCv = null;
let lastCtx = null;

const motionOn = () => state.show.motion;
const pillTable = () => motionTable().types[String(LETHARGY)].lasts;

/** The pill's screen, as the game's draw of the pass showed it: the flash on the pill's own pass,
    the last frame as a ghost at half strength over the scene on each pass the pill works and on
    the end's pass, and the white glow at the fade's level on each pass after; the frame drawn is
    kept, tinted, for the next pass's ghost. `ran` says whether a pass ran since the frame hook
    last drew and `lit` whether the pass last run took the pill. */
export function screened(ctx, live, { ran, lit }) {
  if (!live || live.run.words.screen === SCREEN.off) {
    if (lastCv) sized(lastCv, 0, 0);
    return;
  }
  const w = live.run.words;
  const { grey, tint, fade } = pillTable().screen;
  const { w: width, h: height } = state.view;
  const ghost = w.screen === SCREEN.ghost;
  ctx.save();
  if (ghost && lit) glow(ctx, grey, grey, width, height);
  else if (ghost || w.fade === fade.from) {
    ctx.globalAlpha = HALF;
    if (lastCv?.width) ctx.drawImage(lastCv, 0, 0, width, height);
  } else glow(ctx, w.fade, grey, width, height);
  ctx.restore();
  if (ran && ghost) kept(ctx.canvas, tint, grey);
}

/** The flash's quad, as the game's draw lays it over everything: white added to the whole screen
    at the strength the pass left, a byte a channel, on every frame it is above nothing with
    Motion on; with it off the words run and nothing is drawn. */
export function flashing(ctx, live) {
  const strength = live?.run.words.flash ?? 0;
  if (strength <= 0 || !motionOn()) return;
  const { w: width, h: height } = state.view;
  ctx.save();
  glow(ctx, strength, BYTE, width, height);
  ctx.restore();
}

// A white quad added to the whole screen at `level` over `full`, the texel as it is.
function glow(ctx, level, full, width, height) {
  if (level <= 0) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = level / full;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
}

// The canvas kept for the ghost, tinted by the table's colour over its grey.
function kept(cv, tint, grey) {
  if (!lastCv) {
    lastCv = document.createElement("canvas");
    lastCtx = lastCv.getContext("2d");
  }
  sized(lastCv, cv.width, cv.height);
  lastCtx.setTransform(1, 0, 0, 1, 0, 0);
  lastCtx.globalCompositeOperation = "copy";
  lastCtx.drawImage(cv, 0, 0);
  lastCtx.globalCompositeOperation = "multiply";
  lastCtx.fillStyle = `rgb(${tint.map((v) => Math.round((v * BYTE) / grey)).join(" ")})`;
  lastCtx.fillRect(0, 0, lastCv.width, lastCv.height);
}

function sized(cv, w, h) {
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
}
