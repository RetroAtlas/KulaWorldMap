import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame, headings, overlaps, written } from "./helpers.js";

test("clicking the start's block opens the object standing on it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 30));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  const detail = page.locator("#detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Start");
  await expect(detail).toContainText("on the top");
  await expect(detail.locator(".tag", { hasText: "Hazard" })).toHaveCount(0);
});

test("a hazard says so in its heading", async ({ page }) => {
  await page.goto("/#HIRO/3");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 12));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  const spikes = page.locator("#detail h3", { hasText: "Spikes" });
  await expect(spikes.locator(".tag")).toHaveText("Hazard");
  const gap = await spikes.evaluate(
    (h) => h.getBoundingClientRect().right - h.querySelector(".tag").getBoundingClientRect().right,
  );
  expect(gap).toBeLessThan(1);

  await page.goto("/#INCA/4");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const c = state.lvl.cells;
    const i = c.findIndex((v, j) => j % 4 === 3 && v === 1) - 3;
    showCell({ x: c[i], y: c[i + 1], z: c[i + 2], v: 1 });
  });
  const block = page.locator("#detail h3").first();
  await expect(block).toContainText("Fire block");
  await expect(block.locator(".tag")).toHaveText("Hazard");

  const farEnd = async (hash) => {
    await page.goto(hash);
    await settle(page);
    await page.evaluate(async () => {
      const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const r = state.lvl.records.find((r) => r.kind === 8);
      const own = [r.x, r.y, r.z].join();
      const end = [r.f.slice(2, 5), r.f.slice(5, 8)].find((e) => e.join() !== own);
      showCell(state.idx.cells.get(cellKey(...end)));
    });
    return page.locator("#detail h3").first();
  };
  const added = await farEnd("/#COPYCAT/7");
  await expect(added).toContainText("Laser end");
  await expect(added.locator(".tag")).toHaveText("Hazard");
  const plain = await farEnd("/#INCAFI/1");
  await expect(plain).toContainText("Block");
  await expect(plain.locator(".tag")).toHaveText("Hazard");
  await expect(page.locator("#detail")).toContainText("One end of a laser.");
});

test("a block that is a thing of its own is named once, with what its record holds", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex(
      (r) =>
        r.kind === 6 &&
        state.lvl.records.some((s) => s.kind === 9 && s.x === r.x && s.y === r.y && s.z === r.z),
    );
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  expect(await headings(page)).toEqual(["Crumbling block", "Level settings"]);
  const block = page.locator("#detail table").first();
  for (const label of ["points", "kind", "type", "record", "f2 position x", "unset"])
    await expect(block.locator("td", { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  await expect(page.locator("#detail p", { hasText: /^Placed / })).toHaveCount(2);
});

test("a whole block of fire or ice reads apart from one face of it", async ({ page }) => {
  for (const [hash, title, kind, block, face] of [
    ["#INCA/7", "LEVEL 38", 1, "Fire block", "Fire"],
    ["#ARCTIC/1", "LEVEL 47", 2, "Ice block", "Ice"],
  ]) {
    await page.goto(`/${hash}`);
    await settle(page);
    // a second goto only changes the hash, and the level before it is still loaded
    await expect(page.locator("#chip")).toContainText(title);
    const open = (whole) =>
      page.evaluate(
        async ([kind, whole]) => {
          const { state } = await import(new URL("js/state.js", location.href).href);
          const { showCell } = await import(new URL("js/detail.js", location.href).href);
          const records = state.lvl.records;
          const c = [...state.idx.cells.values()].find((c) => {
            const r = records[c.v - state.data.firstRecord];
            if (whole) return c.v === kind || r?.kind === kind;
            return r?.kind === 0 && r.on.some((o) => o.type === kind);
          });
          showCell(c);
        },
        [kind, whole],
      );
    await open(true);
    expect((await headings(page))[0]).toBe(block);
    expect(await headings(page)).not.toContain(face);
    await open(false);
    expect((await headings(page))[0]).toBe("Block");
    expect(await headings(page)).toContain(face);
  }
});

test("a raw field reads by its number, then what it holds where that is known", async ({
  page,
}) => {
  await page.goto("/#ATLANT/7");
  await settle(page);
  const labels = (type) =>
    page.evaluate(async (type) => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === type));
      const { x, y, z } = state.lvl.records[i];
      showCell({ x, y, z, v: state.data.firstRecord + i });
      return [...document.querySelectorAll("#detail td:first-child")].map((td) => td.textContent);
    }, type);
  expect(await labels(9)).toContain("f3 circuit");
  expect(await labels(9)).toContain("f4 state");
  expect(await labels(28)).toContain("f2 facing");
  expect(await labels(31)).toContain("f5 pickup number");
});

test("the survey keeps a mark a face, and clears the chosen face alone", async ({ page }) => {
  await page.goto("/?survey#HIRO/0");
  await settle(page);
  await expect(page.locator("#survey")).toBeVisible();
  const got = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, cellKey }, { place }] = await Promise.all(["state.js", "survey.js"].map(at));
    const c = [...state.idx.cells.values()][0];
    const key = cellKey(c.x, c.y, c.z);
    const choose = (id, value) => {
      const s = document.getElementById(id);
      s.value = value;
      s.dispatchEvent(new Event("change"));
    };
    const cell = [c.x, c.y, c.z];
    const marks = () => state.survey.marks.get(key).map((m) => [m.name, m.face]);
    choose("surveyName", "blue switch");
    choose("surveyFace", "+x");
    place(c);
    choose("surveyName", "key");
    choose("surveyFace", "-z");
    place(c);
    const two = marks();
    const stored = JSON.parse(localStorage.getItem("kula.survey"));
    const level = stored[`${state.lvl.pack}#${state.lvl.index}`];
    const count = document.getElementById("surveyCount").textContent;
    choose("surveyFace", "+x");
    place(c, true);
    return { two, level, count, cell, one: marks() };
  });
  expect(got.two).toEqual([
    ["key", "-z"],
    ["blue switch", "+x"],
  ]);
  expect(got.level.map((m) => [m.cell, m.face])).toEqual([
    [got.cell, "-z"],
    [got.cell, "+x"],
  ]);
  expect(got.count).toMatch(/^2 marked on 1 block · /);
  expect(got.one).toEqual([["key", "-z"]]);
});

test("a switch's panel presses it, turning its colour over until the level is left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/19/45,35/1");
  await settle(page);
  await page.keyboard.press("l");
  const select = (type) =>
    page.evaluate(async (type) => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === type));
      const { x, y, z } = state.lvl.records[i];
      showCell({ x, y, z, v: state.data.firstRecord + i });
    }, type);
  const off = async () => (await written(page)).filter((t) => t.includes(" · off")).length;
  // LESSON's yellow switch and its two teleporters start off
  expect(await off()).toBe(3);
  await select(9);
  const press = page.locator("#detail .press button");
  await expect(press).toHaveText(/Off · press to turn on/);
  await expect(page).toHaveURL(/\/\d+,\d+,\d+$/);
  const url = page.url();
  await press.click();
  await expect(press).toHaveText(/On · press to turn off/);
  await expect(press).toBeFocused();
  await expect(page.locator("#detail")).toContainText("startsoff");
  expect(await off()).toBe(0);
  expect(page.url()).toBe(url);
  await select(5);
  await expect(page.locator("#detail .press")).toHaveCount(0);
  await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 5));
    const c = state.lvl.records[i];
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
  });
  await expect(page.locator("#tip")).toContainText("Teleporter (yellow) · top");
  await expect(page.locator("#tip")).not.toContainText("off");
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).not.toContainText("LESSON");
  await page.keyboard.press("[");
  await expect(page.locator("#chip")).toContainText("LESSON");
  expect(await off()).toBe(3);
  expect(errors).toEqual([]);
});

test("a teleporter's panel names where it leads, and going there is a find", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  // LEVEL 68's blue teleporters send the ball round a ring of three
  const go = page.locator("#detail .goto");
  await expect(go).toHaveText("17, 25, 17 top");
  const entries = await page.evaluate(() => history.length);
  await go.click();
  await expect(page.locator("#detail")).toContainText("cell 17,25,17");
  await expect(go).toHaveText("17, 21, 17 top");
  const view = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { target: state.target, pan: [state.cam.panX, state.cam.panY] };
  });
  expect(view).toEqual({ target: [17.5, 25.5, 17.5], pan: [0, 0] });
  await frame(page);
  expect(page.url()).toMatch(/\/17,25,17$/);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  await expect(page.locator("#say")).toContainText("Teleporter (blue), top, 17,25,17");
  await go.click();
  await go.click();
  await expect(page.locator("#detail")).toContainText("cell 17,7,17");
  // a teleporter alone in its colour sends the ball back onto itself
  await page.goto("/#HILLS/19");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 5));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  await expect(page.locator("#detail")).toContainText("leads toitself");
  // and names the way the ball faces as it comes out
  await expect(page.locator("#detail")).toContainText("facing+x");
  await expect(page.locator("#detail")).toContainText("f2 facing4");
  await expect(page.locator("#detail .goto")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the panel keeps the focus when the button it was on goes", async ({ page }) => {
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  const panel = page.locator("#detail");
  await panel.locator(".goto").focus();
  await page.keyboard.press("Enter");
  await expect(panel).toContainText("cell 17,25,17");
  await expect(panel.locator(".x")).toBeFocused();
  await panel.locator(".x").click();
  await expect(panel).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
});

test("the panel folds to its title, and stays folded from block to block", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const show = (cell) =>
    page.evaluate(async (cell) => {
      const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      showCell(state.idx.cells.get(cellKey(...cell)));
    }, cell);
  await show([17, 12, 17]);
  const panel = page.locator("#detail");
  const fold = panel.locator(".fold");
  const body = page.locator("#detailBody");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(fold).toHaveAttribute("aria-controls", "detailBody");
  const target = await fold.boundingBox();
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
  await expect(body).toContainText("Exit");
  const open = await panel.boundingBox();
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold).toBeFocused();
  await expect(body).toBeHidden();
  // folded, the panel is the block's name and its cell, beside the two buttons
  await expect(panel).toContainText("Block");
  await expect(panel).toContainText("LEVEL 1 · cell 17,12,17");
  const folded = await panel.boundingBox();
  expect(folded.height).toBeLessThan(open.height / 4);
  expect(folded.width).toBe(open.width);
  const x = await panel.locator(".x").boundingBox();
  expect(overlaps(await fold.boundingBox(), x)).toBe(false);
  expect(x.y + x.height).toBeLessThanOrEqual(folded.y + folded.height);
  // another block opens folded, under the hand that folded the last
  await show([18, 12, 17]);
  await expect(panel).toContainText("cell 18,12,17");
  await expect(body).toBeHidden();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(fold).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeVisible();
  await page.keyboard.press(" ");
  await expect(body).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  await show([17, 12, 17]);
  await expect(body).toBeHidden();
});

test("where a teleporter leads reads as a row of the panel, the cell and its face each whole", async ({
  page,
}) => {
  /** How the value of the leads-to row sits beside the row above it, with the panel `width` wide where one is given. */
  const row = (hash, width) =>
    page.evaluate(
      async ([hash, width]) => {
        location.hash = hash;
        const cell = `cell ${hash.split("/").at(-1)}`;
        const box = document.getElementById("detail");
        while (!box.querySelector(".goto") || !box.textContent.includes(cell))
          await new Promise(requestAnimationFrame);
        box.style.width = width ? `${width}px` : "";
        const go = box.querySelector(".goto");
        const [at, face] = [".at", ".face"].map((s) => go.querySelector(s));
        const [a] = at.getClientRects();
        const [f] = face.getClientRects();
        const above = go.closest("tr").previousElementSibling.lastElementChild;
        const font = (e) => getComputedStyle(e).font;
        const lines = f.top >= a.bottom ? 2 : 1;
        return {
          font: font(at) === font(above),
          left: Math.round(a.left) === Math.round(above.getBoundingClientRect().left),
          whole: at.getClientRects().length === 1 && face.getClientRects().length === 1,
          // beside the cell on its line, or at the start of the next, under the cell
          placed: lines === 2 ? Math.round(f.left) === Math.round(a.left) : f.left >= a.right,
          lines,
        };
      },
      [hash, width],
    );
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  // LEVEL 68's blue teleporter leads to a top, LEVEL 70's red one to an underside
  const top = "#COWBOY/7/45,35/fit/33/17,7,17";
  const under = "#COWBOY/9/45,35/fit/33/23,13,15";
  const reads = { font: true, left: true, whole: true, placed: true };
  expect(await row(top)).toEqual({ ...reads, lines: 1 });
  expect(await row(under)).toMatchObject(reads);
  // a panel too narrow for the cell and the face side by side
  expect(await row(under, 200)).toEqual({ ...reads, lines: 2 });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await row(top)).toMatchObject(reads);
  expect(await row(under)).toMatchObject(reads);
});

test("the panel heads a block and a face painting with its icon, and the settings with a dot", async ({
  page,
}) => {
  const heads = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("#detail h3")].map((h) => [
        h.textContent.trim().replace(/\s+/g, " "),
        h.firstElementChild.tagName,
      ]),
    );
  // LEVEL 94 keeps its settings on the cell of a crumbling block
  await page.goto("/#ATLANT/3/45,35/1.00/17,17,17/0,0/33/17,23,17");
  await settle(page);
  await expect.poll(heads).toEqual([
    ["Crumbling block", "CANVAS"],
    ["Level settings", "SPAN"],
  ]);
  // and LEVEL 56 a clock on the top of a block and one under it
  await page.goto("/#ARCTIC/10/45,35/1.00/17,17,17/0,0/33/15,13,17");
  await settle(page);
  await expect.poll(heads).toEqual([
    ["Block", "CANVAS"],
    ["Clock", "CANVAS"],
    ["Clock", "CANVAS"],
  ]);
});

test("the panel's icons are drawn again in the world's textures when they land", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3/45,35/1.00/17,17,17/0,0/33/17,23,17");
  await settle(page);
  const same = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }, { blockIcon }] = await Promise.all(
      ["state.js", "atlas.js", "icons.js"].map(at),
    );
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
    const shown = document.querySelector("#detail h3 canvas");
    const r = state.lvl.records.find((x) => x.x === 17 && x.y === 23 && x.z === 17);
    const fresh = blockIcon(state.lvl, r.kind, { size: shown.clientWidth, r });
    const pixels = (cv) => cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data.join();
    return pixels(shown) === pixels(fresh);
  });
  expect(same).toBe(true);
});

test("the survey passes over a stored mark that is not one, and exports none of them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "kula.survey",
      JSON.stringify({
        "/HIRO/HIRO.PAK#0": 5,
        "/HIRO/HIRO.PAK#2": null,
        "/HIRO/HIRO.PAK#1": [
          { name: "x" },
          { cell: [1, 2], name: "short" },
          { cell: [1, 2, 3], name: "coin", face: 7 },
          { cell: [1, 2, 3], name: "coin", face: "-z" },
          null,
        ],
      }),
    );
  });
  await page.goto("/?survey#HIRO/0");
  await settle(page);
  await expect(page.locator("#surveyCount")).toContainText("0 marked");
  await page.keyboard.press("]");
  await expect(page.locator("#surveyCount")).toContainText("1 marked");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#survey button", { hasText: "download" }).click(),
  ]);
  const text = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  expect(JSON.parse(text)).toEqual({
    survey: 1,
    levels: { "/HIRO/HIRO.PAK#1": [{ cell: [1, 2, 3], name: "coin", face: "-z" }] },
  });
  expect(errors).toEqual([]);
});

test("the panel hands the focus to the map however it closes", async ({ page }) => {
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  const panel = page.locator("#detail");
  await panel.locator(".x").focus();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  await panel.locator(".x").focus();
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 69");
  await expect(panel).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
  await page.keyboard.press("[");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 68");
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  await panel.locator(".x").focus();
  // a click on an empty corner of the map as events alone, so the canvas is focused by the handoff
  // and not by the click
  await page.evaluate(() => {
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const at = { pointerId: 1, clientX: r.left + 4, clientY: r.top + 4, button: 0, bubbles: true };
    for (const type of ["pointerdown", "pointerup"]) cv.dispatchEvent(new PointerEvent(type, at));
  });
  await expect(panel).toBeHidden();
  await expect(page.locator("#cv")).toBeFocused();
});
