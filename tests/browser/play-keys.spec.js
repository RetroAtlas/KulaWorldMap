import { test, expect } from "@playwright/test";
import { frozen, onward, stepUntil, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  ballOver,
  betweenFrames,
  flipped,
  line,
  opened,
  pixelAt,
  presses,
  probe,
  say,
  seconds,
  startPlay,
  station,
  status,
  table,
} from "./playhelpers.js";

const PLAY_FILES = /\/js\/play\/[^/]+\.js$/;

const sliced = (page, z) =>
  page.evaluate(async (z) => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - z);
  }, z);

/** Write to the bar what waits to be written, as the view's rest would. */
const flushed = (page) =>
  page.evaluate(async () => {
    const { settle } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    settle();
  });

test("p stands the ball on the start and takes its view, the arrows roll it, and Esc puts the view, the slice and the start's ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await opened(page, { motion: false });
  expect(requested.filter((p) => PLAY_FILES.test(p))).toEqual([]);
  const start = [17, 18, 17];
  const withBall = await pixelAt(page, ballOver(start));
  await sliced(page, 18);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await expect.poll(() => page.url()).toMatch(/\/fit\/15$/);
  const before = await probe(page);
  expect(before.playing).toBe(false);
  expect(before.frame).toBeNull();
  expect(before.slice).toBe(15);
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");

  await startPlay(page);
  await expect
    .poll(() => requested.filter((p) => PLAY_FILES.test(p)).sort())
    .toEqual([
      "/js/play/ball.js",
      "/js/play/contact.js",
      "/js/play/drive.js",
      "/js/play/dust.js",
      "/js/play/effects.js",
      "/js/play/events.js",
      "/js/play/eye.js",
      "/js/play/game.js",
      "/js/play/hazards.js",
      "/js/play/passes.js",
      "/js/play/phrases.js",
      "/js/play/play.js",
      "/js/play/route.js",
      "/js/play/rules.js",
      "/js/play/screen.js",
      "/js/play/strip.js",
      "/js/play/traveller.js",
      "/js/play/world.js",
    ]);
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  await expect(say(page)).toHaveText(
    "Playing LEVEL 1. The ball stands on the top of 17,18,17, facing -y. The arrows roll and turn it, Esc leaves.",
  );
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "true");
  const entered = await probe(page);
  expect(entered.playing).toBe(true);
  expect(entered.station).toEqual({ block: start, face: 0, heading: "-y", moving: false });
  expect(entered.frame).toEqual(IDENTITY);
  expect(entered.cam.yaw).toBe(20);
  expect(entered.cam.pitch).toBe(30);
  expect(entered.slice).toBe(33);
  expect(entered.fitted).toBe(true);
  expect(entered.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).not.toContainText("sliced");

  // a tap of Up rolls the ball one block on; the view follows it rather than panning
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect
    .poll(() => station(page))
    .toEqual({
      block: [17, 17, 17],
      face: 0,
      heading: "-y",
      moving: false,
    });
  await expect(say(page)).toHaveText("17,17,17, top");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const rolled = await probe(page);
  expect(rolled.cam.panX).toBe(entered.cam.panX);
  expect(rolled.cam.panY).toBe(entered.cam.panY);
  expect(rolled.target).not.toEqual(entered.target);
  expect(await pixelAt(page, ballOver(start))).not.toEqual(withBall);
  // an arrow with a modifier is left to the browser, so the frame after it moves nothing
  await frozen(page);
  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.up("Alt");
  await onward(page, 1);
  expect((await probe(page)).station).toEqual({
    block: [17, 17, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await page.evaluate(() => window.__thaw());

  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(say(page)).toContainText("Left play");
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.frame).toBeNull();
  expect(left.cam).toEqual(before.cam);
  expect(left.target).toEqual(before.target);
  expect(left.slice).toBe(15);
  expect(left.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await page.keyboard.press("\\");
  expect(await pixelAt(page, ballOver(start))).toEqual(withBall);
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowLeft");
  expect((await probe(page)).cam.panX).not.toBe(before.cam.panX);
  expect(errors).toEqual([]);
});

test("the ball turns in place, Down moves nothing and Settings has no switch for it, and it is refused an edge beside a neighbour, which the strip leaves unsaid", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await expect(line(page)).toContainText("facing -y");
  const { hz, play } = await table(page);
  await frozen(page);
  // a tap of `key` stands until a frame reads the pad, and the quarter turn it asks is stepped to
  // its rest, the line saying the ball faces `heading`
  const turned = async (key, heading) => {
    await page.keyboard.press(key);
    const turn = await stepUntil(page, { line: `facing \\${heading}`, moving: false }, hz);
    expect(turn.at(-1).station.moving).toBe(false);
    await expect(line(page)).toContainText(`facing ${heading}`);
  };
  await turned("ArrowRight", "+x");
  // play asks nothing of Down but still takes the key, so neither the ball nor the view moves
  await page.keyboard.press("ArrowDown");
  await onward(page, 1);
  await expect(line(page)).toContainText("facing +x");
  expect((await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).fitted).toBe(true);
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#turnAbout")).toHaveCount(0);
  await expect(page.locator("#settings")).not.toContainText("Down");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  // an about turn is two quarter turns, as on the game's pad
  await turned("ArrowRight", "+y");
  await turned("ArrowRight", "-x");
  // LEVEL 1's ring: off its block to the -x there is nothing, and a block stands beside it, so
  // Up held through a second of the clock moves nothing, and the strip says nothing of it
  const before = await seconds(page);
  await page.keyboard.down("ArrowUp");
  await onward(page, play.clock.second);
  await page.keyboard.up("ArrowUp");
  expect(await seconds(page)).toBe(before - 1);
  expect((await probe(page)).station).toEqual({
    block: [17, 18, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
  expect(errors).toEqual([]);
});

test("the link holds the view the ball was put down from, nothing is written to the bar meanwhile, and Back leaves play on the earlier entry", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\/45,35\/fit\/33$/);
  const url = page.url();
  await page.evaluate(() => {
    window.__wrote = 0;
    for (const way of ["pushState", "replaceState"]) {
      const orig = history[way].bind(history);
      history[way] = (...a) => {
        window.__wrote++;
        return orig(...a);
      };
    }
  });
  await startPlay(page);
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await flushed(page);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.__wrote)).toBe(0);
  await page.goBack();
  await expect(page.locator("#chip b")).toHaveText("LEVEL 1");
  await expect(page.locator("#play")).toBeHidden();
  const back = await probe(page);
  expect(back.playing).toBe(false);
  expect(back.frame).toBeNull();
  expect(back.fitted).toBe(true);
  expect(page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33$/);
  expect(errors).toEqual([]);
});

test("entering play gives the level its circuits as the game loads them, and leaving gives the panel's presses back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await flipped(page, 0, 5);
  expect(await presses(page)).toEqual([[0, [5]]]);
  await startPlay(page);
  expect(await presses(page)).toEqual([]);
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(await presses(page)).toEqual([[0, [5]]]);
  expect(errors).toEqual([]);
});

test("Space hops the ball in place and jumps it two blocks on while it rolls", async ({ page }) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const { hz } = await table(page);
  await frozen(page);
  // a tap of Space stands through the level's opening frames, and the hop that reads it lifts the
  // ball and sets it back where it stood
  await page.keyboard.press(" ");
  const lifted = await stepUntil(page, { moving: true }, hz);
  expect(lifted.at(-1).station.moving).toBe(true);
  const hopped = await stepUntil(page, { moving: false }, hz);
  expect(hopped.at(-1).station).toEqual({
    block: [17, 18, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  // Up held rolls the ball on, and Space read while it rolls, Up still held, jumps it two blocks on
  await page.keyboard.down("ArrowUp");
  const rolling = await stepUntil(page, { moving: true }, hz);
  expect(rolling.at(-1).station.moving).toBe(true);
  await page.keyboard.press(" ");
  await onward(page, 1);
  await page.keyboard.up("ArrowUp");
  const landed = await stepUntil(page, { block: [17, 16, 17], moving: false }, hz);
  expect(landed.at(-1).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await expect(say(page)).toHaveText("17,16,17, top");
  expect(errors).toEqual([]);
});
