import { expect, test } from "@playwright/test";
import { frame, trackErrors } from "./helpers.js";

// The tiles stand in a scrolling box of their own over the page, one column wide and a few
// tiles tall, so the last tile lies past the screen's margin the observer paints within.

/** Open the page and lay `n` tiles in the box, `width` by `height` CSS px, the item `current` on
    screen and every third item without a tag; `window.__items(keys, stamps, current)` makes
    items anew for an update, and every paint and open is recorded on the window by key. */
async function mounted(page, { n = 10, width = 150, height = 240, current = null } = {}) {
  await page.goto("/");
  await page.evaluate(
    async ([n, width, height, current]) => {
      const { tiles } = await import(new URL("js/viewer/ui/tiles.js", location.href).href);
      const box = document.createElement("div");
      box.id = "tilesBox";
      box.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;overflow-y:auto;z-index:100;background:#111725`;
      document.body.append(box);
      window.__paints = {};
      window.__opened = [];
      window.__items = (keys, stamps = {}, current = null) =>
        keys.map((key) => ({
          key,
          stamp: stamps[key] ?? 1,
          title: `Level ${key}`,
          tag: key % 3 ? "Draft" : "",
          line: `Hiro · not saved to a file · ${key} changes`,
          current: key === current,
          open: () => window.__opened.push(key),
          paint: (canvas) => {
            (window.__paints[key] ??= []).push(
              `${canvas.className}:${canvas.clientWidth > 0 && canvas.clientHeight > 0}`,
            );
            const g = canvas.getContext("2d");
            g.fillStyle = "#f00";
            g.fillRect(0, 0, canvas.width, canvas.height);
            return true;
          },
        }));
      window.__tiles = tiles(
        box,
        window.__items(
          Array.from({ length: n }, (_, i) => i + 1),
          {},
          current,
        ),
      );
    },
    [n, width, height, current],
  );
}

const paints = (page) => page.evaluate(() => window.__paints);
const painted = (page, key) => expect.poll(async () => (await paints(page))[key]?.length ?? 0);
const scrolled = (page, to) =>
  page.evaluate((to) => {
    const box = document.getElementById("tilesBox");
    box.scrollTop = to === "end" ? box.scrollHeight : 0;
  }, to);
const keys = (page) =>
  page
    .locator("#tilesBox .tiles > li > button.tile")
    .evaluateAll((bs) => bs.map((b) => Number(b.dataset.key)));

test("a tile paints once it is scrolled within a screen of showing, and only then, and once", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await mounted(page);
  await painted(page, 1).toBe(1);
  await painted(page, 3).toBe(1);
  expect((await paints(page))[1]).toEqual(["thumb:true"]);
  expect((await paints(page))[10]).toBeUndefined();
  await scrolled(page, "end");
  await painted(page, 10).toBe(1);
  await scrolled(page, 0);
  await frame(page);
  await scrolled(page, "end");
  await frame(page);
  expect((await paints(page))[10]).toEqual(["thumb:true"]);
  expect((await paints(page))[1]).toEqual(["thumb:true"]);
  expect(errors).toEqual([]);
});

test("aria-current follows the item on screen through an update", async ({ page }) => {
  const errors = trackErrors(page);
  await mounted(page, { n: 3, current: 2 });
  const tile = (key) => page.locator(`#tilesBox .tile[data-key="${key}"]`);
  await expect(tile(2)).toHaveAttribute("aria-current", "true");
  await expect(tile(1)).toHaveAttribute("aria-current", "false");
  await page.evaluate(() => window.__tiles.update(window.__items([1, 2, 3], {}, 3)));
  await expect(tile(3)).toHaveAttribute("aria-current", "true");
  await expect(tile(2)).toHaveAttribute("aria-current", "false");
  expect(errors).toEqual([]);
});

test("the focus stays on its tile through an update that reorders the tiles", async ({ page }) => {
  const errors = trackErrors(page);
  await mounted(page, { n: 3 });
  await page.locator('#tilesBox .tile[data-key="2"]').focus();
  await page.evaluate(() => window.__tiles.update(window.__items([3, 2, 1])));
  expect(await keys(page)).toEqual([3, 2, 1]);
  await expect(page.locator('#tilesBox .tile[data-key="2"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test("an update repaints a tile in view whose stamp changed and leaves one out of view to its observer", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await mounted(page);
  await painted(page, 1).toBe(1);
  const after = await page.evaluate(() => {
    const all = Array.from({ length: 10 }, (_, i) => i + 1);
    window.__tiles.update(window.__items(all, { 1: 2, 2: 2, 10: 2 }));
    return { 1: window.__paints[1].length, 2: window.__paints[2].length, 10: window.__paints[10] };
  });
  expect(after).toEqual({ 1: 2, 2: 2, 10: undefined });
  await scrolled(page, "end");
  await painted(page, 10).toBe(1);
  expect((await paints(page))[1]).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("an update keeps the canvas of an item whose stamp stands and drops the tiles of items gone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await mounted(page, { n: 3 });
  await painted(page, 2).toBe(1);
  const kept = await page.evaluate(() => {
    const canvas = document.querySelector('#tilesBox .tile[data-key="2"] canvas');
    window.__tiles.update(window.__items([2, 3]));
    return {
      same: document.querySelector('#tilesBox .tile[data-key="2"] canvas') === canvas,
      paints: window.__paints[2].length,
    };
  });
  expect(kept).toEqual({ same: true, paints: 1 });
  expect(await keys(page)).toEqual([2, 3]);
  expect(errors).toEqual([]);
});

test("a change of the screen's density repaints the tiles in view and leaves the rest to their observer", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await mounted(page);
  await painted(page, 1).toBe(1);
  const after = await page.evaluate(async () => {
    const { emit } = await import(new URL("js/viewer/ui/dom.js", location.href).href);
    emit("density-changed");
    return { 1: window.__paints[1].length, 10: window.__paints[10] };
  });
  expect(after).toEqual({ 1: 2, 10: undefined });
  expect(errors).toEqual([]);
});

test("a tile is a list item's button named by its words, its canvas hidden from the reader, and a click opens its item", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await mounted(page, { n: 3 });
  const list = page.locator("#tilesBox ul.tiles[role=list]");
  await expect(list.locator("> li")).toHaveCount(3);
  const tile = list.getByRole("button", {
    name: "Level 1 Draft Hiro · not saved to a file · 1 changes",
    exact: true,
  });
  await expect(tile).toHaveAttribute("data-key", "1");
  await expect(tile.locator("canvas.thumb")).toHaveAttribute("aria-hidden", "true");
  await expect(tile.locator(".name")).toHaveText("Level 1");
  await expect(tile.locator(".tag")).toHaveText("Draft");
  await expect(tile.locator(".line")).toHaveText("Hiro · not saved to a file · 1 changes");
  await expect(list.locator('.tile[data-key="3"] .tag')).toHaveCount(0);
  await tile.click();
  await page.locator('#tilesBox .tile[data-key="3"]').click();
  expect(await page.evaluate(() => window.__opened)).toEqual([1, 3]);
  expect(errors).toEqual([]);
});
