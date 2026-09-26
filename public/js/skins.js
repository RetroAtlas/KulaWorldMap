// What the game paints on a face, from the table the build reads off the
// executable: which of the world's textures, laid at how many quarter turns,
// drawn through what colour, or nothing at all. A level says what a block is
// and what stands on it; how that looks is a rule in the code, and this is
// the viewer's copy of it. Where the game picks at random on every visit, a
// stone among the world's four or the frame a fire starts on, the map hashes
// the face's place instead, so it shows the same thing on every visit.
import { cellKey } from "./state.js";
import { seed } from "./hash.js";

const BLOCK = 512; // the game's units to a block
const ICE = 2;
const INVISIBLE = 3;
const CRUMBLING = 6;
const VANISHING = 7;
const BEAM_KIND = 8;
const PLATFORM_ROLES = ["first", "middle", "last"];
const STONE_AT_RANDOM = -2;
// The game numbers the six directions -z, +x, +y, -y, -x, +z: the normal of
// each, and the two faces along each axis, the one looking down it first.
const NORMAL = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, 1],
];
const FACE_ALONG = [
  [4, 1],
  [3, 2],
  [0, 5],
];

/**
 * How a level is drawn: from which of the two sets of skins, the second for
 * a level the loader finds no key on, unless the level is a hidden one or the
 * game is in the mode that plays one pack of its own, either of which puts it
 * back on the first; whether its faces are half-transparent, which the
 * settings record of a hidden level asks for; and the world's place, whose
 * parity picks a bonus level's colours.
 */
export function lookOf(skins, l, world) {
  const keyed = l.records.some(
    (r) => r.kind < skins.keys.kinds && r.on.some((o) => o.type === skins.keys.type),
  );
  const glass = l.records.some((r) => r.kind === skins.hidden.kind && r.type === skins.hidden.type);
  const bonus = !keyed && !glass && l.pack !== skins.copycat;
  return {
    set: skins.sets[bonus ? "bonus" : "arcade"],
    bonus,
    glass,
    world: l.theme,
    parity: world % 2,
  };
}

/** The face at each end of a beam that looks along it, in the beam's colour, by cell. */
export function platesOf(rays) {
  const plates = new Map();
  const add = (cell, other, colour) => {
    const key = cellKey(...cell);
    const axis = [0, 1, 2].find((i) => cell[i] !== other[i]);
    if (!plates.has(key)) plates.set(key, new Map());
    plates.get(key).set(FACE_ALONG[axis][other[axis] > cell[axis] ? 1 : 0], colour);
  };
  for (const r of rays) {
    add(r.a, r.b, r.colour);
    add(r.b, r.a, r.colour);
  }
  return plates;
}

/** Where a block of a moving platform stands in its run, for the table. */
export function platformPlace(r, k) {
  const axis = "xyz"[r.f[0] === 1 ? 0 : r.f[0] === 2 ? 1 : 2];
  const role =
    (r.length || 1) === 1 ? "single" : PLATFORM_ROLES[k === 0 ? 0 : k < r.length - 1 ? 1 : 2];
  return { axis, role };
}

// A stone may be laid turned, by the world's word: not at all, a half turn
// on some, or any quarter turn.
function stoneTurn(skins, look, h) {
  const word = skins.turn[look.world];
  if (word === 0) return 0;
  if (word === 1) return h % skins.turns.half.of ? skins.turns.half.quarters : 0;
  return h % skins.turns.quarters;
}

// A phase the game spreads across a level by position, so that neighbouring
// faces pulse a step apart.
function spread(skins, c, face, length) {
  const n = NORMAL[face];
  const at = [c.x, c.y, c.z].map((v, i) => v * BLOCK + (n[i] * BLOCK) / 2);
  return Math.floor((at[0] + at[1] + at[2]) / skins.cycles.spread) % length;
}

/** Whether the game paints a thing's shadow into the face under it. */
export const shadowed = (skins, type) =>
  type >= skins.shadow.from && type <= skins.shadow.to && !skins.shadow.except.includes(type);

/**
 * The skin of one face of a block: `tex`, the texture's number in the
 * world's atlas; `turn`, the quarter turns it is laid at; `colour`, the
 * colour it is drawn through where the game cycles one, as [r, g, b] with 128
 * the texture's own; `add` where the game adds it to what is behind; and
 * `live` where any of that changes from frame to frame. Null
 * is a face the game leaves undrawn, such as the join between a platform's
 * blocks. `kind` is the block's, `r` its record or null, `place` a platform
 * block's place in its run, and `plate` the beam colour of a plate on the
 * face, or undefined.
 *
 * The loader's selector for a face is its block's kind where that is not
 * plain, else the type of what stands on it, else nothing, and the model it
 * draws is the selector's; the cycles run on the selector too.
 */
export function faceSkin(skins, look, c, face, kind, r, frame, place, plate) {
  const set = look.set;
  const h = seed(c.x, c.y, c.z, face);
  const cyc = skins.cycles;
  const now = Math.floor(frame);
  const pick = (texs, i) => texs[Math.min(i, texs.length - 1)];
  const at = (texs, frames) => pick(texs, frames[(h + now) % frames.length]);
  const cycled = (colours) =>
    colours[(spread(skins, c, face, colours.length) + now) % colours.length];
  const bonusColour = () => cycled(cyc.bonus.colour[2 * look.parity]);

  if (place) {
    const e = skins.platform[place.axis][place.role][face];
    if (!e) return null;
    const [model, turn] = e;
    if (model === STONE_AT_RANDOM) return { tex: set.stone[h % set.stone.length][0], turn };
    return { tex: set.platform[model][0], turn };
  }
  if (plate !== undefined) return { tex: set.laser[plate] ?? set.laser[0], turn: 0 };

  const on = kind === BEAM_KIND || !r ? null : r.on.find((o) => o.face === face);
  const type = on && on.type < skins.plainFrom ? on.type : 0;
  const kinds = set.kinds[String(kind)];
  const sel = kinds ? kind : type;
  const out = { tex: 0, turn: 0, live: look.bonus || sel === cyc.fire.of };
  if (kinds) {
    out.tex = kinds[0];
    if (kind === ICE && on && shadowed(skins, on.type)) out.tex = pick(kinds, 1);
    else if (kind === INVISIBLE) {
      out.tex = at(kinds, cyc.invisible.frames);
      const level = cycled(cyc.invisible.level);
      out.colour = [level, level, level];
      out.add = skins.blend[String(kind)] === 1;
      out.live = true;
    } else if (kind === VANISHING) {
      out.turn = stoneTurn(skins, look, h);
      if (look.bonus) {
        out.tex = at(kinds, cyc.bonus.frames);
        out.colour = bonusColour();
      }
    } else if (kind === CRUMBLING && look.bonus) out.colour = bonusColour();
  } else if (type) {
    const texs = set.types[String(type)];
    out.tex = pick(texs, shadowed(skins, type) ? 1 : 0);
    if (look.bonus) {
      out.colour = bonusColour();
      if (type >= skins.shadow.from) {
        out.tex = at(texs, cyc.bonus.shadowed);
        out.turn = h % skins.turns.quarters;
      }
    }
  } else {
    const stone = set.stone[h % set.stone.length];
    out.tex = stone[0];
    out.turn = stoneTurn(skins, look, h);
    if (look.bonus) {
      out.tex = at(stone, cyc.bonus.frames);
      out.turn = h % skins.turns.quarters;
      out.colour = bonusColour();
    }
  }
  if (sel === cyc.fire.of) out.tex = at(kinds || set.types[String(type)], cyc.fire.frames);
  return out;
}
