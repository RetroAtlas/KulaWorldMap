import { test, expect } from "@playwright/test";
import {
  drafted,
  frozen,
  gold,
  laid,
  stepUntil,
  still,
  topPixels,
  trackErrors,
} from "./helpers.js";
import {
  arcadeDraft,
  clockOf,
  jumped,
  line,
  listening,
  opened,
  probe,
  route,
  said,
  say,
  startPlay,
  status,
  stopOn,
  table,
  teleportDraft,
} from "./playhelpers.js";
import { KEY } from "../../public/js/play/world.js";
import {
  DONE_WHY,
  FOLLOWING,
  FOLLOWING_PAD,
  KEEPING,
  NO_FIRST_STOP,
} from "../../public/js/play/phrases.js";

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pattern a reading of `stepUntil` holds on where its text is `text` alone. */
const exactly = (text) => `^${escaped(text)}$`;

/** Tap Up on the held clock and step the level until the ball rests on `block`, within `most`
    frames: the station it rests at. */
const rolledTo = async (page, block, most) => {
  await page.keyboard.press("ArrowUp");
  const run = await stepUntil(page, { block, moving: false }, most);
  const station = run.at(-1).station;
  expect(station).toMatchObject({ block, moving: false });
  return station;
};

/** Tap `key` on the held clock and step the level until the line says the ball faces `heading` at
    rest, within `most` frames: the station it rests at. */
const turned = async (page, key, heading, most) => {
  await page.keyboard.press(key);
  const run = await stepUntil(page, { line: `facing ${escaped(heading)}`, moving: false }, most);
  const station = run.at(-1).station;
  expect(station).toMatchObject({ heading, moving: false });
  return station;
};

/** Step the held level until the ball moves, within `most` frames. */
const moved = async (page, most) => {
  const run = await stepUntil(page, { moving: true }, most);
  expect(run.at(-1).station.moving).toBe(true);
};

test("Keep hands the way the ball has come to the planner and goes on handing it over as the ball goes on, until it is pressed again, the route is cleared or followed, and another's route leaves it disabled", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const golden = async (c) => (await topPixels(page, c)).filter(gold).length;
  await opened(page, { motion: false });
  const { hz } = await table(page);
  await startPlay(page);
  await frozen(page);
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
  // a roll, and the route grows under the ball without another press
  await rolledTo(page, [17, 17, 17], hz);
  await expect(count).toHaveText("Route planner · 2 stops");
  // pressed again, the route stays as it is while the ball goes on
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await rolledTo(page, [17, 16, 17], hz);
  await expect(count).toHaveText("Route planner · 2 stops");
  expect((await route(page)).stations).toHaveLength(2);
  // pressed once more, the route being the ball's own route, the whole way is handed over, and the
  // block the ball crossed carries a whole roll of the route's gold
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
  expect(await golden([17, 17, 17])).toBeGreaterThan(50);
  // Clear on the planner's strip releases Keep, which takes the way again on the cleared level
  await clear.click();
  await clear.click();
  await expect(count).toHaveText("Route planner · 0 stops");
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(keep).toHaveAttribute("aria-pressed", "true");
  await expect(count).toHaveText("Route planner · 2 stops");
  // Follow releases Keep, and an arrow takes the ball back from the route as it rolls, stopping it
  // at the next middle, where it turns
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(keep).toHaveAttribute("aria-pressed", "false");
  await moved(page, hz);
  const taken = await turned(page, "ArrowLeft", "-x", hz);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(keep).toBeEnabled();
  expect(taken.block).toEqual([17, 17, 17]);
  // a route of the planner's own leaves Keep disabled, and stays as play is left
  await clear.click();
  await clear.click();
  await expect(count).toHaveText("Route planner · 0 stops");
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  await turned(page, "ArrowRight", "-y", hz);
  await stopOn(page, [17, 15, 17]);
  await expect(count).toHaveText("Route planner · 2 stops");
  await expect(keep).toBeDisabled();
  await page.evaluate(() => window.__thaw());
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#course")).toBeVisible();
  await expect(count).toHaveText("Route planner · 2 stops");
  expect(errors).toEqual([]);
});

test("Follow rolls the ball along the planned route to its last stop and says the route is done, from the last stop it starts again at the first, and an arrow takes the ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const { hz, play } = await table(page);
  // the planner's two clicks: three rolls along -y to a stop, a turn and three along +x
  await page.keyboard.press("r");
  await stopOn(page, [17, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await stopOn(page, [20, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  await startPlay(page);
  await listening(page);
  await frozen(page);
  const clock = await clockOf(page, play);
  const follow = page.locator("#followBtn");
  await expect(follow).toBeVisible();
  await expect(follow).toBeEnabled();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#keepBtn")).toBeDisabled();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(FOLLOWING);
  await stepUntil(page, { status: exactly(DONE_WHY.end) }, clock);
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
  // from the last stop the ball is put on the first and follows again, until an arrow takes it,
  // stopping it at the next middle, where it turns
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await moved(page, hz);
  const taken = await turned(page, "ArrowLeft", "-x", hz);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => said(page))
    .toContain(`The ball is put on the top of 17,18,17. ${FOLLOWING}`);
  await expect(status(page)).toHaveText("");
  expect(taken.block).toEqual([17, 17, 17]);
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
  // a block beside the start's block and another across a gap no roll crosses
  await drafted(page, {
    blocks: [
      [[18, 17, 17], { kind: 0 }],
      [[20, 17, 17], { kind: 0 }],
    ],
  });
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
  const { hz, play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const clock = await clockOf(page, play);
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await stepUntil(page, { status: exactly(DONE_WHY.leap) }, clock);
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
  const wrapped = await stepUntil(
    page,
    { line: escaped("on the +x side of 18,17,17"), moving: false },
    hz,
  );
  expect(wrapped.at(-1).station).toMatchObject({ face: 1, moving: false });
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
  // a block beside the start's block and another across a gap no roll crosses, which a jump clears,
  // and a key out of reach, which keeps the level an arcade one that rolling onto every block
  // does not end
  await drafted(page, {
    blocks: [
      [[18, 17, 17], { kind: 0 }],
      [[20, 17, 17], { kind: 0 }],
    ],
    faces: [[[17, 17, 17], 4, { type: KEY }]],
  });
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await still(page);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const { hz, play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  const clock = await clockOf(page, play);
  await turned(page, "ArrowRight", "+x", hz);
  await rolledTo(page, [18, 17, 17], hz);
  // Up held and Space: the forward jump, across the gap onto the far block
  await jumped(page);
  const landed = await stepUntil(page, { block: [20, 17, 17], moving: false }, hz);
  expect(landed.at(-1).station).toMatchObject({ block: [20, 17, 17], moving: false });
  const keep = page.locator("#keepBtn");
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(say(page)).toHaveText(KEEPING);
  // the three blocks the ball stood on, the first and the last marked
  const kept = await route(page);
  expect(kept.stations).toEqual([
    { cell: [17, 17, 17], face: 0 },
    { cell: [18, 17, 17], face: 0 },
    { cell: [20, 17, 17], face: 0 },
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
  await stepUntil(page, { status: exactly(DONE_WHY.end) }, clock);
  await expect(status(page)).toHaveText(DONE_WHY.end);
  await expect(say(page)).toHaveText(DONE_WHY.end);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
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

test("Keep hands over every block a slide over ice passed as a stop of the way the ball has come", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // three ice blocks on, then a stone block, where the slide stops
  await arcadeDraft(page, {
    blocks: [
      [[17, 16, 17], { kind: 2 }],
      [[17, 15, 17], { kind: 2 }],
      [[17, 14, 17], { kind: 2 }],
      [[17, 13, 17], { kind: 0 }],
    ],
    motion: false,
  });
  const { play } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  // the level's clock bounds the stepping; one tap of Up, and the slide carries the ball over the
  // ice to the stone block
  const clock = await clockOf(page, play);
  await page.keyboard.press("ArrowUp");
  const slid = await stepUntil(page, { block: [17, 13, 17], moving: false }, clock);
  expect(slid.at(-1).station.moving).toBe(false);
  // the way it has come passed over every ice block
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("2 stops");
  expect((await route(page)).stations).toEqual(
    [
      [17, 17, 17],
      [17, 16, 17],
      [17, 15, 17],
      [17, 14, 17],
      [17, 13, 17],
    ].map((cell) => ({ cell, face: 0 })),
  );
  expect(errors).toEqual([]);
});

test("Keep makes a leap of the way the ball has come where a teleporter sent it, though a roll could join its two ends", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // the teleporters lead to each other a block apart, so that a roll could join them; with Motion
  // on the send's count runs out as the frames step
  await teleportDraft(page);
  const { hz } = await table(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  await rolledTo(page, [17, 16, 17], hz);
  await rolledTo(page, [17, 15, 17], hz);
  const sent = await stepUntil(page, { block: [17, 14, 17], moving: false }, hz);
  expect(sent.at(-1).station).toEqual({
    block: [17, 14, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("1 leap");
  const kept = await route(page);
  expect(kept.stations).toEqual([
    { cell: [17, 17, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
    { cell: [17, 15, 17], face: 0 },
    { cell: [17, 14, 17], face: 0 },
  ]);
  // a leap between the two ends, though a roll could join them
  expect(kept.steps).toEqual([{ k: 2, o: 0 }, { k: 2, o: 0 }, null]);
  expect(errors).toEqual([]);
});
