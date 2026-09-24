import { state, screen } from "./state.js";

// A laser's circuit number, in the colour the game paints that circuit. Which
// is which was read off LEVEL 109, whose five beams line up red, yellow,
// green, yellow, red, and LEVEL 98, whose blue switch carries the number of
// the beam it turns off; a circuit not yet seen in play has no entry.
const BEAM_COLOUR = { 0: "#f5c542", 1: "#4f8ef7", 2: "#3ad07c", 3: "#ff4a4a" };
const beamColour = (circuit) => BEAM_COLOUR[circuit] || null;

// A beam is the four lines the game draws, one from each nozzle of the plate
// on the emitter's face to the same nozzle on the far block's, set square
// about the axis. The stretches of it through one empty cell run from the
// face it comes in by to the face it leaves by, so a beam runs from the
// emitter's face to the far block's and never through either. A beam that
// starts dark is drawn broken, with the dashes carried across the cells so it
// reads as one line, and a circuit nobody has yet seen lit draws in plain ink
// rather than in a guess. The caps overlap the next stretch by half a line,
// which is what keeps a seam from showing at every cell.
const NOZZLE = 1 / 6; // how far each of a beam's four lines sits from its axis, in blocks

export function drawBeams(ctx, c, ghost) {
  for (const { ray, k } of c.beams) {
    const [u, v] = [0, 1, 2].filter((i) => i !== ray.axis);
    const from = [c.x + 0.5, c.y + 0.5, c.z + 0.5];
    const to = [...from];
    from[ray.axis] -= 0.5;
    to[ray.axis] += 0.5;
    ctx.save();
    ctx.strokeStyle = beamColour(ray.colour) || "#e8eefb";
    ctx.lineWidth = Math.max(1, 1.2 * state.cam.zoom);
    ctx.lineCap = "square";
    ctx.globalAlpha = (ghost ? 0.16 : 1) * (ray.lit ? 0.9 : 0.45);
    if (!ray.lit) {
      const p = screen(...from);
      const q = screen(...to);
      ctx.setLineDash([4 * state.cam.zoom, 4 * state.cam.zoom]);
      ctx.lineDashOffset = k * Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        const o = [0, 0, 0];
        o[u] = su * NOZZLE;
        o[v] = sv * NOZZLE;
        const p = screen(from[0] + o[0], from[1] + o[1], from[2] + o[2]);
        const q = screen(to[0] + o[0], to[1] + o[1], to[2] + o[2]);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
