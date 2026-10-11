import { test, expect } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";

const EDIT = "/#HIRO/0/45,35/fit/33";
const START = [17, 17, 17];

const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const s = state.selected;
    return {
      selected: s && [s.x, s.y, s.z],
      face: s?.face ?? null,
      hidden: [...state.hiddenKinds],
    };
  });
const doc = (page) =>
  page.evaluate(async () => {
    const [{ state }, { get }] = await Promise.all(
      ["state.js", "drafts.js"].map((p) => import(new URL(`js/${p}`, location.href).href)),
    );
    return get(state.lvl.draft).doc;
  });
const facesAt = async (page, cell) =>
  (await doc(page)).blocks.find((b) => b.cell.join() === cell.join())?.faces ?? {};
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
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
const plusY = (page, c) => at(page, c[0] + 0.5, c[1] + 1, c[2] + 0.5);
const toasts = (page) => page.locator("#toastStack .toast").allTextContents();
const tab = (page, name) => page.locator("#palette .tabs button", { hasText: name });
const row = (page, id) => page.locator(`#palette .rows button[data-id="${id}"]`);
const pressedRow = (page) => page.locator('#palette .rows button[aria-pressed="true"]');
const pressedTab = (page) => page.locator('#palette .tabs button[aria-pressed="true"]');
const pick = async (page, group, id) => {
  await tab(page, group).click();
  await row(page, id).click();
  await expect(row(page, id)).toHaveAttribute("aria-pressed", "true");
};
/** Give a cell a block of a kind straight through the store. */
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

async function fresh(page) {
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.keyboard.press("w");
  await expect(page.locator("#palette")).toBeVisible();
}

test("the palette's groups and rows come from the data, named as the legend names them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await expect(page.locator("#palette .tabs button")).toHaveText([
    "Blocks",
    "On the face",
    "Devices",
    "Hazards",
    "Pickups",
  ]);
  const groups = {};
  for (const name of ["Blocks", "On the face", "Devices", "Hazards", "Pickups"]) {
    await tab(page, name).click();
    groups[name] = await page.locator("#palette .rows button").evaluateAll((bs) =>
      bs.map((b) => ({
        id: b.dataset.id,
        label: [...b.childNodes].find((n) => n.tagName === "SPAN" && !n.className)?.textContent,
        icon: !!b.querySelector("canvas.icon"),
        title: b.title,
      })),
    );
  }
  const rows = Object.values(groups).flat();
  const expected = await page.evaluate(
    async (ids) => {
      const { kindName, markerLabel } = await import(new URL("js/data.js", location.href).href);
      const colour = (c) =>
        /\(([^)]*)\)/.exec(
          markerLabel({ type: 9, face: 0, f: Array(16).fill(0), variant: String(c) }),
        )[1];
      return ids.map((id) => {
        const k = /^k(\d+)(?:\/(\d))?$/.exec(id);
        if (k)
          return k[2] === undefined
            ? kindName(Number(k[1]))
            : `${kindName(Number(k[1]))} (${colour(k[2])})`;
        const [, type, variant] = /^t(\d+)(?:\/(\d))?$/.exec(id);
        return markerLabel({
          type: Number(type),
          face: 0,
          f: Array(16).fill(0),
          variant: variant ?? null,
        });
      });
    },
    rows.map((r) => r.id),
  );
  expect(rows.map((r) => r.label)).toEqual(expected);
  expect(groups.Blocks.map((r) => r.id)).toEqual([
    ...["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7"],
    ...["k8/0", "k8/1", "k8/2", "k8/3"],
  ]);
  expect(groups.Blocks.find((r) => r.id === "k8/0").label).toBe("Laser (yellow)");
  const ids = rows.map((r) => r.id);
  expect(ids).not.toContain("t4");
  expect(ids.filter((id) => /^t4[3-7]$/.test(id))).toEqual(["t46"]);
  expect(rows.find((r) => r.id === "t46").title).toContain("next fruit");
  expect(rows.find((r) => r.id === "t42").label).toBe("type 42");
  expect(rows.find((r) => r.id === "t42").title).not.toBe("type 42");
  expect(groups.Devices.map((r) => r.id)).toEqual([
    ...["t5/0", "t5/1", "t5/2", "t5/3", "t7"],
    ...["t9/0", "t9/1", "t9/2", "t9/3", "t10", "t26"],
  ]);
  expect(groups["On the face"].map((r) => r.id).sort()).toEqual(
    ["t1", "t2", "t8", "t28", "t29", "t30"].sort(),
  );
  expect(groups.Hazards.map((r) => r.id)).toEqual([
    "t11",
    "t12",
    "t50",
    "t51",
    "t52",
    "t53",
    "t56",
  ]);
  expect(groups.Pickups.map((r) => r.id)).toEqual([
    ...["t31", "t32", "t33", "t34", "t35", "t36/0", "t36/1", "t36/2"],
    ...["t37/0", "t37/1", "t37/2", "t38", "t42", "t46"],
  ]);
  expect(rows.every((r) => r.icon)).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
  // a row's digit is for the eye; its name is its label alone
  await expect(row(page, "t31")).toHaveAccessibleName("Key");
  await expect(row(page, "t31").locator("kbd")).toHaveText("1");
  // the rows are buttons in a group; every list on the page is made of list items
  const lists = await page
    .locator("[role=list]")
    .evaluateAll((ls) =>
      ls.map((l) =>
        [...l.children].every((c) => c.tagName === "LI" || c.getAttribute("role") === "listitem"),
      ),
    );
  expect(lists.length).toBeGreaterThan(0);
  expect(lists).not.toContain(false);
  await expect(pressedRow(page)).toHaveCount(0);
  await tab(page, "Blocks").click();
  await expect(pressedRow(page)).toHaveAttribute("data-id", "k0");
  expect(errors).toEqual([]);
});

test("a thing goes on the clicked face, is announced, and comes off again with undo", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Pickups", "t31");
  await expect(page.locator("#say")).toHaveText("Brush: Key");
  await click(page, await plusX(page, START));
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 }, 1: { type: 31 } });
  await expect(page.locator("#say")).toHaveText("Placed a key on the +x side of 17, 17, 17");
  expect((await shown(page)).selected).toEqual(START);
  await expect(page.locator("#kinds button.kind[data-kind='t31']")).toHaveCount(1);
  // a second thing on the same face takes the first one's place
  await pick(page, "Pickups", "t37/2");
  await click(page, await plusX(page, START));
  expect(await facesAt(page, START)).toEqual({
    0: { type: 30, facing: 3 },
    1: { type: 37, variant: 2 },
  });
  await page.keyboard.press("Control+z");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 }, 1: { type: 31 } });
  await page.keyboard.press("Control+z");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 } });
  await expect(page.locator("#say")).toHaveText("Undid placed a key on the +x side of 17, 17, 17");
  expect(errors).toEqual([]);
});

test("a device wants a plain block, a brittle block takes nothing, and a face into a block takes nothing", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const clear = async () => {
    const [strip, palette] = await Promise.all(
      ["#tools", "#palette"].map((s) => page.locator(s).boundingBox()),
    );
    expect(palette.y + palette.height).toBeLessThanOrEqual(strip.y);
    expect(palette.y + palette.height).toBeGreaterThan(strip.y - 12);
  };
  await clear();
  await lay(page, [18, 17, 17], 2);
  await pick(page, "Devices", "t5/0");
  await click(page, await top(page, [18, 17, 17]));
  expect(await toasts(page)).toContain("A teleporter works on a plain block only.");
  expect(await facesAt(page, [18, 17, 17])).toEqual({});
  await expect(page.locator("#toolStatus")).toHaveText("A teleporter works on a plain block only.");
  // the strip has grown by its line, and the palette stands on it still
  await clear();

  await lay(page, [18, 18, 17], 6);
  await pick(page, "Pickups", "t31");
  await click(page, await top(page, [18, 18, 17]));
  expect(await toasts(page)).toContain(
    "Nothing stands on a platform's, laser's, crumbling or vanishing block's faces.",
  );
  expect(await facesAt(page, [18, 18, 17])).toEqual({});

  await lay(page, [17, 17, 16], 0);
  await page.evaluate(async () => {
    const { SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 1 - 17);
  });
  await click(page, await top(page, START));
  expect(await toasts(page)).toContain("That face looks into another block.");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 } });
  expect(errors).toEqual([]);
});

test("digits press the shown group's rows, and j and k walk every row across the groups", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  const order = await page.evaluate(async () => {
    const { all } = await import(new URL("js/palette.js", location.href).href);
    return all().map((e) => [e.id, e.group]);
  });
  await tab(page, "Pickups").click();
  await page.keyboard.press("2");
  const pickups = order.filter(([, g]) => g === "Pickups");
  await expect(pressedRow(page)).toHaveAttribute("data-id", pickups[1][0]);
  await page.keyboard.press("k");
  const i = order.findIndex(([id]) => id === pickups[1][0]);
  await expect(pressedRow(page)).toHaveAttribute("data-id", order[i - 1][0]);
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(pressedRow(page)).toHaveAttribute("data-id", order[i + 1][0]);
  await expect(pressedTab(page)).toHaveText(order[i + 1][1]);
  // from the first block, k wraps to the last pickup
  await tab(page, "Blocks").click();
  await page.keyboard.press("1");
  await expect(pressedRow(page)).toHaveAttribute("data-id", "k0");
  await page.keyboard.press("k");
  await expect(pressedRow(page)).toHaveAttribute("data-id", order.at(-1)[0]);
  await expect(pressedTab(page)).toHaveText("Pickups");
  await expect(page.locator("#say")).toHaveText(/^Brush: /);
  expect(errors).toEqual([]);
});

test("a pressed tab or row keeps the focus, and a key's choice takes it where the focused row is gone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await tab(page, "Pickups").focus();
  await page.keyboard.press("Enter");
  await expect(pressedTab(page)).toHaveText("Pickups");
  await expect(tab(page, "Pickups")).toBeFocused();
  await row(page, "t31").focus();
  await page.keyboard.press("Enter");
  await expect(row(page, "t31")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, "t31")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row(page, "t32")).toBeFocused();
  // k steps the brush back into the group before, which the focused row is not in
  const order = await page.evaluate(async () => {
    const { all } = await import(new URL("js/palette.js", location.href).href);
    return all().map((e) => e.id);
  });
  await page.keyboard.press("k");
  const before = order[order.indexOf("t31") - 1];
  await expect(pressedRow(page)).toHaveAttribute("data-id", before);
  await expect(pressedTab(page)).not.toHaveText("Pickups");
  await expect(pressedRow(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test("r turns the selected thing where its kind faces, else what the brush will face", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.press("i");
  await click(page, await top(page, START));
  expect(await shown(page)).toMatchObject({ selected: START, face: 0 });
  await page.keyboard.press("r");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 4 } });
  await expect(page.locator("#say")).toHaveText("Turned the start on the top of 17, 17, 17");
  await page.keyboard.press("r");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 1 } });
  await page.keyboard.press("Shift+r");
  await page.keyboard.press("Shift+r");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 } });
  await page.keyboard.press("Control+z");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 4 } });
  await page.keyboard.press("Escape");
  await page.keyboard.press("r");
  await expect(page.locator("#say")).toHaveText("Brush facing 2 of 4");
  // a thing that faces is laid with the brush's facing
  await page.keyboard.press("a");
  await pick(page, "On the face", "t30");
  await click(page, await plusX(page, START));
  expect(await facesAt(page, START)).toMatchObject({ 1: { type: 30, facing: 2 } });
  expect(errors).toEqual([]);
});

test("Alt-click takes what is under the pointer as the brush", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.keyboard.down("Alt");
  await click(page, await top(page, START));
  await page.keyboard.up("Alt");
  await expect(pressedRow(page)).toHaveAttribute("data-id", "t30");
  await expect(pressedTab(page)).toHaveText("On the face");
  expect(await facesAt(page, START)).toEqual({ 0: { type: 30, facing: 3 } });
  const side = await plusX(page, START);
  await page.mouse.move(side.x, side.y);
  await expect(page.locator("#tip")).toContainText("Place a start on the +x side");
  await click(page, side);
  expect(await facesAt(page, START)).toMatchObject({ 1: { type: 30, facing: 3 } });

  await page.keyboard.down("Alt");
  await click(page, await plusY(page, START));
  await page.keyboard.up("Alt");
  await expect(pressedRow(page)).toHaveAttribute("data-id", "k0");
  await expect(pressedTab(page)).toHaveText("Blocks");
  await page.mouse.move(side.x, side.y);
  await expect(page.locator("#tip")).toContainText("Place a block on the +x side");
  expect(errors).toEqual([]);
});

test("Alt-click on a fruit of any type takes the fruit row, which stands for them all", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setFace }] = await Promise.all(
      ["state.js", "drafts.js", "project.js"].map(at),
    );
    const id = state.lvl.draft;
    update(id, setFace(get(id).doc, [17, 17, 17], 1, { type: 43 }));
  });
  await page.keyboard.down("Alt");
  await click(page, await plusX(page, START));
  await page.keyboard.up("Alt");
  await expect(pressedRow(page)).toHaveAttribute("data-id", "t46");
  await expect(pressedTab(page)).toHaveText("Pickups");
  expect(await facesAt(page, START)).toMatchObject({ 1: { type: 43 } });
  expect((await shown(page)).selected).toBe(null);
  expect(errors).toEqual([]);
});

test("placing a thing of a hidden kind brings the kind back, and the palette comes and goes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Pickups", "t31");
  await click(page, await plusX(page, START));
  const legendRow = page.locator("#kinds button.kind[data-kind='t31']");
  await legendRow.click();
  await expect(legendRow).toHaveAttribute("aria-pressed", "false");
  expect((await shown(page)).hidden).toEqual(["t31"]);
  await click(page, await plusY(page, START));
  expect(await facesAt(page, START)).toMatchObject({ 1: { type: 31 }, 2: { type: 31 } });
  expect((await shown(page)).hidden).toEqual([]);
  await expect(legendRow).toHaveAttribute("aria-pressed", "true");

  const toggle = page.locator("#paletteBtn");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(page.locator("#palette")).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("#palette")).toBeVisible();
  await page.keyboard.press("w");
  await expect(page.locator("#palette")).toBeHidden();
  await expect(toggle).toBeHidden();
  expect(errors).toEqual([]);
});

test("a name that begins with a vowel, or sounds as if it did, takes an", async ({ page }) => {
  const errors = trackErrors(page);
  await fresh(page);
  await pick(page, "Blocks", "k2");
  const side = await plusX(page, START);
  await page.mouse.move(side.x, side.y);
  await expect(page.locator("#tip")).toContainText("Place an ice block on the +x side");
  await click(page, side);
  await expect(page.locator("#say")).toHaveText("Placed an ice block at 18, 17, 17");
  await pick(page, "Devices", "t7");
  await click(page, await top(page, [18, 17, 17]));
  expect(await toasts(page)).toContain("An exit works on a plain block only.");
  await pick(page, "Pickups", "t35");
  await click(page, await plusY(page, START));
  await expect(page.locator("#say")).toHaveText("Placed an hourglass on the +y side of 17, 17, 17");
  expect(errors).toEqual([]);
});
