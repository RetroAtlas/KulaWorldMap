import { test, expect } from "@playwright/test";
import { settle, still, trackErrors, drawn, overlaps, topPixels, gold } from "./helpers.js";
import { JUMP, encode, headingOn } from "../../public/js/viewer/walk.js";

const LEVEL = "/#HIRO/0/45,35/fit/33";
const SEGMENT = /\/r[A-Za-z0-9_-]{3,}$/;
// a route of the start and a jump two blocks south from it, over the block between
const JUMPED = encode({
  stations: [
    { cell: [17, 18, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
  ],
  steps: [{ k: headingOn(0, [0, -1, 0]), o: JUMP, d: 0 }],
  marks: new Set([0, 1]),
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
// the faces turned to the view at the opening yaw and pitch: the top and the +x side
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
const click = async (page, point) => page.mouse.click(point.x, point.y);
/** A click on `point` with Shift held. */
const shiftClick = async (page, point) => {
  await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Shift");
};
const strip = (page) => page.locator("#course");
const line = (page) => page.locator("#courseLine");
const status = (page) => page.locator("#courseStatus");
const route = (page) =>
  page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return (
      c && {
        stations: c.stations,
        steps: c.steps,
        marks: [...c.marks].sort((a, b) => a - b),
      }
    );
  });
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("kula.course")));
const hovered = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return state.hover?.key ?? null;
  });
/** A finger held still on `point` until the hold shows, then lifted. */
const hold = async (page, point) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await expect.poll(() => hovered(page)).not.toBeNull();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};
const display = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
/** The course the link's segment spells, read back through the codec. */
const linked = (page) =>
  page.evaluate(async () => {
    const { decode } = await import(new URL("js/viewer/walk.js", location.href).href);
    const segment = location.hash.split("/").find((s) => /^r[A-Za-z0-9_-]{3,}$/.test(s));
    const c = segment ? decode(segment) : null;
    return c && { stations: c.stations, steps: c.steps, marks: [...c.marks].sort((a, b) => a - b) };
  });
/** Put `block` into the shown draft at `cell`, or take the block there out, through the model. */
const laid = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock, removeBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, block ? setBlock(get(id).doc, cell, block) : removeBlock(get(id).doc, cell));
    },
    [cell, block],
  );
/** How many strokes and arcs one frame draws with a dash set, the hover and the objects away. */
const dashed = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const g = document.getElementById("cv").getContext("2d");
    const out = { strokes: 0, arcs: 0 };
    const was = { stroke: g.stroke, arc: g.arc };
    g.stroke = function (...a) {
      if (this.getLineDash().length) out.strokes++;
      return was.stroke.apply(this, a);
    };
    g.arc = function (...a) {
      if (this.getLineDash().length) out.arcs++;
      return was.arc.apply(this, a);
    };
    state.hover = null;
    draw();
    Object.assign(g, was);
    return out;
  });
/** How many curves one frame draws with no dash set, the hover away. */
const curved = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const g = document.getElementById("cv").getContext("2d");
    let curves = 0;
    const was = g.bezierCurveTo;
    g.bezierCurveTo = function (...a) {
      if (!this.getLineDash().length) curves++;
      return was.apply(this, a);
    };
    state.hover = null;
    draw();
    delete g.bezierCurveTo;
    return curves;
  });

/** A draft of the start's block and a block beside it, and another across a gap, shown without editing. */
async function draft(page) {
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [18, 17, 17], { kind: 0 });
  await laid(page, [20, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await still(page);
}

test("r turns the planner on without keeping it, clicks add stops the strip counts, and the link carries them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await expect(strip(page)).toBeHidden();
  await expect(page.locator("#showCourse")).not.toBeChecked();
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  expect(await display(page)).toBeNull();
  await expect(strip(page)).toBeVisible();
  await expect(strip(page)).toHaveAttribute("role", "group");
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  await expect(status(page)).toHaveText("Click a face to add a stop, Shift-click to add a jump.");
  await expect(page.locator("#courseUndo")).toBeDisabled();
  await expect(status(page)).toHaveClass(/\bhint\b/);

  const first = await top(page, [17, 15, 17]);
  await page.mouse.move(first.x, first.y);
  await expect(page.locator("#tip")).toContainText("Add a stop on the top");
  await click(page, first);
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(page.locator("#say")).toHaveText("Stop 2 added on the top of 17,15,17.");
  await expect(status(page)).toHaveText("");
  await expect(status(page)).not.toHaveClass(/\bhint\b/);
  // a right click selects, as it does with the planner off
  await page.mouse.click(first.x, first.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,15,17");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await page.keyboard.press("Escape");
  let c = await route(page);
  expect(c.stations[0]).toEqual({ cell: [17, 18, 17], face: 0 });
  expect(c.stations.at(-1)).toEqual({ cell: [17, 15, 17], face: 0 });
  expect(c.steps).toHaveLength(3);
  expect(c.marks).toEqual([0, 3]);
  await expect(page.locator("#detail")).toBeHidden();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33\/r[A-Za-z0-9_-]{3,}$/);
  expect(await linked(page)).toEqual(c);

  await click(page, await top(page, [20, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  c = await route(page);
  expect(c.steps).toHaveLength(6);
  expect(c.steps.every((s) => s && s.o === 0)).toBe(true);
  expect(c.marks).toEqual([0, 3, 6]);
  await expect.poll(() => linked(page)).toEqual(c);

  const last = await top(page, [20, 15, 17]);
  await page.mouse.move(last.x, last.y);
  await expect(page.locator("#tip")).toContainText("Take the last stop back");
  await click(page, last);
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(page.locator("#say")).toHaveText("Last stop removed.");
  // a Clear armed stays armed while a route stands, and is disarmed as the route goes
  await page.locator("#courseClear").click();
  await expect(page.locator("#courseClear")).toHaveText("Clear?");
  await page.keyboard.press("Backspace");
  await expect(line(page)).toHaveText("Route planner · 1 stop");
  expect((await route(page)).stations).toEqual([{ cell: [17, 18, 17], face: 0 }]);
  await expect(page.locator("#courseClear")).toHaveText("Clear?");
  await page.keyboard.press("Backspace");
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  expect(await route(page)).toBeNull();
  await expect(page.locator("#courseClear")).toHaveText("Clear");
  await expect(page.locator("#courseClear")).toBeDisabled();
  await expect(status(page)).toHaveClass(/\bhint\b/);
  await expect.poll(() => page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33$/);
  await page.keyboard.press("r");
  await expect(strip(page)).toBeHidden();
  expect(await display(page)).toBeNull();
  expect(errors).toEqual([]);
});

/** How many pixels differ between two readings of a face, and how many of the second are the route's gold. */
const differ = (before, after) => ({
  changed: after.filter((px, i) => px.some((v, ch) => Math.abs(v - before[i][ch]) > 24)).length,
  gold: after.filter(gold).length,
});

test("the route is drawn in gold over the faces it crosses, still while Motion is off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("v");
  await page.keyboard.press("t");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  // the route crosses the top of 17,16,17, and comes nowhere near the top of 18,12,17
  const crossed = [17, 16, 17];
  const beside = [18, 12, 17];
  const bare = { crossed: await topPixels(page, crossed), beside: await topPixels(page, beside) };
  expect(bare.crossed.length).toBeGreaterThan(1000);
  await page.keyboard.press("r");
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const drawnOver = differ(bare.crossed, await topPixels(page, crossed));
  expect(drawnOver.changed).toBeGreaterThan(200);
  expect(drawnOver.gold).toBeGreaterThan(50);
  expect(differ(bare.beside, await topPixels(page, beside)).changed).toBe(0);
  expect(await drawn(page)).toBe(0);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  expect(await drawn(page)).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test("a face no roll reaches is joined by a leap, drawn dashed, and a draft's edit hollows a station", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await draft(page);
  await page.keyboard.press("v");
  await page.keyboard.press("r");
  await click(page, await top(page, [18, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const plain = await dashed(page);
  expect(plain).toEqual({ strokes: 0, arcs: 0 });

  await click(page, await top(page, [20, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops · 1 leap");
  await expect(status(page)).toHaveText(
    "No roll reaches that face from the last stop, so a leap joins them.",
  );
  await expect(status(page)).not.toHaveClass(/\bhint\b/);
  await expect(page.locator("#say")).toHaveText(
    "Stop 3 added on the top of 20,17,17, joined by a leap.",
  );
  let c = await route(page);
  expect(c.steps).toEqual([{ k: expect.any(Number), o: 0 }, null]);
  // the leap's bow, rimmed and in gold
  const leapt = await dashed(page);
  expect(leapt).toEqual({ strokes: 2, arcs: 0 });
  await expect.poll(() => linked(page)).toEqual(c);

  // the block under the second stop goes: the stop is a ring, the roll onto it a leap, and nothing is pruned
  await laid(page, [18, 17, 17], null);
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  c = await route(page);
  expect(c.stations).toHaveLength(3);
  expect(c.marks).toEqual([0, 1, 2]);
  // the ring, rimmed and in gold, and the broken roll's leap beside the first
  expect(await dashed(page)).toEqual({ strokes: 6, arcs: 1 });
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  expect(await dashed(page)).toEqual(leapt);
  expect(errors).toEqual([]);
});

test("a link's route with a jump counts it on the strip and draws it as a solid golden arc, a roll joining the next stop", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(`${LEVEL}/${JUMPED}`);
  await settle(page);
  await still(page);
  await page.keyboard.press("v");
  await page.keyboard.press("r");
  await expect(line(page)).toHaveText("Route planner · 2 stops · 1 jump");
  const c = await route(page);
  expect(c).toEqual({
    stations: [
      { cell: [17, 18, 17], face: 0 },
      { cell: [17, 16, 17], face: 0 },
    ],
    steps: [{ k: 2, o: JUMP, d: 0 }],
    marks: [0, 1],
  });
  expect(await linked(page)).toEqual(c);
  // the arc's rim and core, neither dashed
  expect(await dashed(page)).toEqual({ strokes: 0, arcs: 0 });
  expect(await curved(page)).toBe(2);
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops · 1 jump");
  expect((await route(page)).steps).toEqual([
    { k: 2, o: JUMP, d: 0 },
    { k: 2, o: 0 },
  ]);
  await expect.poll(() => linked(page)).toEqual(await route(page));
  expect(await curved(page)).toBe(2);
  expect(errors).toEqual([]);
});

test("a Shift-click with no route yet opens the route at the start and jumps from there", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  await shiftClick(page, await top(page, [17, 16, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops · 1 jump");
  await expect(page.locator("#say")).toHaveText("Stop 2 added on the top of 17,16,17, by a jump.");
  await expect(status(page)).toHaveText("");
  expect(await route(page)).toEqual({
    stations: [
      { cell: [17, 18, 17], face: 0 },
      { cell: [17, 16, 17], face: 0 },
    ],
    steps: [{ k: headingOn(0, [0, -1, 0]), o: JUMP, d: 0 }],
    marks: [0, 1],
  });
  await expect.poll(() => page.url()).toMatch(new RegExp(`/${JUMPED}$`));
  expect(errors).toEqual([]);
});

test("a Shift-click adds a jump from the last stop, over a gap or down onto a lower block, and is refused where none comes down", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await draft(page);
  await page.keyboard.press("v");
  await page.keyboard.press("r");
  await expect(status(page)).toHaveText("Click a face to add a stop, Shift-click to add a jump.");
  const east = headingOn(0, [1, 0, 0]);
  const refused = "No jump from the last stop comes down on that face.";
  await click(page, await top(page, [18, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(status(page)).toHaveText("");
  // the block one on is no jump's landing
  await shiftClick(page, await top(page, [17, 17, 17]));
  await expect(page.locator("#toastStack .toast")).toHaveText([refused]);
  await expect(status(page)).toHaveText(refused);
  await expect(status(page)).not.toHaveClass(/\bhint\b/);
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  expect((await route(page)).steps).toEqual([{ k: east, o: 0 }]);

  await shiftClick(page, await top(page, [20, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops · 1 jump");
  await expect(page.locator("#say")).toHaveText("Stop 3 added on the top of 20,17,17, by a jump.");
  await expect(status(page)).toHaveText("");
  let c = await route(page);
  expect(c.steps).toEqual([
    { k: east, o: 0 },
    { k: east, o: JUMP, d: 0 },
  ]);
  expect(c.marks).toEqual([0, 1, 2]);
  await expect.poll(() => linked(page)).toEqual(c);
  // the arc's rim and core, neither dashed
  expect(await dashed(page)).toEqual({ strokes: 0, arcs: 0 });
  expect(await curved(page)).toBe(2);

  // a Shift-click on the last stop takes it back as a plain one does, and a plain click there leaps
  await shiftClick(page, await top(page, [20, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(page.locator("#say")).toHaveText("Last stop removed.");
  await click(page, await top(page, [20, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops · 1 leap");
  await page.keyboard.press("Backspace");
  await expect(line(page)).toHaveText("Route planner · 2 stops");

  // the far block one lower: the jump comes down on it
  await laid(page, [20, 17, 17], null);
  await laid(page, [20, 17, 18], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await shiftClick(page, await top(page, [20, 17, 18]));
  await expect(line(page)).toHaveText("Route planner · 3 stops · 1 jump");
  c = await route(page);
  expect(c.steps[1]).toEqual({ k: east, o: JUMP, d: 1 });
  expect(c.stations[2]).toEqual({ cell: [20, 17, 18], face: 0 });
  await expect.poll(() => linked(page)).toEqual(c);
  expect(await curved(page)).toBe(2);
  expect(errors).toEqual([]);
});

test("Undo and Redo step the route's changes back and forward, from the strip and the keyboard, a new stop letting the redo go", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  const undoBtn = page.locator("#courseUndo");
  const redoBtn = page.locator("#courseRedo");
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeDisabled();
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const two = await route(page);
  await click(page, await top(page, [20, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  const three = await route(page);
  await expect(undoBtn).toBeEnabled();
  await expect(redoBtn).toBeDisabled();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(page.locator("#say")).toHaveText("Undid adding stop 3 on the top of 20,15,17.");
  expect(await route(page)).toEqual(two);
  await expect(redoBtn).toBeEnabled();
  await expect.poll(() => linked(page)).toEqual(two);
  await page.keyboard.press("Control+Shift+z");
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  await expect(page.locator("#say")).toHaveText("Redid adding stop 3 on the top of 20,15,17.");
  expect(await route(page)).toEqual(three);
  await expect(redoBtn).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await page.keyboard.press("Control+y");
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  expect(await route(page)).toEqual(three);

  // the buttons: two undos take the route away, and the redos bring it back change by change
  await undoBtn.click();
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await undoBtn.click();
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  await expect(page.locator("#say")).toHaveText("Undid adding stop 2 on the top of 17,15,17.");
  expect(await route(page)).toBeNull();
  await expect(undoBtn).toBeDisabled();
  await expect(redoBtn).toBeEnabled();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33$/);
  await redoBtn.click();
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  expect(await route(page)).toEqual(two);
  await redoBtn.click();
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  await expect(redoBtn).toBeDisabled();

  // Clear, then Undo puts the route back whole
  await page.locator("#courseClear").click();
  await page.locator("#courseClear").click();
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  await expect(undoBtn).toBeEnabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  await expect(page.locator("#say")).toHaveText("Undid clearing the route.");
  expect(await route(page)).toEqual(three);
  await expect(redoBtn).toBeEnabled();

  // Backspace and a click on the last stop still take it back, changes Undo takes back in turn
  await page.keyboard.press("Backspace");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(page.locator("#say")).toHaveText("Last stop removed.");
  await expect(redoBtn).toBeDisabled();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#say")).toHaveText("Undid taking the last stop back.");
  expect(await route(page)).toEqual(three);
  await click(page, await top(page, [20, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 3 stops");

  // a new stop after an undo lets the redo go
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect(redoBtn).toBeEnabled();
  await click(page, await top(page, [18, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  await expect(redoBtn).toBeDisabled();
  await expect.poll(() => linked(page)).toEqual(await route(page));
  expect(errors).toEqual([]);
});

test("the planner's undo keys yield to the editor's undo keys while editing", async ({ page }) => {
  const errors = trackErrors(page);
  await draft(page);
  await page.keyboard.press("r");
  await click(page, await top(page, [18, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const c = await route(page);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await click(page, await top(page, [20, 17, 17]));
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await expect(page.locator("#say")).toHaveText("Undid placed a block at 20, 17, 16");
  expect(await route(page)).toEqual(c);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  expect(await route(page)).toEqual(c);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  expect(await route(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("a stop is refused on a face that looks into a block, and the planner yields while editing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await draft(page);
  await page.keyboard.press("r");
  // a block the slice hides still stands over the start's top
  await laid(page, [17, 17, 16], { kind: 0 });
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 17);
  });
  await click(page, await top(page, [17, 17, 17]));
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "That face looks into another block.",
  ]);
  await expect(status(page)).toHaveText("That face looks into another block.");
  await expect(status(page)).not.toHaveClass(/\bhint\b/);
  expect(await route(page)).toBeNull();
  await expect(line(page)).toHaveText("Route planner · 0 stops");

  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText("Leave editing to plan a route.");
  await expect(line(page)).toBeHidden();
  await expect(page.locator("#courseUndo")).toBeHidden();
  await click(page, await top(page, [20, 17, 17]));
  await expect(page.locator("#chipLine")).toContainText("5 blocks");
  expect(await route(page)).toBeNull();
  await page.keyboard.press("w");
  await expect(status(page)).toHaveText(/a face to add a stop/);
  await expect(line(page)).toBeVisible();
  await expect(page.locator("#courseUndo")).toBeVisible();
  expect(errors).toEqual([]);
});

test("r turns the brush while editing and the planner's switch otherwise", async ({ page }) => {
  const errors = trackErrors(page);
  await draft(page);
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("r");
  await expect(page.locator("#say")).toHaveText("Brush facing 2 of 4");
  await expect(page.locator("#showCourse")).not.toBeChecked();
  await expect(strip(page)).toBeHidden();
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  await expect(strip(page)).toBeVisible();
  // with the planner on, editing still takes the key
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("r");
  await expect(page.locator("#say")).toHaveText("Brush facing 3 of 4");
  await expect(page.locator("#showCourse")).toBeChecked();
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).not.toBeChecked();
  await expect(strip(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test("the route is kept with its level in this browser, the switch off, and Back to an entry without it keeps it", async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).toContainText("LEVEL 2");
  await page.keyboard.press("[");
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  await page.keyboard.press("r");
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const c = await route(page);
  await expect.poll(() => page.url()).toMatch(SEGMENT);
  await expect.poll(async () => (await kept(page))?.by?.["HIRO/0"]?.c).toMatch(/^r/);
  expect(await kept(page)).toMatchObject({ version: 1 });

  // a fresh document on the level, its link without the segment
  const again = await context.newPage();
  const more = trackErrors(again);
  await again.goto(LEVEL);
  await settle(again);
  await expect(again.locator("#showCourse")).not.toBeChecked();
  expect(await route(again)).toEqual(c);
  await expect(strip(again)).toBeVisible();
  await expect(line(again)).toHaveText("Route planner · 2 stops");
  await expect(status(again)).toHaveText("");
  await expect.poll(() => again.url()).toMatch(SEGMENT);
  await click(again, await top(again, [20, 15, 17]));
  expect(await route(again)).toEqual(c);
  await expect(again.locator("#detail")).toContainText("cell 20,15,17");
  expect(more).toEqual([]);
  await again.close();

  // the entries behind: LEVEL 1 before the route, LEVEL 2, and LEVEL 1 with it
  await page.goBack();
  await expect(page.locator("#chip")).toContainText("LEVEL 2");
  expect(await route(page)).toBeNull();
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  await page.goBack();
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  expect(await route(page)).toEqual(c);
  await expect.poll(() => page.url()).toMatch(SEGMENT);

  await page.locator("#courseClear").click();
  await expect(page.locator("#courseClear")).toHaveText("Clear?");
  expect(await route(page)).toEqual(c);
  await page.locator("#courseClear").click();
  await expect(page.locator("#say")).toHaveText("Route cleared.");
  expect(await route(page)).toBeNull();
  await expect(line(page)).toHaveText("Route planner · 0 stops");
  await expect.poll(async () => (await kept(page)).by).toEqual({});
  expect(errors).toEqual([]);
});

test("a link's segment replaces the kept route, and the store follows a draft moved to a new id", async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const first = await route(page);
  await expect.poll(() => page.url()).toMatch(SEGMENT);
  const url = page.url();
  await click(page, await top(page, [20, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 3 stops");
  await expect.poll(async () => (await kept(page)).by["HIRO/0"].c).not.toBe(url.split("/").at(-1));
  const again = await context.newPage();
  await again.goto(url);
  await settle(again);
  expect(await route(again)).toEqual(first);
  await expect.poll(async () => (await kept(again)).by["HIRO/0"].c).toBe(url.split("/").at(-1));
  await again.close();

  // a draft's route rides under the draft's id, and follows it when another tab's copy moves it
  const draftId = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return state.lvl.draft;
    });
  const stored = async (id) => (await kept(page)).by[`DRAFT/${id}`]?.c;
  await draft(page);
  await expect(page.locator("#showCourse")).toBeChecked();
  await click(page, await plusX(page, [20, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops · 1 leap");
  const a = await draftId();
  await expect.poll(() => stored(a)).toMatch(/^r/);
  const leaping = await stored(a);
  await draft(page);
  await click(page, await top(page, [18, 17, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  const b = await draftId();
  await expect.poll(() => stored(b)).toMatch(/^r/);
  const rolling = await stored(b);
  expect(rolling).not.toBe(leaping);
  // two drafts swap ids: every pair is read before any is dropped
  await page.evaluate(
    async (pairs) => {
      const { emit } = await import(new URL("js/viewer/ui/dom.js", location.href).href);
      emit("drafts-moved", pairs);
    },
    [
      [a, b],
      [b, a],
    ],
  );
  await expect.poll(() => stored(b)).toBe(leaping);
  expect(await stored(a)).toBe(rolling);
  expect(errors).toEqual([]);
});

test("an entry another tab left malformed is dropped from the store, and the rest kept", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.evaluate(() =>
    localStorage.setItem(
      "kula.course",
      JSON.stringify({
        version: 1,
        by: {
          "HIRO/1": null,
          "HIRO/2": { at: "soon", c: "rstuv" },
          "HIRO/3": { at: 5, c: "rwxyz" },
          "HIRO/4": { at: 6 },
        },
      }),
    ),
  );
  await still(page);
  await page.keyboard.press("r");
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await expect
    .poll(async () => Object.keys((await kept(page)).by).sort())
    .toEqual(["HIRO/0", "HIRO/3"]);
  expect((await kept(page)).by["HIRO/3"]).toEqual({ at: 5, c: "rwxyz" });
  expect(errors).toEqual([]);
});

test("the Copy link button writes the link with the route to the clipboard", async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  await click(page, await top(page, [17, 15, 17]));
  await expect(line(page)).toHaveText("Route planner · 2 stops");
  await page.locator("#courseCopy").click();
  await expect(page.locator("#toastStack .toast")).toHaveText(["Link copied."]);
  await expect(page.locator("#say")).toHaveText("Link copied.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  expect(copied).toMatch(SEGMENT);
  expect(errors).toEqual([]);
});

test.describe("with a touch screen", () => {
  test.use({ hasTouch: true });

  test("a tap on a face adds a stop, and a long press opens the block's panel instead", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(LEVEL);
    await settle(page);
    await still(page);
    await page.keyboard.press("r");
    const face = await top(page, [17, 15, 17]);
    await page.touchscreen.tap(face.x, face.y);
    await expect(line(page)).toHaveText("Route planner · 2 stops");
    await expect(page.locator("#say")).toHaveText("Stop 2 added on the top of 17,15,17.");
    await expect(page.locator("#detail")).toBeHidden();
    await hold(page, await top(page, [20, 15, 17]));
    await expect(page.locator("#detail")).toContainText("cell 20,15,17");
    await expect(line(page)).toHaveText("Route planner · 2 stops");
    expect((await route(page)).stations.at(-1)).toEqual({ cell: [17, 15, 17], face: 0 });
    expect(errors).toEqual([]);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  test("the strip stands clear of the fit button and the compass, with the hint, after a roll and with the leap's notice", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await page.goto(LEVEL);
    await settle(page);
    await still(page);
    await page.keyboard.press("r");
    await expect(strip(page)).toBeVisible();
    await expect(status(page)).toHaveText(
      "Tap a face to add a stop; the shortest roll joins it to the last.",
    );
    const clear = () =>
      expect
        .poll(async () => {
          const [s, f, c] = await Promise.all(
            ["#course", "#fitBtn", "#compass"].map((id) => page.locator(id).boundingBox()),
          );
          return overlaps(s, f) || overlaps(s, c);
        })
        .toBe(false);
    await expect(status(page)).toHaveText(/a face to add a stop/);
    await clear();
    const face = await top(page, [17, 15, 17]);
    await page.touchscreen.tap(face.x, face.y);
    await expect(line(page)).toHaveText("Route planner · 2 stops");
    await expect(status(page)).toHaveText("");
    await clear();
    const side = await plusX(page, [17, 13, 17]);
    await page.touchscreen.tap(side.x, side.y);
    await expect(line(page)).toHaveText("Route planner · 3 stops · 1 leap");
    await expect(status(page)).toHaveText("No roll reaches that face; a leap joins them.");
    await clear();
    expect(errors).toEqual([]);
  });
});
