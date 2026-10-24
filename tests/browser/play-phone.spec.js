import { test, expect } from "@playwright/test";
import { overlaps, trackErrors } from "./helpers.js";
import { anchor, hold, line, opened, probe, startPlay, status, top } from "./playhelpers.js";
import { FOLLOWING_PAD } from "../../public/js/play/phrases.js";

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
    await expect(page.locator("#jump")).toBeVisible();
    await expect(page.locator("#padBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#pad [data-pad="down"]')).toHaveCount(0);
    const up = await page.locator('#pad [data-pad="up"]').boundingBox();
    expect(Math.min(up.width, up.height)).toBeGreaterThanOrEqual(44);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2 }],
    });
    // the level's opening frames first, then a block in a quarter of a second, so the poll is quick
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual([17, 17, 17]);
    // held on, it rolls on past the next block
    await expect.poll(async () => (await probe(page)).station.block[1]).toBeLessThanOrEqual(16);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    const rested = (await probe(page)).station.block;
    await page.waitForTimeout(400);
    expect((await probe(page)).station.block).toEqual(rested);
    // the jump, held, hops the ball where it stands
    const jump = await page.locator("#padBall").boundingBox();
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 }],
    });
    await expect
      .poll(async () => (await probe(page)).station.moving, { intervals: [25] })
      .toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    expect((await probe(page)).station.block).toEqual(rested);
    // a touch leaves no hover look behind, on the arrow, on the jump or on the strip's button
    const border = (sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(await border('#pad [data-pad="up"]')).toBe(await border('#pad [data-pad="left"]'));
    expect(await border("#padBall")).toBe(await border('#pad [data-pad="left"]'));
    await page.locator("#padBtn").tap();
    await expect(page.locator("#pad")).toBeHidden();
    await expect(page.locator("#jump")).toBeHidden();
    expect(await border("#padBtn")).toBe(await border("#forgiveBtn"));
    await hold(page, await top(page, [17, 12, 17]));
    await expect(page.locator("#detail")).toContainText("cell 17,12,17");
    expect((await probe(page)).playing).toBe(true);
    expect(errors).toEqual([]);
  });

  test.describe("at a phone's size", () => {
    test.use({ viewport: { width: 375, height: 700 }, isMobile: true });

    test("the strip is a bar at the foot of the screen, the ball is framed above it, its line has a row of its own, the pad lies over the view without moving it, and the HUD spans the top in the level line's place", async ({
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
      // the strip spans the width at the foot, over the band the scale bar is drawn in
      expect(Math.abs(strip.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(strip.width - 375)).toBeLessThanOrEqual(1);
      expect(Math.abs(strip.y + strip.height - 700)).toBeLessThanOrEqual(1);
      // the level line gives its place to the HUD, which spans from the menu button to the edge
      await expect(page.locator("#chip")).toBeHidden();
      const hud = await page.locator("#hud").boundingBox();
      expect(Math.abs(hud.x - 54)).toBeLessThanOrEqual(1);
      expect(Math.abs(hud.x + hud.width - (cv.x + cv.width - 12))).toBeLessThanOrEqual(1);
      expect(spot.y).toBeLessThan(strip.y - 40);
      // a fifth below the middle of what the strip leaves free, from the first frame, the pad
      // taking none of it
      expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
      expect(spot.free).toBe(strip.y - cv.y);
      expect(spot.x).toBeGreaterThan(40);
      expect(spot.x).toBeLessThan(375 - 40);
      expect(lineBox.width).toBeGreaterThan(strip.width * 0.8);
      expect(lineBox.height).toBeLessThan(45);
      // play asks nothing of Down, so the pad has no down arrow and no row under the turns
      await expect(page.locator('#pad [data-pad="down"]')).toHaveCount(0);
      // the roll is a bar over the two turns, and the jump stands at the bottom right, level with
      // the pad, the corner's widgets clear of the jump, the pad and the strip
      const up = await page.locator('#pad [data-pad="up"]').boundingBox();
      const left = await page.locator('#pad [data-pad="left"]').boundingBox();
      expect(up.width).toBeGreaterThanOrEqual(left.width * 2);
      await expect(page.locator("#jump")).toBeVisible();
      const jump = await page.locator("#jump").boundingBox();
      expect(Math.abs(jump.x + jump.width - (cv.x + cv.width - 12))).toBeLessThanOrEqual(1);
      expect(Math.abs(jump.y + jump.height - (pad.y + pad.height))).toBeLessThanOrEqual(1);
      const corner = await page.locator("#corner").boundingBox();
      expect(overlaps(corner, jump) || overlaps(corner, pad) || overlaps(corner, strip)).toBe(
        false,
      );
      // put away and brought back, the pad takes the jump with it and leaves the ball where it is
      await page.locator("#padBtn").click();
      await expect(page.locator("#pad")).toBeHidden();
      await expect(page.locator("#jump")).toBeHidden();
      const without = await anchor(page);
      expect([without.x, without.y, without.free]).toEqual([spot.x, spot.y, spot.free]);
      await page.locator("#padBtn").click();
      await expect(page.locator("#pad")).toBeVisible();
      await expect(page.locator("#jump")).toBeVisible();
      const again = await anchor(page);
      expect([again.x, again.y, again.free]).toEqual([spot.x, spot.y, spot.free]);
      expect(errors).toEqual([]);
    });

    test("the bar's five buttons share one row and a notice takes the line's row, the planner's strip stands on the bar with the pad, the jump and the corner clear of both, and the readout lies under it", async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await opened(page, { motion: false });
      await expect(page.locator("#readout")).toBeVisible();
      // a route round the level, laid by taps, so that Follow shows and the planner's strip stands
      await page.keyboard.press("r");
      for (const c of [
        [17, 15, 17],
        [20, 15, 17],
        [20, 18, 17],
        [17, 18, 17],
      ]) {
        const face = await top(page, c);
        await page.touchscreen.tap(face.x, face.y);
      }
      await expect(page.locator("#courseLine")).toHaveText("Route planner · 5 stops");
      await startPlay(page);
      await expect(page.locator("#pad")).toBeVisible();
      await expect(page.locator("#followBtn")).toBeVisible();
      await expect(page.locator("#readout")).toBeHidden();
      const box = (sel) => page.locator(sel).boundingBox();
      const [bar, course, corner, pad, jump] = await Promise.all(
        ["#play", "#course", "#corner", "#pad", "#jump"].map(box),
      );
      const buttons = await Promise.all(
        ["#padBtn", "#followBtn", "#keepBtn", "#forgiveBtn", "#leaveBtn"].map(box),
      );
      for (const b of buttons) {
        expect(Math.abs(b.y - buttons[0].y)).toBeLessThanOrEqual(1);
        expect(b.x).toBeGreaterThanOrEqual(bar.x);
        expect(b.x + b.width).toBeLessThanOrEqual(bar.x + bar.width);
        expect(b.y + b.height).toBeLessThanOrEqual(bar.y + bar.height);
      }
      expect(course.y + course.height).toBeLessThanOrEqual(bar.y);
      for (const other of [corner, pad, jump]) expect(overlaps(course, other)).toBe(false);
      for (const other of [bar, course, pad, jump]) expect(overlaps(corner, other)).toBe(false);
      // a notice takes the line's row while it stands, and the line is back as it goes
      await page.locator("#followBtn").tap();
      await expect(status(page)).toHaveText(FOLLOWING_PAD);
      await expect(line(page)).toBeHidden();
      await page.keyboard.press("ArrowLeft");
      await expect(status(page)).toHaveText("");
      await expect(line(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#play")).toBeHidden();
      await expect(page.locator("#readout")).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
});
