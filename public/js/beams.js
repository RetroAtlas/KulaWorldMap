import { state, screen, effectsOn } from "./state.js";
import { kindMotion, litNow, circuitColour } from "./data.js";
import { seed } from "./hash.js";
import { outlineStroke } from "./blocks.js";

const BEAM_KIND = 8;
const BLOCK = 512; // the game's units to a block
const INK = [232, 238, 251];
const DARK_DASH = [5, 3]; // at a zoom of one
const DARK_ALPHA = 0.85;
const WHITE = [8, 8, 8]; // a colour for a circuit the game gives none
// Which side of the axis each of the four lines sits, on the two axes across it.
const SIDES = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// A beam is laid a cell at a time, from the face it comes in by to the face
// it leaves by, so that it runs between the faces of its end blocks and each
// stretch takes its place among the blocks. Each of its four lines is two
// flat quads crossed along it and a line down their middle, added to what is
// behind, in its circuit's channels times a level the line steps through on
// its own, from a start the game draws at random and the map hashes from the
// beam's first cell. A dark beam, which the game does not draw, is one of the
// map's outlines: a broken line down its middle in the colour the map gives
// its circuit, its dashes carried across the cells so it reads as one line.

/** Draws the stretches of beam through one cell, and says whether any is to
    change by the next frame. */
export function drawBeams(ctx, c, ghost, frame) {
  const beam = kindMotion(BEAM_KIND);
  let live = false;
  for (const { ray, k } of c.beams) {
    const lit = litNow(ray);
    if (!lit && !state.show.outlines) continue;
    const [u, v] = [0, 1, 2].filter((i) => i !== ray.axis);
    const centre = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
    const at = (t, du, dv) => {
      const p = [...centre];
      p[ray.axis] += t;
      p[u] += du;
      p[v] += dv;
      return screen(...p);
    };
    const reach = (beam?.reach ?? BLOCK / 2) / BLOCK;
    const [p, q] = [at(-reach, 0, 0), at(reach, 0, 0)];
    ctx.save();
    ctx.globalAlpha = ghost ? 0.16 : 1;
    if (!lit) {
      outlineStroke(ctx, circuitColour(ray.colour) ?? `rgb(${INK.join(" ")})`, DARK_DASH);
      ctx.globalAlpha *= DARK_ALPHA;
      ctx.lineDashOffset = k * Math.hypot(q[0] - p[0], q[1] - p[1]);
      line(ctx, p, q);
      ctx.restore();
      continue;
    }
    if (!beam) {
      ctx.strokeStyle = `rgb(${INK.join(" ")})`;
      ctx.lineWidth = Math.max(1, 1.2 * state.cam.zoom);
      line(ctx, p, q);
      ctx.restore();
      continue;
    }
    live = true;
    const nozzle = (beam.nozzle ?? 0) / BLOCK;
    const half = (beam.width ?? 0) / 2 / BLOCK;
    ctx.globalCompositeOperation = beam.add ? "lighter" : "source-over";
    ctx.lineWidth = 1;
    SIDES.forEach(([su, sv], n) => {
      // held still, every line stands at its brightest
      const level = effectsOn()
        ? beam.levels[(seed(...ray.a, n) + Math.floor(frame) * beam.step) % beam.levels.length]
        : Math.max(...beam.levels);
      const colour = `rgb(${tint(beam, ray, level).join(" ")})`;
      const du = su * nozzle,
        dv = sv * nozzle;
      ctx.fillStyle = colour;
      ctx.strokeStyle = colour;
      quad(ctx, [
        at(reach, du, dv + half),
        at(reach, du, dv - half),
        at(-reach, du, dv - half),
        at(-reach, du, dv + half),
      ]);
      quad(ctx, [
        at(reach, du + half, dv),
        at(reach, du - half, dv),
        at(-reach, du - half, dv),
        at(-reach, du + half, dv),
      ]);
      line(ctx, at(-reach, du, dv), at(reach, du, dv));
    });
    ctx.restore();
  }
  return live;
}

const tint = (beam, ray, level) =>
  (beam.colours[ray.colour] ?? WHITE).map((m) => Math.min(255, m * level));

function line(ctx, p, q) {
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  ctx.lineTo(q[0], q[1]);
  ctx.stroke();
}

function quad(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
