// This map's half of the style proof: its interface states, and how the page is opened for one.
import { inflateSync } from "node:zlib";
import { KIND, TYPE } from "../../public/js/format/lattice.js";
import { blank, setMeta, writeProject } from "../../public/js/format/project.js";
import { writeBundle } from "../../public/js/format/bundle.js";
import { description, planAll, ppf } from "../../public/js/format/patch.js";
import { digestOf } from "../../public/js/format/share.js";
import { encodeLevel } from "../../public/js/format/sharewrite.js";
import { discs } from "../unit/fixtures.js";
import { streamOf, synthetic, syntheticImage } from "../unit/synthetic.js";
import { frozen, onward, stepUntil } from "../browser/helpers.js";
import { top } from "../browser/playhelpers.js";
import { file, fixture } from "../browser/patchhelpers.js";
import { BUNDLED, SPIRAL, TWO, indexOf, serving } from "../browser/communityhelpers.js";

// --- the screens, the links and the pointer's rest ---------------------------------------------

const WIDE = { viewport: { width: 1280, height: 720 } };
const PHONE = { viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true };
// a phone's width with a pointer that hovers, which touch alone takes away
const NARROW = { viewport: { width: 375, height: 700 } };

const LEVEL_1 = "#HIRO/0/45,35/fit/33";
const NOTED = "#MARS/12/45,35/fit/33";
const LESSON = "#HIRO/19/45,35/fit/33";
const ROUTED = `${LEVEL_1}/rTzkGZtmZ`;
const own = (id) => `#DRAFT/${id}/45,35/fit/33`;
/** The link that carries a level whole, deflated when a state opens with it. */
const carried = () =>
  `#SHARED/${digestOf(writeProject(SPIRAL))}/45,35/fit/33/${encodeLevel(SPIRAL)}`;

/** Where the pointer rests while a state is read, off every button and block. */
export const REST = { x: 2, y: 300 };

// --- the levels a state keeps in storage -------------------------------------------------------

const HOME = [17, 17, 17];
const PLATFORM = [19, 20, 17];
const START = { type: TYPE.START, facing: 3 };
const UNFOLDED = { "kula.yours": "open" };
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

const ONE = kept({ 1: entry(level("HIRO", "Alpha"), 1) });

// blocks that between them bring up every part of the Level card and of the panel's form
const RICH = kept({
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

const KEYED = kept({
  1: entry(
    built("Keyed", [{ cell: HOME, kind: KIND.PLAIN, faces: { 0: START, 1: { type: TYPE.KEY } } }], {
      author: "Ada",
    }),
    1,
  ),
});

// every mark of the overview: findings, a count beyond every disc and one beyond the game's room
const OVERFULL = kept({
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
const SHELF = kept(
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
const FOR_DISC = kept({
  1: entry(setMeta(synthetic(6), { into: "/HIRO/HIRO.PAK#1" }), 3),
  2: entry(synthetic(30, "Tower"), 2),
  3: entry(startless(), 1),
});

// --- the files a state gives the page ----------------------------------------------------------

const image = () => file("image.bin", syntheticImage());

let patch = null;
/** A PPF over the synthetic image, as the page's own writers make it. */
const patchFile = () =>
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
const bundleFile = () =>
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
const unnamed = (page) =>
  page.route("**/annotations.json", async (route) => {
    const response = await route.fetch();
    const annotations = await response.json();
    delete annotations.types[TYPE.KEY].name;
    await route.fulfill({ response, json: annotations });
  });

const serves = (index) => (page) => serving(page, index);
/** Run the page's clock on until the notices and the note of a save have left. */
const quiet = (page) => page.clock.runFor(3200);
const visible = (page, selector) => page.waitForSelector(selector, { state: "visible" });
const click = (page, point, options) => page.mouse.click(point.x, point.y, options);

/** Select a face of a cell through the panel's own entry, as the hit test would. */
const select = (page, cell, face = 0) =>
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
async function formOn(page, cell, face = 0) {
  await page.keyboard.press("w");
  await select(page, cell, face);
}

/** Roll the ball onto the level by its key. */
async function play(page) {
  await page.keyboard.press("p");
  await visible(page, "#play");
}

/** Open the panel on a block beside the ball's start, as a right click does in play. */
const panelInPlay = async (page) => click(page, await top(page, [17, 15, 17]), { button: "right" });

/** Hold a file over a box, as the browser says while one is dragged across the page. */
const draggedOver = (page, id) =>
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
const missing = (page, base) => page.goto(`${base}/404.html`);

/** Open the page for a state, before its steps. */
export const open = (page, base, state) => (state.open ?? onMap)(page, base, state);

/** Settle the layout once a state's steps are done, where its page is the map. */
export const settled = (page, state) => (state.open ? null : page.evaluate(laidOut));

// --- the states --------------------------------------------------------------------------------

const on = (screen, list) => list.map((state) => ({ screen, ...state }));
const FITTED = "#corner:not([hidden]) #fitBtn.fitted";

/** The states: `stands` is absent from the plain map, `held` leaves the pointer where it is. */
export const states = [
  ...on(WIDE, [
    { name: "the map", stands: FITTED },
    {
      name: "a level's note, a kind switched off in the legend",
      link: NOTED,
      steps: (page) => page.locator("#kinds button.kind").first().click(),
      stands: '.app:has(#chipNote:not([hidden])) #kinds .kind[aria-pressed="false"]',
    },
    {
      name: "the sidebar closed",
      steps: (page) => page.keyboard.press("s"),
      stands: '#menuBtn[aria-expanded="false"] .bars',
    },
    {
      name: "the Japanese disc",
      link: "#HAZE/5/45,35/fit/33/d-jp",
      stands: '#release button[data-release="jp"][aria-pressed="true"]',
    },
    {
      name: "Your levels and the community levels unfolded with nothing in them",
      seed: { ...UNFOLDED, "kula.community": "open" },
      stub: serves(indexOf({})),
      stands: "#sidebar:has(#communityEmpty:not([hidden])) #draftNew",
    },
    {
      name: "a search held to the world",
      async steps(page) {
        await page.fill("#search", "key, level, hiro");
        await page.locator("#scope button").nth(1).click();
      },
      stands: "#found .widen",
    },
    {
      name: "the panel on a switch",
      link: `${LESSON}/14,13,17`,
      stands: "#detail:not([hidden]) .press .lamp.off",
    },
    {
      name: "the panel on a teleporter beside the level's settings",
      link: `${LESSON}/29,14,17`,
      stands: "#detail:not([hidden]) .goto .at",
    },
    {
      name: "the panel folded on a hazard",
      link: `${LESSON}/16,16,17`,
      steps: (page) => page.click("#detail .fold"),
      stands: "#detail.folded:not([hidden]) h3 .tag",
    },
    {
      name: "the panel on a thing with no name, with Play from here",
      seed: { "kula.display": '{"playfrom":true}' },
      stub: unnamed,
      steps: async (page) => click(page, await top(page, [20, 15, 17])),
      stands: "#detail:not([hidden]):has(.unnamed) .put button",
    },
    {
      name: "the tooltip",
      async steps(page) {
        const point = await top(page, [20, 15, 17]);
        await page.mouse.move(point.x, point.y);
      },
      held: true,
      stands: "#tip:not([hidden])",
    },
    {
      name: "five notices at once",
      async steps(page) {
        // Objects off, then the keys of switches that need what is off, each raising a notice
        for (const key of "omxlnh") await page.keyboard.press(key);
      },
      stands: "#toastStack:has(.toast.show) .toast-more",
    },
    {
      name: "the keys",
      steps: (page) => page.keyboard.press("?"),
      stands: "#help:not([hidden]) section + section dl",
    },
    {
      name: "About",
      steps: (page) => page.click("#aboutBtn"),
      stands: "#help:not([hidden]) .box p a",
    },
    {
      name: "the settings with a key held",
      async steps(page) {
        await page.keyboard.press("Shift+s");
        await page.keyboard.down("c");
      },
      stands: "#settings kbd.held",
    },
    {
      name: "the planner's hint",
      steps: (page) => page.keyboard.press("r"),
      stands: "#course:not([hidden]) #courseStatus.hint",
    },
    {
      name: "a route with a jump refused and Clear armed",
      async steps(page) {
        await page.keyboard.press("r");
        await click(page, await top(page, [17, 15, 17]));
        await page.keyboard.down("Shift");
        await click(page, await top(page, [17, 14, 17]));
        await page.keyboard.up("Shift");
        await page.click("#courseClear");
      },
      stands: ".map:has(#toastStack .toast.show) #courseClear.warn",
    },
    {
      name: "a level of your own, its card just saved",
      ...RICH,
      async steps(page) {
        await page.fill("#draftTitle", "Rich II");
        // the save lands a moment after the change, and its note with it
        await page.clock.runFor(300);
      },
      stands: "#draftCard .note:not([hidden])",
    },
    {
      name: "a bundle unfolded in Your levels, its card open with take apart armed",
      ...SHELF,
      link: own(3),
      async steps(page) {
        await quiet(page);
        await page.click("#draftRows details.bundle > summary .arrange");
        await page.click('#draftRows details.bundle > .card .row button:has-text("take apart")');
      },
      stands: "#draftRows details.bundle[open] > .card .row button.warn",
    },
    {
      name: "Your levels as a list, a bundle folded and a level that cannot be read, its removal armed",
      ...SHELF,
      async steps(page) {
        await quiet(page);
        await page.click('#draftView button[data-view="list"]');
        await page.click("#draftUnread button");
      },
      stands: "#yours:has(#draftUnread .warn) #draftRows details.bundle:not([open]) > summary",
    },
    {
      name: "a bundle's file read with a report",
      seed: UNFOLDED,
      async steps(page) {
        await page.setInputFiles("#draftFile", bundleFile());
        await visible(page, "#draftCard details.report");
        await quiet(page);
        await page.click("#draftCard details.report > summary");
      },
      stands: "#draftCard details.report[open] ul li",
    },
    {
      name: "a level of your own past the game's room",
      ...OVERFULL,
      stands: "#chipNote .overview:has(.counts .high):has(.findings .there) .counts .over",
    },
    {
      name: "editing with the planner",
      ...ONE,
      async steps(page) {
        await page.keyboard.press("r");
        await page.keyboard.press("w");
      },
      stands: "body.editing #course:not([hidden]) #courseStatus",
    },
    {
      name: "a rectangle being dragged with the Select tool",
      ...ONE,
      async steps(page) {
        await page.keyboard.press("w");
        await page.keyboard.press("i");
        const point = await top(page, HOME);
        await page.mouse.move(point.x - 60, point.y + 140);
        await page.mouse.down();
        await page.mouse.move(point.x - 20, point.y + 180, { steps: 4 });
      },
      held: true,
      stands: "body.marquee #cv",
    },
    {
      name: "selected blocks being moved",
      ...ONE,
      async steps(page) {
        await page.keyboard.press("w");
        await page.keyboard.press("i");
        const point = await top(page, HOME);
        await page.mouse.move(point.x - 80, point.y - 80);
        await page.mouse.down();
        await page.mouse.move(point.x + 80, point.y + 80, { steps: 4 });
        await page.mouse.up();
        await visible(page, "#toolStatus:not(:empty)");
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 30, point.y + 20, { steps: 4 });
      },
      held: true,
      stands: "body.moving #cv",
    },
    {
      name: "the form on the start, the block's information unfolded",
      ...RICH,
      async steps(page) {
        await formOn(page, HOME);
        await page.click("#detail details.raw > summary");
      },
      stands: "#detail:not([hidden]):has(.form .facing) details.raw[open] .press button .lamp",
    },
    {
      name: "the form on a switch",
      ...RICH,
      steps: (page) => formOn(page, HOME, 1),
      stands: "#detail .form .circuit .lamp",
    },
    {
      name: "the form on a coin",
      ...RICH,
      steps: (page) => formOn(page, HOME, 5),
      stands: '#detail .form .swatches button[style*="transparent"]',
    },
    {
      name: "the form on a moving platform",
      ...RICH,
      steps: (page) => formOn(page, PLATFORM),
      stands: '#detail .form input[type="number"][data-field="length"]',
    },
    {
      name: "the form on a key, the key chosen in the palette",
      ...KEYED,
      async steps(page) {
        await page.keyboard.press("w");
        await page.click('#palette .tabs button[data-group="Pickups"]');
        await page.click(`#palette .rows button[data-id="t${TYPE.KEY}"]`);
        await select(page, HOME, 1);
      },
      stands: '#detail .form .row button[data-field="place"][aria-disabled="true"]',
    },
    {
      name: "the disc box with three levels, a file dragged over it",
      ...FOR_DISC,
      async steps(page) {
        await page.click("#draftPatch");
        await page.selectOption("#patchAdd", "2");
        await page.selectOption("#patchAdd", "3");
        await draggedOver(page, "patch");
      },
      stands: "#patch:not([hidden]) .drop.over",
    },
    {
      name: "the disc box with an image read",
      ...FOR_DISC,
      async steps(page) {
        await page.click("#draftPatch");
        await page.setInputFiles("#patchDisc", image());
        await visible(page, "#patchPpf:enabled");
      },
      stands: "#patch #patchPlaying:not([hidden]) li",
    },
    {
      name: "the disc box emptied",
      ...FOR_DISC,
      async steps(page) {
        await page.click("#draftPatch");
        await page.click("#patchClear");
      },
      stands: "#patch:not([hidden]) #patchClear:disabled",
    },
    {
      name: "the import picker with a disc image",
      seed: UNFOLDED,
      steps: (page) => page.setInputFiles("#draftFile", image()),
      stands: "#import:not([hidden]) #importPack",
    },
    {
      name: "a patch waiting for its image, a file dragged over it",
      seed: UNFOLDED,
      async steps(page) {
        await page.setInputFiles("#draftFile", await patchFile());
        await visible(page, "#fromPatch");
        await draggedOver(page, "fromPatch");
      },
      stands: "#fromPatch:not([hidden]) .drop.over",
    },
    {
      name: "a patch's list",
      seed: UNFOLDED,
      async steps(page) {
        await page.setInputFiles("#draftFile", await patchFile());
        await page.setInputFiles("#fromPatchImage", image());
      },
      stands: "#fromPatch #fromPatchLevels li",
    },
    {
      name: "the paste box reading a link",
      ...ONE,
      async steps(page) {
        // no control holds the read, so the box is opened with a reader that never answers
        await page.evaluate(async () => {
          const at = new URL("js/editor/importdialog.js", location.href).href;
          (await import(at)).pasteLevelLink("HIRO", () => new Promise(() => {}));
        });
        await page.fill("#pasteLink", "https://example.test/#SHARED/L1/45,35/fit/33/s");
        await page.click("#pasteOpen");
      },
      stands: "#paste:not([hidden]) #pasteOpen:disabled",
    },
    {
      name: "the share box",
      ...KEYED,
      steps: (page) => page.click("#draftShare"),
      stands: "#share:not([hidden]) #shareSend .row button",
    },
    {
      name: "the bundle box for a level in a bundle",
      ...SHELF,
      link: own(3),
      async steps(page) {
        await quiet(page);
        await page.click("#draftBundle");
      },
      stands: "#bundle:not([hidden]) #bundleSays:not(:empty)",
    },
    { name: "play", steps: play, stands: "body.playing #hud" },
    {
      name: "play with the pad and the panel",
      async steps(page) {
        await play(page);
        await page.click("#padBtn");
        await panelInPlay(page);
      },
      stands: "body.padded:has(#pad:not([hidden])) #detail:not([hidden])",
    },
    {
      name: "play following a route",
      link: ROUTED,
      async steps(page) {
        await play(page);
        await frozen(page);
        await page.click("#followBtn");
      },
      stands: 'body.playing:has(#followBtn[aria-pressed="true"]) #playStatus:not(:empty)',
    },
    {
      name: "a death in play",
      seed: { "kula.display": '{"motion":true}' },
      link: "#INCA/18/45,35/fit/33",
      async steps(page) {
        // the level run until its corkscrew is on its way, then the ball rolled under it
        await frozen(page);
        await play(page);
        await onward(page, 60);
        await page.keyboard.down("ArrowUp");
        await stepUntil(page, { block: [17, 15, 17] }, 60);
        await page.keyboard.up("ArrowUp");
        await stepUntil(page, { moving: false }, 60);
        await stepUntil(page, { dying: true }, 240);
      },
      stands: "#playStatus.dying",
    },
    {
      name: "play in a Simon room",
      link: "#COPYCAT/0/45,35/fit/33",
      steps: play,
      stands: "body.playing #playRound",
    },
    {
      name: "play on a level of your own with editing and the planner",
      ...ONE,
      async steps(page) {
        await page.keyboard.press("r");
        await play(page);
        await page.keyboard.press("w");
      },
      stands: "body.playing.editing #course:not([hidden])",
    },
    {
      name: "a community level on the map",
      stub: serves(TWO),
      link: "#COMMUNITY/1/45,35/fit/33",
      stands:
        '#sidebar:has(#communityView:not([hidden])) #communityTiles .tile[aria-current="true"]',
    },
    {
      name: "a level of a community bundle on the map",
      stub: serves(BUNDLED),
      link: "#COMMUNITY/2-2/45,35/fit/33",
      stands: '#chipNote .shared .members a[aria-current="true"]',
    },
    { name: "a level carried in its link", link: carried, stands: "#chipNote .shared .notes" },
    { name: "the page for a missing path", open: missing, stands: "body > .box h1" },
  ]),
  ...on(PHONE, [
    { name: "the map on a phone", stands: FITTED },
    {
      name: "the drawer on a phone",
      steps: (page) => page.tap("#menuBtn"),
      stands: "body.sidebar-open #scrim",
    },
    { name: "a level's note on a phone", link: NOTED, stands: "#chipNote:not([hidden])" },
    {
      name: "the panel on a phone",
      link: `${LESSON}/14,13,17`,
      stands: "#detail:not([hidden]) .press button",
    },
    {
      name: "the planner on a phone",
      steps: (page) => page.keyboard.press("r"),
      stands: "#course:not([hidden]) #courseStatus.hint",
    },
    {
      name: "editing on a phone",
      ...ONE,
      steps: (page) => page.tap("#editBtn"),
      stands: 'body.editing #editBtn[aria-pressed="true"]',
    },
    {
      name: "editing with the planner on a phone",
      ...ONE,
      async steps(page) {
        await page.keyboard.press("r");
        await page.tap("#editBtn");
      },
      stands: 'body.editing:has(#course:not([hidden])) #editBtn[aria-pressed="true"]',
    },
    {
      name: "the palette on a phone",
      ...ONE,
      async steps(page) {
        await page.tap("#editBtn");
        await page.tap("#paletteBtn");
      },
      stands: "body.editing.sheet-open #palette:not([hidden]) .x",
    },
    {
      name: "the form on a switch on a phone, the block's information unfolded with Play from here",
      ...RICH,
      seed: { ...RICH.seed, "kula.display": '{"playfrom":true}' },
      async steps(page) {
        await formOn(page, HOME, 1);
        await page.tap("#detail details.raw > summary");
      },
      stands:
        "body.editing.sheet-open #detail:has(.put button):has(.form .circuit) details.raw[open] .press button",
    },
    { name: "play on a phone", steps: play, stands: "body.playing.padded #pad" },
    {
      name: "play following a route on a phone",
      link: ROUTED,
      async steps(page) {
        await play(page);
        await frozen(page);
        await page.tap("#followBtn");
      },
      stands: "body.playing:has(#course:not([hidden])) #playStatus:not(:empty)",
    },
    {
      name: "play with the panel on a phone",
      async steps(page) {
        await play(page);
        await panelInPlay(page);
      },
      stands: "body.playing.padded #detail:not([hidden])",
    },
    {
      name: "play on a level of your own on a phone",
      ...ONE,
      steps: play,
      stands: "body.playing:not(.editing) #tools:not([hidden])",
    },
    {
      name: "play with editing and the palette on a phone",
      ...ONE,
      async steps(page) {
        await play(page);
        await page.tap("#editBtn");
        await page.tap("#paletteBtn");
      },
      stands: "body.playing.editing.sheet-open #palette:not([hidden])",
    },
    {
      name: "play with editing and the form on a moving platform on a phone",
      ...RICH,
      async steps(page) {
        await play(page);
        await page.tap("#editBtn");
        await select(page, PLATFORM);
      },
      stands: 'body.playing.editing.sheet-open #detail:not([hidden]) .form input[type="number"]',
    },
    { name: "the page for a missing path on a phone", open: missing, stands: "body > .box h1" },
  ]),
  ...on(NARROW, [
    {
      name: "a level's note and the planner in a narrow window without touch",
      link: NOTED,
      steps: (page) => page.keyboard.press("r"),
      stands: ".map:has(#chipNote:not([hidden])) #course:not([hidden]) #courseStatus.hint",
    },
  ]),
];
