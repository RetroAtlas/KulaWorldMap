import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, KEY, arrives, shown, stored, toBundle } from "./drafthelpers.js";
import { blank, setMeta } from "../../public/js/format/project.js";

const own = (id) => `/#DRAFT/${id}/45,35/fit/33`;
const SPIRAL = { title: "Spiral", author: "", notes: "", levels: [2, 3], updated: 1 };

/** Open the map on `hash` with levels of your own kept under these titles, numbered from one. */
async function kept(page, titles, { bundles = {}, hash = EDIT } = {}) {
  const drafts = Object.fromEntries(
    titles.map((title, i) => [
      i + 1,
      { doc: setMeta(blank("HIRO"), { title }), updated: titles.length - i, saved: null, edits: 0 },
    ]),
  );
  await page.addInitScript(
    ([key, store]) => localStorage.setItem(key, JSON.stringify(store)),
    [KEY, { version: 1, next: 100, drafts, bundles }],
  );
  await page.goto(hash);
  await settle(page);
  await expect(tiles(page)).toHaveCount(titles.length);
}

const list = (page) => page.locator("#draftList");
const card = (page) => page.locator("#draftCard");
const back = (page) => page.locator("#draftBack");
const line = (page) => page.locator("#draftOnScreen");
const tiles = (page) => page.locator("#draftRows .tile");
const tile = (page, title) => tiles(page).filter({ hasText: title });
const current = (page) => page.locator('#draftRows .tile[aria-current="true"]');
const title = (page) => page.locator("#chipLine b");
const scrolled = (page) => page.locator("#sidebar").evaluate((side) => side.scrollTop);
const group = (page) => page.locator("#draftRows details.bundle");
const bundleCard = (page) => page.locator("#bundleCard");
const isOpen = (fold) => fold.evaluate((d) => d.open);
/** Show the level a link names, as a link followed in the tab does. */
const follow = (page, hash) => page.evaluate((hash) => (location.hash = hash), hash);

test("a level of your own coming on screen stands its card in the list's place, and the card's way back stands the list with the keyboard on the level's tile", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await expect(list(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await page.locator("#draftNew").click();
  await expect(card(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  // nothing of the list is left for a reader
  await expect(page.getByRole("button", { name: "new level" })).toHaveCount(0);
  await expect(page.locator("#yoursFold > p.sub")).toBeVisible();
  await expect(page.getByRole("group", { name: "Level", exact: true })).toHaveId("draftCard");
  await expect(card(page).locator(":scope > :first-child")).toHaveId("draftBack");
  const way = card(page).getByRole("button", { name: "Back to your levels", exact: true });
  await expect(way).toHaveText("your levels");
  await way.click();
  await expect(list(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(current(page)).toBeFocused();
  await expect(current(page).locator(".name")).toHaveText("Untitled level");
  expect(errors).toEqual([]);
});

test("the On screen line names the level of your own on screen while the list stands, and it and the level's tile pressed again each stand the level's card", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta"]);
  await expect(list(page)).toBeVisible();
  await expect(line(page)).toBeHidden();
  await tile(page, "Beta").click();
  await expect(card(page)).toBeVisible();
  await back(page).click();
  await expect(line(page)).toBeVisible();
  await expect(line(page).locator("span")).toHaveText(["On screen", "Beta"]);
  await expect(list(page).locator(":scope > :first-child")).toHaveId("draftOnScreen");
  await line(page).click();
  await expect(card(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(page.locator("#draftTitle")).toHaveValue("Beta");
  await back(page).click();
  await expect(current(page).locator(".name")).toHaveText("Beta");
  await current(page).click();
  await expect(card(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  expect((await shown(page)).draft).toBe(2);
  await page.evaluate(() => (location.hash = "#HIRO/1/45,35/fit/33"));
  await expect(title(page)).toHaveText("LEVEL 2");
  await expect(list(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(line(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test("the card takes the keyboard and the sidebar's view from a tile pressed in the list, and a step with the keyboard on the map moves neither", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const titles = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
  await kept(page, titles);
  // the last tile lies far down the list, so the card that takes the list's place ends above it
  await tile(page, "Eight").click();
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toBeFocused();
  await expect(back(page)).toBeInViewport();
  // from the sidebar's foot, where the card's first line lies above its top
  await page.locator("#cv").focus();
  await page.locator("#sidebar").evaluate((side) => (side.scrollTop = side.scrollHeight));
  const foot = await scrolled(page);
  await expect(back(page)).not.toBeInViewport();
  await page.keyboard.press("[");
  await expect(title(page)).toHaveText("Seven");
  await expect(card(page)).toBeVisible();
  await expect(page.locator("#draftTitle")).toHaveValue("Seven");
  await expect(page.locator("#cv")).toBeFocused();
  expect(await scrolled(page)).toBe(foot);
  expect(errors).toEqual([]);
});

test("delete stands the list again with the keyboard on new level, also where the press left the focus off the button", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta"], { hash: own(1) });
  await expect(card(page)).toBeVisible();
  const del = card(page).getByRole("button", { name: "delete" });
  await del.click();
  await del.click();
  await expect(title(page)).toHaveText("LEVEL 1");
  await expect(list(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(page.locator("#draftNew")).toBeFocused();
  await expect(page.locator("#draftNew")).toBeInViewport();
  // as in a browser whose buttons take no focus from a pointer
  await tile(page, "Beta").click();
  await page.locator("#cv").focus();
  await del.dispatchEvent("click");
  await del.dispatchEvent("click");
  await expect(tiles(page)).toHaveCount(0);
  await expect(list(page)).toBeVisible();
  await expect(page.locator("#draftNew")).toBeFocused();
  expect(errors).toEqual([]);
});

test("the way back opens the group of a bundled level for its tile, and gives the keyboard to the On screen line where the filter hides the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL }, hash: own(3) });
  await expect(card(page)).toBeVisible();
  // folded behind the card, as a visitor may have left it before the level came on screen
  await group(page).evaluate((fold) => (fold.open = false));
  await back(page).click();
  expect(await isOpen(group(page))).toBe(true);
  await expect(current(page)).toBeFocused();
  await expect(current(page).locator(".name")).toHaveText("Gamma");
  await page.locator("#draftFilter").fill("alpha");
  await expect(tiles(page)).toHaveCount(1);
  await line(page).click();
  await expect(card(page)).toBeVisible();
  await back(page).click();
  await expect(list(page)).toBeVisible();
  await expect(line(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("the browser's Back goes from level to level whatever part stood, and stands the part of the level it returns to with the keyboard and the sidebar's view left alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha"]);
  await tile(page, "Alpha").click();
  await expect(card(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/1\//);
  // the list and the card change places, which adds nothing to the history
  await back(page).click();
  await line(page).click();
  await back(page).click();
  await expect(list(page)).toBeVisible();
  await line(page).click();
  await expect(card(page)).toBeVisible();
  await page.locator("#cv").focus();
  await page.locator("#sidebar").evaluate((side) => (side.scrollTop = 0));
  await page.goBack();
  await expect(title(page)).toHaveText("LEVEL 1");
  await expect(list(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await page.goForward();
  await expect(title(page)).toHaveText("Alpha");
  await expect(card(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  expect(await scrolled(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("edit the bundle stands the bundle's card in the list's place and says which bundle's card it is, and the card's way back stands the list with the keyboard on edit the bundle, or where it goes with no bundle once the filter hides the group", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL } });
  const opener = group(page).locator(".bar").getByRole("button", { name: "edit the bundle" });
  await group(page).locator("summary").click();
  await opener.click();
  await expect(bundleCard(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(card(page)).toBeHidden();
  await expect(page.locator("#yoursFold > p.sub")).toBeVisible();
  await expect(page.getByRole("group", { name: "Bundle", exact: true })).toHaveId("bundleCard");
  await expect(bundleCard(page)).toBeFocused();
  await expect(page.locator("#say")).toHaveText("Spiral, the bundle's card.");
  await expect(bundleCard(page).locator(":scope > :first-child")).toHaveId("bundleBack");
  await expect(bundleCard(page).locator(".title")).toHaveValue("Spiral");
  const way = bundleCard(page).getByRole("button", { name: "Back to your levels", exact: true });
  await expect(way).toHaveText("your levels");
  // folded behind the card
  await group(page).evaluate((fold) => (fold.open = false));
  await way.click();
  await expect(list(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  // the card is built for the bundle asked for, and holds nothing once it stands no more
  await expect(page.locator("#bundleForm")).toBeEmpty();
  expect(await isOpen(group(page))).toBe(true);
  await expect(opener).toBeFocused();
  // the filter keeps the group for one level, which the card then takes out
  await page.locator("#draftFilter").fill("beta");
  await opener.click();
  await bundleCard(page).locator('.levels [data-act="out"]').first().click();
  await way.click();
  await expect(group(page)).toBeHidden();
  await expect(page.locator("#draftNew")).toBeFocused();
  expect(errors).toEqual([]);
});

test("a bundle taken apart, in another tab or here, gives its card's place back to the list, and the keyboard with it where another tab took the bundle apart", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const tower = { title: "Tower", author: "", notes: "", levels: [1], updated: 2 };
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL, 5: tower } });
  const theirs = await stored(page);
  delete theirs.bundles[5];
  await group(page).nth(1).locator("summary").click();
  await toBundle(page, group(page).nth(1));
  await expect(bundleCard(page).locator(".title")).toHaveValue("Tower");
  await arrives(page, theirs);
  await expect(group(page)).toHaveCount(1);
  await expect(list(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  await expect(page.locator("#bundleForm")).toBeEmpty();
  await expect(page.locator("#draftNew")).toBeFocused();
  await group(page).locator("summary").click();
  await toBundle(page);
  const apart = bundleCard(page).getByRole("button", { name: "take apart" });
  await apart.click();
  await apart.click();
  await expect(group(page)).toHaveCount(0);
  await expect(list(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  await expect(page.locator("#bundleForm")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("a level of your own coming on screen takes the place of a bundle's card and the keyboard from it, where a step along your levels and a level of the game leave the bundle's card standing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL }, hash: own(2) });
  await back(page).click();
  await toBundle(page);
  await expect(bundleCard(page)).toBeFocused();
  await page.keyboard.press("]");
  await expect(title(page)).toHaveText("Gamma");
  await expect(bundleCard(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await follow(page, "#HIRO/1/45,35/fit/33");
  await expect(title(page)).toHaveText("LEVEL 2");
  await expect(bundleCard(page)).toBeVisible();
  await expect(list(page)).toBeHidden();
  await expect(bundleCard(page)).toBeFocused();
  await follow(page, own(1).slice(1));
  await expect(title(page)).toHaveText("Alpha");
  await expect(card(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  await expect(page.locator("#draftTitle")).toHaveValue("Alpha");
  await expect(card(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("the bundle's title on the Level card of a level in a bundle stands that bundle's card, and is named for where it leads", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL }, hash: own(3) });
  await expect(page.locator("#draftPlace")).toHaveText("Spiral · level 2 of 2");
  // the title alone is the button, and the level's place stays words
  await expect(page.locator("#draftPlace button")).toHaveText(["Spiral"]);
  const link = card(page).getByRole("button", { name: "Spiral, the bundle's card", exact: true });
  await expect(link).toHaveText("Spiral");
  await link.click();
  await expect(bundleCard(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(list(page)).toBeHidden();
  await expect(bundleCard(page).locator(".title")).toHaveValue("Spiral");
  await expect(bundleCard(page)).toBeFocused();
  await expect(page.locator("#say")).toHaveText("Spiral, the bundle's card.");
  expect(errors).toEqual([]);
});

test("a level's name on the bundle's card shows that level and stands its card, also where the level is on screen already, and the name of the level on screen is the current one", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles: { 4: SPIRAL }, hash: own(2) });
  await back(page).click();
  await toBundle(page);
  const marked = bundleCard(page).locator('.levels .name[aria-current="true"]');
  const name = (title) => bundleCard(page).getByRole("button", { name: title, exact: true });
  await expect(marked).toHaveText(["Beta"]);
  await name("Gamma").click();
  await expect(title(page)).toHaveText("Gamma");
  await expect(card(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  await expect(page.locator("#draftTitle")).toHaveValue("Gamma");
  await expect(card(page)).toBeFocused();
  await back(page).click();
  await toBundle(page);
  await expect(marked).toHaveText(["Gamma"]);
  // a step moves the mark and leaves the keyboard on the name it was on
  await name("Gamma").focus();
  await page.keyboard.press("[");
  await expect(title(page)).toHaveText("Beta");
  await expect(marked).toHaveText(["Beta"]);
  await expect(name("Gamma")).toBeFocused();
  // the level already on screen comes on screen no more, and its name stands its card all the same
  await name("Beta").click();
  await expect(card(page)).toBeVisible();
  await expect(bundleCard(page)).toBeHidden();
  await expect(page.locator("#draftTitle")).toHaveValue("Beta");
  await expect(card(page)).toBeFocused();
  expect(errors).toEqual([]);
});
