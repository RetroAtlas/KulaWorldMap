import { emit } from "./dom.js";

// A world's atlas is one row per shade the game ships a texture pre-lit in
// and, along the row, every texture of the world in order.
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

// A face shaded between its corners is drawn through a two by two mask whose
// pixels' middles land on the corners, so the canvas's smoothing interpolates
// between them.
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

// A light holds while it is on, so a texture times a light is drawn once and kept.
const KEPT = 256;
const kept = new Map();
function litFace(sk, shade, pass) {
  const key = `${sk.img.src}/${sk.tex}/${shade}/${pass.flat().join()}`;
  let face = kept.get(key);
  if (!face) {
    if (kept.size >= KEPT) kept.clear();
    const n = ATLAS.size;
    face = Object.assign(document.createElement("canvas"), { width: n, height: n });
    const g = face.getContext("2d");
    g.globalCompositeOperation = "copy";
    g.drawImage(shaded(sk, shade, pass, "multiply"), 0, 0);
    kept.set(key, face);
  }
  return face;
}

/** Map the texture's top left, top right and bottom left onto the three
    points given, which an affine transform lands exactly since the view is
    orthographic. A face shaded between its corners is drawn through their
    brightnesses, and where `fill` says so its colour fills in as much as each
    corner falls short of full. A light is added once the face is drawn
    through its colour, so the colour does not scale it. */
export function paint(g, [p0, p1, p3], sk, shade, alpha) {
  const n = ATLAS.size;
  const ex = [(p1[0] - p0[0]) / n, (p1[1] - p0[1]) / n];
  const ey = [(p3[0] - p0[0]) / n, (p3[1] - p0[1]) / n];
  const m = g.getTransform();
  const base = [m.a, m.b, m.c, m.d, m.e, m.f];
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
  g.setTransform(...base);
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
      const pass = gain.map((rgb) => [
        ...rgb.map((v) => Math.round(Math.max(0, Math.min(255, v)))),
        255,
      ]);
      g.drawImage(litFace(sk, shade, pass), 0, 0);
      gain = gain.map((rgb) => rgb.map((v) => v - 255));
    }
    g.setTransform(...base);
  }
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
}
