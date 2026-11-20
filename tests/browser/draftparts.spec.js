import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, KEY, shown } from "./drafthelpers.js";
import { blank, setMeta } from "../../public/js/format/project.js";

const own = (id) => `/#DRAFT/${id}/45,35/fit/33`;

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
  const bundles = { 4: { title: "Spiral", author: "", notes: "", levels: [2, 3], updated: 1 } };
  await kept(page, ["Alpha", "Beta", "Gamma"], { bundles, hash: own(3) });
  const group = page.locator("#draftRows details.bundle");
  await expect(card(page)).toBeVisible();
  // folded behind the card, as a visitor may have left it before the level came on screen
  await group.evaluate((fold) => (fold.open = false));
  await back(page).click();
  expect(await group.evaluate((fold) => fold.open)).toBe(true);
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
