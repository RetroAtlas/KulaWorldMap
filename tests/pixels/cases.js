// The matrix: every case names a level by pack and slot, a yaw and pitch, and
// optionally a zoom (else the fit), the display switches it changes, a
// selection and a hover, the circuits turned over, and the page times it is
// captured at.
const T0 = 10000;
const T1 = 10617;
const T2 = 14167;

const LEVELS = {
  L1: ["HIRO.PAK", 0],
  L7: ["HIRO.PAK", 6],
  B1: ["HIRO.PAK", 15],
  H1: ["HIRO.PAK", 18],
  LESSON: ["HIRO.PAK", 19],
  S8: ["COPYCAT.PAK", 7],
  S5: ["COPYCAT.PAK", 4],
  S6: ["COPYCAT.PAK", 5],
  F1: ["HIROFI.PAK", 0],
  L22: ["HILLS.PAK", 6],
  B5: ["HILLS.PAK", 16],
  OBJ: ["HILLS.PAK", 19],
  F3: ["HILLSFI.PAK", 0],
  F4: ["HILLSFI.PAK", 1],
  L35: ["INCA.PAK", 4],
  L45: ["INCA.PAK", 14],
  H3: ["INCA.PAK", 18],
  F6: ["INCAFI.PAK", 1],
  L51: ["ARCTIC.PAK", 5],
  L58: ["ARCTIC.PAK", 12],
  L71: ["COWBOY.PAK", 10],
  B15: ["COWBOY.PAK", 17],
  L76: ["FIELD.PAK", 0],
  L81: ["FIELD.PAK", 5],
  L94: ["ATLANT.PAK", 3],
  H7: ["ATLANT.PAK", 18],
  L111: ["HAZE.PAK", 5],
  OBJHAZE: ["HAZE.PAK", 19],
  B27: ["MARS.PAK", 17],
  OBJMARS: ["MARS.PAK", 19],
  L136: ["HELL.PAK", 0],
  H10: ["HELL.PAK", 18],
  F20: ["HELLFI.PAK", 1],
};

const V1 = [45, 35];
const V2 = [200, 10];
const V3 = [120, -30];
const TOP = [0, 84];
const BOTTOM = [300, -84];
const SIDEWAYS = [15, 60];

export const cases = [];
const add = (id, level, [yaw, pitch], extra = {}) =>
  cases.push({ id, level: LEVELS[level], yaw, pitch, frames: [T1], ...extra });

// A: every level, three views, and three frames on the first
for (const name of Object.keys(LEVELS)) {
  add(`A/${name}/v1`, name, V1, { frames: [T0, T1, T2] });
  add(`A/${name}/v2`, name, V2, { frames: [T0] });
  add(`A/${name}/v3`, name, V3, { frames: [T0] });
}
for (const name of ["L1", "LESSON", "OBJ", "L94", "H10", "B15", "F6", "L111"]) {
  add(`A/${name}/top`, name, TOP);
  add(`A/${name}/bottom`, name, BOTTOM);
  add(`A/${name}/sideways`, name, SIDEWAYS);
}

// B: each display switch away from its default, alone and in company
const FLIPS = {
  skins: { skins: false },
  outlines: { outlines: false },
  objects: { objects: false },
  models: { models: false },
  travel: { travel: false },
  through: { through: true },
  labels: { labels: true },
  faces: { labels: true, faces: false },
  base: { base: true },
  start: { start: true },
  hidden: { hidden: true },
  markersLabelled: { models: false, labels: true },
  markersThrough: { models: false, through: true, labels: true },
  flatThrough: { skins: false, through: true },
  flatOff: { skins: false, outlines: false },
  everythingOn: { labels: true, through: true, base: true, start: true, hidden: true },
  bare: { skins: false, outlines: false, objects: false },
};
for (const name of ["LESSON", "OBJ", "F6", "L94", "B15", "H3", "H10", "L22"]) {
  for (const [flip, show] of Object.entries(FLIPS)) {
    const extra = { show, frames: flip === "travel" ? [T0, T1] : [T1] };
    if (flip === "hidden" || flip === "everythingOn") extra.slice = "mid";
    add(`B/${name}/${flip}/v1`, name, V1, extra);
    add(`B/${name}/${flip}/v3`, name, V3, extra);
  }
}

// C: zoom, across the edge and label thresholds and the marker's number
for (const name of ["L1", "LESSON", "OBJ", "F6", "L94"]) {
  for (const zoom of [0.25, 0.3, 0.42, 0.6, 1, 1.3, 2.2, 3]) {
    add(`C/${name}/${zoom}/models`, name, V1, { zoom, show: { labels: true } });
    add(`C/${name}/${zoom}/markers`, name, V1, { zoom, show: { labels: true, models: false } });
  }
  add(`C/${name}/panned`, name, V3, { zoom: 1.6, pan: [3.5, -2.25], show: { labels: true } });
}

// D: the slice, with and without the dim
for (const name of ["LESSON", "OBJ", "L45", "H10", "L71", "L94"]) {
  for (const hidden of [false, true]) {
    add(`D/${name}/${hidden}/v1`, name, V1, { slice: "mid", show: { hidden, labels: true } });
    add(`D/${name}/${hidden}/v3`, name, V3, { slice: "mid", show: { hidden } });
  }
}

// E: a selected and a hovered block
const two = [T0, T1];
add("E/L1/through", "L1", [30, -40], { select: "type30", hover: "plain", frames: two });
add("E/L1/through-markers", "L1", [30, -40], {
  select: "type30",
  show: { models: false },
  frames: two,
});
add("E/LESSON/things", "LESSON", V1, { select: "things", hover: "plain", frames: two });
add("E/LESSON/flat", "LESSON", V1, {
  select: "things",
  hover: "plain",
  show: { skins: false },
  frames: two,
});
add("E/LESSON/below", "LESSON", V3, { select: "things", nth: 3, hover: "kind3", frames: two });
add("E/L94/platform", "L94", V1, { select: "kind5", hover: "end", frames: two });
add("E/L94/platform-still", "L94", V3, {
  select: "kind5",
  hover: "kind6",
  show: { travel: false },
  frames: two,
});
add("E/OBJ/vanishing", "OBJ", V1, { select: "kind7", hover: "kind3", frames: [T0, T1, T2] });
add("E/OBJ/acid", "OBJ", V3, { select: "kind4", hover: "kind1", frames: two });
add("E/H3/glass", "H3", V1, { select: "plain", hover: "things", frames: two });
add("E/B15/bonus", "B15", V1, { select: "kind7", hover: "plain", frames: two });
add("E/OBJ/sliced", "OBJ", V1, {
  select: "things",
  hover: "plain",
  slice: "mid",
  show: { hidden: true },
  frames: two,
});

// F: the survey's marks
add("F/LESSON/near", "LESSON", V1, { survey: 5, zoom: 1, show: { labels: true } });
add("F/LESSON/far", "LESSON", V3, { survey: 5, zoom: 0.35 });
add("F/L22/travel", "L22", V1, { survey: 4, frames: [T0, T1] });

// G: kinds hidden from the legend
add("G/OBJ", "OBJ", V1, { hide: 3, frames: [T0, T1] });
add("G/L22", "L22", V1, { hide: 1, frames: [T0, T1] });
add("G/LESSON/markers", "LESSON", V3, { hide: 2, show: { models: false, labels: true } });

// H: a device pixel ratio of two
for (const name of ["L1", "LESSON", "OBJ", "B15", "H3", "L94", "F6", "H10"]) {
  add(`H/${name}/v1`, name, V1, { dpr: 2, show: { labels: true } });
  add(`H/${name}/v3`, name, V3, { dpr: 2, show: { through: true } });
}
add("H/LESSON/select", "LESSON", V1, { dpr: 2, select: "things", hover: "plain" });
add("H/OBJ/flat", "OBJ", V1, { dpr: 2, show: { skins: false, base: true, start: true } });

// I: circuits turned over, beams and devices together, and what travels
// meeting the beams it finds changed
add("I/OBJ/red", "OBJ", V1, { flip: [3], show: { labels: true }, frames: [T0, T1] });
add("I/OBJ/red-markers", "OBJ", V3, { flip: [3], show: { models: false, labels: true } });
add("I/OBJ/both", "OBJ", V1, { flip: [2, 3], frames: [T0, T1, T2] });
add("I/OBJ/twice", "OBJ", V1, { flip: [3, 3] });
add("I/LESSON/yellow", "LESSON", V1, { flip: [0], show: { labels: true }, frames: [T0, T1] });
add("I/F3/all", "F3", V1, { flip: [0, 1, 2, 3], frames: [T0, T1] });
add("I/F6/all", "F6", V3, { flip: [0, 1, 2, 3], show: { models: false, labels: true } });
add("I/S8/beam", "S8", V1, { flip: [0, 1, 2, 3], show: { objects: false } });

const seen = new Set();
for (const c of cases) {
  if (seen.has(c.id)) throw new Error(`duplicate case ${c.id}`);
  seen.add(c.id);
}

// Whether the frame goes on being drawn: each on its own, a thing that turns,
// a block that cycles, a skin that cycles, a beam, and what travels.
const quiet = { objects: false, skins: false };
export const live = [
  ["L1", {}],
  ["L1/markers", { models: false }],
  ["L1/quiet", quiet],
  ["L35/fire", { objects: false }],
  ["L35/quiet", quiet],
  ["S8/beam", quiet],
  ["S8/beam-skinned", { objects: false }],
  ["L76/vanishing", quiet],
  ["L22/markers", { models: false, skins: false }],
  ["L22/still", { models: false, skins: false, travel: false }],
  ["B1/swirl", { objects: false }],
  ["S5/invisible", { objects: false }],
  ["L94/platform", { objects: false, skins: false }],
  ["L94/still", { objects: false, skins: false, travel: false }],
  ["OBJ", {}],
  ["OBJ/quiet", quiet],
  ["H10", {}],
  ["L51/wheel", { models: false, skins: false }],
].map(([id, show]) => ({ id, level: LEVELS[id.split("/")[0]], yaw: 45, pitch: 35, show }));
