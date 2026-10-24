import { test, expect } from "@playwright/test";
import { drawn, faced, gold, laid, settle, still, topPixels, trackErrors } from "./helpers.js";
import {
  LEVEL,
  betweenFrames,
  line,
  listening,
  opened,
  probe,
  rolled,
  route,
  said,
  say,
  startPlay,
  status,
  stopOn,
  toggled,
} from "./playhelpers.js";
import {
  DONE_WHY,
  FOLLOWING,
  FOLLOWING_PAD,
  KEEPING,
  NO_FIRST_STOP,
} from "../../public/js/play/phrases.js";

test("Keep hands the way the ball has come to the planner and goes on handing it over as the ball goes on, until it is pressed again, the route is cleared or followed, and another's route leaves it disabled", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const keep = page.locator("#keepBtn");
  const count = page.locator("#courseLine");
  const clear = page.locator("#courseClear");
  // at the start, one station: a route of the start alone, which grows from there
  await expect(keep).toBeEnabled();
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(say(page)).toHaveText(KEEPING);
  await expect(count).toHaveText("Route planner · 1 stop");
  expect(await route(page)).toEqual({
    stations: [{ cell: [17, 18, 17], face: 0 }],
    steps: [],
    marks: [0],
  });
  // a roll, and the route grows under the ball without another press
  await rolled(page, [17, 17, 17]);
  await expect(count).toHaveText("Route planner · 2 stops");
  expect(await route(page)).toEqual({
    stations: [
      { cell: [17, 18, 17], face: 0 },
      { cell: [17, 17, 17], face: 0 },
    ],
    steps: [{ k: 2, o: 0 }],
    marks: [0, 1],
  });
  // pressed again, the route stays as it is while the ball goes on
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await rolled(page, [17, 16, 17]);
  await expect(count).toHaveText("Route planner · 2 stops");
  expect((await route(page)).stations).toHaveLength(2);
  // pressed once more, the route being the ball's own route, the whole way is handed over
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText("Route planner · 2 stops");
  expect(await route(page)).toEqual({
    stations: [
      { cell: [17, 18, 17], face: 0 },
      { cell: [17, 17, 17], face: 0 },
      { cell: [17, 16, 17], face: 0 },
    ],
    steps: [
      { k: 2, o: 0 },
      { k: 2, o: 0 },
    ],
    marks: [0, 2],
  });
  // Clear on the planner's strip releases Keep, which takes the way again on the cleared level
  await clear.click();
  await clear.click();
  await expect(count).toHaveText("Route planner · 0 stops");
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText("Route planner · 2 stops");
  // Follow releases Keep, and an arrow takes the ball back from the route
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowLeft");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(keep).toBeEnabled();
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // a route of the planner's own leaves Keep disabled, and stays as play is left
  await clear.click();
  await clear.click();
  await expect(count).toHaveText("Route planner · 0 stops");
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-y");
  await stopOn(page, [17, 15, 17]);
  await expect(count).toHaveText("Route planner · 2 stops");
  await expect(keep).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#course")).toBeVisible();
  await expect(count).toHaveText("Route planner · 2 stops");
  expect(errors).toEqual([]);
});

test("the route kept under the ball shows in gold on the block the ball crossed once Keep is pressed, and not before", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const golden = async (c) => (await topPixels(page, c)).filter(gold).length;
  await opened(page, { motion: false });
  await startPlay(page);
  const keep = page.locator("#keepBtn");
  // the dust put away, so any gold over the block is the route's gold, and two rolls, so the block
  // behind the ball carries a whole roll of it
  await toggled(page, "showDust", "on by default");
  await rolled(page, [17, 17, 17]);
  await rolled(page, [17, 16, 17]);
  const crossed = [17, 17, 17];
  expect(await golden(crossed)).toBe(0);
  expect(await drawn(page)).toBe(0);
  await keep.click();
  await expect(say(page)).toHaveText(KEEPING);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  expect(await golden(crossed)).toBeGreaterThan(50);
  expect(await drawn(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("Follow rolls the ball along the planned route to its last stop and says the route is done, from the last stop it starts again at the first, and an arrow takes the ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // the planner's two clicks: three rolls along -y to a stop, a turn and three along +x
  await page.keyboard.press("r");
  await stopOn(page, [17, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await stopOn(page, [20, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  await startPlay(page);
  await listening(page);
  const follow = page.locator("#followBtn");
  await expect(follow).toBeVisible();
  await expect(follow).toBeEnabled();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#keepBtn")).toBeDisabled();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(FOLLOWING);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [50] })
    .toEqual([20, 15, 17]);
  await expect(status(page)).toHaveText(DONE_WHY.end);
  await expect(say(page)).toHaveText(DONE_WHY.end);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => said(page)).toContain(FOLLOWING);
  await expect.poll(() => said(page)).toContain("17,15,17, top");
  expect((await probe(page)).station).toEqual({
    block: [20, 15, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  // from the last stop the ball is put on the first and follows again, until an arrow takes it
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => said(page))
    .toContain(`The ball is put on the top of 17,18,17. ${FOLLOWING}`);
  await expect(status(page)).toHaveText("");
  await expect(line(page)).toContainText("facing -x", { timeout: 10_000 });
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  const taken = (await probe(page)).station.block;
  expect(taken[1]).toBeGreaterThanOrEqual(17);
  await page.waitForTimeout(400);
  expect((await probe(page)).station.block).toEqual(taken);
  expect(errors).toEqual([]);
});

test("the Follow line names the pad only while it shows, following the Pad button as it is pressed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // a route round the level, long enough to be followed through the checks
  await page.keyboard.press("r");
  await stopOn(page, [17, 15, 17]);
  await stopOn(page, [20, 15, 17]);
  await stopOn(page, [20, 18, 17]);
  await stopOn(page, [17, 18, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 5 stops");
  await startPlay(page);
  await listening(page);
  const padBtn = page.locator("#padBtn");
  await padBtn.click();
  await expect(page.locator("#pad")).toBeVisible();
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(FOLLOWING_PAD);
  await expect.poll(() => said(page)).toContain(FOLLOWING_PAD);
  await padBtn.click();
  await expect(page.locator("#pad")).toBeHidden();
  await expect(status(page)).toHaveText(FOLLOWING);
  await padBtn.click();
  await expect(page.locator("#pad")).toBeVisible();
  await expect(status(page)).toHaveText(FOLLOWING_PAD);
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(status(page)).toHaveText("");
  expect(errors).toEqual([]);
});

test("following a route to its leap stops the ball there and says so, and with the ball off the route and the first stop's block gone Follow says there is nothing to stand on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a block beside the start's block and another across a gap no roll crosses
  await laid(page, [18, 17, 17], { kind: 0 });
  await laid(page, [20, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await still(page);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await page.keyboard.press("r");
  await stopOn(page, [18, 17, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await stopOn(page, [20, 17, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops · 1 leap");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [50] })
    .toEqual([18, 17, 17]);
  await expect(status(page)).toHaveText(DONE_WHY.leap);
  await expect(say(page)).toHaveText(DONE_WHY.leap);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect((await probe(page)).station).toEqual({
    block: [18, 17, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  // off the route, round the edge onto the block's +x side, with the first stop's block taken out
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(1);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await laid(page, [17, 17, 17], null);
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await expect(follow).toBeVisible();
  await follow.click();
  await expect(status(page)).toHaveText(NO_FIRST_STOP);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect((await probe(page)).station).toEqual({
    block: [18, 17, 17],
    face: 1,
    heading: "+z",
    moving: false,
  });
  expect(errors).toEqual([]);
});

test("Keep, pressed, keeps a jump the ball made as a jump of the route, and Follow jumps where the route jumps, the ball coming to rest where it lands", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a block beside the start's block and another across a gap no roll crosses, which a jump clears,
  // and a key out of reach, which keeps the level an arcade one that rolling onto every block
  // does not end
  await laid(page, [18, 17, 17], { kind: 0 });
  await laid(page, [20, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await faced(page, [17, 17, 17], 4, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await still(page);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await betweenFrames(page, () => page.keyboard.press("ArrowRight"));
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([18, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // Up held and Space: the forward jump, across the gap onto the far block
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([20, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  const keep = page.locator("#keepBtn");
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(say(page)).toHaveText(KEEPING);
  const kept = await route(page);
  expect(kept.stations).toEqual([
    { cell: [17, 17, 17], face: 0 },
    { cell: [18, 17, 17], face: 0 },
    { cell: [20, 17, 17], face: 0 },
  ]);
  // the roll along +x, then the jump along +x, coming down level with its take-off
  expect(kept.steps).toEqual([
    { k: 3, o: 0 },
    { k: 3, o: 3, d: 0 },
  ]);
  expect(kept.marks).toEqual([0, 2]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops · 1 jump");
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  // from the last stop the ball is put on the first and follows the route to its end: the roll,
  // the jump and the rest on the far block
  const follow = page.locator("#followBtn");
  await expect(follow).toBeVisible();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  const put = `The ball is put on the top of 17,17,17. ${FOLLOWING}`;
  await expect.poll(() => said(page)).toContain(put);
  await expect(status(page)).toHaveText(DONE_WHY.end, { timeout: 10_000 });
  await expect(say(page)).toHaveText(DONE_WHY.end);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [20, 17, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  // the stops the strip said since the ball was put: the block beside, then the landing, and
  // nothing between, the block between the two being missing
  const told = await said(page);
  const stops = told.slice(told.indexOf(put) + 1).filter((t) => /^\d+,\d+,\d+, top$/.test(t));
  expect(stops).toEqual(["18,17,17, top", "20,17,17, top"]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops · 1 jump");
  expect(errors).toEqual([]);
});
