import { test, expect } from "@playwright/test";
import { frozen, stepUntil, textured, trackErrors } from "./helpers.js";
import {
  DONE,
  TAKEN,
  about,
  line,
  opened,
  pixelAt,
  probe,
  say,
  startPlay,
  status,
  table,
  toggled,
  top,
} from "./playhelpers.js";

/** The red, green and blue the frame paints at a point of a block's top, with everything on
    that face taken off the record first. */
const bareTop = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js", "format/lattice.js"].map(at),
      );
      const r = state.idx.records.get(cellKey(Math.floor(x), Math.floor(y), z))[0];
      const on = r.on;
      r.on = on.filter((o) => o.face !== 0);
      draw();
      r.on = on;
      const [px, py] = screen(x, y, z);
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      return [...g.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)];
    },
    [x, y, z],
  );

/** The canvas point the pick stands a thing of `type` on cell `c` at. */
const discOf = (page, c, type) =>
  page.evaluate(
    async ([c, type]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { thingDisc }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/things.js", "format/lattice.js"].map(at),
      );
      const m = state.idx.markers.get(cellKey(...c)).find((m) => m.type === type);
      return thingDisc(m, { x: c[0], y: c[1], z: c[2] }, state.lvl).slice(0, 2);
    },
    [c, type],
  );

/** Whether the frame draws the thing of `type` on `c`: its pixels paint otherwise with the
    objects hidden. */
async function drawsThing(page, c, type) {
  const point = await discOf(page, c, type);
  const shown = await about(page, point);
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).not.toBeChecked();
  const hidden = await about(page, point);
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).toBeChecked();
  return JSON.stringify(shown) !== JSON.stringify(hidden);
}

/** Tap Up and step the frozen level to the ball's rest on `block`, a second of frames the bound;
    a tap stands until a frame reads the pad, so the first waits through the level's opening. */
const rolledTo = async (page, block, hz) => {
  await page.keyboard.press("ArrowUp");
  const run = await stepUntil(page, { block, moving: false }, hz);
  expect(run.at(-1).station).toMatchObject({ block, moving: false });
};

test("the ball takes the coin it rolls onto, which is gone from the frame, the last key opens the exits, rolling onto the open exit ends the level, and with Play on through the levels on Space goes on to LEVEL 2 with the total carried", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await toggled(page, "playOn", "off by default");
  const { hz } = await table(page);
  await startPlay(page);
  await frozen(page);
  const coin = [17, 16, 17];
  const keys = page.locator("#playKeys");
  const points = page.locator("#playPoints");
  const total = page.locator("#playTotal");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  await expect(total).toHaveText("Total 0");
  expect(await drawsThing(page, coin, 37)).toBe(true);
  // a tap of `key` is stepped to the quarter turn's rest, the line saying the ball faces `heading`
  const turned = async (key, heading) => {
    await page.keyboard.press(key);
    const turn = await stepUntil(page, { line: `facing \\${heading}`, moving: false }, hz);
    expect(turn.at(-1).station).toMatchObject({ heading, moving: false });
    await expect(line(page)).toContainText(`facing ${heading}`);
  };
  await rolledTo(page, [17, 17, 17], hz);
  await rolledTo(page, coin, hz);
  await expect(points).toHaveText("250 points");
  await expect(keys).toHaveText("Keys 1");
  await rolledTo(page, [17, 15, 17], hz);
  expect(await drawsThing(page, coin, 37)).toBe(false);
  // the tip lists the coin as the level as installed holds it, and says it is taken
  const over = await top(page, coin);
  await page.mouse.move(over.x, over.y);
  await expect(page.locator("#tip")).toContainText(TAKEN);
  await page.mouse.move(2, 2);
  await turned("ArrowRight", "+x");
  for (const x of [18, 19, 20]) await rolledTo(page, [x, 15, 17], hz);
  await expect(keys).toHaveText("Keys 0");
  await expect(points).toHaveText("1250 points");
  await turned("ArrowLeft", "-y");
  for (const y of [14, 13, 12]) await rolledTo(page, [20, y, 17], hz);
  await expect(points).toHaveText("1500 points");
  await turned("ArrowLeft", "-x");
  for (const x of [19, 18]) await rolledTo(page, [x, 12, 17], hz);
  // the roll onto the open exit runs on through the exit's wait to the ending
  await page.keyboard.press("ArrowUp");
  await stepUntil(page, { status: "^Out by the exit" }, hz);
  await expect(status(page)).toHaveText(DONE);
  await expect(say(page)).toHaveText(DONE);
  await expect(total).toHaveText("Total 1500");
  const done = await probe(page);
  expect(done.playing).toBe(true);
  expect(done.frame).toBeNull();
  expect(done.fitted).toBe(true);
  // Space goes on to the level the game loads next, with play on and the run's total carried
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press(" ");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect(status(page)).toHaveText("");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  await expect(total).toHaveText("Total 1500");
  const on = await probe(page);
  expect(on.playing).toBe(true);
  expect(on.station).toEqual({ block: [17, 18, 17], face: 0, heading: "-y", moving: false });
  expect(errors).toEqual([]);
});

test("the shadow the game paints into a coin's face goes with the coin as the ball takes it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // the shadow is the face's texture, so the textures are put back on
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await textured(page);
  const { hz } = await table(page);
  await startPlay(page);
  await frozen(page);
  const coin = [17, 16, 17];
  // clear of the face's middle, where the dust lies
  const face = [coin[0] + 0.3, coin[1] + 0.5, coin[2]];
  expect(await pixelAt(page, face)).not.toEqual(await bareTop(page, face));
  for (const block of [[17, 17, 17], coin, [17, 15, 17]]) await rolledTo(page, block, hz);
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  expect(await pixelAt(page, face)).toEqual(await bareTop(page, face));
  expect(errors).toEqual([]);
});
