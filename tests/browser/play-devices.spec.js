import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers.js";
import {
  UNTURNED,
  arcadeDraft,
  betweenFrames,
  dustOver,
  frameFor,
  line,
  listening,
  presses,
  probe,
  said,
  say,
  startPlay,
  station,
  status,
  switched,
  teleportDraft,
  ticked,
} from "./playhelpers.js";
import { LAUNCHED, RIDING, SENDING } from "../../public/js/play/phrases.js";

/** The view, the ball and the dust over `blocks` on the first drawn frame the ball stands on
    `block`, read as `probe` reads them, or null where it never comes to stand there. */
const arrived = (page, block, blocks) =>
  page.evaluate(
    async ([block, blocks]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, P, { dustOver }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "play/play.js", "play/dust.js", "format/lattice.js"].map(at),
      );
      const round = (v) => Math.round(v * 1000) / 1000;
      const until = performance.now() + 8000;
      while (performance.now() < until) {
        const station = P.station();
        if (station && !station.moving && station.block.every((v, i) => v === block[i]))
          return {
            station,
            frame: state.frame.map((v) => round(v) + 0),
            target: state.target.map(round),
            fitted: document.getElementById("fitBtn").classList.contains("fitted"),
            dust: blocks.map((c) => dustOver(cellKey(...c))),
          };
        await new Promise((r) => requestAnimationFrame(r));
      }
      return null;
    },
    [block, blocks],
  );

/** The ball's body as handed to the frame and in the world, rounded. */
const bodyHanded = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [P, { faceAxes, times }, { FACE_NORMAL }] = await Promise.all(
      ["play/play.js", "viewer/motion.js", "format/lattice.js"].map(at),
    );
    const round = (v) => Math.round(v * 1000) / 1000 + 0;
    const g = P.handed();
    const laid = faceAxes(FACE_NORMAL[g.w.face], g.fwd);
    return {
      body: g.body.map((row) => row.map(round)),
      world: times(laid, g.body).map((row) => row.map(round)),
    };
  });

/** The depth the frame is handed for the ball and the depth of the platform's body cell under the
    ball's centre, each as the frame last drew them; a cell sorts at its corner. */
const rideDepths = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ depth }, { draw, overlayWith }, P, { FACE_NORMAL }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/render.js", "play/play.js", "format/lattice.js"].map(at),
    );
    const bodies = [];
    let drawing = true;
    overlayWith({
      block: (ctx, c) => {
        if (drawing && c.body) bodies.push([c.x, c.y, c.z]);
      },
    });
    draw();
    drawing = false;
    const g = P.handed();
    const n = FACE_NORMAL[g.w.face];
    const centre = [g.w.c.x, g.w.c.y, g.w.c.z].map((v, i) => v + 0.5 + 0.5 * n[i] + g.offset[i]);
    const under = bodies.find((b) =>
      b.every((v, i) => n[i] !== 0 || Math.abs(centre[i] - v - 0.5) < 0.5),
    );
    return { ball: g.depth, cell: under ? depth(...under) : null };
  });

test("rolling over a switch throws it, and an on teleporter sends the ball to its far end, the view cutting there and the body keeping its turn, with a leap in the way it has come", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // the teleporters lead to each other a block apart, so that a roll could join them, and the far
  // one faces across the row, so that Up is refused there with the near one's block beside
  await teleportDraft(page, { motion: false });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  expect(await presses(page)).toEqual([]);
  expect(await switched(page, [17, 16, 17])).toBe("on");
  const roll = async (block) => {
    await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  };
  await roll([17, 16, 17]);
  expect(await switched(page, [17, 16, 17])).toBe("off");
  const pressed = await presses(page);
  expect(pressed.length).toBe(1);
  expect(pressed[0][0]).toBe(0);
  expect(pressed[0][1].length).toBe(1);
  // the stop's sentence carries the throw, which would otherwise be lost to it within the frame
  await expect
    .poll(() => said(page))
    .toContain("17,16,17, top. Switch thrown: the yellow circuit turned over.");
  // onto the teleporter the ball stops at the middle, and with Motion off and no key held the
  // level stands mid-send
  await roll([17, 15, 17]);
  await expect(status(page)).toHaveText(SENDING);
  // the roll has turned the body, which the send carries onto the far face as it stands within the
  // frame, the body in the world turning with the frame
  const held = await bodyHanded(page);
  expect(held.body).not.toEqual(UNTURNED);
  // with Motion on the level runs at rest, so the count runs out on its own; the view is read on
  // the first frame the ball stands at the far end, where a target eased after the ball rather
  // than cut would still be on its way from the near one
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  const far = await arrived(
    page,
    [17, 14, 17],
    [
      [17, 15, 17],
      [17, 14, 17],
    ],
  );
  expect(far.station).toEqual({ block: [17, 14, 17], face: 0, heading: "+x", moving: false });
  expect(far.frame).toEqual(await frameFor(page, [1, 0, 0], [0, 0, -1]));
  expect(far.target).toEqual([17.5, 14.5, 16.805]);
  expect(far.fitted).toBe(true);
  const landed = await bodyHanded(page);
  expect(landed.body).toEqual(held.body);
  expect(landed.world).not.toEqual(held.world);
  await expect(line(page)).toHaveText("Playing · on the top of 17,14,17, facing +x");
  await expect.poll(() => said(page)).toContain("Sent to the top of 17,14,17.");
  // the pad is dead through the hold, and then Up is refused, the near end's block beside, and
  // the strip says nothing of it: two seconds of the clock, a whole one of frames past the hold,
  // and the ball has not moved
  await page.keyboard.press("ArrowUp");
  await ticked(page, 2);
  expect((await probe(page)).station).toEqual({
    block: [17, 14, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("1 leap");
  const route = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return { stations: c.stations, steps: c.steps };
  });
  expect(route.stations).toEqual([
    { cell: [17, 17, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
    { cell: [17, 15, 17], face: 0 },
    { cell: [17, 14, 17], face: 0 },
  ]);
  // a leap between the two ends, though a roll could join them
  expect(route.steps).toEqual([{ k: 2, o: 0 }, { k: 2, o: 0 }, null]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a jump onto a moving platform rides it: the strip says so, the ball stands where the platform has carried it, the station follows the platform to and fro, and the ball sorts nearer than the body cell under it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a platform three blocks long runs a block along x two blocks before the start, so the cell a
  // jump comes down on is always under it
  await arcadeDraft(page, {
    blocks: [[[16, 15, 17], { kind: 5, far: [17, 15, 17], length: 3, speed: 30 }]],
  });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  // Up held past the level's opening, whose frames sample it as the game's frames do, and the tap of
  // Space kept for the first frame that reads the pad, which jumps the ball from rest
  await betweenFrames(page, async () => {
    await page.keyboard.down("ArrowUp");
    await page.keyboard.press(" ");
  });
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(RIDING, { timeout: 5000 });
  await expect(say(page)).toHaveText(`17,15,17, top. ${RIDING}`);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // the platform goes back to its cell and comes again, the ball standing on it meanwhile
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([16, 15, 17]);
  await expect(line(page)).toHaveText("Playing · on the top of 16,15,17, facing -y");
  await expect(status(page)).toHaveText(RIDING);
  const carried = await probe(page);
  expect(carried.station.moving).toBe(false);
  expect(carried.target[1]).toBeCloseTo(15.5, 1);
  expect(carried.target[0]).toBeLessThan(17.5);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 15, 17]);
  // facing +y, the camera behind it, the ball must sort nearer than the body cell under it, which
  // is drawn off its lattice cell, or the cell's top paints over the ball
  for (const heading of ["+x", "+y"]) {
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await station(page)).heading).toBe(heading);
    await expect.poll(async () => (await station(page)).moving).toBe(false);
  }
  await expect(status(page)).toHaveText(RIDING);
  const depths = await rideDepths(page);
  expect(depths.cell).not.toBeNull();
  expect(depths.ball).toBeLessThan(depths.cell);
  expect(errors).toEqual([]);
});

test("a boost button launches the ball three blocks on, and a landing on another launches it again on the frame after, the strip and the live region saying so and dust rising at the launch", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a row of blocks with a boost button two on and another three past it, so the first launch
  // comes down on the second
  const row = [];
  for (let y = 16; y >= 9; y--) row.push([[17, y, 17], { kind: 0 }]);
  await arcadeDraft(page, {
    blocks: row,
    faces: [
      [[17, 15, 17], 0, { type: 10 }],
      [[17, 12, 17], 0, { type: 10 }],
    ],
    motion: false,
  });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // held on until the strip says the ball is launched, which it does through the flight
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(LAUNCHED, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  expect(await dustOver(page, [17, 15, 17])).toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 9, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(status(page)).toHaveText("");
  await expect(line(page)).toHaveText("Playing · on the top of 17,9,17, facing -y");
  await expect.poll(async () => (await said(page)).filter((t) => t === LAUNCHED)).toHaveLength(2);
  await expect.poll(() => said(page)).toContain(`17,12,17, top. ${LAUNCHED}`);
  await expect.poll(() => said(page)).toContain(`17,9,17, top. ${LAUNCHED}`);
  expect(errors).toEqual([]);
});
