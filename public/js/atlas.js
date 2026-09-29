import { emit } from "./dom.js";

// A world's atlas is one row per shade the game ships a texture pre-lit in
// and, along the row, every texture of the world in order. It is fetched the
// first time a level of the world is drawn, and the level draws flat until
// it arrives.
const ATLAS = { size: 64, worlds: new Map() };
export function atlasFor(world) {
  let a = ATLAS.worlds.get(world);
  if (!a) {
    a = { img: new Image(), ready: false };
    a.img.onload = () => {
      a.ready = true;
      emit("atlas-loaded", world);
    };
    a.img.src = `tex/${world}.png`;
    ATLAS.worlds.set(world, a);
  }
  return a.ready ? a.img : null;
}

export const NEUTRAL = 128; // the brightness at which a face is its own colour

// A face shaded between its corners is its texture through a mask of what
// each corner takes: a two by two image drawn so that the middle of each of
// its pixels lands on a corner, which the canvas's smoothing interpolates
// between, taken as a share of each texel or as a colour it is multiplied by.
let shading = null;
function shaded(sk, shade, corners, mode) {
  const n = ATLAS.size;
  if (!shading) {
    const canvas = (w) => Object.assign(document.createElement("canvas"), { width: w, height: w });
    const mask = canvas(2);
    const face = canvas(n);
    const mg = mask.getContext("2d");
    shading = { mask, face, mg, fg: face.getContext("2d"), img: mg.createImageData(2, 2) };
  }
  const { mask, face, mg, fg, img } = shading;
  corners.forEach((rgba, k) => img.data.set(rgba.map(Math.round), 4 * k));
  mg.putImageData(img, 0, 0);
  fg.globalCompositeOperation = "copy";
  fg.drawImage(sk.img, sk.tex * n + 0.5, shade * n + 0.5, n - 1, n - 1, 0, 0, n, n);
  fg.globalCompositeOperation = mode;
  fg.drawImage(mask, -n / 2, -n / 2, 2 * n, 2 * n);
  return face;
}
const through = (sk, shade, levels) =>
  shaded(
    sk,
    shade,
    levels.map((v) => [255, 255, 255, (255 * Math.min(v, NEUTRAL)) / NEUTRAL]),
    "destination-in",
  );

/** Map the texture onto a face, its top left, top right and bottom left on
    the three points on the screen given, the block's corners the game's own
    face routine puts them on, which orthographic projection keeps a
    parallelogram, so an affine transform lands it exactly. Then the colour
    the game draws the face through, where it cycles one. A face the game
    adds to what is behind is dimmed by adding less of it, since a wash over
    it would darken what shows through too. Any other face takes a darker
    grey as a black wash, a brighter one as a white wash, and a tint by
    multiplying, which cannot brighten a channel but keeps the hue. A face
    the game shades between its corners carries their four brightnesses in
    the texture's order, and is drawn through them in place of its colour;
    where it says so, its colour fills in as much as each corner falls short
    of full. A light added to a face's corners is the texture times the
    colour it adds at each, over 128, added once the face is drawn through
    its colour, so that its colour does not scale the light. */
export function paint(g, [p0, p1, p3], sk, shade, alpha) {
  const n = ATLAS.size;
  const ex = [(p1[0] - p0[0]) / n, (p1[1] - p0[1]) / n];
  const ey = [(p3[0] - p0[0]) / n, (p3[1] - p0[1]) / n];
  const base = g.getTransform();
  g.transform(ex[0], ex[1], ey[0], ey[1], p0[0], p0[1]);
  if (sk.add) g.globalCompositeOperation = "lighter";
  if (!sk.shaded || sk.fill) {
    const level = sk.colour ? (sk.colour[0] + sk.colour[1] + sk.colour[2]) / 3 : NEUTRAL;
    g.globalAlpha = sk.add ? alpha * Math.min(1, level / NEUTRAL) : alpha;
    if (sk.shaded)
      g.drawImage(
        through(
          sk,
          shade,
          sk.shaded.map((v) => NEUTRAL - v),
        ),
        0,
        0,
      );
    else g.drawImage(sk.img, sk.tex * n + 0.5, shade * n + 0.5, n - 1, n - 1, 0, 0, n, n);
  }
  if (sk.shaded) {
    g.globalAlpha = alpha;
    g.drawImage(through(sk, shade, sk.shaded), 0, 0);
  }
  g.setTransform(base);
  if (sk.colour && !sk.add) {
    const [r, gg, b] = sk.colour;
    if (r === gg && gg === b) {
      if (r !== NEUTRAL) {
        g.globalCompositeOperation = "source-over";
        g.fillStyle =
          r < NEUTRAL
            ? `rgba(0 0 0 / ${alpha * (1 - r / NEUTRAL)})`
            : `rgba(255 255 255 / ${alpha * Math.min(1, (r - NEUTRAL) / NEUTRAL)})`;
        g.fill();
      }
    } else {
      g.globalCompositeOperation = "multiply";
      const ch = (v) => Math.min(255, Math.round((v * 255) / NEUTRAL));
      g.fillStyle = `rgba(${ch(r)} ${ch(gg)} ${ch(b)} / ${alpha})`;
      g.fill();
    }
  }
  if (sk.glow) {
    g.transform(ex[0], ex[1], ey[0], ey[1], p0[0], p0[1]);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = alpha;
    // a multiply takes a texel at most once over, so a gain past it is added again
    let gain = sk.glow.map((rgb) => rgb.map((v) => (v * 255) / NEUTRAL));
    while (gain.some((rgb) => rgb.some((v) => v > 0))) {
      const pass = gain.map((rgb) => [...rgb.map((v) => Math.max(0, Math.min(255, v))), 255]);
      g.drawImage(shaded(sk, shade, pass, "multiply"), 0, 0);
      gain = gain.map((rgb) => rgb.map((v) => v - 255));
    }
    g.setTransform(base);
  }
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}
