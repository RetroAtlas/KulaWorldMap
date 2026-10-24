import { test, expect } from "@playwright/test";
import { faced, laid, settle, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  LEVEL,
  ballOver,
  betweenFrames,
  flipped,
  line,
  opened,
  pixelAt,
  presses,
  probe,
  say,
  startPlay,
  station,
  status,
  ticked,
} from "./playhelpers.js";

const PLAY_FILES = /\/js\/play\/[^/]+\.js$/;

const LOST = /^FELL OFF! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;

const sliced = (page, z) =>
  page.evaluate(async (z) => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - z);
  }, z);

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
      "/js/play/hazards.js",
      "/js/play/play.js",
      "/js/play/rules.js",
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
  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(400);
  expect((await probe(page)).station.block).toEqual([17, 17, 17]);

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
  await betweenFrames(page, () => page.keyboard.press("ArrowRight"));
  await expect(line(page)).toContainText("facing +x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // play asks nothing of Down but still takes the key, so neither the ball nor the view moves
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
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
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +y");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing -x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // LEVEL 1's ring: off its block to the -x there is nothing, and a block stands beside it, so
  // Up held until the clock ticks moves nothing, and the strip says nothing of it
  await page.keyboard.down("ArrowUp");
  await ticked(page);
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
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
  await page.waitForTimeout(500);
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

test("Space hops the ball in place, jumps it two blocks on while it rolls, and a jump off the lattice is lost, which ends the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await betweenFrames(page, () => page.keyboard.press(" "));
  // the level's opening frames first, then the hop, so the poll is quick
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station.block).toEqual([17, 18, 17]);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(60);
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("17,16,17, top");
  // from the lattice's last column a jump lands past its edge, and the ball is lost
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [32, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await faced(page, [17, 17, 17], 4, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  // Motion is off still, kept from the first half by the display's store
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 32, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  await betweenFrames(page, () => page.keyboard.press("ArrowLeft"));
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(LOST);
  await expect(say(page)).toHaveText(LOST);
  const lost = await probe(page);
  expect(lost.playing).toBe(true);
  expect(lost.frame).toBeNull();
  expect(lost.target).toEqual([25, 17.5, 17.5]);
  expect(lost.fitted).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  const again = await probe(page);
  expect(again.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(again.frame).toEqual(IDENTITY);
  expect(errors).toEqual([]);
});
