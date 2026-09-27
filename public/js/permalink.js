// The permalink: a level, the view of it, and the block selected on it. No
// DOM, so it stays importable in bare Node.
import { SIDE, PITCH_MIN, PITCH_MAX, ZOOM_MIN, ZOOM_MAX } from "./state.js";

/** A level's key: its pack and its slot in it, which is the disc's own
    address and the one the cheat takes. */
export const slotOf = (l) => `${/([^/]+)\.PAK$/.exec(l.pack)[1]}/${l.index}`;

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A view framed to fit the window says so in place of where the camera is,
// so it opens framed to whatever window it is opened in.
const FIT = "fit";

/** The hash for a view of a level, ending with the selected cell where there is one. */
export function formatHash({ slot, cam, target, slice, picked, fitted }) {
  const view = fitted
    ? FIT
    : `${cam.zoom.toFixed(2)}/${target.map(r2).join(",")}/${r2(cam.panX)},${r2(cam.panY)}`;
  return (
    `#${slot}/${Math.round(cam.yaw)},${Math.round(cam.pitch)}/${view}/${slice}` +
    (picked ? `/${picked.join(",")}` : "")
  );
}

/** A segment of the hash as `n` numbers, or null where it is missing or is not that. */
const numbers = (segment, n) => {
  const v = segment ? segment.split(",").map(Number) : [];
  return v.length === n && v.every(Number.isFinite) ? v : null;
};

const CELL = /^\d+,\d+,\d+$/;

// The map escapes nothing it writes, but a share sheet or a mail client may
// escape a link on its way; a % that is no escape leaves the link as it came.
const unescaped = (text) => {
  if (!text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** What a hash names, each part null where the hash leaves it out or it cannot be read.
    The head is read by position and the rest by shape, in any order, so a
    segment the reader does not know is passed over rather than read as another.
    A number past what the camera can reach is held where the camera stops,
    and a cell outside the lattice names nothing. */
export function parseHash(hash) {
  const [pack, slot, turn, ...rest] = unescaped(hash.replace(/^#/, "")).split("/");
  const [zoom, target, pan, slice, ...tail] =
    rest[0]?.toLowerCase() === FIT ? [null, null, null, ...rest.slice(1)] : rest;
  const scale = numbers(zoom, 1)?.[0];
  const ceiling = numbers(slice, 1)?.[0];
  const angles = numbers(turn, 2);
  const centre = numbers(target, 3);
  const cell = tail
    .find((segment) => CELL.test(segment))
    ?.split(",")
    .map(Number);
  return {
    slot: `${pack}/${/^\d+$/.test(slot) ? Number(slot) : slot}`.toUpperCase(),
    turn: angles && [angles[0], clamp(angles[1], PITCH_MIN, PITCH_MAX)],
    zoom: scale > 0 ? clamp(scale, ZOOM_MIN, ZOOM_MAX) : null,
    target: centre && centre.map((v) => clamp(v, 0, SIDE)),
    pan: numbers(pan, 2),
    slice: Number.isInteger(ceiling) && ceiling >= 0 ? Math.min(SIDE - 1, ceiling) : null,
    picked: cell?.every((v) => v < SIDE) ? cell : null,
  };
}
