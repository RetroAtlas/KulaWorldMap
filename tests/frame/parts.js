// The parts of a frame, by the function the renderer draws each through.
// A sample under draw in none of them is the draw's own time, and one outside
// the page's script is the browser's time: the canvas's flush to the GPU, the
// compositor, input.
export const PARTS = {
  visible: "sort",
  travelling: "travel",
  deviceLights: "lights",
  drawBlock: "blocks",
  drawThing: "things",
  drawBeams: "beams",
  paintPick: "pick",
  drawRails: "overlays",
  drawBase: "overlays",
  drawScale: "overlays",
  drawLink: "overlays",
  outline: "overlays",
  drawFloor: "editor",
  drawCell: "editor",
  drawGhost: "editor",
  drawPieces: "course",
  drawLeaps: "course",
  drawJumps: "course",
  drawRings: "course",
  drawDust: "play",
};
export const OUTSIDE = { "(idle)": "idle", "(program)": "native", "(garbage collector)": "gc" };
