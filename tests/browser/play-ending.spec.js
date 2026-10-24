import { test, expect } from "@playwright/test";
import { faced, frozen, laid, settle, timed, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  LEVEL,
  betweenFrames,
  clockLine,
  flipped,
  jumped,
  line,
  opened,
  orbited,
  presses,
  probe,
  say,
  startPlay,
  starts,
  station,
  status,
  stepTo,
} from "./playhelpers.js";
import { ENDED } from "../../public/js/play/phrases.js";

// HIDDEN 1: a field of blocks two apart, the start on the one nearest the player, so a jump to
// either side comes down on nothing
const HIDDEN_LEVEL = "/#HIRO/18/45,35/fit/33";

const TIME_UP = "TIME OUT! 0 points, 0 seconds left. Space or Enter starts the level again.";

const TIME_UP_PAD =
  "TIME OUT! 0 points, 0 seconds left. Space, Enter or a tap on the pad starts the level again.";

/** The zooms the ending's view draws at from the yaw `from`, one a drawn frame, through the
    frames one swing of the quicker eye takes, counted by the yaw's turn, and whether the view
    was still the ending's, the camera's frame let go, at their end. */
const swung = (page, from) =>
  page.evaluate(async (from) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { motionTable }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js"].map(at),
    );
    const { turn, play } = motionTable();
    const step = (play.view.angles[2] * 360) / turn;
    const frames = Math.ceil(turn / play.view.bonus.swing) + 1;
    const turned = () => (state.cam.yaw - from) / step;
    const round = (v) => Math.round(v * 1000) / 1000;
    const zooms = [];
    const until = performance.now() + 8000;
    while (state.frame === null && turned() < frames && performance.now() < until) {
      zooms.push(round(state.cam.zoom));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { zooms, held: state.frame === null && turned() >= frames };
  }, from);

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
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a key out of the ball's reach, so the level plays as an arcade one and not by its blocks
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect(clockLine(page)).toHaveText("Time 2");
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
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
  await page.waitForTimeout(200);
  const held = await probe(page);
  expect(held.station).toEqual(over.station);
  expect(held.cam).toEqual(over.cam);
  // Enter on a strip button the keyboard has moved to works the button rather than starting the
  // level again, and the verdict names the pad while the pad shows
  const padBtn = page.locator("#padBtn");
  const padWas = await padBtn.getAttribute("aria-pressed");
  await tabbedTo(page, padBtn);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas === "true" ? "false" : "true");
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP : TIME_UP_PAD);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP_PAD : TIME_UP);
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  // Space starts the level again whatever has the focus
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
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
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("Enter starts the level again after a button was clicked in the sidebar or on the strip, and is left to a strip button the keyboard has moved to, which Space is not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  const ended = async (verdict) => {
    await page.keyboard.down("ArrowUp");
    await expect(status(page)).toHaveText(verdict, { timeout: 10_000 });
    await page.keyboard.up("ArrowUp");
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
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a key makes the level an arcade one, whose ending's view swings the slower way
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await startPlay(page);
  await expect
    .poll(() => status(page).textContent(), { timeout: 10_000, intervals: [50] })
    .toBe(TIME_UP);
  await expect(say(page)).toHaveText(TIME_UP);
  const over = await probe(page);
  expect(over.playing).toBe(true);
  expect(over.frame).toBeNull();
  expect(over.target).toEqual([17.5, 17.5, 17.5]);
  expect(over.fitted).toBe(true);
  // the view turns and the eye swings, frame by frame
  await expect.poll(async () => (await probe(page)).cam.yaw).not.toBe(over.cam.yaw);
  const turned = await probe(page);
  expect(turned.cam.yaw).toBeGreaterThan(over.cam.yaw);
  expect(turned.cam.pitch).toBeLessThan(over.cam.pitch);
  expect(turned.cam.zoom).not.toBe(over.cam.zoom);
  expect(turned.frame).toBeNull();
  expect(turned.target).toEqual([17.5, 17.5, 17.5]);
  expect(turned.station).toEqual(over.station);
  // through one swing of the quicker eye the arcade eye only draws further off than it stood,
  // and the verdict stands
  const { zooms, held } = await swung(page, over.cam.yaw);
  expect(held).toBe(true);
  expect(zooms.length).toBeGreaterThan(1);
  expect(Math.max(...zooms)).toBe(zooms[0]);
  expect(Math.min(...zooms)).toBeLessThan(zooms[0]);
  expect(await status(page).textContent()).toBe(TIME_UP);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  await expect.poll(async () => (await probe(page)).frame, { intervals: [50] }).toEqual(IDENTITY);
  const back = await probe(page);
  expect(back.cam.yaw).toBe(20);
  expect(back.cam.pitch).toBe(30);
  expect(back.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(errors).toEqual([]);
});

test("left alone, the ending's view runs the length of the slower swing and the level starts again by itself, and Esc leaves it with the view as it was", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a second block the ball never rolls onto, so the level with no key is not done by its blocks
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  // framed anew about both blocks, as leaving play frames it
  await page.evaluate(async () => {
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fit();
  });
  await expect.poll(async () => (await probe(page)).target).toEqual([18, 17.5, 17.5]);
  const before = await probe(page);
  await startPlay(page);
  // the block under the ball scored as the level opened, and a death on a level with no key
  // scores nothing, run or no run
  await expect
    .poll(() => status(page).textContent(), { timeout: 10_000, intervals: [50] })
    .toBe(TIME_UP);
  const since = Date.now();
  const over = await probe(page);
  expect(over.frame).toBeNull();
  // a level with no key swings the quicker way: within one swing of its eye the view draws nearer
  // than it stood, and the verdict stands past that swing
  const { zooms, held } = await swung(page, over.cam.yaw);
  expect(held).toBe(true);
  expect(zooms.length).toBeGreaterThan(1);
  expect(Math.max(...zooms)).toBeGreaterThan(zooms[0]);
  expect(await status(page).textContent()).toBe(TIME_UP);
  // the view runs the length of the slower swing, near six seconds, which the frames cannot run
  // ahead of the wall clock, and then the level starts again by itself
  await expect(status(page)).toHaveText("", { timeout: 10_000 });
  expect(Date.now() - since).toBeGreaterThan(5000);
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  await expect.poll(async () => (await probe(page)).frame, { intervals: [50] }).toEqual(IDENTITY);
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  // the ending has let the frame go already, so the wait is for the view the ease lands on
  await expect
    .poll(async () => {
      const { playing, frame, cam, target } = await probe(page);
      return { playing, frame, cam, target };
    })
    .toEqual({ playing: false, frame: null, cam: before.cam, target: before.target });
  expect(errors).toEqual([]);
});

test("a level whose start was edited away under play starts again on the first face the ball could stand on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 1);
  await expect(page.locator("#chipLine")).toContainText("time 1");
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(clockLine(page)).toHaveText("Time 1");
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  expect(await starts(page)).toBe(1);
  await faced(page, [17, 17, 17], 0, null);
  await expect.poll(() => starts(page)).toBe(0);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText(
    "The level has no start, so the ball stands on the first face it could.",
  );
  await expect(clockLine(page)).toHaveText("Time 1");
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: [17, 17, 17], face: 0, moving: false }),
  );
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("on a hidden level the ending's view turns the level under an eye that does not swing, as the game's does", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: HIDDEN_LEVEL });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,21,17, facing -y");
  // past the level's opening, which holds the pad dead, and facing the gap beside the start
  await betweenFrames(page, () => page.keyboard.press("ArrowLeft"));
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  // a jump two blocks on comes down on nothing, and the ball falls off the level
  await jumped(page);
  expect(await stepTo(page, "^FELL OFF!", 400)).not.toBeNull();
  const seen = await orbited(page, 40);
  await page.evaluate(() => window.__thaw());
  // the zoom stands from frame to frame while the yaw turns
  expect(new Set(seen.map((s) => s.zoom)).size).toBe(1);
  expect(new Set(seen.map((s) => s.yaw)).size).toBe(seen.length);
  expect(errors).toEqual([]);
});
