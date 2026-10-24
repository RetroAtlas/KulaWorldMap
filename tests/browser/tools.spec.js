import { test, expect } from "@playwright/test";
import { settle, topPixels, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
      ["viewer/state.js", "editor/drafts.js"].map(
        (p) => import(new URL(`js/${p}`, location.href).href),
      ),
    );
    return get(state.lvl.draft).doc.blocks.map((b) => ({ cell: b.cell, faces: b.faces ?? {} }));
  });
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { invalidatePick, draw } = await import(
      new URL("js/viewer/draw/render.js", location.href).href
    );
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
  await expect(page.locator("#tools")).toBeVisible();
  if ((await page.locator("#editBtn").getAttribute("aria-pressed")) !== "true")
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

test("a level made to be edited asks for editing, which is said after the level is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(async () => {
    const { say } = await import(new URL("js/viewer/chrome/a11y.js", location.href).href);
    const { emit } = await import(new URL("js/viewer/ui/dom.js", location.href).href);
    say("Made a new level. Draft, Untitled level.");
    emit("edit-wanted");
  });
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#say")).toHaveText(
    "Made a new level. Draft, Untitled level. Editing on.",
  );
  // asked again while editing, it changes nothing
  await page.evaluate(async () => {
    const { emit } = await import(new URL("js/viewer/ui/dom.js", location.href).href);
    emit("edit-wanted");
  });
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#say")).toHaveText(
    "Made a new level. Draft, Untitled level. Editing on.",
  );
  expect(errors).toEqual([]);
});

test("editing turns the ground grid on with it, which can be turned off while editing and stands as editing ends", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const grid = page.locator("#showBase");
  const edit = page.locator("#editBtn");
  // how many colours a floor cell beside the level is drawn in: one until the grid's lines cross it
  const floor = async () => {
    await zoom(page, 0.8);
    return new Set((await topPixels(page, [22, 24, 18])).map(String)).size;
  };
  await expect(grid).not.toBeChecked();
  expect(await floor()).toBe(1);
  await page.keyboard.press("w");
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toBeChecked();
  expect(await kept()).toEqual({ base: true });
  expect(await floor()).toBeGreaterThan(1);
  // turned off while editing it stays off
  await page.keyboard.press("g");
  await expect(grid).not.toBeChecked();
  expect(await kept()).toEqual({});
  expect(await floor()).toBe(1);
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("w");
  await expect(edit).toHaveAttribute("aria-pressed", "false");
  await expect(grid).not.toBeChecked();
  // editing on again turns it on again, and editing off leaves it on
  await edit.click();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toBeChecked();
  await edit.click();
  await expect(edit).toHaveAttribute("aria-pressed", "false");
  await expect(grid).toBeChecked();
  expect(await kept()).toEqual({ base: true });
  // a level made to be edited turns it on as well
  await page.keyboard.press("g");
  await expect(grid).not.toBeChecked();
  await page.locator("#draftNew").click();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(grid).toBeChecked();
  expect(await kept()).toEqual({ base: true });
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
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
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
    const [{ state }, { get, update }, { setBlock }, { setSlice }, { SIDE }] = await Promise.all(
      [
        "viewer/state.js",
        "editor/drafts.js",
        "format/project.js",
        "viewer/chrome/navigate.js",
        "format/lattice.js",
      ].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [17, 17, 16], { kind: 0 }));
    setSlice(SIDE - 1 - 17);
  });
  await click(page, await top(page, start));
  expect(await toasts(page)).toContain("That cell holds a block already.");
  expect((await blocks(page)).length).toBe(4);
  // a refusal belongs to the tool, and goes with it
  await expect(page.locator("#toolStatus")).toHaveText("That cell holds a block already.");
  await page.keyboard.press("z");
  await expect(page.locator("#toolStatus")).toHaveText("");
  expect(errors).toEqual([]);
});

test("a refusal leaves the strip with the brush as it does with the tool", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  // a block the slice hides still holds its cell
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }, { setSlice }, { SIDE }] = await Promise.all(
      [
        "viewer/state.js",
        "editor/drafts.js",
        "format/project.js",
        "viewer/chrome/navigate.js",
        "format/lattice.js",
      ].map(at),
    );
    const id = state.lvl.draft;
    update(id, setBlock(get(id).doc, [17, 17, 16], { kind: 0 }));
    setSlice(SIDE - 1 - 17);
  });
  await click(page, await top(page, [17, 17, 17]));
  expect(await toasts(page)).toEqual(["That cell holds a block already."]);
  await expect(page.locator("#toolStatus")).toHaveText("That cell holds a block already.");
  await page.locator('#palette .rows button[data-id="k2"]').click();
  await expect(page.locator("#say")).toHaveText(/^Brush: /);
  await expect(page.locator("#toolStatus")).toHaveText("");
  expect(errors).toEqual([]);
});

test("choosing a brush makes Place the tool, by a row, a digit, j or k, or Alt-click", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const start = [17, 17, 17];
  const pressed = (name) => expect(tool(page, name)).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("z");
  await pressed("erase");
  await page.locator("#palette .tabs button", { hasText: "Pickups" }).click();
  await page.locator('#palette .rows button[data-id="t31"]').click();
  await pressed("place");
  await expect(tool(page, "erase")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#say")).toHaveText("Brush: Key");
  // so the click that follows places rather than erases
  await click(page, await plusX(page, start));
  expect((await blocks(page)).find((b) => b.cell.join() === start.join()).faces).toMatchObject({
    1: { type: 31 },
  });
  await page.keyboard.press("i");
  await pressed("select");
  await page.keyboard.press("2");
  await pressed("place");
  await page.keyboard.press("z");
  await pressed("erase");
  await page.keyboard.press("j");
  await pressed("place");
  await page.keyboard.press("i");
  await pressed("select");
  await page.keyboard.down("Alt");
  await click(page, await top(page, start));
  await page.keyboard.up("Alt");
  await expect(page.locator('#palette .rows button[aria-pressed="true"]')).toHaveAttribute(
    "data-id",
    "t30",
  );
  await pressed("place");
  // Turn is an action and not a tool, and leaves the tool as it stands
  await page.keyboard.press("z");
  await page.keyboard.press("Escape");
  await page.locator("#turnBtn").click();
  await expect(page.locator("#say")).toHaveText(/^Brush facing /);
  await pressed("erase");
  expect(errors).toEqual([]);
});

test("a block laid above the slice raises it, and the grid lays a first floor", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 17);
  });
  expect((await shown(page)).slice).toBe(16);
  await click(page, await top(page, [17, 17, 17]));
  const raised = await shown(page);
  expect(raised.slice).toBe(17);
  expect(raised.selected).toEqual([17, 17, 16]);

  // the grid has been on since editing began
  await expect(page.locator("#showBase")).toBeChecked();
  await zoom(page, 0.8);
  // with the slice put back, the floor lies one layer under the lowest block
  await page.keyboard.press("\\");
  expect((await shown(page)).slice).toBe(33);
  await click(page, await at(page, 22.5, 24.5, 18));
  expect((await shown(page)).selected).toEqual([22, 24, 17]);
  expect((await blocks(page)).map((b) => b.cell)).toContainEqual([22, 24, 17]);
  // a click on the plane past the floor's edge is a click on nothing
  await click(page, await at(page, 34.5, 13.5, 18));
  expect((await shown(page)).selected).toBe(null);
  expect((await blocks(page)).length).toBe(3);

  // with the slice lowered the grid follows the slice, and lays a floor in the layer it shows
  const ghost = () =>
    page.evaluate(async () => {
      const { ghostPreview } = await import(new URL("js/editor/editor.js", location.href).href);
      return ghostPreview();
    });
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 15);
  });
  const over = await at(page, 20.5, 22.5, 16);
  await page.mouse.move(over.x, over.y);
  expect(await ghost()).toEqual({ cell: [20, 22, 15], blocked: false });
  await expect(page.locator("#toolStatus")).toHaveText(
    "The grid follows the slice: , lowers it and . raises it.",
  );
  await click(page, over);
  expect((await shown(page)).selected).toEqual([20, 22, 15]);
  expect((await shown(page)).slice).toBe(18);
  await expect(page.locator("#toolStatus")).toHaveText("");
  const beside = await at(page, 21.5, 22.5, 16);
  await page.mouse.move(beside.x, beside.y);
  expect(await ghost()).toEqual({ cell: [21, 22, 15], blocked: false });
  await expect(page.locator("#toolStatus")).toHaveText("");
  // a thing has no floor to stand on
  await page.locator("#palette .tabs button", { hasText: "Pickups" }).click();
  await page.locator('#palette .rows button[data-id="t31"]').click();
  await page.mouse.move(beside.x, beside.y);
  expect(await ghost()).toEqual({ cell: [21, 22, 15], blocked: true });
  await click(page, beside);
  expect(await toasts(page)).toContain("The grid lays blocks; a thing goes on a block's face.");
  expect((await blocks(page)).length).toBe(4);

  // a level with no blocks has its grid at the lattice's foot
  await page.locator("#palette .tabs button", { hasText: "Blocks" }).click();
  await page.locator('#palette .rows button[data-id="k0"]').click();
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setSlice }, { SIDE }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "viewer/chrome/navigate.js", "format/lattice.js"].map(
        at,
      ),
    );
    const id = state.lvl.draft;
    update(id, { ...get(id).doc, blocks: [] });
    setSlice(SIDE - 1);
  });
  await zoom(page, 0.5);
  const foot = await at(page, 16.5, 16.5, 33);
  await page.mouse.move(foot.x, foot.y);
  expect(await ghost()).toEqual({ cell: [16, 16, 32], blocked: false });
  await click(page, foot);
  expect((await blocks(page)).map((b) => b.cell)).toEqual([[16, 16, 32]]);
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

test("a platform's body builds against the cell it stands in, not its record's cell", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("v");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(
      id,
      setBlock(get(id).doc, [18, 17, 17], {
        kind: 5,
        far: [18, 21, 17],
        length: 2,
        speed: 30,
      }),
    );
  });
  await zoom(page, 0.8);
  const ghost = () =>
    page.evaluate(async () => {
      const { ghostPreview } = await import(new URL("js/editor/editor.js", location.href).href);
      return ghostPreview();
    });
  const body = await top(page, [18, 18, 17]);
  await page.mouse.move(body.x, body.y);
  expect(await ghost()).toEqual({ cell: [18, 18, 16], blocked: false });
  await click(page, body);
  expect((await shown(page)).selected).toEqual([18, 18, 16]);
  expect((await blocks(page)).map((b) => b.cell)).toContainEqual([18, 18, 16]);
  // beside the body lies the run, which takes no block
  const side = await at(page, 18.5, 19, 17.5);
  await page.mouse.move(side.x, side.y);
  expect(await ghost()).toEqual({ cell: [18, 19, 17], blocked: true });
  await click(page, side);
  expect(await toasts(page)).toContain("The platform's run crosses the block at 18,19,17.");
  // a click on the body is a click on the platform for every other tool
  await page.keyboard.press("i");
  await click(page, side);
  expect((await shown(page)).selected).toEqual([18, 17, 17]);
  expect(errors).toEqual([]);
});

test("the hover follows the pointer from one block of a platform's body to the next", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("v");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(
      id,
      setBlock(get(id).doc, [18, 17, 17], {
        kind: 5,
        far: [18, 21, 17],
        length: 2,
        speed: 30,
      }),
    );
  });
  await zoom(page, 0.8);
  const ghost = () =>
    page.evaluate(async () => {
      const { ghostPreview } = await import(new URL("js/editor/editor.js", location.href).href);
      return ghostPreview();
    });
  const hovered = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const h = state.hover;
      return h && [h.body, h.k, h.face];
    });
  // the two blocks of the body share the record's cell, and differ in where they stand
  const first = await top(page, [18, 17, 17]);
  await page.mouse.move(first.x, first.y);
  expect(await hovered()).toEqual([[18, 17, 17], 0, 0]);
  expect(await ghost()).toEqual({ cell: [18, 17, 16], blocked: false });
  const second = await top(page, [18, 18, 17]);
  await page.mouse.move(second.x, second.y);
  expect(await hovered()).toEqual([[18, 18, 17], 1, 0]);
  expect(await ghost()).toEqual({ cell: [18, 18, 16], blocked: false });
  await click(page, second);
  expect((await shown(page)).selected).toEqual([18, 18, 16]);
  expect(errors).toEqual([]);
});

test("the ghost is red for whatever the click would refuse, a beam's cell among them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setBlock }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    let doc = setBlock(get(id).doc, [17, 18, 17], { kind: 8, far: [22, 18, 17], colour: 0 });
    doc = setBlock(doc, [19, 17, 17], { kind: 0 });
    update(id, doc);
  });
  await zoom(page, 0.8);
  const ghost = () =>
    page.evaluate(async () => {
      const { ghostPreview } = await import(new URL("js/editor/editor.js", location.href).href);
      return ghostPreview();
    });
  const free = await plusX(page, [19, 17, 17]);
  await page.mouse.move(free.x, free.y);
  expect(await ghost()).toEqual({ cell: [20, 17, 17], blocked: false });
  // across the +y side lies the beam, which the checks refuse a block on
  const beam = await at(page, 19.5, 18, 17.5);
  await page.mouse.move(beam.x, beam.y);
  expect(await ghost()).toEqual({ cell: [19, 18, 17], blocked: true });
  await click(page, beam);
  expect(await toasts(page)).toContain("The beam crosses the block at 19,18,17.");
  expect((await blocks(page)).length).toBe(3);
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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

test("the hover says where the face holds what Place would put there", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setFace }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setFace(get(id).doc, [17, 17, 17], 1, { type: 31 }));
  });
  await page.locator("#palette .tabs button", { hasText: "Pickups" }).click();
  await page.locator('#palette .rows button[data-id="t31"]').click();
  const side = await plusX(page, [17, 17, 17]);
  await page.mouse.move(side.x, side.y);
  await expect(page.locator("#tip")).toContainText("The +x side holds a key already");
  await expect(page.locator("#tip")).not.toContainText("Place a key");
  const above = await top(page, [17, 17, 17]);
  await page.mouse.move(above.x, above.y);
  await expect(page.locator("#tip")).toContainText("Place a key on the top");
  expect(errors).toEqual([]);
});

test("the Keyboard list names every key and gesture the editor binds", async ({ page }) => {
  const errors = trackErrors(page);
  // the list names the modifiers for the platform, so the test reads it on one platform everywhere
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "platform", { get: () => "Win32", configurable: true }),
  );
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("?");
  await expect(page.locator("#help")).toBeVisible();
  const keys = (await page.locator("#help dt").allTextContents()).join("\n");
  const bound = ["w", "a z i", "j k", "1 to 9", "r Shift+r", "Ctrl+Z", "Ctrl+Shift+Z"]
    .concat(["Delete Backspace", "Esc", "Shift+click", "right-click, long press"])
    .concat(["Alt+click", "tap, then tap"]);
  for (const key of bound) expect(keys, key).toContain(key);
  const does = (await page.locator("#help dd").allTextContents()).join("\n");
  expect(does).toContain("cancel a waiting run");
  expect(errors).toEqual([]);
});
