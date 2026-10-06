import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame, still, textured, overlaps } from "./helpers.js";

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
  await expect.poll(() => page.url()).toMatch(/\/33$/);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell([...state.idx.cells.values()][0]);
  });
  await expect.poll(() => page.url()).toMatch(/\/33\/\d+,\d+,\d+$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
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
    const { state } = await import(new URL("js/state.js", location.href).href);
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
  await expect.poll(() => page.url()).toContain("#HILLS/19/200,10/fit/33");

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
  await expect.poll(() => page.url()).toMatch(/#HIRO\/11\/-?\d+,\d+\/fit\/32\/21,13,18$/);
  const link = page.url();
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

test("a write inside the settle window carries the view it is given: a slice, a change of level, Back, a hash, a dialog, the page out of sight or leaving", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await still(page);
  await page.evaluate(() => {
    window.__wrote = { push: 0, replace: 0 };
    for (const way of ["pushState", "replaceState"]) {
      const orig = history[way].bind(history);
      history[way] = (...a) => {
        window.__wrote[way === "pushState" ? "push" : "replace"]++;
        return orig(...a);
      };
    }
  });
  const wrote = () => page.evaluate(() => ({ ...window.__wrote }));
  const entries = () => page.evaluate(() => history.length);
  const key = (k) =>
    `document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "${k}", bubbles: true }))`;
  // a script of inputs in one breath, with a drag among them; the turn the drag made comes back
  const script = (steps) =>
    page.evaluate(async (steps) => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const cv = document.getElementById("cv");
      const at = (type, x) =>
        cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 400, pointerId: 1 }));
      let yaw = null;
      for (const step of steps) {
        if (step === "drag") {
          at("pointerdown", 600);
          at("pointermove", 660);
          at("pointerup", 660);
          yaw = ((Math.round(state.cam.yaw) % 360) + 360) % 360;
        } else if (step === "hide") {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
        } else if (step === "leave") dispatchEvent(new Event("pagehide"));
        else if (step === "back") history.back();
        else if (step.startsWith("#")) location.hash = step;
        else new Function(step)();
      }
      return yaw;
    }, steps);
  // a slice straight after a drag names the slice, and the turn the drag made
  let turned = await script(["drag", key(",")]);
  expect(turned).not.toBe(45);
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${turned},35/.*/32$`));
  // a slice, a drag and a change of level in one frame: the entry left holds the slice and the turn
  let booted = await entries();
  turned = await script([key(","), "drag", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\//);
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${turned},35/.*/31$`));
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\//);
  // a change of level straight after a drag pushes the new level over an entry holding the turn
  booted = await entries();
  turned = await script(["drag", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 3");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/1/${turned},35/`));
  const beneath = page.url();
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  // Back straight after a drag drops the write waiting: the entry gone back to stands, and nothing is written
  const before = await wrote();
  await script(["drag", "back"]);
  await expect.poll(() => page.url()).toBe(beneath);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500))); // past the settle
  expect(page.url()).toBe(beneath);
  expect(await wrote()).toEqual(before);
  // a hash arriving in the frame of a change of level drops the push, and the hash is read
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  booted = await entries();
  await script(["#HIRO/5", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 6");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/5\//);
  expect(await entries()).toBe(booted + 1);
  // a change of level, a drag and a slice in one frame: the drag belongs to the level entered,
  // whose slice stands at its top again
  booted = await entries();
  const stood = page.url();
  turned = await script([key("]"), "drag", key(",")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 7");
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/32$`));
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toBe(stood);
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/6\//);
  // a dialog opened straight after a drag stands on an entry holding the turn
  turned = await script(["drag", key("?")]);
  await expect(page.locator("#help")).toBeVisible();
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/`));
  await page.keyboard.press("Escape");
  await expect(page.locator("#help")).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/`));
  // a page put out of sight, or on its way out, writes the state of the moment: a slice made
  // after the drag, which a kept view written on its own would leave out
  turned = await script([key(","), "drag", key(","), "hide"]);
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/30$`));
  turned = await script([key(","), "drag", key(","), "leave"]);
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/28$`));
});
