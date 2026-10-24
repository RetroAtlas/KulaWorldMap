import { expect, test } from "@playwright/test";
import { frame, settle, still, textured, trackErrors } from "./helpers.js";

test("a permalink opens on the level and the camera it names", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
      new URL("js/viewer/state.js", location.href).href
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
  await expect.poll(() => page.url()).toMatch(/\/33$/);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { showCell } = await import(new URL("js/viewer/chrome/detail.js", location.href).href);
    showCell([...state.idx.cells.values()][0]);
  });
  await expect.poll(() => page.url()).toMatch(/\/33\/\d+,\d+,\d+$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
});

test("a module's segment rides at the link's tail, and an opened link hands it back before the camera moves", async ({
  page,
}) => {
  await page.goto("/#HIRO/11/45,35/fit/33/21,13,18");
  await settle(page);
  await still(page);
  const tail = () => page.evaluate(() => window.__tail);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { on }, { tailWith, writeHash }] = await Promise.all(
      ["viewer/state.js", "viewer/ui/dom.js", "viewer/chrome/navigate.js"].map(at),
    );
    const own = (window.__tail = { kept: "rAbc-_9", read: [], opened: [] });
    on("link-opening", () => own.opened.push(state.cam.yaw));
    tailWith({
      letter: "r",
      write: () => own.kept,
      read: (segment) => {
        own.read.push(segment);
        if (segment !== null) own.kept = segment;
      },
    });
    writeHash();
  });
  await expect.poll(() => page.url()).toMatch(/#HIRO\/11\/45,35\/fit\/33\/21,13,18\/rAbc-_9$/);

  // the segment is read wherever it lies beside the cell, and written back after it
  await page.evaluate(() => (location.hash = "#HIRO/11/30,20/fit/33/rXyz_-1/21,13,18"));
  await expect.poll(() => page.url()).toMatch(/#HIRO\/11\/30,20\/fit\/33\/21,13,18\/rXyz_-1$/);
  expect(await tail()).toMatchObject({ read: ["rXyz_-1"], opened: [45] });
  await expect(page.locator("#detail")).toContainText("cell 21,13,18");

  // a link carrying none says nothing, so what the module keeps is written back,
  // and a module with nothing to say writes nothing
  await page.evaluate(() => (location.hash = "#HIRO/11/30,20/fit/33/21,13,18"));
  await expect.poll(async () => (await tail()).read).toEqual(["rXyz_-1", null]);
  await expect.poll(() => page.url()).toMatch(/\/21,13,18\/rXyz_-1$/);
  await page.evaluate(async () => {
    const { writeHash } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    window.__tail.kept = null;
    writeHash();
  });
  await expect.poll(() => page.url()).toMatch(/\/33\/21,13,18$/);
});

test("a link naming a pack and a slot opens that level, whatever its case", async ({ page }) => {
  await page.goto("/#copycat/4/30,20");
  await settle(page);
  await frame(page);
  await expect(page.locator("#chip")).toContainText("SIMON 5");
  await expect.poll(() => page.url()).toContain("#COPYCAT/4/30,20/");
});

test("a link escaped on its way opens where it points, and the address bar says it plainly", async ({
  page,
}) => {
  await page.goto("/#INCA%2F11%2F45%2C35");
  await settle(page);
  await frame(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 42");
  await expect.poll(() => page.url()).toContain("#INCA/11/45,35/");
});

test("a hash that arrives while a write of the URL is queued is the one the map goes to", async ({
  page,
}) => {
  await page.goto("/#INCA/7");
  await settle(page);
  await still(page);
  await page.evaluate(async () => {
    const { writeHash } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
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
  await expect.poll(() => page.url()).toContain("#HIRO/11/");
  await page.evaluate(() => (location.hash = "#HIRO/99"));
  await expect.poll(() => page.url()).toContain("#HIRO/11/");
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
  await page.evaluate(() => import(new URL("js/viewer/chrome/interaction.js", location.href).href));
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
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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

  // a find on another level is one entry, and the entry left keeps the view as it was
  await page.goForward();
  await expect.poll(async () => (await level()).selected).toBe(true);
  const stood = page.url();
  await drag();
  await expect.poll(() => page.url()).not.toBe(stood);
  const left = page.url();
  const made = await entries();
  await page.locator("#search").fill("gem");
  await page.locator("#search").press("Enter");
  await expect.poll(async () => (await level()).li).not.toBe(1);
  expect((await level()).selected).toBe(true);
  expect(await entries()).toBe(made + 1);
  await page.goBack();
  await expect.poll(async () => (await level()).li).toBe(1);
  expect(page.url()).toBe(left);
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
      const [{ state }, { selectLevel }] = await Promise.all(
        ["viewer/state.js", "viewer/chrome/navigate.js"].map(at),
      );
      selectLevel(state.data.themes.find((t) => t.id === world).levels.at(-1));
    }, world);

  const booted = await entries();
  await page.keyboard.press("[");
  await frame(page);
  await expect(title).toHaveText("LEVEL 1");
  expect(await entries()).toBe(booted);

  await last("HIRO");
  await expect(title).toHaveText("SIMON 1");
  await page.keyboard.press("]");
  await expect(title).toHaveText("LEVEL 16");
  await page.keyboard.press("[");
  await expect(title).toHaveText("SIMON 1");

  await last("HELL");
  await expect(title).toHaveText("SIMON10");
  await frame(page);
  const there = await entries();
  await page.keyboard.press("]");
  await frame(page);
  await expect(title).toHaveText("SIMON10");
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

test("a key typed with Option or AltGr reaches the map, and a shortcut stays with the browser", async ({
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
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  const before = await hidden();
  expect(before).toHaveLength(1);
  const selected = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
  expect(page.url()).not.toContain("/45,35/");
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return state.cam.zoom.toFixed(2);
  });
  await expect.poll(() => page.url()).toContain(`/${zoom}/`);
});

test("the view turns about a find only while it stays selected", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#search").press("Enter");
  const probe = () =>
    page.evaluate(async () => {
      const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
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
    const { state, screen, pivot } = await import(
      new URL("js/viewer/state.js", location.href).href
    );
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
