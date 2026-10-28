import { expect, test } from "@playwright/test";
import { alone, landed, settle, trackErrors } from "./helpers.js";
import { toggled } from "./playhelpers.js";

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
      const [
        { state, screen },
        { draw, clock },
        { skinsTable },
        { lookOf, faceSkin },
        { cellKey },
      ] = await Promise.all(
        [
          "viewer/state.js",
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/skins.js",
          "format/lattice.js",
        ].map(at),
      );
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

const CLEAR = [
  [0.2, 0.2],
  [0.8, 0.2],
  [0.2, 0.8],
  [0.8, 0.8],
];

/** The red, green and blue of the top of a block, summed over points clear
    of its middle or over the points given, drawn without the objects at each
    frame of the level's clock asked for. */
const topAt = (page, [x, y, z], frames, points = CLEAR) =>
  page.evaluate(
    async ([[x, y, z], frames, points]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw, clock }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js"].map(at),
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
        for (const [dx, dy] of points) {
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
    [[x, y, z], frames, points],
  );

// The fills a frame's gems are drawn in, everything else on the level hidden,
// and those the gems' own models hold.
const gemFills = (page, frames) =>
  page.evaluate(async (frames) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [
      { state },
      { draw, clock },
      { levelMarkers, typeModels, skinsTable, polygonColour },
      { byLight },
    ] = await Promise.all(
      ["viewer/state.js", "viewer/draw/render.js", "viewer/data.js", "viewer/motion.js"].map(at),
    );
    // both gems stand on faces of the world's middle shade
    const light = skinsTable().light[state.lvl.theme].arcade[1];
    const lit = (rgb) => byLight(rgb, light).map((v) => Math.min(255, v));
    const g = document.getElementById("cv").getContext("2d");
    const scratch = document.createElement("canvas").getContext("2d");
    const css = (style) => ((scratch.fillStyle = style), scratch.fillStyle);
    const own = new Set(
      typeModels(36).flatMap((m) =>
        m.polys.map((_, k) => css(`rgba(${lit(polygonColour(m, k)).join(" ")} / 0.5)`)),
      ),
    );
    const white = css(`rgba(${lit([254, 254, 254]).join(" ")} / 0.5)`);
    const hidden = state.hiddenKinds;
    state.hiddenKinds = new Set(levelMarkers(state.lvl).map((m) => m.id));
    for (const id of [...state.hiddenKinds])
      if (id.startsWith("t36/")) state.hiddenKinds.delete(id);
    const now = performance.now;
    const t = now.call(performance);
    const from = clock();
    const fill = g.fill;
    const out = frames.map((frame) => {
      performance.now = () => t + ((frame + 0.5 - from) * 1000) / 60;
      const seen = [];
      g.fill = function (...a) {
        seen.push(this.fillStyle);
        return fill.apply(this, a);
      };
      draw();
      g.fill = fill;
      return seen.filter((s) => s.endsWith(", 0.5)"));
    });
    state.hiddenKinds = hidden;
    performance.now = now;
    draw();
    return { frames: out, own: [...own], white };
  }, frames);

// The fills a model is drawn in under a light, and in its own colours.
const fillsOf = (page, type, variant, light) =>
  page.evaluate(
    async ([type, variant, light]) => {
      const { typeModels, polygonColour } = await import(
        new URL("js/viewer/data.js", location.href).href
      );
      const { byLight } = await import(new URL("js/viewer/motion.js", location.href).href);
      const g = document.createElement("canvas").getContext("2d");
      const css = (rgb) => ((g.fillStyle = `rgb(${rgb.join(" ")})`), g.fillStyle);
      const model = typeModels(type)[variant];
      const colours = model.polys.map((_, k) => polygonColour(model, k));
      return {
        lit: colours.map((c) => css(byLight(c, light).map((v) => Math.min(255, v)))),
        own: colours.map(css),
      };
    },
    [type, variant, light],
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
      ["viewer/state.js", "viewer/draw/atlas.js", "viewer/data.js"].map(at),
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

test("with Invisible blocks off, an invisible block is drawn only where the ball is near it, and one a level shows from afar stays", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/0/45,35");
  await settle(page);
  await landed(page);
  const [shown] = await litBeside(page, [15, 15, 17], [15, 14, 17]);
  await toggled(page, "showInvisible", "on by default");
  const [alone, lit] = await litBeside(page, [15, 15, 17], [15, 14, 17]);
  expect(alone).toBeLessThan(shown - 10);
  expect(lit).toBeGreaterThan(alone + 15);
  // LEVEL 106 turns the light round, so a block beyond the ball's reach is drawn as before
  await page.goto("/#HAZE/0/45,35");
  await settle(page);
  await landed(page);
  await expect(page.locator("#showInvisible")).not.toBeChecked();
  const [seen, gone] = await litBeside(page, [20, 10, 17], [20, 9, 17], true);
  expect(gone).toBeLessThan(seen - 20);
  expect(errors).toEqual([]);
});

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
      ["viewer/state.js", "viewer/draw/atlas.js", "viewer/data.js"].map(at),
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

test("a gem's facets glint white and fade, the same ones on every gem of its cut, until v holds them", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 5 holds two blue gems
  await page.goto("/#HIRO/4/45,35/fit/33");
  await settle(page);
  await landed(page);
  const frames = [...Array(60).keys()];
  const { frames: seen, own, white } = await gemFills(page, frames);
  let glinting = 0;
  for (const fills of seen) {
    expect(fills).toHaveLength(64);
    const lit = fills.filter((f) => !own.includes(f));
    glinting += lit.length;
    const counts = new Map();
    for (const f of lit) counts.set(f, (counts.get(f) ?? 0) + 1);
    for (const n of counts.values()) expect(n % 2).toBe(0);
  }
  expect(seen.some((fills) => fills.includes(white))).toBe(true);
  // about five of each gem's 32 facets at a time
  expect(glinting / seen.length / 2).toBeGreaterThan(2);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const held = (await gemFills(page, [10, 40])).frames.map((f) => [...f].sort());
  expect(held[1]).toEqual(held[0]);
  expect(held[0]).toEqual([...seen[0]].sort());
  expect(errors).toEqual([]);
});

test("the hidden exit adds a quarter of itself to what is behind it, from both sides", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 132's hidden exit stands on the top of this block
  await page.goto("/#MARS/11/45,35/6/14,19,18/0,0/33");
  await settle(page);
  await page.keyboard.press("v");
  const { fills, changed } = await alone(page, [14, 19, 18], 26);
  // its 93 polygons are translucent and none is culled
  expect(fills).toHaveLength(93);
  expect(fills.every(([op, style]) => op === "lighter" && style.endsWith(", 0.25)"))).toBe(true);
  expect(changed.length).toBeGreaterThan(1000);
  // so it lightens the grey behind it, and in green the most
  expect(changed.every((px) => px.every((v) => v >= 100))).toBe(true);
  const [r, g, b] = [0, 1, 2].map((ch) => changed.reduce((sum, px) => sum + px[ch] - 100, 0));
  expect(g).toBeGreaterThan(r);
  expect(g).toBeGreaterThan(b);
  expect(errors).toEqual([]);
});

test("a polygon the game culls shows only facing the view, in the order its model holds it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // HIDDEN 1 starts on the glass ball: 84 opaque polygons of shards, then 180
  // of translucent shell, every one culled
  await page.goto("/#HIRO/18/45,35/fit/33");
  await settle(page);
  await page.keyboard.press("v");
  const { fills } = await alone(page, [19, 21, 17], 30);
  expect(fills.length).toBeGreaterThan(264 * 0.35);
  expect(fills.length).toBeLessThan(264 * 0.6);
  const shell = fills.map(([op, style]) => op === "source-over" && style.endsWith(", 0.5)"));
  const first = shell.indexOf(true);
  expect(first).toBeGreaterThan(0);
  expect(shell.slice(first).every(Boolean)).toBe(true);
  expect(shell.slice(0, first).some(Boolean)).toBe(false);
  expect(errors).toEqual([]);
});

test("a thing is drawn in its world's light for the face it stands on, and a bonus level's thing in none", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 3's bronze coins stand on Hiro's brightest face, +y, and on tops
  await page.goto("/#HIRO/2/45,35/fit/33");
  await settle(page);
  await page.keyboard.press("v");
  const light = await page.evaluate(async () => {
    const { skinsTable } = await import(new URL("js/viewer/data.js", location.href).href);
    const s = skinsTable();
    return {
      bright: s.light.HIRO.arcade[s.shade.HIRO[2]],
      top: s.light.HIRO.arcade[s.shade.HIRO[0]],
    };
  });
  expect(light.bright).toEqual([4915, 4505, 4505]);
  for (const [cell, face, at] of [
    [[13, 12, 15], 2, light.bright],
    [[13, 15, 17], 0, light.top],
  ]) {
    const { fills } = await alone(page, cell, 37);
    const want = await fillsOf(page, 37, 2, at);
    expect(fills.length, `face ${face}`).toBeGreaterThan(0);
    for (const [, style] of fills) expect(want.lit).toContain(style);
  }
  // BONUS 2 lights its things from the set of a level without a key, 4096 throughout
  await page.goto("/#HIRO/16/45,35/fit/33");
  await settle(page);
  await page.keyboard.press("v");
  const { fills } = await alone(page, [12, 16, 17], 37);
  const own = (await fillsOf(page, 37, 1, [4096, 4096, 4096])).own;
  for (const [, style] of fills) expect(own).toContain(style);
  expect(errors).toEqual([]);
});

test("a teleporter's model flashes with its light, by its circuit's lift", async ({ page }) => {
  const errors = trackErrors(page);
  // LEVEL 68's blue teleporter is on from the start, its light dark for 19 frames and lit for 19
  await page.goto("/#COWBOY/7/45,55");
  await settle(page);
  const light = await page.evaluate(async () => {
    const { skinsTable, motionTable } = await import(
      new URL("js/viewer/data.js", location.href).href
    );
    const { byLight } = await import(new URL("js/viewer/motion.js", location.href).href);
    const s = skinsTable();
    const top = s.light.COWBOY.arcade[s.shade.COWBOY[0]];
    const lift = motionTable().glow.lift["5"][1];
    return { top, lifted: byLight(top, lift) };
  });
  const dark = await fillsOf(page, 5, 1, light.top);
  const lit = await fillsOf(page, 5, 1, light.lifted);
  for (const [frame, want] of [
    [10, dark.lit],
    [25, lit.lit],
    [48, dark.lit],
  ]) {
    const { fills } = await alone(page, [17, 21, 17], 5, frame);
    expect(fills.length, `frame ${frame}`).toBeGreaterThan(0);
    for (const [, style] of fills) expect(want, `frame ${frame}`).toContain(style);
  }
  expect(lit.lit).not.toEqual(dark.lit);
  expect(errors).toEqual([]);
});

test("an exit its panel opens turns green, the cross on its face with it, and lights and flashes 19 frames on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 1's exit stands on the top of this block, and lights the top beside it once open
  await page.goto("/#HIRO/0/45,55");
  await settle(page);
  await landed(page);
  const exit = [17, 12, 17];
  const beside = [18, 12, 17];
  const middle = [[0.5, 0.5]];
  const light = await page.evaluate(async () => {
    const { skinsTable, motionTable } = await import(
      new URL("js/viewer/data.js", location.href).href
    );
    const { byLight } = await import(new URL("js/viewer/motion.js", location.href).href);
    const s = skinsTable();
    const top = s.light.HIRO.arcade[s.shade.HIRO[0]];
    const lift = motionTable().glow.lift["7"][0];
    return { top, lifted: byLight(top, lift) };
  });
  // a translucent polygon's fill carries its blend's alpha, so the colours are compared without it
  const rgb = (style) =>
    style.startsWith("#")
      ? [1, 3, 5].map((i) => parseInt(style.slice(i, i + 2), 16))
      : style.match(/\d+/g).slice(0, 3).map(Number);
  const drawn = async (frame) => (await alone(page, exit, 7, frame)).fills.map(([, s]) => rgb(s));
  const drawsAs = async (frame, variant, under) => {
    const want = new Set((await fillsOf(page, 7, variant, under)).lit.map((s) => rgb(s).join()));
    const got = await drawn(frame);
    expect(got.length, `frame ${frame}`).toBeGreaterThan(0);
    for (const c of got) expect(want.has(c.join()), `frame ${frame}`).toBe(true);
  };
  const [shutCross] = await topAt(page, exit, [10], middle);
  const shutBeside = await topAt(page, beside, [10, 25, 40]);
  await drawsAs(25, 1, light.top);

  await page.evaluate(async () => {
    const { flip, LAST_KEY } = await import(new URL("js/viewer/data.js", location.href).href);
    flip(LAST_KEY, 0);
  });
  const [openCross] = await topAt(page, exit, [10], middle);
  expect(shutCross[0]).toBeGreaterThan(shutCross[1] * 2);
  expect(openCross[1]).toBeGreaterThan(openCross[0] * 2);
  const [dark, lit, again] = await topAt(page, beside, [10, 25, 40]);
  expect(dark).toEqual(shutBeside[0]);
  expect(lit[1]).toBeGreaterThan(shutBeside[1][1] + 8);
  expect(again).toEqual(shutBeside[2]);
  await drawsAs(10, 0, light.top);
  await drawsAs(25, 0, light.lifted);
  expect(errors).toEqual([]);
});
