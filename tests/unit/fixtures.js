import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../../public/${p}`, import.meta.url));

export const mapData = JSON.parse(readFileSync(at("map_data.json"), "utf8"));
export const annotations = JSON.parse(readFileSync(at("annotations.json"), "utf8"));
export const levelKey = (l) => `${l.pack}#${l.index}`;
