// What this map's lists of interface states share: what a state is made of, and how the page is
// opened and settled for one.
import { inflateSync } from "node:zlib";
import { KIND, TYPE } from "../../public/js/format/lattice.js";
import { blank, setMeta, writeProject } from "../../public/js/format/project.js";
import { writeBundle } from "../../public/js/format/bundle.js";
import { description, planAll, ppf } from "../../public/js/format/patch.js";
import { digestOf } from "../../public/js/format/share.js";
import { encodeLevel } from "../../public/js/format/sharewrite.js";
import { discs } from "../unit/fixtures.js";
import { streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { top } from "../browser/playhelpers.js";
import { file, fixture } from "../browser/patchhelpers.js";
import { SPIRAL, serving } from "../browser/communityhelpers.js";

// --- the screens, the links and the pointer's rest ---------------------------------------------

export const WIDE = { viewport: { width: 1280, height: 720 } };
export const PHONE = { viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true };
// a phone's width with a pointer that hovers, which touch alone takes away
export const NARROW = { viewport: { width: 375, height: 700 } };
export const on = (screen, list) => list.map((state) => ({ screen, ...state }));

const LEVEL_1 = "#HIRO/0/45,35/fit/33";
export const NOTED = "#MARS/12/45,35/fit/33";
export const LESSON = "#HIRO/19/45,35/fit/33";
export const ROUTED = `${LEVEL_1}/rTzkGZtmZ`;
export const own = (id) => `#DRAFT/${id}/45,35/fit/33`;
/** The link that carries a level whole, deflated when a state opens with it. */
export const carried = () =>
  `#SHARED/${digestOf(writeProject(SPIRAL))}/45,35/fit/33/${encodeLevel(SPIRAL)}`;

/** Where the pointer rests while a state is read, off every button and block. */
export const REST = { x: 2, y: 300 };

// --- the levels a state keeps in storage -------------------------------------------------------

export const HOME = [17, 17, 17];
export const PLATFORM = [19, 20, 17];
const START = { type: TYPE.START, facing: 3 };
export const UNFOLDED = { "kula.yours": "open" };
const level = (world, title, more = {}) => setMeta(blank(world), { title, ...more });
const built = (title, blocks, more = {}) => ({ ...level("HIRO", title, more), blocks });
const entry = (doc, updated, saved = null, edits = 0) => ({ doc, updated, saved, edits });
/** A state's storage and link with these levels kept, the first on screen, Your levels unfolded. */
const kept = (drafts, bundles = {}) => ({
  seed: { ...UNFOLDED, "kula.drafts": JSON.stringify({ version: 1, drafts, bundles }) },
  link: own(1),
});
const row = (kind, n, y) =>
  Array.from({ length: n }, (_, i) => ({ cell: [3 + (i % 28), y + Math.floor(i / 28), 17], kind }));

export const ONE = kept({ 1: entry(level("HIRO", "Alpha"), 1) });

// blocks that between them bring up every part of the Level card and of the panel's form
export const RICH = kept({
  1: entry(
    built(
      "Rich",
      [
        {
          cell: HOME,
          kind: KIND.PLAIN,
          faces: {
            0: START,
            1: { type: TYPE.SWITCH, variant: 2 },
            5: { type: TYPE.COIN, variant: 1 },
          },
        },
        { cell: [17, 18, 17], kind: KIND.PLAIN },
        { cell: PLATFORM, kind: KIND.PLATFORM, far: [19, 24, 17], length: 2, speed: 30 },
        { cell: [21, 20, 17], kind: KIND.LASER, far: [25, 20, 17], colour: 3 },
      ],
      { author: "Ada", notes: "A few words." },
    ),
    1,
  ),
});

export const KEYED = kept({
  1: entry(
    built("Keyed", [{ cell: HOME, kind: KIND.PLAIN, faces: { 0: START, 1: { type: TYPE.KEY } } }], {
      author: "Ada",
    }),
    1,
  ),
});

// every mark of the overview: findings, a count beyond every disc and one beyond the game's room
export const OVERFULL = kept({
  1: entry(
    built("Overfull", [
      { cell: HOME, kind: KIND.PLAIN, faces: { 1: { type: TYPE.HEDGEHOG } } },
      ...row(KIND.VANISHING, 15, 20),
      ...row(KIND.CRUMBLING, 65, 22),
    ]),
    1,
  ),
});

// all that Your levels lists: loose levels, a bundle and an entry it cannot read
export const SHELF = kept(
  {
    1: entry(level("HIRO", "Alpha"), 4),
    2: entry(level("MARS", "Spiral 1"), 3, 3, 0),
    3: entry(level("INCA", "Spiral 2"), 2, 2, 1),
    4: entry(level("HIRO", "Spiral 3"), 1, 1, 0),
    6: { doc: { format: "something-else", blocks: [] }, updated: 2 },
    7: entry(level("MARS", "Beta"), 3),
  },
  { 5: { title: "Spiral campaign", author: "Ada", notes: "", levels: [2, 3, 4], updated: 5 } },
);

function startless() {
  const doc = synthetic(6, "No start");
  delete doc.blocks[0].faces;
  return doc;
}
// levels the disc box says different things of: a warning, a size and an error
export const FOR_DISC = kept({
  1: entry(setMeta(synthetic(6), { into: "/HIRO/HIRO.PAK#1" }), 3),
  2: entry(synthetic(30, "Tower"), 2),
  3: entry(startless(), 1),
});

// --- the files a state gives the page ----------------------------------------------------------

export const image = () => file("image.bin", syntheticImage());

let patch = null;
/** A PPF over the synthetic image, as the page's own writers make it. */
export const patchFile = () =>
  (patch ??= (async () => {
    const blob = new Blob([syntheticImage()]);
    const items = fixture.sets
      .find((set) => set.name === "across packs")
      .items.map(({ pack, slot, blocks, title }) => ({
        pack,
        slot,
        stream: streamOf(synthetic(blocks, title)),
        title,
      }));
    const inflate = async (bytes) => new Uint8Array(inflateSync(bytes));
    const planned = await planAll(blob, items, inflate, discs);
    const said = description(items.map((item) => item.title));
    return file("set.ppf", await ppf(blob, planned.writes, said));
  })());

/** A bundle with a level naming a world the disc has not, so its read leaves a report. */
export const bundleFile = () =>
  file(
    "spiral-campaign.kula-bundle.json",
    writeBundle({
      title: "Spiral campaign",
      author: "Ada",
      notes: "",
      levels: [
        level("MARS", "Spiral 1"),
        { ...level("INCA", "Spiral 2"), world: "NOWHERE" },
        level("HIRO", "Spiral 3"),
      ],
    }),
  );

// --- what the steps are made of ----------------------------------------------------------------

/** Answer for the annotations with the key's name taken out, so a thing stands unnamed. */
export const unnamed = (page) =>
  page.route("**/annotations.json", async (route) => {
    const response = await route.fetch();
    const annotations = await response.json();
    delete annotations.types[TYPE.KEY].name;
    await route.fulfill({ response, json: annotations });
  });

export const serves = (index) => (page) => serving(page, index);
/** Run the page's clock on until the notices and the note of a save have left. */
export const quiet = (page) => page.clock.runFor(3200);
export const visible = (page, selector) => page.waitForSelector(selector, { state: "visible" });
export const click = (page, point, options) => page.mouse.click(point.x, point.y, options);

/** Select a face of a cell through the panel's own entry, as the hit test would. */
export const select = (page, cell, face = 0) =>
  page.evaluate(
    async ([cell, face]) => {
      const at = (path) => import(new URL(`js/${path}`, location.href).href);
      const [{ state }, { showCell }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
      );
      showCell({ ...state.idx.cells.get(cellKey(...cell)), face });
    },
    [cell, face],
  );

/** Turn editing on by its key and open the form on a face of a block. */
export async function formOn(page, cell, face = 0) {
  await page.keyboard.press("w");
  await select(page, cell, face);
}

/** Roll the ball onto the level by its key. */
export async function play(page) {
  await page.keyboard.press("p");
  await visible(page, "#play");
}

/** Open the panel on a block beside the ball's start, as a right click does in play. */
export const panelInPlay = async (page) =>
  click(page, await top(page, [17, 15, 17]), { button: "right" });

/** Hold a file over a box, as the browser says while one is dragged across the page. */
export const draggedOver = (page, id) =>
  page.evaluate((id) => {
    const init = { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() };
    document.getElementById(id).dispatchEvent(new DragEvent("dragover", init));
  }, id);

// --- opening and settling the page -------------------------------------------------------------

/** In the page: the level, a sized canvas and the shown world's atlas awaited, animations ended. */
async function landed() {
  const at = (path) => import(new URL(`js/${path}`, location.href).href);
  const [{ state }, { atlasFor }] = await Promise.all(
    ["viewer/state.js", "viewer/draw/atlas.js"].map(at),
  );
  const frame = () => new Promise(requestAnimationFrame);
  const deadline = Date.now() + 10000;
  const up = () =>
    state.lvl && document.getElementById("cv").clientWidth > 0 && atlasFor(state.lvl.theme);
  while (!up()) {
    if (Date.now() > deadline) throw new Error("the map did not load");
    await frame();
  }
  document.getAnimations().forEach((animation) => animation.finish());
  await frame();
  await frame();
}

/** In the page: animations ended, then frames until the strips' heights and the canvas stand. */
async function laidOut() {
  const map = document.querySelector(".map");
  const cv = document.getElementById("cv");
  const palette = document.getElementById("palette");
  // the strips' heights reach the map through ResizeObservers, a frame late
  const sizes = () =>
    [
      ...["--under-h", "--course-h", "--play-h"].map((name) => map.style.getPropertyValue(name)),
      palette.style.getPropertyValue("--strip-h"),
      cv.width,
      cv.height,
    ].join();
  for (let was = null, round = 0; round < 60; round++) {
    document.getAnimations().forEach((animation) => animation.finish());
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const now = sizes();
    if (now === was) return;
    was = now;
  }
  throw new Error("the layout did not settle");
}

/** Open the map for a state: its storage seeded, its file answered, its link landed. */
async function onMap(page, base, state) {
  // no other world's atlas is fetched behind the first paint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true } });
  });
  if (state.seed)
    await page.addInitScript((entries) => {
      for (const [key, text] of entries) localStorage.setItem(key, text);
    }, Object.entries(state.seed));
  await state.stub?.(page);
  const link = state.link ?? LEVEL_1;
  await page.goto(`${base}/${typeof link === "function" ? link() : link}`);
  await page.evaluate(landed);
}

/** Open the page for a missing path, which has no map to wait for. */
export const missing = (page, base) => page.goto(`${base}/404.html`);

/** Open the page for a state, before its steps. */
export const open = (page, base, state) => (state.open ?? onMap)(page, base, state);

/** Settle the layout once a state's steps are done, where its page is the map. */
export const settled = (page, state) => (state.open ? null : page.evaluate(laidOut));
