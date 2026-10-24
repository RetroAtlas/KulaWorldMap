import { test, expect } from "@playwright/test";
import { settle, still, trackErrors } from "./helpers.js";

const LEVEL = "/#HIRO/0/45,35/fit/33";
const START = [17, 18, 17];
// a plain block of LEVEL 1's far row
const BLOCK = [18, 12, 17];
// LEVEL 51: one wheel, on the top of a column of blocks that runs on along y
const WHEELED = "/#ARCTIC/5/45,35/fit/33";
const WHEEL = [15, 16, 17];
// frames enough for the wheel to have rolled two blocks on
const ROLLED = 90;
// frames enough for the wheel to have reached the column's end and come back past its start
const FAR = 660;

/** The canvas point over a point of the level. */
const point = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      return screen(x, y, z);
    },
    [x, y, z],
  );
/** What one frame paints at a point of the canvas, and the cell the pick finds there. */
const seen = (page, [x, y]) =>
  page.evaluate(
    async ([x, y]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { draw, cellAt }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js"].map(at),
      );
      draw();
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      const pixel = [
        ...g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data.slice(0, 3),
      ];
      const c = cellAt(x, y);
      return { pixel, cell: c && { x: c.x, y: c.y, z: c.z, face: c.face } };
    },
    [x, y],
  );
const clock = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/viewer/draw/render.js", location.href).href)).clock(),
  );
/** The frame one draw hands its frame hooks. */
const drawnAt = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    draw();
    return window.__scene.frame;
  });
/** Register a source handing the frame whatever the page holds out, and a frame hook that keeps the scene. */
const sourced = (page) =>
  page.evaluate(async () => {
    const { runWith, overlayWith } = await import(
      new URL("js/viewer/draw/render.js", location.href).href
    );
    overlayWith({
      frame: (ctx, scene) => {
        window.__scene = { frame: scene.frame };
      },
    });
    runWith(() => window.__handed ?? null);
  });
const unsourced = (page) =>
  page.evaluate(async () => {
    const { runWith } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    runWith(null);
  });
/** Hold the page's clock where it stands, or let it run on. */
const hold = (page, on) =>
  page.evaluate((on) => {
    if (on) {
      const t = performance.now();
      performance.now = () => t;
    } else delete performance.now;
  }, on);
/** Hold out `handed`, with the level's index less a block and the start's marker where asked. */
const hand = (page, handed, { without = false } = {}) =>
  page.evaluate(
    async ([handed, without, block, start]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { invalidatePick }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js", "format/lattice.js"].map(at),
      );
      if (without) {
        const cells = new Map(state.idx.cells);
        cells.delete(cellKey(...block));
        const markers = new Map(state.idx.markers);
        markers.delete(cellKey(...start));
        handed = { ...handed, idx: { ...state.idx, cells, markers } };
      }
      window.__handed = handed;
      invalidatePick();
    },
    [handed, without, BLOCK, START],
  );
const installed = (page) =>
  page.evaluate(
    async ([block, start]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "format/lattice.js"].map(at),
      );
      return [state.idx.cells.has(cellKey(...block)), state.idx.markers.has(cellKey(...start))];
    },
    [BLOCK, START],
  );

async function opened(page, link) {
  await page.goto(link);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
}

test("a source hands the frame its clock and its index, and the frame has its own clock and index again once it stops", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, LEVEL);
  const ball = await point(page, [START[0] + 0.5, START[1] + 0.5, START[2] - 0.03 - 100 / 512]);
  const top = await point(page, [BLOCK[0] + 0.5, BLOCK[1] + 0.5, BLOCK[2]]);
  const before = { ball: await seen(page, ball), top: await seen(page, top) };
  expect(before.top.cell).toEqual({ x: BLOCK[0], y: BLOCK[1], z: BLOCK[2], face: 0 });
  expect(await clock(page)).toBe(0);

  await sourced(page);
  await hand(page, { frame: 1234 });
  expect(await clock(page)).toBe(1234);
  expect(await drawnAt(page)).toBe(1234);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  expect(await clock(page)).toBe(1234);
  expect(await drawnAt(page)).toBe(1234);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();

  await hand(page, {}, { without: true });
  expect(await clock(page)).toBe(0);
  const less = { ball: await seen(page, ball), top: await seen(page, top) };
  expect(less.ball.pixel).not.toEqual(before.ball.pixel);
  expect(less.top.pixel).not.toEqual(before.top.pixel);
  expect(less.top.cell).not.toEqual(before.top.cell);
  expect(await installed(page)).toEqual([true, true]);

  await hand(page, { frame: 1234 }, { without: true });
  expect(await clock(page)).toBe(1234);
  await unsourced(page);
  expect(await clock(page)).toBe(0);
  expect(await drawnAt(page)).toBe(0);
  expect(await seen(page, ball)).toEqual(before.ball);
  expect(await seen(page, top)).toEqual(before.top);

  await sourced(page);
  await hand(page, null);
  expect(await clock(page)).toBe(0);
  expect(await seen(page, ball)).toEqual(before.ball);
  expect(await seen(page, top)).toEqual(before.top);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  const own = await clock(page);
  expect(own).toBeGreaterThanOrEqual(0);
  expect(own).toBeLessThan(1234);
  expect(errors).toEqual([]);
});

test("a source hands the frame what travels, drawn and picked where it puts it and never stepped, and the frame walks its own walkers again once it stops", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, WHEELED);
  const disc = (offset) =>
    page.evaluate(
      async ([c, offset]) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { thingDisc }, { cellKey }] = await Promise.all(
          ["viewer/state.js", "viewer/draw/things.js", "format/lattice.js"].map(at),
        );
        const m = state.idx.markers.get(cellKey(...c)).find((m) => m.type === 51);
        const where = { x: c[0] + offset[0], y: c[1] + offset[1], z: c[2] + offset[2] };
        return thingDisc(m, where, state.lvl).slice(0, 2);
      },
      [WHEEL, offset],
    );
  /** The level's walkers laid anew and stepped to frame `n`, kept on the page: the wheel's frame, place and offset. */
  const walked = (n) =>
    page.evaluate(async (n) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { walkers, probe, advance, dice, place }, { motionTable, litNow }] =
        await Promise.all(["viewer/state.js", "viewer/travel.js", "viewer/data.js"].map(at));
      const table = motionTable();
      const ws = walkers(state.lvl, state.idx, table);
      const travel = { walkers: ws, probe: probe(state.lvl, litNow), roll: dice(table.dice) };
      advance([...ws.values()], travel.probe, n, travel.roll);
      window.__travel = travel;
      const w = [...ws.values()][0];
      return { at: w.at, pos: [...w.pos], offset: place(w).offset };
    }, n);
  const stepped = () =>
    page.evaluate(() => {
      const w = [...window.__handed.travel.walkers.values()][0];
      return { at: w.at, pos: [...w.pos] };
    });
  const home = await disc([0, 0, 0]);
  const before = await seen(page, home);

  const rolled = await walked(ROLLED);
  expect(rolled.at).toBe(ROLLED);
  expect(rolled.offset[1]).toBeGreaterThan(1.5);
  // handed with a frame well past the wheel's own frame, which a frame stepping it would bring it to
  await page.evaluate(async (frame) => {
    const { runWith } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    window.__handed = { frame, travel: window.__travel };
    runWith(() => window.__handed);
  }, ROLLED + 60);
  expect(await clock(page)).toBe(ROLLED + 60);
  const away = await disc(rolled.offset);
  const handed = await seen(page, away);
  expect(handed.cell).toEqual({ x: WHEEL[0], y: WHEEL[1], z: WHEEL[2], face: 0 });
  expect((await seen(page, home)).pixel).not.toEqual(before.pixel);
  expect(await seen(page, away)).toEqual(handed);
  expect(await stepped()).toEqual({ at: rolled.at, pos: rolled.pos });

  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  await page.waitForTimeout(300);
  expect(await clock(page)).toBe(ROLLED + 60);
  expect(await stepped()).toEqual({ at: rolled.at, pos: rolled.pos });
  expect((await seen(page, away)).cell).toEqual(handed.cell);

  // a frame handed without a travel steps the frame's own walkers to it
  const far = await walked(FAR);
  expect(far.offset[1]).toBeLessThan(-1);
  await hand(page, { frame: FAR });
  expect((await seen(page, await disc(far.offset))).cell).toEqual(handed.cell);

  // taken away with Motion on, the frame lays its walkers anew at its own clock rather than keeping them where the handed frame stepped them
  await hold(page, true);
  await unsourced(page);
  const own = await clock(page);
  expect(own).toBeGreaterThan(0);
  expect(own).toBeLessThan(FAR);
  expect((await seen(page, await disc(far.offset))).cell).not.toEqual(handed.cell);
  expect((await seen(page, await disc((await walked(own)).offset))).cell).toEqual(handed.cell);
  await hold(page, false);

  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  expect((await seen(page, away)).cell).not.toEqual(handed.cell);
  expect(await seen(page, home)).toEqual(before);
  expect(errors).toEqual([]);
});
