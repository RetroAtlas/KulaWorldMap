import { test, expect } from "@playwright/test";
import { settle, frame, still, trackErrors, unmarking } from "./helpers.js";

/** The drawer opened over the map at a phone's width by `/`, the keyboard's focus in the search box. */
async function searching(page) {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
}
/** The drawer as `searching` leaves it, with the finds of a typed search listed. */
async function finding(page) {
  await searching(page);
  await page.keyboard.type("key");
  await expect(page.locator("#hit0")).toBeVisible();
}
/** Wait for the drawer to close, by which time a focus it hands on has landed. */
const closed = (page) => expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");

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
    await expect(btn).toHaveAttribute("title", `${label} (s)`);
  };
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await says("Hide the sidebar");
  await expect(cross).toBeVisible();
  await expect(bars).toBeHidden();
  await page.keyboard.press("s");
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

test("a key that closes the drawer hands the keyboard's focus inside it to the menu button", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#settingsBtn")).toBeFocused();
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Enter on a find closes the drawer onto the menu button, though the search box has let the focus go", async ({
  page,
}) => {
  await finding(page);
  await page.keyboard.press("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Enter on a find hands on the focus of a search box that a click reached", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await page.locator("#search").click();
  await page.keyboard.type("key");
  await expect(page.locator("#hit0")).toBeVisible();
  await page.keyboard.press("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Enter on a find hands the focus on as the first key pressed in the search box", async ({
  page,
}) => {
  await finding(page);
  await page.keyboard.press("Enter");
  await closed(page);
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.keyboard.press("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Enter held on a find closes the drawer once, its repeats pressing nothing", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.type("ke");
  await page.keyboard.down("y");
  await expect(page.locator("#hit0")).toBeVisible();
  await page.keyboard.down("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
  // neither a key let go under the held one nor a key pressed under it frees its repeats
  await page.keyboard.up("y");
  await page.keyboard.down("Shift");
  // a second down of a key still held arrives as its repeat
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await page.keyboard.up("Shift");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Enter held on a find closes the drawer once on a later search too, its repeats pressing nothing", async ({
  page,
}) => {
  await finding(page);
  await page.keyboard.press("Enter");
  await closed(page);
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
  await page.keyboard.down("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
  await page.keyboard.down("Enter");
  await page.keyboard.up("Enter");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Space held on the gear as s closes the drawer leaves it closed, its repeats and its letting go pressing nothing", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#settingsBtn")).toBeFocused();
  await page.keyboard.down("Space");
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
});

test("Tab held as s closes the drawer goes on moving the focus, its repeats not stopped on the menu button", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.down("Shift");
  await page.keyboard.down("Tab");
  await page.keyboard.up("Shift");
  await expect(page.locator("#settingsBtn")).toBeFocused();
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("#menuBtn")).toBeFocused();
  await page.keyboard.down("Tab");
  await expect(page.locator("#cv")).toBeFocused();
  await page.keyboard.up("Tab");
});

test("a key pressed on the menu button once it holds the focus repeats as on any button", async ({
  page,
}) => {
  await finding(page);
  await page.keyboard.press("Enter");
  await closed(page);
  await page.keyboard.down("Enter");
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.down("Enter");
  await closed(page);
  await page.keyboard.up("Enter");
});

test("a key held since before the page opened repeats on the menu button as on any button", async ({
  page,
}) => {
  await page.keyboard.down("Enter");
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").focus();
  await page.keyboard.down("Enter");
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.down("Enter");
  await closed(page);
  await page.keyboard.up("Enter");
});

test("in a browser that does not know :focus-visible a key's close hands no focus on, and nothing is logged", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await unmarking(page);
  await searching(page);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#settingsBtn")).toBeFocused();
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("body")).toBeFocused();
  expect(errors).toEqual([]);
});

test("a key that closes the drawer with nothing focused leaves the focus on the body", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).toBeFocused();
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("body")).toBeFocused();
});

test("a key that closes the drawer lets a focus a click left on a switch inside it fall to the body", async ({
  page,
}) => {
  await searching(page);
  await page.locator("#showOutlines").click();
  await expect(page.locator("#showOutlines")).toBeFocused();
  await page.keyboard.press("s");
  await closed(page);
  await expect(page.locator("body")).toBeFocused();
});

test("a click on the scrim closes the drawer and leaves the focus on the body, where the press put it", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.type("k");
  await still(page);
  const drawer = await page.locator("#sidebar").boundingBox();
  const beside = { x: (drawer.x + drawer.width + 375) / 2, y: drawer.height / 2 };
  await page.locator("#scrim").click({ position: beside });
  await closed(page);
  await expect(page.locator("body")).toBeFocused();
});

test("/ pressed on a control of the open drawer still lands the focus in the search box", async ({
  page,
}) => {
  await searching(page);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#settingsBtn")).toBeFocused();
  await page.keyboard.press("/");
  await expect(page.locator("#search")).toBeFocused();
});
