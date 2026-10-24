import { expect, test } from "@playwright/test";
import {
  cellUnder,
  fitted,
  frame,
  hovered,
  overlaps,
  settle,
  still,
  trackErrors,
} from "./helpers.js";

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

/** The box the level is drawn in, in canvas pixels, read off the map with
    the scale bar's own box left out, and the room a fit leaves round it. */
const drawnBox = (page) =>
  page.evaluate(async () => {
    const { state, FIT_MARGIN } = await import(new URL("js/viewer/state.js", location.href).href);
    const { draw, invalidatePick } = await import(
      new URL("js/viewer/draw/render.js", location.href).href
    );
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

/** Bring the start's block under a client point, and close in on it. */
const startUnder = (page, point) =>
  page.evaluate(async ([px, py]) => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const { pan, zoomAt } = await import(
      new URL("js/viewer/chrome/interaction.js", location.href).href
    );
    const r = document.getElementById("cv").getBoundingClientRect();
    const [start] = state.lvl.records.filter((r) => r.on.some((o) => o.type === 30));
    const [x, y] = screen(start.x + 0.5, start.y + 0.5, start.z);
    pan(px - r.left - x, py - r.top - y);
    zoomAt(px - r.left, py - r.top, 2);
  }, point);

/** The box the scale bar is drawn in, read off the map drawn with the level
    far off the canvas, which leaves the scale alone on it. */
const scaleBox = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { draw, invalidatePick } = await import(
      new URL("js/viewer/draw/render.js", location.href).href
    );
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

/** How bright each side of the compass's block is that turns to the view,
    by the game's number for it, read clear of its name. */
const compassLight = (page) =>
  page.evaluate(async () => {
    const { camera } = await import(new URL("js/viewer/state.js", location.href).href);
    const { FACE_NORMAL } = await import(new URL("js/format/lattice.js", location.href).href);
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { cellKey } = await import(new URL("js/format/lattice.js", location.href).href);
    const { showCell } = await import(new URL("js/viewer/chrome/detail.js", location.href).href);
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

test("a module may frame the view in the fit's place, and f, the button and a resize go through it until it lets go", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/11");
  await settle(page);
  await still(page);
  const button = page.locator("#fitBtn");
  const ink = () => button.evaluate((b) => getComputedStyle(b).color);
  const resting = await ink();
  const probe = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return { framed: window.__framed, zoom: state.cam.zoom, held: state.framing !== null };
    });
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { fitWith } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    window.__framed = 0;
    fitWith((l) => {
      window.__framed++;
      state.target = [l.min[0] + 0.5, l.min[1] + 0.5, l.min[2] + 0.5];
      state.cam.zoom = 2.5;
      state.cam.panX = state.cam.panY = 0;
    });
  });
  await press(page, 40, 20);
  await expect.poll(() => page.url()).not.toContain("/fit/");
  await page.keyboard.press("f");
  expect(await probe()).toEqual({ framed: 1, zoom: 2.5, held: true });
  await expect(page).toHaveURL(/#HIRO\/11\/\d+,\d+\/fit\/33$/);
  expect(await ink()).toBe(resting);

  await page.setViewportSize({ width: 1100, height: 640 });
  await still(page);
  expect(await probe()).toEqual({ framed: 2, zoom: 2.5, held: true });
  await press(page, 40, 20);
  await frame(page);
  expect((await probe()).held).toBe(false);
  await expect.poll(ink).not.toBe(resting);
  await page.setViewportSize({ width: 1280, height: 720 });
  await still(page);
  expect((await probe()).framed).toBe(2);

  await button.click();
  await page.mouse.move(0, 0);
  expect(await probe()).toEqual({ framed: 3, zoom: 2.5, held: true });
  await page.evaluate(async () => {
    const { fitWith } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fitWith(null);
  });
  await page.keyboard.press("f");
  const framed = await fitted(page);
  expect(framed.zoom).toBe(framed.fit);
  expect(framed.zoom).not.toBe(2.5);
  expect((await probe()).framed).toBe(3);
  expect(errors).toEqual([]);
});

test("a link written while a module holds the camera carries the view it took the camera from", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/11/45,35/fit/33/21,13,18");
  await settle(page);
  await still(page);
  const park = (parked) =>
    page.evaluate(async (parked) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const { writeHash } = await import(
        new URL("js/viewer/chrome/navigate.js", location.href).href
      );
      state.parked = parked;
      writeHash();
    }, parked);
  const taken = {
    cam: { yaw: 30, pitch: 20, zoom: 1.25, panX: 0.5, panY: -0.25 },
    target: [18, 13, 17],
    fitted: false,
    slice: 25,
  };
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    Object.assign(state.cam, { yaw: 100, pitch: 10, zoom: 2, panX: 0, panY: 0 });
    state.target = [10, 10, 10];
    state.framing = null;
  });
  await park(taken);
  await expect
    .poll(() => page.url())
    .toMatch(/#HIRO\/11\/30,20\/1\.25\/18,13,17\/0\.5,-0\.25\/25\/21,13,18$/);
  await park({ ...taken, fitted: true });
  await expect.poll(() => page.url()).toMatch(/#HIRO\/11\/30,20\/fit\/25\/21,13,18$/);
  await park(null);
  await expect
    .poll(() => page.url())
    .toMatch(/#HIRO\/11\/\d+,\d+\/2\.00\/10,10,10\/0,0\/33\/21,13,18$/);
  expect(errors).toEqual([]);
});

test("a camera moved on purpose stays where it was put as the canvas resizes, until f", async ({
  page,
}) => {
  await page.goto("/#HILLS/19/200,10");
  await settle(page);
  await still(page);
  const camera = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
          const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const c = [...state.idx.cells.values()][0];
    return `${c.x},${c.y},${c.z}`;
  });
  await page.locator("#search").fill(cell);
  await page.locator("#search").press("Enter");
  await expect.poll(ink, "a find").not.toBe(resting);

  // pressed, it frames the level and rests, and pressed at rest it changes nothing
  const camera = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
      const { state, ZOOM_MAX } = await import(new URL("js/viewer/state.js", location.href).href);
      const { zoomAt } = await import(
        new URL("js/viewer/chrome/interaction.js", location.href).href
      );
      const { showCell } = await import(new URL("js/viewer/chrome/detail.js", location.href).href);
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
      const { camera } = await import(new URL("js/viewer/state.js", location.href).href);
      const { FACE_NORMAL, DIRECTION_NAME } = await import(
        new URL("js/format/lattice.js", location.href).href
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

test("the compass shades its block as the map shades a face, with textures or without", async ({
  page,
}) => {
  const [PLUS_X, PLUS_Y] = [1, 2];
  // HIRO's textures light its +y sides brightest and INCA's textures its +x sides,
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
  // off the compass, above the corner
  const beside = [box.x - 10, box.y - 10];
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
