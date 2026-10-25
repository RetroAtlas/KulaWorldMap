import { test, expect } from "@playwright/test";
import { frozen, onward, textured, trackErrors } from "./helpers.js";
import {
  BONUS_LEVEL,
  WAY_OUT,
  line,
  opened,
  rolled,
  startPlay,
  teleportDraft,
  toggled,
} from "./playhelpers.js";
import { KEY } from "../../public/js/play/world.js";

const dustAlive = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/play/dust.js", location.href).href)).dustAlive(),
  );

// LEVEL 1's key, on the top of 20,15,17, three blocks on from the turn
const KEY_BLOCK = [20, 15, 17];

/** Drive the frozen level along `way` to the block before the key's block, roll onto the key's
    block and step on through its burst, reading on each frame the mean brightness the frame paints
    within most of a block of the key's place: the frame the key was taken on, the table's frames
    and the samples. */
const burstAbout = (page, way) =>
  page.evaluate(
    async ([way, block, type]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen, BLOCK }, { draw }, { motionTable, blockUnits }, P] =
        await Promise.all(
          ["viewer/state.js", "viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
        );
      const { effects, types, hz } = motionTable();
      const { frames } = effects.tables[effects.kinds[effects.starts[type].world]];
      const stand = types[String(type)].take.stand;
      const place = [block[0] + 0.5, block[1] + 0.5, block[2] + 0.5 - stand / blockUnits()];
      const g = document.getElementById("cv").getContext("2d");
      const k = state.view.dpr;
      const about = () => {
        const [x, y] = screen(...place);
        const r = Math.round(state.cam.zoom * BLOCK * k * 0.8);
        const img = g.getImageData(
          Math.round(x * k) - r,
          Math.round(y * k) - r,
          2 * r + 1,
          2 * r + 1,
        );
        let sum = 0;
        let n = 0;
        for (let j = 0; j <= 2 * r; j++)
          for (let i = 0; i <= 2 * r; i++) {
            if (Math.hypot(i - r, j - r) > r) continue;
            const o = 4 * (j * img.width + i);
            sum += img.data[o] + img.data[o + 1] + img.data[o + 2];
            n += 3;
          }
        return sum / n;
      };
      const tap = (key) => {
        for (const kind of ["keydown", "keyup"])
          document.body.dispatchEvent(new KeyboardEvent(kind, { key, bubbles: true }));
      };
      const run = () => {
        window.__step(1000 / hz);
        draw();
      };
      for (const [key, to] of way) {
        tap(key);
        for (let f = 0; f < 200; f++) {
          run();
          const s = P.station();
          if (!s.moving && (s.block.join() === to || s.heading === to)) break;
        }
      }
      const keys = document.getElementById("playKeys");
      tap("ArrowUp");
      const samples = [];
      let took = null;
      for (let f = 0; f < 300 && (took === null || f <= took + frames + 6); f++) {
        run();
        if (took === null && keys.textContent.replace(/\s+/g, " ").trim() === "Keys 0") took = f;
        samples.push(about());
        // the sheet lands between frames
        await new Promise((r) => setTimeout(r));
      }
      return { took, frames, samples };
    },
    [way, KEY_BLOCK, KEY],
  );

/** Step the frozen level a frame of the clock at a time through `steps` steps, with `hold` held
    down until the ball stands on the block `until` names, reading before the first and after each
    the frame count, the ball's block and the mean of the canvas's channels: the readings and the
    table's flash. */
const shaded = (page, steps, { hold = null, until = null } = {}) =>
  page.evaluate(
    async ([steps, hold, until]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw, clock }, { motionTable }, P] = await Promise.all(
        ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
      );
      const { hz, effects } = motionTable();
      const g = document.getElementById("cv").getContext("2d");
      const key = (type, k) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
      const read = () => {
        const { width, height } = g.canvas;
        const d = g.getImageData(0, 0, width, height).data;
        let sum = 0;
        let n = 0;
        for (let o = 0; o < d.length; o += 16) {
          sum += d[o] + d[o + 1] + d[o + 2];
          n += 3;
        }
        return { pass: clock(), block: P.station()?.block.join() ?? null, mean: sum / n };
      };
      const seen = [read()];
      let held = false;
      if (hold) {
        key("keydown", hold);
        held = true;
      }
      for (let i = 0; i < steps; i++) {
        window.__step(1000 / hz);
        draw();
        const r = read();
        if (held && r.block === until) {
          key("keyup", hold);
          held = false;
        }
        seen.push(r);
      }
      if (held) key("keyup", hold);
      return { seen, flash: effects.flash };
    },
    [steps, hold, until],
  );

/** Step the frozen level a frame of the clock at a time through `steps` steps, with `hold` held
    down until the ball stands on the block `until` names, recording every sprite of the sheet the
    frame lays: its pass, which sprite and the canvas points of its four corners, from the
    transform at the draw; with the teleport's point, the view, the game's screen, a HUD size's
    unit, the turn and the teleport's table. */
const sprited = (page, steps, { hold, until }) =>
  page.evaluate(
    async ([steps, hold, until]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { draw, clock }, { motionTable }, P] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
      );
      const { hz, effects, play, turn } = motionTable();
      // the sheet in the cache, so that it lands between the frames that first need it
      await new Promise((r) => {
        const img = new Image();
        img.addEventListener("load", r);
        img.src = "tex/sparks.png";
      });
      const g = document.getElementById("cv").getContext("2d");
      const sprites = [];
      const drawImage = g.drawImage;
      g.drawImage = function (img, ...rest) {
        if (rest.length === 8 && typeof img.src === "string" && img.src.endsWith("sparks.png")) {
          const [sx, , sw, , dx, dy, dw, dh] = rest;
          const m = this.getTransform();
          const point = (x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
          sprites.push({
            pass: clock(),
            sprite: sx / sw,
            corners: [
              point(dx, dy),
              point(dx + dw, dy),
              point(dx, dy + dh),
              point(dx + dw, dy + dh),
            ],
          });
        }
        return drawImage.call(this, img, ...rest);
      };
      const key = (type, k) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
      key("keydown", hold);
      let held = true;
      for (let i = 0; i < steps; i++) {
        window.__step(1000 / hz);
        draw();
        if (held && P.station()?.block.join() === until) {
          key("keyup", hold);
          held = false;
        }
        // the sheet effects.js fetches on the first pass with particles lands between frames, so
        // the steps yield from the teleporter's block until a sprite is laid
        if (!held && !sprites.length) await new Promise((r) => setTimeout(r));
      }
      if (held) key("keyup", hold);
      g.drawImage = drawImage;
      return {
        sprites,
        point: effects.hud.teleport,
        view: state.view,
        screen: play.screen,
        unit: effects.size.hud,
        turn,
        table: effects.tables[effects.kinds[effects.teleport.hud]],
      };
    },
    [steps, hold, until],
  );

// BONUS 1's start, on the top of a corner block of a ring four blocks tall, heading -y, and the
// block beside it along +x: the camera behind the ball sees both blocks' +y faces
const BONUS_START = [20, 20, 17];

const BONUS_BESIDE = [21, 20, 17];

const PLUS_Y = 2;

/** The mean of each channel over the pixels about the middle of face `game` of the block at
    `cell`, as the map draws the frame now. */
const faceColour = (page, cell, game) =>
  page.evaluate(
    async ([cell, game]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { facePoints }, { draw }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/blocks.js", "viewer/draw/render.js"].map(at),
      );
      draw();
      const pts = facePoints({ x: cell[0], y: cell[1], z: cell[2] }, game);
      const [x, y] = pts.reduce(([sx, sy], [px, py]) => [sx + px / 4, sy + py / 4], [0, 0]);
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      const d = g.getImageData(Math.round(x * k) - 2, Math.round(y * k) - 2, 5, 5).data;
      const sum = [0, 0, 0];
      for (let o = 0; o < d.length; o += 4) for (let ch = 0; ch < 3; ch++) sum[ch] += d[o + ch];
      return sum.map((v) => v / (d.length / 4));
    },
    [cell, game],
  );

test("the dust is born only with its setting on, on by default, and what is alive goes as it is put away", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  expect(await dustAlive(page)).toBe(false);
  await rolled(page, [17, 17, 17]);
  expect(await dustAlive(page)).toBe(true);
  await toggled(page, "showDust", "on by default");
  expect(await dustAlive(page)).toBe(false);
  // onto the coin's block, whose take bursts the game's sparks and no dust
  await rolled(page, [17, 16, 17]);
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  expect(await dustAlive(page)).toBe(false);
  await toggled(page, "showDust", "");
  await rolled(page, [17, 15, 17]);
  expect(await dustAlive(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("the key taken bursts as the game's does: the frames after the take are brighter about the key's place than the frame before, the faces about it lit with the sparks, and dark again past the table's frames", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await opened(page);
  // the burst lights the faces' textures, so they are put back on, and the map's dust is put
  // away, so nothing of its own fades about the ball
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await textured(page);
  await toggled(page, "showDust", "on by default");
  await startPlay(page);
  await expect(page.locator("#playKeys")).toHaveText("Keys 1");
  await frozen(page);
  const { took, frames, samples } = await burstAbout(page, WAY_OUT.slice(0, 6));
  expect(took).not.toBeNull();
  expect(took).toBeGreaterThan(0);
  const before = samples[took - 1];
  const during = samples.slice(took + 1, took + frames);
  const after = samples.slice(took + frames + 1);
  const peak = Math.max(...during);
  expect(peak).toBeGreaterThan(before + 4);
  expect(after.length).toBeGreaterThan(3);
  for (const level of after) expect(level).toBeLessThan(peak - 4);
  // nothing moves about the key's place once the burst is over
  expect(Math.max(...after) - Math.min(...after)).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test("a teleport flashes the screen as the game does: the frame after the send is white over the whole canvas, the white wanes on each pass after, the last pass still lifting the scene, and past the derived passes the scene is its own again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await teleportDraft(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  // Up held rolls the ball over the switch onto the near teleporter, where the send's count runs
  // out on its own and the far end's block says the ball was sent
  const { seen, flash } = await shaded(page, 200, { hold: "ArrowUp", until: "17,15,17" });
  await page.evaluate(() => window.__thaw());
  const sent = seen.findIndex((r) => r.block === "17,14,17");
  expect(sent).toBeGreaterThan(0);
  const passes = Math.ceil(flash.teleport.from / flash.teleport.step) - 1;
  const atPass = (k) => seen.find((r) => r.pass === seen[sent].pass + k);
  const shown = Array.from({ length: passes + 2 }, (_, k) => atPass(k));
  expect(shown.every((r) => r !== undefined)).toBe(true);
  // the send's own pass leaves the strength less one step, which saturates nearly every pixel
  expect(shown[0].mean).toBeGreaterThan(250);
  for (let k = 1; k < passes; k++) expect(shown[k].mean).toBeLessThan(shown[k - 1].mean);
  // the last pass the flash shows on still lifts the scene by its strength, and the pass after
  // shows the scene as it is, which stands still from there
  expect(shown[passes - 1].mean).toBeGreaterThan(shown[passes].mean + 4);
  expect(Math.abs(shown[passes].mean - shown[passes + 1].mean)).toBeLessThan(2);
  expect(errors).toEqual([]);
});

test("a teleport's shell is laid as the game lays it: the sprite's third corner at the teleport's point, its first the size on at the angle, the fourth a quarter on and the second the two summed, the angle running on by the table's step a frame", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await teleportDraft(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const { sprites, point, view, screen, unit, turn, table } = await sprited(page, 200, {
    hold: "ArrowUp",
    until: "17,15,17",
  });
  await page.evaluate(() => window.__thaw());
  // the shell is the table's one particle of a size below nothing, the rows it shows on
  const shell = table.rows.map(
    (row) => row.find(([, , size, brightness]) => size < 0 && brightness > 0) ?? null,
  );
  const rows = shell.map((p, f) => (p ? f : null)).filter((f) => f !== null);
  expect(rows.length).toBeGreaterThan(1);
  const [sprite, , size] = shell[rows[0]];
  expect(new Set(rows.map((f) => shell[f][0])).size).toBe(1);
  // the shell is laid once a pass on every row it shows on, and nothing else lays its sprite
  const seen = [];
  for (const s of sprites) if (s.sprite === sprite && seen.at(-1)?.pass !== s.pass) seen.push(s);
  expect(seen.length).toBe(rows.length);
  const k = view.dpr;
  const across = (view.w / screen.wide) * k;
  const down = (view.h / screen.high) * k;
  const at = [point[0] * across, point[1] * down];
  const side = (-size / unit) * Math.min(across, down);
  const near = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-3);
  const angles = [];
  for (const { corners } of seen) {
    const [first, second, third, fourth] = corners;
    near(third[0], at[0]);
    near(third[1], at[1]);
    const dx = first[0] - at[0];
    const dy = first[1] - at[1];
    near(Math.hypot(dx, dy), side);
    // a quarter on, with y down the page, turns right into down
    near(fourth[0], at[0] - dy);
    near(fourth[1], at[1] + dx);
    near(second[0], first[0] - dy);
    near(second[1], first[1] + dx);
    angles.push(Math.atan2(dy, dx));
  }
  for (let i = 1; i < seen.length; i++) {
    const step = ((shell[rows[i]][1] - shell[rows[i - 1]][1]) / turn) * 2 * Math.PI;
    const d = angles[i] - angles[i - 1];
    near(d - 2 * Math.PI * Math.round((d - step) / (2 * Math.PI)), step);
  }
  expect(errors).toEqual([]);
});

test("a level with no key opens from white as in the game: the first frame is white over the whole canvas, the white wanes on each pass at full pace, and the frame the derived passes on is the scene's own frame again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: BONUS_LEVEL });
  await frozen(page);
  await startPlay(page);
  await expect(line(page)).toHaveText(/^Playing · /);
  const { seen, flash } = await shaded(page, 60);
  await page.evaluate(() => window.__thaw());
  const passes = Math.ceil(flash.bonus.from / flash.bonus.step) - 1;
  // one pass a step of the clock from the first step on, the frame count the draw is handed
  // standing at nothing through the run's first pass: the opening's flash slows nothing
  expect(seen.slice(1).map((r) => r.pass - seen[1].pass)).toEqual(seen.slice(1).map((_, i) => i));
  expect(seen[0].mean).toBeGreaterThan(250);
  const midway = Math.ceil(passes / 2);
  expect(seen[1].mean).toBeGreaterThan(seen[midway].mean);
  expect(seen[midway].mean).toBeGreaterThan(seen[passes].mean);
  expect(seen[0].mean).toBeGreaterThan(seen[passes].mean + 100);
  // the last pass the flash shows on still lifts the scene by its strength, and the pass after
  // shows the scene as it is, which stands near still from there
  expect(seen[passes].mean).toBeGreaterThan(seen[passes + 1].mean);
  expect(Math.abs(seen[passes + 1].mean - seen[passes + 8].mean)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("a level with no key opens as it is with Motion off: the frames drawn show the scene and not the opening's white, and the first frame with Motion on is white, the words having stood", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: BONUS_LEVEL });
  await frozen(page);
  await startPlay(page);
  await expect(line(page)).toHaveText(/^Playing · /);
  const { seen } = await shaded(page, 8);
  // no pass runs while nothing drives the ball, and every frame shows the scene, far from white
  expect(seen.map((r) => r.pass)).toEqual(seen.map(() => seen[0].pass));
  for (const r of seen) expect(r.mean).toBeLessThan(128);
  for (const r of seen) expect(Math.abs(r.mean - seen[0].mean)).toBeLessThan(2);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  // the strength stands at the table's full through the frames with Motion off, so the first
  // frame with Motion on saturates nearly every pixel
  const lit = (await shaded(page, 1)).seen;
  await page.evaluate(() => window.__thaw());
  expect(lit[1].mean).toBeGreaterThan(250);
  expect(lit[1].mean).toBeGreaterThan(seen[0].mean + 100);
  expect(errors).toEqual([]);
});

test("on a level with no key the block the ball marks is painted as the game paints it: the block under the ball is marked on the level's first frame and its faces take the marked cycle's colour, orange in an even world, greener and less blue than a face as built, the colour itself at once with Motion off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: BONUS_LEVEL });
  // the colour is laid over the face's texture, so the textures are put back on
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await textured(page);
  await frozen(page);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 20,20,17, facing -y");
  await expect(page.locator("#playKeys")).toHaveText("48 blocks");
  await onward(page, 1);
  await expect(page.locator("#playKeys")).toHaveText("47 blocks");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked({ checked: false });
  const marked = await faceColour(page, BONUS_START, PLUS_Y);
  const built = await faceColour(page, BONUS_BESIDE, PLUS_Y);
  await page.evaluate(() => window.__thaw());
  expect(marked[1]).toBeGreaterThan(built[1] + 50);
  expect(marked[2]).toBeLessThan(built[2] - 15);
  expect(errors).toEqual([]);
});
