import { test, expect } from "@playwright/test";
import { settle, frame, steps, still } from "./helpers.js";

/** Tap as a finger does, with no mouse left elsewhere to take the hover away. */
const fingerTap = async (page, target, position) => {
  const box = await target.boundingBox();
  const at = position ?? { x: box.width / 2, y: box.height / 2 };
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await target.tap({ position: at });
};
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
const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const s = state.selected;
    const h = state.hover;
    return {
      selected: s && [s.x, s.y, s.z],
      hover: h && [h.x, h.y, h.z, h.face],
      sheet: document.body.classList.contains("sheet-open"),
    };
  });

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  test("a tap anywhere on the chip's line folds the note, and leaves the chip unlit", async ({
    page,
  }) => {
    await page.goto("/#MARS/12");
    await settle(page);
    const fold = page.locator("#chipBtn");
    const note = page.locator("#chipNote");
    const menu = await page.locator("#menuBtn").boundingBox();
    const line = await fold.boundingBox();
    expect(line.x).toBeGreaterThan(menu.x + menu.width);
    expect(line.x + line.width).toBeLessThanOrEqual(375);
    expect(line.height).toBeGreaterThanOrEqual(menu.height);
    const border = () =>
      page.evaluate(() => getComputedStyle(document.getElementById("chip")).borderTopColor);
    const unlit = await border();
    // the padding round the words is the line as much as the words are
    await fingerTap(page, fold, { x: 4, y: 4 });
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(note).toBeHidden();
    await expect(page.locator("#detail")).toBeHidden();
    expect(await fold.evaluate((b) => b.matches(":hover"))).toBe(true);
    expect(await border()).toBe(unlit);
    await fold.tap();
    await expect(note).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test("a tap on the button in the corner frames the level again, and leaves it at rest", async ({
    page,
  }) => {
    await page.goto("/#INCA/11");
    await settle(page);
    await still(page);
    const button = page.locator("#fitBtn");
    const ink = () => button.evaluate((b) => getComputedStyle(b).color);
    const resting = await ink();
    await page.keyboard.press("+");
    await expect(page).not.toHaveURL(/\/fit\//);
    expect(await ink()).not.toBe(resting);
    const box = await button.boundingBox();
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await fingerTap(page, button);
    await expect(page).toHaveURL(/\/fit\//);
    await expect(page.locator("#detail")).toBeHidden();
    // a touch screen keeps the tapped button under its :hover until the next tap
    expect(await button.evaluate((b) => b.matches(":hover"))).toBe(true);
    expect(await ink()).toBe(resting);
  });

  test("a finger held still on a block opens its panel when it lifts, as a right click does", async ({
    page,
  }) => {
    await page.goto("/#HIRO/0/45,35/fit/33");
    await settle(page);
    await still(page);
    const point = await top(page, [17, 15, 17]);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: point.x, y: point.y }],
    });
    // the hold shows as the hover does under a mouse, and selects nothing until the lift
    await expect.poll(async () => (await shown(page)).hover).toEqual([17, 15, 17, 0]);
    await expect(page.locator("#tip")).toBeVisible();
    expect((await shown(page)).selected).toBe(null);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect(page.locator("#detail")).toContainText("cell 17,15,17");
    const after = await shown(page);
    expect(after.selected).toEqual([17, 15, 17]);
    expect(after.hover).toBe(null);
    await expect(page.locator("#tip")).toBeHidden();
    // a tap is a tap still: the next one selects at once, and a tap on nothing clears
    await page.keyboard.press("Escape");
    await expect(page.locator("#detail")).toBeHidden();
    const other = await top(page, [20, 15, 17]);
    await page.touchscreen.tap(other.x, other.y);
    await expect(page.locator("#detail")).toContainText("cell 20,15,17");
  });
});

test("the drawer stays dismissable on the narrowest phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  await still(page);
  const btn = await page.locator("#menuBtn").boundingBox();
  expect(btn.x + btn.width).toBeLessThanOrEqual(320);
  await expect(page.locator("#scrim")).toBeVisible();
  const drawer = await page.locator("#sidebar").boundingBox();
  const beside = { x: (drawer.x + drawer.width + 320) / 2, y: drawer.height / 2 };
  await page.locator("#scrim").click({ position: beside });
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
});

test("the menu button rides the drawer's edge as it slides, beside the map and over it", async ({
  page,
}) => {
  const boxes = () =>
    Promise.all(["#menuBtn", "#sidebar", "#chip"].map((s) => page.locator(s).boundingBox()));
  // held half way through the slide, both ways
  const midway = () =>
    page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = 5000;
      }),
    );
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/#HIRO/0");
    await settle(page);
    await still(page);
    // a slide too slow for a runner to miss
    await page.addStyleTag({ content: ":root { --slide: 10s linear; }" });
    for (const way of ["there", "back"]) {
      const at = `${width} ${way}`;
      await page.locator("#menuBtn").click();
      await midway();
      await frame(page);
      const [mid, drawer, chip] = await boxes();
      const edge = drawer.x + drawer.width;
      expect(edge, at).toBeGreaterThan(0);
      expect(edge, at).toBeLessThan(drawer.width);
      expect(mid.x, at).toBeCloseTo(edge + 10, 0);
      if (width > 760) expect(chip.x, at).toBeGreaterThanOrEqual(mid.x + mid.width);
      await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
      await still(page);
      const [rest, settled] = await boxes();
      expect(rest.x, at).toBe(settled.x + settled.width + 10);
    }
  }
});

test("the menu button shows a cross while the drawer is open and bars while it is closed", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const btn = page.locator("#menuBtn");
  const bars = btn.locator(".bars");
  const cross = btn.locator(".cross");
  const says = async (label) => {
    await expect(btn).toHaveAttribute("aria-label", label);
    await expect(btn).toHaveAttribute("title", `${label} (m)`);
  };
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await says("Hide the sidebar");
  await expect(cross).toBeVisible();
  await expect(bars).toBeHidden();
  await page.keyboard.press("m");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await says("Show the sidebar");
  await expect(bars).toBeVisible();
  await expect(cross).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await says("Hide the sidebar");
  await expect(cross).toBeVisible();
  await expect(bars).toBeHidden();
});

test("Escape leaves the drawer alone where it sits beside the map", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#scrim")).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains("sidebar-open"))).toBe(true);
});

test("the closed drawer is out of the tab order, and / opens it to search", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
  const inDrawer = () =>
    page.evaluate(() => document.getElementById("sidebar").contains(document.activeElement));
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await inDrawer()).toBe(false);
  }
  await page.keyboard.press("/");
  await expect(page.locator("body")).toHaveClass(/sidebar-open/);
  await expect(page.locator("#search")).toBeFocused();
  // closed with the focus still inside, as a key closes it
  await page.evaluate(() => document.getElementById("menuBtn").click());
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
  await expect.poll(inDrawer).toBe(false);
});

test("the settings fit a phone, over the drawer they open from", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await page.locator("#settingsBtn").click();
  const box = await page.locator("#settings .box").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/sidebar-open/);
  await expect(page.locator("#settingsBtn")).toBeFocused();
});

test.describe("editing on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  const EDIT = "/#HIRO/0/45,35/fit/33";
  const START = [17, 17, 17];
  const tap = (page, point) => page.touchscreen.tap(point.x, point.y);
  /** A finger held still on a block, through the browser's own touch input, until the hold has selected it. */
  const hold = async (page, point) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: point.x, y: point.y }],
    });
    await expect.poll(async () => (await shown(page)).selected).not.toBe(null);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  };
  const cells = (page) =>
    page.evaluate(async () => {
      const [{ state }, { get }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js"].map(
          (p) => import(new URL(`js/${p}`, location.href).href),
        ),
      );
      return get(state.lvl.draft).doc.blocks.map((b) => b.cell);
    });
  const spans = (page) =>
    page.evaluate(async () => {
      const [{ state }, { get }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js"].map(
          (p) => import(new URL(`js/${p}`, location.href).href),
        ),
      );
      return get(state.lvl.draft).doc.blocks.filter((b) => b.kind === 5);
    });
  const zoom = (page, z) =>
    page.evaluate(async (z) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const { invalidatePick, draw } = await import(
        new URL("js/viewer/draw/render.js", location.href).href
      );
      state.cam.zoom = z;
      state.framing = null;
      invalidatePick();
      draw();
    }, z);
  const heights = (locator) =>
    locator.evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height));
  /** Pan the level up the screen, clear of a sheet and the strip above it. */
  const lift = (page, by) =>
    page.evaluate(async (by) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const { invalidatePick, draw } = await import(
        new URL("js/viewer/draw/render.js", location.href).href
      );
      state.cam.panY += by;
      state.framing = null;
      invalidatePick();
      draw();
    }, by);

  /** Pan the level so a point of it lies under a point of the screen. */
  const bring = (page, point, to) =>
    page.evaluate(
      async ([point, to]) => {
        const { state, screen, BLOCK } = await import(
          new URL("js/viewer/state.js", location.href).href
        );
        const { invalidatePick, draw } = await import(
          new URL("js/viewer/draw/render.js", location.href).href
        );
        const r = document.getElementById("cv").getBoundingClientRect();
        const [px, py] = screen(...point);
        const k = state.cam.zoom * BLOCK;
        state.cam.panX += (px - (to.x - r.left)) / k;
        state.cam.panY += (py - (to.y - r.top)) / k;
        state.framing = null;
        invalidatePick();
        draw();
      },
      [point, to],
    );
  const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const tool = (page, name) => page.locator(`#tools .tool[data-tool="${name}"]`);

  /** A new draft, editing, the drawer closed again so the map is under the finger. */
  async function editFresh(page) {
    await page.goto(EDIT);
    await settle(page);
    await page.keyboard.press("m");
    await page.locator("#draftNew").click();
    await expect(page.locator("#tools")).toBeVisible();
    await page.keyboard.press("m");
    if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
      await page.keyboard.press("w");
    await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#palette")).toBeHidden();
    await still(page);
  }

  test("a tap marks a face, a second tap on it places, and a tap elsewhere marks that face instead", async ({
    page,
  }) => {
    await editFresh(page);
    const side = await plusX(page, START);
    await tap(page, side);
    await expect(page.locator("#toolStatus")).toHaveText(
      "Tap again to place a block on the +x side.",
    );
    expect((await shown(page)).hover).toEqual([17, 17, 17, 1]);
    expect(await cells(page)).toEqual([START]);
    await tap(page, side);
    expect(await cells(page)).toEqual([START, [18, 17, 17]]);
    expect((await shown(page)).selected).toEqual([18, 17, 17]);
    await expect(page.locator("#say")).toHaveText("Placed a block at 18, 17, 17");
    await expect(page.locator("#toolStatus")).toHaveText("");
    // what was placed is selected, with the panel's sheet left down
    await expect(page.locator("#detail")).toBeHidden();
    expect((await shown(page)).sheet).toBe(false);

    await tap(page, await plusX(page, [18, 17, 17]));
    expect((await shown(page)).hover).toEqual([18, 17, 17, 1]);
    await tap(page, await top(page, START));
    expect((await shown(page)).hover).toEqual([17, 17, 17, 0]);
    expect(await cells(page)).toHaveLength(2);
    await tap(page, await top(page, START));
    expect(await cells(page)).toContainEqual([17, 17, 16]);
    expect(await cells(page)).toHaveLength(3);
  });

  test("a run is laid through two confirmed taps", async ({ page }) => {
    await editFresh(page);
    await page.keyboard.press("g");
    await zoom(page, 0.8);
    await page.locator("#paletteBtn").tap();
    await expect(page.locator("#palette")).toBeVisible();
    await page.locator('#palette .rows button[data-id="k5"]').tap();
    await page.locator("#palette .x").tap();
    await expect(page.locator("#palette")).toBeHidden();
    const side = await plusX(page, START);
    await tap(page, side);
    await tap(page, side);
    await expect(page.locator("#toolStatus")).toHaveText(
      "The run waits for its far end. Tap where it ends, or change the tool.",
    );
    const far = await at(page, 18.5, 21.5, 18);
    await tap(page, far);
    await expect(page.locator("#toolStatus")).toHaveText("Tap again to end the run here.");
    expect(await spans(page)).toEqual([]);
    await tap(page, far);
    expect(await spans(page)).toEqual([
      { cell: [18, 17, 17], kind: 5, far: [18, 21, 17], length: 2, speed: 30 },
    ]);
    await expect(page.locator("#say")).toHaveText(
      "Laid a moving platform from 18, 17, 17 to 18, 21, 17",
    );
    expect((await shown(page)).selected).toEqual([18, 17, 17]);
    await expect(page.locator("#detail")).toBeHidden();
  });

  test("a placement leaves the palette's sheet open, and a long press raises the panel over it", async ({
    page,
  }) => {
    await editFresh(page);
    await page.locator("#paletteBtn").tap();
    const palette = page.locator("#palette");
    await expect(palette).toBeVisible();
    await lift(page, 1.5);
    const side = await plusX(page, START);
    await tap(page, side);
    await tap(page, side);
    expect(await cells(page)).toEqual([START, [18, 17, 17]]);
    expect((await shown(page)).selected).toEqual([18, 17, 17]);
    await expect(palette).toBeVisible();
    await expect(page.locator("#detail")).toBeHidden();
    expect((await shown(page)).sheet).toBe(true);
    await page.keyboard.press("z");
    const top18 = await top(page, [18, 17, 17]);
    await tap(page, top18);
    await tap(page, top18);
    expect(await cells(page)).toEqual([START]);
    await expect(palette).toBeVisible();
    await page.keyboard.press("a");
    await hold(page, await plusX(page, START));
    await expect(page.locator("#detail")).toBeVisible();
    await expect(palette).toBeHidden();
  });

  test("the palette's sheet stays open through a second placement, an erase, an undo and a card edit", async ({
    page,
  }) => {
    await editFresh(page);
    await page.locator("#paletteBtn").tap();
    const palette = page.locator("#palette");
    const panel = page.locator("#detail");
    await expect(palette).toBeVisible();
    await lift(page, 1.5);
    const side = await plusX(page, START);
    await tap(page, side);
    await tap(page, side);
    expect(await cells(page)).toEqual([START, [18, 17, 17]]);
    const down = async (selected) => {
      expect(await shown(page)).toMatchObject({ selected, sheet: true });
      await expect(palette).toBeVisible();
      await expect(panel).toBeHidden();
    };
    await down([18, 17, 17]);
    // every change draws the draft again with the selection kept, which must not raise its panel
    const next = await plusX(page, [18, 17, 17]);
    await tap(page, next);
    await tap(page, next);
    expect(await cells(page)).toEqual([START, [18, 17, 17], [19, 17, 17]]);
    await down([19, 17, 17]);
    await page.keyboard.press("z");
    const top18 = await top(page, [18, 17, 17]);
    await tap(page, top18);
    await tap(page, top18);
    expect(await cells(page)).toEqual([START, [19, 17, 17]]);
    await down([19, 17, 17]);
    await page.locator("#undoBtn").tap();
    expect(await cells(page)).toEqual([START, [18, 17, 17], [19, 17, 17]]);
    await down([19, 17, 17]);
    await page.locator("#menuBtn").tap();
    await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
    const time = page.locator("#draftTime");
    await time.fill("45");
    await time.blur();
    await expect(page.locator("#chipLine")).toContainText("time 45");
    await page.locator("#menuBtn").tap();
    await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
    await still(page);
    await down([19, 17, 17]);
  });

  test("a brush chosen after a tap has placed a block leaves the panel down and the palette open", async ({
    page,
  }) => {
    await editFresh(page);
    await page.locator("#paletteBtn").tap();
    const palette = page.locator("#palette");
    await expect(palette).toBeVisible();
    await lift(page, 1.5);
    const side = await plusX(page, START);
    await tap(page, side);
    await tap(page, side);
    expect(await cells(page)).toEqual([START, [18, 17, 17]]);
    expect((await shown(page)).selected).toEqual([18, 17, 17]);
    await expect(page.locator("#detail")).toBeHidden();
    const ice = page.locator('#palette .rows button[data-id="k2"]');
    await ice.tap();
    await expect(ice).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#say")).toHaveText(/^Brush: /);
    await expect(palette).toBeVisible();
    await expect(page.locator("#detail")).toBeHidden();
    expect((await shown(page)).sheet).toBe(true);
    // leaving editing and coming back is no reason to raise it either
    await page.locator("#editBtn").tap();
    await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#detail")).toBeHidden();
    await page.locator("#editBtn").tap();
    await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(palette).toBeVisible();
    await expect(page.locator("#detail")).toBeHidden();
    expect((await shown(page)).sheet).toBe(true);
  });

  test("a finger on the floor with a thing for a brush is told the grid lays blocks", async ({
    page,
  }) => {
    await editFresh(page);
    await page.keyboard.press("g");
    await zoom(page, 0.8);
    await page.locator("#paletteBtn").tap();
    await page.locator("#palette .tabs button", { hasText: "Pickups" }).tap();
    await page.locator('#palette .rows button[data-id="t31"]').tap();
    await page.locator("#palette .x").tap();
    await expect(page.locator("#palette")).toBeHidden();
    await tap(page, await at(page, 18.5, 21.5, 18));
    await expect(page.locator("#toolStatus")).toHaveText(
      "The grid lays blocks; a thing goes on a block's face.",
    );
    await expect(page.locator("#toastStack .toast")).toHaveText([
      "The grid lays blocks; a thing goes on a block's face.",
    ]);
    expect((await shown(page)).hover).toBe(null);
    await tap(page, await at(page, 18.5, 21.5, 18));
    expect(await cells(page)).toEqual([START]);
    // a block for a brush lays on the floor as before
    await page.locator("#paletteBtn").tap();
    await page.locator("#palette .tabs button", { hasText: "Blocks" }).tap();
    await page.locator('#palette .rows button[data-id="k0"]').tap();
    await page.locator("#palette .x").tap();
    await tap(page, await at(page, 18.5, 21.5, 18));
    await expect(page.locator("#toolStatus")).toHaveText("Tap again to lay a block on the floor.");
    await tap(page, await at(page, 18.5, 21.5, 18));
    expect(await cells(page)).toEqual([START, [18, 21, 17]]);
  });

  test("a tap on a face that holds the brush's thing says so at once, and arms nothing", async ({
    page,
  }) => {
    await editFresh(page);
    await page.locator("#paletteBtn").tap();
    await page.locator("#palette .tabs button", { hasText: "Pickups" }).tap();
    await page.locator('#palette .rows button[data-id="t31"]').tap();
    await page.locator("#palette .x").tap();
    await expect(page.locator("#palette")).toBeHidden();
    const side = await plusX(page, START);
    await tap(page, side);
    await tap(page, side);
    await expect(page.locator("#say")).toHaveText("Placed a key on the +x side of 17, 17, 17");
    await tap(page, side);
    await expect(page.locator("#toolStatus")).toHaveText("That face holds a key already.");
    await expect(page.locator("#toastStack .toast")).toHaveText(["That face holds a key already."]);
    await expect(page.locator("#say")).toHaveText("Placed a key on the +x side of 17, 17, 17");
    expect(await steps(page)).toEqual({ past: 1, future: 0 });
  });

  test("a long press selects what is under the finger from the Place tool", async ({ page }) => {
    await editFresh(page);
    await hold(page, await top(page, START));
    expect((await shown(page)).selected).toEqual(START);
    await expect(page.locator("#detail")).toBeVisible();
    expect(await cells(page)).toEqual([START]);
    await expect(page.locator("#toolStatus")).toHaveText("");
  });

  test("a hold of any length selects, and the lift that ends it arms nothing", async ({ page }) => {
    await editFresh(page);
    const point = await top(page, START);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: point.x, y: point.y }],
    });
    await expect.poll(async () => (await shown(page)).selected).toEqual(START);
    // held on well past any window the long press might have opened
    await page.waitForTimeout(1200);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect(page.locator("#detail")).toBeVisible();
    await expect(page.locator("#toolStatus")).toHaveText("");
    expect((await shown(page)).hover).toBe(null);
    expect(await cells(page)).toEqual([START]);
    // the next tap is a tap of its own
    await page.keyboard.press("Escape");
    await expect(page.locator("#detail")).toBeHidden();
    await tap(page, await plusX(page, START));
    await expect(page.locator("#toolStatus")).toHaveText(
      "Tap again to place a block on the +x side.",
    );
  });

  test("a long press whose sheet moves the strip under the finger leaves the tools alone", async ({
    page,
  }) => {
    await editFresh(page);
    // where the Erase tool stands once the panel is a sheet
    await page.keyboard.press("i");
    await tap(page, await top(page, START));
    await expect(page.locator("#detail")).toBeVisible();
    const raised = centre(await tool(page, "erase").boundingBox());
    await page.keyboard.press("Escape");
    await expect(page.locator("#detail")).toBeHidden();
    await page.keyboard.press("a");
    await bring(page, [START[0] + 0.5, START[1] + 0.5, START[2]], raised);
    await hold(page, raised);
    expect((await shown(page)).selected).toEqual(START);
    await expect(page.locator("#detail")).toBeVisible();
    expect(centre(await tool(page, "erase").boundingBox())).toEqual(raised);
    await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
    await expect(tool(page, "erase")).toHaveAttribute("aria-pressed", "false");
    expect(await cells(page)).toEqual([START]);
  });

  test("a tap with Select whose sheet moves the strip under the finger leaves the tools alone", async ({
    page,
  }) => {
    await editFresh(page);
    await page.keyboard.press("i");
    await tap(page, await top(page, START));
    await expect(page.locator("#detail")).toBeVisible();
    const raised = centre(await tool(page, "erase").boundingBox());
    await page.keyboard.press("Escape");
    await expect(page.locator("#detail")).toBeHidden();
    await bring(page, [START[0] + 0.5, START[1] + 0.5, START[2]], raised);
    await tap(page, raised);
    expect((await shown(page)).selected).toEqual(START);
    await expect(page.locator("#detail")).toBeVisible();
    expect(centre(await tool(page, "erase").boundingBox())).toEqual(raised);
    await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
    await expect(tool(page, "erase")).toHaveAttribute("aria-pressed", "false");
    expect(await cells(page)).toEqual([START]);
  });

  test("an arming tap's prompt grows the strip without a tool taking the tap's click", async ({
    page,
  }) => {
    await editFresh(page);
    const strip = page.locator("#tools");
    const resting = await strip.boundingBox();
    const grown = await page.evaluate(() => {
      const status = document.getElementById("toolStatus");
      status.textContent = "Tap again to place a block on the top.";
      const h = document.getElementById("tools").getBoundingClientRect().height;
      status.textContent = "";
      return h;
    });
    expect(grown).toBeGreaterThan(resting.height + 10);
    // just above the strip, where its buttons stand once the prompt has grown it
    const point = { x: centre(await tool(page, "erase").boundingBox()).x, y: resting.y - 2 };
    await bring(page, [START[0] + 0.5, START[1] + 0.5, START[2]], point);
    await tap(page, point);
    await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#toolStatus")).toHaveText("Tap again to place a block on the top.");
    const under = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest("#tools button")?.textContent.trim(),
      [point.x, point.y],
    );
    expect(under).toBeTruthy();
    await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#palette")).toBeHidden();
    expect((await shown(page)).hover).toEqual([17, 17, 17, 0]);
    expect(await cells(page)).toEqual([START]);
  });

  test("the palette and the panel are sheets, one at a time, with the strip above and 44 px targets", async ({
    page,
  }) => {
    await editFresh(page);
    await page.keyboard.press("i");
    await tap(page, await top(page, START));
    const panel = page.locator("#detail");
    await expect(panel).toBeVisible();
    expect((await shown(page)).sheet).toBe(true);
    const sheet = await panel.boundingBox();
    expect(sheet.x).toBe(0);
    expect(sheet.width).toBe(375);
    expect(sheet.y + sheet.height).toBeCloseTo(700, 0);
    const strip = await page.locator("#tools").boundingBox();
    expect(strip.y + strip.height).toBeLessThanOrEqual(sheet.y + 1);
    expect(strip.width).toBe(375);
    for (const h of await heights(page.locator("#detail .form button, #detail .form select")))
      expect(h).toBeGreaterThanOrEqual(44);

    await page.locator("#paletteBtn").tap();
    const palette = page.locator("#palette");
    await expect(palette).toBeVisible();
    await expect(panel).toBeHidden();
    const box = await palette.boundingBox();
    expect(box.width).toBe(375);
    expect(box.y + box.height).toBeCloseTo(700, 0);
    const above = await page.locator("#tools").boundingBox();
    expect(above.y + above.height).toBeLessThanOrEqual(box.y + 1);
    for (const h of await heights(page.locator("#tools button:visible")))
      expect(h).toBeGreaterThanOrEqual(44);
    for (const h of await heights(page.locator("#palette .tabs button, #palette .rows button")))
      expect(h).toBeGreaterThanOrEqual(44);
    for (const h of await heights(page.locator("#palette .x")))
      expect(h).toBeGreaterThanOrEqual(44);

    await lift(page, 1.5);
    await tap(page, await plusX(page, START));
    await expect(palette).toBeHidden();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    expect((await shown(page)).sheet).toBe(false);
    await page.locator("#paletteBtn").tap();
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test("a mouse still places on one click", async ({ page }) => {
    await editFresh(page);
    const side = await plusX(page, START);
    await page.mouse.click(side.x, side.y);
    expect(await cells(page)).toEqual([START, [18, 17, 17]]);
  });
});
