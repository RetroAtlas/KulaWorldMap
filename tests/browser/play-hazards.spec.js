import { test, expect } from "@playwright/test";
import {
  drawn,
  frame,
  frozen,
  laid,
  onward,
  settle,
  stepUntil,
  still,
  trackErrors,
} from "./helpers.js";
import {
  IDENTITY,
  arcadeDraft,
  ballOver,
  clockOf,
  dustOver,
  line,
  listening,
  pixelAt,
  probe,
  said,
  say,
  startPlay,
  status,
  table,
} from "./playhelpers.js";
import { DYING, REFUSED } from "../../public/js/play/phrases.js";

// HIDDEN 3: the start two blocks before a row of four corkscrews, the first of them at the top of
// its bounce as the level opens
const CORKSCREW_LEVEL = "/#INCA/18/45,35/fit/33";

const SPIKED = /^SPIKED! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;

const FORGIVEN = "Forgiven: the ball would have been killed on the spikes.";

const FORGIVEN_FALL = "Forgiven: the ball would have fallen off the level.";

const LOST_BROKEN =
  /^FELL OFF! 50 points, 9\d seconds left\. Space or Enter starts the level again\.$/;

const BROKE = "17,16,17, top. The crumbling block breaks under the ball.";

const GONE = "The crumbling block at 17,16,17 is gone.";

/** The canvas point over a point of the level. */
const canvasAt = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      return screen(x, y, z);
    },
    [x, y, z],
  );

/** The mean colour one frame paints within half the ball's radius of a canvas point. */
const fillAbout = (page, [x, y]) =>
  page.evaluate(
    async ([x, y]) => {
      const { state, BLOCK } = await import(new URL("js/viewer/state.js", location.href).href);
      const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      draw();
      const k = state.view.dpr;
      const r = Math.round(((100 / 512) * state.cam.zoom * BLOCK * k) / 2);
      const g = document.getElementById("cv").getContext("2d");
      const img = g.getImageData(
        Math.round(x * k) - r,
        Math.round(y * k) - r,
        2 * r + 1,
        2 * r + 1,
      );
      const sum = [0, 0, 0];
      let n = 0;
      for (let j = 0; j <= 2 * r; j++)
        for (let i = 0; i <= 2 * r; i++) {
          if (Math.hypot(i - r, j - r) > r) continue;
          const at = 4 * (j * img.width + i);
          for (let ch = 0; ch < 3; ch++) sum[ch] += img.data[at + ch];
          n++;
        }
      return sum.map((v) => Math.round(v / n));
    },
    [x, y],
  );

/** The height the ball is handed to the frame with, for its shadow, finite or null. */
const shadowHeight = (page) =>
  page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    const g = P.handed();
    return g && Number.isFinite(g.height) ? g.height : null;
  });

test("spikes kill the ball: the strip says so in red while the game's countdown runs, the verdict names the cause and Space starts the level again, and with Forgive pressed the ball is put back where it last rested instead, from the spikes and from a fall alike", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // two blocks on, spikes on the second
  await arcadeDraft(page, {
    blocks: [
      [[17, 16, 17], { kind: 0 }],
      [[17, 15, 17], { kind: 0 }],
    ],
    faces: [[[17, 15, 17], 0, { type: 12 }]],
    motion: false,
  });
  const { hz, play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const forgive = page.locator("#forgiveBtn");
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  await listening(page);
  await frozen(page);
  const clock = await clockOf(page, play);
  // held on, the ball rolls onto the spikes and the countdown runs with the key, the strip read on
  // every game frame, as the countdown can begin and end within one drawn frame
  await page.keyboard.down("ArrowUp");
  const shown = await stepUntil(page, { status: "^SPIKED" }, clock, { status: true, dying: true });
  await page.keyboard.up("ArrowUp");
  const states = shown
    .map((s) => [s.status, s.dying])
    .filter((now, i, all) => i === 0 || now.join() !== all[i - 1].join());
  expect(states.slice(-2)).toEqual([
    [DYING.spikes, true],
    [expect.stringMatching(SPIKED), false],
  ]);
  await expect.poll(() => said(page)).toContain(DYING.spikes);
  await expect(say(page)).toHaveText(SPIKED);
  const over = await probe(page);
  expect(over.playing).toBe(true);
  expect(over.frame).toBeNull();
  expect(over.fitted).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  expect((await probe(page)).station).toEqual({
    block: [17, 17, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await forgive.click();
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  // a tap of Up waits for the opening's first read frame and rolls the ball a block on, and the
  // roll onto the spikes is forgiven, the ball put back at that rest
  await page.keyboard.press("ArrowUp");
  const rolled = await stepUntil(page, { block: [17, 16, 17], moving: false }, clock);
  expect(rolled.at(-1).station.moving).toBe(false);
  await page.keyboard.press("ArrowUp");
  await stepUntil(page, { status: "^Forgiven" }, clock);
  await expect(status(page)).toHaveText(FORGIVEN);
  await expect(status(page)).not.toHaveClass(/dying/);
  await expect(say(page)).toHaveText(FORGIVEN);
  const spared = await stepUntil(page, { moving: false }, hz);
  expect(spared.at(-1).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect((await probe(page)).frame).toEqual(IDENTITY);
  // a jump off the block's free side falls off the level, forgiven the same way: the ball comes
  // back to the rest it jumped from, facing as it did
  await page.keyboard.press("ArrowLeft");
  const turned = await stepUntil(page, { line: "facing -x", moving: false }, hz);
  expect(turned.at(-1).station.moving).toBe(false);
  await expect(line(page)).toContainText("facing -x");
  // Up held until the fall, so that whichever frame reads Space reads Up with it
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await stepUntil(page, { status: "^Forgiven: the ball would have fallen" }, clock);
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(FORGIVEN_FALL);
  await expect(say(page)).toHaveText(FORGIVEN_FALL);
  const back = await stepUntil(page, { moving: false }, hz);
  expect(back.at(-1).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  // the toggle is kept for the visit
  await startPlay(page);
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("ice slides the ball on over every block to the first that is not ice, and an arrow holds it from rolling off any way but its own, the strip saying so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // three ice blocks on, then a stone block carrying an arrow that points back the way the ball
  // comes
  await arcadeDraft(page, {
    blocks: [
      [[17, 16, 17], { kind: 2 }],
      [[17, 15, 17], { kind: 2 }],
      [[17, 14, 17], { kind: 2 }],
      [[17, 13, 17], { kind: 0 }],
    ],
    faces: [[[17, 13, 17], 0, { type: 28, facing: 1 }]],
    motion: false,
  });
  const { hz, play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const clock = await clockOf(page, play);
  // one tap of Up, and the slide carries the ball over the ice to the arrow's block, nothing said
  await page.keyboard.press("ArrowUp");
  const slid = await stepUntil(page, { block: [17, 13, 17], moving: false }, clock);
  expect(slid.at(-1).station).toEqual({
    block: [17, 13, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
  // against the arrow Up moves nothing and the strip says why, while turning in place is allowed,
  // two quarter turns bringing the ball about
  await page.keyboard.press("ArrowUp");
  await stepUntil(page, { status: "^The ball cannot roll off" }, hz);
  await expect(status(page)).toHaveText(REFUSED.arrow);
  expect((await probe(page)).station).toEqual({
    block: [17, 13, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await page.keyboard.press("ArrowLeft");
  const turned = await stepUntil(page, { line: "facing -x", moving: false }, hz);
  expect(turned.at(-1).station.heading).toBe("-x");
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("ArrowLeft");
  const about = await stepUntil(page, { line: "facing \\+y", moving: false }, hz);
  expect(about.at(-1).station.heading).toBe("+y");
  // along the arrow's way the ball rolls off, and the ice slides it back to the start's block
  await page.keyboard.press("ArrowUp");
  const back = await stepUntil(page, { block: [17, 17, 17], moving: false }, clock);
  expect(back.at(-1).station).toEqual({
    block: [17, 17, 17],
    face: 0,
    heading: "+y",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("on fire the ball reddens: where it stands its pixels are redder on the whole than the untinted ball's pixels on plain stone, and with Motion off nothing draws once it rests", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page, { blocks: [[[17, 16, 17], { kind: 0 }]] });
  const { hz, play } = await table(page);
  const block = [17, 16, 17];
  // with Motion on the level runs at rest, so the fire heats the ball from the frame it rolls on,
  // the view brought round behind the ball first and the roll stepped to its rest, where the
  // ball's pixels are read, a few frames of heat short of the burn
  const rolled = async () => {
    await startPlay(page);
    await frozen(page);
    const came = await stepUntil(page, { eased: true }, hz);
    expect(came.at(-1).eased).toBe(true);
    await page.keyboard.press("ArrowUp");
    const stood = await stepUntil(page, { block, moving: false }, await clockOf(page, play));
    expect(stood.at(-1).station.moving).toBe(false);
    return fillAbout(page, await canvasAt(page, ballOver(block)));
  };
  const plain = await rolled();
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await laid(page, block, { kind: 1 });
  await expect
    .poll(() =>
      page.evaluate(async (c) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { cellKey }] = await Promise.all(
          ["viewer/state.js", "format/lattice.js"].map(at),
        );
        return state.idx.cells.get(cellKey(...c))?.v;
      }, block),
    )
    .toBe(1);
  const fire = await rolled();
  expect(await status(page).textContent()).toBe("");
  expect(fire[0], `red: ${fire} against ${plain}`).toBeGreaterThan(plain[0]);
  expect(fire[1], `green: ${fire} against ${plain}`).toBeLessThan(plain[1]);
  expect(fire[2], `blue: ${fire} against ${plain}`).toBeLessThan(plain[2]);
  // with Motion off the level stands once the ball rests, after the frame asked while Motion ran
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await frame(page);
  expect(await drawn(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("a crumbling block breaks under the ball, scoring, and is gone a third of a second later, out of the frame, the ball falling with it and casting no shadow from the frame the block goes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a crumbling block on, with nothing below it
  await arcadeDraft(page, { blocks: [[[17, 16, 17], { kind: 6 }]] });
  const { hz, play } = await table(page);
  // a point of the block's top that the ball and its shadow leave clear
  const corner = [17.15, 16.15, 17];
  const stood = await pixelAt(page, corner);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  const clock = await clockOf(page, play);
  const came = await stepUntil(page, { eased: true }, hz);
  expect(came.at(-1).eased).toBe(true);
  // with Motion on the level runs at rest, so the block goes while the ball stands on it, and
  // the ball stands a frame or two over the gone block before the game drops it
  await page.keyboard.press("ArrowUp");
  const rolled = await stepUntil(page, { block: [17, 16, 17], moving: false }, clock);
  expect(rolled.at(-1).station.moving).toBe(false);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  expect(await status(page).textContent()).toBe("");
  const dropped = await stepUntil(page, { moving: true }, clock, { pixel: corner });
  expect(dropped.at(-1).pixel).not.toEqual(stood);
  expect(await shadowHeight(page)).toBeNull();
  await stepUntil(page, { status: "^FELL OFF" }, clock);
  await expect(status(page)).toHaveText(LOST_BROKEN);
  await expect.poll(() => said(page)).toContain(BROKE);
  await expect.poll(() => said(page)).toContain(GONE);
  expect(errors).toEqual([]);
});

test("a lone crumbling block, reached by a jump, goes with a burst of dust where it stood, drawn over the nearest block the frame still draws", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a crumbling block a jump on, with nothing beside it or below it
  await arcadeDraft(page, { blocks: [[[17, 15, 17], { kind: 6 }]] });
  const { play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  const clock = await clockOf(page, play);
  // Up held past the level's opening, whose frames sample it as the game's frames do, until the jump
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  const leapt = await stepUntil(page, { moving: true }, clock);
  expect(leapt.at(-1).station.moving).toBe(true);
  await page.keyboard.up("ArrowUp");
  const landed = await stepUntil(page, { block: [17, 15, 17], moving: false }, clock);
  expect(landed.at(-1).station.moving).toBe(false);
  // the hazards read the landing on the frame after it, which breaks the block
  await onward(page, 1);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  // the gone block's cell is drawn no longer, so its dust is drawn over the start's block, the
  // only other one
  const dropped = await stepUntil(page, { moving: true }, clock);
  expect(dropped.at(-1).station.moving).toBe(true);
  expect(await dustOver(page, [17, 17, 17])).toBeGreaterThan(0);
  await expect.poll(() => said(page)).toContain("The crumbling block at 17,15,17 is gone.");
  await stepUntil(page, { status: "^FELL OFF" }, clock);
  await expect(status(page)).toHaveText(LOST_BROKEN);
  expect(errors).toEqual([]);
});

test("a corkscrew catches the ball from where it bounces: rolled under one that is up the ball stands uncaught until the frame the table's rise comes down within reach, when the strip says it is caught", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(CORKSCREW_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  const { hz } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  // the opening wait and the corkscrew's first landing pass within the first second, before Up is
  // held, which rolls the ball two blocks on, released as the ball reaches the corkscrew's block
  // so that it stops under it, the corkscrew near its top by then
  await onward(page, hz);
  await page.keyboard.down("ArrowUp");
  const reached = await stepUntil(page, { block: [17, 15, 17] }, hz);
  expect(reached.at(-1).station.block).toEqual([17, 15, 17]);
  await page.keyboard.up("ArrowUp");
  const rested = await stepUntil(page, { moving: false }, hz, { status: true, dying: true });
  expect(rested.at(-1).station).toEqual({
    block: [17, 15, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(rested.every((s) => s.status === "" && !s.dying)).toBe(true);
  // uncaught at rest under the risen corkscrew, and caught as its rise comes down within reach
  const caught = await stepUntil(page, { dying: true }, hz, { status: true });
  expect(caught.length).toBeGreaterThan(1);
  expect(caught.slice(0, -1).every((s) => s.status === "" && !s.dying)).toBe(true);
  expect(caught.at(-1).status).toBe(DYING.captivator);
  await expect(status(page)).toHaveClass(/dying/);
  await expect.poll(() => said(page)).toContain(DYING.captivator);
  expect(errors).toEqual([]);
});
