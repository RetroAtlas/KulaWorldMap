// The permalink: a level, the view of it, and the block selected on it. No
// DOM, so it stays importable in bare Node.
import { SIDE } from "./state.js";

/** A level's key: its pack and its slot in it, which is the disc's own
    address and the one the cheat takes. */
export const slotOf = (l) => `${/([^/]+)\.PAK$/.exec(l.pack)[1]}/${l.index}`;

const r2 = (v) => Math.round(v * 100) / 100;

/** The hash for a view of a level, ending with the selected cell where there is one. */
export function formatHash({ slot, cam, target, slice, picked }) {
  return (
    `#${slot}/${Math.round(cam.yaw)},${Math.round(cam.pitch)}/${cam.zoom.toFixed(2)}` +
    `/${target.map(r2).join(",")}/${r2(cam.panX)},${r2(cam.panY)}/${slice}` +
    (picked ? `/${picked.join(",")}` : "")
  );
}

/** A segment of the hash as `n` numbers, or null where it is missing or is not that. */
const numbers = (segment, n) => {
  const v = segment ? segment.split(",").map(Number) : [];
  return v.length === n && v.every(Number.isFinite) ? v : null;
};

/** What a hash names, each part null where the hash leaves it out or it cannot be read. */
export function parseHash(hash) {
  const [pack, slot, turn, zoom, target, pan, slice, picked] = hash.replace(/^#/, "").split("/");
  const scale = numbers(zoom, 1)?.[0];
  const ceiling = numbers(slice, 1)?.[0];
  return {
    slot: `${pack}/${slot}`.toUpperCase(),
    turn: numbers(turn, 2),
    zoom: scale > 0 ? scale : null,
    target: numbers(target, 3),
    pan: numbers(pan, 2),
    slice: Number.isInteger(ceiling) && ceiling >= 0 ? Math.min(SIDE - 1, ceiling) : null,
    picked: numbers(picked, 3),
  };
}
