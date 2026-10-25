import { test, expect } from "@playwright/test";
import { drafted, drawn, trackErrors } from "./helpers.js";
import {
  TAKEN,
  at,
  betweenFrames,
  frameAt,
  handed,
  line,
  marked,
  opened,
  probe,
  say,
  status,
  top,
} from "./playhelpers.js";

const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);

/** The clock face's type, as the strip of a marker writes it. */
const clockFace = (page) =>
  page.evaluate(async () => {
    const { motionTable } = await import(new URL("js/viewer/data.js", location.href).href);
    return String(motionTable().play.clock.face);
  });

test("a right click selects while playing, Esc clears the selection before it leaves, and the panel's Play from here, there with its setting on alone, moves the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await opened(page, { motion: false });
  const side = await plusX(page, [17, 13, 17]);
  await page.mouse.click(side.x, side.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
  await expect(page.locator("#detail .put")).toHaveCount(0);
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator("#playFrom").click();
  await expect(page.locator("#settings label:has(#playFrom) .def")).toHaveText("off by default");
  await page.locator("#settings .x").click();
  await expect(page.locator("#settings")).toBeHidden();
  expect((await kept()).playfrom).toBe(true);
  // the panel on screen takes the button as the switch goes on
  const put = page.locator("#detail .put button", { hasText: "Play from here" });
  await expect(put).toHaveCount(1);
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
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
  await page.locator("#detail .put button", { hasText: "Play from here" }).click();
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 14, 17]);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("playing from another block leaves the level one ball, a start on a clock showing the clock alone, and the start's ball is back once the level has ended", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await drafted(page, {
    blocks: [[[18, 17, 17], { kind: 0 }]],
    faces: [[[17, 17, 17], 0, { type: 29, facing: 3 }]],
    time: 1,
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { startsOf }] = await Promise.all(
          ["viewer/state.js", "viewer/data.js"].map(at),
        );
        return startsOf(state.lvl).map((s) => s.type);
      }),
    )
    .toEqual([29]);
  // with markers in place of models a ball is its type written once, so the balls can be counted
  for (const [key, id] of [
    ["t", "#showSkins"],
    ["m", "#showModels"],
    ["v", "#showMotion"],
  ]) {
    await page.keyboard.press(key);
    await expect(page.locator(id)).not.toBeChecked();
  }
  const clock = await clockFace(page);
  const start = [17, 17, 17];
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(0);
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 18, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: [18, 17, 17], face: 0, moving: false }),
  );
  expect(await handed(page)).toBe(true);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(1);
  const over = await top(page, start);
  await page.mouse.click(over.x, over.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("Start on a clock");
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.mouse.move(2, 2);
  await page.keyboard.down("ArrowLeft");
  await expect(status(page)).toHaveText(/^TIME OUT!/, { timeout: 10_000 });
  await page.keyboard.up("ArrowLeft");
  expect(await handed(page)).toBe(false);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(0);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: start, face: 0, moving: false }),
  );
  expect(await handed(page)).toBe(true);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(1);
  expect(errors).toEqual([]);
});

test("with Motion off a hop on a coin's block takes the coin on the first frame, nothing draws once the ball rests, and the tip and the panel say the coin is taken", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const coin = [17, 16, 17];
  await page.evaluate(async (c) => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: c[0], y: c[1], z: c[2], face: 0 });
  }, coin);
  await expect(page.locator("#play")).toBeVisible();
  await expect(line(page)).toHaveText("Playing · on the top of 17,16,17, facing +y");
  await expect(page.locator("#playPoints")).toHaveText("0 points");
  expect(await drawn(page)).toBe(0);
  await betweenFrames(page, () => page.keyboard.press(" "));
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  await expect(say(page)).toHaveText("Coin (bronze) taken, 250 points.");
  // the level's opening frames first, then the hop, so the poll is quick
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await drawn(page)).toBe(0);
  expect(await frameAt(page)).toBeGreaterThan(0);
  const over = await top(page, coin);
  await page.mouse.move(over.x, over.y);
  await expect(page.locator("#tip")).toContainText(TAKEN);
  await page.mouse.click(over.x, over.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,16,17");
  await expect(page.locator("#detail")).toContainText(`${TAKEN}.`);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});
