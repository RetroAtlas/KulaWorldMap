import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { annotations, mapData, objects } from "./fixtures.js";
import { NAMES, setAnnotations, setObjects } from "../../public/js/viewer/data.js";
import { state } from "../../public/js/viewer/state.js";
import { FORMAT } from "../../public/js/format/kwl.js";
import { validate } from "../../public/js/format/checks.js";

setAnnotations(annotations);

setObjects(objects);

state.data = mapData;

export const HIDES = objects.skins.hides;

export const START = 30;

export const KEY = 31;

export const COIN = 37;

export const GEM = 36;

export const TELEPORTER = 5;

export const SWITCH = 9;

export const WANDERING = 53;

export const WORLD = "HIRO";

export const project = (blocks, more = {}) => ({
  format: FORMAT,
  version: 1,
  title: "t",
  author: "",
  notes: "",
  world: WORLD,
  time: 99,
  hidden: false,
  invisibleFromAfar: false,
  simon: false,
  circuits: {},
  blocks,
  ...more,
});

export const plain = (cell, kind = 0, faces = null) =>
  faces ? { cell, kind, faces } : { cell, kind };

export const start = (facing = 3) => ({ type: START, facing });

export const coin = { type: COIN, variant: 0 };

export const texts = (findings, level) =>
  findings.filter((f) => f.level === level).map((f) => f.text);

export const errors = (blocks, more) =>
  texts(validate(project(blocks, more), HIDES, NAMES), "error");

export const warnings = (blocks, more) =>
  texts(validate(project(blocks, more), HIDES, NAMES), "warning");

export const level = (title) => mapData.levels.find((l) => (l.shown || l.name) === title);

export const doc = readFileSync(
  fileURLToPath(new URL("../../docs/editor.md", import.meta.url)),
  "utf8",
);
