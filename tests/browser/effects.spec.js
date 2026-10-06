import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame, still, textured, written, landed, drawn } from "./helpers.js";

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
