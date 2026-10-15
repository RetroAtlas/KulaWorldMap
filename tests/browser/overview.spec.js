import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const HOME = [17, 17, 17];
const ABOVE_HOME = [HOME[0], HOME[1], HOME[2] - 1];
const START = { cell: HOME, kind: 0, faces: { 0: { type: 30, facing: 3 } } };
const BONUS = "Plays as a bonus level since it has no key.";

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
const click = async (page, point) => page.mouse.click(point.x, point.y);
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const field = (page, name) => page.locator(`#detail [data-field="${name}"]`);
const selected = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const s = state.selected;
    return s && { cell: [s.x, s.y, s.z], face: s.face ?? null };
  });
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const lineHeight = (l) => l.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
/** Make these the draft's blocks in the store directly, as another tab's edit would. */
const fill = (page, blocks) =>
  page.evaluate(async (blocks) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, { ...get(id).doc, blocks });
  }, blocks);
/** Two errors and four warnings, on a level with no key. */
const SIX = [
  { cell: HOME, kind: 0, faces: { 0: { type: 9, variant: 0 }, 2: { type: 9, variant: 1 } } },
  { cell: [18, 17, 17], kind: 0, faces: { 0: { type: 42 } } },
  { cell: [20, 17, 17], kind: 3, faces: { 0: { type: 9, variant: 3 } } },
];
const vanishing = (n) =>
  Array.from({ length: n }, (_, i) => ({
    cell: [5 + (i % 26), 20 + Math.floor(i / 26), 17],
    kind: 7,
  }));

/** A new draft, editing on with the Select tool, and its block selected on its top. */
async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#tools")).toBeVisible();
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
    await page.keyboard.press("w");
  await expect(page.locator('#tools .tool[data-tool="place"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("i");
  await click(page, await top(page, HOME));
  await expect(page.locator("#detail .form")).toBeVisible();
}

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
    const { noteWith } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    noteWith(() => null);
  });
  expect(await chip.evaluate((e) => e.innerHTML)).toBe(before);

  await page.evaluate(async () => {
    const { noteWith } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
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

test("a shipped level's line and note are as they are with the editor loaded", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#MARS/12");
  await settle(page);
  const chip = page.locator("#chip");
  const before = await chip.evaluate((e) => e.innerHTML);
  await page.locator("#draftNew").click();
  await expect(page.locator("#chipNote .overview")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "#MARS/12";
  });
  await expect(page.locator("#chip b")).toHaveText("LEVEL 133");
  await expect(page.locator("#chipNote .overview")).toHaveCount(0);
  expect(await chip.evaluate((e) => e.innerHTML)).toBe(before);
  await page.reload();
  await settle(page);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 133");
  expect(await chip.evaluate((e) => e.innerHTML)).toBe(before);

  await page.evaluate(() => {
    location.hash = "#HIRO/0";
  });
  await expect(page.locator("#chip b")).toHaveText("LEVEL 1");
  await expect(chip.getByRole("button")).toHaveCount(0);
  await expect(page.locator("#chipNote")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a draft's note carries how it plays, its counts and the findings, each finding selecting its cell, is built again at every edit and folds", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const fold = page.locator("#chipBtn");
  const note = page.locator("#chipNote");
  await expect(fold).toBeVisible();
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(note.locator(".overview > *")).toHaveClass(["plays", "more"]);
  const more = note.locator(".more");
  expect(await more.evaluate((d) => d.open)).toBe(true);
  await expect(more.locator("summary")).toHaveText("no findings; the counts are below");
  await expect(note.locator(".plays")).toHaveText(BONUS);
  expect(await note.locator(".plays").getAttribute("title")).toBeNull();
  await expect(note.locator(".counts span")).toHaveText([
    "1 of 123 records",
    "6 of 768 faces",
    "1 of 256 blocks",
    "0 of 255 objects the loader numbers",
    "0 of 8 platforms",
    "0 of 64 vanishing blocks",
    "0 of 64 crumbling blocks",
    "0 of 32 captivators",
    "0 of 32 devices that cast a light",
    "0 of 64 moving spikes",
  ]);
  await expect(note.locator(".counts .zero")).toHaveCount(7);
  // a counter at nought is the chip's own text dimmed, the others at full strength
  await expect(note.locator(".counts .zero").first()).toHaveCSS("opacity", "0.7");
  await expect(note.locator(".counts span").first()).toHaveCSS("opacity", "1");
  await expect(note.locator(".counts span").first()).not.toHaveClass(/zero/);
  await expect(page.locator("#detail .plays, #detail .counts, #detail .findings")).toHaveCount(0);

  await field(page, "face-1").click();
  await field(page, "thing").selectOption("t31");
  await expect(note.locator(".plays")).toHaveText("Plays as an arcade level.");
  expect(await note.locator(".plays").getAttribute("title")).toBeNull();
  await expect(note.locator(".findings li")).toHaveText(["warning: a key and no exit"]);
  await expect(more.locator("summary")).toHaveText("1 warning; the counts are below");
  await field(page, "thing").selectOption("t42");
  const findings = note.locator(".findings li");
  await expect(findings).toHaveText([/^warning: the star is untested in play at /]);
  await expect(findings.first()).toHaveClass("warning");
  await expect(findings.first().locator(".there")).toHaveText("17, 17, 17");
  await expect(findings.first().locator(".there")).toHaveAccessibleName(
    "the star is untested in play at 17, 17, 17, +x side",
  );
  await expect(findings.first()).toContainText(", +x side");
  await field(page, "face-0").click();
  expect(await selected(page)).toEqual({ cell: HOME, face: 0 });
  await findings.first().locator(".there").click();
  expect(await selected(page)).toEqual({ cell: HOME, face: 1 });
  await expect(field(page, "face-1")).toHaveAttribute("aria-pressed", "true");

  await field(page, "thing").selectOption("");
  await field(page, "face-0").click();
  await field(page, "thing").selectOption("");
  await expect(more.locator("> summary, > .counts, > .findings")).toHaveCount(3);
  await expect(more.locator("summary")).toHaveText("1 error; the counts are below");
  await expect(note.locator(".findings li.error")).toHaveText(["error: no start"]);
  await expect(note.locator(".counts .zero").first()).toHaveText("0 of 123 records");
  await expect(note.locator(".counts span").nth(1)).toHaveText("6 of 768 faces");

  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  await fold.click();
  await expect(note.locator(".plays")).toBeVisible();

  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(note.locator(".findings li.error")).toHaveText(["error: no start"]);
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a counter reads amber past the most any level on the disc has and red past the game's room", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const counts = page.locator("#chipNote .counts");
  const findings = page.locator("#chipNote .findings li");
  await fill(page, [START, ...vanishing(15)]);
  await expect(counts.locator(".high")).toHaveText(["15 of 64 vanishing blocks"]);
  await expect(counts.locator(".over")).toHaveCount(0);
  await expect(
    findings.filter({ hasText: "warning: 15 vanishing blocks, more than any level on the disc" }),
  ).toHaveCount(1);
  await fill(page, [START, ...vanishing(65)]);
  await expect(counts.locator(".over")).toHaveText(["65 of 64 vanishing blocks"]);
  await expect(counts.locator(".high")).toHaveCount(0);
  await expect(findings.locator("..").locator("li.error")).toHaveText([
    "error: 65 vanishing blocks, over the 64 the game has room for",
  ]);
  expect(errors).toEqual([]);
});

test("without the face table the counts line leaves the faces and the blocks out", async ({
  page,
}) => {
  await page.route("**/objects.json", (route) => route.fulfill({ status: 404, body: "" }));
  await fresh(page);
  const counts = page.locator("#chipNote .counts");
  await expect(counts.locator("span")).toHaveText([
    "1 of 123 records",
    "0 of 255 objects the loader numbers",
    "0 of 8 platforms",
    "0 of 64 vanishing blocks",
    "0 of 64 crumbling blocks",
    "0 of 32 captivators",
    "0 of 32 devices that cast a light",
    "0 of 64 moving spikes",
  ]);
  await expect(
    page.locator("#chipNote .findings li", { hasText: "the face count could not be read" }),
  ).toHaveCount(1);
});

test("a finding's link that holds the focus keeps it through an edit", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-1").click();
  await field(page, "thing").selectOption("t42");
  await field(page, "face-2").click();
  await field(page, "thing").selectOption("t31");
  const findings = page.locator("#chipNote .findings li");
  await expect(findings).toHaveCount(2);
  const link = page.locator("#chipNote .there");
  await expect(link).toHaveCount(1);
  await link.focus();
  await page.keyboard.press("Enter");
  expect(await selected(page)).toEqual({ cell: HOME, face: 1 });
  await expect(link).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(findings).toHaveText([/^warning: the star is untested in play at /]);
  await expect(link).toBeFocused();
  await field(page, "face-0").click();
  expect(await selected(page)).toEqual({ cell: HOME, face: 0 });
  await link.focus();
  await page.keyboard.press("Enter");
  expect(await selected(page)).toEqual({ cell: HOME, face: 1 });
  await page.keyboard.press("Delete");
  await expect(findings).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  test("the counts and the findings fold under their tally until opened, so a draft's note stays short", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(EDIT);
    await settle(page);
    await page.keyboard.press("m");
    await page.locator("#draftNew").click();
    await expect(page.locator("#draftRows button")).toHaveCount(1);
    await page.keyboard.press("m");
    const note = page.locator("#chipNote");
    const more = note.locator(".more");
    const summary = more.locator("summary");
    const isOpen = () => more.evaluate((d) => d.open);
    await expect(note.locator(".plays")).toBeVisible();
    await expect(summary).toHaveText("no findings; the counts are below");
    expect(await isOpen()).toBe(false);
    await expect(note.locator(".counts")).toBeHidden();
    const fresh = await page.locator("#chip").boundingBox();

    await fill(page, SIX);
    await expect(summary).toHaveText("2 errors and 4 warnings; the counts are below");
    expect(await isOpen()).toBe(false);
    await expect(note.locator(".findings")).toBeHidden();
    await expect(note.locator(".plays")).toHaveText(BONUS);
    const chip = await page.locator("#chip").boundingBox();
    // the fold adds nothing but its one line, which a wide font may wrap once
    expect(chip.height - fresh.height).toBeGreaterThanOrEqual(0);
    expect(chip.height - fresh.height).toBeLessThanOrEqual(await lineHeight(summary));
    expect(chip.height).toBeLessThan(700 / 3);
    expect(chip.y + chip.height).toBeLessThan((await top(page, ABOVE_HOME)).y);
    expect(chip.x + chip.width).toBe(375 - 10);
    expect(await lineHeight(note.locator(".overview"))).toBeLessThan(
      await lineHeight(page.locator("#chip")),
    );

    const fold = page.locator("#chipBtn");
    await fold.click();
    await expect(note).toBeHidden();
    await fold.click();
    await expect(note.locator(".plays")).toBeVisible();
    expect(await isOpen()).toBe(false);

    await summary.click();
    expect(await isOpen()).toBe(true);
    await expect(note.locator(".findings li")).toHaveCount(6);
    await expect(note.locator(".findings li.error")).toHaveCount(2);
    await expect(note.locator(".counts")).toBeVisible();
    await fill(page, [...SIX, { cell: [21, 17, 17], kind: 0, faces: { 0: { type: 42 } } }]);
    await expect(summary).toHaveText("2 errors and 5 warnings; the counts are below");
    expect(await isOpen()).toBe(true);
    await summary.click();
    expect(await isOpen()).toBe(false);
    await fill(page, SIX);
    await expect(summary).toHaveText("2 errors and 4 warnings; the counts are below");
    expect(await isOpen()).toBe(false);

    // the fold stays as it was last left from draft to draft
    await summary.click();
    expect(await isOpen()).toBe(true);
    await page.keyboard.press("m");
    await page.locator("#draftNew").click();
    await expect(page.locator("#draftRows button")).toHaveCount(2);
    await page.keyboard.press("m");
    await expect(summary).toHaveText("no findings; the counts are below");
    expect(await isOpen()).toBe(true);
    await expect(note.locator(".counts")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
