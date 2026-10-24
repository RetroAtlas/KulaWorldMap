import { test, expect } from "@playwright/test";
import { trackErrors } from "./helpers.js";
import { IDENTITY, listening, opened, probe, said, startPlay } from "./playhelpers.js";

// LEVEL 68: the start on 17,18,17, and blue teleporters round a ring of three, the one on 17,7,17
// leading to the one on 17,25,17
const TELEPORT_LEVEL = "/#COWBOY/7/45,35/fit/33";

// LEVEL 68 turned and zoomed by hand, so the view play leaves for is not the level's fit
const TELEPORT_VIEW = "/#COWBOY/7/45,35/1.20/17,17,17/0,0/33";

for (const motion of [false, true])
  test(`a click on the name a teleporter's panel gives for where it leads leaves play and centres the view there, with Motion ${motion ? "on" : "off"}`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await opened(page, { motion, hash: TELEPORT_LEVEL });
    await startPlay(page);
    // with Motion on the view eases round behind the ball, so the click waits for it to be there
    await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
    await page.evaluate(async () => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { showCell }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
      );
      showCell(state.idx.cells.get(cellKey(17, 7, 17)));
    });
    const go = page.locator("#detail .goto");
    await expect(go).toHaveText("17, 25, 17 top");
    const entries = await page.evaluate(() => history.length);
    await go.click();
    await expect(page.locator("#play")).toBeHidden();
    await expect(page.locator("#detail")).toContainText("cell 17,25,17");
    const left = await probe(page);
    expect(left.playing).toBe(false);
    expect(left.frame).toBeNull();
    expect(left.target).toEqual([17.5, 25.5, 17.5]);
    expect([left.cam.panX, left.cam.panY]).toEqual([0, 0]);
    expect(left.fitted).toBe(false);
    await expect.poll(() => page.url()).toMatch(/\/17\.5,25\.5,17\.5\/0,0\/33\/17,25,17$/);
    expect(await page.evaluate(() => history.length)).toBe(entries + 1);
    expect(errors).toEqual([]);
  });

test("choosing the level shown while playing leaves play with the level fitted, as choosing it does without the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: TELEPORT_LEVEL });
  await startPlay(page);
  const li = await page.evaluate(
    async () => (await import(new URL("js/viewer/state.js", location.href).href)).state.li,
  );
  await page.locator(`#worlds .levels button[data-i='${li}']`).click();
  await expect(page.locator("#play")).toBeHidden();
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.fitted).toBe(true);
  // a view that is fitted is the one fitting it again gives
  await page.evaluate(async () => {
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fit();
  });
  const again = await probe(page);
  expect([again.cam, again.target]).toEqual([left.cam, left.target]);
  expect(errors).toEqual([]);
});

test("with Motion on a click on where a teleporter leads, made as the view eases back out of play, centres there on the view from before play", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: TELEPORT_VIEW });
  const before = await probe(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showCell }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
    );
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  await page.locator("#leaveBtn").click();
  await page.locator("#detail .goto").click();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  const left = await probe(page);
  expect(left.target).toEqual([17.5, 25.5, 17.5]);
  expect([left.cam, left.slice]).toEqual([before.cam, before.slice]);
  expect(errors).toEqual([]);
});

test("with Motion on a level chosen as the view eases back out of play is fitted from the view before play", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: TELEPORT_VIEW });
  const before = await probe(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await page.locator("#leaveBtn").click();
  await page.locator("#worlds .levels button[title='LEVEL 69']").click();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  const left = await probe(page);
  expect(
    await page.evaluate(
      async () => (await import(new URL("js/viewer/state.js", location.href).href)).state.lvl.shown,
    ),
  ).toBe("LEVEL 69");
  expect(left.fitted).toBe(true);
  expect([left.cam.yaw, left.cam.pitch]).toEqual([before.cam.yaw, before.cam.pitch]);
  await page.evaluate(async () => {
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fit();
  });
  const again = await probe(page);
  expect([again.cam, again.target]).toEqual([left.cam, left.target]);
  expect(errors).toEqual([]);
});

test("leaving play says so after what the way out says of where it goes, a teleporter's far end or another level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: TELEPORT_LEVEL });
  await startPlay(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showCell }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
    );
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  const go = page.locator("#detail .goto");
  const there = await go.getAttribute("data-said");
  await listening(page);
  await go.click();
  await expect.poll(() => said(page)).toEqual([there, "Left play."]);
  await startPlay(page);
  await page.evaluate(() => (window.__said = []));
  await page.locator("#worlds .levels button[title='LEVEL 69']").click();
  const described = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { describeLevel }] = await Promise.all(
      ["viewer/state.js", "viewer/chrome/a11y.js"].map(at),
    );
    return describeLevel(state.lvl);
  });
  await expect.poll(() => said(page)).toEqual([described, "Left play."]);
  expect(errors).toEqual([]);
});

test("a click on where a teleporter leads, made while playing, writes the entry it opens with the view it goes to at once", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: TELEPORT_LEVEL });
  await startPlay(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { showCell }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/chrome/detail.js", "format/lattice.js"].map(at),
    );
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  const entries = await page.evaluate(() => history.length);
  // read in the same task as the click, before the bar's settle could write it
  const hash = await page.evaluate(() => {
    document.querySelector("#detail .goto").click();
    return location.hash;
  });
  expect(hash).toMatch(/\/17\.5,25\.5,17\.5\/0,0\/33\/17,25,17$/);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  expect(errors).toEqual([]);
});
