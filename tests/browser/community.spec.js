import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { filledTiles, settle, trackErrors } from "./helpers.js";
import { EDIT, docOf, shown, toasts } from "./drafthelpers.js";
import { writeProject } from "../../public/js/format/project.js";
import { writeBundle } from "../../public/js/format/bundle.js";
import { BUNDLE_IN_CATALOGUE_MOST } from "../../public/js/format/catalogue.js";
import {
  BUNDLED,
  CAMPAIGN,
  EMPTY,
  FAILED,
  HAUL,
  INDEX_PATH,
  NO_SUCH,
  SPIRAL,
  TAKEN_DOWN,
  TWO,
  UNLOADED,
  drawn,
  indexOf,
  opened,
  serving,
} from "./communityhelpers.js";

const COMMUNITY_FILES = /\/js\/community\//;
/** The paths the page asks for, as it asks for them. */
const record = (page) => {
  const asked = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  return asked;
};
const go = (page, hash) =>
  page.evaluate((hash) => {
    location.hash = hash;
  }, hash);
const bar = (page) => page.evaluate(() => location.hash);
const fold = (page) => page.locator("#communityFold");
const isOpen = (page) => fold(page).evaluate((d) => d.open);
const names = (page) => page.locator("#communityTiles .tile .name");
const tile = (page, id) => page.locator(`#communityTiles .tile[data-key="${id}"]`);
const more = (page) => page.locator("#chipNote .more");
const unfolded = (page) => more(page).evaluate((d) => d.open);
const links = (page) => page.locator("#chipNote .members a");
const marked = (page) => page.locator('#chipNote .members a[aria-current="true"]');

test("opening the fold loads the community module and the index once, and lists the levels as tiles, newest first, each with its picture", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const asked = record(page);
  const index = await serving(page, TWO);
  await page.goto(EDIT);
  await settle(page);
  expect(asked.filter((p) => COMMUNITY_FILES.test(p))).toEqual([]);
  expect(index.n).toBe(0);
  await opened(page, 2);
  expect(asked).toContain("/js/community/panel.js");
  expect(index.n).toBe(1);
  await expect(page.locator("#communityCount")).toHaveText("2");
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await expect(page.locator("#communityTiles .tile .tag")).toHaveText(["Community", "Community"]);
  await expect(page.locator("#communityTiles .tile .line")).toHaveText(["INCA", "by Ada · HIRO"]);
  await expect(page.locator("#communityView")).toBeVisible();
  await expect(page.locator("#communityEmpty")).toBeHidden();
  await expect(page.locator("#communityFailed")).toBeHidden();
  await expect(tile(page, 1).locator("canvas.thumb")).toHaveAttribute("aria-hidden", "true");
  await expect.poll(() => drawn(page, 1)).toBeGreaterThan(0);
  await expect.poll(() => drawn(page, 2)).toBeGreaterThan(0);
  await expect(page.locator("#communityTiles .tile[aria-current='true']")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("choosing a tile shows the level, tagged Community, with the author, the notes and the two ways to keep it under the line", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const index = await serving(page, TWO);
  await page.goto(EDIT);
  await settle(page);
  await opened(page, 2);
  await tile(page, 1).click();
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await expect(page.locator("#chipLine .tag")).toHaveText("Community");
  await expect(page.locator("#say")).toHaveText(/^Community, Spiral, /);
  const out = await shown(page);
  expect(out).toMatchObject({ li: -1, theme: "HIRO" });
  expect(out.draft).toBeUndefined();
  const note = page.locator("#chipNote");
  await expect(note).toContainText("By Ada.");
  await expect(note).toContainText("Mind the gap.");
  await expect(note.getByRole("button", { name: "copy this level" })).toBeVisible();
  await expect(note.getByRole("button", { name: "save the file" })).toBeVisible();
  await expect(tile(page, 1)).toHaveAttribute("aria-current", "true");
  await expect(tile(page, 2)).toHaveAttribute("aria-current", "false");
  expect(await filledTiles(page, "#communityTiles")).toEqual(["1"]);
  await expect.poll(() => bar(page)).toMatch(/^#COMMUNITY\/1\//);
  expect(index.n).toBe(1);
  expect(errors).toEqual([]);
});

test("a link to a community level at the start fetches the index once the data has come and shows the level, the fold open on its tiles", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const asked = record(page);
  await serving(page, TWO);
  await page.goto("/#COMMUNITY/1/45,35/fit/33");
  await settle(page);
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await expect(page.locator("#chipLine .tag")).toHaveText("Community");
  expect(await shown(page)).toMatchObject({ li: -1, theme: "HIRO" });
  expect(asked).toContain("/js/community/community.js");
  expect(asked).toContain(INDEX_PATH);
  expect(await isOpen(page)).toBe(true);
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await expect(tile(page, 1)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => bar(page)).toBe("#COMMUNITY/1/45,35/fit/33");
  expect(errors).toEqual([]);
});

test("copy this level under the line makes a level of your own out of a community level, its author and notes kept", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, TWO);
  await page.goto("/#COMMUNITY/1/45,35/fit/33");
  await settle(page);
  await page.locator("#chipNote").getByRole("button", { name: "copy this level" }).click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  await expect(page.locator("#say")).toContainText("Copied Spiral. Draft, Spiral, ");
  const copy = await shown(page);
  expect(copy).toMatchObject({ li: -1, draft: 1, theme: "HIRO" });
  const doc = await docOf(page, copy.draft);
  expect(doc).toMatchObject({
    title: "Spiral",
    author: "Ada",
    notes: "Mind the gap.",
    world: "HIRO",
  });
  expect(doc).not.toHaveProperty("from");
  expect(doc.blocks).toHaveLength(SPIRAL.blocks.length);
  await expect.poll(() => bar(page)).toMatch(/^#DRAFT\/1\//);
  expect(errors).toEqual([]);
});

test("save the file under the line saves the level as the map's own file, named by its title", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, TWO);
  await page.goto("/#COMMUNITY/1/45,35/fit/33");
  await settle(page);
  const saving = page.waitForEvent("download");
  await page.locator("#chipNote").getByRole("button", { name: "save the file" }).click();
  const file = await saving;
  expect(file.suggestedFilename()).toBe("spiral.kula.json");
  expect(readFileSync(await file.path(), "utf8")).toBe(writeProject(SPIRAL));
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the sort orders the levels by title, by author with those naming none last or by world in the game's order, and the filter keeps those whose title, author or world holds its text", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, TWO);
  await page.goto(EDIT);
  await settle(page);
  await opened(page, 2);
  const sort = page.locator("#communitySort");
  await expect(sort).toHaveValue("newest");
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await sort.selectOption("title");
  await expect(names(page)).toHaveText(["Spiral", "Tower"]);
  await sort.selectOption("newest");
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await sort.selectOption("author");
  await expect(names(page)).toHaveText(["Spiral", "Tower"]);
  await sort.selectOption("world");
  await expect(names(page)).toHaveText(["Spiral", "Tower"]);
  const filter = page.locator("#communityFilter");
  const empty = page.locator("#communityEmpty");
  await filter.fill("ADA");
  await expect(names(page)).toHaveText(["Spiral"]);
  await filter.fill("inca");
  await expect(names(page)).toHaveText(["Tower"]);
  await filter.fill("tow");
  await expect(names(page)).toHaveText(["Tower"]);
  await filter.fill("zzz");
  await expect(names(page)).toHaveCount(0);
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("Nothing matches.");
  await expect(page.locator("#communityCount")).toHaveText("2");
  await filter.fill("");
  await expect(names(page)).toHaveText(["Spiral", "Tower"]);
  await expect(empty).toBeHidden();
  expect(errors).toEqual([]);
});

test("an index that holds no level shows the empty line and leaves the count blank", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, indexOf({}));
  await page.goto(EDIT);
  await settle(page);
  await fold(page).locator("summary").click();
  await expect(page.locator("#communityEmpty")).toBeVisible();
  await expect(page.locator("#communityEmpty")).toHaveText(EMPTY);
  await expect(page.locator("#communityCount")).toHaveText("");
  await expect(page.locator("#communityTiles .tile")).toHaveCount(0);
  await expect(page.locator("#communityView")).toBeHidden();
  await expect(page.locator("#communityFailed")).toBeHidden();
  expect(errors).toEqual([]);
});

test("an index that does not arrive is said in the fold with no tiles, and the next opening fetches it again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const index = await serving(page, "", 404);
  await page.goto(EDIT);
  await settle(page);
  const summary = fold(page).locator("summary");
  await summary.click();
  await expect(page.locator("#communityFailed")).toBeVisible();
  await expect(page.locator("#communityFailed")).toHaveText(FAILED);
  await expect(page.locator("#communityTiles .tile")).toHaveCount(0);
  await expect(page.locator("#communityEmpty")).toBeHidden();
  await expect(page.locator("#communityCount")).toHaveText("");
  expect(index.n).toBe(1);
  await summary.click();
  await expect(page.locator("#communityFailed")).toBeHidden();
  await summary.click();
  await expect.poll(() => index.n).toBe(2);
  await expect(page.locator("#communityFailed")).toBeVisible();
  // the index arriving at last lists the levels, the line gone
  await page.unroute(`**${INDEX_PATH}`);
  const served = await serving(page, TWO);
  await summary.click();
  await summary.click();
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await expect(page.locator("#communityFailed")).toBeHidden();
  expect(served.n).toBe(1);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("a link to a level taken down says so once and gives way to the view on screen, at the start and arriving after it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, indexOf({ 1: SPIRAL }, [999]));
  await page.clock.install();
  await page.goto("/#COMMUNITY/999/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([TAKEN_DOWN]);
  await expect.poll(() => bar(page)).toMatch(/^#HIRO\/0\//);
  await page.clock.runFor(3000 + 150);
  await expect(page.locator("#toastStack .toast")).toHaveCount(0);
  await go(page, "#COMMUNITY/999/30,20/fit/33");
  await expect(page.locator("#toastStack .toast")).toHaveText([TAKEN_DOWN]);
  await expect.poll(() => bar(page)).toMatch(/^#HIRO\/0\//);
  expect((await shown(page)).li).toBe(0);
  expect(errors).toEqual([]);
});

test("a link to a level the catalogue never held says the community levels hold no such level, and gives way", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, indexOf({ 1: SPIRAL }));
  await page.goto(EDIT);
  await settle(page);
  await go(page, "#COMMUNITY/5/45,35/fit/33");
  await expect(page.locator("#toastStack .toast")).toHaveText([NO_SUCH]);
  await expect.poll(() => bar(page)).toMatch(/^#HIRO\/0\//);
  expect((await shown(page)).li).toBe(0);
  expect(errors).toEqual([]);
});

test("a link to a community level arriving while the index could not be loaded says so, and gives way", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, "", 404);
  await page.goto(EDIT);
  await settle(page);
  await go(page, "#COMMUNITY/1/45,35/fit/33");
  await expect(page.locator("#toastStack .toast")).toHaveText([UNLOADED]);
  await expect.poll(() => bar(page)).toMatch(/^#HIRO\/0\//);
  expect((await shown(page)).li).toBe(0);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("the fold kept open from an earlier visit fills itself once the map has drawn, and the way it is left is kept", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, TWO);
  await page.addInitScript(() => {
    try {
      if (localStorage.getItem("kula.community") === null)
        localStorage.setItem("kula.community", "open");
    } catch {
      /* the blank page between the loads has no storage */
    }
  });
  await page.goto(EDIT);
  await settle(page);
  expect(await isOpen(page)).toBe(true);
  await expect(names(page)).toHaveText(["Tower", "Spiral"]);
  await fold(page).locator("summary").click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("kula.community")))
    .toBe("closed");
  await page.reload();
  await settle(page);
  expect(await isOpen(page)).toBe(false);
  await expect(page.locator("#communityCount")).toHaveText("");
  expect(errors).toEqual([]);
});

test("a plain visit shows the fold closed and fetches neither the index nor the community's code", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const asked = record(page);
  await page.goto(EDIT);
  await settle(page);
  await expect(page.locator("#community")).toBeVisible();
  await expect(fold(page).locator("summary h2")).toHaveText("Community levels");
  expect(await isOpen(page)).toBe(false);
  await expect(page.locator("#communityCount")).toHaveText("");
  await expect(page.locator("#communityTiles")).toBeHidden();
  expect(asked).toContain("/js/main.js");
  expect(asked.filter((p) => COMMUNITY_FILES.test(p) || p === INDEX_PATH)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a bundle stands among the community levels as one tile, with its first level's picture, its title and a line with its author and how many levels it holds", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, BUNDLED);
  await page.goto(EDIT);
  await settle(page);
  await opened(page, 2);
  await expect(page.locator("#communityCount")).toHaveText("2");
  await expect(names(page)).toHaveText(["Spiral campaign", "Spiral"]);
  await expect(page.locator("#communityTiles .tile .line")).toHaveText([
    "by Ada · 12 levels",
    "by Ada · HIRO",
  ]);
  await expect.poll(() => drawn(page, 2)).toBeGreaterThan(0);
  await expect(page.locator("#communityTiles .tile[aria-current='true']")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("choosing a bundle's tile shows its first level, the note saying its place in the bundle and listing the bundle's levels as links, the one on screen marked", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, BUNDLED);
  await page.goto(EDIT);
  await settle(page);
  await opened(page, 2);
  await tile(page, 2).click();
  await expect(page.locator("#chipLine b")).toHaveText("Spiral 1");
  await expect(page.locator("#chipLine .tag")).toHaveText("Community");
  const note = page.locator("#chipNote");
  await expect(note).toContainText("By Ada.");
  await expect(note).toContainText("Level 1 of 12 in Spiral campaign.");
  await expect(more(page).locator("summary")).toHaveText("12 levels");
  expect(await unfolded(page)).toBe(true);
  await expect(links(page)).toHaveCount(12);
  await expect(links(page).first()).toHaveAttribute("href", /#COMMUNITY\/2-1$/);
  await expect(links(page).last()).toHaveText("Spiral 12");
  await expect(marked(page)).toHaveText("Spiral 1");
  await expect(note.getByRole("button", { name: "save the file" })).toBeVisible();
  await expect(tile(page, 2)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => bar(page)).toMatch(/^#COMMUNITY\/2-1\//);
  expect(errors).toEqual([]);
});

test("a link in the list shows that level of the bundle, the mark and the keyboard moving with it, the bundle's tile still the one on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, BUNDLED);
  await page.goto("/#COMMUNITY/2-1/45,35/fit/33");
  await settle(page);
  await links(page).nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral 3");
  await expect(page.locator("#chipNote")).toContainText("Level 3 of 12 in Spiral campaign.");
  await expect(marked(page)).toHaveText("Spiral 3");
  await expect(marked(page)).toBeFocused();
  expect(await unfolded(page)).toBe(true);
  await expect(tile(page, 2)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => bar(page)).toMatch(/^#COMMUNITY\/2-3\//);
  expect(errors).toEqual([]);
});

test("a link to a level of a bundle at the start shows that level, its place said under the line and the bundle's tile marked", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, BUNDLED);
  await page.goto("/#COMMUNITY/2-2/45,35/fit/33");
  await settle(page);
  await expect(page.locator("#chipLine b")).toHaveText("Spiral 2");
  await expect(page.locator("#chipLine .tag")).toHaveText("Community");
  expect(await shown(page)).toMatchObject({ li: -1, theme: "HIRO" });
  await expect(page.locator("#chipNote")).toContainText("Level 2 of 12 in Spiral campaign.");
  await expect(marked(page)).toHaveText("Spiral 2");
  expect(await isOpen(page)).toBe(true);
  await expect(names(page)).toHaveText(["Spiral campaign", "Spiral"]);
  await expect(tile(page, 2)).toHaveAttribute("aria-current", "true");
  await expect.poll(() => bar(page)).toBe("#COMMUNITY/2-2/45,35/fit/33");
  expect(errors).toEqual([]);
});

test("save the file under a level of a bundle saves the whole bundle as the map's own bundle file, named by the bundle's title", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, BUNDLED);
  await page.goto("/#COMMUNITY/2-2/45,35/fit/33");
  await settle(page);
  const saving = page.waitForEvent("download");
  await page.locator("#chipNote").getByRole("button", { name: "save the file" }).click();
  const file = await saving;
  expect(file.suggestedFilename()).toBe("spiral-campaign.kula-bundle.json");
  expect(readFileSync(await file.path(), "utf8")).toBe(writeBundle(CAMPAIGN));
  expect(errors).toEqual([]);
});

test("a bundle as long as the catalogue takes lists every level under the line, the list scrolling so the note stays inside the window", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await serving(page, HAUL);
  await page.goto("/#COMMUNITY/2-1/45,35/fit/33");
  await settle(page);
  const most = BUNDLE_IN_CATALOGUE_MOST;
  await expect(page.locator("#chipNote")).toContainText(`Level 1 of ${most} in Long haul.`);
  expect(await unfolded(page)).toBe(true);
  await expect(links(page)).toHaveCount(most);
  await expect(links(page).last()).toHaveText(`Haul ${most}`);
  const list = page.locator("#chipNote .members");
  expect(await list.evaluate((ul) => ul.scrollHeight > ul.clientHeight)).toBe(true);
  const chip = await page.locator("#chip").boundingBox();
  expect(chip.y + chip.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  test("a bundle's levels fold under their count until opened, so the note stays short, and stay as they are left from level to level", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await serving(page, BUNDLED);
    await page.goto("/#COMMUNITY/2-1/45,35/fit/33");
    await settle(page);
    await expect(page.locator("#chipNote")).toContainText("Level 1 of 12 in Spiral campaign.");
    const summary = more(page).locator("summary");
    await expect(summary).toHaveText("12 levels");
    expect(await unfolded(page)).toBe(false);
    await expect(links(page).first()).toBeHidden();
    await summary.click();
    expect(await unfolded(page)).toBe(true);
    await expect(links(page)).toHaveCount(12);
    await expect(marked(page)).toHaveText("Spiral 1");
    await links(page).nth(2).click();
    await expect(page.locator("#chipLine b")).toHaveText("Spiral 3");
    expect(await unfolded(page)).toBe(true);
    await more(page).locator("summary").click();
    expect(await unfolded(page)).toBe(false);
    await go(page, "#COMMUNITY/2-5/45,35/fit/33");
    await expect(page.locator("#chipLine b")).toHaveText("Spiral 5");
    expect(await unfolded(page)).toBe(false);
    expect(errors).toEqual([]);
  });
});
