import { test, expect } from "@playwright/test";
import { drafted, drawn, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  UNTURNED,
  anchor,
  betweenFrames,
  clockLine,
  frameAt,
  frameFor,
  line,
  opened,
  probe,
  say,
  seconds,
  startPlay,
} from "./playhelpers.js";

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

/** The view's frame, the ball's heading and its body, as handed to the frame and in the world, on
    every animation frame until the view's frame is `until`, or 8 s pass. */
const turnedThrough = (page, until) =>
  page.evaluate(async (until) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, P, { faceAxes, times }, { FACE_NORMAL }] = await Promise.all(
      ["viewer/state.js", "play/play.js", "viewer/motion.js", "format/lattice.js"].map(at),
    );
    const round = (v) => Math.round(v * 1000) / 1000 + 0;
    const out = [];
    const end = performance.now() + 8000;
    while (performance.now() < end) {
      const g = P.handed();
      const laid = faceAxes(FACE_NORMAL[g.w.face], g.fwd);
      out.push({
        frame: state.frame.map(round),
        heading: P.station().heading,
        body: g.body.map((row) => row.map(round)),
        world: times(laid, g.body).map((row) => row.map(round)),
      });
      if (out.at(-1).frame.every((v, i) => v === until[i])) return out;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, until);

test("with Motion on the view eases in and out, and the ball tumbles over the game's frames", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const before = await probe(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-x");
  const during = await probe(page);
  expect(during.frame).not.toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await expect.poll(async () => (await probe(page)).frame).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await page.keyboard.press("Escape");
  const leaving = await probe(page);
  expect(leaving.playing).toBe(false);
  expect(leaving.frame).not.toBeNull();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  expect((await probe(page)).cam).toEqual(before.cam);
  expect(errors).toEqual([]);
});

test("a turn in place turns the view round the ball and leaves the body's turn where it stands, as the game does", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  // a block's roll turns the body, so that the turn has a turn to keep
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  const [before] = await turnedThrough(page, IDENTITY);
  expect(before.heading).toBe("-y");
  expect(before.body).not.toEqual(UNTURNED);
  const final = await frameFor(page, [-1, 0, 0], [0, 0, -1]);
  const sampling = turnedThrough(page, final);
  await page.keyboard.press("ArrowLeft");
  const samples = await sampling;
  const turning = samples.filter((s) => s.heading === "-x");
  // the view turns over the turn's frames while the body handed to the frame stands, and the body
  // in the world is as it was before the turn, the frame alone having turned under it
  expect(turning.length).toBeGreaterThan(1);
  expect(turning.at(-1).frame).toEqual(final);
  expect(turning.some((s) => s.frame.some((v, i) => v !== final[i]))).toBe(true);
  for (const s of turning) expect(s.body).toEqual(turning[0].body);
  expect(turning[0].body).not.toEqual(before.body);
  for (const s of samples) expect(s.world).toEqual(before.world);
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
  await startPlay(page);
  expect((await probe(page)).frame).toEqual(IDENTITY);
  await expect(clockLine(page)).toHaveText("Time 99");
  expect(await frameAt(page)).toBe(0);
  expect(await drawn(page)).toBe(0);
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await drawn(page)).toBe(0);
  // the frame drawn is the last the roll ran, the level's opening ones among them, the clock
  // having ticked once on each frame run, and no more while it rests
  const ran = await frameAt(page);
  expect(ran).toBeGreaterThan(18);
  await expect(clockLine(page)).toHaveText(`Time ${Math.floor((99 * 50 - ran - 1) / 50)}`);
  await page.waitForTimeout(300);
  expect(await frameAt(page)).toBe(ran);
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
    faces: [[[17, 17, 17], 4, { type: 31 }]],
    motion: false,
  });
  await startPlay(page);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await betweenFrames(page, () => page.keyboard.press("ArrowRight"));
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([18, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, top");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(1);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, +x side");
  const p = await probe(page);
  expect(p.station).toEqual({ block: [18, 17, 17], face: 1, heading: "+z", moving: false });
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
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  expect(await throughDrawn(page)).toBe(0);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(2);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.up("ArrowUp");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 16],
    face: 2,
    heading: "-z",
    moving: false,
  });
  await expect(say(page)).toHaveText("17,16,16, +y side");
  expect(await throughDrawn(page)).toBe(1);
  expect(errors).toEqual([]);
});
