import { test, expect } from "@playwright/test";
import { settle, frame, still } from "./helpers.js";

/** Tap as a finger does, with no mouse left elsewhere to take the hover away. */
const fingerTap = async (page, target, position) => {
  const box = await target.boundingBox();
  const at = position ?? { x: box.width / 2, y: box.height / 2 };
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await target.tap({ position: at });
};

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
