import { test, expect } from "@playwright/test";
import { frozen, onward, settle, stepUntil, still, topPixels, trackErrors } from "./helpers.js";
import {
  arcadeDraft,
  clockOf,
  jumped,
  line,
  listening,
  probe,
  said,
  startPlay,
  table,
  toggled,
} from "./playhelpers.js";
import { LETHARGY, SUNGLASSES } from "../../public/js/play/passes.js";
import { WEARING_OFF } from "../../public/js/play/phrases.js";

// LEVEL 86: the start on a ring of blocks, a bouncy pill two blocks on across a gap and blocks two
// apart beyond it
const PILL_LEVEL = "/#FIELD/10/45,35/fit/33";

// LEVEL 43: the start at one end of a row of three blocks, a lethargy pill on the block at the
// other end, to the ball's left as the level opens
const LETHARGY_LEVEL = "/#INCA/12/45,35/fit/33";

/** Play opened on LETHARGY_LEVEL, frozen, the ball turned to face the pill's block and at rest. */
async function facingPill(page) {
  const errors = trackErrors(page);
  await page.goto(LETHARGY_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,19,17, facing -y");
  await listening(page);
  const { hz, play, types } = await table(page);
  const clock = await clockOf(page, play);
  await frozen(page);
  // a quarter turn toward the pill, past the level's opening, which holds the pad dead
  await page.keyboard.press("ArrowLeft");
  const turned = await stepUntil(page, { line: "facing -x", moving: false, eased: true }, hz);
  expect(turned.at(-1).station.moving).toBe(false);
  await expect(line(page)).toContainText("facing -x");
  return { errors, hz, clock, lasts: types[String(LETHARGY)].lasts };
}

test("the sunglasses show every invisible block as the game does, the ball's light off them while they last, then blink them as they wear off, the strip saying so, and the ball's light alone shows them again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // the sunglasses on the block ahead, an invisible block within the ball's light once it stands
  // there and another well out of it, whose shimmer runs in the same phase, since the game
  // spreads it by the cell's position
  const near = [18, 15, 17];
  const far = [20, 13, 17];
  await arcadeDraft(page, {
    blocks: [
      [[17, 16, 17], { kind: 0 }],
      [near, { kind: 3 }],
      [far, { kind: 3 }],
    ],
    faces: [[[17, 16, 17], 0, { type: SUNGLASSES }]],
    textures: true,
  });
  const { hz, types } = await table(page);
  const cycle = await page.evaluate(async () => {
    const { skinsTable } = await import(new URL("js/viewer/data.js", location.href).href);
    const { frames, level } = skinsTable().cycles.invisible;
    return [frames.length, level.length];
  });
  const { word, step, blink } = types[String(SUNGLASSES)].lasts;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // the shimmer and the pulse come round together once in this many frames
  const period = (cycle[0] * cycle[1]) / gcd(...cycle);
  const standing = Math.floor(word / step) + 1;
  const lengths = [blink.first, ...Array(blink.times - 1).fill(blink.frames)];
  const hidden = standing + lengths.reduce((a, b) => a + b, 0);
  // the frames the view takes to settle behind the ball once it has stopped
  const settled = 2 * hz;
  // the frames read at either end of the word
  const span = 12;
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  await onward(page, settled);
  await page.keyboard.press("ArrowUp");
  const took = await stepUntil(page, { seeing: true }, settled);
  expect(took.length).toBeGreaterThan(1);
  expect(took.at(-1).seeing).toBe(true);
  // from the take's frame: the hidden stretch read a period on from the shown one, at its phase
  let at = 0;
  const to = async (frame) => {
    await onward(page, frame - at);
    at = frame;
  };
  const read = async (frames, readings) => {
    const out = await stepUntil(page, null, frames, readings);
    at += frames;
    return out;
  };
  await to(hidden - period);
  const shown = await read(span, { seeing: true, status: true, top: near });
  const farShown = await topPixels(page, far);
  await to(standing - 1);
  const spell = await read(blink.first, { seeing: true, status: true });
  await to(hidden);
  const after = await read(span, { seeing: true, status: true, top: near });
  const farAfter = await topPixels(page, far);
  await page.evaluate(() => window.__thaw());
  await expect(page.locator("#playPoints")).toHaveText("500 points");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(shown.every((r) => r.seeing && r.status === "")).toBe(true);
  expect(spell.every((r) => !r.seeing && r.status === WEARING_OFF)).toBe(true);
  expect(after.every((r) => !r.seeing && r.status === "")).toBe(true);
  // the ball's light reaches the near block's corner and not the far one
  expect(shown.filter((r, i) => r.top !== after[i].top).length).toBeGreaterThan(span / 2);
  expect(farAfter).toEqual(farShown);
  expect(errors).toEqual([]);
});

test("the bouncy pill bounds the ball as the game does: taken with the keys released and up pressed on the frame the ball comes down, it leaves the ground two blocks on, bound after bound, the live region saying it is taken", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(PILL_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,23,17, facing -y");
  await listening(page);
  const { hz, play } = await table(page);
  const clock = await clockOf(page, play);
  await frozen(page);
  // past the opening's dead pad, a jump onto the pill's block, up released so the latch is clear
  await onward(page, play.start.wait);
  await jumped(page);
  const landed = await stepUntil(page, { block: [19, 21, 17], moving: false }, hz, {
    station: true,
  });
  expect(landed.at(-1).station.moving).toBe(false);
  await page.keyboard.down("ArrowUp");
  const bounded = await stepUntil(page, { block: [19, 17, 17], moving: false }, clock, {
    station: true,
  });
  await page.keyboard.up("ArrowUp");
  await page.evaluate(() => window.__thaw());
  expect(bounded.at(-1).station).toEqual({
    block: [19, 17, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  const blocks = [...landed, ...bounded].map((r) => r.station.block.join());
  expect(blocks.filter((b, i) => i === 0 || b !== blocks[i - 1])).toEqual([
    "19,23,17",
    "19,21,17",
    "19,19,17",
    "19,17,17",
  ]);
  await expect.poll(() => said(page)).toContain("Bouncy pill taken.");
  expect(errors).toEqual([]);
});

test("with Invisible blocks off, an invisible block beyond the ball's reach is not drawn in play", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const far = [20, 13, 17];
  await arcadeDraft(page, { blocks: [[far, { kind: 3 }]], motion: false, textures: true });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const bright = (px) => Math.max(...px) > 60;
  expect((await topPixels(page, far)).filter(bright).length).toBeGreaterThan(200);
  await toggled(page, "showInvisible", "on by default");
  expect((await topPixels(page, far)).filter(bright)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the lethargy pill halves the pace as the game does: a step of a sixtieth runs one game frame to the frame of its take, and two run one from the frame after, the roll stepped to its rest on the pill's block", async ({
  page,
}) => {
  const { errors, hz, lasts } = await facingPill(page);
  await page.keyboard.down("ArrowUp");
  const toPill = await stepUntil(page, { block: [17, 19, 17] }, hz, { frame: true });
  await page.keyboard.up("ArrowUp");
  const rested = await stepUntil(page, { moving: false }, hz, { frame: true, station: true });
  await page.evaluate(() => window.__thaw());
  expect(rested.at(-1).station).toEqual({
    block: [17, 19, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
  const frames = [...toPill, ...rested].map((r) => r.frame);
  // every step to the take's ran a frame, so the first that ran none follows the take's frame
  const slowed = frames.findIndex((f, i) => i > 0 && f === frames[i - 1]);
  expect(slowed).toBeGreaterThan(0);
  const took = slowed - 1;
  expect(frames.slice(0, took + 1)).toEqual(frames.slice(0, took + 1).map((_, i) => frames[0] + i));
  expect(frames.slice(took)).toEqual(
    frames.slice(took).map((_, d) => frames[took] + Math.floor(d / lasts.blanks)),
  );
  expect(frames.length - took).toBeGreaterThan(3 * lasts.blanks);
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});

test("the lethargy pill rolls the view and ghosts the screen as the game does: the pill's frame flashes white and turns the view off the ball's frame, the picture trails greenish behind the pass after, and once the word has run out the view is the ball's frame again and a white glow fades", async ({
  page,
}) => {
  const { errors, hz, clock, lasts } = await facingPill(page);
  const { word, step, screen } = lasts;
  // the view settles on the ball after the turn
  await onward(page, hz / 2 - 1);
  const [rest] = await stepUntil(page, null, 1, { canvas: true });
  const before = rest.canvas;
  const ballFrame = (await probe(page)).frame;
  await page.keyboard.down("ArrowUp");
  const toPill = await stepUntil(page, { turned: ballFrame }, hz, {
    frame: true,
    view: true,
    canvas: true,
  });
  await page.keyboard.up("ArrowUp");
  const took = toPill.at(-1);
  expect(took.view).not.toEqual(ballFrame);
  // the canvas as the draw of `pass` after the pill's leaves it, before the page draws it again
  const drawnOn = async (pass) => {
    await stepUntil(page, { frame: took.frame + pass - 1 }, clock);
    const run = await stepUntil(page, { frame: took.frame + pass }, clock, { canvas: true });
    return run.at(-1).canvas;
  };
  // the pass the end is asked on, which draws the ghost once more, and the fade's passes after
  const end = word / step + 1;
  const fades = screen.fade.from / screen.fade.by;
  const samples = { 0: took.canvas };
  for (const pass of [1, end + 1, end + Math.ceil(fades / 2), end + fades, end + fades + 1])
    samples[pass] = await drawnOn(pass);
  const back = await probe(page);
  await page.evaluate(() => window.__thaw());
  expect(back.frame).toEqual(ballFrame);
  expect(back.station).toEqual({ block: [17, 19, 17], face: 0, heading: "-x", moving: false });
  const bright = (c) => (c[0] + c[1] + c[2]) / 3;
  const base = samples[end + fades + 1];
  // the flash: white everywhere on the pill's frame, over a scene far darker before and after
  expect(bright(before)).toBeLessThan(160);
  expect(bright(base)).toBeLessThan(160);
  expect(samples[0].every((v) => v >= 250)).toBe(true);
  // the ghost of the flash on the pass after: half the scene and half a greenish white
  const ghost = samples[1];
  expect(bright(ghost)).toBeGreaterThan(bright(base) / 2 + 60);
  expect(bright(ghost)).toBeLessThan(250);
  expect(ghost[1] - ghost[0] - (base[1] - base[0]) / 2).toBeGreaterThan(8);
  // the glow fades from the end: brighter first, dimmer midway, the scene's own brightness at its
  // last pass
  expect(bright(samples[end + 1])).toBeGreaterThan(bright(samples[end + Math.ceil(fades / 2)]));
  expect(bright(samples[end + Math.ceil(fades / 2)])).toBeGreaterThan(bright(samples[end + fades]));
  expect(Math.abs(bright(samples[end + fades]) - bright(base))).toBeLessThanOrEqual(10);
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});
