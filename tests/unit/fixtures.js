import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../../public/${p}`, import.meta.url));

export const mapData = JSON.parse(readFileSync(at("map_data.json"), "utf8"));
export const annotations = JSON.parse(readFileSync(at("annotations.json"), "utf8"));
export const objects = JSON.parse(readFileSync(at("objects.json"), "utf8"));
export const packs = JSON.parse(readFileSync(at("packs.json"), "utf8"));
export const releases = ["us", "eu", "jp"].map((id) =>
  JSON.parse(readFileSync(at(`releases/${id}.json`), "utf8")),
);
export const levelKey = (l) => `${l.pack}#${l.index}`;

// Two kinds the disc numbers and the data does not: the record every level
// ends with ships as the level's time rather than as a record, and the one kind
// no lattice cell names ships with its slots left out.
export const TRAILER_KIND = 666;
export const UNPLACED_KIND = 9;

// A link and where it puts four cells on an 800 by 600 canvas, which every later version reproduces.
export const PINNED_LINK = "#INCA/11/30,20/1.50/17,12,17/0.5,-0.25/33";
export const PINNED_CELLS = [
  [
    [17, 12, 17],
    [374.5, 312.75],
  ],
  [
    [18, 12, 17],
    [418.667, 321.472],
  ],
  [
    [17, 13, 17],
    [349, 327.856],
  ],
  [
    [17, 12, 18],
    [374.5, 360.674],
  ],
];
