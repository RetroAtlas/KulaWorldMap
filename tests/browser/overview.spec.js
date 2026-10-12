import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

test("a registered note stands in for the level's own where it answers, and leaves it where it does not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#MARS/12");
  await settle(page);
  const chip = page.locator("#chip");
  const note = page.locator("#chipNote");
  const fold = page.locator("#chipBtn");
  await expect(note).toContainText("Japanese release");
  const before = await chip.evaluate((e) => e.innerHTML);
  await page.evaluate(async () => {
    const { noteWith } = await import(new URL("js/navigate.js", location.href).href);
    noteWith(() => null);
  });
  expect(await chip.evaluate((e) => e.innerHTML)).toBe(before);

  await page.evaluate(async () => {
    const { noteWith } = await import(new URL("js/navigate.js", location.href).href);
    noteWith((l) => {
      if (l.index !== 12) return null;
      const p = document.createElement("p");
      p.className = "given";
      p.textContent = `Given ${l.name}`;
      return p;
    });
  });
  await expect(note.locator(".given")).toHaveText(/^Given /);
  await expect(note).not.toContainText("Japanese release");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await fold.click();
  await expect(note).toBeHidden();
  await fold.click();
  await expect(note.locator(".given")).toBeVisible();

  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 134");
  await expect(note.locator(".given")).toHaveCount(0);
  await expect(note).not.toBeEmpty();
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 135");
  await expect(fold).toBeHidden();
  await expect(note).toBeHidden();
  await page.keyboard.press("[");
  await page.keyboard.press("[");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 133");
  await expect(note.locator(".given")).toHaveText(/^Given /);
  expect(errors).toEqual([]);
});
