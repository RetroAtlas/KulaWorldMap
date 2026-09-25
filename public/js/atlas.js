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

/** Map the texture onto a face, its top left, top right and bottom left on
    the three points on the screen given, the block's corners the game's own
    face routine puts them on, which orthographic projection keeps a
    parallelogram, so an affine transform lands it exactly. Then the colour
    the game draws the face through, where it cycles one. A face the game
    adds to what is behind is dimmed by adding less of it, since a wash over
    it would darken what shows through too. Any other face takes a darker
    grey as a black wash, a brighter one as a white wash, and a tint by
    multiplying, which cannot brighten a channel but keeps the hue. */
export function paint(g, [p0, p1, p3], sk, shade, alpha) {
  const n = ATLAS.size;
  const ex = [(p1[0] - p0[0]) / n, (p1[1] - p0[1]) / n];
  const ey = [(p3[0] - p0[0]) / n, (p3[1] - p0[1]) / n];
  const level = sk.colour ? (sk.colour[0] + sk.colour[1] + sk.colour[2]) / 3 : NEUTRAL;
  g.globalAlpha = sk.add ? alpha * Math.min(1, level / NEUTRAL) : alpha;
  if (sk.add) g.globalCompositeOperation = "lighter";
  const base = g.getTransform();
  g.transform(ex[0], ex[1], ey[0], ey[1], p0[0], p0[1]);
  g.drawImage(sk.img, sk.tex * n + 0.5, shade * n + 0.5, n - 1, n - 1, 0, 0, n, n);
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
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}
