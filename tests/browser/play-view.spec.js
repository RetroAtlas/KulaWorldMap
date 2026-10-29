import { test, expect } from "@playwright/test";
import { drafted, drawn, frozen, onward, stepUntil, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  anchor,
  clockLine,
  frameAt,
  line,
  opened,
  probe,
  say,
  seconds,
  startPlay,
  table,
} from "./playhelpers.js";
import { TYPE } from "../../public/js/format/lattice.js";

// the view's frame behind a ball on a top face facing -x
const TURNED = [0, -1, 0, 1, 0, 0, 0, 0, 1];

/** How many times a frame lays a canvas the map's size over the map, which the see-through
    layer alone is. */
const throughDrawn = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const g = cv.getContext("2d");
    let n = 0;
    const drawImage = g.drawImage;
    g.drawImage = function (img, ...rest) {
      if (img.width === cv.width && img.height === cv.height) n++;
      return drawImage.call(this, img, ...rest);
    };
    draw();
    g.drawImage = drawImage;
    return n;
  });

test("with Motion on the view eases in and out, and turns round the ball over the game's frames", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const before = await probe(page);
  const { hz } = await table(page);
  // frozen before play opens, so the ease starts on the held clock and its first stepped frame
  // finds the view on its way round behind the ball
  await frozen(page);
  await startPlay(page);
  const came = await stepUntil(page, { eased: true }, hz, { view: true });
  expect(came.length).toBeGreaterThan(1);
  expect(came[0].view).not.toEqual(IDENTITY);
  expect(came.at(-1).view).toEqual(IDENTITY);
  // a turn swaps the heading at once, and the view turns round the ball over the turn's frames
  await page.keyboard.press("ArrowLeft");
  const turn = await stepUntil(page, { line: "facing \\-x", moving: false }, hz, {
    station: true,
    view: true,
  });
  const turning = turn.filter((s) => s.station.heading === "-x");
  expect(turning.length).toBeGreaterThan(1);
  expect(turning[0].view).not.toEqual(TURNED);
  expect(turning.at(-1).view).toEqual(TURNED);
  await page.keyboard.press("Escape");
  const leaving = await probe(page);
  expect(leaving.playing).toBe(false);
  expect(leaving.frame).not.toBeNull();
  const left = await stepUntil(page, { eased: true }, hz, { view: true });
  expect(left.at(-1).view).toBeNull();
  expect((await probe(page)).cam).toEqual(before.cam);
  expect(errors).toEqual([]);
});

test("f in play frames the ball again and dims the fit button, after a drag has turned the view about it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const framed = await probe(page);
  expect(framed.fitted).toBe(true);
  expect(framed.target).toEqual([17.5, 18.5, 16.805]);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(700, 320, { steps: 4 });
  await page.mouse.up();
  const turned = await probe(page);
  expect(turned.fitted).toBe(false);
  expect(turned.cam.yaw).not.toBe(framed.cam.yaw);
  expect(turned.target).toEqual(framed.target);
  expect(turned.playing).toBe(true);
  await page.keyboard.press("f");
  const again = await probe(page);
  expect(again.fitted).toBe(true);
  expect(again.cam.yaw).toBe(turned.cam.yaw);
  // the ball sits a fifth below the middle of the height the strip leaves free
  const spot = await anchor(page);
  const cv = await page.locator("#cv").boundingBox();
  expect(Math.abs(spot.x - cv.x - spot.w / 2)).toBeLessThan(1);
  expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
  expect(spot.free).toBeLessThan(cv.height);
  expect(errors).toEqual([]);
});

test("with Motion off a step snaps and nothing draws once the ball rests, the level standing between moves at play's frame", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const { hz } = await table(page);
  await startPlay(page);
  expect((await probe(page)).frame).toEqual(IDENTITY);
  await expect(clockLine(page)).toHaveText("Time 99");
  expect(await frameAt(page)).toBe(0);
  expect(await drawn(page, 6, 100)).toBe(0);
  await frozen(page);
  await page.keyboard.press("ArrowUp");
  const roll = await stepUntil(page, { block: [17, 17, 17], moving: false }, hz, { frame: true });
  expect(roll.at(-1).station).toMatchObject({ block: [17, 17, 17], moving: false });
  // the frame drawn is the last the roll ran, the clock having counted down over the frames run,
  // and a frame stepped while the ball rests runs none
  const ran = await frameAt(page);
  expect(ran).toBeGreaterThan(0);
  expect(ran).toBe(roll.at(-1).frame);
  const shown = await clockLine(page).textContent();
  expect(shown).not.toBe("Time 99");
  await onward(page, 1);
  expect(await frameAt(page)).toBe(ran);
  await expect(clockLine(page)).toHaveText(shown);
  // the clock let go, a resting ball draws nothing on the running clock either
  await page.evaluate(() => window.__thaw());
  expect(await drawn(page, 6, 100)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(await frameAt(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("with Motion on the level runs at rest: the strip counts the clock down and the map draws at play's frame", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect(clockLine(page)).toHaveText(/^Time \d+$/);
  const first = await seconds(page);
  await expect.poll(() => seconds(page)).toBeLessThan(first);
  const a = await frameAt(page);
  await page.waitForTimeout(250);
  const b = await frameAt(page);
  expect(b).toBeGreaterThan(a);
  expect(b - a).toBeLessThan(60);
  expect((await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("over the far edge of a ridge the ball goes round onto the side, and the frame's up is that face's normal", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await drafted(page, {
    blocks: [[[18, 17, 17], { kind: 0 }]],
    faces: [[[17, 17, 17], 4, { type: TYPE.KEY }]],
    motion: false,
  });
  const { hz } = await table(page);
  await startPlay(page);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  // a tap stands through the level's opening until a frame reads the pad
  await page.keyboard.press("ArrowRight");
  const turn = await stepUntil(page, { line: "facing \\+x", moving: false }, hz);
  expect(turn.at(-1).station).toMatchObject({ heading: "+x", moving: false });
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowUp");
  const roll = await stepUntil(page, { block: [18, 17, 17], moving: false }, hz);
  expect(roll.at(-1).station).toMatchObject({ block: [18, 17, 17], moving: false });
  await expect(say(page)).toHaveText("18,17,17, top");
  await page.keyboard.press("ArrowUp");
  const wrap = await stepUntil(page, { face: 1, moving: false }, hz);
  expect(wrap.at(-1).station).toEqual({
    block: [18, 17, 17],
    face: 1,
    heading: "+z",
    moving: false,
  });
  await expect(say(page)).toHaveText("18,17,17, +x side");
  const p = await probe(page);
  expect(p.frame.slice(6, 9).map((v) => -v + 0)).toEqual([1, 0, 0]);
  await expect(line(page)).toHaveText("Playing · on the +x side of 18,17,17, facing +z");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("out of an inner corner the ball climbs the wall ahead, and shows through the block it stood on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a floor ahead of the start, a wall on it, and a block beside the wall that stops the roll at its middle
  await drafted(page, {
    blocks: [
      [[17, 16, 17], { kind: 0 }],
      [[17, 16, 16], { kind: 0 }],
      [[18, 16, 16], { kind: 0 }],
    ],
    motion: false,
  });
  const { hz } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  expect(await throughDrawn(page)).toBe(0);
  await frozen(page);
  await page.keyboard.down("ArrowUp");
  const climb = await stepUntil(page, { face: 2, moving: false }, hz);
  await page.keyboard.up("ArrowUp");
  expect(climb.at(-1).station).toEqual({
    block: [17, 16, 16],
    face: 2,
    heading: "-z",
    moving: false,
  });
  await expect(say(page)).toHaveText("17,16,16, +y side");
  expect(await throughDrawn(page)).toBe(1);
  expect(errors).toEqual([]);
});
