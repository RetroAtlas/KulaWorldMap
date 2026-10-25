import { test, expect } from "@playwright/test";
import { drafted, faced, frozen, onward, stepUntil, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  arcadeDraft,
  clockLine,
  clockOf,
  flipped,
  jumped,
  line,
  presses,
  probe,
  say,
  startPlay,
  starts,
  status,
  table,
} from "./playhelpers.js";
import { ENDED, NO_START } from "../../public/js/play/phrases.js";
import { KEY } from "../../public/js/play/world.js";

const TIME_UP = "TIME OUT! 0 points, 0 seconds left. Space or Enter starts the level again.";

const TIME_UP_PAD =
  "TIME OUT! 0 points, 0 seconds left. Space, Enter or a tap on the pad starts the level again.";

const LOST = /^FELL OFF! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;

/** Move the keyboard's focus to `button` as Tab does, stepping off it and back. */
const tabbedTo = async (page, button) => {
  await button.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
};

test("time runs out into the strip's verdict with the pad dead and the view let go of the ball, and Space starts the level again with the clock full, the ball on the start and the circuits as loaded", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page, { time: 2, motion: false });
  const { play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect(clockLine(page)).toHaveText("Time 2");
  await frozen(page);
  // with Motion off the level runs only while a key is held, so Up held runs the clock out
  await page.keyboard.down("ArrowUp");
  await stepUntil(page, { status: "^TIME OUT" }, 2 * play.clock.second);
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP);
  await expect(say(page)).toHaveText(TIME_UP);
  await expect(line(page)).toHaveText(ENDED);
  await expect(clockLine(page)).toHaveText("Time 0");
  const over = await probe(page);
  expect(over.playing).toBe(true);
  // the view stands on the level's middle, the ball's frame let go, and with Motion off it stays
  expect(over.frame).toBeNull();
  expect(over.target).toEqual([17.5, 17.5, 17.5]);
  expect(over.fitted).toBe(true);
  await page.keyboard.press("ArrowLeft");
  await onward(page, 1);
  const held = await probe(page);
  expect(held.station).toEqual(over.station);
  expect(held.cam).toEqual(over.cam);
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  // Space starts the level again whatever has the focus
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect(clockLine(page)).toHaveText("Time 2");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  const again = await probe(page);
  expect(again.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(again.frame).toEqual(IDENTITY);
  expect(again.cam.yaw).toBe(20);
  expect(again.cam.pitch).toBe(30);
  expect(await presses(page)).toEqual([]);
  await page.evaluate(() => window.__thaw());
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("Enter starts the level again after a button was clicked in the sidebar or on the strip, and is left to a strip button the keyboard has moved to, which Space is not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page, { time: 2, motion: false });
  const { play } = await table(page);
  await startPlay(page);
  await frozen(page);
  const ended = async (verdict) => {
    await page.keyboard.down("ArrowUp");
    await stepUntil(page, { status: "^TIME OUT" }, 2 * play.clock.second);
    await page.keyboard.up("ArrowUp");
    await expect(status(page)).toHaveText(verdict);
    await expect(line(page)).toHaveText(ENDED);
  };
  const started = async () => {
    await expect(status(page)).toHaveText("");
    await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
    await expect(clockLine(page)).toHaveText("Time 2");
  };
  // the sidebar's new button keeps the focus its click left it, and Enter starts the level again
  // rather than making a draft
  await ended(TIME_UP);
  await expect(page.locator("#draftNew")).toBeFocused();
  await page.keyboard.press("Enter");
  await started();
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // so does a strip button clicked with the mouse, which Enter leaves as the click left it
  await ended(TIME_UP);
  const padBtn = page.locator("#padBtn");
  const padWas = await padBtn.getAttribute("aria-pressed");
  const padNow = padWas === "true" ? "false" : "true";
  await padBtn.click();
  await expect(padBtn).toHaveAttribute("aria-pressed", padNow);
  await expect(status(page)).toHaveText(padNow === "true" ? TIME_UP_PAD : TIME_UP);
  await expect(padBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await started();
  await expect(padBtn).toHaveAttribute("aria-pressed", padNow);
  // a strip button Tab has moved to keeps Enter, which presses it, and the level stays ended
  await ended(padNow === "true" ? TIME_UP_PAD : TIME_UP);
  await tabbedTo(page, padBtn);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP_PAD : TIME_UP);
  await expect(line(page)).toHaveText(ENDED);
  const forgive = page.locator("#forgiveBtn");
  await tabbedTo(page, forgive);
  await page.keyboard.press("Enter");
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press("Enter");
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press(" ");
  await started();
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("when the time runs out with Motion on, the view lets go of the ball and turns about the level as the game's does, and Space brings it back behind the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a key makes the level an arcade one, whose ending's view swings the slower way
  await arcadeDraft(page, { time: 2 });
  const { hz, play } = await table(page);
  await startPlay(page);
  await frozen(page);
  // the view comes round behind the ball first, the level running meanwhile, and the clock runs out
  const came = await stepUntil(page, { eased: true }, hz);
  expect(came.at(-1).eased).toBe(true);
  await stepUntil(page, { status: "^TIME OUT" }, 2 * play.clock.second);
  await expect(status(page)).toHaveText(TIME_UP);
  await expect(say(page)).toHaveText(TIME_UP);
  const over = await probe(page);
  expect(over.playing).toBe(true);
  expect(over.frame).toBeNull();
  expect(over.target).toEqual([17.5, 17.5, 17.5]);
  expect(over.fitted).toBe(true);
  // the view turns and the eye swings, frame by frame, and the verdict stands
  await onward(page, 1);
  const turned = await probe(page);
  expect(turned.cam.yaw).toBeGreaterThan(over.cam.yaw);
  expect(turned.cam.pitch).toBeLessThan(over.cam.pitch);
  expect(turned.cam.zoom).not.toBe(over.cam.zoom);
  expect(turned.frame).toBeNull();
  expect(turned.target).toEqual([17.5, 17.5, 17.5]);
  expect(turned.station).toEqual(over.station);
  await expect(status(page)).toHaveText(TIME_UP);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  const eased = await stepUntil(page, { eased: true }, hz);
  expect(eased.at(-1).eased).toBe(true);
  const back = await probe(page);
  expect(back.frame).toEqual(IDENTITY);
  expect(back.cam.yaw).toBe(20);
  expect(back.cam.pitch).toBe(30);
  expect(back.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(errors).toEqual([]);
});

test("left alone, the ending's view runs the length of the slower swing and the level starts again by itself, and Esc leaves it with the view as it was", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a second block the ball never rolls onto, so the level with no key is not done by its blocks
  await drafted(page, { blocks: [[[18, 17, 17], { kind: 0 }]], time: 2 });
  // framed anew about both blocks, as leaving play frames it
  await page.evaluate(async () => {
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fit();
  });
  await expect.poll(async () => (await probe(page)).target).toEqual([18, 17.5, 17.5]);
  const before = await probe(page);
  const { hz, turn, play } = await table(page);
  await startPlay(page);
  await frozen(page);
  // the view comes round behind the ball first, and the clock runs out as the level runs meanwhile
  const came = await stepUntil(page, { eased: true }, hz);
  expect(came.at(-1).eased).toBe(true);
  await stepUntil(page, { status: "^TIME OUT" }, 2 * play.clock.second);
  // the block under the ball scored as the level opened, and a death on a level with no key
  // scores nothing, run or no run
  await expect(status(page)).toHaveText(TIME_UP);
  const over = await probe(page);
  expect(over.frame).toBeNull();
  // the view runs the length of the slower swing, the verdict standing on every frame of it but
  // the last, on which the level starts again by itself
  const length = Math.floor(turn / play.view.swing);
  const swing = await stepUntil(page, { status: "^$" }, length);
  expect(swing.length).toBe(length);
  expect(swing.slice(0, -1).every((s) => s.status === TIME_UP)).toBe(true);
  expect(swing.at(-1).status).toBe("");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  const eased = await stepUntil(page, { eased: true }, hz);
  expect(eased.at(-1).eased).toBe(true);
  expect((await probe(page)).frame).toEqual(IDENTITY);
  await stepUntil(page, { status: "^TIME OUT" }, 2 * play.clock.second);
  await expect(status(page)).toHaveText(TIME_UP);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  // the ending has let the frame go already, so the view read is the one the ease lands on
  const left = await stepUntil(page, { eased: true }, hz);
  expect(left.at(-1).eased).toBe(true);
  const { playing, frame, cam, target } = await probe(page);
  expect({ playing, frame, cam, target }).toEqual({
    playing: false,
    frame: null,
    cam: before.cam,
    target: before.target,
  });
  expect(errors).toEqual([]);
});

test("a level whose start was edited away under play starts again on the first face the ball could stand on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page, { time: 1, motion: false });
  const { play } = await table(page);
  await startPlay(page);
  await expect(clockLine(page)).toHaveText("Time 1");
  await frozen(page);
  await page.keyboard.down("ArrowUp");
  await stepUntil(page, { status: "^TIME OUT" }, play.clock.second);
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP);
  expect(await starts(page)).toBe(1);
  await faced(page, [17, 17, 17], 0, null);
  await expect.poll(() => starts(page)).toBe(0);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText(NO_START);
  await expect(clockLine(page)).toHaveText("Time 1");
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: [17, 17, 17], face: 0, moving: false }),
  );
  await page.evaluate(() => window.__thaw());
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("a jump off the lattice is lost, which ends the level", async ({ page }) => {
  const errors = trackErrors(page);
  // from the lattice's last column a jump lands past its edge, and the ball is lost
  await drafted(page, {
    blocks: [[[32, 17, 17], { kind: 0 }]],
    faces: [[[17, 17, 17], 4, { type: KEY }]],
    motion: false,
  });
  const { play } = await table(page);
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 32, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  await frozen(page);
  // the level's clock bounds the stepping; a tap of Left waits for the opening's first read frame
  // and turns the ball to face the edge, and a jump from rest there comes down on nothing
  const clock = await clockOf(page, play);
  await page.keyboard.press("ArrowLeft");
  const turned = await stepUntil(page, { line: "facing \\+x", moving: false }, clock);
  expect(turned.at(-1).station.moving).toBe(false);
  await expect(line(page)).toContainText("facing +x");
  await jumped(page);
  await stepUntil(page, { status: "^FELL OFF" }, clock);
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
