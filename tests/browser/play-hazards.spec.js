import { test, expect } from "@playwright/test";
import { drawn, frozen, laid, settle, still, trackErrors } from "./helpers.js";
import {
  IDENTITY,
  arcadeDraft,
  ballOver,
  betweenFrames,
  dustOver,
  frameAt,
  line,
  listening,
  pixelAt,
  probe,
  said,
  say,
  startPlay,
  status,
} from "./playhelpers.js";

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

/** The height the ball is handed to the frame with, for its shadow, finite or null, and whether
    the frame last drawn left the block at `cell` out, on every animation frame until no ball is
    handed, the level having ended, or 8 s pass. */
const shadowed = (page, cell) =>
  page.evaluate(async (cell) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [P, { overlayWith }, { cellKey }] = await Promise.all(
      ["play/play.js", "viewer/draw/render.js", "format/lattice.js"].map(at),
    );
    const key = cellKey(...cell);
    let drew = true;
    overlayWith({
      under: () => {
        drew = false;
      },
      block: (ctx, c, home, k) => {
        if (k === key) drew = true;
      },
    });
    const out = [];
    const end = performance.now() + 8000;
    while (performance.now() < end) {
      const g = P.handed();
      if (!g) break;
      out.push({
        gone: !drew,
        height: Number.isFinite(g.height) ? g.height : null,
      });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, cell);

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
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const forgive = page.locator("#forgiveBtn");
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  await listening(page);
  await frozen(page);
  // held on, the ball rolls onto the spikes and the countdown runs with the key, the strip read on
  // every game frame, as the countdown can begin and end within one drawn frame
  await page.keyboard.down("ArrowUp");
  const shown = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const el = document.getElementById("playStatus");
    const out = [];
    let dying = false;
    for (let i = 0; i < 600; i++) {
      window.__step(1000 / motionTable().hz);
      draw();
      const now = [el.textContent, el.classList.contains("dying")];
      if (now.join() !== out.at(-1)?.join()) out.push(now);
      if (now[1]) dying = true;
      else if (dying) break;
    }
    return out;
  });
  await page.evaluate(() => window.__thaw());
  await page.keyboard.up("ArrowUp");
  expect(shown.slice(-2)).toEqual([
    ["On the spikes", true],
    [expect.stringMatching(SPIKED), false],
  ]);
  await expect.poll(() => said(page)).toContain("On the spikes");
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
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(FORGIVEN, { timeout: 10_000 });
  await expect(status(page)).not.toHaveClass(/dying/);
  await expect(say(page)).toHaveText(FORGIVEN);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect((await probe(page)).frame).toEqual(IDENTITY);
  // a jump off the block's free side falls off the level, forgiven the same way: the ball comes
  // back to the rest it jumped from, facing as it did
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing -x");
  // Up held until the fall, so that whichever frame reads Space reads Up with it
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText(FORGIVEN_FALL, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  await expect(say(page)).toHaveText(FORGIVEN_FALL);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
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
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  // one tap of Up, and the slide carries the ball over the ice to the arrow's block
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 13, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  // the way it has come passed over every ice block
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("2 stops");
  const stations = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    return current().stations;
  });
  expect(stations).toEqual(
    [
      [17, 17, 17],
      [17, 16, 17],
      [17, 15, 17],
      [17, 14, 17],
      [17, 13, 17],
    ].map((cell) => ({ cell, face: 0 })),
  );
  // against the arrow Up moves nothing and the strip says why, while turning in place is allowed,
  // two quarter turns bringing the ball about
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(
    "The ball cannot roll off here: the arrow points another way.",
  );
  expect((await probe(page)).station).toEqual({
    block: [17, 13, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-x");
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("+y");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // along the arrow's way the ball rolls off, and the ice slides it back to the start's block
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("on fire the ball reddens: where it stands its pixels are redder on the whole than the untinted ball's pixels on plain stone, and with Motion off nothing draws once it rests", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await arcadeDraft(page, { blocks: [[[17, 16, 17], { kind: 0 }]], motion: false });
  const block = [17, 16, 17];
  const rolled = async () => {
    await startPlay(page);
    await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
    await expect.poll(async () => (await probe(page)).station.block).toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    return fillAbout(page, await canvasAt(page, ballOver(block)));
  };
  const plain = await rolled();
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
  expect(await drawn(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("a crumbling block breaks under the ball, scoring, and is gone a third of a second later, out of the frame, the ball falling with it and casting no shadow from the frame the block goes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a crumbling block on, with nothing below it
  await arcadeDraft(page, { blocks: [[[17, 16, 17], { kind: 6 }]] });
  // a point of the block's top that the ball and its shadow leave clear
  const corner = [17.15, 16.15, 17];
  const stood = await pixelAt(page, corner);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // with Motion on the level runs at rest, so the block goes while the ball stands on it, and
  // the ball stands a frame or two over the gone block before the game drops it
  const sampled = shadowed(page, [17, 16, 17]);
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 16, 17]);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  expect(await status(page).textContent()).toBe("");
  await expect.poll(() => pixelAt(page, corner), { intervals: [25] }).not.toEqual(stood);
  await expect(status(page)).toHaveText(LOST_BROKEN, { timeout: 10_000 });
  await expect.poll(() => said(page)).toContain(BROKE);
  await expect.poll(() => said(page)).toContain(GONE);
  const frames = await sampled;
  const gone = frames.findIndex((f) => f.gone);
  expect(gone).toBeGreaterThan(0);
  expect(frames.slice(0, gone).every((f) => f.height !== null)).toBe(true);
  expect(frames.slice(gone).every((f) => f.height === null)).toBe(true);
  expect(errors).toEqual([]);
});

test("a vanishing block drops the ball as its cycle takes it out of the lattice, and the ball lands on the block below", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a vanishing block on that stands as the level opens, and a block a gap below it
  await arcadeDraft(page, {
    blocks: [
      [[17, 16, 17], { kind: 7, phase: 2 }],
      [[17, 16, 19], { kind: 0 }],
    ],
  });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  // the level runs at rest, and the block goes from under the ball as its cycle has it
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 16, 19]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 19],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(await frameAt(page)).toBeGreaterThan(100);
  await expect(say(page)).toHaveText("17,16,19, top");
  expect(errors).toEqual([]);
});

test("a lone crumbling block, reached by a jump, goes with a burst of dust where it stood, drawn over the nearest block the frame still draws", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // a crumbling block a jump on, with nothing beside it or below it
  await arcadeDraft(page, { blocks: [[[17, 15, 17], { kind: 6 }]] });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // Up held past the level's opening, whose frames sample it as the game's frames do, until the jump
  await betweenFrames(page, async () => {
    await page.keyboard.down("ArrowUp");
    await page.keyboard.press(" ");
  });
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await page.keyboard.up("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 15, 17]);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  // the gone block's cell is drawn no longer, so its dust is drawn over the start's block, the
  // only other one
  await expect.poll(() => dustOver(page, [17, 17, 17]), { intervals: [25] }).toBeGreaterThan(0);
  await expect.poll(() => said(page)).toContain("The crumbling block at 17,15,17 is gone.");
  await expect(status(page)).toHaveText(LOST_BROKEN, { timeout: 10_000 });
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
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  // the opening wait and the corkscrew's first landing pass before Up is held, which rolls the
  // ball two blocks on, released as the ball reaches the corkscrew's block so that it stops under
  // it, the corkscrew near its top by then; the strip is read on every game frame
  const { seen, table } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { phaseField }, { state }, { cellKey }, P] =
      await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/motion.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const el = document.getElementById("playStatus");
    const { types, turn, hz } = motionTable();
    const corkscrew = state.idx.markers.get(cellKey(17, 15, 17)).find((m) => m.face === 0);
    const entry = types[String(corkscrew.type)];
    const table = {
      turn,
      ...entry.bounce,
      phase: entry.phases[phaseField(corkscrew)],
      square: entry.catch.square,
      stand: entry.catch.stand,
      radius: types["30"].rolling.resume,
    };
    const seen = [];
    let held = false;
    for (let f = 0; f < 400; f++) {
      if (f === 60) {
        key("keydown", "ArrowUp");
        held = true;
      }
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,15,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      seen.push({
        frame: clock(),
        block: s.block.join(),
        moving: s.moving,
        status: el.textContent,
        dying: el.classList.contains("dying"),
      });
      if (seen.at(-1).dying) break;
    }
    return { seen, table };
  });
  await page.evaluate(() => window.__thaw());
  const { turn, rate, wrap, rise, phase, square, stand, radius } = table;
  const lift = (f) => rise * Math.sin((((phase + rate * f) % wrap) / turn) * 2 * Math.PI);
  // straight under the point, the ball's centre is the point's height off the face less its
  // radius short of it, and is within reach while the rise is at most the reach less that
  const bound = Math.sqrt(square) - (stand - radius);
  const rested = seen.findIndex((s) => s.block === "17,15,17" && !s.moving);
  expect(rested).toBeGreaterThan(0);
  const caught = seen.findIndex((s) => s.dying);
  expect(caught).toBeGreaterThan(rested + 10);
  expect(seen[caught].status).toBe("Caught");
  expect(lift(seen[rested].frame)).toBeGreaterThan(bound);
  let predicted = seen[rested].frame;
  while (lift(predicted) > bound) predicted++;
  expect(seen[caught].frame).toBe(predicted);
  expect(
    seen.slice(rested, caught).every((s) => s.block === "17,15,17" && !s.moving && !s.dying),
  ).toBe(true);
  expect(seen.slice(rested, caught).every((s) => lift(s.frame) > bound)).toBe(true);
  expect(seen.slice(0, caught).every((s) => s.status === "")).toBe(true);
  expect(await said(page)).toContain("Caught");
  expect(errors).toEqual([]);
});
