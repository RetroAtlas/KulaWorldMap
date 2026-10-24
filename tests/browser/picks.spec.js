import { expect, test } from "@playwright/test";
import { alone, settle, textured, trackErrors } from "./helpers.js";

test("the ball is lit corner by corner from a light fixed to the view", async ({ page }) => {
  const errors = trackErrors(page);
  // LEVEL 1 starts on the top of this block
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await page.keyboard.press("v");
  const at = async (yaw) => {
    await page.evaluate(async (yaw) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      state.cam.yaw = yaw;
    }, yaw);
    return (await alone(page, [17, 18, 17], 30)).fills.map(([, style]) => style);
  };
  const own = await page.evaluate(async () => {
    const { ballFor, polygonColour } = await import(
      new URL("js/viewer/data.js", location.href).href
    );
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const g = document.createElement("canvas").getContext("2d");
    const ball = ballFor(state.lvl);
    return ball.polys.map(
      (_, k) => ((g.fillStyle = `rgb(${polygonColour(ball, k).join(" ")})`), g.fillStyle),
    );
  });
  const front = await at(45);
  expect(front.length).toBeGreaterThan(20);
  expect(front.filter((f) => !own.includes(f)).length).toBeGreaterThan(front.length / 2);
  const behind = await at(225);
  expect([...behind].sort()).not.toEqual([...front].sort());
  expect(await at(45)).toEqual(front);
  expect(errors).toEqual([]);
});

test("a travelling thing, and every block of a platform, picks the cell its record is on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 22's one fast star on a top, as a marker, once it has swayed off its own block
  await page.goto("/#HILLS/6/45,35/1.5");
  await settle(page);
  await page.keyboard.press("m");
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  const star = () =>
    page.evaluate(async () => {
      const { state, screen, BLOCK } = await import(
        new URL("js/viewer/state.js", location.href).href
      );
      const { draw, cellAt, invalidatePick } = await import(
        new URL("js/viewer/draw/render.js", location.href).href
      );
      const g = document.getElementById("cv").getContext("2d");
      const seen = [];
      const fillText = g.fillText;
      g.fillText = (text, x, y, ...rest) => (
        text === "Captivator, quick · top" && seen.push([x, y]),
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
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
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
    const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
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

test("the pick names the face under the point, and the point lies on it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HELL/18/45,35");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("HIDDEN 10");
  const seen = await page.evaluate(async () => {
    const { screen, facing } = await import(new URL("js/viewer/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const { FACES } = await import(new URL("js/viewer/draw/blocks.js", location.href).href);
    const on = (pts, x, y) => {
      const sides = pts.map(([ax, ay], i) => {
        const [bx, by] = pts[(i + 1) % pts.length];
        return Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
      });
      return !sides.includes(1) || !sides.includes(-1);
    };
    const cv = document.getElementById("cv");
    const faces = new Set();
    const wrong = [];
    for (let y = 0; y < cv.clientHeight; y += 3)
      for (let x = 0; x < cv.clientWidth; x += 3) {
        const c = cellAt(x, y);
        if (!c) continue;
        // the faces of the cell turned to the camera that hold the point: one,
        // two on the edge between them, none where the point is on the cube's rim
        const under = FACES.filter(
          (f) =>
            facing(f.n) &&
            on(
              f.c.map(([dx, dy, dz]) => screen(c.x + dx, c.y + dy, c.z + dz)),
              x,
              y,
            ),
        ).map((f) => f.game);
        if (under.length && !under.includes(c.face))
          wrong.push(`${x},${y} on ${c.x},${c.y},${c.z} face ${c.face}, not ${under}`);
        faces.add(c.face);
      }
    return { wrong, faces: [...faces].sort() };
  });
  expect(seen.wrong, seen.wrong.slice(0, 3).join("; ")).toEqual([]);
  expect(seen.faces.length).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});

test("the map, the legend and the panel follow the screen's density", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await textured(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { showCell } = await import(new URL("js/viewer/chrome/detail.js", location.href).href);
    showCell(state.idx.cells.get([...state.idx.markers.keys()][0]));
  });
  const density = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
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
