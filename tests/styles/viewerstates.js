// The interface states of the plain viewer and of the page for a missing path.
import { top } from "../browser/playhelpers.js";
import { LESSON, NARROW, NOTED, PHONE, WIDE, click, missing, on, unnamed } from "./statehelpers.js";

const FITTED = "#corner:not([hidden]) #fitBtn.fitted";

export const viewerStates = [
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
