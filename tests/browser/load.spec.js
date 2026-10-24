import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, EDITOR_FILES, KEPT, KEY, shown, toasts } from "./drafthelpers.js";

const ELSEWHERE =
  "That link names a level kept in another browser. Open it there, or ask for the level file.";

test("a plain visit shows the section and fetches none of the editor, which w then loads", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await expect(page.locator("#yours")).toBeVisible();
  await expect(page.locator("#draftEmpty")).toBeVisible();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#makeBtn")).toHaveCount(0);
  // the picker offers every kind of file the reader takes
  await expect(page.locator("#draftFile")).toHaveAttribute(
    "accept",
    ".json,.kwl,.pak,.bin,.img,.iso",
  );
  expect(requested).toContain("/js/main.js");
  expect(fetched()).toEqual([]);

  await page.keyboard.press("w");
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  const out = await shown(page);
  expect(out.li).toBe(-1);
  expect(out.chip).toContain("LEVEL 1");
  expect(fetched()).toContain("/js/editor/editor.js");
  expect(fetched()).toContain("/js/format/project.js");
  expect(errors).toEqual([]);
});

test("a link to a draft this browser holds loads the editor before the level shows, and a held draft loads it at the start", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page between the loads has no storage */
    }
  }, KEY);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  const linked = await shown(page);
  expect(linked).toMatchObject({ li: -1, draft: 1, theme: "INCA", time: 60 });
  expect(linked.chip).toContain("Kept");
  expect(requested).toContain("/js/editor/editor.js");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "true");

  requested.length = 0;
  await page.goto("about:blank");
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button .name")).toHaveText("Kept");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "false");
  await expect(page.locator("#draftEmpty")).toBeHidden();
  expect(requested).toContain("/js/editor/editor.js");
  expect(errors).toEqual([]);
});

test("a link to a draft arriving after a plain visit loads the editor where this browser holds it, and says where it is otherwise", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const go = (hash) =>
    page.evaluate((hash) => {
      location.hash = hash;
    }, hash);
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  await go("#DRAFT/5/45,35/fit/33");
  await expect(page.locator("#toastStack .toast")).toHaveText([ELSEWHERE]);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#HIRO\/0\//);
  expect((await shown(page)).li).toBe(0);
  expect(fetched()).toEqual([]);
  // another tab's level, kept while this page was up, so no storage event announced it
  await page.evaluate(
    ([key, store]) => localStorage.setItem(key, JSON.stringify(store)),
    [KEY, KEPT],
  );
  await go("#DRAFT/1/45,35/fit/33");
  await expect(page.locator("#chipLine b")).toHaveText("Kept");
  expect(await shown(page)).toMatchObject({ li: -1, draft: 1, theme: "INCA", time: 60 });
  expect(fetched()).toContain("/js/editor/editor.js");
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/1\//);
  await go("#DRAFT/7/45,35/fit/33");
  await expect(page.locator("#toastStack .toast", { hasText: ELSEWHERE })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/1\//);
  expect((await shown(page)).draft).toBe(1);
  expect(errors).toEqual([]);
});

test("a link to a draft this browser does not hold fetches none of the editor at the start, and says where the level is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto("/#DRAFT/5/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([ELSEWHERE]);
  expect(requested.filter((p) => EDITOR_FILES.test(p))).toEqual([]);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#HIRO\/0\//);
  await expect(page.locator("#yours")).toBeVisible();
  await expect(page.locator("#draftEmpty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("two presses of w before the editor has loaded end with editing on", async ({ page }) => {
  const errors = trackErrors(page);
  await page.route("**/js/editor/editor.js", async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.continue();
  });
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("w");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  expect((await shown(page)).li).toBe(-1);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("a visitor whose editor cannot be loaded still gets the map, and is told", async ({
  page,
}) => {
  const UNLOADED = "The editor could not be loaded; reload the page to try again.";
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page has no storage */
    }
  }, KEY);
  await page.route("**/js/editor/editor.js", (route) => route.abort());
  await page.clock.install();
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([UNLOADED]);
  await page.keyboard.press("]");
  expect((await shown(page)).li).toBe(1);
  await expect(page.locator("#chipLine b")).toHaveText("LEVEL 2");
  // the editor's key still asks for it, and says so again
  await page.clock.runFor(3000 + 150);
  await expect(page.locator("#toastStack .toast")).toHaveCount(0);
  await page.keyboard.press("w");
  await expect(page.locator("#toastStack .toast")).toHaveText([UNLOADED]);
  expect((await shown(page)).li).toBe(1);
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

test("an editor whose boot throws leaves the map and its controls, which say so and do not try it again", async ({
  page,
}) => {
  const UNLOADED = "The editor could not be loaded; reload the page to try again.";
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const store = {
      version: 1,
      next: 2,
      drafts: {
        1: {
          doc: {
            format: "kula-world-level",
            version: 1,
            title: "Kept",
            world: "INCA",
            time: 60,
            blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
          },
          updated: 1,
          saved: null,
          edits: 0,
        },
      },
    };
    try {
      localStorage.setItem(key, JSON.stringify(store));
    } catch {
      /* the blank page has no storage */
    }
  }, KEY);
  await page.route("**/js/editor/editor.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: [
        "export function bootEditor() {",
        "  window.__boots = (window.__boots ?? 0) + 1;",
        "  throw new Error('boot');",
        "}",
        "export function toggleEditing() { window.__toggled = true; }",
      ].join("\n"),
    }),
  );
  await page.clock.install();
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  expect(await toasts(page)).toEqual([UNLOADED]);
  expect(await page.evaluate(() => window.__boots)).toBe(1);
  // each control says so again, once the last toast has gone, and none runs the boot again or does what it does
  for (const control of [() => page.keyboard.press("w"), () => page.locator("#draftNew").click()]) {
    await page.clock.runFor(3000 + 150);
    await expect(page.locator("#toastStack .toast")).toHaveCount(0);
    await control();
    await expect(page.locator("#toastStack .toast")).toHaveText([UNLOADED]);
  }
  expect(await page.evaluate(() => window.__boots)).toBe(1);
  expect(await page.evaluate(() => window.__toggled ?? false)).toBe(false);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(errors).toEqual([]);
});
