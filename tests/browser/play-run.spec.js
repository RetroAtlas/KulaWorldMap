import { test, expect } from "@playwright/test";
import { frozen, onward, trackErrors } from "./helpers.js";
import {
  DONE,
  IDENTITY,
  WAY_OUT,
  betweenFrames,
  jumped,
  line,
  listening,
  opened,
  probe,
  said,
  startPlay,
  station,
  status,
  stepTo,
  toggled,
} from "./playhelpers.js";
import { ENDED } from "../../public/js/play/phrases.js";

// LEVEL 3: the fruit on the top of 15,15,17, of the common type, which the map draws as the third
// of the five by the level's number
const FRUIT_LEVEL = "/#HIRO/2/45,35/fit/33";

const FRUIT = [15, 15, 17];

const FRUIT_TYPE = 46;

// the same way out with no run on, as there is none until Settings turns one on
const DONE_ALONE =
  /^Out by the exit: the level is done\. 1500 points, \d+ seconds left\. Space or Enter starts the level again\.$/;

/** What one frame paints about the fruit's disc, a cross of five pixels, with the level titled
    `shown` for that frame where given. The frame is drawn at one zoom and pan, since play frames
    the ball above the strip, whose height goes with how its words wrap in the reader's font, and
    the cross is laid about the middle of the first fruit's model, which LEVEL 1 and a run both
    draw, since the five fruits stand at five heights. */
const fruitPixels = (page, shown = null) =>
  page.evaluate(
    async ([c, type, shown]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { thingDisc }, { cellKey }, { draw }] = await Promise.all(
        [
          "viewer/state.js",
          "viewer/draw/things.js",
          "format/lattice.js",
          "viewer/draw/render.js",
        ].map(at),
      );
      const m = state.idx.markers.get(cellKey(...c)).find((m) => m.type === type);
      const cam = { ...state.cam };
      Object.assign(state.cam, { zoom: 2, panX: 0, panY: 0 });
      const was = state.lvl.shown;
      state.lvl.shown = "LEVEL 1";
      const [x, y] = thingDisc(m, { x: c[0], y: c[1], z: c[2] }, state.lvl);
      state.lvl.shown = shown ?? was;
      draw();
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      const px = (dx, dy) => [
        ...g
          .getImageData(Math.round((x + dx) * k), Math.round((y + dy) * k), 1, 1)
          .data.slice(0, 3),
      ];
      const out = [px(0, 0), px(0, -3), px(0, 3), px(-3, 0), px(3, 0)];
      state.lvl.shown = was;
      Object.assign(state.cam, cam);
      draw();
      return out;
    },
    [FRUIT, FRUIT_TYPE, shown],
  );

/** Drive the frozen level along `way`, each tap run to its rest, and on through the exit's wait to
    the ending: the strip's verdict. */
const wentOut = (page, way) =>
  page.evaluate(async (way) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const tap = (k) => {
      for (const type of ["keydown", "keyup"])
        document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    };
    const run = () => {
      window.__step(1000 / motionTable().hz);
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
    const status = document.getElementById("playStatus");
    for (let f = 0; f < 60 && !status.textContent; f++) run();
    return status.textContent;
  }, way);

test("with Play on through the levels on a level's fruit is the first the run has not banked, drawn as the map draws LEVEL 1's whatever the level's number, and off it is the one the map draws for the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false, hash: FRUIT_LEVEL });
  await startPlay(page);
  const own = await fruitPixels(page);
  const first = await fruitPixels(page, "LEVEL 1");
  expect(first).not.toEqual(own);
  expect(await fruitPixels(page)).toEqual(own);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  expect(await fruitPixels(page)).toEqual(first);
  expect(await fruitPixels(page, "LEVEL 4")).toEqual(first);
  expect(errors).toEqual([]);
});

test("with Play on through the levels on a way out goes on to the level the game loads next: as the ending's view runs out LEVEL 1 gives way to LEVEL 2 through the level funnel with play on, the ball on its start and the total carried, and Esc leaves play there without LEVEL 1's view", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  await listening(page);
  await frozen(page);
  expect(await wentOut(page, WAY_OUT)).toMatch(DONE);
  // the ending's view runs the length of the arcade eye's swing, and then the level gives way
  const after = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { turn, play, hz } = motionTable();
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    // the chip lays its line anew at a level change, so the title is read afresh each time
    const level = () => document.querySelector("#chip b").textContent;
    const length = Math.floor(turn / play.view.swing);
    for (let f = 0; f < length + 5 && level() !== "LEVEL 2"; f++) run();
    return {
      level: level(),
      playing: P.playing(),
      station: P.station(),
      status: document.getElementById("playStatus").textContent,
    };
  });
  expect(after).toEqual({
    level: "LEVEL 2",
    playing: true,
    station: { block: [17, 18, 17], face: 0, heading: "-y", moving: false },
    status: "",
  });
  // the view comes round behind the ball over the entering ease, run on the held clock too
  await onward(page, 40);
  const playing = await probe(page);
  expect(playing.frame).toEqual(IDENTITY);
  expect([playing.cam.yaw, playing.cam.pitch]).toEqual([20, 30]);
  await page.evaluate(() => window.__thaw());
  await expect(page.locator("#play")).toBeVisible();
  await expect(page.locator("#playKeys")).toHaveText("Keys 1");
  await expect(page.locator("#playPoints")).toHaveText("0 points");
  await expect(page.locator("#playTotal")).toHaveText("Total 1500");
  await expect
    .poll(() => said(page))
    .toContain("On to LEVEL 2. The ball stands on the top of 17,18,17, facing -y.");
  // the funnel's own history entry, with the view the ball was first put down from
  expect(page.url()).toMatch(/#HIRO\/1\/45,35\/fit\/33$/);
  // Esc leaves play on LEVEL 2 with the ball's view, LEVEL 1's parked view being another
  // level's view
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.frame).toBeNull();
  expect([left.cam.yaw, left.cam.pitch]).toEqual([20, 30]);
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\/20,30\//);
  expect(errors).toEqual([]);
});

test("by default a way out keeps no total and starts the level again: with Play on through the levels off the strip shows no total figure, the verdict says the level starts again, Space starts LEVEL 1 again with play on, and the switch, turned on in Settings and kept, starts a run as the ball is next put on the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await opened(page);
  await startPlay(page);
  const total = page.locator("#playTotal");
  await expect(total).toBeHidden();
  await listening(page);
  await frozen(page);
  expect(await wentOut(page, WAY_OUT)).toMatch(DONE_ALONE);
  await expect(total).toBeHidden();
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 1");
  await expect(total).toBeHidden();
  const again = await probe(page);
  expect(again.playing).toBe(true);
  expect(again.station).toEqual({ block: [17, 18, 17], face: 0, heading: "-y", moving: false });
  await page.evaluate(() => window.__thaw());
  await expect
    .poll(() => said(page))
    .toContain("LEVEL 1 again. The ball stands on the top of 17,18,17, facing -y.");
  // the switch, off by default and kept as the others are, takes effect as the ball is next put
  // on the level
  await toggled(page, "playOn", "off by default");
  expect((await kept()).playon).toBe(true);
  await expect(total).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.locator("#play")).toBeHidden();
  await startPlay(page);
  await expect(total).toHaveText("Total 0");
  expect(errors).toEqual([]);
});

test("with Play on through the levels on a death on a level of the disc costs the run the level's points and its number's worth, and a total below nothing is the game's end, the run starting afresh with the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  const total = page.locator("#playTotal");
  await expect(total).toHaveText("Total 0");
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  // past the level's opening, which holds the pad dead, and facing the level's edge
  await betweenFrames(page, () => page.keyboard.press("ArrowLeft"));
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  // a jump two blocks on comes down on nothing, and the ball falls off the level
  await jumped(page);
  expect(await stepTo(page, "^FELL OFF!", 400)).not.toBeNull();
  const { each, most } = await page.evaluate(async () => {
    const { motionTable } = await import(new URL("js/viewer/data.js", location.href).href);
    return motionTable().play.points;
  });
  const penalty = Math.min(most, each);
  await expect(status(page)).toHaveText(
    new RegExp(
      `^FELL OFF! 0 points, 9\\d seconds left\\. ${penalty} points off the total, -${penalty} points in all\\. Game Over! The run starts afresh\\. Space or Enter starts the level again\\.$`,
    ),
  );
  await expect(total).toHaveText(`Total -${penalty}`);
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(total).toHaveText("Total 0");
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  await page.evaluate(() => window.__thaw());
  expect(errors).toEqual([]);
});
