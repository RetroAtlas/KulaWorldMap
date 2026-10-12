import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const HOME = [17, 17, 17];

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
const click = async (page, point) => page.mouse.click(point.x, point.y);
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const doc = (page) =>
  page.evaluate(async () => {
    const [{ state }, { get }] = await Promise.all(
      ["state.js", "drafts.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return get(state.lvl.draft).doc;
  });
const blockAt = (d, cell) => d.blocks.find((b) => b.cell.join() === cell.join()) ?? null;
const selected = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const s = state.selected;
    return s && { cell: [s.x, s.y, s.z], face: s.face ?? null };
  });
const steps = (page) =>
  page.evaluate(async () => {
    const [{ state }, { steps }] = await Promise.all(
      ["state.js", "trail.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return steps(state.lvl.draft);
  });
const hidden = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return [...state.hiddenKinds];
  });
const form = (page) => page.locator("#detail .form");
const field = (page, name) => page.locator(`#detail [data-field="${name}"]`);
/** Put a block in the store directly, as another tab's edit would. */
const lay = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock }] = await Promise.all(
        ["state.js", "drafts.js", "project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, setBlock(get(id).doc, cell, block));
    },
    [cell, block],
  );

/** Select a cell as the hit test would, through the panel's own entry. */
const select = (page, cell) =>
  page.evaluate(async (cell) => {
    const [{ state, cellKey }, { showCell }] = await Promise.all(
      ["state.js", "detail.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    showCell(state.idx.cells.get(cellKey(...cell)));
  }, cell);
const PLATFORM = { kind: 5, far: [18, 21, 17], length: 2, speed: 30 };
const LASER = { kind: 8, far: [22, 18, 17], colour: 2 };

/** A new draft, editing on with the Select tool, the form wired, and its block selected on its top. */
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
  await expect(form(page)).toBeVisible();
}

test("the form stands on a selected block of the draft while editing, and goes with the mode", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await expect(page.locator("#detail .faces button")).toHaveCount(6);
  await expect(field(page, "face-0")).toHaveAttribute("aria-pressed", "true");
  await expect(field(page, "face-0").locator(".dot")).toHaveCount(1);
  await expect(field(page, "face-1").locator(".dot")).toHaveCount(0);
  await expect(field(page, "kind")).toHaveValue("0");
  await expect(field(page, "thing")).toHaveValue("t30");
  const raw = page.locator("#detail details.raw");
  await expect(raw).toHaveCount(1);
  expect(await raw.evaluate((d) => d.open)).toBe(false);
  await expect(raw.locator("table")).toHaveCount(2);
  await expect(page.locator("#detail .card h4")).toHaveText(["Block", "The top"]);
  await expect(page.locator("#detail .circuit")).toHaveCount(0);
  await expect(page.locator("#detail .plays, #detail .counts, #detail .findings")).toHaveCount(0);

  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(form(page)).toHaveCount(0);
  await expect(page.locator("#detail details.raw")).toHaveCount(0);
  await expect(page.locator("#detail table")).toHaveCount(2);
  await page.keyboard.press("w");
  await expect(form(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("the face row chooses a face, and a face that looks into a block is greyed and says which", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-1").click();
  expect(await selected(page)).toEqual({ cell: HOME, face: 1 });
  await expect(field(page, "face-1")).toHaveAttribute("aria-pressed", "true");
  await expect(field(page, "face-0")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#detail .card h4").nth(1)).toHaveText("The +x side");
  await expect(field(page, "face-1")).toBeFocused();
  await expect(field(page, "thing")).toHaveValue("");
  // the signs are spelled out for a reader, which would drop them
  await expect(field(page, "face-1")).toHaveAccessibleName("plus x side");
  await expect(field(page, "face-3")).toHaveAccessibleName("minus y side");
  await expect(field(page, "face-5")).toHaveAccessibleName("underside");

  await lay(page, [18, 17, 17], { kind: 0 });
  await expect(field(page, "face-1")).toBeDisabled();
  await expect(field(page, "face-1")).toHaveAttribute(
    "title",
    "+x side: looks into the block at 18, 17, 17",
  );
  await expect(field(page, "face-1")).toHaveAccessibleName(
    "plus x side, looks into the block at 18, 17, 17",
  );
  // the face stays chosen through the update, and its card says what it looks into
  await expect(page.locator("#detail .card h4")).toHaveText(["Block", "The +x side"]);
  await expect(page.locator("#detail .card").nth(1)).toContainText(
    "This face looks into the block at 18, 17, 17.",
  );
  expect(await selected(page)).toEqual({ cell: HOME, face: 1 });
  expect(errors).toEqual([]);
});

test("the kind select changes the kind as one step that undo takes back, and keeps the focus", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "kind").focus();
  await field(page, "kind").selectOption("2");
  expect(blockAt(await doc(page), HOME).kind).toBe(2);
  expect(await steps(page)).toEqual({ past: 1, future: 0 });
  await expect(page.locator("#say")).toHaveText("Changed the block at 17, 17, 17 to an ice block");
  await expect(field(page, "kind")).toHaveValue("2");
  await expect(field(page, "kind")).toBeFocused();
  await expect(field(page, "face-0")).toHaveAttribute("aria-pressed", "true");

  await lay(page, [19, 17, 17], { kind: 0, faces: { 0: { type: 31 } } });
  await click(page, await top(page, [19, 17, 17]));
  await expect(field(page, "kind")).toHaveValue("0");
  await field(page, "kind").selectOption("6");
  const brittle = blockAt(await doc(page), [19, 17, 17]);
  expect([brittle.kind, brittle.faces]).toEqual([6, undefined]);
  await expect(page.locator("#say")).toHaveText(
    "Changed the block at 19, 17, 17 to a crumbling block, taking what stood on it",
  );
  await expect(page.locator("#detail .card").nth(1)).toContainText("Nothing stands on");

  await click(page, await top(page, HOME));
  await field(page, "kind").selectOption("6");
  await expect(page.locator("#toastStack .toast").first()).toHaveText("No start.");
  await expect(field(page, "kind")).toHaveValue("2");
  expect(blockAt(await doc(page), HOME).kind).toBe(2);

  await page.keyboard.press("Control+z");
  expect(blockAt(await doc(page), [19, 17, 17]).faces[0].type).toBe(31);
  await page.keyboard.press("Control+z");
  const back = blockAt(await doc(page), HOME);
  expect([back.kind, back.faces[0].type]).toEqual([0, 30]);
  expect(await steps(page)).toEqual({ past: 0, future: 2 });
  expect(errors).toEqual([]);
});

test("a run's own block types a platform's length and speed or picks a laser's colour, shows the axis and the far end, and the run's other cell names it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await lay(page, [18, 17, 17], PLATFORM);
  await select(page, [18, 17, 17]);
  await expect(field(page, "kind")).toBeDisabled();
  await expect(field(page, "kind")).toHaveValue("5");
  await expect(page.locator("#detail .field .value")).toHaveText(["y", "18, 21, 17"]);
  await expect(field(page, "length")).toHaveValue("2");
  await expect(field(page, "speed")).toHaveValue("30");
  await field(page, "length").fill("3");
  await field(page, "length").press("Enter");
  expect(blockAt(await doc(page), [18, 17, 17]).length).toBe(3);
  await expect(page.locator("#say")).toHaveText(
    "Set the length of the moving platform at 18, 17, 17 to 3",
  );
  await expect(field(page, "length")).toHaveValue("3");
  await expect(field(page, "length")).toBeFocused();
  await field(page, "speed").fill("0");
  await field(page, "speed").press("Enter");
  await expect(field(page, "speed")).toHaveValue("30");
  await field(page, "speed").fill("");
  await field(page, "speed").press("Enter");
  await expect(field(page, "speed")).toHaveValue("30");
  expect(blockAt(await doc(page), [18, 17, 17]).speed).toBe(30);
  // a length the lattice or the game's grid cannot hold is refused, said, and the field put back
  for (const [bad, why] of [
    ["32767", "A platform 32767 blocks long, which the lattice cannot hold."],
    ["8", "A platform 8 blocks long, more than the 7 the game's grid holds."],
  ]) {
    await field(page, "length").fill(bad);
    await field(page, "length").press("Enter");
    await expect(page.locator("#toastStack .toast").first()).toHaveText(why);
    await expect(page.locator("#toolStatus")).toHaveText(why);
    await expect(field(page, "length")).toHaveValue("3");
    expect(blockAt(await doc(page), [18, 17, 17]).length).toBe(3);
  }
  expect(await steps(page)).toEqual({ past: 1, future: 0 });

  await lay(page, [17, 18, 17], LASER);
  await click(page, await top(page, [17, 18, 17]));
  await expect(field(page, "kind")).toBeDisabled();
  await expect(field(page, "kind")).toHaveValue("8");
  await expect(page.locator("#detail .field .value")).toHaveText(["x", "22, 18, 17"]);
  await expect(field(page, "laser-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#detail .card").nth(1)).toContainText("Nothing stands on");
  // the laser's block shows the circuit of its own colour, and that one alone
  await expect(page.locator("#detail .circuit")).toHaveCount(1);
  await expect(field(page, "circuit-2")).toHaveText("starts on");
  await expect(page.locator("#detail .circuit .members")).toHaveText("1 laser");
  // a switch under a platform's face stands on nothing, so the circuit does not count it
  await lay(page, [20, 21, 17], {
    ...PLATFORM,
    far: [20, 25, 17],
    faces: { 0: { type: 9, variant: 2 } },
  });
  await select(page, [17, 18, 17]);
  await expect(page.locator("#detail .circuit .members")).toHaveText("1 laser");
  await field(page, "laser-3").click();
  expect(blockAt(await doc(page), [17, 18, 17]).colour).toBe(3);
  await expect(page.locator("#say")).toHaveText("Set the laser at 17, 18, 17 to red");
  await expect(field(page, "laser-3")).toHaveAttribute("aria-pressed", "true");
  await expect(field(page, "circuit-2")).toHaveCount(0);
  await expect(field(page, "circuit-3")).toHaveText("starts on");
  await expect(page.locator("#detail .circuit .members")).toHaveText("1 laser");
  await field(page, "circuit-3").click();
  expect((await doc(page)).circuits).toEqual({ 3: "off" });
  await expect(field(page, "circuit-3")).toHaveText("starts off");
  await expect(page.locator("#say")).toHaveText("Turned the red circuit off");

  await select(page, [22, 18, 17]);
  await expect(field(page, "kind")).toBeDisabled();
  await expect(page.locator("#detail .card").first()).toContainText(
    "Part of the run of the block at 17, 18, 17.",
  );
  await expect(page.locator("#detail .faces")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a vanishing block's phase is set from its select, and a teleporter says where it leads", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await lay(page, [19, 17, 17], { kind: 7, phase: 1 });
  await select(page, [19, 17, 17]);
  await expect(field(page, "kind")).toHaveValue("7");
  await expect(field(page, "phase")).toHaveValue("1");
  await expect(field(page, "phase").locator("option")).toHaveText(["0", "1", "2", "3"]);
  await field(page, "phase").focus();
  await field(page, "phase").selectOption("2");
  expect(blockAt(await doc(page), [19, 17, 17]).phase).toBe(2);
  await expect(page.locator("#say")).toHaveText(
    "Set the phase of the vanishing block at 19, 17, 17 to 2",
  );
  await expect(field(page, "phase")).toHaveValue("2");
  await expect(field(page, "phase")).toBeFocused();
  await page.locator("#undoBtn").click();
  expect(blockAt(await doc(page), [19, 17, 17]).phase).toBe(1);
  await expect(field(page, "phase")).toHaveValue("1");

  const leads = page
    .locator("#detail .field", { has: page.locator("span", { hasText: /^Leads to$/ }) })
    .locator(".value");
  await lay(page, HOME, {
    kind: 0,
    faces: { 0: { type: 30, facing: 3 }, 1: { type: 5, variant: 0, facing: 1 } },
  });
  await click(page, await top(page, HOME));
  await field(page, "face-1").click();
  await expect(leads).toHaveText("itself");
  await lay(page, [20, 20, 17], { kind: 0, faces: { 0: { type: 5, variant: 0, facing: 1 } } });
  await field(page, "face-1").click();
  await expect(leads).toHaveText("20, 20, 17, top");
  await select(page, [20, 20, 17]);
  await field(page, "face-0").click();
  await expect(leads).toHaveText("17, 17, 17, +x side");
  await expect(field(page, "circuit-0")).toHaveText("starts on");
  await expect(page.locator("#detail .circuit .members")).toHaveText("2 teleporters");
  expect(errors).toEqual([]);
});

test("what stands here puts a thing on the face, nothing takes it off, and a device on ice is refused", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-1").click();
  await field(page, "thing").focus();
  await field(page, "thing").selectOption("t31");
  expect(blockAt(await doc(page), HOME).faces[1]).toEqual({ type: 31 });
  await expect(page.locator("#say")).toHaveText("Set the +x side of 17, 17, 17 to a key");
  await expect(field(page, "thing")).toHaveValue("t31");
  await expect(field(page, "thing")).toBeFocused();
  await expect(field(page, "face-1").locator(".dot")).toHaveCount(1);
  await expect(page.locator("#detail .circuit")).toHaveCount(0);

  await field(page, "thing").selectOption("");
  expect(blockAt(await doc(page), HOME).faces[1]).toBeUndefined();
  await expect(page.locator("#say")).toHaveText("Removed the key from the +x side of 17, 17, 17");

  await field(page, "kind").selectOption("2");
  await expect(field(page, "face-1")).toHaveAttribute("aria-pressed", "true");
  await field(page, "thing").selectOption("t5/0");
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "A teleporter works on a plain block only.",
  );
  await expect(field(page, "thing")).toHaveValue("");
  expect(blockAt(await doc(page), HOME).faces[1]).toBeUndefined();
  await expect(page.locator("#say")).toHaveText("Changed the block at 17, 17, 17 to an ice block");
  await field(page, "thing").selectOption("t7");
  await expect(page.locator("#toastStack .toast").first()).toHaveText(
    "An exit works on a plain block only.",
  );
  expect(await steps(page)).toEqual({ past: 3, future: 0 });
  expect(errors).toEqual([]);
});

test("what stands here names a fruit of any type by the fruit row, and a thing with no row by its number, disabled", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await lay(page, HOME, {
    kind: 0,
    faces: { 0: { type: 30, facing: 3 }, 1: { type: 43 }, 2: { type: 4 } },
  });
  await field(page, "face-1").click();
  await expect(field(page, "thing")).toHaveValue("t46");
  await expect(field(page, "thing").locator("option:disabled")).toHaveCount(0);
  await field(page, "face-2").click();
  await expect(field(page, "thing")).toHaveValue("t4");
  const odd = field(page, "thing").locator("option:disabled");
  await expect(odd).toHaveText(["type 4"]);
  await expect(field(page, "thing").locator("option:checked")).toHaveText("type 4");
  // nothing takes it off as it takes any other thing off
  await field(page, "thing").selectOption("");
  expect(blockAt(await doc(page), HOME).faces[2]).toBeUndefined();
  await expect(page.locator("#say")).toHaveText(
    "Removed the type 4 from the +y side of 17, 17, 17",
  );
  expect(errors).toEqual([]);
});

test("a thing of a hidden kind put on a face brings the kind back as the map and the legend redraw", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-1").click();
  await field(page, "thing").selectOption("t31");
  const legendRow = page.locator("#kinds button.kind[data-kind='t31']");
  await legendRow.click();
  await expect(legendRow).toHaveAttribute("aria-pressed", "false");
  expect(await hidden(page)).toEqual(["t31"]);

  await field(page, "face-2").click();
  await field(page, "thing").selectOption("t31");
  expect(blockAt(await doc(page), HOME).faces[2]).toEqual({ type: 31 });
  expect(await legendRow.getAttribute("aria-pressed")).toBe("true");
  expect(await hidden(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the facing buttons turn the start, and a switch's swatches and its circuit row set its colour and its state", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await expect(page.locator('#detail .facing button[aria-pressed="true"]')).toHaveCount(1);
  // the head's row is the block's faces, the thing's four ways its facing
  await expect(page.locator('#detail [role="group"][aria-label="Faces"]')).toHaveCount(1);
  await expect(page.locator('#detail [role="group"][aria-label="Faces"] .dot')).toHaveCount(1);
  await expect(page.locator('#detail [role="group"][aria-label="Facing"]')).toHaveCount(1);
  const caption = page.locator('#detail [role="group"][aria-label="Facing"] > span').first();
  await expect(caption).toHaveText("Facing");
  await caption.click();
  expect(blockAt(await doc(page), HOME).faces[0].facing).toBe(3);
  expect(await steps(page)).toEqual({ past: 0, future: 0 });
  await field(page, "facing-2").click();
  expect(blockAt(await doc(page), HOME).faces[0].facing).toBe(2);
  await expect(field(page, "facing-2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#say")).toContainText("Turned the start on the top of 17, 17, 17 to");
  await expect(field(page, "facing-2")).toBeFocused();

  await field(page, "face-1").click();
  await field(page, "thing").selectOption("t9/0");
  expect(blockAt(await doc(page), HOME).faces[1]).toEqual({ type: 9, variant: 0 });
  const circuit = page.locator("#detail .circuit");
  await expect(circuit).toHaveCount(1);
  await expect(circuit.locator(".members")).toHaveText("1 switch");
  await expect(field(page, "circuit-0")).toHaveText("starts on");
  await expect(field(page, "circuit-0")).toHaveAttribute("aria-pressed", "true");
  await expect(field(page, "circuit-0")).toHaveAccessibleName("yellow circuit");
  await expect(page.locator('#detail [role="group"][aria-label="Circuit"]')).toHaveCount(1);
  await expect(circuit.locator(".lamp")).toHaveAccessibleName("yellow");
  await field(page, "variant-2").click();
  expect(blockAt(await doc(page), HOME).faces[1]).toEqual({ type: 9, variant: 2 });
  await expect(page.locator("#say")).toHaveText(
    "Set the +x side of 17, 17, 17 to a switch (green)",
  );
  await expect(field(page, "circuit-0")).toHaveCount(0);
  await expect(field(page, "circuit-2")).toHaveText("starts on");
  await expect(field(page, "circuit-2")).toHaveAccessibleName("green circuit");
  await expect(circuit.locator(".members")).toHaveText("1 switch");
  await expect(circuit.locator(".lamp")).toHaveAccessibleName("green");

  await field(page, "circuit-2").click();
  expect((await doc(page)).circuits).toEqual({ 2: "off" });
  await expect(field(page, "circuit-2")).toHaveText("starts off");
  await expect(field(page, "circuit-2")).toHaveAttribute("aria-pressed", "false");
  await expect(field(page, "circuit-2")).toHaveAccessibleName("green circuit");
  await expect(page.locator("#say")).toHaveText("Turned the green circuit off");
  await expect(field(page, "circuit-2")).toBeFocused();
  await field(page, "circuit-2").click();
  expect((await doc(page)).circuits).toEqual({});
  expect(errors).toEqual([]);
});

test("the swatch row is labelled by what it chooses, a coin's worth shown on each, a gem's colour or a phase", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-1").click();
  const label = page.locator('#detail .field:has([data-field="variant-0"]) > span').first();
  const swatches = page.locator("#detail .swatches button");
  await field(page, "thing").selectOption("t37/0");
  await expect(label).toHaveText("Worth");
  await expect(swatches).toHaveText(["750", "500", "250"]);
  await expect(field(page, "variant-1")).toHaveAttribute("aria-label", "Coin (blue)");
  // the caption names the row and presses nothing
  await expect(page.locator('#detail [role="group"][aria-label="Worth"]')).toHaveCount(1);
  await expect(field(page, "variant-0")).toHaveAccessibleName("Coin (gold)");
  const before = await steps(page);
  await label.click();
  expect(await steps(page)).toEqual(before);
  expect(blockAt(await doc(page), HOME).faces[1]).toEqual({ type: 37, variant: 0 });
  await field(page, "variant-2").click();
  expect(blockAt(await doc(page), HOME).faces[1]).toEqual({ type: 37, variant: 2 });
  await expect(page.locator("#say")).toHaveText("Set the +x side of 17, 17, 17 to a coin (bronze)");
  await expect(field(page, "variant-2")).toHaveAttribute("aria-pressed", "true");

  await field(page, "thing").selectOption("t36/0");
  await expect(label).toHaveText("Colour");
  await expect(swatches).toHaveText(["", "", ""]);
  await field(page, "thing").selectOption("t11");
  await expect(label).toHaveText("Phase");
  await expect(swatches).toHaveText(["0", "1", "2", "3"]);
  expect(errors).toEqual([]);
});

test("the two buttons place through the editor", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await field(page, "face-3").click();
  await field(page, "build").click();
  expect(blockAt(await doc(page), [17, 16, 17])).toEqual({ cell: [17, 16, 17], kind: 0 });
  expect(await selected(page)).toEqual({ cell: [17, 16, 17], face: null });
  await expect(page.locator("#say")).toHaveText("Placed a block at 17, 16, 17");

  await click(page, await top(page, HOME));
  await field(page, "face-1").click();
  await expect(field(page, "place")).toHaveText("Place a block here");
  await field(page, "place").click();
  expect(blockAt(await doc(page), [18, 17, 17])).toEqual({ cell: [18, 17, 17], kind: 0 });
  await expect(page.locator("#say")).toHaveText("Placed a block at 18, 17, 17");
  expect(await steps(page)).toEqual({ past: 2, future: 0 });

  // the button names the brush, and a run's brush leaves it to the map
  await click(page, await top(page, HOME));
  await field(page, "face-2").click();
  await page.locator("#palette .tabs button", { hasText: "Pickups" }).click();
  await page.locator('#palette .rows button[data-id="t31"]').click();
  await expect(field(page, "place")).toHaveText("Place a key here");
  await expect(field(page, "place")).toHaveAttribute(
    "title",
    "Put a key against this face, as a click would",
  );
  await field(page, "place").click();
  expect(blockAt(await doc(page), HOME).faces[2]).toEqual({ type: 31 });
  await expect(page.locator("#say")).toHaveText("Placed a key on the +y side of 17, 17, 17");
  await expect(field(page, "thing")).toHaveValue("t31");
  await page.locator("#palette .tabs button", { hasText: "Blocks" }).click();
  await page.locator('#palette .rows button[data-id="k8/2"]').click();
  await expect(field(page, "build")).toBeEnabled();
  await expect(field(page, "place")).toHaveCount(0);
  await page.locator('#palette .rows button[data-id="k5"]').click();
  await expect(field(page, "place")).toHaveCount(0);
  await expect(field(page, "build")).toBeEnabled();
  await page.locator('#palette .rows button[data-id="k2"]').click();
  await expect(field(page, "place")).toHaveText("Place an ice block here");
  expect(errors).toEqual([]);
});
