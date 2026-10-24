import { expect, test } from "@playwright/test";
import { settle, still, textured } from "./helpers.js";

test("the catalogue's own note reaches the catalogue", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const note = await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { levelNote } = await import(new URL("js/viewer/data.js", location.href).href);
    const i = state.data.levels.findIndex((l) => l.name === "OBJ LEVEL");
    const { selectLevel } = await import(
      new URL("js/viewer/chrome/navigate.js", location.href).href
    );
    selectLevel(i);
    return levelNote(state.data.levels[i]);
  });
  expect(note).toMatch(/object catalogue/i);
  await expect(page.locator("#chip .note")).toContainText("object catalogue");
});

test("a level's note folds away and back with a click on the chip, or with its keys", async ({
  page,
}) => {
  await page.goto("/#MARS/12");
  await settle(page);
  const fold = page.getByRole("button", { name: /^LEVEL 133/ });
  const note = page.locator("#chipNote");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toHaveAttribute("aria-controls", "chipNote");
  await expect(note).toContainText("Japanese release");
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  await expect(page.locator("#detail")).toBeHidden();
  // folded, the chip is as tall as the menu button, and a row taller for each row its line adds
  const [chip, menu] = await Promise.all(
    ["#chip", "#menuBtn"].map((s) => page.locator(s).boundingBox()),
  );
  const [rows, row] = await page.locator("#chipLine").evaluate((e) => {
    const s = getComputedStyle(e);
    const row = parseFloat(s.lineHeight);
    return [(e.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom)) / row, row];
  });
  expect(chip.height).toBe(menu.height + (rows - 1) * row);
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(note).toBeVisible();
  await page.keyboard.press(" ");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold).toBeFocused();
});

test("a note folded stays folded from level to level and from one visit to the next", async ({
  page,
}) => {
  await page.goto("/#MARS/12");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const title = page.locator("#chip b");
  const fold = page.locator("#chipBtn");
  const note = page.locator("#chipNote");
  await fold.click();
  expect(await kept()).toEqual({ note: false });
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 134");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 135");
  await expect(fold).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  await page.keyboard.press("[");
  await expect(title).toHaveText("LEVEL 134");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/#MARS\/13\//);
  await page.reload();
  await settle(page);
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(note).toBeHidden();
  // the Display's reset puts back what is under its own heading
  await page.locator("#resetDisplay").click();
  await expect(note).toBeHidden();
  expect(await kept()).toEqual({ note: false });
  await fold.click();
  await expect(note).toBeVisible();
  expect(await kept()).toEqual({});
});

test("a level without a note has nothing on its chip to fold", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  await expect(page.locator("#chip").getByRole("button")).toHaveCount(0);
  await expect(page.locator("#chipDot")).toBeHidden();
  await expect(page.locator("#chipNote")).toBeHidden();
});

test("a switch in the settings puts the compass away, and is remembered", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const compass = page.locator("#compass");
  const box = page.locator("#showCompass");
  await expect(compass).toBeVisible();
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await expect(box).toBeChecked();
  await box.click();
  await expect(compass).toBeHidden();
  await expect(page.locator("#settings label:has(#showCompass) .def")).toHaveText("on by default");
  expect(await kept()).toEqual({ compass: false });
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  // the button beside it moves into the corner the compass held
  const [fit, map] = await Promise.all(
    ["#fitBtn", "#cv"].map((sel) => page.locator(sel).boundingBox()),
  );
  expect(fit.x + fit.width).toBe(map.x + map.width - 12);
  await page.reload();
  await settle(page);
  await expect(compass).toBeHidden();
  // the Display's reset leaves it as it leaves the other settings
  await page.locator("#resetDisplay").click();
  await expect(compass).toBeHidden();
  expect(await kept()).toEqual({ compass: false });
  await page.keyboard.press("Shift+s");
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(compass).toBeVisible();
  expect(await kept()).toEqual({});
});

test("arriving somewhere is spoken, and names the map with it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const line = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(line);
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", line);
  await page.keyboard.press("]");
  await expect(page.locator("#say")).toContainText("LEVEL 2");
});

test("a level that holds more than can be scored gives its best out of all it holds", async ({
  page,
}) => {
  await page.goto("/#FIELD/16");
  await settle(page);
  await expect(page.locator("#chipLine")).toContainText("19050 of 23525 points");
  await expect(page.locator("#chipNote")).toHaveText(/^The level holds 4475 more points, /);
  await expect(page.locator("#say")).toContainText(
    "19050 of 23525 points, time 99. The level holds 4475 more points, ",
  );
});

test("the legend lists the objects the chip counts, every kind of block but the plain one, and the settings apart", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("19 blocks");
  await expect(page.locator("#chip")).toContainText("10 objects");
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#kinds ul")].map((list) => ({
      head: document.getElementById(list.getAttribute("aria-labelledby"))?.textContent ?? "",
      rows: [...list.querySelectorAll(".kind")].map((c) => [
        c.children[1].textContent,
        Number(c.querySelector(".n").textContent),
      ]),
    })),
  );
  const sum = (g) => g.rows.reduce((n, [, k]) => n + k, 0);
  expect(groups.map((g) => g.head)).toEqual(["Objects", "Blocks and faces", ""]);
  await expect(page.locator("#kinds ul[role=list]")).toHaveCount(groups.length);
  expect(sum(groups[0])).toBe(10);
  expect(groups[1].rows).toContainEqual(["Ice block", 1]);
  expect(sum(groups[1])).toBe(10);
  expect(groups[2].rows).toEqual([["Level settings", 1]]);
});

test("the legend runs from the most to the fewest, rows with as many by name, then by number", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const rows = (name) =>
    page
      .getByRole("list", { name })
      .locator(".kind")
      .evaluateAll((rows) =>
        rows.map((r) => [r.children[1].textContent, Number(r.querySelector(".n").textContent)]),
      );
  expect(await rows("Objects")).toEqual([
    ["Coin (gold)", 4],
    ["Coin (bronze)", 1],
    ["Exit", 1],
    ["Fruit", 1],
    ["Gem (blue)", 1],
    ["Key", 1],
    ["Start", 1],
  ]);
  expect(await rows("Blocks and faces")).toEqual([
    ["Crumbling block", 6],
    ["Laser", 2],
    ["Ice block", 1],
    ["Moving platform", 1],
  ]);

  // two kinds of captivator, told apart by their pace
  await page.goto("/#HIRO/19");
  await expect(page.locator("#chip b")).toHaveText("LESSON");
  const stars = await page
    .getByRole("list", { name: "Objects" })
    .getByRole("button")
    .evaluateAll((rows) =>
      rows
        .filter((r) => ["t50", "t52"].includes(r.dataset.kind))
        .map((r) => [r.dataset.kind, r.children[1].textContent])
        .sort(),
    );
  expect(stars).toEqual([
    ["t50", "Captivator, slow"],
    ["t52", "Captivator, quick"],
  ]);
});

test("a legend row of objects shows and hides them, and a row of blocks only counts", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await textured(page);
  const objects = page.getByRole("list", { name: "Objects" });
  const blocks = page.getByRole("list", { name: "Blocks and faces" });
  const rows = await objects.getByRole("listitem").count();
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(rows);
  await expect(blocks.getByRole("listitem")).toHaveCount(4);
  await expect(blocks.getByRole("button")).toHaveCount(0);
  await expect(blocks.locator("[aria-pressed]")).toHaveCount(0);
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  await blocks.getByRole("listitem").first().click();
  expect(await hidden()).toEqual([]);
  const toggles = await page.locator("#kinds").getByRole("button").count();
  await objects
    .getByRole("button")
    .first()
    .click({ modifiers: ["Shift"] });
  expect(await hidden()).toHaveLength(toggles - 1);
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(1);
  await page.locator("#resetKinds").click();
  expect(await hidden()).toEqual([]);
});

test("a type that is paint on a face is listed with the blocks, apart from the kind of its name, and toggles", async ({
  page,
}) => {
  await page.goto("/#HILLSFI/0");
  await settle(page);
  await textured(page);
  const objects = page.getByRole("list", { name: "Objects" });
  const blocks = page.getByRole("list", { name: "Blocks and faces" });
  await expect(objects.getByRole("button", { name: /^Ice/ })).toHaveCount(0);
  const kind = blocks.getByRole("listitem").filter({ hasText: /^Ice block/ });
  await expect(kind).toHaveCount(1);
  await expect(kind.locator(".n")).toHaveText("26");
  await expect(kind.getByRole("button")).toHaveCount(0);
  const ice = blocks.getByRole("button", { name: /^Ice/ });
  await expect(ice).toHaveCount(1);
  await expect(ice.locator(".n")).toHaveText("8");
  await expect(ice).toHaveAttribute("aria-pressed", "true");
  await expect(ice.locator("canvas.icon")).toHaveCount(1);
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  await ice.click();
  expect(await hidden()).toEqual(["t2"]);
  await expect(ice).toHaveAttribute("aria-pressed", "false");
  await ice.click({ modifiers: ["Shift"] });
  const toggles = await page.locator("#kinds").getByRole("button").count();
  expect(await hidden()).toHaveLength(toggles - 1);
  await expect(page.locator("#kinds").getByRole("button", { pressed: true })).toHaveText(/^Ice/);

  // what paints a face and stands on it as well stays an object
  await page.goto("/#HILLS/19");
  await expect(page.locator("#chip b")).toHaveText("OBJ LEVEL");
  await expect(blocks.getByRole("button", { name: /^Clock/ })).toHaveCount(1);
  await expect(objects.getByRole("button", { name: /teleporter/i })).not.toHaveCount(0);
  await expect(objects.getByRole("button", { name: /^Exit/ })).toHaveCount(1);
});

test("hiding a row of paint strips the face back to the stone the block wears without it", async ({
  page,
}) => {
  await page.goto("/#ARCTIC/13/30,60");
  await settle(page);
  await textured(page);
  await still(page);
  const ice = page
    .getByRole("list", { name: "Blocks and faces" })
    .getByRole("button", { name: /^Ice/ });
  /** The colour at the middle of a top face with ice on it and nothing above,
      drawn afresh, with the ice taken off the record first where `bare`. */
  const face = (bare) =>
    page.evaluate(async (bare) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js"].map(at),
      );
      const [key] = [...state.idx.markers].find(
        ([k, ms]) => ms.some((m) => m.type === 2 && m.face === 0) && !state.idx.cells.has(k - 1),
      );
      const c = state.idx.cells.get(key);
      const r = state.idx.records.get(key)[0];
      const on = r.on;
      if (bare) r.on = on.filter((o) => o.face !== 0);
      draw();
      r.on = on;
      const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
      const cv = document.getElementById("cv");
      const k = cv.width / cv.clientWidth;
      return String(
        cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data,
      );
    }, bare);
  const iced = await face(false);
  const stone = await face(true);
  expect(stone).not.toEqual(iced);
  await ice.click();
  await expect(ice).toHaveAttribute("aria-pressed", "false");
  expect(await face(false)).toEqual(stone);
  await expect(ice.locator("canvas.icon")).toHaveCount(1);
  await page.locator("#resetKinds").click();
  expect(await face(false)).toEqual(iced);
});

test("switching the objects off takes the shadow painted under a pickup off its face, as hiding its row does", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/30,60");
  await settle(page);
  await textured(page);
  await still(page);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const coin = page
    .getByRole("list", { name: "Objects" })
    .getByRole("button", { name: /^Coin \(bronze\)/ });
  /** The colour at the middle of the top face LEVEL 1's first coin stands on, drawn afresh. */
  const face = () =>
    page.evaluate(async () => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js"].map(at),
      );
      draw();
      const [x, y] = screen(17.5, 16.5, 17);
      const cv = document.getElementById("cv");
      const k = state.view.dpr;
      return String(
        cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data,
      );
    });
  const shown = await face();
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).not.toBeChecked();
  const off = await face();
  expect(off).not.toEqual(shown);
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).toBeChecked();
  expect(await face()).toEqual(shown);
  await coin.click();
  await expect(coin).toHaveAttribute("aria-pressed", "false");
  expect(await face()).toEqual(off);
  await page.locator("#resetKinds").click();
  expect(await face()).toEqual(shown);
});

test("a legend row keeps the focus when the legend is built anew", async ({ page }) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await textured(page);
  const key = page.getByRole("list", { name: "Objects" }).getByRole("button", { name: "Key" });
  await key.focus();
  await page.keyboard.press("Space");
  await expect(key).toHaveAttribute("aria-pressed", "false");
  await expect(key).toBeFocused();
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ emit }, { state }] = await Promise.all(
      ["viewer/ui/dom.js", "viewer/state.js"].map(at),
    );
    emit("atlas-loaded", state.lvl.theme);
  });
  await expect(key).toBeFocused();
});

test("a legend row's icon shows the row's pointer, and the map the hand that turns it", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const cursor = (at) => at.evaluate((e) => getComputedStyle(e).cursor);
  const row = page.getByRole("list", { name: "Objects" }).getByRole("button").first();
  await expect.poll(() => cursor(row)).toBe("pointer");
  await expect.poll(() => cursor(row.locator(".icon"))).toBe("pointer");
  const map = page.locator("#cv");
  expect(await cursor(map)).toBe("grab");
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await cursor(map)).toBe("grabbing");
  await page.mouse.up();
});
