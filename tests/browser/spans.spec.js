import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const START = [17, 17, 17];
const WAITING = "The run waits for its far end. Click where it ends, or press Esc.";
const WAITING_TOUCH = "The run waits for its far end. Tap where it ends, or change the tool.";

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const s = state.selected;
    return {
      selected: s && [s.x, s.y, s.z],
      rails: state.idx.railCells.size,
      beams: state.idx.beamCells.size,
      editing: document.getElementById("editBtn").getAttribute("aria-pressed") === "true",
    };
  });
const doc = (page) =>
  page.evaluate(async () => {
    const [{ state }, { get }] = await Promise.all(
      ["state.js", "drafts.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return get(state.lvl.draft).doc;
  });
const spans = async (page) => (await doc(page)).blocks.filter((b) => b.kind === 5 || b.kind === 8);
const steps = (page) =>
  page.evaluate(async () => {
    const [{ state }, { steps }] = await Promise.all(
      ["state.js", "trail.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return steps(state.lvl.draft);
  });
const preview = (page) =>
  page.evaluate(async () => {
    const { runPreview } = await import(new URL("js/editor.js", location.href).href);
    return runPreview();
  });
const at = (page, x, y, z) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/state.js", location.href).href);
      const r = document.getElementById("cv").getBoundingClientRect();
      const [px, py] = screen(x, y, z);
      return { x: r.left + px, y: r.top + py };
    },
    [x, y, z],
  );
const click = async (page, point) => {
  await page.mouse.click(point.x, point.y);
};
const hover = async (page, point) => {
  await page.mouse.move(point.x, point.y);
};
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
const plusY = (page, c) => at(page, c[0] + 0.5, c[1] + 1, c[2] + 0.5);
// a point of the floor the grid draws, one layer under the lowest block
const floor = (page, x, y) => at(page, x + 0.5, y + 0.5, 18);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const tab = (page, name) => page.locator("#palette .tabs button", { hasText: name });
const row = (page, id) => page.locator(`#palette .rows button[data-id="${id}"]`);
const pressedRow = (page) => page.locator('#palette .rows button[aria-pressed="true"]');
const pick = async (page, group, id) => {
  await tab(page, group).click();
  await row(page, id).click();
  await expect(row(page, id)).toHaveAttribute("aria-pressed", "true");
};
const lay = (page, cell, kind) =>
  page.evaluate(
    async ([cell, kind]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock }] = await Promise.all(
        ["state.js", "drafts.js", "project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, setBlock(get(id).doc, cell, { kind }));
    },
    [cell, kind],
  );

/** A fresh draft, editing, zoomed out with the grid on, so that runs across the floor stay on the canvas. */
async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.keyboard.press("w");
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("g");
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { invalidatePick, draw } = await import(new URL("js/render.js", location.href).href);
    state.cam.zoom = 0.8;
    state.framing = null;
    invalidatePick();
    draw();
  });
}

/** Change one key of the block at `cell` straight through the store. */
const amend = (page, cell, change) =>
  page.evaluate(
    async ([cell, change]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { blockAt, setBlock }] = await Promise.all(
        ["state.js", "drafts.js", "project.js"].map(at),
      );
      const id = state.lvl.draft;
      const doc = get(id).doc;
      update(id, setBlock(doc, cell, { ...blockAt(doc, cell), ...change }));
    },
    [cell, change],
  );

const PLATFORM = { cell: [18, 17, 17], kind: 5, far: [18, 21, 17], length: 2, speed: 30 };

/** Lay the platform of PLATFORM in two clicks, from the start's +x side down the floor. */
async function layPlatform(page) {
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await click(page, await floor(page, 18, 21));
}

test("the palette offers the moving platform and a laser of each colour", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await tab(page, "Blocks").click();
  const rows = await page
    .locator("#palette .rows button")
    .evaluateAll((bs) =>
      bs.map((b) => [
        b.dataset.id,
        b.querySelector("span:not(.dot)").textContent,
        !!b.querySelector("canvas.icon"),
      ]),
    );
  const names = await page.evaluate(async () => {
    const { kindName } = await import(new URL("js/data.js", location.href).href);
    return [kindName(5), kindName(8)];
  });
  expect(rows.find(([id]) => id === "k5")).toEqual(["k5", names[0], true]);
  expect(
    rows.filter(([id]) => id.startsWith("k8/")).map(([id, label, icon]) => [id, label, icon]),
  ).toEqual([
    ["k8/0", `${names[1]} (yellow)`, true],
    ["k8/1", `${names[1]} (blue)`, true],
    ["k8/2", `${names[1]} (green)`, true],
    ["k8/3", `${names[1]} (red)`, true],
  ]);
  expect(errors).toEqual([]);
});

test("a platform is laid in two clicks, drawn along its run, and undone in one step", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await expect(page.locator("#say")).toHaveText(WAITING);
  expect(await preview(page)).toMatchObject({ anchor: [18, 17, 17], far: null });
  expect(await spans(page)).toEqual([]);
  await click(page, await floor(page, 18, 21));
  expect(await spans(page)).toEqual([PLATFORM]);
  await expect(page.locator("#say")).toHaveText(
    "Laid a moving platform from 18, 17, 17 to 18, 21, 17",
  );
  await expect(page.locator("#toolStatus")).toHaveText("");
  const laid = await shown(page);
  expect(laid.selected).toEqual([18, 17, 17]);
  expect(laid.rails).toBe(5);
  expect(await preview(page)).toBe(null);
  await page.keyboard.press("Control+z");
  expect(await spans(page)).toEqual([]);
  expect((await shown(page)).rails).toBe(0);
  await expect(page.locator("#say")).toHaveText(
    "Undid laid a moving platform from 18, 17, 17 to 18, 21, 17",
  );
  expect(errors).toEqual([]);
});

test("a laser of a chosen colour is laid along x, its beam indexed, and Alt-click takes its colour", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k8/2");
  await click(page, await plusY(page, START));
  await click(page, await floor(page, 22, 18));
  expect(await spans(page)).toEqual([
    { cell: [17, 18, 17], kind: 8, far: [22, 18, 17], colour: 2 },
  ]);
  await expect(page.locator("#say")).toHaveText("Laid a green laser from 17, 18, 17 to 22, 18, 17");
  expect((await shown(page)).beams).toBe(4);
  await pick(page, "Blocks", "k0");
  await page.keyboard.down("Alt");
  await click(page, await top(page, [17, 18, 17]));
  await page.keyboard.up("Alt");
  await expect(pressedRow(page)).toHaveAttribute("data-id", "k8/2");
  expect(errors).toEqual([]);
});

test("a run of one cell, and a run across a block, are refused before anything is written", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await click(page, await floor(page, 18, 17));
  expect(await toasts(page)).toContain("A run needs two cells.");
  await expect(page.locator("#toolStatus")).toHaveText("A run needs two cells.");
  expect(await spans(page)).toEqual([]);
  expect(await preview(page)).not.toBe(null);

  await lay(page, [18, 19, 17], 0);
  await hover(page, await top(page, [18, 19, 17]));
  expect(await preview(page)).toMatchObject({
    anchor: [18, 17, 17],
    far: [18, 19, 17],
    blocked: true,
  });
  await click(page, await top(page, [18, 19, 17]));
  expect(await toasts(page)).toContain("The platform's run crosses the block at 18,19,17.");
  expect(await spans(page)).toEqual([]);
  expect(await preview(page)).not.toBe(null);
  expect(errors).toEqual([]);
});

test("the preview follows the axis the pointer favours, and Esc cancels the run alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await lay(page, [19, 20, 17], 0);
  await page.keyboard.press("i");
  await click(page, await top(page, START));
  expect((await shown(page)).selected).toEqual(START);
  await page.keyboard.press("a");
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await hover(page, await top(page, [19, 20, 17]));
  const run = await preview(page);
  expect(run.far).toEqual([18, 20, 17]);
  expect(run.cells).toEqual([
    [18, 17, 17],
    [18, 18, 17],
    [18, 19, 17],
    [18, 20, 17],
    [18, 21, 17],
  ]);
  expect(run.blocked).toBe(false);
  await page.keyboard.press("Escape");
  expect(await preview(page)).toBe(null);
  await expect(page.locator("#toolStatus")).toHaveText("");
  expect((await shown(page)).selected).toEqual(START);
  await page.keyboard.press("Escape");
  expect((await shown(page)).selected).toBe(null);
  expect((await shown(page)).editing).toBe(true);
  expect(await spans(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the preview tints each cell of the run by what lies in it", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["state.js", "drafts.js", "project.js"].map(at),
    );
    const id = state.lvl.draft;
    let doc = setBlock(get(id).doc, [18, 19, 17], { kind: 0 });
    doc = setBlock(doc, [15, 21, 17], { kind: 8, far: [21, 21, 17], colour: 1 });
    doc = setBlock(doc, [18, 24, 17], { kind: 5, far: [18, 26, 17], length: 2, speed: 30 });
    doc = setBlock(doc, [17, 20, 17], { kind: 0 });
    update(id, doc);
  });
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await hover(page, await floor(page, 18, 27));
  const run = await preview(page);
  expect(run.far).toEqual([18, 27, 17]);
  expect(run.cells.map((c) => c[1])).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]);
  // a block and another platform's own block bar the run, a beam and that platform's run cross it
  expect(run.verdicts).toEqual([
    "free",
    "free",
    "blocked",
    "free",
    "beam",
    "free",
    "free",
    "blocked",
    "run",
    "run",
    "run",
    "free",
  ]);
  expect(run.blocked).toBe(true);
  // a laser ends on a plain block, and that end is its own
  await page.keyboard.press("Escape");
  await pick(page, "Blocks", "k8/0");
  await click(page, await plusY(page, START));
  await hover(page, await top(page, [17, 20, 17]));
  const beam = await preview(page);
  expect(beam.far).toEqual([17, 20, 17]);
  expect(beam.verdicts).toEqual(["free", "free", "free"]);
  expect(beam.blocked).toBe(false);
  expect(errors).toEqual([]);
});

test("the grid's height hint waits while a run does", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 17);
  });
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await hover(page, await floor(page, 18, 21));
  expect(await preview(page)).toMatchObject({ far: [18, 21, 17], blocked: false });
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await page.keyboard.press("Escape");
  await expect(page.locator("#toolStatus")).toHaveText("");
  await hover(page, await floor(page, 18, 22));
  await expect(page.locator("#toolStatus")).toHaveText(
    "The grid stands at the slice while it is lowered: , lowers the floor it lays and . raises it.",
  );
  expect(errors).toEqual([]);
});

test("the preview follows the grid's cell under the pointer where no block is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await hover(page, await floor(page, 18, 21));
  expect(await preview(page)).toMatchObject({
    anchor: [18, 17, 17],
    far: [18, 21, 17],
    blocked: false,
  });
  expect((await preview(page)).cells).toHaveLength(6);
  // past the grid's edge there is nothing to run to
  await hover(page, await floor(page, 18, 35));
  expect(await preview(page)).toMatchObject({ far: null, cells: [] });
  await hover(page, await floor(page, 18, 21));
  await click(page, await floor(page, 18, 21));
  expect(await spans(page)).toEqual([PLATFORM]);
  expect(errors).toEqual([]);
});

test("Erase takes a run whole, nothing stands on its faces, and a brush on its block re-lays it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("v");
  await layPlatform(page);
  expect(await spans(page)).toEqual([PLATFORM]);

  await pick(page, "Pickups", "t31");
  await click(page, await top(page, [18, 17, 17]));
  expect(await toasts(page)).toContain(
    "Nothing stands on a platform's, laser's, crumbling or vanishing block's faces.",
  );
  expect(await spans(page)).toEqual([PLATFORM]);

  await pick(page, "Blocks", "k5");
  const before = await steps(page);
  await click(page, await top(page, [18, 17, 17]));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await click(page, await floor(page, 18, 23));
  expect(await spans(page)).toEqual([{ ...PLATFORM, far: [18, 23, 17] }]);
  await expect(page.locator("#say")).toHaveText("Moved the moving platform's run to 18, 23, 17");
  expect((await steps(page)).past).toBe(before.past + 1);

  await page.keyboard.press("z");
  await click(page, await top(page, [18, 18, 17]));
  expect(await spans(page)).toEqual([]);
  await expect(page.locator("#say")).toHaveText("Removed the moving platform at 18, 17, 17");
  expect((await shown(page)).rails).toBe(0);
  expect(errors).toEqual([]);
});

test("the second click reads the run's own block afresh, so a change made while it waited stands", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("v");
  await layPlatform(page);
  await pick(page, "Blocks", "k5");
  await click(page, await top(page, [18, 17, 17]));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await amend(page, [18, 17, 17], { length: 3 });
  await click(page, await floor(page, 18, 23));
  expect(await spans(page)).toEqual([{ ...PLATFORM, far: [18, 23, 17], length: 3 }]);
  await expect(page.locator("#say")).toHaveText("Moved the moving platform's run to 18, 23, 17");
  expect(errors).toEqual([]);
});

test("a run whose first cell was filled while it waited is dropped at the second click", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await lay(page, [18, 17, 17], 0);
  await click(page, await floor(page, 18, 21));
  expect(await toasts(page)).toContain("That cell holds a block already.");
  expect(await preview(page)).toBe(null);
  await expect(page.locator("#toolStatus")).toHaveText("That cell holds a block already.");
  expect(await spans(page)).toEqual([]);
  expect((await doc(page)).blocks.map((b) => [b.cell, b.kind])).toEqual([
    [START, 0],
    [[18, 17, 17], 0],
  ]);
  expect(errors).toEqual([]);
});

test("a run re-laying a block that changed while it waited is dropped at the second click", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("v");
  await layPlatform(page);
  await click(page, await top(page, [18, 17, 17]));
  await expect(page.locator("#toolStatus")).toHaveText(WAITING);
  await lay(page, [18, 17, 17], 0);
  await click(page, await floor(page, 18, 23));
  expect(await toasts(page)).toContain("The run's own block changed while it waited.");
  expect(await preview(page)).toBe(null);
  expect(await spans(page)).toEqual([]);
  expect((await doc(page)).blocks.map((b) => [b.cell, b.kind])).toEqual([
    [START, 0],
    [[18, 17, 17], 0],
  ]);
  expect(errors).toEqual([]);
});

test("the preview's verdict is read again once the document changes under it", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await lay(page, [19, 20, 17], 0);
  await pick(page, "Blocks", "k5");
  await click(page, await plusX(page, START));
  const over = await top(page, [19, 20, 17]);
  await hover(page, over);
  expect(await preview(page)).toMatchObject({ far: [18, 20, 17], blocked: false });
  await lay(page, [18, 19, 17], 0);
  await hover(page, over);
  expect(await preview(page)).toMatchObject({ far: [18, 20, 17], blocked: true });
  expect(errors).toEqual([]);
});

test("Erase on a laser's far end keeps the level's last block as it keeps any other", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k8/2");
  await click(page, await plusY(page, START));
  await click(page, await floor(page, 22, 18));
  expect(await spans(page)).toHaveLength(1);
  await page.keyboard.press("z");
  await click(page, await top(page, START));
  await click(page, await top(page, START));
  expect((await doc(page)).blocks.map((b) => b.cell)).toEqual([[17, 18, 17]]);
  await click(page, await top(page, [22, 18, 17]));
  expect(await toasts(page)).toContain("A level keeps its last block.");
  expect((await doc(page)).blocks.map((b) => b.cell)).toEqual([[17, 18, 17]]);
  // with another block standing, the far end takes the laser whole
  await lay(page, [20, 25, 17], 0);
  await click(page, await top(page, [22, 18, 17]));
  await expect(page.locator("#say")).toHaveText("Removed the green laser at 17, 18, 17");
  expect((await doc(page)).blocks.map((b) => b.cell)).toEqual([[20, 25, 17]]);
  expect(errors).toEqual([]);
});

test.describe("with a finger", () => {
  test.use({ hasTouch: true });
  const tap = (page, point) => page.touchscreen.tap(point.x, point.y);

  test("the waiting run tells a finger to tap, and two taps end it", async ({ page }) => {
    const errors = trackErrors(page);
    await fresh(page);
    await pick(page, "Blocks", "k5");
    const side = await plusX(page, START);
    await tap(page, side);
    await expect(page.locator("#toolStatus")).toHaveText(
      "Tap again to place a moving platform on the +x side.",
    );
    await tap(page, side);
    await expect(page.locator("#toolStatus")).toHaveText(WAITING_TOUCH);
    await expect(page.locator("#say")).toHaveText(WAITING_TOUCH);
    const far = await floor(page, 18, 21);
    await tap(page, far);
    await expect(page.locator("#toolStatus")).toHaveText("Tap again to end the run here.");
    await tap(page, far);
    expect(await spans(page)).toEqual([PLATFORM]);
    await expect(page.locator("#toolStatus")).toHaveText("");
    expect(errors).toEqual([]);
  });
});
