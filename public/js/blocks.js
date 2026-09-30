import { state, BLOCK, project, facing, screen, cellKey, sliceZ, effectsOn } from "./state.js";
import { OFF_LATTICE, FACE_NORMAL, skinsTable, kindMotion, modelUnit } from "./data.js";
import { blockPhase, lightOn, cornersLit } from "./motion.js";
import { ballsFor } from "./things.js";
import { platformPlace, faceSkin } from "./skins.js";
import { paint, NEUTRAL } from "./atlas.js";

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const shade = (hex, f, a = 1) => {
  const c = rgb(hex);
  const t = f >= 1 ? [255, 255, 255] : [14, 19, 30];
  const k = f >= 1 ? f - 1 : 1 - f;
  const m = c.map((v, i) => Math.round(v + (t[i] - v) * k));
  return `rgba(${m[0]} ${m[1]} ${m[2]} / ${a})`;
};

// The six faces of a unit cube: outward normal, the neighbour it hides behind,
// its corners, and the number the game gives it.
export const FACES = [
  {
    n: [0, 0, 1],
    d: [0, 0, 1],
    game: 5,
    c: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    d: [0, 0, -1],
    game: 0,
    c: [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  {
    n: [1, 0, 0],
    d: [1, 0, 0],
    game: 1,
    c: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    d: [-1, 0, 0],
    game: 4,
    c: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    d: [0, 1, 0],
    game: 2,
    c: [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    d: [0, -1, 0],
    game: 3,
    c: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
];

const LIGHT = (() => {
  const v = [0.35, -0.55, -0.78];
  const m = Math.hypot(...v);
  return v.map((x) => x / m);
})();

const lit = FACES.map((f) => {
  const d = f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2];
  return 0.5 + 0.75 * (0.5 + 0.5 * d);
});

// The shipped shade a face wears where the world's table gives none.
const SHADE = FACES.map((f) =>
  f.n[2] < 0 ? 2 : f.n[2] > 0 ? 0 : f.n[0] > 0 || f.n[1] < 0 ? 1 : 0,
);
export const shadeOf = (i, world) => skinsTable()?.shade[world]?.[FACES[i].game] ?? SHADE[i];

const PLATFORM = 5;
const BEAM_KIND = 8;

/** Whether a block of `kind` builds no face toward the neighbour `nb`. The
    game stands a plain block at a beam's ends before it builds a face, so an
    end hides like one. */
function hiddenBehind(kind, nb, idx) {
  const hides = skinsTable()?.hides;
  if (!hides || kind === undefined) return true;
  const theirs = kindOf(nb, idx, cellKey(nb.x, nb.y, nb.z));
  return (hides.kinds[String(kind)] ?? hides.other).includes(theirs === BEAM_KIND ? 0 : theirs);
}

/** Whether the block at a cell has face `g`, in the game's numbering, as the
    game builds it: a face hidden behind its neighbour is built all the same
    where the neighbour is a kind it leaves the face unseen behind. */
export function hasFace(idx, c, g) {
  const n = FACE_NORMAL[g];
  const nb = idx.cells.get(cellKey(c.x + n[0], c.y + n[1], c.z + n[2]));
  const kind = kindOf(c, idx, cellKey(c.x, c.y, c.z));
  if (!nb || !hiddenBehind(kind, nb, idx)) return true;
  const hides = skinsTable().hides;
  const unseen = !(String(kind) in hides.kinds) && hides.unseen;
  return !!unseen && unseen.includes(kindOf(nb, idx, cellKey(nb.x, nb.y, nb.z)));
}

/** A face whose `skin(i)` is null is left undrawn, and one with no skin is
    filled with `colour(i)`. */
export function cube(g, c, idx, colour, edge, alpha, skin, kind) {
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  for (let i = 0; i < FACES.length; i++) {
    const f = FACES[i];
    if (!facing(f.n)) continue;
    const nb = idx.cells.get(cellKey(c.x + f.d[0], c.y + f.d[1], c.z + f.d[2]));
    if (nb && nb.z >= sliceZ() && hiddenBehind(kind, nb, idx)) continue;
    const sk = skin ? skin(i) : undefined;
    if (sk === null) continue;
    const pts = f.c.map(([dx, dy, dz]) => {
      const [px, py] = project(dx, dy, dz);
      return [ox + px * s, oy + py * s];
    });
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    if (sk) {
      const at = sk.corners.map(([dx, dy, dz]) => screen(c.x + dx, c.y + dy, c.z + dz));
      g.save();
      g.clip();
      paint(g, at, sk, shadeOf(i, sk.world), alpha);
      g.restore();
    } else {
      g.fillStyle = colour ? colour(i) : edge;
      g.fill();
    }
    if (edge) {
      g.strokeStyle = edge;
      g.lineWidth = 1;
      g.stroke();
    }
  }
}

function kindTint(tint, kind) {
  const c = rgb(tint);
  const k = 0.16 * (Math.min(kind, state.data.styles - 1) / Math.max(1, state.data.styles - 1));
  return (
    "#" +
    c
      .map((n) =>
        Math.round(n * (1 - k) + 232 * k)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export const litFace = (colour, i) => shade(colour, lit[i]);

export const flatFace = (tint, kind, i) => litFace(kindTint(tint, kind), i);

// How a kind of block reads without its textures, and with them, where only a
// block not there to be stood on keeps its broken outline.
const LOOK = {
  1: { wash: "rgba(255 70 30 / 0.45)" },
  2: { wash: "rgba(160 225 255 / 0.45)" },
  3: { alpha: 0.35, dash: [3, 3] },
  6: { wash: "rgba(0 0 0 / 0.3)", dash: [6, 3] },
  7: { alpha: 0.2, dash: [2, 4] },
};
export const SKINNED_LOOK = {
  3: { alpha: 0.7, dash: [3, 3] },
  7: { alpha: 0.2, dash: [2, 4] },
};
const INVISIBLE = 3;
const VANISHING = 7;
const GLASS_FACE = 0.5;
// The kinds the game builds on a path of their own, which a hidden level's
// glass leaves out.
const UNGLAZED = new Set([INVISIBLE, VANISHING]);
const TRANSLUCENT = 4;
const FADING = 0.6;

/** Held still, a vanishing block looks as it does when it starts to go. */
function vanishingLook(r, frame, skinned) {
  if (!state.show.motion) return { alpha: FADING };
  const { state: step, level } = blockPhase(kindMotion(VANISHING), r, frame);
  if (step === 0) return (skinned ? SKINNED_LOOK : LOOK)[VANISHING];
  const k = Math.abs(level - NEUTRAL) / NEUTRAL;
  const wash = level > NEUTRAL ? `rgba(255 255 255 / ${0.8 * k})` : `rgba(0 0 0 / ${0.8 * k})`;
  return { alpha: step >= TRANSLUCENT ? FADING : 1, wash };
}

// A device's light on a face comes in the order of the texture's first turn,
// and is added to the face's colour as the game adds it, a channel that passes
// what it can hold standing at the most it can.
function deviceLight(sums, sk, g, skins) {
  const first = skins.corners[g][0];
  const base = sk.colour ?? [NEUTRAL, NEUTRAL, NEUTRAL];
  return skins.corners[g][sk.turn].map((corner) => {
    const k = first.findIndex((f) => f.every((v, i) => v === corner[i]));
    return sums[k].map((v, ch) => Math.max(0, Math.min(254, (base[ch] & ~1) + v) - base[ch]));
  });
}

const peak = (skins) => Array(3).fill(Math.max(...skins.cycles.invisible.level));

// Near the ball an invisible face is lit corner by corner as the game lights
// it, and the map's look fills in what the light leaves dark. Where the level
// turns the light round, a face the light reaches is drawn as the game draws
// it there instead.
const lights = new WeakMap();
function lightUp(sk, l, home, face, corners) {
  const entry = kindMotion(INVISIBLE)?.light;
  if (!entry) return;
  if (!lights.has(l)) lights.set(l, lightOn(entry, l));
  const light = lights.get(l);
  const block = 1 / modelUnit();
  const cell = [home.x, home.y, home.z];
  const at = corners.map((c) => c.map((v, i) => (cell[i] + v) * block));
  const levels = cornersLit(light, ballsFor(l, face), cell, at, block);
  if (!levels || (!light.turned && !levels.some(Boolean))) return;
  sk.shaded = levels;
  sk.fill = !light.turned;
}

function kindOf(c, idx, key) {
  if (c.v === OFF_LATTICE) return 0;
  if (c.v < state.data.firstRecord) return c.v;
  return idx.records.get(key)?.[0]?.kind ?? 0;
}

/** Returns whether the block changes by the next frame. */
export function drawBlock(ctx, c, home, key, ghost, sel, hov, scene) {
  const { l, idx, tint, skins, atlas, look, frame, effect, edges, lights } = scene;
  let live = false;
  const kind = kindOf(c, idx, key);
  const rec = c.v >= state.data.firstRecord ? idx.records.get(key)?.[0] : null;
  let style = (atlas ? SKINNED_LOOK : LOOK)[kind] || {};
  if (kind === VANISHING && kindMotion(kind)) {
    live = true;
    style = vanishingLook(rec, frame, !!atlas);
  }
  const base = kindTint(tint, kind);
  const boost = sel ? 0.22 : hov ? 0.12 : 0;
  const glass = look?.glass && !UNGLAZED.has(kind) ? GLASS_FACE : 1;
  const a = (ghost ? 0.16 : 1) * (style.alpha ?? 1) * glass;
  let skin = null;
  if (atlas) {
    const place = c.k !== undefined && rec?.kind === PLATFORM ? platformPlace(rec, c.k) : null;
    const still = place ? { ...home, [place.axis]: home[place.axis] + c.k } : home;
    const plates = idx.plates.get(key);
    skin = (i) => {
      const g = FACES[i].game;
      const sk = faceSkin(skins, look, still, g, kind, rec, effect, place, plates?.get(g));
      if (sk?.live) live = true;
      if (sk && kind === INVISIBLE) {
        if (!effectsOn()) sk.colour = peak(skins);
        else lightUp(sk, l, home, g, skins.corners[g][sk.turn]);
      }
      const added = !place && lights?.get(`${key}/${g}`);
      if (sk && added && !sk.add) sk.glow = deviceLight(added, sk, g, skins);
      return sk && { ...sk, img: atlas, world: l.theme, corners: skins.corners[g][sk.turn] };
    };
  }
  cube(
    ctx,
    c,
    idx,
    (i) => shade(base, lit[i] + boost, a),
    edges ? `rgba(9 13 20 / ${0.55 * a})` : null,
    a,
    skin,
    kind,
  );
  if (style.wash) cube(ctx, c, idx, () => style.wash, null, a, null, kind);
  if (style.dash && !ghost && state.show.outlines)
    outline(ctx, c, idx, "rgba(232 238 251 / 0.7)", style.dash);
  if (skin && (sel || hov)) {
    const glow = `rgba(255 255 255 / ${sel ? 0.22 : 0.12})`;
    cube(ctx, c, idx, () => glow, null, a, null, kind);
  }
  return live;
}

export function covers(c, x, y) {
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  return FACES.some((f) => {
    if (!facing(f.n)) return false;
    const pts = f.c.map(([dx, dy, dz]) => {
      const [px, py] = project(dx, dy, dz);
      return [ox + px * s, oy + py * s];
    });
    const sides = pts.map(([ax, ay], i) => {
      const [bx, by] = pts[(i + 1) % pts.length];
      return Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    });
    return !sides.includes(1) || !sides.includes(-1);
  });
}

export function outlineStroke(ctx, colour, dash = []) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.setLineDash(dash.map((d) => d * Math.max(0.5, state.cam.zoom)));
}

export function outline(ctx, c, idx, colour, dash = []) {
  ctx.save();
  outlineStroke(ctx, colour, dash);
  const s = state.cam.zoom * BLOCK;
  const [ox, oy] = screen(c.x, c.y, c.z);
  for (const f of FACES) {
    if (!facing(f.n)) continue;
    ctx.beginPath();
    f.c.forEach(([dx, dy, dz], k) => {
      const [px, py] = project(dx, dy, dz);
      const x = ox + px * s,
        y = oy + py * s;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}
