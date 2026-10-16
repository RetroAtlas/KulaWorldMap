import { test, expect } from "@playwright/test";
import { settle, still, trackErrors, drawn } from "./helpers.js";

const LEVEL = "/#HIRO/0/45,35/fit/33";
const PLAY_FILES = /\/js\/play\/(play|ball|dust|rules|world|drive|contact|hazards)\.js$/;
const TIME_UP =
  "Time is up. 0 points, 0 seconds left. Space or a tap on the pad starts the level again.";
// on a level with no key the block under the ball is marked as the level opens
const TIME_UP_MARKED =
  "Time is up. 50 points, 0 seconds left. Space or a tap on the pad starts the level again.";
const LOST =
  /^The ball is lost off the level\. 0 points, 9\d seconds left\. Space or a tap on the pad starts the level again\.$/;
const DONE =
  /^Out by the exit: the level is done\. 1500 points, \d+ seconds left\. Space or a tap on the pad starts the level again\.$/;
const SPIKED =
  /^The ball is killed on the spikes\. 0 points, 9\d seconds left\. Space or a tap on the pad starts the level again\.$/;
const FORGIVEN = "Forgiven: the ball would have been killed on the spikes.";
const TAKEN = "Taken: Coin (bronze) on the top";
const SENDING = "The teleporter is sending the ball.";
const REFUSED = "The ball cannot roll off here: a block stands beside it.";
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const UNTURNED = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** The page point over a point of the level. */
const at = (page, x, y, z) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      const r = document.getElementById("cv").getBoundingClientRect();
      const [px, py] = screen(x, y, z);
      return { x: r.left + px, y: r.top + py };
    },
    [x, y, z],
  );
const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);
/** The canvas point over a point of the level. */
const canvasAt = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      return screen(x, y, z);
    },
    [x, y, z],
  );
const plusX = (page, c) => at(page, c[0] + 1, c[1] + 0.5, c[2] + 0.5);
/** The view and the ball as the page holds them. */
const probe = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const P = await import(new URL("js/play/play.js", location.href).href);
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
      playing: P.playing(),
      station: P.station(),
      frame: state.frame && state.frame.map((v) => round(v) + 0),
      cam: Object.fromEntries(Object.entries(state.cam).map(([k, v]) => [k, round(v) + 0])),
      target: state.target.map(round),
      slice: state.slice,
      fitted: document.getElementById("fitBtn").classList.contains("fitted"),
      hash: location.hash,
    };
  });
const station = async (page) => (await probe(page)).station;
/** The red, green and blue the frame paints at a point of the level. */
const pixelAt = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
      const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      draw();
      const [px, py] = screen(x, y, z);
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      return [...g.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)];
    },
    [x, y, z],
  );
/** How many times a frame lays a canvas the map's size over the map, which the see-through
    layer alone is. */
const throughDrawn = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const g = cv.getContext("2d");
    let n = 0;
    const drawImage = g.drawImage;
    g.drawImage = function (img, ...rest) {
      if (img.width === cv.width && img.height === cv.height) n++;
      return drawImage.call(this, img, ...rest);
    };
    draw();
    g.drawImage = drawImage;
    return n;
  });
/** Where the ball's centre is on the page, and the top of whatever the strip and the pad take. */
const anchor = (page) =>
  page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const cv = document.getElementById("cv").getBoundingClientRect();
    const [x, y] = screen(...state.target);
    let top = cv.bottom;
    for (const id of ["play", "pad"]) {
      const el = document.getElementById(id);
      if (!el.hidden) top = Math.min(top, el.getBoundingClientRect().top);
    }
    return { x: cv.left + x, y: cv.top + y, free: top - cv.top, top, w: cv.width };
  });
const say = (page) => page.locator("#say");
const line = (page) => page.locator("#playLine");
const status = (page) => page.locator("#playStatus");
const clockLine = (page) => page.locator("#playClock");
/** The seconds the strip's clock shows. */
const seconds = async (page) => Number((await clockLine(page).textContent()).replace(/\D/g, ""));
/** The frame the map draws at. */
const frameAt = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/viewer/draw/render.js", location.href).href)).clock(),
  );
/** The zooms the ending's view draws at from the yaw `from`, one a drawn frame, through the
    frames one swing of the quicker eye takes, counted by the yaw's turn, and whether the view
    was still the ending's, the camera's frame let go, at their end. */
const swung = (page, from) =>
  page.evaluate(async (from) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { motionTable }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js"].map(at),
    );
    const { turn, play } = motionTable();
    const step = (play.view.angles[2] * 360) / turn;
    const frames = Math.ceil(turn / play.view.bonus.swing) + 1;
    const turned = () => (state.cam.yaw - from) / step;
    const round = (v) => Math.round(v * 1000) / 1000;
    const zooms = [];
    const until = performance.now() + 8000;
    while (state.frame === null && turned() < frames && performance.now() < until) {
      zooms.push(round(state.cam.zoom));
      await new Promise((r) => requestAnimationFrame(r));
    }
    return { zooms, held: state.frame === null && turned() >= frames };
  }, from);
/** The panel's presses as the map holds them. */
const presses = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return [...state.presses];
  });
const flipped = (page, circuit, frame) =>
  page.evaluate(
    async ([circuit, frame]) => {
      const { flip } = await import(new URL("js/viewer/data.js", location.href).href);
      flip(circuit, frame);
    },
    [circuit, frame],
  );
/** The canvas point the pick stands a thing of `type` on cell `c` at. */
const discOf = (page, c, type) =>
  page.evaluate(
    async ([c, type]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { thingDisc }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/things.js", "format/lattice.js"].map(at),
      );
      const m = state.idx.markers.get(cellKey(...c)).find((m) => m.type === type);
      return thingDisc(m, { x: c[0], y: c[1], z: c[2] }, state.lvl).slice(0, 2);
    },
    [c, type],
  );
/** What one frame paints about a canvas point, a cross of five pixels. */
const about = (page, [x, y]) =>
  page.evaluate(
    async ([x, y]) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      draw();
      const k = state.view.dpr;
      const g = document.getElementById("cv").getContext("2d");
      const at = (px, py) => [
        ...g.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3),
      ];
      return [at(x, y), at(x, y - 3), at(x, y + 3), at(x - 3, y), at(x + 3, y)];
    },
    [x, y],
  );
/** The mean colour one frame paints within half the ball's radius of a canvas point. */
const fillAbout = (page, [x, y]) =>
  page.evaluate(
    async ([x, y]) => {
      const { state, BLOCK } = await import(new URL("js/viewer/state.js", location.href).href);
      const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
      draw();
      const k = state.view.dpr;
      const r = Math.round(((100 / 512) * state.cam.zoom * BLOCK * k) / 2);
      const g = document.getElementById("cv").getContext("2d");
      const img = g.getImageData(
        Math.round(x * k) - r,
        Math.round(y * k) - r,
        2 * r + 1,
        2 * r + 1,
      );
      const sum = [0, 0, 0];
      let n = 0;
      for (let j = 0; j <= 2 * r; j++)
        for (let i = 0; i <= 2 * r; i++) {
          if (Math.hypot(i - r, j - r) > r) continue;
          const at = 4 * (j * img.width + i);
          for (let ch = 0; ch < 3; ch++) sum[ch] += img.data[at + ch];
          n++;
        }
      return sum.map((v) => Math.round(v / n));
    },
    [x, y],
  );
/** Whether the frame draws the thing of `type` on `c`: its pixels paint otherwise with the
    objects hidden. */
async function drawsThing(page, c, type) {
  const point = await discOf(page, c, type);
  const shown = await about(page, point);
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).not.toBeChecked();
  const hidden = await about(page, point);
  await page.keyboard.press("o");
  await expect(page.locator("#showObjects")).toBeChecked();
  return JSON.stringify(shown) !== JSON.stringify(hidden);
}
const dustAlive = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/play/dust.js", location.href).href)).dustAlive(),
  );
/** Whether the exits stand open, and the form LEVEL 1's exit is drawn in. */
const exits = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { exitsOpen, exitForm }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js", "format/lattice.js"].map(at),
    );
    const m = state.idx.markers.get(cellKey(17, 12, 17)).find((m) => m.type === 7);
    return { open: exitsOpen(), form: exitForm(m) };
  });
/** Give the shown draft `time` seconds through the model. */
const timed = (page, time) =>
  page.evaluate(async (time) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js"].map(at),
    );
    update(state.lvl.draft, { ...get(state.lvl.draft).doc, time });
  }, time);
/** Put `block` into the shown draft at `cell` through the model. */
const laid = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      update(state.lvl.draft, setBlock(get(state.lvl.draft).doc, cell, block));
    },
    [cell, block],
  );
/** Stand `object` on `face` of `cell` in the shown draft through the model, or take what stands
    there off with null. */
const faced = (page, cell, face, object) =>
  page.evaluate(
    async ([cell, face, object]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setFace }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      update(state.lvl.draft, setFace(get(state.lvl.draft).doc, cell, face, object));
    },
    [cell, face, object],
  );
/** How many starts the shown level has. */
const starts = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { startsOf } = await import(new URL("js/viewer/data.js", location.href).href);
    return startsOf(state.lvl).length;
  });
/** What the panel's presses make of the switch on the draft's block at `c`. */
const switched = (page, c) =>
  page.evaluate(async (c) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { markerNow }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js", "format/lattice.js"].map(at),
    );
    return markerNow(state.idx.markers.get(cellKey(...c)).find((m) => m.type === 9));
  }, c);
/** How many motes of dust are over the block at `c`. */
const dustOver = (page, c) =>
  page.evaluate(async (c) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ dustOver }, { cellKey }] = await Promise.all(
      ["play/dust.js", "format/lattice.js"].map(at),
    );
    return dustOver(cellKey(...c));
  }, c);
/** The view, the ball and the dust over `blocks` on the first drawn frame the ball stands on
    `block`, read as `probe` reads them, or null where it never comes to stand there. */
const arrived = (page, block, blocks) =>
  page.evaluate(
    async ([block, blocks]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, P, { dustOver }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "play/play.js", "play/dust.js", "format/lattice.js"].map(at),
      );
      const round = (v) => Math.round(v * 1000) / 1000;
      const until = performance.now() + 8000;
      while (performance.now() < until) {
        const station = P.station();
        if (station && !station.moving && station.block.every((v, i) => v === block[i]))
          return {
            station,
            frame: state.frame.map((v) => round(v) + 0),
            target: state.target.map(round),
            fitted: document.getElementById("fitBtn").classList.contains("fitted"),
            dust: blocks.map((c) => dustOver(cellKey(...c))),
          };
        await new Promise((r) => requestAnimationFrame(r));
      }
      return null;
    },
    [block, blocks],
  );
/** The camera's frame for a ball heading `h` on a face of normal `n`, rounded as `probe` rounds. */
const frameFor = (page, h, n) =>
  page.evaluate(
    async ([h, n]) => {
      const { frameOf } = await import(new URL("js/viewer/state.js", location.href).href);
      return frameOf(h, n).map((v) => Math.round(v * 1000) / 1000 + 0);
    },
    [h, n],
  );
/** The view's frame, the ball's heading and its body, as handed to the frame and in the world, on
    every animation frame until the view's frame is `until`, or 8 s pass. */
const turnedThrough = (page, until) =>
  page.evaluate(async (until) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, P, { faceAxes, times }, { FACE_NORMAL }] = await Promise.all(
      ["viewer/state.js", "play/play.js", "viewer/motion.js", "format/lattice.js"].map(at),
    );
    const round = (v) => Math.round(v * 1000) / 1000 + 0;
    const out = [];
    const end = performance.now() + 8000;
    while (performance.now() < end) {
      const g = P.handed();
      const laid = faceAxes(FACE_NORMAL[g.w.face], g.fwd);
      out.push({
        frame: state.frame.map(round),
        heading: P.station().heading,
        body: g.body.map((row) => row.map(round)),
        world: times(laid, g.body).map((row) => row.map(round)),
      });
      if (out.at(-1).frame.every((v, i) => v === until[i])) return out;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, until);
/** Keep every sentence the live region says from here on. */
const listening = (page) =>
  page.evaluate(() => {
    window.__said = [];
    const el = document.getElementById("say");
    new MutationObserver(() => window.__said.push(el.textContent)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
const said = (page) => page.evaluate(() => window.__said);
/** A finger held still on `point` until the hold shows, then lifted. */
const hold = async (page, point) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: point.x, y: point.y }],
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { state } = await import(new URL("js/viewer/state.js", location.href).href);
        return state.hover?.key ?? null;
      }),
    )
    .not.toBeNull();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
};
// the ball's centre over the top of a block, where the start's ball is drawn
const ballOver = (c) => [c[0] + 0.5, c[1] + 0.5, c[2] - 0.03 - 100 / 512];

async function opened(page, { motion = true } = {}) {
  await page.goto(LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  if (!motion) await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked({ checked: motion });
}
/** Press y, and wait for play to load and the strip to show. */
async function startPlay(page) {
  await page.keyboard.press("y");
  await expect(page.locator("#play")).toBeVisible();
}
const sliced = (page, z) =>
  page.evaluate(async (z) => {
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 1 - z);
  }, z);

test("y stands the ball on the start and takes its view, the arrows roll it, and Esc puts the view, the slice and the start's ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await opened(page, { motion: false });
  expect(requested.filter((p) => PLAY_FILES.test(p))).toEqual([]);
  const start = [17, 18, 17];
  const withBall = await pixelAt(page, ballOver(start));
  await sliced(page, 18);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await expect.poll(() => page.url()).toMatch(/\/fit\/15$/);
  const before = await probe(page);
  expect(before.playing).toBe(false);
  expect(before.frame).toBeNull();
  expect(before.slice).toBe(15);
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");

  await startPlay(page);
  await expect
    .poll(() => requested.filter((p) => PLAY_FILES.test(p)).sort())
    .toEqual([
      "/js/play/ball.js",
      "/js/play/contact.js",
      "/js/play/dust.js",
      "/js/play/hazards.js",
      "/js/play/play.js",
      "/js/play/rules.js",
      "/js/play/world.js",
    ]);
  await expect(line(page)).toHaveText("Playing · on the top of 17,18,17, facing -y");
  await expect(say(page)).toHaveText(
    "Playing LEVEL 1. The ball stands on the top of 17,18,17, facing -y. The arrows roll and turn it, Esc leaves.",
  );
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "true");
  const entered = await probe(page);
  expect(entered.playing).toBe(true);
  expect(entered.station).toEqual({ block: start, face: 0, heading: "-y", moving: false });
  expect(entered.frame).toEqual(IDENTITY);
  expect(entered.cam.yaw).toBe(20);
  expect(entered.cam.pitch).toBe(30);
  expect(entered.slice).toBe(33);
  expect(entered.fitted).toBe(true);
  expect(entered.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).not.toContainText("sliced");

  // a tap of Up rolls the ball one block on; the view follows it rather than panning
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(() => station(page))
    .toEqual({
      block: [17, 17, 17],
      face: 0,
      heading: "-y",
      moving: false,
    });
  await expect(say(page)).toHaveText("17,17,17, top");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const rolled = await probe(page);
  expect(rolled.cam.panX).toBe(entered.cam.panX);
  expect(rolled.cam.panY).toBe(entered.cam.panY);
  expect(rolled.target).not.toEqual(entered.target);
  expect(await pixelAt(page, ballOver(start))).not.toEqual(withBall);
  await page.keyboard.down("Alt");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.up("Alt");
  await page.waitForTimeout(400);
  expect((await probe(page)).station.block).toEqual([17, 17, 17]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(say(page)).toContainText("Left play");
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.frame).toBeNull();
  expect(left.cam).toEqual(before.cam);
  expect(left.target).toEqual(before.target);
  expect(left.slice).toBe(15);
  expect(left.hash).toBe(before.hash);
  await expect(page.locator("#chipLine")).toContainText("sliced to z≥18");
  await page.keyboard.press("\\");
  expect(await pixelAt(page, ballOver(start))).toEqual(withBall);
  await expect(page.locator("#playBtn")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("ArrowLeft");
  expect((await probe(page)).cam.panX).not.toBe(before.cam.panX);
  expect(errors).toEqual([]);
});

test("with Motion on the view eases in and out, and the ball tumbles over the game's frames", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const before = await probe(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-x");
  const during = await probe(page);
  expect(during.frame).not.toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await expect.poll(async () => (await probe(page)).frame).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
  await page.keyboard.press("Escape");
  const leaving = await probe(page);
  expect(leaving.playing).toBe(false);
  expect(leaving.frame).not.toBeNull();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  expect((await probe(page)).cam).toEqual(before.cam);
  expect(errors).toEqual([]);
});

test("the ball turns in place, turns about by Down only with the setting on, and is refused an edge beside a neighbour", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await opened(page, { motion: false });
  await startPlay(page);
  await expect(line(page)).toContainText("facing -y");
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // the game's pad has no Down, so Down is read only once the setting gives it the turn about
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await expect(line(page)).toContainText("facing +x");
  expect((await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator("#turnAbout").click();
  await expect(page.locator("#settings label:has(#turnAbout) .def")).toHaveText("off by default");
  expect((await kept()).turnabout).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await page.keyboard.press("ArrowDown");
  await expect(line(page)).toContainText("facing -x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // LEVEL 1's ring: off its block to the -x there is nothing, and a block stands beside it
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText("The ball cannot roll off here: a block stands beside it.");
  await page.keyboard.up("ArrowUp");
  expect((await probe(page)).station.block).toEqual([17, 18, 17]);
  expect(errors).toEqual([]);
});

test("a turn in place turns the view round the ball and leaves the body's turn where it stands, as the game does", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  // a block's roll turns the body, so that the turn has a turn to keep
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  const [before] = await turnedThrough(page, IDENTITY);
  expect(before.heading).toBe("-y");
  expect(before.body).not.toEqual(UNTURNED);
  const final = await frameFor(page, [-1, 0, 0], [0, 0, -1]);
  const sampling = turnedThrough(page, final);
  await page.keyboard.press("ArrowLeft");
  const samples = await sampling;
  const turning = samples.filter((s) => s.heading === "-x");
  // the view turns over the turn's frames while the body handed to the frame stands, and the body
  // in the world is as it was before the turn, the frame alone having turned under it
  expect(turning.length).toBeGreaterThan(1);
  expect(turning.at(-1).frame).toEqual(final);
  expect(turning.some((s) => s.frame.some((v, i) => v !== final[i]))).toBe(true);
  for (const s of turning) expect(s.body).toEqual(turning[0].body);
  expect(turning[0].body).not.toEqual(before.body);
  for (const s of samples) expect(s.world).toEqual(before.world);
  expect(errors).toEqual([]);
});

test("the link holds the view the ball was put down from, nothing is written to the bar meanwhile, and Back leaves play on the earlier entry", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await page.keyboard.press("]");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\/45,35\/fit\/33$/);
  const url = page.url();
  await page.evaluate(() => {
    window.__wrote = 0;
    for (const way of ["pushState", "replaceState"]) {
      const orig = history[way].bind(history);
      history[way] = (...a) => {
        window.__wrote++;
        return orig(...a);
      };
    }
  });
  await startPlay(page);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.__wrote)).toBe(0);
  await page.goBack();
  await expect(page.locator("#chip b")).toHaveText("LEVEL 1");
  await expect(page.locator("#play")).toBeHidden();
  const back = await probe(page);
  expect(back.playing).toBe(false);
  expect(back.frame).toBeNull();
  expect(back.fitted).toBe(true);
  expect(page.url()).toMatch(/#HIRO\/0\/45,35\/fit\/33$/);
  expect(errors).toEqual([]);
});

test("f in play frames the ball again and dims the fit button, after a drag has turned the view about it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const framed = await probe(page);
  expect(framed.fitted).toBe(true);
  expect(framed.target).toEqual([17.5, 18.5, 16.805]);
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(700, 320, { steps: 4 });
  await page.mouse.up();
  const turned = await probe(page);
  expect(turned.fitted).toBe(false);
  expect(turned.cam.yaw).not.toBe(framed.cam.yaw);
  expect(turned.target).toEqual(framed.target);
  expect(turned.playing).toBe(true);
  await page.keyboard.press("f");
  const again = await probe(page);
  expect(again.fitted).toBe(true);
  expect(again.cam.yaw).toBe(turned.cam.yaw);
  // the ball sits a fifth below the middle of the height the strip leaves free
  const spot = await anchor(page);
  const cv = await page.locator("#cv").boundingBox();
  expect(Math.abs(spot.x - cv.x - spot.w / 2)).toBeLessThan(1);
  expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
  expect(spot.free).toBeLessThan(cv.height);
  expect(errors).toEqual([]);
});

test("with Motion off a step snaps and nothing draws once the ball rests, the level standing between moves at play's frame", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  expect((await probe(page)).frame).toEqual(IDENTITY);
  await expect(clockLine(page)).toHaveText("Time 99");
  expect(await frameAt(page)).toBe(0);
  expect(await drawn(page)).toBe(0);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await drawn(page)).toBe(0);
  // the frames the roll took, the level's opening ones among them, and no more while it rests
  const ran = await frameAt(page);
  expect(ran).toBeGreaterThan(18);
  await expect(clockLine(page)).toHaveText(`Time ${Math.floor((99 * 50 - ran) / 50)}`);
  await page.waitForTimeout(300);
  expect(await frameAt(page)).toBe(ran);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(await frameAt(page)).toBe(0);
  expect(errors).toEqual([]);
});

test("with Motion on the level runs at rest: the strip counts the clock down and the map draws at play's frame", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect(clockLine(page)).toHaveText(/^Time \d+$/);
  const first = await seconds(page);
  await expect.poll(() => seconds(page)).toBeLessThan(first);
  const a = await frameAt(page);
  await page.waitForTimeout(250);
  const b = await frameAt(page);
  expect(b).toBeGreaterThan(a);
  expect(b - a).toBeLessThan(60);
  expect((await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("time runs out into the strip's verdict with the pad dead and the view let go of the ball, and Space starts the level again with the clock full, the ball on the start and the circuits as loaded", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a key out of the ball's reach, so the level plays as an arcade one and not by its blocks
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect(clockLine(page)).toHaveText("Time 2");
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  await expect(say(page)).toHaveText(TIME_UP);
  await expect(clockLine(page)).toHaveText("Time 0");
  const over = await probe(page);
  expect(over.playing).toBe(true);
  // the view stands on the level's middle, the ball's frame let go, and with Motion off it stays
  expect(over.frame).toBeNull();
  expect(over.target).toEqual([17.5, 17.5, 17.5]);
  expect(over.fitted).toBe(true);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  const held = await probe(page);
  expect(held.station).toEqual(over.station);
  expect(held.cam).toEqual(over.cam);
  // Enter on a focused strip button works the button rather than starting the level again
  const padBtn = page.locator("#padBtn");
  const padWas = await padBtn.getAttribute("aria-pressed");
  await padBtn.focus();
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas === "true" ? "false" : "true");
  await expect(status(page)).toHaveText(TIME_UP);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await padBtn.blur();
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(clockLine(page)).toHaveText("Time 2");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  const again = await probe(page);
  expect(again.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(again.frame).toEqual(IDENTITY);
  expect(again.cam.yaw).toBe(20);
  expect(again.cam.pitch).toBe(30);
  expect(await presses(page)).toEqual([]);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("when the time runs out with Motion on, the view lets go of the ball and turns about the level as the game's does, and Space brings it back behind the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a key makes the level an arcade one, whose ending's view swings the slower way
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await startPlay(page);
  await expect
    .poll(() => status(page).textContent(), { timeout: 10_000, intervals: [50] })
    .toBe(TIME_UP);
  await expect(say(page)).toHaveText(TIME_UP);
  const over = await probe(page);
  expect(over.playing).toBe(true);
  expect(over.frame).toBeNull();
  expect(over.target).toEqual([17.5, 17.5, 17.5]);
  expect(over.fitted).toBe(true);
  // the view turns and the eye swings, frame by frame
  await expect.poll(async () => (await probe(page)).cam.yaw).not.toBe(over.cam.yaw);
  const turned = await probe(page);
  expect(turned.cam.yaw).toBeGreaterThan(over.cam.yaw);
  expect(turned.cam.pitch).toBeLessThan(over.cam.pitch);
  expect(turned.cam.zoom).not.toBe(over.cam.zoom);
  expect(turned.frame).toBeNull();
  expect(turned.target).toEqual([17.5, 17.5, 17.5]);
  expect(turned.station).toEqual(over.station);
  // through one swing of the quicker eye the arcade eye only draws further off than it stood,
  // and the verdict stands
  const { zooms, held } = await swung(page, over.cam.yaw);
  expect(held).toBe(true);
  expect(zooms.length).toBeGreaterThan(1);
  expect(Math.max(...zooms)).toBe(zooms[0]);
  expect(Math.min(...zooms)).toBeLessThan(zooms[0]);
  expect(await status(page).textContent()).toBe(TIME_UP);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  await expect.poll(async () => (await probe(page)).frame, { intervals: [50] }).toEqual(IDENTITY);
  const back = await probe(page);
  expect(back.cam.yaw).toBe(20);
  expect(back.cam.pitch).toBe(30);
  expect(back.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(errors).toEqual([]);
});

test("left alone, the ending's view runs the length of the slower swing and the level starts again by itself, and Esc leaves it with the view as it was", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // a second block the ball never rolls onto, so the level with no key is not done by its blocks
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  // framed anew about both blocks, as leaving play frames it
  await page.evaluate(async () => {
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    fit();
  });
  await expect.poll(async () => (await probe(page)).target).toEqual([18, 17.5, 17.5]);
  const before = await probe(page);
  await startPlay(page);
  await expect
    .poll(() => status(page).textContent(), { timeout: 10_000, intervals: [50] })
    .toBe(TIME_UP_MARKED);
  const since = Date.now();
  const over = await probe(page);
  expect(over.frame).toBeNull();
  // a level with no key swings the quicker way: within one swing of its eye the view draws nearer
  // than it stood, and the verdict stands past that swing
  const { zooms, held } = await swung(page, over.cam.yaw);
  expect(held).toBe(true);
  expect(zooms.length).toBeGreaterThan(1);
  expect(Math.max(...zooms)).toBeGreaterThan(zooms[0]);
  expect(await status(page).textContent()).toBe(TIME_UP_MARKED);
  // the view runs the length of the slower swing, near six seconds, which the frames cannot run
  // ahead of the wall clock, and then the level starts again by itself
  await expect(status(page)).toHaveText("", { timeout: 10_000 });
  expect(Date.now() - since).toBeGreaterThan(5000);
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  await expect.poll(async () => (await probe(page)).frame, { intervals: [50] }).toEqual(IDENTITY);
  await expect(status(page)).toHaveText(TIME_UP_MARKED, { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect.poll(async () => (await probe(page)).frame).toBeNull();
  const left = await probe(page);
  expect(left.playing).toBe(false);
  expect(left.cam).toEqual(before.cam);
  expect(left.target).toEqual(before.target);
  expect(errors).toEqual([]);
});

test("a level whose start was edited away under play starts again on the first face the ball could stand on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 1);
  await expect(page.locator("#chipLine")).toContainText("time 1");
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(clockLine(page)).toHaveText("Time 1");
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  expect(await starts(page)).toBe(1);
  await faced(page, [17, 17, 17], 0, null);
  await expect.poll(() => starts(page)).toBe(0);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText(
    "The level has no start, so the ball stands on the first face it could.",
  );
  await expect(clockLine(page)).toHaveText("Time 1");
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: [17, 17, 17], face: 0, moving: false }),
  );
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).not.toBe(0);
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("entering play gives the level its circuits as the game loads them, and leaving gives the panel's presses back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await flipped(page, 0, 5);
  expect(await presses(page)).toEqual([[0, [5]]]);
  await startPlay(page);
  expect(await presses(page)).toEqual([]);
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(await presses(page)).toEqual([[0, [5]]]);
  expect(errors).toEqual([]);
});

test("Keep as the route hands the way the ball has come to the planner, where no route stands", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const keep = page.locator("#keepBtn");
  await expect(keep).toBeDisabled();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 17, 17]);
  await expect(keep).toBeEnabled();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await keep.click();
  await expect(say(page)).toHaveText("The way the ball has come is now the route.");
  const route = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return { stations: c.stations, steps: c.steps, marks: [...c.marks].sort() };
  });
  expect(route.stations).toEqual([
    { cell: [17, 18, 17], face: 0 },
    { cell: [17, 17, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
  ]);
  expect(route.steps).toEqual([
    { k: 2, o: 0 },
    { k: 2, o: 0 },
  ]);
  expect(route.marks).toEqual([0, 2]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await expect(keep).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await expect(page.locator("#course")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a right click selects while playing, Esc clears the selection before it leaves, and the panel's button moves the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const side = await plusX(page, [17, 13, 17]);
  await page.mouse.click(side.x, side.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
  const put = page.locator("#detail .put button", { hasText: "Put the ball here" });
  await expect(put).toHaveCount(1);
  await put.click();
  await expect(page.locator("#play")).toBeVisible();
  expect((await probe(page)).station).toEqual({
    block: [17, 13, 17],
    face: 1,
    heading: "+y",
    moving: false,
  });
  await expect(say(page)).toContainText("The ball stands on the +x side of 17,13,17");
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  expect((await probe(page)).playing).toBe(true);
  const ahead = await plusX(page, [17, 14, 17]);
  await page.mouse.click(ahead.x, ahead.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,14,17");
  await page.locator("#detail .put button", { hasText: "Put the ball here" }).click();
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 14, 17]);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("over the far edge of a ridge the ball goes round onto the side, and the frame's up is that face's normal", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await faced(page, [17, 17, 17], 4, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([18, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, top");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(1);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("18,17,17, +x side");
  const p = await probe(page);
  expect(p.station).toEqual({ block: [18, 17, 17], face: 1, heading: "+z", moving: false });
  expect(p.frame.slice(6, 9).map((v) => -v + 0)).toEqual([1, 0, 0]);
  await expect(line(page)).toHaveText("Playing · on the +x side of 18,17,17, facing +z");
  await page.keyboard.press("Escape");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});

test("out of an inner corner the ball climbs the wall ahead, and shows through the block it stood on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a floor ahead of the start, a wall on it, and a block beside the wall that stops the roll at its middle
  await laid(page, [17, 16, 17], { kind: 0 });
  await laid(page, [17, 16, 16], { kind: 0 });
  await laid(page, [18, 16, 16], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  expect(await throughDrawn(page)).toBe(0);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(2);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.up("ArrowUp");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 16],
    face: 2,
    heading: "-z",
    moving: false,
  });
  await expect(say(page)).toHaveText("17,16,16, +y side");
  expect(await throughDrawn(page)).toBe(1);
  expect(errors).toEqual([]);
});

test("Space hops the ball in place, jumps it two blocks on while it rolls, and a jump off the lattice is lost, which ends the level", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await page.keyboard.press(" ");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station.block).toEqual([17, 18, 17]);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(60);
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(say(page)).toHaveText("17,16,17, top");
  // from the lattice's last column a jump lands past its edge, and the ball is lost
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await laid(page, [32, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await faced(page, [17, 17, 17], 4, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  // Motion is off still, kept from the first half by the display's store
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 32, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing +x");
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(LOST);
  await expect(say(page)).toHaveText(LOST);
  const lost = await probe(page);
  expect(lost.playing).toBe(true);
  expect(lost.frame).toBeNull();
  expect(lost.target).toEqual([25, 17.5, 17.5]);
  expect(lost.fitted).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  const again = await probe(page);
  expect(again.station).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  expect(again.frame).toEqual(IDENTITY);
  expect(errors).toEqual([]);
});

test("the ball takes the coin it rolls onto, which is gone from the frame, the last key opens the exits, rolling onto the open exit ends the level, and Space starts it again with the coin back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  const coin = [17, 16, 17];
  const keys = page.locator("#playKeys");
  const points = page.locator("#playPoints");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  expect(await drawsThing(page, coin, 37)).toBe(true);
  expect(await exits(page)).toEqual({ open: false, form: null });
  const roll = async (block) => {
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  };
  await roll([17, 17, 17]);
  await roll(coin);
  await expect(points).toHaveText("250 points");
  await expect(keys).toHaveText("Keys 1");
  await roll([17, 15, 17]);
  expect(await drawsThing(page, coin, 37)).toBe(false);
  // the tip lists the coin as the level as installed holds it, and says it is taken
  const over = await top(page, coin);
  await page.mouse.move(over.x, over.y);
  await expect(page.locator("#tip")).toContainText(TAKEN);
  await page.mouse.move(2, 2);
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  for (const x of [18, 19, 20]) await roll([x, 15, 17]);
  await expect(keys).toHaveText("Keys 0");
  await expect(points).toHaveText("1250 points");
  expect(await exits(page)).toEqual({ open: true, form: 0 });
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing -y");
  for (const y of [14, 13, 12]) await roll([20, y, 17]);
  await expect(points).toHaveText("1500 points");
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing -x");
  for (const x of [19, 18]) await roll([x, 12, 17]);
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(DONE);
  await expect(say(page)).toHaveText(DONE);
  const done = await probe(page);
  expect(done.playing).toBe(true);
  expect(done.frame).toBeNull();
  expect(done.fitted).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  expect((await probe(page)).station).toEqual({
    block: [17, 18, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(await exits(page)).toEqual({ open: false, form: null });
  expect(await drawsThing(page, coin, 37)).toBe(true);
  expect(errors).toEqual([]);
});

test("with Motion off a hop on a coin's block takes the coin on the first frame, in a burst of dust, nothing draws once the ball rests, and the tip and the panel say the coin is taken", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  const coin = [17, 16, 17];
  await page.evaluate(async (c) => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: c[0], y: c[1], z: c[2], face: 0 });
  }, coin);
  await expect(page.locator("#play")).toBeVisible();
  await expect(line(page)).toHaveText("Playing · on the top of 17,16,17, facing +y");
  await expect(page.locator("#playPoints")).toHaveText("0 points");
  expect(await dustAlive(page)).toBe(false);
  expect(await drawn(page)).toBe(0);
  await page.keyboard.press(" ");
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  await expect(say(page)).toHaveText("Coin (bronze) taken, 250 points.");
  expect(await dustAlive(page)).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(true);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await drawn(page)).toBe(0);
  expect(await frameAt(page)).toBeGreaterThan(0);
  const over = await top(page, coin);
  await page.mouse.move(over.x, over.y);
  await expect(page.locator("#tip")).toContainText(TAKEN);
  await page.mouse.click(over.x, over.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,16,17");
  await expect(page.locator("#detail")).toContainText(`${TAKEN}.`);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("rolling over a switch throws it, and an on teleporter sends the ball to its far end, the view cutting there, with dust at both ends and a leap in the way it has come", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a yellow switch, and two blue teleporters
  // that lead to each other a block apart, so that a roll could join them, the far one facing
  // across the row, so that Up is refused there with the near one's block beside
  await faced(page, [17, 17, 17], 1, { type: 31 });
  for (const cell of [
    [17, 16, 17],
    [17, 15, 17],
    [17, 14, 17],
  ])
    await laid(page, cell, { kind: 0 });
  await faced(page, [17, 16, 17], 0, { type: 9, variant: 0 });
  await faced(page, [17, 15, 17], 0, { type: 5, variant: 1 });
  await faced(page, [17, 14, 17], 0, { type: 5, variant: 1, facing: 4 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await expect(page.locator("#chipLine")).toContainText("5 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  expect(await presses(page)).toEqual([]);
  expect(await switched(page, [17, 16, 17])).toBe("on");
  const roll = async (block) => {
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  };
  await roll([17, 16, 17]);
  expect(await switched(page, [17, 16, 17])).toBe("off");
  const pressed = await presses(page);
  expect(pressed.length).toBe(1);
  expect(pressed[0][0]).toBe(0);
  expect(pressed[0][1].length).toBe(1);
  // the stop's sentence carries the throw, which would otherwise be lost to it within the frame
  expect(await said(page)).toContain(
    "17,16,17, top. Switch thrown: the yellow circuit turned over.",
  );
  // onto the teleporter the ball stops at the middle, and with Motion off and no key held the
  // level stands mid-send
  await roll([17, 15, 17]);
  await expect(status(page)).toHaveText(SENDING);
  expect(await dustOver(page, [17, 14, 17])).toBe(0);
  const near = await dustOver(page, [17, 15, 17]);
  // with Motion on the level runs at rest, so the count runs out on its own; the view is read on
  // the first frame the ball stands at the far end, where a target eased after the ball rather
  // than cut would still be on its way from the near one
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked();
  const far = await arrived(
    page,
    [17, 14, 17],
    [
      [17, 15, 17],
      [17, 14, 17],
    ],
  );
  expect(far.station).toEqual({ block: [17, 14, 17], face: 0, heading: "+x", moving: false });
  expect(far.frame).toEqual(await frameFor(page, [1, 0, 0], [0, 0, -1]));
  expect(far.target).toEqual([17.5, 14.5, 16.805]);
  expect(far.fitted).toBe(true);
  expect(far.dust[1]).toBeGreaterThan(0);
  expect(far.dust[0]).toBeGreaterThan(near);
  await expect(line(page)).toHaveText("Playing · on the top of 17,14,17, facing +x");
  expect(await said(page)).toContain("Sent to the top of 17,14,17.");
  // the pad is dead through the hold, and then Up is refused, the near end's block beside
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(REFUSED);
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("1 leap");
  const route = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return { stations: c.stations, steps: c.steps };
  });
  expect(route.stations).toEqual([
    { cell: [17, 17, 17], face: 0 },
    { cell: [17, 16, 17], face: 0 },
    { cell: [17, 15, 17], face: 0 },
    { cell: [17, 14, 17], face: 0 },
  ]);
  // a leap between the two ends, though a roll could join them
  expect(route.steps).toEqual([{ k: 2, o: 0 }, { k: 2, o: 0 }, null]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("spikes kill the ball: the strip says so in red while the game's countdown runs, the verdict names the cause and Space starts the level again, and with Forgive pressed the ball is put back where it last rested instead", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; two blocks on, spikes
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await laid(page, [17, 15, 17], { kind: 0 });
  await faced(page, [17, 15, 17], 0, { type: 12 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await expect(page.locator("#chipLine")).toContainText("3 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const forgive = page.locator("#forgiveBtn");
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  await listening(page);
  // held on, the ball rolls onto the spikes and the countdown runs with the key
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText("On the spikes", { timeout: 10_000 });
  await expect(status(page)).toHaveClass(/dying/);
  await expect(status(page)).toHaveText(SPIKED, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).not.toHaveClass(/dying/);
  expect(await said(page)).toContain("On the spikes");
  await expect(say(page)).toHaveText(SPIKED);
  const over = await probe(page);
  expect(over.playing).toBe(true);
  expect(over.frame).toBeNull();
  expect(over.fitted).toBe(true);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  expect((await probe(page)).station).toEqual({
    block: [17, 17, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await forgive.click();
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(FORGIVEN, { timeout: 10_000 });
  await expect(status(page)).not.toHaveClass(/dying/);
  await expect(say(page)).toHaveText(FORGIVEN);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect((await probe(page)).frame).toEqual(IDENTITY);
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  // the toggle is kept for the visit
  await startPlay(page);
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("on fire the ball reddens: where it stands its pixels are redder on the whole than the untinted ball's on plain stone, and with Motion off nothing draws once it rests", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  const block = [17, 16, 17];
  const rolled = async () => {
    await startPlay(page);
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await probe(page)).station.block).toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    return fillAbout(page, await canvasAt(page, ballOver(block)));
  };
  const plain = await rolled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await laid(page, block, { kind: 1 });
  await expect
    .poll(() =>
      page.evaluate(async (c) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { cellKey }] = await Promise.all(
          ["viewer/state.js", "format/lattice.js"].map(at),
        );
        return state.idx.cells.get(cellKey(...c))?.v;
      }, block),
    )
    .toBe(1);
  const fire = await rolled();
  expect(await status(page).textContent()).toBe("");
  expect(fire[0], `red: ${fire} against ${plain}`).toBeGreaterThan(plain[0]);
  expect(fire[1], `green: ${fire} against ${plain}`).toBeLessThan(plain[1]);
  expect(fire[2], `blue: ${fire} against ${plain}`).toBeLessThan(plain[2]);
  expect(await drawn(page)).toBe(0);
  expect(errors).toEqual([]);
});

test.describe("with a touch screen", () => {
  test.use({ hasTouch: true });

  test("the pad shows and rolls the ball while its arrow is held, and a long press still selects", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await opened(page, { motion: false });
    await expect(page.locator("#pad")).toBeHidden();
    await startPlay(page);
    await expect(page.locator("#pad")).toBeVisible();
    await expect(page.locator("#padBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#padDown")).toBeHidden();
    const up = await page.locator('#pad [data-pad="up"]').boundingBox();
    expect(Math.min(up.width, up.height)).toBeGreaterThanOrEqual(44);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: up.x + up.width / 2, y: up.y + up.height / 2 }],
    });
    // the level's opening frames first, then a block in a quarter of a second, so the poll is quick
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual([17, 17, 17]);
    // held on, it rolls on past the next block
    await expect.poll(async () => (await probe(page)).station.block[1]).toBeLessThanOrEqual(16);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
    const rested = (await probe(page)).station.block;
    await page.waitForTimeout(400);
    expect((await probe(page)).station.block).toEqual(rested);
    await page.locator("#padBtn").click();
    await expect(page.locator("#pad")).toBeHidden();
    await hold(page, await top(page, [17, 12, 17]));
    await expect(page.locator("#detail")).toContainText("cell 17,12,17");
    expect((await probe(page)).playing).toBe(true);
    expect(errors).toEqual([]);
  });

  test.describe("at a phone's size", () => {
    test.use({ viewport: { width: 375, height: 700 }, isMobile: true });

    test("the ball is framed above the pad and the strip, whose line has a row of its own", async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await opened(page, { motion: false });
      await startPlay(page);
      await expect(page.locator("#pad")).toBeVisible();
      const spot = await anchor(page);
      const pad = await page.locator("#pad").boundingBox();
      const strip = await page.locator("#play").boundingBox();
      const lineBox = await page.locator("#playLine").boundingBox();
      const cv = await page.locator("#cv").boundingBox();
      expect(spot.y).toBeLessThan(Math.min(pad.y, strip.y) - 40);
      // a fifth below the middle of what the pad and the strip leave free, from the first frame
      expect(Math.abs(spot.y - cv.y - spot.free * 0.7)).toBeLessThan(1);
      expect(spot.x).toBeGreaterThan(40);
      expect(spot.x).toBeLessThan(375 - 40);
      expect(lineBox.width).toBeGreaterThan(strip.width * 0.8);
      expect(lineBox.height).toBeLessThan(45);
      // the game's pad has no Down, so the pad has no down arrow and is a row shorter until the
      // setting gives Down the turn about, when the ball is framed above the taller pad
      await expect(page.locator("#padDown")).toBeHidden();
      const up = await page.locator('#pad [data-pad="up"]').boundingBox();
      const jump = await page.locator("#padBall").boundingBox();
      const row = jump.y - up.y;
      await page.keyboard.press("s");
      await expect(page.locator("#settings")).toBeVisible();
      await page.locator("#turnAbout").click();
      await page.keyboard.press("Escape");
      await expect(page.locator("#settings")).toBeHidden();
      await expect(page.locator("#padDown")).toBeVisible();
      const taller = await page.locator("#pad").boundingBox();
      expect(taller.height - pad.height).toBe(row);
      const higher = await anchor(page);
      expect(higher.free).toBe(spot.free - row);
      expect(Math.abs(higher.y - cv.y - higher.free * 0.7)).toBeLessThan(1);
      // put away, the pad gives the ball its room back
      await page.locator("#padBtn").click();
      await expect(page.locator("#pad")).toBeHidden();
      const roomier = await anchor(page);
      expect(roomier.y).toBeGreaterThan(spot.y);
      expect(roomier.y).toBeLessThan(strip.y - 40);
      expect(errors).toEqual([]);
    });
  });
});
