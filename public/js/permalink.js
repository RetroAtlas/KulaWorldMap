// No DOM, so it stays importable in bare Node.
import { SIDE, PITCH_MIN, PITCH_MAX, ZOOM_MIN, ZOOM_MAX } from "./state.js";

export const slotOf = (l) => `${/([^/]+)\.PAK$/.exec(l.pack)[1]}/${l.index}`;

const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const FIT = "fit";

export function formatHash({ slot, cam, target, slice, picked, fitted }) {
  const view = fitted
    ? FIT
    : `${cam.zoom.toFixed(2)}/${target.map(r2).join(",")}/${r2(cam.panX)},${r2(cam.panY)}`;
  return (
    `#${slot}/${Math.round(cam.yaw)},${Math.round(cam.pitch)}/${view}/${slice}` +
    (picked ? `/${picked.join(",")}` : "")
  );
}

const numbers = (segment, n) => {
  const v = segment ? segment.split(",").map(Number) : [];
  return v.length === n && v.every(Number.isFinite) ? v : null;
};

const CELL = /^\d+,\d+,\d+$/;

// A share sheet or a mail client may escape a link on its way.
const unescaped = (text) => {
  if (!text.includes("%")) return text;
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** Each part is null where the hash leaves it out or it cannot be read. The
    head is read by position and the rest by shape, in any order, so a segment
    the reader does not know is passed over rather than read as another. */
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
