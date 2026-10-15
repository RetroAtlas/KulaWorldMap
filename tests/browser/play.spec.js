import { test, expect } from "@playwright/test";
import { settle, still, trackErrors, drawn } from "./helpers.js";

const LEVEL = "/#HIRO/0/45,35/fit/33";
const PLAY_FILES = /\/js\/play\/(play|ball|dust)\.js$/;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The page point over a point of the level. */
const at = (page, x, y, z) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      const r = document.getElementById("cv").getBoundingClientRect();
      const [px, py] = screen(x, y, z);
      return { x: r.left + px, y: r.top + py };
    },
    [x, y, z],
  );
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
/** The view and the ball as the page holds them. */
const probe = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const P = await import(new URL("js/play/play.js", location.href).href);
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
      playing: P.playing(),
      station: P.station(),
      frame: state.frame && state.frame.map((v) => round(v) + 0),
      cam: Object.fromEntries(Object.entries(state.cam).map(([k, v]) => [k, round(v)])),
      target: state.target.map(round),
      slice: state.slice,
      fitted: document.getElementById("fitBtn").classList.contains("fitted"),
      hash: location.hash,
    };
  });
const station = async (page) => (await probe(page)).station;
/** The red, green and blue the frame paints at a point of the level. */
const pixelAt = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
      const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      draw();
      const [px, py] = screen(x, y, z);
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      return [...g.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)];
    },
    [x, y, z],
  );
/** How many times a frame lays a canvas the map's size over the map, which the see-through
    layer alone is. */
const throughDrawn = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const g = cv.getContext("2d");
    let n = 0;
    const drawImage = g.drawImage;
    g.drawImage = function (img, ...rest) {
      if (img.width === cv.width && img.height === cv.height) n++;
      return drawImage.call(this, img, ...rest);
    };
    draw();
    g.drawImage = drawImage;
    return n;
  });
/** Where the ball's centre is on the page, and the top of whatever the strip and the pad take. */
const anchor = (page) =>
  page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const cv = document.getElementById("cv").getBoundingClientRect();
    const [x, y] = screen(...state.target);
    let top = cv.bottom;
    for (const id of ["play", "pad"]) {
      const el = document.getElementById(id);
      if (!el.hidden) top = Math.min(top, el.getBoundingClientRect().top);
    }
    return { x: cv.left + x, y: cv.top + y, free: top - cv.top, top, w: cv.width };
  });
const say = (page) => page.locator("#say");
const line = (page) => page.locator("#playLine");
const status = (page) => page.locator("#playStatus");
/** Put `block` into the shown draft at `cell` through the model. */
const laid = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      update(state.lvl.draft, setBlock(get(state.lvl.draft).doc, cell, block));
    },
    [cell, block],
  );
/** A finger held still on `point` until the hold shows, then lifted. */
const hold = async (page, point) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { state } = await import(new URL("js/viewer/state.js", location.href).href);
        return state.hover?.key ?? null;
      }),
    )
    .not.toBeNull();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};
// the ball's centre over the top of a block, where the start's ball is drawn
const ballOver = (c) => [c[0] + 0.5, c[1] + 0.5, c[2] - 0.03 - 100 / 512];

async function opened(page, { motion = true } = {}) {
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  if (!motion) await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked({ checked: motion });
}
/** Press y, and wait for play to load and the strip to show. */
async function startPlay(page) {
  await page.keyboard.press("y");
  await expect(page.locator("#play")).toBeVisible();
}
const sliced = (page, z) =>
  page.evaluate(async (z) => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - z);
  }, z);

test("y stands the ball on the start and takes its view, the arrows roll it, and Esc puts the view, the slice and the start's ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await opened(page, { motion: false });
  expect(requested.filter((p) => PLAY_FILES.test(p))).toEqual([]);
  const start = [17, 18, 17];
  const withBall = await pixelAt(page, ballOver(start));
  await sliced(page, 18);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await expect.poll(() => page.url()).toMatch(/\/fit\/15$/);
  const before = await probe(page);
  expect(before.playing).toBe(false);
  expect(before.frame).toBeNull();
  expect(before.slice).toBe(15);
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");

  await startPlay(page);
  await expect
    .poll(() => requested.filter((p) => PLAY_FILES.test(p)).sort())
    .toEqual(["/js/play/ball.js", "/js/play/dust.js", "/js/play/play.js"]);
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  await expect(say(page)).toHaveText(
    "Playing LEVEL 1. The ball stands on the top of 17,18,17, facing -y. The arrows roll and turn it, Esc leaves.",
  );
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "true");
  const entered = await probe(page);
  expect(entered.playing).toBe(true);
  expect(entered.station).toEqual({ block: start, face: 0, heading: "-y", moving: false });
  expect(entered.frame).toEqual(IDENTITY);
  expect(entered.cam.yaw).toBe(20);
  expect(entered.cam.pitch).toBe(30);
  expect(entered.slice).toBe(33);
  expect(entered.fitted).toBe(true);
  expect(entered.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).not.toContainText("sliced");

  // a tap of Up rolls the ball one block on; the view follows it rather than panning
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(() => station(page))
    .toEqual({
      block: [17, 17, 17],
      face: 0,
      heading: "-y",
      moving: false,
    });
  await expect(say(page)).toHaveText("17,17,17, top");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const rolled = await probe(page);
  expect(rolled.cam.panX).toBe(entered.cam.panX);
  expect(rolled.cam.panY).toBe(entered.cam.panY);
  expect(rolled.target).not.toEqual(entered.target);
  expect(await pixelAt(page, ballOver(start))).not.toEqual(withBall);
  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(400);
  expect((await probe(page)).station.block).toEqual([17, 17, 17]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(say(page)).toContainText("Left play");
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.frame).toBeNull();
  expect(left.cam).toEqual(before.cam);
  expect(left.target).toEqual(before.target);
  expect(left.slice).toBe(15);
  expect(left.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await page.keyboard.press("\\");
  expect(await pixelAt(page, ballOver(start))).toEqual(withBall);
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowLeft");
  expect((await probe(page)).cam.panX).not.toBe(before.cam.panX);
  expect(errors).toEqual([]);
});

test("with Motion on the view eases in and out, and the ball tumbles over the game's frames", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const before = await probe(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-x");
  const during = await probe(page);
  expect(during.frame).not.toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await expect.poll(async () => (await probe(page)).frame).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await page.keyboard.press("Escape");
  const leaving = await probe(page);
  expect(leaving.playing).toBe(false);
  expect(leaving.frame).not.toBeNull();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  expect((await probe(page)).cam).toEqual(before.cam);
  expect(errors).toEqual([]);
});

test("the ball turns in place, turns about, and is refused an edge beside a neighbour", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await expect(line(page)).toContainText("facing -y");
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowDown");
  await expect(line(page)).toContainText("facing -x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // LEVEL 1's ring: off its block to the -x there is nothing, and a block stands beside it
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText("The ball cannot roll off here: a block stands beside it.");
  await page.keyboard.up("ArrowUp");
  expect((await probe(page)).station.block).toEqual([17, 18, 17]);
  expect(errors).toEqual([]);
});

test("the link holds the view the ball was put down from, nothing is written to the bar meanwhile, and Back leaves play on the earlier entry", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\/45,35\/fit\/33$/);
  const url = page.url();
  await page.evaluate(() => {
    window.__wrote = 0;
    for (const way of ["pushState", "replaceState"]) {
      const orig = history[way].bind(history);
      history[way] = (...a) => {
        window.__wrote++;
        return orig(...a);
      };
    }
  });
  await startPlay(page);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.__wrote)).toBe(0);
  await page.goBack();
  await expect(page.locator("#chip b")).toHaveText("LEVEL 1");
  await expect(page.locator("#play")).toBeHidden();
  const back = await probe(page);
  expect(back.playing).toBe(false);
  expect(back.frame).toBeNull();
  expect(back.fitted).toBe(true);
  expect(page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33$/);
  expect(errors).toEqual([]);
});

test("f in play frames the ball again and dims the fit button, after a drag has turned the view about it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const framed = await probe(page);
  expect(framed.fitted).toBe(true);
  expect(framed.target).toEqual([17.5, 18.5, 16.805]);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(700, 320, { steps: 4 });
  await page.mouse.up();
  const turned = await probe(page);
  expect(turned.fitted).toBe(false);
  expect(turned.cam.yaw).not.toBe(framed.cam.yaw);
  expect(turned.target).toEqual(framed.target);
  expect(turned.playing).toBe(true);
  await page.keyboard.press("f");
  const again = await probe(page);
  expect(again.fitted).toBe(true);
  expect(again.cam.yaw).toBe(turned.cam.yaw);
  // the ball sits a fifth below the middle of the height the strip leaves free
  const spot = await anchor(page);
  const cv = await page.locator("#cv").boundingBox();
  expect(Math.abs(spot.x - cv.x - spot.w / 2)).toBeLessThan(1);
  expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
  expect(spot.free).toBeLessThan(cv.height);
  expect(errors).toEqual([]);
});

test("with Motion off a step snaps and nothing draws once the ball rests", async ({ page }) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  expect((await probe(page)).frame).toEqual(IDENTITY);
  expect(await drawn(page)).toBe(0);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await drawn(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("Keep as the route hands the way the ball has come to the planner, where no route stands", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const keep = page.locator("#keepBtn");
  await expect(keep).toBeDisabled();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect(keep).toBeEnabled();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await keep.click();
  await expect(say(page)).toHaveText("The way the ball has come is now the route.");
  const route = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return { stations: c.stations, steps: c.steps, marks: [...c.marks].sort() };
  });
  expect(route.stations).toEqual([
    { cell: [17, 18, 17], face: 0 },
    { cell: [17, 17, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
  ]);
  expect(route.steps).toEqual([
    { k: 2, o: 0 },
    { k: 2, o: 0 },
  ]);
  expect(route.marks).toEqual([0, 2]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await expect(keep).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#course")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a right click selects while playing, Esc clears the selection before it leaves, and the panel's button moves the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const side = await plusX(page, [17, 13, 17]);
  await page.mouse.click(side.x, side.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
  const put = page.locator("#detail .put button", { hasText: "Put the ball here" });
  await expect(put).toHaveCount(1);
  await put.click();
  await expect(page.locator("#play")).toBeVisible();
  expect((await probe(page)).station).toEqual({
    block: [17, 13, 17],
    face: 1,
    heading: "+y",
    moving: false,
  });
  await expect(say(page)).toContainText("The ball stands on the +x side of 17,13,17");
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  expect((await probe(page)).playing).toBe(true);
  const ahead = await plusX(page, [17, 14, 17]);
  await page.mouse.click(ahead.x, ahead.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,14,17");
  await page.locator("#detail .put button", { hasText: "Put the ball here" }).click();
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 14, 17]);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("over the far edge of a ridge the ball goes round onto the side, and the frame's up is that face's normal", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([18, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, top");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(1);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, +x side");
  const p = await probe(page);
  expect(p.station).toEqual({ block: [18, 17, 17], face: 1, heading: "+z", moving: false });
  expect(p.frame.slice(6, 9).map((v) => -v + 0)).toEqual([1, 0, 0]);
  await expect(line(page)).toHaveText("Playing · on the +x side of 18,17,17, facing +z");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("out of an inner corner the ball climbs the wall ahead, and shows through the block it stood on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a floor ahead of the start, a wall on it, and a block beside the wall that stops the roll at its middle
  await laid(page, [17, 16, 17], { kind: 0 });
  await laid(page, [17, 16, 16], { kind: 0 });
  await laid(page, [18, 16, 16], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  expect(await throughDrawn(page)).toBe(0);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(2);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.up("ArrowUp");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 16],
    face: 2,
    heading: "-z",
    moving: false,
  });
  await expect(say(page)).toHaveText("17,16,16, +y side");
  expect(await throughDrawn(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("Space hops the ball in place, jumps it two blocks on while it rolls, and a jump off the lattice falls and comes back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await page.keyboard.press(" ");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station.block).toEqual([17, 18, 17]);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(60);
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("17,16,17, top");
  // from the lattice's last column a jump lands past its edge, and the ball comes back to where it stood
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [32, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await page.keyboard.press("v");
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 32, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "The ball fell off the level, and is back where it last stood.",
  ]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [32, 17, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  expect(errors).toEqual([]);
});

test.describe("with a touch screen", () => {
  test.use({ hasTouch: true });

  test("the pad shows and rolls the ball while its arrow is held, and a long press still selects", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await opened(page, { motion: false });
    await expect(page.locator("#pad")).toBeHidden();
    await startPlay(page);
    await expect(page.locator("#pad")).toBeVisible();
    await expect(page.locator("#padBtn")).toHaveAttribute("aria-pressed", "true");
    const up = await page.locator('#pad [data-pad="up"]').boundingBox();
    expect(Math.min(up.width, up.height)).toBeGreaterThanOrEqual(44);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2 }],
    });
    await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
    // held on, it rolls on past the next block
    await expect.poll(async () => (await probe(page)).station.block[1]).toBeLessThanOrEqual(16);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    const rested = (await probe(page)).station.block;
    await page.waitForTimeout(400);
    expect((await probe(page)).station.block).toEqual(rested);
    await page.locator("#padBtn").click();
    await expect(page.locator("#pad")).toBeHidden();
    await hold(page, await top(page, [17, 12, 17]));
    await expect(page.locator("#detail")).toContainText("cell 17,12,17");
    expect((await probe(page)).playing).toBe(true);
    expect(errors).toEqual([]);
  });

  test.describe("at a phone's size", () => {
    test.use({ viewport: { width: 375, height: 700 }, isMobile: true });

    test("the ball is framed above the pad and the strip, whose line has a row of its own", async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await opened(page, { motion: false });
      await startPlay(page);
      await expect(page.locator("#pad")).toBeVisible();
      const spot = await anchor(page);
      const pad = await page.locator("#pad").boundingBox();
      const strip = await page.locator("#play").boundingBox();
      const lineBox = await page.locator("#playLine").boundingBox();
      const cv = await page.locator("#cv").boundingBox();
      expect(spot.y).toBeLessThan(Math.min(pad.y, strip.y) - 40);
      // a fifth below the middle of what the pad and the strip leave free, from the first frame
      expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
      expect(spot.x).toBeGreaterThan(40);
      expect(spot.x).toBeLessThan(375 - 40);
      expect(lineBox.width).toBeGreaterThan(strip.width * 0.8);
      expect(lineBox.height).toBeLessThan(45);
      // put away, the pad gives the ball its room back
      await page.locator("#padBtn").click();
      await expect(page.locator("#pad")).toBeHidden();
      const roomier = await anchor(page);
      expect(roomier.y).toBeGreaterThan(spot.y);
      expect(roomier.y).toBeLessThan(strip.y - 40);
      expect(errors).toEqual([]);
    });
  });
});
