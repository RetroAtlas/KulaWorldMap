// The interface states of play, of a level carried in its link and of the community levels.
import { frozen, onward, stepUntil } from "../browser/helpers.js";
import { BUNDLED, TWO } from "../browser/communityhelpers.js";
import {
  ONE,
  PHONE,
  PLATFORM,
  RICH,
  ROUTED,
  WIDE,
  carried,
  on,
  panelInPlay,
  play,
  select,
  serves,
} from "./statehelpers.js";

export const playStates = [
  ...on(WIDE, [
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
  ]),
  ...on(PHONE, [
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
  ]),
];
