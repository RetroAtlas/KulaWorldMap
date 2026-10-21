import { test, expect } from "@playwright/test";
import { settle, steps, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const s = state.selected;
    return {
      draft: state.lvl.draft,
      drawn: state.idx.cells.size,
      selected: s && [s.x, s.y, s.z],
      title: document.querySelector("#chipLine b").textContent,
    };
  });
const doc = (page) =>
  page.evaluate(async () => {
    const [{ state }, { get }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js"].map(
        (p) => import(new URL(`js/${p}`, location.href).href),
      ),
    );
    return get(state.lvl.draft).doc;
  });
const cells = async (page) => (await doc(page)).blocks.map((b) => b.cell);
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
const click = async (page, point) => {
  await page.mouse.click(point.x, point.y);
};
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const tool = (page, name) => page.locator(`#tools .tool[data-tool="${name}"]`);
const START = [17, 17, 17];

async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
    await page.keyboard.press("w");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
}

test("two placements undo and redo step by step, and a new step lets the redo go", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const undoBtn = page.locator("#undoBtn");
  const redoBtn = page.locator("#redoBtn");
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();

  await click(page, await plusX(page, START));
  await click(page, await plusX(page, [18, 17, 17]));
  expect(await cells(page)).toEqual([START, [18, 17, 17], [19, 17, 17]]);
  expect((await shown(page)).selected).toEqual([19, 17, 17]);
  await expect(undoBtn).toBeEnabled();
  await expect(redoBtn).toBeDisabled();

  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START, [18, 17, 17]]);
  const once = await shown(page);
  expect(once.drawn).toBe(2);
  expect(once.selected).toBe(null);
  await expect(page.locator("#say")).toHaveText("Undid placed a block at 19, 17, 17");
  await expect(redoBtn).toBeEnabled();

  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START]);
  expect((await shown(page)).drawn).toBe(1);
  await expect(undoBtn).toBeDisabled();
  await expect(page.locator("#say")).toHaveText("Undid placed a block at 18, 17, 17");

  await page.keyboard.press("Control+Shift+z");
  expect(await cells(page)).toEqual([START, [18, 17, 17]]);
  await expect(page.locator("#say")).toHaveText("Redid placed a block at 18, 17, 17");
  expect(await steps(page)).toEqual({ past: 1, future: 1 });

  await click(page, await plusX(page, [18, 17, 17]));
  expect(await steps(page)).toEqual({ past: 2, future: 0 });
  await expect(redoBtn).toBeDisabled();
  await page.keyboard.press("Control+y");
  expect(await cells(page)).toHaveLength(3);

  await undoBtn.click();
  expect(await cells(page)).toHaveLength(2);
  await page.keyboard.press("Control+y");
  expect(await cells(page)).toHaveLength(3);
  await expect(page.locator("#say")).toHaveText("Redid placed a block at 19, 17, 17");
  await expect(redoBtn).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a change that leaves the draft as it stands takes no step and counts no change", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const row = page.locator("#draftRows button .state");
  await click(page, await plusX(page, START));
  await expect(row).toHaveText("not saved to a file · 1 change");
  const took = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get }, { edit }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "editor/trail.js"].map(at),
    );
    const id = state.lvl.draft;
    return edit(id, structuredClone(get(id).doc), "changed nothing");
  });
  expect(took).toBe(false);
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await expect(row).toHaveText("not saved to a file · 1 change");

  // a time typed as the seconds the clock starts at already lands as nothing
  const time = page.locator("#draftTime");
  await time.fill("99.4");
  await time.blur();
  await expect(time).toHaveValue("99");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await expect(row).toHaveText("not saved to a file · 1 change");
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START]);
  await expect(page.locator("#say")).toHaveText("Undid placed a block at 18, 17, 17");
  expect(errors).toEqual([]);
});

test("a typed title is one step, undone from the map and left to the field inside it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const title = page.locator("#draftTitle");
  // the clock held still, so every keystroke falls within the moment that joins it to the last
  await page.evaluate(() => {
    const now = performance.now();
    performance.now = () => now;
  });
  await title.selectText();
  await title.pressSequentially("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });

  // inside the field the chord is the field's own, and the store mirrors the field
  await page.keyboard.press("Control+z");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await expect(page.locator("#say")).not.toHaveText(/^Undid/);
  expect((await doc(page)).title).toBe(await title.inputValue());
  await page.evaluate(() => {
    delete performance.now;
  });

  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue("Untitled level");
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  expect((await doc(page)).title).toBe("Untitled level");
  await expect(page.locator("#say")).toHaveText("Undid changed the title");
  await expect(page.locator("#draftRows button .name")).toHaveText("Untitled level");
  expect(errors).toEqual([]);
});

test("a pause of a second between letters starts a new title step", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(() => {
    let now = performance.now();
    performance.now = () => now;
    window.__advance = (ms) => {
      now += ms;
    };
  });
  const title = page.locator("#draftTitle");
  await title.selectText();
  await title.pressSequentially("Spi");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await page.evaluate(() => window.__advance(999));
  await title.pressSequentially("r");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await page.evaluate(() => window.__advance(1000));
  await title.pressSequentially("al");
  await expect(title).toHaveValue("Spiral");
  expect(await steps(page)).toEqual({ past: 2, future: 0 });
  await expect(page.locator("#draftRows button .state")).toHaveText(
    "not saved to a file · 2 changes",
  );
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue("Spir");
  await page.keyboard.press("Control+z");
  await expect(title).toHaveValue("Untitled level");
  expect(errors).toEqual([]);
});

test("letters typed and taken back within a second leave no step and count no change", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const row = page.locator("#draftRows button .state");
  await click(page, await plusX(page, START));
  await expect(row).toHaveText("not saved to a file · 1 change");
  await page.evaluate(() => {
    const now = performance.now();
    performance.now = () => now;
  });
  const title = page.locator("#draftTitle");
  await title.focus();
  await page.keyboard.press("End");
  await title.pressSequentially("xy");
  await expect(page.locator("#chipLine b")).toHaveText("Untitled levelxy");
  expect(await steps(page)).toEqual({ past: 2, future: 0 });
  await expect(row).toHaveText("not saved to a file · 2 changes");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await expect(row).toHaveText("not saved to a file · 1 change");
  await page.evaluate(() => {
    delete performance.now;
  });
  // the step before the letters is the one undo takes back
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START]);
  await expect(page.locator("#say")).toHaveText("Undid placed a block at 18, 17, 17");
  expect(errors).toEqual([]);
});

test("a title typed back to its start after an undo lets the step taken back go", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(() => {
    const now = performance.now();
    performance.now = () => now;
  });
  const title = page.locator("#draftTitle");
  await title.focus();
  await page.keyboard.press("End");
  await title.pressSequentially("x");
  await page.locator("#draftHidden").check();
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  expect((await doc(page)).hidden).toBe(false);
  expect(await steps(page)).toEqual({ past: 1, future: 1 });
  await expect(page.locator("#redoBtn")).toBeEnabled();

  // the letter taken back is a change, so the step undone before it goes
  await title.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(title).toHaveValue("Untitled level");
  expect(await steps(page)).toEqual({ past: 0, future: 0 });
  await expect(page.locator("#redoBtn")).toBeDisabled();
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+Shift+z");
  expect(await doc(page)).toMatchObject({ title: "Untitled level", hidden: false });
  await page.evaluate(() => {
    delete performance.now;
  });
  expect(errors).toEqual([]);
});

test("the row's count of changes follows undo and redo, counts a typed title once and never falls below nothing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const row = page.locator("#draftRows button .state");
  await click(page, await plusX(page, START));
  await click(page, await plusX(page, [18, 17, 17]));
  await expect(row).toHaveText("not saved to a file · 2 changes");
  await page.keyboard.press("Control+z");
  await expect(row).toHaveText("not saved to a file · 1 change");
  await page.keyboard.press("Control+z");
  await expect(row).toHaveText("not saved to a file");
  await page.keyboard.press("Control+Shift+z");
  await expect(row).toHaveText("not saved to a file · 1 change");

  await page.evaluate(() => {
    const now = performance.now();
    performance.now = () => now;
  });
  const title = page.locator("#draftTitle");
  await title.selectText();
  await title.pressSequentially("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await expect(row).toHaveText("not saved to a file · 2 changes");
  expect(await steps(page)).toEqual({ past: 2, future: 0 });
  await page.evaluate(() => {
    delete performance.now;
  });

  await Promise.all([page.waitForEvent("download"), page.locator("#draftSaveJson").click()]);
  await expect(row).toHaveText("saved to a file");
  await page.locator("#cv").focus();
  await page.keyboard.press("Control+z");
  await expect(page.locator("#say")).toHaveText("Undid changed the title");
  await expect(row).toHaveText("saved to a file");
  await page.keyboard.press("Control+Shift+z");
  await expect(row).toHaveText("saved to a file · 1 change since");
  expect(errors).toEqual([]);
});

test("Delete erases the selection's object, then its block, and keeps the last block", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await click(page, await plusX(page, START));
  await page.keyboard.press("i");
  await click(page, await top(page, START));
  expect((await shown(page)).selected).toEqual(START);

  await page.keyboard.press("Delete");
  await expect(page.locator("#say")).toHaveText("Removed the start from the top of 17, 17, 17");
  let d = await doc(page);
  expect(d.blocks.find((b) => b.cell.join() === START.join()).faces).toBeUndefined();
  expect((await shown(page)).selected).toEqual(START);

  await page.keyboard.press("Delete");
  await expect(page.locator("#say")).toHaveText("Removed the block at 17, 17, 17");
  expect(await cells(page)).toEqual([[18, 17, 17]]);
  expect((await shown(page)).selected).toBe(null);

  await click(page, await top(page, [18, 17, 17]));
  await page.keyboard.press("Backspace");
  expect(await toasts(page)).toContain("A level keeps its last block.");
  expect(await cells(page)).toEqual([[18, 17, 17]]);
  expect(await steps(page)).toEqual({ past: 3, future: 0 });
  expect(errors).toEqual([]);
});

test("the steps are this visit's alone", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await click(page, await plusX(page, START));
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await page.evaluate(async () =>
    (await import(new URL("js/editor/drafts.js", location.href).href)).flush(),
  );
  await page.reload();
  await settle(page);
  await page.keyboard.press("w");
  await expect(page.locator("#undoBtn")).toBeVisible();
  await expect(page.locator("#undoBtn")).toBeDisabled();
  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START, [18, 17, 17]]);
  expect(await steps(page)).toEqual({ past: 0, future: 0 });
  expect(errors).toEqual([]);
});

test("the trail keeps the last two hundred steps and lets the oldest go", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  const out = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get }, { edit, steps, undo }, { setMeta }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "editor/trail.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    for (let i = 0; i < 205; i++)
      edit(id, setMeta(get(id).doc, { title: `Step ${i}` }), "changed the title");
    const kept = steps(id).past;
    while (undo(id));
    return { kept, title: get(id).doc.title, left: steps(id) };
  });
  expect(out).toEqual({ kept: 200, title: "Step 4", left: { past: 0, future: 200 } });
  await expect(page.locator("#chipLine b")).toHaveText("Step 4");
  expect(errors).toEqual([]);
});

test("the editor's keys stand down while a dialog is open", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await click(page, await plusX(page, START));
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Control+z");
  expect(await cells(page)).toHaveLength(2);
  await page.keyboard.press("z");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Delete");
  expect(await cells(page)).toHaveLength(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual([START]);
  expect(errors).toEqual([]);
});
