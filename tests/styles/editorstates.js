// The interface states of Your levels, of the editor and of its boxes.
import { TYPE } from "../../public/js/format/lattice.js";
import { top } from "../browser/playhelpers.js";
import { indexOf } from "../browser/communityhelpers.js";
import {
  FOR_DISC,
  HOME,
  KEYED,
  ONE,
  OVERFULL,
  PHONE,
  PLATFORM,
  RICH,
  SHELF,
  UNFOLDED,
  WIDE,
  bundleFile,
  draggedOver,
  formOn,
  image,
  on,
  own,
  patchFile,
  quiet,
  select,
  serves,
  visible,
} from "./statehelpers.js";

export const editorStates = [
  ...on(WIDE, [
    {
      name: "Your levels and the community levels unfolded with nothing in them",
      seed: { ...UNFOLDED, "kula.community": "open" },
      stub: serves(indexOf({})),
      stands: "#sidebar:has(#communityEmpty:not([hidden])) #draftNew",
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
  ]),
  ...on(PHONE, [
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
  ]),
];
