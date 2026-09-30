import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../../public/${p}`, import.meta.url));

export const mapData = JSON.parse(readFileSync(at("map_data.json"), "utf8"));
export const annotations = JSON.parse(readFileSync(at("annotations.json"), "utf8"));
export const objects = JSON.parse(readFileSync(at("objects.json"), "utf8"));
export const levelKey = (l) => `${l.pack}#${l.index}`;

// Two kinds the disc numbers and the data does not: the record every level
// ends with ships as the level's time rather than as a record, and the one kind
// no lattice cell names ships with its slots left out.
export const TRAILER_KIND = 666;
export const UNPLACED_KIND = 9;
