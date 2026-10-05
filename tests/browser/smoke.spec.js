import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame, still, textured } from "./helpers.js";

test("the map boots into standards mode with nothing on the console", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  expect(errors).toEqual([]);
});

test("a permalink opens on the level and the camera it names", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { name: state.lvl.name, ...state.cam, slice: state.slice, target: state.target };
  });
  expect(cam.name).toBe("LEVEL 12");
  expect(cam.yaw).toBe(30);
  expect(cam.pitch).toBe(20);
  expect(cam.zoom).toBeCloseTo(1.25, 5);
  expect(cam.slice).toBe(25);
  expect(cam.target).toEqual([18, 13, 17]);
});

test("a permalink keeps the parts it can read and drops the rest", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/0/18,13,17/x/3.5");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { ...state.cam, slice: state.slice, target: state.target };
  });
  expect([cam.yaw, cam.pitch]).toEqual([30, 20]);
  expect(cam.zoom).toBeGreaterThan(0);
  expect(cam.target).toEqual([18, 13, 17]);
  expect(cam.slice).toBe(33);
});

test("a permalink that names a zoom and no cell opens at that zoom, centred on the blocks as a fit is", async ({
  page,
}) => {
  await page.goto("/#HIRO/11/30,20/1.25");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state, levelCentre, fitLevel } = await import(
      new URL("js/state.js", location.href).href
    );
    const opened = { zoom: state.cam.zoom, pan: [state.cam.panX, state.cam.panY] };
    fitLevel(state.lvl);
    return {
      ...opened,
      target: state.target,
      middle: levelCentre(state.lvl),
      fit: [state.cam.panX, state.cam.panY],
    };
  });
  expect(cam.zoom).toBeCloseTo(1.25, 5);
  expect(cam.target).toEqual(cam.middle);
  expect(cam.pan).toEqual(cam.fit);
});

test("a permalink carries the selected block, and opens with it selected", async ({ page }) => {
  await page.goto("/#HIRO/11/45,35/1/21.5,13.5,18.5/0,0/33/21,13,18");
  await settle(page);
  await expect(page.locator("#detail")).toContainText("cell 21,13,18");
  await expect(page.locator("#detail")).toContainText("Key");
  // a click selects without making an entry, and Escape takes the block back out
  const entries = await page.evaluate(() => history.length);
  await page.keyboard.press("Escape");
  await frame(page);
  expect(page.url()).toMatch(/\/33$/);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell([...state.idx.cells.values()][0]);
  });
  await frame(page);
  expect(page.url()).toMatch(/\/33\/\d+,\d+,\d+$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
});

test("a link naming a pack and a slot opens that level, whatever its case", async ({ page }) => {
  await page.goto("/#copycat/4/30,20");
  await settle(page);
  await frame(page);
  await expect(page.locator("#chip")).toContainText("SIMON 5");
  expect(page.url()).toContain("#COPYCAT/4/30,20/");
});

test("a link escaped on its way opens where it points, and the address bar says it plainly", async ({
  page,
}) => {
  await page.goto("/#INCA%2F11%2F45%2C35");
  await settle(page);
  await frame(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 42");
  expect(page.url()).toContain("#INCA/11/45,35/");
});

test("a hash that arrives while a write of the URL is queued is the one the map goes to", async ({
  page,
}) => {
  await page.goto("/#INCA/7");
  await settle(page);
  await still(page);
  await page.evaluate(async () => {
    const { writeHash } = await import(new URL("js/navigate.js", location.href).href);
    // the hash changes in the frame the write is queued for, before the write runs
    requestAnimationFrame(() => (location.hash = "#ARCTIC/1"));
    writeHash();
  });
  await expect(page.locator("#chip")).toContainText("LEVEL 47");
  await expect(page).toHaveURL(/#ARCTIC\/1\//);
});

test("a hash naming no level puts the address bar back", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.evaluate(() => (location.hash = "#nonsense"));
  await frame(page);
  expect(page.url()).toContain("#HIRO/11/");
  await page.evaluate(() => (location.hash = "#HIRO/99"));
  await frame(page);
  expect(page.url()).toContain("#HIRO/11/");
});

test("a hash that arrives before the data has loaded is read once it has, and a key is let go", async ({
  page,
}) => {
  const errors = trackErrors(page);
  let release;
  const held = new Promise((r) => (release = r));
  await page.route("**/map_data.json", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/#HIRO/0", { waitUntil: "commit" });
  await page.evaluate(() => import(new URL("js/interaction.js", location.href).href));
  await page.evaluate(() => (location.hash = "#HIRO/5"));
  await page.keyboard.press("]");
  await page.locator("#search").fill("key");
  await page.keyboard.press("Escape");
  await frame(page);
  release();
  await settle(page);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 6");
  expect(errors).toEqual([]);
});

test("a change of level or a find is a history entry; a turn is not", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await frame(page);
  const entries = () => page.evaluate(() => history.length);
  const level = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { li: state.li, target: state.target, selected: !!state.selected };
    });
  const drag = () =>
    page.evaluate(() => {
      const cv = document.getElementById("cv");
      cv.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 640, clientY: 420, pointerId: 1 }),
      );
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 640, clientY: 420, pointerId: 1 }));
    });
  const booted = await entries();
  await drag();
  await frame(page);
  expect(await entries()).toBe(booted);

  await page.keyboard.press("]");
  await frame(page);
  expect(await entries()).toBe(booted + 1);
  expect(page.url()).toContain("#HIRO/1/");
  await page.locator("#search").fill("key");
  await page.locator("#search").press("Enter");
  await frame(page);
  expect(await entries()).toBe(booted + 2);
  const found = await level();
  expect(found.selected).toBe(true);

  // the entry the viewer made is not read back, so the find stays selected
  await frame(page);
  expect((await level()).selected).toBe(true);

  await page.goBack();
  await expect.poll(async () => (await level()).target).not.toEqual(found.target);
  expect((await level()).li).toBe(1);
  await page.goBack();
  await expect.poll(async () => (await level()).li).toBe(0);
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  await page.goForward();
  await expect.poll(async () => (await level()).li).toBe(1);
});

test("[ and ] go on from one world into the next, and stop at the first level and the last", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await frame(page);
  const title = page.locator("#chip b");
  const entries = () => page.evaluate(() => history.length);
  const last = (world) =>
    page.evaluate(async (world) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { selectLevel }] = await Promise.all(["state.js", "navigate.js"].map(at));
      selectLevel(state.data.themes.find((t) => t.id === world).levels.at(-1));
    }, world);

  const booted = await entries();
  await page.keyboard.press("[");
  await frame(page);
  await expect(title).toHaveText("LEVEL 1");
  expect(await entries()).toBe(booted);

  await last("HIRO");
  await expect(title).toHaveText("FINAL 2");
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 16");
  await page.keyboard.press("[");
  await expect(title).toHaveText("FINAL 2");

  await last("HELL");
  await expect(title).toHaveText("FINAL 20");
  await frame(page);
  const there = await entries();
  await page.keyboard.press("]");
  await frame(page);
  await expect(title).toHaveText("FINAL 20");
  expect(await entries()).toBe(there);
});

test("a bracket held down steps on through the levels on one history entry", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await frame(page);
  const title = page.locator("#chip b");
  const entries = () => page.evaluate(() => history.length);
  const booted = await entries();
  await page.keyboard.press("]");
  await frame(page);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() =>
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "]", repeat: true, bubbles: true }),
      ),
    );
    await frame(page);
  }
  await expect(title).toHaveText("LEVEL 5");
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect(title).toHaveText("LEVEL 1");
});

test("a key typed with Option or AltGr reaches the map, and a shortcut stays the browser's", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const title = page.locator("#chip b");
  const taken = (init) =>
    page.evaluate(
      (init) =>
        !document.body.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
        ),
      init,
    );
  // AltGr on Windows, and Option on a Mac
  expect(await taken({ key: "]", ctrlKey: true, altKey: true })).toBe(true);
  await expect(title).toHaveText("LEVEL 2");
  expect(await taken({ key: "[", altKey: true })).toBe(true);
  await expect(title).toHaveText("LEVEL 1");
  expect(await taken({ key: "\\", altKey: true, shiftKey: true })).toBe(true);

  for (const init of [
    { key: "]", metaKey: true },
    { key: "]", metaKey: true, altKey: true },
    { key: "-", ctrlKey: true },
    { key: "d", altKey: true },
    { key: "ArrowLeft", altKey: true },
  ])
    expect(await taken(init), JSON.stringify(init)).toBe(false);
  await expect(title).toHaveText("LEVEL 1");
});

test("a pinch that opens from one point leaves the zoom a number", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const zoom = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return state.cam.zoom;
    });
  const before = await zoom();
  await page.evaluate(() => {
    const cv = document.getElementById("cv");
    const at = (id, x, y) => new Touch({ identifier: id, target: cv, clientX: x, clientY: y });
    const fire = (type, touches) =>
      cv.dispatchEvent(
        new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }),
      );
    fire("touchstart", [at(1, 600, 400), at(2, 600, 400)]);
    fire("touchmove", [at(1, 600, 400), at(2, 600, 400)]);
    fire("touchmove", [at(1, 580, 400), at(2, 620, 400)]);
    fire("touchmove", [at(1, 560, 400), at(2, 640, 400)]);
    fire("touchend", []);
  });
  const opened = page.url();
  await frame(page);
  const after = await zoom();
  expect(Number.isFinite(after)).toBe(true);
  expect(after).toBeGreaterThan(before);
  await expect.poll(() => page.url()).not.toBe(opened);
  expect(page.url()).not.toContain("NaN");
});

test("going back to another view of the same level keeps the kinds hidden in it", async ({
  page,
}) => {
  await page.goto("/#HIRO/1");
  await settle(page);
  await textured(page);
  const search = page.locator("#search");
  await search.fill("coin");
  await search.press("Enter");
  await frame(page);
  await page.keyboard.press("/");
  await search.press("ArrowDown");
  await search.press("Enter");
  await frame(page);
  await page.locator("#kinds .kind").first().click();
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  const before = await hidden();
  expect(before).toHaveLength(1);
  const selected = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return state.selected && [state.selected.x, state.selected.y, state.selected.z];
    });
  const second = await selected();
  await page.goBack();
  await expect.poll(selected).not.toEqual(second);
  await frame(page);
  expect(await hidden()).toEqual(before);
  // the find gone back to is selected again, and the view turns about it
  const first = await selected();
  expect(first).not.toBeNull();
  const target = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.target;
  });
  expect(target).toEqual(first.map((v) => v + 0.5));
});

test("the camera writes the URL once it has settled, and not while it moves", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await still(page);
  const writes = () => page.evaluate(() => window.__writes);
  await page.evaluate(() => {
    window.__writes = 0;
    const orig = history.replaceState.bind(history);
    history.replaceState = (...a) => {
      window.__writes++;
      return orig(...a);
    };
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }));
    for (let i = 0; i < 60; i++)
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 600 + i, clientY: 400 + i, pointerId: 1 }),
      );
    for (let i = 0; i < 20; i++)
      cv.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: 600, clientY: 400, cancelable: true }),
      );
    cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 660, clientY: 460, pointerId: 1 }));
  });
  expect(await writes()).toBe(0);
  await frame(page);
  expect(await writes()).toBe(0);
  await expect.poll(writes).toBe(1);
  expect(page.url()).toMatch(/#HIRO\/0\//);
  // a wheel step a frame for forty frames writes nothing while the steps keep coming
  await page.evaluate(async () => {
    const cv = document.getElementById("cv");
    for (let i = 0; i < 40; i++) {
      cv.dispatchEvent(
        new WheelEvent("wheel", { deltaY: 20, clientX: 600, clientY: 400, cancelable: true }),
      );
      await new Promise(requestAnimationFrame);
    }
  });
  expect(await writes()).toBe(1);
  await expect.poll(writes).toBe(2);
  const zoom = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.cam.zoom.toFixed(2);
  });
  await expect.poll(() => page.url()).toContain(`/${zoom}/`);
});

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

const headings = (page) =>
  page.locator("#detail h3").evaluateAll((hs) =>
    hs.map((h) =>
      [...h.childNodes]
        .filter((n) => !n.classList?.contains("tag"))
        .map((n) => n.textContent)
        .join("")
        .trim(),
    ),
  );

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

test("the catalogue's own note reaches the catalogue", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const note = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { levelNote } = await import(new URL("js/data.js", location.href).href);
    const i = state.data.levels.findIndex((l) => l.name === "OBJ LEVEL");
    const { selectLevel } = await import(new URL("js/navigate.js", location.href).href);
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

/** Tap as a finger does, with no mouse left elsewhere to take the hover away. */
const fingerTap = async (page, target, position) => {
  const box = await target.boundingBox();
  const at = position ?? { x: box.width / 2, y: box.height / 2 };
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await target.tap({ position: at });
};

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true });

  test("a tap anywhere on the chip's line folds the note, and leaves the chip unlit", async ({
    page,
  }) => {
    await page.goto("/#MARS/12");
    await settle(page);
    const fold = page.locator("#chipBtn");
    const note = page.locator("#chipNote");
    const menu = await page.locator("#menuBtn").boundingBox();
    const line = await fold.boundingBox();
    expect(line.x).toBeGreaterThan(menu.x + menu.width);
    expect(line.x + line.width).toBeLessThanOrEqual(375);
    expect(line.height).toBeGreaterThanOrEqual(menu.height);
    const border = () =>
      page.evaluate(() => getComputedStyle(document.getElementById("chip")).borderTopColor);
    const unlit = await border();
    // the padding round the words is the line as much as the words are
    await fingerTap(page, fold, { x: 4, y: 4 });
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    await expect(note).toBeHidden();
    await expect(page.locator("#detail")).toBeHidden();
    expect(await fold.evaluate((b) => b.matches(":hover"))).toBe(true);
    expect(await border()).toBe(unlit);
    await fold.tap();
    await expect(note).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test("a tap on the button in the corner frames the level again, and leaves it at rest", async ({
    page,
  }) => {
    await page.goto("/#INCA/11");
    await settle(page);
    await still(page);
    const button = page.locator("#fitBtn");
    const ink = () => button.evaluate((b) => getComputedStyle(b).color);
    const resting = await ink();
    await page.keyboard.press("+");
    await expect(page).not.toHaveURL(/\/fit\//);
    expect(await ink()).not.toBe(resting);
    const box = await button.boundingBox();
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    await fingerTap(page, button);
    await expect(page).toHaveURL(/\/fit\//);
    await expect(page.locator("#detail")).toBeHidden();
    // a touch screen keeps the tapped button under its :hover until the next tap
    expect(await button.evaluate((b) => b.matches(":hover"))).toBe(true);
    expect(await ink()).toBe(resting);
  });
});

test("the drawer stays dismissable on the narrowest phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  await still(page);
  const btn = await page.locator("#menuBtn").boundingBox();
  expect(btn.x + btn.width).toBeLessThanOrEqual(320);
  await expect(page.locator("#scrim")).toBeVisible();
  const drawer = await page.locator("#sidebar").boundingBox();
  const beside = { x: (drawer.x + drawer.width + 320) / 2, y: drawer.height / 2 };
  await page.locator("#scrim").click({ position: beside });
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
});

test("the menu button rides the drawer's edge as it slides, beside the map and over it", async ({
  page,
}) => {
  const boxes = () =>
    Promise.all(["#menuBtn", "#sidebar", "#chip"].map((s) => page.locator(s).boundingBox()));
  // held half way through the slide, both ways
  const midway = () =>
    page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = 5000;
      }),
    );
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/#HIRO/0");
    await settle(page);
    await still(page);
    // a slide too slow for a runner to miss
    await page.addStyleTag({ content: ":root { --slide: 10s linear; }" });
    for (const way of ["there", "back"]) {
      const at = `${width} ${way}`;
      await page.locator("#menuBtn").click();
      await midway();
      await frame(page);
      const [mid, drawer, chip] = await boxes();
      const edge = drawer.x + drawer.width;
      expect(edge, at).toBeGreaterThan(0);
      expect(edge, at).toBeLessThan(drawer.width);
      expect(mid.x, at).toBeCloseTo(edge + 10, 0);
      if (width > 760) expect(chip.x, at).toBeGreaterThanOrEqual(mid.x + mid.width);
      await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
      await still(page);
      const [rest, settled] = await boxes();
      expect(rest.x, at).toBe(settled.x + settled.width + 10);
    }
  }
});

test("the menu button shows a cross while the drawer is open and bars while it is closed", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const btn = page.locator("#menuBtn");
  const bars = btn.locator(".bars");
  const cross = btn.locator(".cross");
  const says = async (label) => {
    await expect(btn).toHaveAttribute("aria-label", label);
    await expect(btn).toHaveAttribute("title", `${label} (m)`);
  };
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await says("Hide the sidebar");
  await expect(cross).toBeVisible();
  await expect(bars).toBeHidden();
  await page.keyboard.press("m");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await says("Show the sidebar");
  await expect(bars).toBeVisible();
  await expect(cross).toBeHidden();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await says("Hide the sidebar");
  await expect(cross).toBeVisible();
  await expect(bars).toBeHidden();
});

test("Escape leaves the drawer alone where it sits beside the map", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#scrim")).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains("sidebar-open"))).toBe(true);
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

test("the closed drawer is out of the tab order, and / opens it to search", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
  const inDrawer = () =>
    page.evaluate(() => document.getElementById("sidebar").contains(document.activeElement));
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await inDrawer()).toBe(false);
  }
  await page.keyboard.press("/");
  await expect(page.locator("body")).toHaveClass(/sidebar-open/);
  await expect(page.locator("#search")).toBeFocused();
  // closed with the focus still inside, as a key closes it
  await page.evaluate(() => document.getElementById("menuBtn").click());
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
  await expect.poll(inDrawer).toBe(false);
});

test("search answers a number as a whole word, and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level 45");
  await expect(page.locator("#results [role=option]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 45");
  await expect(page.locator("#results [role=option] mark")).toHaveText(["LEVEL", "45"]);
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit0");

  await search.fill("zzzz");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  await expect(page.locator("#results")).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(search).not.toHaveAttribute("aria-activedescendant", /./);

  await search.fill("");
  await expect(page.locator("#found")).toBeEmpty();
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("the box's clear button shows for as long as it holds text, and the keyboard reaches it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  const clear = page.locator("#clear");
  await expect(clear).toBeHidden();
  await box.fill("key");
  await expect(clear).toBeVisible();
  await page.locator("#cv").focus();
  await expect(box).not.toBeFocused();
  await expect(clear).toBeVisible();
  await expect(clear).toHaveAccessibleName("Clear the search");
  const target = await clear.boundingBox();
  expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
  // Tab reaches it from the box, and Enter empties the box and gives it the focus
  await box.focus();
  await page.keyboard.press("Tab");
  await expect(clear).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("");
  await expect(box).toBeFocused();
  await expect(clear).toBeHidden();
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#scope")).toBeHidden();
  // a scope chosen goes with the text, as it does under Escape
  await box.fill("key");
  await page.locator("#scope button").nth(2).click();
  await clear.click();
  await box.fill("key");
  await expect(page.locator("#scope button[aria-pressed=true]")).toHaveText("All");
  await box.press("Escape");
  await expect(clear).toBeHidden();
  await expect(box).not.toBeFocused();
});

test("a cell is answered by itself alone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("17,12,17");
  await expect(page.locator("#results [role=group]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]")).toHaveText(
    "17, 12, 17 centre the view here",
  );
  await expect(page.locator("#found")).toBeEmpty();
  await search.fill("40,1,1");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
});

test("the places are eight to a group like the objects, and keep to the scope", async ({
  page,
}) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level");
  const levels = page.locator("#results [role=group][aria-label=Levels]");
  await expect(levels.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await expect(levels.locator(".showmore")).toHaveText(/^show \d+ more$/);
  await search.fill("hiro");
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(1);
  await page.locator("#scope button").nth(2).click();
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(0);
});

test("a search's way back to everywhere is a button the keyboard reaches", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#scope button").nth(2).click();
  const found = page.locator("#found");
  await expect(found).toContainText("in LEVEL 1");
  const widen = found.locator(".widen");
  await expect(widen).toHaveRole("button");
  await widen.focus();
  await page.keyboard.press("Enter");
  await expect(found).not.toContainText("in LEVEL 1");
  await expect(page.locator("#search")).toBeFocused();
  await expect(page.locator("#scope button[aria-pressed=true]")).toHaveText("All");
  await page.locator("#scope button").nth(2).click();
  await expect(page.locator("#scope button").nth(2)).toBeFocused();
  await page.keyboard.press("]");
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
  await expect(page.locator("#scope button").nth(2)).toBeFocused();
  await page.locator("#scope button").nth(0).focus();
  await page.keyboard.press("]");
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 3");
  await expect(page.locator("#scope button").nth(0)).toBeFocused();
  await widen.focus();
  await page.keyboard.press("]");
  await expect(found).toContainText("in LEVEL 4");
  await expect(found.locator(".widen")).toBeFocused();
  await widen.click();
  await expect(page.locator("#search")).toBeFocused();
});

test.describe("under a finger", () => {
  test.use({ hasTouch: true });

  test("widening the search by touch takes the first find, or the scope where there is none, and by mouse the box", async ({
    page,
  }) => {
    await page.goto("/#HIRO/0");
    await settle(page);
    await page.locator("#search").fill("key");
    await page.locator("#scope button").nth(2).click();
    const widen = page.locator("#found .widen");
    await widen.tap();
    await expect(page.locator("#results [role=option]").first()).toBeFocused();
    await page.locator("#scope button").nth(2).click();
    await widen.click();
    await expect(page.locator("#search")).toBeFocused();
    await page.locator("#search").fill("zzzz");
    await page.locator("#scope button").nth(2).click();
    await expect(page.locator("#found")).toContainText("Nothing matches that in LEVEL 1");
    await widen.tap();
    await expect(page.locator("#found")).toHaveText("Nothing matches that.");
    await expect(page.locator("#scope button[aria-pressed=true]")).toBeFocused();
  });
});

test("what a search found is said as well as shown", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const found = page.locator("#found");
  await expect(found).toHaveRole("status");
  await page.locator("#search").fill("zzzz");
  await expect(found).toHaveText("Nothing matches that.");
  await page.locator("#search").fill("key");
  await expect(found).toHaveText(/^\d+ objects$/);
});

test("a search held to the level in hand follows the level as it changes", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#scope button").nth(2).click();
  const found = page.locator("#found");
  const group = page.locator("#results [role=group]").first();
  await expect(found).toContainText("in LEVEL 1");
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect(found).toContainText("in LEVEL 2");
  await expect(group).toHaveAttribute("aria-label", /LEVEL 2$/);
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
});

test("by level, a search lists the levels that hold the thing, most first, and a row opens one", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  await box.fill("key");
  const bylevel = page.locator("#scope button").nth(3);
  await expect(bylevel).toHaveText("By level");
  await bylevel.click();
  await expect(bylevel).toHaveAttribute("aria-pressed", "true");
  const groups = page.locator("#results [role=group]");
  await expect(groups).toHaveCount(1);
  await expect(groups.first()).toHaveAttribute("aria-label", "By level");
  const found = page.locator("#found");
  await expect(found).toHaveText(/^\d+ objects in \d+ levels · search everywhere$/);
  const rows = page.locator("#results [role=option]:not(.showmore)");
  await expect(rows).toHaveCount(8);
  await expect(rows.first()).toHaveText(/^LEVEL \d+ \d+ objects [A-Z]+$/);
  const counts = await rows.evaluateAll((els) =>
    els.map((e) => Number(/(\d+) objects?/.exec(e.textContent)[1])),
  );
  expect(counts[0]).toBeGreaterThan(1);
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  const keys = () =>
    page.locator("#results [role=option]").evaluateAll((els) => els.map((e) => e.dataset.key));
  const before = await keys();
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  expect(await keys()).toEqual(before);
  await expect(page.locator("#scope button").nth(2)).toHaveText("LEVEL 2");
  await box.focus();
  await box.press("ArrowDown");
  await box.press("ArrowDown");
  await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");
  const title = await rows.nth(1).locator(".loc").textContent();
  await box.press("Enter");
  await expect(page.locator("#chip b")).toHaveText(title);
  expect(
    await page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return state.selected;
    }),
  ).toBeNull();
  await expect(page.locator("#detail")).toBeHidden();
  expect(await keys()).toEqual(before);
  await box.fill("inca");
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(1);
  await expect(found).toHaveText("no objects, blocks or settings in any level · search everywhere");
  await box.fill("settings");
  await expect(found).toHaveText(/^the settings in \d+ levels · search everywhere$/);
  await box.fill("zzzz");
  await expect(found).toHaveText("Nothing matches that in any level. · search everywhere");
});

test("a search counts objects, blocks by their kind, and settings apart", async ({ page }) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const search = page.locator("#search");
  const more = page.locator("#found");
  await search.fill("key, crumbling, settings");
  await expect(more).toHaveText(
    /^\d+ objects, \d+ crumbling blocks and the settings of \d+ levels$/,
  );
  await page.locator("#scope button").nth(2).click();
  await expect(more).toContainText("1 object, 6 crumbling blocks and the level's settings in");
  await search.fill("level 94");
  await expect(more).toContainText("no objects, blocks or settings in");
});

test("a block of a kind of its own is found as often as the legend counts it, and a row goes to it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  for (const [hash, title, name, kind, alone] of [
    ["#INCA/7", "LEVEL 38", "Fire block", 1, "fire"],
    ["#ARCTIC/1", "LEVEL 47", "Ice block", 2, "ice"],
  ]) {
    await page.goto(`/${hash}`);
    await settle(page);
    await expect(page.locator("#chip")).toContainText(title);
    const search = page.locator("#search");
    const found = page.locator("#found");
    const noun = name.toLowerCase();
    await search.fill(noun);
    await expect(page.locator("#results [role=group]").first()).toHaveAttribute(
      "aria-label",
      new RegExp(` · ${title}$`),
    );
    await expect(found).toHaveText(new RegExp(`^\\d+ ${noun}s$`));
    await page.locator("#scope button").nth(2).click();
    const legend = page.locator("#kinds li", { hasText: name }).locator(".n");
    const n = Number(await legend.textContent());
    expect(n).toBeGreaterThan(1);
    await expect(found).toHaveText(new RegExp(`^${n} ${noun}s in ${title} · `));
    const rows = page.locator("#results [role=option]");
    await expect(rows).toHaveCount(n);
    await search.fill(alone);
    await expect(found).toContainText(`${n} ${noun}s in ${title}`);
    await search.fill(`kind=${kind}`);
    await expect(found).toHaveText(new RegExp(`^${n} ${noun}s in ${title} · `));

    // Enter goes to the first and selects it, as a click on the block would
    await expect(rows.first()).toContainText(new RegExp(`${name} \\d+,\\d+,\\d+ · kind=${kind}$`));
    const [, x, y, z] = /(\d+),(\d+),(\d+)/.exec(await rows.first().textContent());
    await search.press("Enter");
    const selected = await page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { x, y, z } = state.selected;
      return [x, y, z];
    });
    expect(selected).toEqual([x, y, z].map(Number));
    expect((await headings(page))[0]).toBe(name);
    await expect(page.locator("#say")).toHaveText(`${name}, ${x},${y},${z}, ${title}`);
    await search.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("an object search lists every one round the level in hand, and a row goes there", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  const groups = page.locator("#results [role=group]");
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(groups.nth(1)).toHaveAttribute("aria-label", "HIRO");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("LEVEL 12");
  await expect(rows.first()).toContainText(/top · \d+,\d+,\d+$/);
  await expect(page.locator("#found")).toHaveText(/^\d+ objects$/);
  // eight to a group, the rest a row away that the keys reach too
  const hiro = groups.nth(1);
  await expect(hiro.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await search.focus();
  for (let i = 0; i < 9; i++) await search.press("ArrowDown");
  await expect(hiro.locator(".showmore")).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(hiro.locator(".showmore")).toHaveCount(0);
  expect(await hiro.locator("[role=option]").count()).toBeGreaterThan(8);
  await expect(hiro.locator("[role=option]").nth(8)).toHaveAttribute("aria-selected", "true");
  await expect(search).toBeFocused();

  // a row in another level goes there and leaves the list as it was
  const row = hiro.locator("[role=option]").first();
  const where = await row.textContent();
  await row.click();
  const at = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { x, y, z } = state.selected;
    return { name: state.lvl.name, target: state.target, selected: [x, y, z] };
  });
  expect(where).toContain(at.name);
  const [, x, y, z] = /(\d+),(\d+),(\d+)/.exec(where);
  expect(at.target).toEqual([x, y, z].map((v) => Number(v) + 0.5));
  // the find is selected, so the panel and the outline say which one it was
  expect(at.selected).toEqual([x, y, z].map(Number));
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Key");
  await expect(page.locator("#detail")).toContainText(`cell ${x},${y},${z}`);
  await expect(page.locator("#say")).toHaveText(`Key, top, ${x},${y},${z}, ${at.name}`);
  await expect(page.locator("#results")).toBeVisible();
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(search).not.toBeFocused();

  // the scope bar narrows the list to the level in hand
  await page.locator("#scope button").nth(2).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#found")).toContainText(`1 object in ${at.name}`);
  await page.locator("#found .widen").click();
  expect(await rows.count()).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("down and Enter walk the finds in order, wherever the view has gone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  const walked = [];
  for (let i = 0; i < 3; i++) {
    // choosing gives the keys back to the map, and / takes them again
    if (i) await page.keyboard.press("/");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    walked.push(
      await page.evaluate(async () => {
        const { state } = await import(new URL("js/state.js", location.href).href);
        return state.lvl.name;
      }),
    );
  }
  expect(walked).toEqual(["LEVEL 1", "LEVEL 2", "LEVEL 3"]);
});

test("a field is searched as name=value, and a match outside the row is appended to it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("starts=off");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("starts=off");
  await expect(rows.first().locator("mark")).toHaveText("starts=off");
  await search.fill("f9=500");
  await expect(rows.first()).toContainText("f9=500");
  await search.fill("f9=50");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  // the keys walk the rows and Enter chooses
  await search.fill("coin");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit1");
  const before = await page.evaluate(() => location.hash);
  await search.press("Enter");
  await frame(page);
  expect(await page.evaluate(() => location.hash)).not.toBe(before);
});

test("a coloured thing is named thing first, and found by colour and thing in either order", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const search = page.locator("#search");
  const rows = page.locator("#results [role=option]:not(.showmore)");
  // the name is what sits between the row's level and its face and cell
  const named = () =>
    rows.evaluateAll((all) =>
      all.map((r) =>
        [...r.childNodes]
          .filter((n) => !n.className)
          .map((n) => n.textContent)
          .join("")
          .trim(),
      ),
    );
  await search.fill("blue gem");
  await expect(rows.first()).toContainText("LEVEL 94");
  const byColour = await named();
  expect(byColour.length).toBeGreaterThan(1);
  expect(new Set(byColour)).toEqual(new Set(["Gem (blue)"]));
  await expect(rows.first().locator("mark")).toHaveText(["Gem", "blue"]);
  await search.fill("gem blue");
  await expect(rows.first()).toContainText("LEVEL 94");
  expect(await named()).toEqual(byColour);
  await expect(rows.first().locator("mark")).toHaveText(["Gem", "blue"]);
});

test("a find above the slice's ceiling lifts the ceiling to it", async ({ page }) => {
  await page.goto("/#HIRO/11/45,35/1/17,17,17/0,0/14");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 12");
  await search.press("Enter");
  const at = await page.evaluate(async () => {
    const { state, sliceZ } = await import(new URL("js/state.js", location.href).href);
    return { z: state.selected.z, ceiling: sliceZ(), slice: state.slice };
  });
  expect(at.z).toBeLessThan(19);
  expect(at.ceiling).toBe(at.z);
  await expect(page.locator("#chip")).toContainText(`sliced to z≥${at.z}`);
  await expect(page.locator("#slice")).toHaveValue(String(at.slice));
});

test("the view turns about a find only while it stays selected", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#search").press("Enter");
  const probe = () =>
    page.evaluate(async () => {
      const { state, screen } = await import(new URL("js/state.js", location.href).href);
      const l = state.lvl;
      return {
        target: state.target,
        centre: [0, 1, 2].map((i) => (l.min[i] + l.max[i] + 1) / 2),
        at: screen(20, 15, 17),
        yaw: state.cam.yaw,
        selected: !!state.selected,
      };
    });
  const drag = () =>
    page.evaluate(() => {
      const cv = document.getElementById("cv");
      cv.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 640, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 640, clientY: 400, pointerId: 1 }));
    });
  const found = await probe();
  expect(found.selected).toBe(true);
  expect(found.target).not.toEqual(found.centre);
  await drag();
  const turned = await probe();
  expect(turned.yaw).not.toBe(found.yaw);
  expect(turned.target).toEqual(found.target);

  await page.keyboard.press("Escape");
  const cleared = await probe();
  expect(cleared.selected).toBe(false);
  // the pivot goes back to the level as the next turn begins, moving nothing
  const moved = await page.evaluate(async () => {
    const { state, screen, pivot } = await import(new URL("js/state.js", location.href).href);
    const before = screen(20, 15, 17);
    pivot();
    const after = screen(20, 15, 17);
    return { target: state.target, dx: after[0] - before[0], dy: after[1] - before[1] };
  });
  expect(moved.target).toEqual(cleared.centre);
  expect(Math.abs(moved.dx)).toBeLessThan(1e-6);
  expect(Math.abs(moved.dy)).toBeLessThan(1e-6);
  await drag();
  expect((await probe()).target).toEqual(cleared.centre);
});

/** The zoom the view is at, and the one a fit taken now gives it. */
const fitted = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { fit } = await import(new URL("js/navigate.js", location.href).href);
    const zoom = state.cam.zoom;
    fit();
    const width = document.getElementById("cv").clientWidth;
    return { zoom, fit: state.cam.zoom, width, measured: state.view.w };
  });

/** A press on the map that wanders `dx` and `dy` before it lets go. */
const press = (page, dx, dy) =>
  page.evaluate(
    ([dx, dy]) => {
      const cv = document.getElementById("cv");
      const at = (type, x, y) =>
        cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1 }));
      at("pointerdown", 600, 400);
      at("pointermove", 600 + dx, 400 + dy);
      at("pointerup", 600 + dx, 400 + dy);
    },
    [dx, dy],
  );

test("a view the map framed is framed again as the canvas settles and resizes", async ({
  page,
}) => {
  await page.goto("/#HILLS/19/200,10");
  await settle(page);
  await still(page);
  const settled = await fitted(page);
  expect(settled.measured).toBe(settled.width);
  expect(settled.zoom).toBe(settled.fit);

  await page.setViewportSize({ width: 1100, height: 640 });
  await still(page);
  const resized = await fitted(page);
  expect(resized.measured).toBeLessThan(settled.measured);
  expect(resized.zoom).toBe(resized.fit);
  expect(page.url()).toContain("#HILLS/19/200,10/fit/33");

  // a press that wanders less than a drag is a click, and leaves the view framed
  await press(page, 2, 1);
  await page.setViewportSize({ width: 1280, height: 720 });
  await still(page);
  const clicked = await fitted(page);
  expect(clicked.measured).toBe(settled.measured);
  expect(clicked.zoom).toBe(clicked.fit);
});

test("a fitted view's link opens fitted to the window it is opened in", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await still(page);
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(21, 13, 18)));
  });
  await page.keyboard.press(",");
  await frame(page);
  const link = page.url();
  expect(link).toMatch(/#HIRO\/11\/-?\d+,\d+\/fit\/32\/21,13,18$/);
  const wide = await fitted(page);

  await page.setViewportSize({ width: 390, height: 720 });
  await page.goto("about:blank");
  await page.goto(link);
  await settle(page);
  await still(page);
  const narrow = await fitted(page);
  expect(narrow.zoom).toBe(narrow.fit);
  expect(narrow.zoom).toBeLessThan(wide.zoom);
  await expect(page.locator("#detail")).toContainText("cell 21,13,18");
  expect(page.url()).toBe(link);

  await press(page, 40, 20);
  await expect.poll(() => page.url()).not.toContain("/fit/");
});

test("a camera moved on purpose stays where it was put as the canvas resizes, until f", async ({
  page,
}) => {
  await page.goto("/#HILLS/19/200,10");
  await settle(page);
  await still(page);
  const camera = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { ...state.cam, target: state.target };
    });
  const sizes = [
    { width: 1100, height: 640 },
    { width: 1280, height: 720 },
  ];
  let n = 0;
  const resize = async () => {
    await page.setViewportSize(sizes[n++ % sizes.length]);
    await still(page);
  };
  const search = page.locator("#search");
  const touches = [
    ["a drag", () => press(page, 40, 20)],
    [
      "the wheel",
      () =>
        page.evaluate(() =>
          document.getElementById("cv").dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: -120,
              clientX: 500,
              clientY: 300,
              cancelable: true,
            }),
          ),
        ),
    ],
    [
      "a pinch",
      () =>
        page.evaluate(() => {
          const cv = document.getElementById("cv");
          const finger = (id, x) =>
            new Touch({ identifier: id, target: cv, clientX: x, clientY: 400 });
          const touches = (type, list) => cv.dispatchEvent(new TouchEvent(type, { touches: list }));
          // the first finger's press is still a click when the second lands
          cv.dispatchEvent(
            new PointerEvent("pointerdown", { clientX: 560, clientY: 400, pointerId: 1 }),
          );
          touches("touchstart", [finger(1, 560)]);
          touches("touchstart", [finger(1, 560), finger(2, 640)]);
          touches("touchmove", [finger(1, 530), finger(2, 690)]);
          touches("touchend", []);
          cv.dispatchEvent(
            new PointerEvent("pointerup", { clientX: 530, clientY: 400, pointerId: 1 }),
          );
        }),
    ],
    ["an arrow", () => page.keyboard.press("ArrowLeft")],
    ["a zoom key", () => page.keyboard.press("-")],
    ["a snap of the turn", () => page.keyboard.press("q")],
    [
      "a find",
      async () => {
        const cell = await page.evaluate(async () => {
          const { state } = await import(new URL("js/state.js", location.href).href);
          const c = [...state.idx.cells.values()][0];
          return `${c.x},${c.y},${c.z}`;
        });
        await search.fill(cell);
        await search.press("Enter");
      },
    ],
    ["a link naming its zoom", () => page.evaluate(() => (location.hash = "#HILLS/19/200,10/1.2"))],
  ];
  for (const [what, touch] of touches) {
    await page.keyboard.press("f");
    await touch();
    await frame(page);
    const before = await camera();
    await resize();
    expect(await camera(), what).toEqual(before);
  }

  await page.keyboard.press("f");
  await resize();
  const framed = await fitted(page);
  expect(framed.zoom).toBe(framed.fit);
});

/** The box the level is drawn in, in canvas pixels, read off the map with
    the scale bar's own box left out, and the room a fit leaves round it. */
const drawnBox = (page) =>
  page.evaluate(async () => {
    const { state, FIT_MARGIN } = await import(new URL("js/state.js", location.href).href);
    const { draw, invalidatePick } = await import(new URL("js/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const { width, height } = cv;
    const inked = (skip) => {
      const px = cv.getContext("2d").getImageData(0, 0, width, height).data;
      let [x0, y0, x1, y1] = [width, height, -1, -1];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (px[i] === px[0] && px[i + 1] === px[1] && px[i + 2] === px[2]) continue;
          if (skip && x >= skip[0] && y >= skip[1] && x <= skip[2] && y <= skip[3]) continue;
          [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        }
      }
      return [x0, y0, x1, y1];
    };
    const was = state.cam.panX;
    state.cam.panX += 1e4;
    draw();
    const scale = inked();
    state.cam.panX = was;
    invalidatePick();
    draw();
    const k = width / cv.clientWidth;
    const [x0, y0, x1, y1] = inked(scale).map((v) => v / k);
    const m = FIT_MARGIN / 2;
    return {
      box: [x0, y0, x1, y1],
      room: [x0 - m, cv.clientWidth - m - (x1 + 1), y0 - m, cv.clientHeight - m - (y1 + 1)],
    };
  });

test("f at a turn frames every block inside the canvas, with the margin round the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/2/135,50/1");
  await settle(page);
  await still(page);
  await page.keyboard.press("o");
  await expect(page).not.toHaveURL(/\/fit\//);
  await page.keyboard.press("f");
  await expect(page).toHaveURL(/#HIRO\/2\/135,50\/fit\/33$/);
  await frame(page);
  const { box, room } = await drawnBox(page);
  for (const side of room) expect(side, `${box}`).toBeGreaterThan(-2);
  // the blocks reach the margin on one axis, both sides alike
  const [left, right, above, below] = room;
  expect(Math.min(Math.max(left, right), Math.max(above, below)), `${box}`).toBeLessThan(3);
  expect(errors).toEqual([]);
});

/** Bring the start's block under a client point, and close in on it. */
const startUnder = (page, point) =>
  page.evaluate(async ([px, py]) => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { pan, zoomAt } = await import(new URL("js/interaction.js", location.href).href);
    const r = document.getElementById("cv").getBoundingClientRect();
    const [start] = state.lvl.records.filter((r) => r.on.some((o) => o.type === 30));
    const [x, y] = screen(start.x + 0.5, start.y + 0.5, start.z);
    pan(px - r.left - x, py - r.top - y);
    zoomAt(px - r.left, py - r.top, 2);
  }, point);

test("the button in the corner frames the level again as f does, and no block behind it hears a press", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/11");
  await settle(page);
  await still(page);
  const button = page.locator("#fitBtn");
  await expect(button).toHaveAccessibleName("Fit the level");
  await expect(button).toHaveAttribute("title", "Fit the level (f)");
  const box = await button.boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  await startUnder(page, centre);
  await expect(page).not.toHaveURL(/\/fit\//);
  expect(await cellUnder(page, centre)).toBeTruthy();
  const beside = [box.x - box.width / 2, centre[1]];
  expect(await cellUnder(page, beside)).toBeTruthy();
  const ink = () => button.evaluate((b) => getComputedStyle(b).color);
  await page.mouse.move(...beside);
  await expect.poll(() => hovered(page)).not.toBeNull();
  const unlit = await ink();
  await page.mouse.move(...centre);
  await expect.poll(() => hovered(page)).toBeNull();
  await expect(page.locator("#tip")).toBeHidden();
  // where a pointer hovers, the button lights under it
  expect(await ink()).not.toBe(unlit);
  await page.mouse.click(...centre);
  await expect(page).toHaveURL(/#INCA\/11\/45,35\/fit\/33$/);
  await expect(page.locator("#detail")).toBeHidden();
  const framed = await fitted(page);
  expect(framed.zoom).toBe(framed.fit);
  expect(errors).toEqual([]);
});

test("the button in the corner is dim while the level stays framed, and lights once the view leaves it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/11");
  await settle(page);
  await still(page);
  const button = page.locator("#fitBtn");
  const ink = () => button.evaluate((b) => getComputedStyle(b).color);
  const light = (rgb) =>
    rgb
      .match(/\d+/g)
      .slice(0, 3)
      .reduce((a, v) => a + Number(v), 0);
  const resting = await ink();
  const leaves = [
    ["a snap of the turn", () => page.keyboard.press("e")],
    ["a zoom key", () => page.keyboard.press("+")],
    ["an arrow", () => page.keyboard.press("ArrowLeft")],
    ["a drag", () => press(page, 40, 20)],
    ["a link naming its zoom", () => page.evaluate(() => (location.hash = "#INCA/11/45,35/1.2"))],
  ];
  for (const [what, leave] of leaves) {
    await leave();
    await expect.poll(ink, what).not.toBe(resting);
    expect(light(await ink()), what).toBeGreaterThan(light(resting));
    await page.keyboard.press("f");
    expect(await ink(), what).toBe(resting);
  }

  // a framed view kept framed as the window changes keeps the button dim
  await page.setViewportSize({ width: 1100, height: 640 });
  await still(page);
  expect(await ink()).toBe(resting);

  const cell = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const c = [...state.idx.cells.values()][0];
    return `${c.x},${c.y},${c.z}`;
  });
  await page.locator("#search").fill(cell);
  await page.locator("#search").press("Enter");
  await expect.poll(ink, "a find").not.toBe(resting);

  // pressed, it frames the level and rests, and pressed at rest it changes nothing
  const camera = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { ...state.cam, target: state.target };
    });
  for (let i = 0; i < 2; i++) {
    const before = await camera();
    await button.click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveURL(/\/fit\//);
    await expect(button).toBeEnabled();
    expect(await ink()).toBe(resting);
    if (i) expect(await camera()).toEqual(before);
  }
  expect(errors).toEqual([]);
});

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The box the scale bar is drawn in, read off the map drawn with the level
    far off the canvas, which leaves the scale alone on it. */
const scaleBox = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { draw, invalidatePick } = await import(new URL("js/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const was = state.cam.panX;
    state.cam.panX += 1e4;
    draw();
    const { width, height } = cv;
    const px = cv.getContext("2d").getImageData(0, 0, width, height).data;
    let [x0, y0, x1, y1] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (px[i] === px[0] && px[i + 1] === px[1] && px[i + 2] === px[2]) continue;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    }
    state.cam.panX = was;
    invalidatePick();
    draw();
    const r = cv.getBoundingClientRect();
    const k = width / r.width;
    return {
      x: r.left + x0 / k,
      y: r.top + y0 / k,
      width: (x1 + 1 - x0) / k,
      height: (y1 + 1 - y0) / k,
    };
  });

test("the corner stands clear of the scale however far it reaches, the chip and the panel", async ({
  page,
}) => {
  const sizes = [
    { width: 1280, height: 720 },
    { width: 375, height: 700 },
    { width: 320, height: 560 },
    { width: 740, height: 360 },
  ];
  for (const size of sizes) {
    const at = `${size.width}x${size.height}`;
    await page.setViewportSize(size);
    // BONUS 17, whose chip says the most
    await page.goto("/#FIELD/16");
    await settle(page);
    await still(page);
    await page.evaluate(async () => {
      const { state, ZOOM_MAX } = await import(new URL("js/state.js", location.href).href);
      const { zoomAt } = await import(new URL("js/interaction.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      zoomAt(0, state.view.h, ZOOM_MAX / state.cam.zoom);
      // the block with the most on it, for the longest panel
      const [key] = [...state.idx.markers].sort((a, b) => b[1].length - a[1].length)[0];
      showCell(state.idx.cells.get(key));
    });
    await frame(page);
    const scale = await scaleBox(page);
    expect(scale.width, at).toBeGreaterThan(size.width / 2);
    const map = await page.locator("#cv").boundingBox();
    const others = {
      scale,
      chip: await page.locator("#chip").boundingBox(),
      panel: await page.locator("#detail").boundingBox(),
    };
    const widgets = await page.locator(".corner > *").all();
    expect(widgets.length, at).toBeGreaterThan(0);
    for (const widget of widgets) {
      const box = await widget.boundingBox();
      expect(box.x, at).toBeGreaterThanOrEqual(map.x);
      expect(box.x + box.width, at).toBeLessThanOrEqual(map.x + map.width);
      for (const [name, other] of Object.entries(others)) {
        expect(overlaps(box, other), `${at}: the corner and the ${name}`).toBe(false);
      }
    }
  }
});

/** Keep what the compass writes each time it paints, from here on. */
const watchCompass = (page) =>
  page.evaluate(() => {
    const g = document.getElementById("compass").getContext("2d");
    const { clearRect, fillText } = g;
    window.compassSays = [];
    g.clearRect = (...a) => {
      window.compassSays = [];
      return clearRect.apply(g, a);
    };
    g.fillText = (text, x, y) => {
      window.compassSays.push({ text, x, y, colour: g.fillStyle });
      return fillText.call(g, text, x, y);
    };
  });

test("the compass names every face and way as the panel does, each where it lies in the view", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/11");
  await settle(page);
  await still(page);
  await expect(page.locator("#compass")).toHaveAccessibleName("Compass");
  await watchCompass(page);
  const turns = [
    [200, 15, "top"],
    [330, 70, "top"],
    [120, -30, "underside"],
    [45, 35, "top"],
  ];
  for (const [yaw, pitch, lid] of turns) {
    const turn = `${yaw}°, ${pitch}°`;
    await page.evaluate((link) => (location.hash = link), `#INCA/11/${yaw},${pitch}`);
    await frame(page);
    const said = await page.evaluate(async () => {
      const { camera } = await import(new URL("js/state.js", location.href).href);
      const { FACE_NORMAL, DIRECTION_NAME } = await import(
        new URL("js/faces.js", location.href).href
      );
      const cv = document.getElementById("compass");
      const mid = [cv.clientWidth / 2, cv.clientHeight / 2];
      const c = camera();
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const says = window.compassSays;
      const from = (w) => [w.x - mid[0], w.y - mid[1]];
      return {
        words: says.map((w) => w.text),
        panel: DIRECTION_NAME,
        ways: DIRECTION_NAME.map((name, i) => {
          const w = says.find((s) => s.text === name);
          if (!w) return { name };
          const way = [dot(FACE_NORMAL[i], c.right), -dot(FACE_NORMAL[i], c.up)];
          const at = from(w);
          const cos = (at[0] * way[0] + at[1] * way[1]) / (Math.hypot(...at) * Math.hypot(...way));
          return { name, cos, away: dot(FACE_NORMAL[i], c.toward) <= 0, colour: w.colour };
        }),
        lid: says.filter((w) => !DIRECTION_NAME.includes(w.text)).map((w) => from(w)[1]),
      };
    });
    expect([...said.words].sort(), turn).toEqual([...said.panel, lid].sort());
    for (const w of said.ways) expect(w.cos, `${turn}: ${w.name}`).toBeGreaterThan(0.8);
    // the top is named above the middle, the underside below it
    expect(said.lid.length, turn).toBe(1);
    expect(Math.sign(said.lid[0]), turn).toBe(lid === "top" ? -1 : 1);
    const inks = (away) => [
      ...new Set(said.ways.filter((w) => w.away === away).map((w) => w.colour)),
    ];
    const [faint, plain] = [inks(true), inks(false)];
    expect(faint.length, turn).toBe(1);
    expect(plain.length, turn).toBe(1);
    expect(faint[0], turn).not.toBe(plain[0]);
  }
  expect(errors).toEqual([]);
});

/** How bright each side of the compass's block is that turns to the view,
    by the game's number for it, read clear of its name. */
const compassLight = (page) =>
  page.evaluate(async () => {
    const { camera } = await import(new URL("js/state.js", location.href).href);
    const { FACE_NORMAL } = await import(new URL("js/faces.js", location.href).href);
    const cv = document.getElementById("compass");
    const k = cv.width / cv.clientWidth;
    const c = camera();
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return FACE_NORMAL.map((n) => {
      if (dot(n, c.toward) <= 0 || n[2] !== 0) return null;
      // toward the side's lower edge, below its name
      const p = n.map((v, i) => v * 0.5 + (i === 2 ? 0.35 : 0));
      const x = cv.clientWidth / 2 + dot(p, c.right) * 0.4 * cv.clientWidth;
      const y = cv.clientHeight / 2 - dot(p, c.up) * 0.4 * cv.clientWidth;
      const [r, g, b] = cv
        .getContext("2d")
        .getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
      return r + g + b;
    });
  });

test("the compass shades its block as the map shades a face, with textures or without", async ({
  page,
}) => {
  const [PLUS_X, PLUS_Y] = [1, 2];
  // HIRO's textures light its +y sides brightest and INCA's its +x sides,
  // and without them the light that falls on every world lights +x the more
  for (const [link, keys, bright, dim] of [
    ["#HIRO/11/45,35", [], PLUS_Y, PLUS_X],
    ["#INCA/11/45,35", [], PLUS_X, PLUS_Y],
    ["#HIRO/11/45,35", ["t"], PLUS_X, PLUS_Y],
  ]) {
    await page.goto(`/${link}`);
    await settle(page);
    await still(page);
    for (const key of keys) await page.keyboard.press(key);
    await frame(page);
    const light = await compassLight(page);
    expect(light[bright], `${link} ${keys}`).toBeGreaterThan(light[dim]);
  }
});

test("a press on the compass reaches no block behind it, and moves nothing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/11");
  await settle(page);
  await still(page);
  const box = await page.locator("#compass").boundingBox();
  const centre = [box.x + box.width / 2, box.y + box.height / 2];
  // at the compass's corner, so that the block reaches under it and out beside it
  const opened = page.url();
  await startUnder(page, [box.x, box.y]);
  await expect.poll(() => page.url()).not.toBe(opened);
  const link = page.url();
  expect(await cellUnder(page, centre)).toBeTruthy();
  // off the compass, above the button beside it
  const beside = [box.x - 10, box.y + 10];
  expect(await cellUnder(page, beside)).toBeTruthy();
  await page.mouse.move(...beside);
  await expect.poll(() => hovered(page)).not.toBeNull();
  await page.mouse.move(...centre);
  await expect.poll(() => hovered(page)).toBeNull();
  await expect(page.locator("#tip")).toBeHidden();
  await page.mouse.click(...centre);
  await frame(page);
  await expect(page.locator("#detail")).toBeHidden();
  expect(page.url()).toBe(link);
  expect(errors).toEqual([]);
});

test("a switch in the settings puts the compass away, and is remembered", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const compass = page.locator("#compass");
  const box = page.locator("#showCompass");
  await expect(compass).toBeVisible();
  await page.keyboard.press("s");
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
  await page.keyboard.press("s");
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

  // two types that share a name
  await page.goto("/#HIRO/19");
  await expect(page.locator("#chip b")).toHaveText("LESSON");
  const alike = await page
    .getByRole("list", { name: "Objects" })
    .getByRole("button")
    .evaluateAll((rows) =>
      rows.filter((r) => r.children[1].textContent === "Captivator").map((r) => r.dataset.kind),
    );
  expect(alike).toEqual(["t50", "t52"]);
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
      const { state } = await import(new URL("js/state.js", location.href).href);
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
      const { state } = await import(new URL("js/state.js", location.href).href);
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
      const [{ state, screen }, { draw }] = await Promise.all(["state.js", "render.js"].map(at));
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
    const [{ emit }, { state }] = await Promise.all(["dom.js", "state.js"].map(at));
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
  expect(await cursor(row)).toBe("pointer");
  expect(await cursor(row.locator(".icon"))).toBe("pointer");
  const map = page.locator("#cv");
  expect(await cursor(map)).toBe("grab");
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await cursor(map)).toBe("grabbing");
  await page.mouse.up();
});

test("a panel is a dialog that a click inside does not dismiss", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.locator("#aboutBtn").click();
  const help = page.locator("#help");
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("aria-label", "About this map");
  await expect(page.locator("#help .x")).toBeFocused();

  await page.locator("#help .box p").first().click();
  await expect(help).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(page.locator("#aboutBtn")).toBeFocused();

  await page.locator("#aboutBtn").click();
  await page.locator("#help").click({ position: { x: 5, y: 5 } });
  await expect(help).toBeHidden();
});

test("the keys list wears each key as a cap and leaves a gesture in words", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const rows = page.locator("#help dt");
  await expect(rows.first()).toHaveText("drag");
  await expect(rows.first().locator("kbd")).toHaveCount(0);
  await expect(rows.filter({ hasText: "wheel" }).locator("kbd")).toHaveText(["+", "−"]);
  await expect(rows.filter({ hasText: "Esc" }).locator("kbd")).toHaveText(["Esc"]);
  await expect(rows.last().locator("kbd")).toHaveText(["?"]);
  // a cap in the list is the hint beside a switch in the settings
  const look = (sel) =>
    page.evaluate((sel) => {
      const s = getComputedStyle(document.querySelector(sel));
      return [s.font, s.color, s.backgroundColor, s.borderBottomWidth, s.borderRadius].join();
    }, sel);
  expect(await look("#help dt kbd")).toBe(await look("#settings kbd"));
});

test("the keys list says what a key does and not what it waits on", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const said = await page.locator("#help dd").allTextContents();
  for (const line of [
    "dim what the slice hides rather than take it off",
    "previous and next level",
    "objects as models",
    "motion",
    "object labels",
    "start camera",
  ])
    expect(said).toContain(line);
});

test("Back closes a dialog and leaves the map where it was", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const url = page.url();
  const help = page.locator("#help");
  await page.keyboard.press("?");
  await expect(help).toBeVisible();
  await page.goBack();
  await expect(help).toBeHidden();
  expect(page.url()).toBe(url);
  await expect(page.locator("#chip")).toContainText("LEVEL 12");
  // closed any other way, it gives back the entry it stood on
  await page.keyboard.press("?");
  await expect.poll(() => page.evaluate(() => history.state)).not.toBeNull();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  expect(page.url()).toBe(url);
});

test("a dialog keeps the keys to itself", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const help = page.locator("#help");
  const inside = () =>
    page.evaluate(() => document.getElementById("help").contains(document.activeElement));
  await page.keyboard.press("?");
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).not.toBeChecked();
  await page.locator("#aboutBtn").click();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }
});

test("a dialog opened as another closes stays open, on an entry of its own", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const help = page.locator("#help");
  await page.keyboard.press("?");
  const first = await page.evaluate(() => history.state.dialog);
  // both at once, before the Back that closing the first spends has landed
  await page.evaluate(() => {
    for (const key of ["Escape", "?"])
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => history.state?.dialog)).toBeGreaterThan(first);
  await expect(help).toBeVisible();
  await page.goBack();
  await expect(help).toBeHidden();
  expect(await page.evaluate(() => history.state)).toBeNull();
});

const notice = (page, msg) =>
  page.evaluate(
    async (msg) => (await import(new URL("js/toast.js", location.href).href)).toast(msg),
    msg,
  );

test("a notice comes and goes at the foot of the map, and a repeat does not stack", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const toasts = page.locator("#toastStack .toast");
  await expect(page.locator("#toastStack")).toHaveAttribute("aria-live", "polite");
  await notice(page, "One.");
  await expect(toasts).toHaveText(["One."]);
  await notice(page, "One.");
  await expect(toasts).toHaveCount(1);
  for (const msg of ["Two.", "Three.", "Four.", "Five."]) await notice(page, msg);
  // three at once, the newest lowest, and the rest counted above them
  await expect(toasts).toHaveText(["Three.", "Two.", "One."]);
  await expect(page.locator("#toastStack .toast-more")).toHaveText("+2 more");
  const tops = await toasts.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(tops[0]).toBeGreaterThan(tops[1]);
  expect(tops[1]).toBeGreaterThan(tops[2]);
  // each leaves in its time, and what waited comes on as it does
  await expect(toasts.filter({ hasText: "Five." })).toBeVisible({ timeout: 10000 });
  await expect(page.locator("#toastStack .toast-more")).toHaveCount(0);
  await expect(toasts).toHaveCount(0, { timeout: 10000 });
});

test("where the system asks for reduced motion a notice neither slides nor drains", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#HIRO/0");
  await settle(page);
  await notice(page, "Still.");
  const toast = page.locator("#toastStack .toast");
  await expect(toast).toBeVisible();
  expect(await toast.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe("0s");
  await expect(page.locator("#toastStack .toast-bar")).toBeHidden();
  for (const s of ["#menuBtn", "#sidebar"])
    expect(await page.locator(s).evaluate((e) => getComputedStyle(e).transitionDuration)).toBe(
      "0s",
    );
});

test("an invisible block's icon shows it at the peak of its pulse", async ({ page }) => {
  await page.goto("/#HILLS/19");
  await settle(page);
  const { median, peak } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }, { SKINNED_LOOK }, { blockIcon }] = await Promise.all(
      ["state.js", "atlas.js", "blocks.js", "icons.js"].map(at),
    );
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
    const cv = blockIcon(state.lvl, 3);
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const alphas = [];
    for (let i = 3; i < px.length; i += 4) if (px[i]) alphas.push(px[i]);
    alphas.sort((a, b) => a - b);
    return { median: alphas[alphas.length >> 1], peak: SKINNED_LOOK[3].alpha * 255 };
  });
  expect(Math.abs(median - peak)).toBeLessThan(8);
});

test("objects draw as themselves, keep turning, and go back to markers on d", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0");
  await settle(page);
  const probe = async () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { markerModel, levelMarkers } = await import(new URL("js/data.js", location.href).href);
      const marks = levelMarkers(state.lvl);
      return {
        models: state.show.models,
        drawn: marks.filter((m) => markerModel(m, state.lvl)).length,
        of: marks.length,
      };
    });
  const before = await probe();
  expect(before.models).toBe(true);
  // LEVEL 1: two coins, a key, a fruit, the exit, and the ball at the start
  expect(before.drawn).toBe(6);
  expect(before.of).toBe(6);
  // the coins turn, so the frame is drawn again without anyone touching the page
  expect(await drawn(page)).toBeGreaterThan(8);
  await page.keyboard.press("d");
  const after = await probe();
  expect(after.models).toBe(false);
  await expect(page.locator("#showModels")).not.toBeChecked();
  expect(errors).toEqual([]);
});

/** The text one frame writes on the canvas. */
const written = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/render.js", location.href).href);
    const g = document.getElementById("cv").getContext("2d");
    const seen = [];
    const fillText = g.fillText;
    g.fillText = (text, ...rest) => (seen.push(text), fillText.call(g, text, ...rest));
    draw();
    g.fillText = fillText;
    return seen;
  });

test("a label leaves out the face its thing stands on, and n names it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await still(page);
  await expect(page.locator("#showFaces")).not.toBeChecked();
  await page.keyboard.press("l");
  const plain = await written(page);
  expect(plain.filter((t) => t.includes(" · top"))).toEqual([]);
  await page.keyboard.press("n");
  await expect(page.locator("#showFaces")).toBeChecked();
  // LEVEL 1 puts all six of its things on top
  const named = (await written(page)).filter((t) => t.endsWith(" · top"));
  expect(named).toHaveLength(6);
  for (const t of named) expect(plain).toContain(t.slice(0, -" · top".length));
  // a marker's label says the same, and so does the tooltip, whatever the switch
  await page.keyboard.press("d");
  expect((await written(page)).filter((t) => t.endsWith(" · top")).sort()).toEqual(named.sort());
  await page.keyboard.press("n");
  await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { markerLabel } = await import(new URL("js/data.js", location.href).href);
    const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => markerLabel(m) === "Key"));
    const c = state.idx.cells.get(key);
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
  });
  await expect(page.locator("#tip")).toContainText("Key · top");
  expect(errors).toEqual([]);
});

/** Rest the pointer on the top of the level's start, and give the client point it rests at. */
const restOnStart = (page) =>
  page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const [start] = state.lvl.records.filter((r) => r.on.some((o) => o.type === 30));
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(start.x + 0.5, start.y + 0.5, start.z);
    const at = [r.left + x, r.top + y];
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: at[0], clientY: at[1] }));
    return at;
  });

/** The cell under a client point, as the readout writes it. */
const cellUnder = (page, point) =>
  page.evaluate(async ([x, y]) => {
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    const r = document.getElementById("cv").getBoundingClientRect();
    const c = cellAt(x - r.left, y - r.top);
    return c && `${c.x}, ${c.y}, ${c.z}`;
  }, point);

/** The hovered cell, as the readout writes it. */
const hovered = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const c = state.hover;
    return c && `${c.x}, ${c.y}, ${c.z}`;
  });

test("a level changed under a still pointer leaves no word of the cell it was over", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  await expect(page.locator("#tip")).toContainText("Start · top");
  await expect(page.locator("#readout")).toContainText("19, 19, 17");
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).toContainText("LEVEL 44");
  // a block of the new level lies under the pointer, named only once it moves
  expect(await cellUnder(page, point)).toBeTruthy();
  await frame(page);
  expect(await hovered(page)).toBeNull();
  await expect(page.locator("#tip")).toBeHidden();
  await expect(page.locator("#readout")).not.toContainText("19, 19, 17");
  expect(errors).toEqual([]);
});

test("the readout follows the camera with the pointer off the map", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HAZEFI/1");
  await settle(page);
  await still(page);
  const zoom = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return `×${state.cam.zoom.toFixed(2)}`;
    });
  const fitted = await zoom();
  expect(fitted).not.toBe("×1.00");
  await expect(page.locator("#readout")).toHaveText(`${fitted}  45° / 35°`);
  await page.keyboard.press("+");
  const zoomed = await zoom();
  expect(zoomed).not.toBe(fitted);
  await expect(page.locator("#readout")).toHaveText(`${zoomed}  45° / 35°`);
  expect(errors).toEqual([]);
});

test("the readout says nothing and the corner stays hidden while no level is on screen", async ({
  page,
}) => {
  // the blocked data is an error on the console, so only the page's own are counted
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/map_data.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#chip")).toContainText("could not be loaded");
  await still(page);
  await expect(page.locator("#readout")).toHaveText("");
  await expect(page.locator("#corner")).toBeHidden();
  await page.evaluate(() => {
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: 700, clientY: 400 }));
    cv.dispatchEvent(new PointerEvent("pointerleave", { clientX: 700, clientY: 400 }));
  });
  await frame(page);
  await expect(page.locator("#readout")).toHaveText("");
  expect(errors).toEqual([]);
});

test("a camera moved under a still pointer names the cell now under it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  let was = await cellUnder(page, point);
  expect(await hovered(page)).toBe(was);
  const moves = [
    ["a snap of the turn", () => page.keyboard.press("e")],
    ["a zoom key", () => page.keyboard.press("+")],
    // the view is not framed, so a resize moves the picture and writes no link
    [
      "a resize",
      async () => {
        await page.setViewportSize({ width: 1100, height: 640 });
        await still(page);
      },
    ],
  ];
  for (const [what, move] of moves) {
    await move();
    const now = await cellUnder(page, point);
    expect(now, what).toBeTruthy();
    expect(now, what).not.toBe(was);
    await expect.poll(() => hovered(page), what).toBe(now);
    await expect(page.locator("#tip"), what).toContainText(now);
    await expect(page.locator("#readout"), what).toContainText(now);
    was = now;
  }
  expect(errors).toEqual([]);
});

test("a zoom under a still pointer paints the pick about the pointer alone", async ({ page }) => {
  const errors = trackErrors(page);
  // the pick is the one canvas read back often, and its fills are counted
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      if (opts?.willReadFrequently) window.__pick = this;
      return getContext.call(this, type, opts);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    window.__fills = 0;
    CanvasRenderingContext2D.prototype.fill = function (...a) {
      if (this.canvas === window.__pick) window.__fills++;
      return fill.apply(this, a);
    };
  });
  await page.goto("/#INCA/14/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  const was = await cellUnder(page, point);
  expect(await hovered(page)).toBe(was);
  const fills = () => page.evaluate(() => window.__fills);
  const whole = await page.evaluate(async ([x, y]) => {
    const { invalidatePick, cellAt } = await import(new URL("js/render.js", location.href).href);
    const r = document.getElementById("cv").getBoundingClientRect();
    window.__fills = 0;
    invalidatePick();
    cellAt(x - r.left, y - r.top);
    return window.__fills;
  }, point);
  expect(whole).toBeGreaterThan(100);
  await page.evaluate(([x, y]) => {
    window.__fills = 0;
    document
      .getElementById("cv")
      .dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: x, clientY: y, cancelable: true }),
      );
  }, point);
  await frame(page);
  // the zoom keeps the point under the pointer where it is, so the cell holds
  await expect.poll(() => hovered(page)).toBe(was);
  expect(await fills()).toBeGreaterThan(0);
  expect(await fills()).toBeLessThan(whole / 4);
  // a move elsewhere finds the cell there as a whole pick does
  const other = await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const tops = [...state.idx.cells.values()].sort((a, b) => a.z - b.z);
    for (const c of tops) {
      const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
      const at = cellAt(x, y);
      if (!at || (at.x === c.x && at.y === c.y && at.z === c.z)) continue;
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }),
      );
      return `${at.x}, ${at.y}, ${at.z}`;
    }
    const c = tops.at(-1);
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
    return `${c.x}, ${c.y}, ${c.z}`;
  });
  expect(other).not.toBe(was);
  await expect.poll(() => hovered(page)).toBe(other);
  expect(errors).toEqual([]);
});

test("a zoom under a still pointer leaves the tip as it stands", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  await expect(page.locator("#tip")).toContainText("Start · top");
  const was = await hovered(page);
  await page.evaluate(([x, y]) => {
    window.__changes = 0;
    new MutationObserver((records) => (window.__changes += records.length)).observe(
      document.getElementById("tip"),
      { childList: true, characterData: true, attributes: true, subtree: true },
    );
    document
      .getElementById("cv")
      .dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: x, clientY: y, cancelable: true }),
      );
  }, point);
  await frame(page);
  await frame(page);
  expect(await hovered(page)).toBe(was);
  await expect(page.locator("#tip")).toContainText("Start · top");
  expect(await page.evaluate(() => window.__changes)).toBe(0);
  expect(errors).toEqual([]);
});

test("a drag names the cell under the pointer once it lets go, and not before", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const [x, y] = await restOnStart(page);
  const was = await hovered(page);
  const at = (type, point) =>
    page.evaluate(
      ([type, [x, y]]) =>
        document
          .getElementById("cv")
          .dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1 })),
      [type, point],
    );
  const to = [x + 40, y + 20];
  await at("pointerdown", [x, y]);
  await at("pointermove", to);
  await frame(page);
  expect(await hovered(page)).toBe(was);
  await at("pointerup", to);
  const now = await cellUnder(page, to);
  expect(now).toBeTruthy();
  expect(now).not.toBe(was);
  await expect.poll(() => hovered(page)).toBe(now);
  await expect(page.locator("#tip")).toContainText(now);
  await expect(page.locator("#readout")).toContainText(now);
  expect(errors).toEqual([]);
});

test("the settings have no model, so among the models they show only while selected", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 24 keeps its settings on the cell of a plain block, and from low
  // down where their marker stands is clear of every block
  await page.goto("/#HILLS/8/45,15/1.6/16,22,17");
  await settle(page);
  await page.keyboard.press("v");
  await page.keyboard.press("l");
  const shown = async () => (await written(page)).filter((t) => t === "Level settings").length;
  expect(await shown()).toBe(0);
  await expect(page.locator("#kinds button", { hasText: "Level settings" })).toContainText("1");
  const picked = await page.evaluate(async () => {
    const { state, screen, BLOCK } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    const r = state.lvl.records.find((r) => r.kind === 9);
    const c = cellAt(...screen(r.x + 0.5, r.y + 0.5, r.z - 8 / BLOCK));
    return c && [c.x, c.y, c.z];
  });
  expect(picked).toBeNull();
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const r = state.lvl.records.find((r) => r.kind === 9);
    showCell(state.idx.cells.get(cellKey(r.x, r.y, r.z)));
  });
  expect(await shown()).toBe(1);
  await page.keyboard.press("Escape");
  expect(await shown()).toBe(0);
  await page.keyboard.press("d");
  expect(await shown()).toBe(1);
  expect(errors).toEqual([]);
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

test("where a teleporter leads is an arrow in its colour, broken while it is off, and loops where its ends meet", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  // LEVEL 68's blue teleporter on 17,7,17 leads to the one on 17,25,17, both on top
  const link = (dark, yaw, pitch) =>
    page.evaluate(
      async ([dark, yaw, pitch]) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state, screen, cellKey }, { drawLink }, data] = await Promise.all(
          ["state.js", "overlays.js", "data.js"].map(at),
        );
        state.cam.yaw = yaw;
        state.cam.pitch = pitch;
        const m = state.idx.markers.get(cellKey(17, 7, 17)).find((m) => m.type === 5);
        const from = { x: 17, y: 7, z: 17, face: m.face };
        const to = data.markerDestination(m, state.lvl);
        const g = document.createElement("canvas").getContext("2d");
        const drawn = { curves: [], heads: [] };
        let path = [];
        for (const k of ["moveTo", "lineTo", "bezierCurveTo"]) {
          const own = g[k];
          g[k] = (...a) => {
            path.push([k, ...a]);
            own.apply(g, a);
          };
        }
        const begin = g.beginPath;
        g.beginPath = () => {
          path = [];
          begin.apply(g);
        };
        g.stroke = () => {
          if (path.some(([k]) => k === "bezierCurveTo"))
            drawn.curves.push({ ink: g.strokeStyle, dashed: g.getLineDash().length > 0, path });
        };
        g.fill = () => drawn.heads.push({ ink: g.fillStyle, tip: path[0].slice(1) });
        drawLink(g, from, to, data.markerColour(m), dark);
        const lifted = (c) => screen(c.x + 0.5, c.y + 0.5, c.z + 0.5 - 0.8);
        return { colour: data.markerColour(m), from: lifted(from), to: lifted(to), ...drawn };
      },
      [dark, yaw, pitch],
    );
  const close = (a, b) => expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.01);
  const on = await link(false, 45, 35);
  expect(on.curves.map((c) => [c.ink, c.dashed])).toEqual([
    [expect.any(String), false],
    [on.colour, false],
  ]);
  expect(on.heads.map((h) => h.ink)).toEqual([expect.any(String), on.colour]);
  close(on.curves[1].path[0].slice(1), on.from);
  close(on.heads[1].tip, on.to);
  const off = await link(true, 45, 35);
  expect(off.curves.map((c) => c.dashed)).toEqual([true, true]);
  expect(off.heads.map((h) => h.ink)).toEqual([expect.any(String), off.colour]);
  // looking straight along the row, the one it leads to stands behind it
  const meet = await link(false, 0, 0);
  close(meet.from, meet.to);
  close(meet.heads[1].tip, meet.to);
  const [, ...bend] = meet.curves[1].path.find(([k]) => k === "bezierCurveTo");
  const reach = Math.max(
    ...[0, 2].map((i) => Math.hypot(bend[i] - meet.to[0], bend[i + 1] - meet.to[1])),
  );
  expect(reach).toBeGreaterThan(20);
  expect(errors).toEqual([]);
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

test("b puts the lines on the blocks", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const strokes = () =>
    page.evaluate(async () => {
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const g = document.getElementById("cv").getContext("2d");
      let n = 0;
      const stroke = g.stroke;
      g.stroke = (...a) => (n++, stroke.apply(g, a));
      draw();
      g.stroke = stroke;
      return n;
    });
  await expect(page.locator("#showOutlines")).not.toBeChecked();
  const bare = await strokes();
  await page.keyboard.press("b");
  await expect(page.locator("#showOutlines")).toBeChecked();
  // each of LEVEL 1's twenty blocks shows its top at least
  expect((await strokes()) - bare).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});

test("a beam switched off is one of the outlines, and a beam that is on is drawn without them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 104 starts six of its nine beams dark
  await page.goto("/#ATLANT/13");
  await settle(page);
  const drawn = () =>
    page.evaluate(async () => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { drawBeams }, { litNow }] = await Promise.all(
        ["state.js", "beams.js", "data.js"].map(at),
      );
      const g = document.createElement("canvas").getContext("2d");
      let marks = 0;
      for (const f of ["stroke", "fill"]) {
        const was = g[f];
        g[f] = (...a) => (marks++, was.apply(g, a));
      }
      const out = { lit: [], dark: [] };
      for (const c of state.idx.beamCells.values()) {
        for (const b of c.beams) {
          marks = 0;
          drawBeams(g, { ...c, beams: [b] }, false, 0);
          out[litNow(b.ray) ? "lit" : "dark"].push(marks > 0);
        }
      }
      return out;
    });
  const bare = await drawn();
  expect(bare.dark.length).toBeGreaterThan(0);
  expect(bare.lit.length).toBeGreaterThan(0);
  expect(bare.dark.every((d) => !d)).toBe(true);
  expect(bare.lit.every((d) => d)).toBe(true);
  await page.keyboard.press("b");
  const lined = await drawn();
  expect([...lined.dark, ...lined.lit].every((d) => d)).toBe(true);
  // turned on by its switch, a dark beam is drawn with the outlines off
  await page.keyboard.press("b");
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { flip, litNow, beams }] = await Promise.all(["state.js", "data.js"].map(at));
    const dark = beams(state.lvl).filter((r) => !litNow(r));
    for (const colour of new Set(dark.map((r) => r.colour))) flip(colour, 0);
  });
  const turned = await drawn();
  expect(turned.dark).toEqual([]);
  expect(turned.lit.every((d) => d)).toBe(true);
  expect(errors).toEqual([]);
});

test("a beam switched off is one broken line in the colour its switches wear, as heavy as an outline", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#ATLANT/13");
  await settle(page);
  await page.keyboard.press("b");
  const { worn, dark, weight } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { drawBeams }, { outline }, data] = await Promise.all(
      ["state.js", "beams.js", "blocks.js", "data.js"].map(at),
    );
    const worn = {};
    for (const marks of state.idx.markers.values())
      for (const m of marks)
        if (data.isSwitch(m)) worn[data.markerCircuit(m)] = data.markerColour(m);
    const g = document.createElement("canvas").getContext("2d");
    let lines = [];
    const stroke = g.stroke;
    g.stroke = (...a) => {
      lines.push([g.strokeStyle, g.getLineDash().length > 0, g.lineWidth]);
      stroke.apply(g, a);
    };
    g.fill = () => lines.push(["fill"]);
    const dark = [];
    for (const c of state.idx.beamCells.values()) {
      for (const b of c.beams) {
        if (data.litNow(b.ray)) continue;
        lines = [];
        drawBeams(g, { ...c, beams: [b] }, false, 0);
        dark.push({ circuit: b.ray.colour, lines });
      }
    }
    lines = [];
    outline(g, state.idx.cells.values().next().value, state.idx, "#ffffff", [3, 3]);
    return { worn, dark, weight: lines[0][2] };
  });
  expect(dark.length).toBeGreaterThan(0);
  for (const { circuit, lines } of dark) expect(lines).toEqual([[worn[circuit], true, weight]]);
  expect(errors).toEqual([]);
});

test("a thing on a face turned away shows where no block covers it, and x shows the rest", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 1's things all stand on top; at 45° a block's middle would fall on its near edge
  await page.goto("/#HIRO/0/30,35");
  await settle(page);
  await expect(page.locator("#showThrough")).not.toBeChecked();
  /** Whether the middle of the ball at the start, seen from `pitch`, is drawn
      over what is there without it; both in one frame, as the canvas may
      still be settling to its size. */
  const shows = (pitch) =>
    page.evaluate(async (pitch) => {
      const { state, screen } = await import(new URL("js/state.js", location.href).href);
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const { ballFor, modelUnit } = await import(new URL("js/data.js", location.href).href);
      const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => m.type === 30));
      const c = state.idx.cells.get(key);
      const [lo, hi] = ballFor(state.lvl).box;
      const g = document.getElementById("cv").getContext("2d");
      state.cam.pitch = pitch;
      const at = (objects) => {
        state.show.objects = objects;
        draw();
        const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z - ((hi[1] - lo[1]) / 2) * modelUnit());
        return String(g.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      };
      return at(true) !== at(false);
    }, pitch);
  // from just below the tops the ball stands clear of its block, and from
  // further down its block covers its middle
  expect(await shows(-6)).toBe(true);
  expect(await shows(-40)).toBe(false);
  // but the selected block's shows through whatever the switch says
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => m.type === 30));
    showCell(state.idx.cells.get(key));
  });
  expect(await shows(-40)).toBe(true);
  await page.keyboard.press("Escape");
  expect(await shows(-40)).toBe(false);
  await page.keyboard.press("x");
  await expect(page.locator("#showThrough")).toBeChecked();
  expect(await shows(-40)).toBe(true);
  expect(errors).toEqual([]);
});

test("the ball's shadow takes the same off every channel of the face beside it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/30,60");
  await settle(page);
  // what drawing the objects takes off the face a little way from the ball's
  // middle, all round it, in one frame each
  const drops = await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { draw } = await import(new URL("js/render.js", location.href).href);
    const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => m.type === 30));
    const c = state.idx.cells.get(key);
    const g = document.getElementById("cv").getContext("2d");
    const dpr = state.view.dpr;
    const points = [
      [0.25, 0],
      [-0.25, 0],
      [0, 0.25],
      [0, -0.25],
    ].map(([dx, dy]) => screen(c.x + 0.5 + dx, c.y + 0.5 + dy, c.z));
    const at = (objects) => {
      state.show.objects = objects;
      draw();
      return points.map(([x, y]) =>
        [...g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data].slice(0, 3),
      );
    };
    const on = at(true);
    const off = at(false);
    state.show.objects = true;
    draw();
    return on.map((p, i) => p.map((v, k) => off[i][k] - v));
  });
  const shadowed = drops.filter((d) => d[0] > 0 && d.every((v) => Math.abs(v - d[0]) <= 1));
  expect(shadowed.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("what travels does so from the start, its label with it, until v holds it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 22's fast stars sway along their stretch without a stop
  await page.goto("/#HILLS/6/45,35/1");
  await settle(page);
  await expect(page.locator("#showMotion")).toBeChecked();
  await page.keyboard.press("l");
  const at = () =>
    page.evaluate(async () => {
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const g = document.getElementById("cv").getContext("2d");
      const seen = [];
      const fillText = g.fillText;
      g.fillText = (text, x, y, ...rest) => (
        text.startsWith("Captivator") && seen.push([text, x, y]),
        fillText.call(g, text, x, y, ...rest)
      );
      draw();
      g.fillText = fillText;
      return seen;
    });
  const before = await at();
  expect(before.length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await at()).not.toEqual(before);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const still = await at();
  await page.waitForTimeout(300);
  expect(await at()).toEqual(still);
  expect(errors).toEqual([]);
});

test("a level's clock starts at its first frame as the level opens", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const clock = () =>
    page.evaluate(async () => (await import(new URL("js/render.js", location.href).href)).clock());
  const opened = await clock();
  await expect.poll(clock).toBeGreaterThan(opened);
  const pressed = await page.evaluate(() => performance.now());
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).toContainText("LEVEL 2");
  const [now, since] = await page.evaluate(async (pressed) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ clock }, { frameAt }, { motionTable }] = await Promise.all(
      ["render.js", "motion.js", "data.js"].map(at),
    );
    return [clock(), frameAt(motionTable(), performance.now() - pressed)];
  }, pressed);
  expect(now).toBeLessThan(since);
});

test("a level's clock stands while the page is hidden", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const clock = () =>
    page.evaluate(async () => (await import(new URL("js/render.js", location.href).href)).clock());
  await expect.poll(clock).toBeGreaterThan(0);
  const [moved, hiddenFor] = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ clock }, { frameAt }, { motionTable }] = await Promise.all(
      ["render.js", "motion.js", "data.js"].map(at),
    );
    const hide = (hidden) => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const before = clock();
    const since = performance.now();
    hide(true);
    await new Promise((r) => setTimeout(r, 500));
    hide(false);
    const out = [clock() - before, frameAt(motionTable(), performance.now() - since)];
    delete document.hidden;
    return out;
  });
  expect(hiddenFor).toBeGreaterThan(25);
  expect(moved).toBeGreaterThanOrEqual(0);
  expect(moved).toBeLessThan(hiddenFor / 2);
});

/** A digest of what the map's canvas shows. */
const picture = (page) =>
  page.evaluate(async () => {
    const cv = document.getElementById("cv");
    const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].join();
  });

/** Wait for the world's textures to land and the drawer to finish sliding,
    after which only what moves draws the map again. */
const landed = async (page) => {
  await textured(page);
  await still(page);
};

/** How many frames the map draws of its own over a spell that lasts both so
    many of the page's frames and so long. */
const drawn = (page, frames = 24, ms = 400) =>
  page.evaluate(
    async ([frames, ms]) => {
      const g = document.getElementById("cv").getContext("2d");
      let n = 0;
      const clear = g.clearRect;
      g.clearRect = function (...a) {
        n++;
        return clear.apply(this, a);
      };
      const end = performance.now() + ms;
      for (let i = 0; i < frames || performance.now() < end; i++)
        await new Promise(requestAnimationFrame);
      g.clearRect = clear;
      return n;
    },
    [frames, ms],
  );

test("v holds the whole level still, the same every time, and draws nothing more", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // OBJ LEVEL has something of every kind that moves: things that turn and
  // bob, spikes, vanishing blocks, beams, and all four captivators travelling
  await page.goto("/#HILLS/19/45,35");
  await settle(page);
  await landed(page);
  await expect(page.locator("#showMotion")).toBeChecked();
  const moving = await picture(page);
  await page.waitForTimeout(300);
  expect(await picture(page)).not.toEqual(moving);
  expect(await drawn(page)).toBeGreaterThan(8);

  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await frame(page);
  const still = await picture(page);
  expect(await drawn(page)).toBe(0);
  expect(await picture(page)).toEqual(still);
  // and it is the picture the level holds whenever it is opened still
  await page.keyboard.press("[");
  await expect(page.locator("#chip")).not.toContainText("OBJ LEVEL");
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).toContainText("OBJ LEVEL");
  await frame(page);
  expect(await picture(page)).toEqual(still);

  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  expect(await drawn(page)).toBeGreaterThan(8);
  expect(await picture(page)).not.toEqual(still);
  expect(errors).toEqual([]);
});

/** How bright the top of an invisible block is near its edge with the
    block beside it, alone and with that block selected, which stands in for
    the ball on it; both drawn without the objects at one frame of the
    level's clock, the one of the next pulse where the top is at its dimmest,
    or its brightest where `bright` asks, since the light shows only against
    the end of the pulse it is not like. */
const litBeside = (page, sel, top, bright = false) =>
  page.evaluate(
    async ([sel, [x, y, z], bright]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen, cellKey }, { draw, clock }, { skinsTable }, { lookOf, faceSkin }] =
        await Promise.all(["state.js", "render.js", "data.js", "skins.js"].map(at));
      const l = state.lvl;
      const skins = skinsTable();
      const look = lookOf(
        skins,
        l,
        state.data.themes.findIndex((t) => t.id === l.theme),
      );
      const rec = state.idx.records.get(cellKey(x, y, z))?.[0] ?? null;
      const level = (f) => faceSkin(skins, look, { x, y, z }, 0, 3, rec, f).colour[0];
      const now = performance.now;
      const t = now.call(performance);
      performance.now = () => t;
      const from = clock();
      let end = Math.floor(from);
      for (let f = end; f < end + skins.cycles.invisible.level.length; f++)
        if (bright ? level(f) > level(end) : level(f) < level(end)) end = f;
      performance.now = () => t + ((end + 0.5 - from) * 1000) / 60;
      state.show.objects = false;
      state.hover = null;
      const g = document.getElementById("cv").getContext("2d");
      const dpr = state.view.dpr;
      const mean = () => {
        draw();
        let sum = 0;
        for (const dx of [0.3, 0.5, 0.7]) {
          for (const dy of [0.65, 0.75, 0.85]) {
            const [sx, sy] = screen(x + dx, y + dy, z);
            const d = g.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data;
            sum += d[0] + d[1] + d[2];
          }
        }
        return sum / 9;
      };
      state.selected = null;
      const alone = mean();
      state.selected = { x: sel[0], y: sel[1], z: sel[2], key: cellKey(...sel) };
      const beside = mean();
      state.selected = null;
      state.show.objects = true;
      performance.now = now;
      draw();
      return [alone, beside];
    },
    [sel, top, bright],
  );

test("an invisible block lights up beside the ball, until v holds it", async ({ page }) => {
  const errors = trackErrors(page);
  // LEVEL 31's invisible blocks run in a row
  await page.goto("/#INCA/0/45,35");
  await settle(page);
  await landed(page);
  const [alone, lit] = await litBeside(page, [15, 15, 17], [15, 14, 17]);
  expect(lit).toBeGreaterThan(alone + 15);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const [still, held] = await litBeside(page, [15, 15, 17], [15, 14, 17]);
  expect(Math.abs(held - still)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test("a face in full light is the game's lit face at any pulse, and an unlit one its pulse", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/0/45,35");
  await settle(page);
  await landed(page);
  // the brightness of the top and the bottom rows of an invisible face
  // painted alone on a canvas of its own, lit full along its top edge
  const rows = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor, paint }, { skinsTable }] = await Promise.all(
      ["state.js", "atlas.js", "data.js"].map(at),
    );
    const tex = skinsTable().sets.arcade.kinds["3"][0];
    const cv = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    const g = cv.getContext("2d");
    const edges = (sk) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 64, 64);
      g.save();
      g.beginPath();
      g.rect(0, 0, 64, 64);
      g.clip();
      const face = { img: atlasFor(state.lvl.theme), tex, add: true, ...sk };
      paint(
        g,
        [
          [0, 0],
          [64, 0],
          [0, 64],
        ],
        face,
        1,
        1,
      );
      g.restore();
      const d = g.getImageData(0, 0, 64, 64).data;
      const row = (y) =>
        d.slice(y * 256, y * 256 + 256).reduce((s, v, i) => s + (i % 4 < 3 ? v : 0), 0);
      return [row(0), row(63)];
    };
    const lit = [128, 128, 0, 0];
    return {
      lit: edges({ shaded: lit }),
      dim: edges({ colour: [48, 48, 48], shaded: lit, fill: true }),
      bright: edges({ colour: [120, 120, 120], shaded: lit, fill: true }),
      dimAlone: edges({ colour: [48, 48, 48] }),
      brightAlone: edges({ colour: [120, 120, 120] }),
    };
  });
  // within four levels a channel, on average along the row
  const near = (a, b) => expect(Math.abs(a - b)).toBeLessThanOrEqual(4 * 64 * 3);
  near(rows.dim[0], rows.lit[0]);
  near(rows.bright[0], rows.lit[0]);
  near(rows.dim[1], rows.dimAlone[1]);
  near(rows.bright[1], rows.brightAlone[1]);
  expect(rows.dim[0]).toBeGreaterThan(rows.dimAlone[0] * 1.5);
  expect(rows.brightAlone[1]).toBeGreaterThan(rows.dimAlone[1] * 1.5);
  expect(errors).toEqual([]);
});

test("where a level turns the light round, an invisible block beside the ball is gone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 106's settings ask for its invisible blocks to show from afar
  await page.goto("/#HAZE/0/45,35");
  await settle(page);
  await landed(page);
  const [seen, gone] = await litBeside(page, [20, 10, 17], [20, 9, 17], true);
  expect(gone).toBeLessThan(seen - 20);
  expect(errors).toEqual([]);
});

/** The red, green and blue of the top of a block, summed over points clear
    of its middle, drawn without the objects at each frame of the level's
    clock asked for. */
const topAt = (page, [x, y, z], frames) =>
  page.evaluate(
    async ([[x, y, z], frames]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw, clock }] = await Promise.all(
        ["state.js", "render.js"].map(at),
      );
      const now = performance.now;
      const t = now.call(performance);
      performance.now = () => t;
      const from = clock();
      state.show.objects = false;
      state.hover = null;
      const g = document.getElementById("cv").getContext("2d");
      const dpr = state.view.dpr;
      const out = frames.map((frame) => {
        performance.now = () => t + ((frame + 0.5 - from) * 1000) / 60;
        draw();
        const sum = [0, 0, 0];
        for (const [dx, dy] of [
          [0.2, 0.2],
          [0.8, 0.2],
          [0.2, 0.8],
          [0.8, 0.8],
        ]) {
          const [sx, sy] = screen(x + dx, y + dy, z);
          const d = g.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data;
          for (let ch = 0; ch < 3; ch++) sum[ch] += d[ch];
        }
        return sum;
      });
      state.show.objects = true;
      performance.now = now;
      draw();
      return out;
    },
    [[x, y, z], frames],
  );

test("a light on a face with a colour of its own adds to that colour and is not scaled by it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // BONUS 14's teleporters stand on plates that take the swirl's colour
  await page.goto("/#COWBOY/16/45,35");
  await settle(page);
  await landed(page);
  // the green of a plate painted alone, through the swirl's colour where its
  // cycle holds no green, without a light and with a yellow one
  const green = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor, paint }, { skinsTable }] = await Promise.all(
      ["state.js", "atlas.js", "data.js"].map(at),
    );
    const tex = skinsTable().sets.bonus.types["5"][0];
    const cv = Object.assign(document.createElement("canvas"), { width: 64, height: 64 });
    const g = cv.getContext("2d");
    const face = (glow) => {
      g.fillStyle = "#000";
      g.fillRect(0, 0, 64, 64);
      g.save();
      g.beginPath();
      g.rect(0, 0, 64, 64);
      g.clip();
      const sk = { img: atlasFor(state.lvl.theme), tex, colour: [168, 0, 0], glow };
      paint(
        g,
        [
          [0, 0],
          [64, 0],
          [0, 64],
        ],
        sk,
        1,
        1,
      );
      g.restore();
      return g.getImageData(0, 0, 64, 64).data.reduce((s, v, i) => s + (i % 4 === 1 ? v : 0), 0);
    };
    return [face(null), face(Array(4).fill([24, 50, 0]))];
  });
  expect(green[1]).toBeGreaterThan(green[0] + 4 * 64 * 64);
  expect(errors).toEqual([]);
});

test("a teleporter that is on lights its face in its colour, 19 frames in every 38", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 68's blue teleporter stands on the top of this block, on from the start
  await page.goto("/#COWBOY/7/45,55");
  await settle(page);
  await landed(page);
  const blue = [17, 21, 17];
  const [dark, lit, again] = await topAt(page, blue, [10, 25, 40]);
  // Cowboy's blue adds the texel's own blue again, and nothing to red
  expect(dark[2]).toBeGreaterThan(8);
  expect(lit[2]).toBeGreaterThan(dark[2] * 1.8);
  expect(Math.abs(lit[0] - dark[0])).toBeLessThan(4);
  expect(again).toEqual(dark);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const [held] = await topAt(page, blue, [25]);
  expect(held).toEqual(dark);
  expect(errors).toEqual([]);
});

test("a teleporter hidden from the legend casts no light, and casts it again once shown", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#COWBOY/7/45,55");
  await settle(page);
  await landed(page);
  const blue = [17, 21, 17];
  const [dark, lit] = await topAt(page, blue, [10, 25]);
  expect(lit[2]).toBeGreaterThan(dark[2] * 1.8);
  const row = page
    .getByRole("list", { name: "Objects" })
    .getByRole("button", { name: "Teleporter (blue)" });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "false");
  // hidden, its face loses the plate too, so the dark and the lit frame are compared afresh
  const [hiddenDark, hiddenLit] = await topAt(page, blue, [10, 25]);
  expect(hiddenLit).toEqual(hiddenDark);
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  const [shown] = await topAt(page, blue, [25]);
  expect(shown).toEqual(lit);
  expect(errors).toEqual([]);
});

test("where the system asks for reduced motion the map opens still, and a choice to move is kept", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#HIRO/0");
  await settle(page);
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await landed(page);
  expect(await drawn(page)).toBe(0);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  expect(await kept()).toBeNull();
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ motion: true });
  expect(await drawn(page)).toBeGreaterThan(8);
  await page.reload();
  await settle(page);
  await expect(page.locator("#showMotion")).toBeChecked();
  await page.keyboard.press("v");
  expect(await kept()).toEqual({});
});

/** The map's colour where the game's camera stands as the level opens. */
const atEye = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, screen }, { startCamera }] = await Promise.all(
      ["state.js", "overlays.js"].map(at),
    );
    const [x, y] = screen(...startCamera(state.lvl).eye);
    const cv = document.getElementById("cv");
    const k = cv.width / cv.clientWidth;
    return [...cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
  });
const amber = ([r, g, b]) => r > 200 && g > 150 && b < 150;

test("the settings hold the start camera, which keeps its key", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await expect(panel.locator("#showCamera")).toHaveCount(1);
  await expect(page.locator("#display #showCamera")).toHaveCount(0);
  await expect(panel).toBeHidden();
  expect(amber(await atEye(page))).toBe(false);
  await page.keyboard.press("c");
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  await page.locator("#settingsBtn").click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#settings .x")).toBeFocused();
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await panel.getByText("Start camera").click();
  await expect(page.locator("#showCamera")).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  await expect.poll(async () => amber(await atEye(page))).toBe(false);
  await panel.getByText("Start camera").click();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  expect(await kept()).toEqual({ camera: true });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("#settingsBtn")).toBeFocused();
  // the display's reset puts back what is under its heading, and no setting
  await page.keyboard.press("l");
  await page.keyboard.press("x");
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({ camera: true });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
});

test("a setting's key works inside the settings, once a press", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const box = page.locator("#showCamera");
  await page.keyboard.press("s");
  await expect(panel).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.keyboard.press("c");
  await expect(box).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await page.locator("#showCameraSays").click();
  await page.keyboard.press("c");
  await expect(box).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  // a key of the display's stays the map's, and the dialog keeps it from the map
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("a switch clicked leaves the keys to the map, and the slider keeps its own", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await page.locator("#showLabels").click();
  await expect(page.locator("#showLabels")).toBeFocused();
  await page.keyboard.press("b");
  await expect(page.locator("#showOutlines")).toBeChecked();
  const view = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { pan: [state.cam.panX, state.cam.panY], slice: state.slice };
    });
  const before = await view();
  await page.locator("#slice").focus();
  await page.keyboard.press("ArrowLeft");
  const after = await view();
  expect(after.pan).toEqual(before.pan);
  expect(after.slice).toBe(before.slice - 1);
});

test("a switch that does something only under another is greyed while it is off, its tick kept", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  // the clicks below are forced, which does not wait for the sidebar to finish sliding in
  await still(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const greyed = async (ids) => {
    const all = ["showModels", "showThrough", "showLabels", "showFaces", "showHidden"];
    for (const id of all)
      if (ids.includes(id)) await expect(page.locator(`#${id}`), id).toBeDisabled();
      else await expect(page.locator(`#${id}`), id).toBeEnabled();
  };
  // the labels open off and the slice cuts nothing
  await greyed(["showFaces", "showHidden"]);
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  await greyed(["showHidden"]);
  await page.keyboard.press("o");
  await greyed(["showModels", "showThrough", "showLabels", "showFaces", "showHidden"]);
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showFaces")).toBeChecked();
  expect(await kept()).toEqual({ labels: true, faces: true, objects: false });
  // its key and a click leave it as it is and say for a moment what holds it
  // back, by the whole of each name however the label is marked up
  await page.evaluate(() => {
    const label = document.getElementById("showFaces").closest("label");
    const text = [...label.childNodes].find((n) => n.textContent.includes("face"));
    const word = text.splitText(text.textContent.indexOf("face"));
    word.splitText(4);
    const em = document.createElement("em");
    word.replaceWith(em);
    em.append(word);
  });
  const said = page.locator("#toastStack .toast").first();
  await page.keyboard.press("n");
  await expect(said).toHaveText("“Name the face in labels” needs “Objects” on.");
  await page.locator("label", { has: page.locator("#showLabels") }).click({ force: true });
  await expect(said).toHaveText("“Object labels” needs “Objects” on.");
  await page.locator("#showModels").click({ force: true });
  await expect(said).toHaveText("“Objects as models” needs “Objects” on.");
  await expect(page.locator("#showFaces")).toBeChecked();
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showModels")).toBeChecked();
  await expect(page.locator("label", { has: page.locator("#showFaces") })).toHaveAttribute(
    "title",
    "“Name the face in labels” needs “Objects” on.",
  );
  // a reader hears it by its name, greyed, and why
  const faces = page.getByRole("checkbox", { name: "Name the face in labels", exact: false });
  await expect(faces).toBeDisabled();
  await expect(faces).toHaveAccessibleDescription("“Name the face in labels” needs “Objects” on.");
  await page.keyboard.press("o");
  await greyed(["showHidden"]);
  expect(await written(page)).toContain("Key · top");
  // the dim waits on the slice
  await page.keyboard.press("h");
  await expect(said).toHaveText("“Dim what the slice hides” needs the slice lowered.");
  await page.evaluate(async () => {
    const { state, SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await greyed([]);
  await page.keyboard.press("h");
  await expect(page.locator("#showHidden")).toBeChecked();
  await page.keyboard.press("\\");
  await greyed(["showHidden"]);
  await expect(page.locator("#showHidden")).toBeChecked();
});

test("every switch's key is the one its row shows and the key list names", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("label.check")].map((l) => ({
      id: l.querySelector("input").id,
      key: l.querySelector("kbd")?.textContent,
    })),
  );
  expect(rows.map((r) => r.id).sort()).toEqual(
    [
      ...["showSkins", "showObjects", "showModels", "showMotion", "showThrough", "showLabels"],
      ...["showOutlines", "showBase", "panMode", "showFaces", "showHidden", "showCamera"],
      "showCompass",
    ].sort(),
  );
  // the compass alone has no key, every letter that reads as it being taken
  expect(rows.filter((r) => !r.key).map((r) => r.id)).toEqual(["showCompass"]);
  const keyed = rows.filter((r) => r.key);
  const keys = keyed.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  // every switch free to be set: the labels on, and the slice cutting into the level
  await page.keyboard.press("l");
  await page.evaluate(async () => {
    const { state, SIDE } = await import(new URL("js/state.js", location.href).href);
    const { setSlice } = await import(new URL("js/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await expect(page.locator("input:disabled")).toHaveCount(0);
  for (const { id, key } of keyed) {
    const box = page.locator(`#${id}`);
    const was = await box.isChecked();
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id}`).toBe(!was);
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id} back`).toBe(was);
  }
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const listed = await page.locator("#help dt kbd").allTextContents();
  for (const key of [...keys, "s"]) expect(listed).toContain(key);
});

test("Display puts the game's own look first, then what the map adds, then the controls", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#display .group")].map((g) =>
      [...g.querySelectorAll("input")].map((i) => `${i.id}${i.checked ? " on" : ""}`),
    ),
  );
  expect(groups).toEqual([
    ["showSkins on", "showObjects on", "showModels on", "showMotion on"],
    ["showThrough", "showLabels", "showFaces", "showOutlines", "showBase"],
    ["panMode", "slice", "showHidden"],
  ]);
});

test("the settings fit a phone, over the drawer they open from", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await page.locator("#settingsBtn").click();
  const box = await page.locator("#settings .box").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/sidebar-open/);
  await expect(page.locator("#settingsBtn")).toBeFocused();
});

test("the keys and the settings open in a box of one width, which a phone narrows", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const help = await page.locator("#help .box").boundingBox();
  await page.keyboard.press("Escape");
  await page.keyboard.press("s");
  const settings = await page.locator("#settings .box").boundingBox();
  expect(settings.width).toBe(help.width);
  expect(help.width).toBe(460);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 700 });
  await page.keyboard.press("?");
  const phone = await page.locator("#help .box").boundingBox();
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  // the keys take no more than half the row, the gestures wrapping before the words do
  const dl = await page.locator("#help dl").boundingBox();
  const dt = await page.locator("#help dt").first().boundingBox();
  expect(dt.width).toBeLessThanOrEqual(dl.width / 2 + 1);
});

test("the display keeps only the switches set away from their defaults", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true });
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ labels: true, motion: false });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ motion: false });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).not.toBeChecked();
});

test("a saved switch the display does not have is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: true, gone: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).toBeChecked();
  const show = await page.evaluate(
    async () => (await import(new URL("js/state.js", location.href).href)).state.show,
  );
  expect(show).not.toHaveProperty("gone");
  await page.keyboard.press("b");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved value not of its switch's kind is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem(
      "kula.display",
      JSON.stringify({ labels: "yes", through: 1, outlines: true, panMode: "yes" }),
    ),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showThrough")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).toBeChecked();
  await expect(page.locator("#panMode")).not.toBeChecked();
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved switch stays saved until it is set again, though it matches the default", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  // a switch saved at its default, which is what a choice made against another
  // default leaves
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await page.keyboard.press("x");
  expect(await kept()).toEqual({ labels: false, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ through: true });
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({});
});

test("a travelling thing, and every block of a platform, picks the cell its record is on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 22's one fast star on a top, as a marker, once it has swayed off its own block
  await page.goto("/#HILLS/6/45,35/1.5");
  await settle(page);
  await page.keyboard.press("d");
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  const star = () =>
    page.evaluate(async () => {
      const { state, screen, BLOCK } = await import(new URL("js/state.js", location.href).href);
      const { draw, cellAt, invalidatePick } = await import(
        new URL("js/render.js", location.href).href
      );
      const g = document.getElementById("cv").getContext("2d");
      const seen = [];
      const fillText = g.fillText;
      g.fillText = (text, x, y, ...rest) => (
        text === "Captivator · top" && seen.push([x, y]),
        fillText.call(g, text, x, y, ...rest)
      );
      invalidatePick();
      draw();
      g.fillText = fillText;
      const [key] = [...state.idx.markers].find(([, ms]) =>
        ms.some((m) => m.type === 52 && m.face === 0),
      );
      const home = state.idx.cells.get(key);
      const r = Math.max(4, 7 * state.cam.zoom);
      const [x, y] = [seen[0][0] - r - 4, seen[0][1] - 4];
      const [hx, hy] = screen(home.x + 0.5, home.y + 0.5, home.z - 8 / BLOCK);
      const c = cellAt(x, y);
      return {
        away: Math.hypot(x - hx, y - hy) / (state.cam.zoom * BLOCK),
        picked: c && [c.x, c.y, c.z],
        home: [home.x, home.y, home.z],
      };
    });
  let seen = await star();
  for (let i = 0; i < 40 && seen.away < 0.6; i++) {
    await page.waitForTimeout(50);
    seen = await star();
  }
  expect(seen.away).toBeGreaterThanOrEqual(0.6);
  expect(seen.picked).toEqual(seen.home);

  // LEVEL 94's platform, two blocks long, standing where its level puts it
  await page.goto("/#ATLANT/3/45,35/1.5");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 94");
  await page.keyboard.press("v");
  const picked = await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    const r = state.lvl.records.find((r) => r.kind === 5);
    const [x, y] = screen(r.x + 0.5, r.y + 1.5, r.z);
    const c = cellAt(x, y);
    return { picked: c && [c.x, c.y, c.z], record: [r.x, r.y, r.z] };
  });
  expect(picked.picked).toEqual(picked.record);
  expect(errors).toEqual([]);
});

test("a point on the edge between two blocks names one drawn there, never one far off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // HIDDEN 10: nothing travels or runs a route, so every cell the pick names
  // is drawn where its cell is, and its 178 blocks take pick colours past one
  // byte, so a blend of two can decode as a block anywhere
  await page.goto("/#HELL/18/45,35");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("HIDDEN 10");
  const far = await page.evaluate(async () => {
    const { screen } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    /** How far a point lies outside a cell's cube as the screen shows it. */
    const away = (c, x, y) => {
      const pts = [];
      for (const dx of [0, 1])
        for (const dy of [0, 1])
          for (const dz of [0, 1]) pts.push(screen(c.x + dx, c.y + dy, c.z + dz));
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const half = (list) =>
        list.reduce((h, p) => {
          while (h.length >= 2 && turn(h.at(-2), h.at(-1), p) <= 0) h.pop();
          return [...h, p];
        }, []);
      const hull = [...half(pts).slice(0, -1), ...half([...pts].reverse()).slice(0, -1)];
      let inside = true;
      let nearest = Infinity;
      hull.forEach((a, i) => {
        const b = hull[(i + 1) % hull.length];
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        if (ex * (y - a[1]) - ey * (x - a[0]) < 0) inside = false;
        const t = Math.max(
          0,
          Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)),
        );
        nearest = Math.min(nearest, Math.hypot(a[0] + t * ex - x, a[1] + t * ey - y));
      });
      return inside ? 0 : nearest;
    };
    const cv = document.getElementById("cv");
    const out = [];
    for (let y = 0; y < cv.clientHeight; y += 2)
      for (let x = 0; x < cv.clientWidth; x += 2) {
        const c = cellAt(x, y);
        if (c && away(c, x, y) > 4) out.push(`${x},${y} names ${c.x},${c.y},${c.z}`);
      }
    return out;
  });
  expect(far.length, far.slice(0, 3).join("; ")).toBe(0);
  expect(errors).toEqual([]);
});

test("the page a link lands on says what it is", async ({ page }) => {
  await page.goto("/");
  const head = await page.evaluate(() => ({
    canonical: document.querySelector("link[rel=canonical]")?.href,
    ogTitle: document.querySelector("meta[property='og:title']")?.content,
    ogImage: document.querySelector("meta[property='og:image']")?.content,
    twitter: document.querySelector("meta[name='twitter:card']")?.content,
    manifest: document.querySelector("link[rel=manifest]")?.href,
  }));
  expect(head.canonical).toBe("https://kulaworld.retroatlas.org/");
  expect(head.ogTitle).toBe("Kula World Map");
  expect(head.ogImage).toMatch(/og-image\.png$/);
  expect(head.twitter).toBe("summary_large_image");
  for (const path of [
    "og-image.png",
    "favicon-96.png",
    "apple-touch-icon.png",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
    "404.html",
  ]) {
    const res = await page.request.get(`/${path}`);
    expect(res.status(), path).toBe(200);
  }
});

test("the icons are Hiro's ball in its own panel colours, on the tile", async ({ page }) => {
  await page.goto("/");
  const icons = await page.evaluate(async () => {
    const { balls } = await (await fetch("objects.json")).json();
    const panels = [...new Set(balls[0].rgb.map((c) => c.slice(0, 3).join()))];
    const read = async (src, size) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const g = cv.getContext("2d");
      g.drawImage(img, 0, 0, size, size);
      const px = g.getImageData(0, 0, size, size).data;
      const at = (x, y) => [...px.slice((y * size + x) * 4, (y * size + x) * 4 + 4)];
      const seen = new Map(panels.map((p) => [p, 0]));
      for (let i = 0; i < px.length; i += 4) {
        const key = `${px[i]},${px[i + 1]},${px[i + 2]}`;
        if (px[i + 3] === 255 && seen.has(key)) seen.set(key, seen.get(key) + 1);
      }
      return {
        src,
        natural: [img.naturalWidth, img.naturalHeight],
        corner: at(0, 0),
        tile: at(Math.round(size / 24), Math.round(size / 2)),
        centre: at(size / 2, size / 2),
        panels: [...seen.values()],
      };
    };
    return Promise.all([
      read("favicon.svg", 96),
      read("favicon-96.png", 96),
      read("apple-touch-icon.png", 180),
    ]);
  });
  expect(icons[1].natural).toEqual([96, 96]);
  expect(icons[2].natural).toEqual([180, 180]);
  for (const icon of icons) {
    expect(icon.corner[3], icon.src).toBe(0);
    expect(icon.tile, icon.src).toEqual([18, 22, 31, 255]);
    expect(icon.centre, icon.src).toEqual([255, 255, 255, 255]);
    expect(icon.panels.filter((count) => count > 20).length, icon.src).toBe(5);
  }
});

test("a search held to the world keeps its order as the level moves within the world", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const box = page.locator("#search");
  await box.fill("key");
  await page.locator("#scope button").nth(1).click();
  const keys = () =>
    page.locator("#results [role=option]").evaluateAll((els) => els.map((e) => e.dataset.key));
  const before = await keys();
  const away = before.findIndex((k) => !k.startsWith("0:"));
  expect(away).toBeGreaterThan(0);
  for (let i = 0; i <= away; i++) await box.press("ArrowDown");
  await box.press("Enter");
  await expect(page.locator("#chip b")).not.toHaveText("LEVEL 1");
  expect(await keys()).toEqual(before);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { selectLevel }] = await Promise.all(["state.js", "navigate.js"].map(at));
    selectLevel(state.data.levels.findIndex((l) => l.theme === "INCA"));
  });
  await expect(page.locator("#scope button").nth(1)).toHaveText("INCA");
  expect((await keys())[0]).not.toEqual(before[0]);
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

test("the map, the legend and the panel follow the screen's density", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await textured(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get([...state.idx.markers.keys()][0]));
  });
  const density = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const cv = document.getElementById("cv");
      const ratio = (c) => c.width / parseInt(c.style.width);
      return [
        state.view.dpr,
        cv.width / cv.clientWidth,
        ratio(document.querySelector("#kinds canvas.icon")),
        ratio(document.querySelector("#detail canvas.icon")),
      ];
    });
  expect(await density()).toEqual([1, 1, 1, 1]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1200,
    height: 700,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await expect.poll(density).toEqual([2, 2, 2, 2]);
});

test("a write inside the settle window carries the view it is given, with the camera's last view beneath it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await still(page);
  const drag = () =>
    page.evaluate(() => {
      const cv = document.getElementById("cv");
      cv.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 660, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 660, clientY: 400, pointerId: 1 }));
    });
  const yaw = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return Math.round(state.cam.yaw);
    });
  // a slice straight after a drag names the slice, and the turn the drag made
  await drag();
  const turned = await yaw();
  expect(turned).not.toBe(45);
  await page.keyboard.press(",");
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${turned},35/.*/32$`));
  // a change of level straight after a drag pushes the new level, over an entry holding the turn
  const entries = () => page.evaluate(() => history.length);
  const booted = await entries();
  await drag();
  const again = await yaw();
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\//);
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${again},35/`));
  // a page put out of sight writes what waits
  await drag();
  const third = await yaw();
  await page.evaluate(() => dispatchEvent(new Event("pagehide")));
  expect(page.url()).toMatch(new RegExp(`#HIRO/0/${third},35/`));
});
