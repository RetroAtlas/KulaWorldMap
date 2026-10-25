import { test, expect } from "@playwright/test";
import { frozen, onward, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  arcadeDraft,
  betweenFrames,
  frameAt,
  line,
  listening,
  opened,
  probe,
  said,
  startPlay,
  station,
} from "./playhelpers.js";

test("two taps of Left turn the ball twice where the second comes before the frame after the one that read the first, with Motion off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  // past the level's opening, which holds the pad dead
  await betweenFrames(page, () => page.keyboard.press("ArrowRight"));
  await expect.poll(async () => (await station(page)).heading).toBe("+x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  await page.keyboard.press("ArrowLeft");
  await onward(page, 1);
  expect((await station(page)).heading).toBe("-y");
  await page.keyboard.press("ArrowLeft");
  await onward(page, 40);
  expect((await station(page)).heading).toBe("-x");
  expect(errors).toEqual([]);
});

test("a key pressed while the level runs takes no time from it: every frame the clock owes is run", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await frozen(page);
  const ran = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const frame = 1000 / motionTable().hz;
    const key = (type) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowLeft", bubbles: true }));
    draw();
    const from = clock();
    for (let i = 0; i < 10; i++) {
      window.__step(frame / 2);
      key("keydown");
      key("keyup");
      window.__step(frame / 2);
      draw();
    }
    return clock() - from;
  });
  expect(ran).toBe(10);
  expect(errors).toEqual([]);
});

test("every sentence the level says has an animation frame of its own, however many game frames one drawn frame runs", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect.poll(() => frameAt(page)).toBeGreaterThan(30);
  await listening(page);
  await frozen(page);
  // two taps of Up round an edge to the next face's middle, drawn a frame at a time, then batched
  const spoken = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const region = document.getElementById("say");
    const tap = () => {
      for (const type of ["keydown", "keyup"])
        document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowUp", bubbles: true }));
    };
    const run = async (frames) => {
      window.__step((frames * 1000) / motionTable().hz);
      draw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    tap();
    const start = clock();
    const frames = [];
    while (clock() - start < 60) {
      const before = region.textContent;
      await run(1);
      if (region.textContent !== before) frames.push(clock() - start);
    }
    tap();
    const again = clock();
    while (clock() - again < frames[0] - 1) await run(1);
    const from = clock() - again;
    await run(frames[1] - from);
    const batched = { from, to: clock() - again };
    for (let f = 0; f < 60; f++) await run(1);
    return { frames, batched };
  });
  expect(spoken.frames).toHaveLength(2);
  expect(spoken.batched.from).toBeLessThan(spoken.frames[0]);
  expect(spoken.batched.to).toBeGreaterThanOrEqual(spoken.frames[1]);
  await expect
    .poll(() => said(page))
    .toEqual([
      "-y side of 17,17,17, now underfoot",
      "17,17,17, -y side",
      "underside of 17,17,17, now underfoot",
      "17,17,17, underside",
    ]);
  expect(errors).toEqual([]);
});

test("with Motion off the ball stands where a move brought it on the game frame it came, however many game frames one drawn frame runs", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await frozen(page);
  // Up held from the level's opening, a frame drawn for each game frame, or with `batch` one drawn
  // frame for the game frames from its `from` to its `to`
  const roll = (batch) =>
    page.evaluate(async (batch) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw, clock }, { motionTable }, P] = await Promise.all(
        ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
      );
      const key = (type) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowUp", bubbles: true }));
      const run = (frames) => {
        window.__step((frames * 1000) / motionTable().hz);
        draw();
      };
      const start = clock();
      const seen = () => ({
        frame: clock() - start,
        block: P.station().block,
        line: document.getElementById("playLine").textContent,
        offset: P.handed().offset,
      });
      key("keydown");
      const states = [];
      if (batch) {
        while (clock() - start < batch.from) run(1);
        run(batch.to - batch.from);
        states.push(seen());
      } else
        while (clock() - start < 90) {
          run(1);
          states.push(seen());
        }
      key("keyup");
      return states;
    }, batch);
  const single = await roll(null);
  const on = (f) => single.find((s) => s.frame === f);
  const came = single.find((s) => s.block.join() !== single[0].block.join()).frame;
  const left = single.find((s) => s.frame > came && s.block.join() !== on(came).block.join());
  await page.keyboard.press("Escape");
  await startPlay(page);
  const [batched] = await roll({ from: came - 2, to: came + 10 });
  expect(left?.frame ?? Infinity).toBeGreaterThan(came + 10);
  expect(batched).toEqual(on(came + 10));
  expect(errors).toEqual([]);
});
