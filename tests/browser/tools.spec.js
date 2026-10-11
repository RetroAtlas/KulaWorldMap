import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const s = state.selected;
    return {
      li: state.li,
      draft: state.lvl.draft,
      slice: state.slice,
      selected: s && [s.x, s.y, s.z],
      chip: document.getElementById("chipLine").textContent,
    };
  });
const blocks = (page) =>
  page.evaluate(async () => {
    const [{ state }, { get }] = await Promise.all(
      ["state.js", "drafts.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return get(state.lvl.draft).doc.blocks.map((b) => ({ cell: b.cell, faces: b.faces ?? {} }));
  });
/** The page point over a point of the level. */
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
const click = async (page, point, options = {}) => {
  await page.mouse.click(point.x, point.y, options);
};
// the faces turned to the view at the opening yaw and pitch: the top, the +x side and the +y side
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
/** Hold the view at a zoom, so that points away from the level stay on the canvas. */
const zoom = (page, z) =>
  page.evaluate(async (z) => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { invalidatePick, draw } = await import(new URL("js/render.js", location.href).href);
    state.cam.zoom = z;
    state.framing = null;
    invalidatePick();
    draw();
  }, z);
const strip = (page) => page.locator("#tools");
const tool = (page, name) => page.locator(`#tools .tool[data-tool="${name}"]`);

async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.keyboard.press("w");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
}

test("w makes a copy of a shipped level and edits it, toggles on a draft, and leaves with the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await expect(strip(page)).toBeHidden();
  await page.keyboard.press("w");
  await expect(strip(page)).toBeVisible();
  // a group of plain tab stops, with no arrow keys of its own to take from the map
  await expect(strip(page)).toHaveAttribute("role", "group");
  const copy = await shown(page);
  expect(copy.li).toBe(-1);
  expect(copy.chip).toContain("LEVEL 1");
  await expect(strip(page)).toBeVisible();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(tool(page, "place")).toBeVisible();
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");
  // the copy, the move to a draft and the mode reach the reader as one announcement
  await expect(page.locator("#say")).toHaveText(
    /^Copied LEVEL 1\. Draft, LEVEL 1, .*\. Editing on\.$/,
  );

  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(tool(page, "place")).toBeHidden();
  await expect(strip(page)).toBeVisible();
  await expect(page.locator("#say")).toHaveText("Editing off");
  await page.locator("#editBtn").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // editing is never in the link
  expect(await page.evaluate(() => location.hash)).toMatch(/^#DRAFT\/\d+\/45,35\/fit\/33$/);

  await page.keyboard.press("z");
  await expect(tool(page, "erase")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("i");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("a");
  await expect(tool(page, "place")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#worlds .levels button[data-i='0']").click();
  expect((await shown(page)).li).toBe(0);
  await expect(strip(page)).toBeHidden();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  // the level chosen is the whole announcement
  await expect(page.locator("#say")).toHaveText(/^LEVEL 1, /);
  expect(errors).toEqual([]);
});

test("Place lays a block across the face clicked and selects it, and refuses the edge and a taken cell", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const start = [17, 17, 17];
  await click(page, await plusX(page, start));
  expect((await shown(page)).selected).toEqual([18, 17, 17]);
  expect((await blocks(page)).map((b) => b.cell)).toEqual([start, [18, 17, 17]]);
  await expect(page.locator("#say")).toHaveText("Placed a block at 18, 17, 17");
  await page.keyboard.press("Escape");

  // a block at the edge: its +x side looks past it
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["state.js", "drafts.js", "project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [32, 17, 17], { kind: 0 }));
  });
  await zoom(page, 0.8);
  await click(page, await plusX(page, [32, 17, 17]));
  expect(await toasts(page)).toEqual(["The game builds nothing past the edge."]);
  await expect(page.locator("#toolStatus")).toHaveText("The game builds nothing past the edge.");
  // the strip's line and the toast stack are live regions of their own, so nothing goes to #say
  await expect(page.locator("#toolStatus")).toHaveAttribute("role", "status");
  await expect(page.locator("#say")).toHaveText("Placed a block at 18, 17, 17");
  expect((await blocks(page)).map((b) => b.cell)).toEqual([start, [18, 17, 17], [32, 17, 17]]);

  // a block the slice hides still holds its cell
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, SIDE }, { get, update }, { setBlock }, { setSlice }] = await Promise.all(
      ["state.js", "drafts.js", "project.js", "navigate.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [17, 17, 16], { kind: 0 }));
    setSlice(SIDE - 1 - 17);
  });
  await click(page, await top(page, start));
  expect(await toasts(page)).toContain("That cell holds a block already.");
  expect((await blocks(page)).length).toBe(4);
  // a refusal is the tool's, and goes with it
  await expect(page.locator("#toolStatus")).toHaveText("That cell holds a block already.");
  await page.keyboard.press("z");
  await expect(page.locator("#toolStatus")).toHaveText("");
  expect(errors).toEqual([]);
});

test("a block laid above the slice raises it, and the grid lays a first floor", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 17);
  });
  expect((await shown(page)).slice).toBe(16);
  await click(page, await top(page, [17, 17, 17]));
  const raised = await shown(page);
  expect(raised.slice).toBe(17);
  expect(raised.selected).toEqual([17, 17, 16]);

  await page.keyboard.press("g");
  await expect(page.locator("#showBase")).toBeChecked();
  await zoom(page, 0.8);
  // the floor lies one layer under the lowest block
  await click(page, await at(page, 22.5, 24.5, 18));
  expect((await shown(page)).selected).toEqual([22, 24, 17]);
  expect((await blocks(page)).map((b) => b.cell)).toContainEqual([22, 24, 17]);
  // a click on the plane past the floor's edge is a click on nothing
  await click(page, await at(page, -2.5, 17.5, 18));
  expect((await shown(page)).selected).toBe(null);
  expect((await blocks(page)).length).toBe(3);
  expect(errors).toEqual([]);
});

test("Erase takes the object off a face, then the block, and keeps the last block", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const start = [17, 17, 17];
  await click(page, await plusX(page, start));
  await page.keyboard.press("z");
  await click(page, await top(page, start));
  await expect(page.locator("#say")).toHaveText("Removed the start from the top of 17, 17, 17");
  let doc = await blocks(page);
  expect(doc.find((b) => b.cell.join() === start.join()).faces).toEqual({});
  expect(doc.length).toBe(2);
  await click(page, await top(page, start));
  await expect(page.locator("#say")).toHaveText("Removed the block at 17, 17, 17");
  doc = await blocks(page);
  expect(doc.map((b) => b.cell)).toEqual([[18, 17, 17]]);
  await click(page, await top(page, [18, 17, 17]));
  expect(await toasts(page)).toContain("A level keeps its last block.");
  expect((await blocks(page)).length).toBe(1);

  // shift-click erases from Place, and a right click selects from it
  await page.keyboard.press("a");
  await click(page, await plusX(page, [18, 17, 17]));
  expect((await blocks(page)).length).toBe(2);
  await page.keyboard.down("Shift");
  await click(page, await top(page, [19, 17, 17]));
  await page.keyboard.up("Shift");
  expect((await blocks(page)).map((b) => b.cell)).toEqual([[18, 17, 17]]);
  await click(page, await top(page, [18, 17, 17]), { button: "right" });
  expect((await shown(page)).selected).toEqual([18, 17, 17]);
  expect((await blocks(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test("the hover names what Place would do, and Esc clears the selection without leaving", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await expect(tool(page, "place")).toHaveAttribute(
    "title",
    "Place the brush against the face you click (a)",
  );
  const side = await plusX(page, [17, 17, 17]);
  await page.mouse.move(side.x, side.y);
  await expect(page.locator("#tip")).toContainText("Place a block on the +x side");
  const hover = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.hover && [state.hover.x, state.hover.y, state.hover.z, state.hover.face];
  });
  expect(hover).toEqual([17, 17, 17, 1]);
  await page.keyboard.press("i");
  await click(page, side);
  expect((await shown(page)).selected).toEqual([17, 17, 17]);
  await page.keyboard.press("Escape");
  expect((await shown(page)).selected).toBe(null);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(tool(page, "select")).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("the Keyboard list names every key and gesture the editor binds", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("?");
  await expect(page.locator("#help")).toBeVisible();
  const keys = (await page.locator("#help dt").allTextContents()).join("\n");
  const bound = ["w", "a z i", "j k", "1 to 9", "r Shift-r", "Ctrl-Z or Cmd-Z"]
    .concat(["Ctrl-Shift-Z, Cmd-Shift-Z or Ctrl-Y", "Delete Backspace", "Esc"])
    .concat(["shift-click", "right-click, long press", "alt-click", "tap, then tap"]);
  for (const key of bound) expect(keys, key).toContain(key);
  const does = (await page.locator("#help dd").allTextContents()).join("\n");
  expect(does).toContain("cancel a waiting run");
  expect(errors).toEqual([]);
});
