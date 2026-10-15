import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const START = [17, 17, 17];
const COIN = { type: 37, variant: 0 };
const B = [19, 17, 17];
const C = [20, 17, 17];
const D = [21, 17, 17];
const PLATFORM = { cell: [19, 20, 17], kind: 5, far: [21, 20, 17], length: 2, speed: 30 };
const SIDE = 34; // a block's side on the screen at zoom 1
const HELD = "That cell holds a block already.";
const LAST = "A level keeps its last block.";
const selected = (n) =>
  `${n} block${n === 1 ? "" : "s"} selected. Drag ${n === 1 ? "it" : "them"} to move, Shift-drag to lift, Delete to erase, Esc to clear.`;

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
const middle = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2] + 0.5);
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
/** Whether a page point lies on the bare map, over no cell and under no panel. */
const clear = (page, p) =>
  page.evaluate(
    async ([x, y]) => {
      const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      const cv = document.getElementById("cv");
      const r = cv.getBoundingClientRect();
      return document.elementFromPoint(x, y) === cv && cellAt(x - r.left, y - r.top) === null;
    },
    [p.x, p.y],
  );
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
const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const s = state.selected;
    return {
      selected: s && [s.x, s.y, s.z],
      face: s ? (s.face ?? null) : null,
      yaw: state.cam.yaw,
    };
  });
/** Where the set in hand would land, and which of its ghosts are red. */
const move = (page) =>
  page.evaluate(async () => {
    const { movePreview } = await import(new URL("js/editor/editor.js", location.href).href);
    return movePreview();
  });
/** A cell's height on the screen at the view in hand. */
const cellHeight = (page) =>
  page.evaluate(async () => {
    const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
    return screen(0, 0, 1)[1] - screen(0, 0, 0)[1];
  });
/** Hold the view at a yaw and a zoom. */
const view = (page, yaw, zoom) =>
  page.evaluate(
    async ([yaw, zoom]) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const { invalidatePick, draw } = await import(
        new URL("js/viewer/draw/render.js", location.href).href
      );
      state.cam.yaw = yaw;
      state.cam.zoom = zoom;
      state.framing = null;
      invalidatePick();
      draw();
    },
    [yaw, zoom],
  );
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const status = (page) => page.locator("#toolStatus");
const said = (page) => page.locator("#say");
const tool = (page, name) => page.locator(`#tools .tool[data-tool="${name}"]`);
const click = async (page, point) => {
  await page.mouse.click(point.x, point.y);
};

/** Press at `from` and carry the pointer to `to`, the button still down. */
const press = async (page, from, to, { shift = false } = {}) => {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.mouse.move(to.x, to.y, { steps: 4 });
};

const drag = async (page, from, to, { shift = false } = {}) => {
  await press(page, from, to, { shift });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
};

/** The drag of a rectangle round the middles of `cells`, begun from whichever of its corners lies on no block. */
async function rectangle(page, cells) {
  const points = await Promise.all(cells.map((c) => middle(page, c)));
  const x0 = Math.min(...points.map((p) => p.x)) - 0.6 * SIDE;
  const x1 = Math.max(...points.map((p) => p.x)) + 0.6 * SIDE;
  const y0 = Math.min(...points.map((p) => p.y)) - 1.1 * SIDE;
  const y1 = Math.max(...points.map((p) => p.y)) + 0.9 * SIDE;
  const corners = [
    [x0, y0, x1, y1],
    [x1, y1, x0, y0],
    [x0, y1, x1, y0],
    [x1, y0, x0, y1],
  ];
  for (const [fx, fy, tx, ty] of corners) {
    if (!(await clear(page, { x: fx, y: fy }))) continue;
    return { from: { x: fx, y: fy }, to: { x: tx, y: ty } };
  }
  throw new Error("no empty corner to begin the rectangle from");
}

async function marquee(page, cells) {
  const { from, to } = await rectangle(page, cells);
  await drag(page, from, to);
}

/** A rectangle on the floor below the level, round nothing. */
async function marqueeOnNothing(page) {
  const b = await middle(page, B);
  const from = { x: b.x, y: b.y + 4 * SIDE };
  expect(await clear(page, from)).toBe(true);
  await drag(page, from, { x: from.x + SIDE, y: from.y + SIDE });
}

/** A fresh draft of a few blocks and a platform, held still at yaw 0, with Select the tool. */
async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#tools")).toBeVisible();
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
    await page.keyboard.press("w");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    async ([B, C, D, P, COIN]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      const id = state.lvl.draft;
      let doc = get(id).doc;
      doc = setBlock(doc, B, { kind: 0, faces: { 0: COIN } });
      doc = setBlock(doc, C, { kind: 2 });
      doc = setBlock(doc, D, { kind: 0 });
      doc = setBlock(doc, P.cell, P);
      update(id, doc);
    },
    [B, C, D, PLATFORM, COIN],
  );
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await view(page, 0, 1);
  await page.keyboard.press("i");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText("");
}

test("a rectangle from empty space selects the blocks in it, spans whole, and a drag on one of them moves the set", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await cells(page);
  expect(before).toEqual([START, B, PLATFORM.cell, C, D]);

  await click(page, await top(page, B));
  expect((await shown(page)).selected).toEqual(B);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await expect(said(page)).toHaveText(selected(2));
  expect((await shown(page)).selected).toEqual(B);
  expect(await cells(page)).toEqual(before);

  await drag(page, await top(page, B), await top(page, [B[0], B[1] + 2, B[2]]));
  const moved = await doc(page);
  expect(moved.blocks.map((b) => b.cell)).toEqual([
    START,
    [19, 19, 17],
    PLATFORM.cell,
    [20, 19, 17],
    D,
  ]);
  expect(moved.blocks[1]).toEqual({ cell: [19, 19, 17], kind: 0, faces: { 0: COIN } });
  expect(moved.blocks[3]).toEqual({ cell: [20, 19, 17], kind: 2 });
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 2, 0");
  await expect(status(page)).toHaveText(selected(2));
  expect((await shown(page)).selected).toEqual([19, 19, 17]);

  await page.keyboard.press("Control+z");
  expect(await cells(page)).toEqual(before);
  await expect(said(page)).toHaveText("Undid moved 2 blocks by 0, 2, 0");
  await expect(status(page)).toHaveText("");

  await marquee(page, [[22, 20, 17]]);
  await expect(status(page)).toHaveText(selected(1));
  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 1 block by 0, 1, 0");
  const span = (await doc(page)).blocks.find((b) => b.kind === 5);
  expect(span).toEqual({ ...PLATFORM, cell: [19, 21, 17], far: [21, 21, 17] });
  expect(errors).toEqual([]);
});

test("the keys move, lift and erase a set, and a blocked move is refused and changes nothing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));

  // at yaw 0 the screen's right is +x, where the block beside the ice block stands
  await page.keyboard.press("Shift+ArrowRight");
  expect(await toasts(page)).toEqual([HELD]);
  await expect(status(page)).toHaveText(HELD);
  expect(await cells(page)).toEqual([START, B, PLATFORM.cell, C, D]);
  expect((await shown(page)).yaw).toBe(0);

  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("Shift+PageUp");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 0, -1");
  expect(await cells(page)).toEqual([START, [19, 18, 16], PLATFORM.cell, [20, 18, 16], D]);

  const h = await cellHeight(page);
  const from = await top(page, [19, 18, 16]);
  await drag(page, from, { x: from.x, y: from.y + 1.2 * h }, { shift: true });
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 0, 1");
  expect(await cells(page)).toEqual([START, [19, 18, 17], PLATFORM.cell, [20, 18, 17], D]);

  // at yaw 90 the screen's right is -y
  await view(page, 90, 1);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, -1, 0");
  expect(await cells(page)).toEqual([START, B, PLATFORM.cell, C, D]);

  await page.keyboard.press("Delete");
  await expect(said(page)).toHaveText("Removed 2 blocks");
  await expect(status(page)).toHaveText("");
  expect(await cells(page)).toEqual([START, PLATFORM.cell, D]);

  await view(page, 0, 1);
  await marquee(page, [START, D, PLATFORM.cell]);
  await expect(status(page)).toHaveText(selected(3));
  await page.keyboard.press("Backspace");
  expect(await toasts(page)).toContain(LAST);
  expect(await cells(page)).toEqual([START, PLATFORM.cell, D]);
  expect(errors).toEqual([]);
});

test("the set's ghosts are red for whatever the lift would refuse, a platform's run among it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await cells(page);
  await marquee(page, [C, D]);
  await expect(status(page)).toHaveText(selected(2));
  // three cells down the floor both land in the platform's run, which takes no block
  await press(page, await top(page, C), await top(page, [C[0], C[1] + 3, C[2]]));
  expect(await move(page)).toEqual({
    delta: [0, 3, 0],
    cells: [
      [20, 20, 17],
      [21, 20, 17],
    ],
    blocked: [0, 1],
  });
  await page.mouse.up();
  expect(await toasts(page)).toEqual(["The platform's run crosses the block at 20,20,17."]);
  await expect(status(page)).toHaveText("The platform's run crosses the block at 20,20,17.");
  expect(await cells(page)).toEqual(before);
  expect(await move(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("a tool change, w or another level while a rectangle is drawn lets it go, and the lift selects nothing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await cells(page);
  const drawing = () => page.evaluate(() => document.body.classList.contains("marquee"));
  const { from, to } = await rectangle(page, [B, C]);

  await press(page, from, to);
  expect(await drawing()).toBe(true);
  await page.keyboard.press("a");
  expect(await drawing()).toBe(false);
  await page.mouse.up();
  await expect(status(page)).toHaveText("");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("i");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(before);

  await press(page, from, to);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(await drawing()).toBe(false);
  await page.mouse.up();
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("w");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(before);

  await press(page, from, to);
  await page.locator("#draftNew").dispatchEvent("click");
  await expect(said(page)).toHaveText(/^Made a new level/);
  expect(await drawing()).toBe(false);
  const made = await cells(page);
  await page.mouse.up();
  await expect(status(page)).toHaveText("");
  await expect(said(page)).toHaveText(/^Made a new level/);
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(made);
  expect(errors).toEqual([]);
});

test("an error the draft carries moves with the set where it names a block of the set", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  // a block in the platform's run, which the checks report at the platform and name by its cell
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [20, 20, 17], { kind: 0 }));
  });
  await marquee(page, [PLATFORM.cell, [20, 20, 17], PLATFORM.far]);
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  expect(await toasts(page)).toEqual([]);
  await expect(status(page)).toHaveText(selected(2));
  const moved = await doc(page);
  expect(moved.blocks.find((b) => b.kind === 5)).toEqual({
    ...PLATFORM,
    cell: [19, 21, 17],
    far: [21, 21, 17],
  });
  expect(moved.blocks.map((b) => b.cell)).toContainEqual([20, 21, 17]);
  expect(errors).toEqual([]);
});

test("a refused lift draws the map again, so the set's ghosts go", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  // a block one cell down the floor from the ice block, laid once the set is made
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [20, 18, 17], { kind: 0 }));
  });
  await expect(status(page)).toHaveText(selected(2));
  const before = await cells(page);
  // one cell down the floor leaves the pointer on the pressed block's near side, so nothing else redraws
  await press(page, await top(page, B), await top(page, [B[0], B[1] + 1, B[2]]));
  expect(await move(page)).toMatchObject({ delta: [0, 1, 0], blocked: [1] });
  await page.evaluate(() => {
    const g = document.getElementById("cv").getContext("2d");
    const clear = g.clearRect;
    window.__draws = 0;
    g.clearRect = function (...a) {
      window.__draws++;
      return clear.apply(this, a);
    };
  });
  await page.mouse.up();
  expect(await toasts(page)).toEqual([HELD]);
  expect(await move(page)).toBeNull();
  expect(await page.evaluate(() => window.__draws)).toBeGreaterThan(0);
  expect(await cells(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test("the panel's face goes with its block when the set moves", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  // the ice block's near side, turned to the camera at this yaw
  await click(page, await at(page, C[0] + 0.5, C[1] + 1, C[2] + 0.5));
  expect(await shown(page)).toMatchObject({ selected: C, face: 2 });
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  expect(await shown(page)).toMatchObject({ selected: C, face: 2 });
  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  expect(await shown(page)).toMatchObject({ selected: [20, 18, 17], face: 2 });
  await drag(page, await top(page, [20, 18, 17]), await top(page, [20, 19, 17]));
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  expect(await shown(page)).toMatchObject({ selected: [20, 19, 17], face: 2 });
  expect(errors).toEqual([]);
});

test("undo and redo let the set go, so no stale part of it stays selected", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await cells(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  // a cell to the left puts the ice block where the other stood, a cell of the set that undo fills again
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(said(page)).toHaveText("Moved 2 blocks by -1, 0, 0");
  const moved = [START, [18, 17, 17], [19, 17, 17], PLATFORM.cell, D];
  expect(await cells(page)).toEqual(moved);
  await page.keyboard.press("Control+z");
  await expect(said(page)).toHaveText("Undid moved 2 blocks by -1, 0, 0");
  expect(await cells(page)).toEqual(before);
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(before);
  await page.keyboard.press("Control+Shift+z");
  await expect(said(page)).toHaveText("Redid moved 2 blocks by -1, 0, 0");
  expect(await cells(page)).toEqual(moved);
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(moved);
  expect(errors).toEqual([]);
});

test("choosing another level takes the set's line off the strip with the set", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await page.locator("#draftNew").click();
  await expect(said(page)).toHaveText(/^Made a new level/);
  await expect(status(page)).toHaveText("");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  const made = await cells(page);
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual(made);
  expect(errors).toEqual([]);
});

test("Select's key pressed again keeps the set and its line", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("i");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  expect(errors).toEqual([]);
});

test("a brush change clears a refusal and gives the set its line back", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("j");
  await expect(said(page)).toHaveText(/^Brush: /);
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("Shift+ArrowRight");
  await expect(status(page)).toHaveText(HELD);
  // Alt-click takes the block's kind as the brush, with the set still in hand
  await page.keyboard.down("Alt");
  await click(page, await top(page, D));
  await page.keyboard.up("Alt");
  await expect(page.locator('#palette .rows [data-id="k0"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("Shift+ArrowDown");
  await expect(said(page)).toHaveText("Moved 2 blocks by 0, 1, 0");
  expect(errors).toEqual([]);
});

test("a click, Esc or a rectangle round nothing clears the set, the panel's cell staying until Esc", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await click(page, await top(page, D));
  expect((await shown(page)).selected).toEqual(D);
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));

  await page.keyboard.press("Escape");
  await expect(status(page)).toHaveText("");
  expect((await shown(page)).selected).toEqual(D);
  await page.keyboard.press("Escape");
  expect((await shown(page)).selected).toBeNull();

  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await click(page, await top(page, D));
  await expect(status(page)).toHaveText("");
  expect((await shown(page)).selected).toEqual(D);
  await page.keyboard.press("Delete");
  expect(await cells(page)).toEqual([START, B, PLATFORM.cell, C]);

  await click(page, await top(page, B));
  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await marqueeOnNothing(page);
  await expect(status(page)).toHaveText("");
  await expect(said(page)).toHaveText("Nothing selected");
  expect((await shown(page)).selected).toBeNull();

  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  await page.keyboard.press("a");
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("Shift+ArrowDown");
  expect(await cells(page)).toEqual([START, B, PLATFORM.cell, C]);
  expect(errors).toEqual([]);
});

test("a drag turns the level from a block outside the set, in any other tool, and with editing off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const before = await cells(page);
  const turned = async (from) => {
    await drag(page, from, { x: from.x + 60, y: from.y + 20 });
    const { yaw } = await shown(page);
    await view(page, 0, 1);
    return yaw !== 0;
  };
  const sky = async () => {
    const p = await middle(page, B);
    const from = { x: p.x, y: p.y - 3 * SIDE };
    expect(await clear(page, from)).toBe(true);
    return from;
  };

  await marquee(page, [B, C]);
  await expect(status(page)).toHaveText(selected(2));
  expect(await turned(await top(page, D))).toBe(true);
  await expect(status(page)).toHaveText(selected(2));
  expect(await cells(page)).toEqual(before);

  await page.keyboard.press("a");
  expect(await turned(await sky())).toBe(true);
  await page.keyboard.press("i");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(await turned(await sky())).toBe(true);
  expect(await cells(page)).toEqual(before);
  expect(errors).toEqual([]);
});

/** Count, from now on, the pick's read-backs and its paints, the latter as saves on a canvas off the page. */
const countPick = (page) =>
  page.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype;
    window.__pick = { reads: 0, paints: 0 };
    const read = proto.getImageData;
    proto.getImageData = function (...a) {
      window.__pick.reads++;
      return read.apply(this, a);
    };
    const save = proto.save;
    proto.save = function (...a) {
      if (!this.canvas.isConnected) window.__pick.paints++;
      return save.apply(this, a);
    };
  });
const picked = (page) => page.evaluate(() => window.__pick);

test("a press reads the pick only when the editor asks for the cell under it", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  const from = await top(page, B);
  await page.mouse.move(from.x, from.y);
  await countPick(page);
  await page.mouse.down();
  expect(await picked(page)).toEqual({ reads: 0, paints: 0 });
  await page.mouse.move(from.x + 60, from.y + 20, { steps: 4 });
  await page.mouse.up();
  expect((await shown(page)).yaw).not.toBe(0);
  expect(errors).toEqual([]);
});

test.describe("with a finger", () => {
  test.use({ hasTouch: true });

  test("a finger's press reads the pick for no gesture, since it has none", async ({ page }) => {
    const errors = trackErrors(page);
    await fresh(page);
    const point = await top(page, B);
    await countPick(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: point.x, y: point.y }],
    });
    expect(await picked(page)).toEqual({ reads: 0, paints: 0 });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    expect(errors).toEqual([]);
  });
});
