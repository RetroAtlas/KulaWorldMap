import { test, expect } from "@playwright/test";
import {
  settle,
  still,
  trackErrors,
  drawn,
  textured,
  topPixels,
  gold,
  written,
} from "./helpers.js";

const LEVEL = "/#HIRO/0/45,35/fit/33";
// LEVEL 86: the start on a ring of blocks, a bouncy pill two blocks on across a gap and blocks two
// apart beyond it
const PILL_LEVEL = "/#FIELD/10/45,35/fit/33";
const PLAY_FILES = /\/js\/play\/(play|ball|dust|rules|world|drive|contact|hazards)\.js$/;
const TIME_UP = "TIME OUT! 0 points, 0 seconds left. Space or Enter starts the level again.";
const TIME_UP_PAD =
  "TIME OUT! 0 points, 0 seconds left. Space, Enter or a tap on the pad starts the level again.";
// on a level with no key the block under the ball is marked as the level opens
const TIME_UP_MARKED =
  "TIME OUT! 50 points, 0 seconds left. Space or Enter starts the level again.";
const LOST = /^FELL OFF! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;
const DONE =
  /^Out by the exit: the level is done\. 1500 points, \d+ seconds left\. Space or Enter starts the level again\.$/;
const SPIKED = /^SPIKED! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;
const ENDED = "The level has ended";
const FORGIVEN = "Forgiven: the ball would have been killed on the spikes.";
const FORGIVEN_FALL = "Forgiven: the ball would have fallen off the level.";
const LOST_BROKEN =
  /^FELL OFF! 50 points, 9\d seconds left\. Space or Enter starts the level again\.$/;
const BROKE = "17,16,17, top. The crumbling block breaks under the ball.";
const GONE = "The crumbling block at 17,16,17 is gone.";
const TAKEN = "Taken: Coin (bronze) on the top";
const SENDING = "The teleporter is sending the ball.";
const WEARING_OFF = "The sunglasses are wearing off: the invisible blocks are about to hide again.";
const RIDING = "The ball rides the platform.";
const LAUNCHED = "Launched by the boost button.";
const FOLLOWING = "Following the route; an arrow or Space takes the ball back.";
const FOLLOWING_PAD = "Following the route; an arrow, Space or the pad takes the ball back.";
const FOLLOWED = "The route is done: the ball stands at its last stop.";
const AT_LEAP = "The route leaps from here, which the ball cannot follow.";
const NO_FIRST_STOP = "The route's first stop has nothing to stand on.";
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
/** The red, green and blue the frame paints at a point of a block's top, with everything on
    that face taken off the record first. */
const bareTop = (page, [x, y, z]) =>
  page.evaluate(
    async ([x, y, z]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js", "format/lattice.js"].map(at),
      );
      const r = state.idx.records.get(cellKey(Math.floor(x), Math.floor(y), z))[0];
      const on = r.on;
      r.on = on.filter((o) => o.face !== 0);
      draw();
      r.on = on;
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
/** Wait for the strip's clock to pass `n` seconds, which proves the level ran frames meanwhile,
    a whole second of them for each past the first. */
const ticked = async (page, n = 1) => {
  for (let i = 0; i < n; i++) {
    const before = await seconds(page);
    await expect.poll(() => seconds(page)).not.toBe(before);
  }
};
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
/** Put `block` into the shown draft at `cell`, or take the block there out with null, through the
    model. */
const laid = (page, cell, block) =>
  page.evaluate(
    async ([cell, block]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { get, update }, { setBlock, removeBlock }] = await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
      );
      const id = state.lvl.draft;
      update(id, block ? setBlock(get(id).doc, cell, block) : removeBlock(get(id).doc, cell));
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
/** The height the ball is handed to the frame with, for its shadow, finite or null, and whether
    the frame last drawn left the block at `cell` out, on every animation frame until no ball is
    handed, the level having ended, or 8 s pass. */
const shadowed = (page, cell) =>
  page.evaluate(async (cell) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [P, { overlayWith }, { cellKey }] = await Promise.all(
      ["play/play.js", "viewer/draw/render.js", "format/lattice.js"].map(at),
    );
    const key = cellKey(...cell);
    let drew = true;
    overlayWith({
      under: () => {
        drew = false;
      },
      block: (ctx, c, home, k) => {
        if (k === key) drew = true;
      },
    });
    const out = [];
    const end = performance.now() + 8000;
    while (performance.now() < end) {
      const g = P.handed();
      if (!g) break;
      out.push({
        gone: !drew,
        height: Number.isFinite(g.height) ? g.height : null,
      });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return out;
  }, cell);
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
  // the frame the map asked for while Motion ran still lands after it is switched off
  if (!motion) await expect.poll(() => drawn(page, 2, 0)).toBe(0);
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
      "/js/play/drive.js",
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

test("the ball turns in place, turns about by Down only with the setting on, and is refused an edge beside a neighbour, which the strip leaves unsaid", async ({
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
  // LEVEL 1's ring: off its block to the -x there is nothing, and a block stands beside it, so
  // Up held until the clock ticks moves nothing, and the strip says nothing of it
  await page.keyboard.down("ArrowUp");
  await ticked(page);
  await page.keyboard.up("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 18, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
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
  // the frame drawn is the last the roll ran, the level's opening ones among them, the clock
  // having ticked once on each frame run, and no more while it rests
  const ran = await frameAt(page);
  expect(ran).toBeGreaterThan(18);
  await expect(clockLine(page)).toHaveText(`Time ${Math.floor((99 * 50 - ran - 1) / 50)}`);
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

/** Move the keyboard's focus to `button` as Tab does, stepping off it and back. */
const tabbedTo = async (page, button) => {
  await button.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
};

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
  await expect(line(page)).toHaveText(ENDED);
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
  // Enter on a strip button the keyboard has moved to works the button rather than starting the
  // level again, and the verdict names the pad while the pad shows
  const padBtn = page.locator("#padBtn");
  const padWas = await padBtn.getAttribute("aria-pressed");
  await tabbedTo(page, padBtn);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas === "true" ? "false" : "true");
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP : TIME_UP_PAD);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP_PAD : TIME_UP);
  await flipped(page, 1, 7);
  expect(await presses(page)).toEqual([[1, [7]]]);
  // Space starts the level again whatever has the focus
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
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

test("Enter starts the level again after a button was clicked, the sidebar's or the strip's, and is left to a strip button the keyboard has moved to, which Space is not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 2);
  await expect(page.locator("#chipLine")).toContainText("time 2");
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await expect(page.locator("#chipLine")).toContainText("2 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  const ended = async (verdict) => {
    await page.keyboard.down("ArrowUp");
    await expect(status(page)).toHaveText(verdict, { timeout: 10_000 });
    await page.keyboard.up("ArrowUp");
    await expect(line(page)).toHaveText(ENDED);
  };
  const started = async () => {
    await expect(status(page)).toHaveText("");
    await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
    await expect(clockLine(page)).toHaveText("Time 2");
  };
  // the sidebar's new button keeps the focus its click left it, and Enter starts the level again
  // rather than making a draft
  await ended(TIME_UP);
  await expect(page.locator("#draftNew")).toBeFocused();
  await page.keyboard.press("Enter");
  await started();
  await expect(page.locator("#chipLine")).toContainText("time 2");
  // so does a strip button clicked with the mouse, which Enter leaves as the click left it
  await ended(TIME_UP);
  const padBtn = page.locator("#padBtn");
  const padWas = await padBtn.getAttribute("aria-pressed");
  const padNow = padWas === "true" ? "false" : "true";
  await padBtn.click();
  await expect(padBtn).toHaveAttribute("aria-pressed", padNow);
  await expect(status(page)).toHaveText(padNow === "true" ? TIME_UP_PAD : TIME_UP);
  await expect(padBtn).toBeFocused();
  await page.keyboard.press("Enter");
  await started();
  await expect(padBtn).toHaveAttribute("aria-pressed", padNow);
  // a strip button Tab has moved to keeps Enter, which presses it, and the level stays ended
  await ended(padNow === "true" ? TIME_UP_PAD : TIME_UP);
  await tabbedTo(page, padBtn);
  await page.keyboard.press("Enter");
  await expect(padBtn).toHaveAttribute("aria-pressed", padWas);
  await expect(status(page)).toHaveText(padWas === "true" ? TIME_UP_PAD : TIME_UP);
  await expect(line(page)).toHaveText(ENDED);
  const forgive = page.locator("#forgiveBtn");
  await tabbedTo(page, forgive);
  await page.keyboard.press("Enter");
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press("Enter");
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
  await expect(line(page)).toHaveText(ENDED);
  await page.keyboard.press(" ");
  await started();
  await expect(forgive).toHaveAttribute("aria-pressed", "false");
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
  // the ending has let the frame go already, so the wait is for the view the ease lands on
  await expect
    .poll(async () => {
      const { playing, frame, cam, target } = await probe(page);
      return { playing, frame, cam, target };
    })
    .toEqual({ playing: false, frame: null, cam: before.cam, target: before.target });
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

/** Open Settings, click the switch `id` and close it, saying what its row says of the default. */
const toggled = async (page, id, def) => {
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator(`#${id}`).click();
  await expect(page.locator(`#settings label:has(#${id}) .def`)).toHaveText(def);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
};
/** Roll the ball a block on and wait for it to rest on `block`. */
const rolled = async (page, block) => {
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.block).toEqual(block);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
};

test("the way the ball has come is drawn under it only with its setting on, off by default, and Keep as the route stands either way", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const golden = async (c) => (await topPixels(page, c)).filter(gold).length;
  await opened(page, { motion: false });
  await startPlay(page);
  const keep = page.locator("#keepBtn");
  // the dust put away, so any gold over the block is the trail's, and two rolls, so the top behind
  // the ball carries the trail's latest roll, undimmed
  await toggled(page, "showDust", "on by default");
  await rolled(page, [17, 17, 17]);
  await rolled(page, [17, 16, 17]);
  const crossed = [17, 17, 17];
  expect(await golden(crossed)).toBe(0);
  await expect(keep).toBeEnabled();
  await toggled(page, "showTrail", "off by default");
  expect((await kept()).trail).toBe(true);
  expect(await golden(crossed)).toBeGreaterThan(50);
  await expect(keep).toBeEnabled();
  expect(await drawn(page)).toBe(0);
  await toggled(page, "showTrail", "");
  expect(await golden(crossed)).toBe(0);
  await keep.click();
  await expect(say(page)).toHaveText("The way the ball has come is now the route.");
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  expect(errors).toEqual([]);
});

test("the dust is born only with its setting on, on by default, and what is alive goes as it is put away", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await opened(page, { motion: false });
  await startPlay(page);
  expect(await dustAlive(page)).toBe(false);
  await rolled(page, [17, 17, 17]);
  expect(await dustAlive(page)).toBe(true);
  expect(await drawn(page)).toBe(0);
  await toggled(page, "showDust", "on by default");
  expect((await kept()).dust).toBe(false);
  expect(await dustAlive(page)).toBe(false);
  // over the coin's block, so its burst is held back as the travel's motes are
  await rolled(page, [17, 16, 17]);
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  expect(await dustAlive(page)).toBe(false);
  expect(await drawn(page)).toBe(0);
  await toggled(page, "showDust", "");
  await rolled(page, [17, 15, 17]);
  expect(await dustAlive(page)).toBe(true);
  expect(errors).toEqual([]);
});

/** Click the top of `c`, which with the planner on adds a stop there. */
const stopOn = async (page, c) => {
  const p = await top(page, c);
  await page.mouse.click(p.x, p.y);
};

test("Follow the route rolls the ball along the planned route to its last stop and says the route is done, from the last stop it starts again at the first, and an arrow takes the ball back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // the planner's two clicks: three rolls along -y to a stop, a turn and three along +x
  await page.keyboard.press("u");
  await stopOn(page, [17, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await stopOn(page, [20, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  await startPlay(page);
  await listening(page);
  const follow = page.locator("#followBtn");
  await expect(follow).toBeVisible();
  await expect(follow).toBeEnabled();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#keepBtn")).toBeDisabled();
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(FOLLOWING);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [50] })
    .toEqual([20, 15, 17]);
  await expect(status(page)).toHaveText(FOLLOWED);
  await expect(say(page)).toHaveText(FOLLOWED);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => said(page)).toContain(FOLLOWING);
  await expect.poll(() => said(page)).toContain("17,15,17, top");
  expect((await probe(page)).station).toEqual({
    block: [20, 15, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  // from the last stop the ball is put on the first and follows again, until an arrow takes it
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => said(page))
    .toContain(`The ball is put on the top of 17,18,17. ${FOLLOWING}`);
  await expect(status(page)).toHaveText("");
  await expect(line(page)).toContainText("facing -x", { timeout: 10_000 });
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  const taken = (await probe(page)).station.block;
  expect(taken[1]).toBeGreaterThanOrEqual(17);
  await page.waitForTimeout(400);
  expect((await probe(page)).station.block).toEqual(taken);
  expect(errors).toEqual([]);
});

test("the Follow line names the pad only while it shows, following the Pad button as it is pressed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // a route round the level, long enough to be followed through the checks
  await page.keyboard.press("u");
  await stopOn(page, [17, 15, 17]);
  await stopOn(page, [20, 15, 17]);
  await stopOn(page, [20, 18, 17]);
  await stopOn(page, [17, 18, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 5 stops");
  await startPlay(page);
  await listening(page);
  const padBtn = page.locator("#padBtn");
  await padBtn.click();
  await expect(page.locator("#pad")).toBeVisible();
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(status(page)).toHaveText(FOLLOWING_PAD);
  await expect.poll(() => said(page)).toContain(FOLLOWING_PAD);
  await padBtn.click();
  await expect(page.locator("#pad")).toBeHidden();
  await expect(status(page)).toHaveText(FOLLOWING);
  await padBtn.click();
  await expect(page.locator("#pad")).toBeVisible();
  await expect(status(page)).toHaveText(FOLLOWING_PAD);
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(status(page)).toHaveText("");
  expect(errors).toEqual([]);
});

test("following a route to its leap stops the ball there and says so, and with the ball off the route and the first stop's block gone Follow says there is nothing to stand on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a block beside the start's and another across a gap no roll crosses
  await laid(page, [18, 17, 17], { kind: 0 });
  await laid(page, [20, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await page.keyboard.press("w");
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await still(page);
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await page.keyboard.press("u");
  await stopOn(page, [18, 17, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 2 stops");
  await stopOn(page, [20, 17, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops · 1 leap");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  const follow = page.locator("#followBtn");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [50] })
    .toEqual([18, 17, 17]);
  await expect(status(page)).toHaveText(AT_LEAP);
  await expect(say(page)).toHaveText(AT_LEAP);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect((await probe(page)).station).toEqual({
    block: [18, 17, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  // off the route, round the edge onto the block's +x side, with the first stop's block taken out
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await probe(page)).station.face).toBe(1);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await laid(page, [17, 17, 17], null);
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await expect(follow).toBeVisible();
  await follow.click();
  await expect(status(page)).toHaveText(NO_FIRST_STOP);
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  expect((await probe(page)).station).toEqual({
    block: [18, 17, 17],
    face: 1,
    heading: "+z",
    moving: false,
  });
  expect(errors).toEqual([]);
});

test("the play strip ends short of the corner's widgets once Follow the route shows, its buttons wrapping rather than its line's words, so the corner's ball button can still be pressed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await page.keyboard.press("u");
  await stopOn(page, [17, 15, 17]);
  await stopOn(page, [20, 15, 17]);
  await expect(page.locator("#courseLine")).toHaveText("Route planner · 3 stops");
  await startPlay(page);
  await expect(page.locator("#followBtn")).toBeVisible();
  const strip = await page.locator("#play").boundingBox();
  const corner = await page.locator("#corner").boundingBox();
  expect(strip.x + strip.width).toBeLessThanOrEqual(corner.x);
  const lineBox = await page.locator("#playLine").boundingBox();
  expect(lineBox.height).toBeLessThan(30);
  expect(
    await page.evaluate(() => {
      const button = document.getElementById("playBtn");
      const r = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  ).toBe(true);
  await page.locator("#playBtn").click();
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a right click selects while playing, Esc clears the selection before it leaves, and the panel's Play from here, there with its setting on alone, moves the ball", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await opened(page, { motion: false });
  const side = await plusX(page, [17, 13, 17]);
  await page.mouse.click(side.x, side.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
  await expect(page.locator("#detail .put")).toHaveCount(0);
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator("#playFrom").click();
  await expect(page.locator("#settings label:has(#playFrom) .def")).toHaveText("off by default");
  await page.locator("#settings .x").click();
  await expect(page.locator("#settings")).toBeHidden();
  expect((await kept()).playfrom).toBe(true);
  // the panel on screen takes the button as the switch goes on
  const put = page.locator("#detail .put button", { hasText: "Play from here" });
  await expect(put).toHaveCount(1);
  await expect(page.locator("#detail")).toContainText("cell 17,13,17");
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
  await page.locator("#detail .put button", { hasText: "Play from here" }).click();
  await expect.poll(async () => (await probe(page)).station.block).toEqual([17, 14, 17]);
  expect((await probe(page)).playing).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  expect(errors).toEqual([]);
});

/** The clock face's type, as the strip of a marker writes it. */
const clockFace = (page) =>
  page.evaluate(async () => {
    const { motionTable } = await import(new URL("js/viewer/data.js", location.href).href);
    return String(motionTable().play.clock.face);
  });
/** How many markers one frame writes `text` into. */
const marked = async (page, text) => (await written(page)).filter((t) => t === text).length;
/** Whether the frame is handed a ball. */
const handed = (page) =>
  page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    return P.handed() !== null;
  });

test("playing from another block leaves the level one ball, a start on a clock showing the clock alone, and the start's ball is back once the level has ended", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  await timed(page, 1);
  await expect(page.locator("#chipLine")).toContainText("time 1");
  await laid(page, [18, 17, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await faced(page, [17, 17, 17], 0, { type: 29, facing: 3 });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { startsOf }] = await Promise.all(
          ["viewer/state.js", "viewer/data.js"].map(at),
        );
        return startsOf(state.lvl).map((s) => s.type);
      }),
    )
    .toEqual([29]);
  // with markers in place of models a ball is its type written once, so the balls can be counted
  for (const [key, id] of [
    ["t", "#showSkins"],
    ["d", "#showModels"],
    ["v", "#showMotion"],
  ]) {
    await page.keyboard.press(key);
    await expect(page.locator(id)).not.toBeChecked();
  }
  const clock = await clockFace(page);
  const start = [17, 17, 17];
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(0);
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
    P.playAt({ x: 18, y: 17, z: 17, face: 0 });
  });
  await expect(page.locator("#play")).toBeVisible();
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: [18, 17, 17], face: 0, moving: false }),
  );
  expect(await handed(page)).toBe(true);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(1);
  const over = await top(page, start);
  await page.mouse.click(over.x, over.y, { button: "right" });
  await expect(page.locator("#detail")).toContainText("Start on a clock");
  await page.keyboard.press("Escape");
  await expect(page.locator("#detail")).toBeHidden();
  await page.mouse.move(2, 2);
  await page.keyboard.down("ArrowLeft");
  await expect(status(page)).toHaveText(/^TIME OUT!/, { timeout: 10_000 });
  await page.keyboard.up("ArrowLeft");
  expect(await handed(page)).toBe(false);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(0);
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  expect((await probe(page)).station).toEqual(
    expect.objectContaining({ block: start, face: 0, moving: false }),
  );
  expect(await handed(page)).toBe(true);
  expect(await marked(page, "29")).toBe(1);
  expect(await marked(page, clock)).toBe(1);
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
  // the level's opening frames first, then the hop, so the poll is quick
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
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

test("the shadow the game paints into a coin's face goes with the coin as the ball takes it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  // the shadow is the face's texture, so the textures are put back on
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await textured(page);
  await startPlay(page);
  const coin = [17, 16, 17];
  // clear of the face's middle, which the trail would cover
  const face = [coin[0] + 0.3, coin[1] + 0.5, coin[2]];
  expect(await pixelAt(page, face)).not.toEqual(await bareTop(page, face));
  for (const block of [[17, 17, 17], coin, [17, 15, 17]]) {
    await page.keyboard.press("ArrowUp");
    await expect
      .poll(async () => (await probe(page)).station.block, { intervals: [25] })
      .toEqual(block);
    await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  }
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  expect(await pixelAt(page, face)).toEqual(await bareTop(page, face));
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
  // the level's opening frames first, then the hop, so the poll is quick
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
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
  await expect
    .poll(() => said(page))
    .toContain("17,16,17, top. Switch thrown: the yellow circuit turned over.");
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
  await expect.poll(() => said(page)).toContain("Sent to the top of 17,14,17.");
  // the pad is dead through the hold, and then Up is refused, the near end's block beside, and
  // the strip says nothing of it: two seconds of the clock, a whole one of frames past the hold,
  // and the ball has not moved
  await page.keyboard.press("ArrowUp");
  await ticked(page, 2);
  expect((await probe(page)).station).toEqual({
    block: [17, 14, 17],
    face: 0,
    heading: "+x",
    moving: false,
  });
  expect(await status(page).textContent()).toBe("");
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

test("spikes kill the ball: the strip says so in red while the game's countdown runs, the verdict names the cause and Space starts the level again, and with Forgive pressed the ball is put back where it last rested instead, from the spikes and from a fall alike", async ({
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
  await frozen(page);
  // held on, the ball rolls onto the spikes and the countdown runs with the key, the strip read on
  // every game frame, as the countdown can begin and end within one drawn frame
  await page.keyboard.down("ArrowUp");
  const shown = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const el = document.getElementById("playStatus");
    const out = [];
    let dying = false;
    for (let i = 0; i < 600; i++) {
      window.__step(1000 / motionTable().hz);
      draw();
      const now = [el.textContent, el.classList.contains("dying")];
      if (now.join() !== out.at(-1)?.join()) out.push(now);
      if (now[1]) dying = true;
      else if (dying) break;
    }
    return out;
  });
  await page.evaluate(() => window.__thaw());
  await page.keyboard.up("ArrowUp");
  expect(shown.slice(-2)).toEqual([
    ["On the spikes", true],
    [expect.stringMatching(SPIKED), false],
  ]);
  await expect.poll(() => said(page)).toContain("On the spikes");
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
  // a jump off the block's free side falls off the level, forgiven the same way: the ball comes
  // back to the rest it jumped from, facing as it did
  await page.keyboard.press("ArrowLeft");
  await expect(line(page)).toContainText("facing -x");
  // Up held until the fall, so that whichever frame reads Space reads Up with it
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText(FORGIVEN_FALL, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  await expect(say(page)).toHaveText(FORGIVEN_FALL);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-x",
    moving: false,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  // the toggle is kept for the visit
  await startPlay(page);
  await expect(forgive).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("ice slides the ball on over every block to the first that is not ice, and an arrow holds it from rolling off any way but its own, the strip saying so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; three ice blocks on, then a stone block
  // carrying an arrow that points back the way the ball comes
  await faced(page, [17, 17, 17], 1, { type: 31 });
  for (const cell of [
    [17, 16, 17],
    [17, 15, 17],
    [17, 14, 17],
  ])
    await laid(page, cell, { kind: 2 });
  await laid(page, [17, 13, 17], { kind: 0 });
  await faced(page, [17, 13, 17], 0, { type: 28, facing: 1 });
  await expect(page.locator("#chipLine")).toContainText("5 blocks");
  await expect(page.locator("#chipLine")).toContainText("3 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  // one tap of Up, and the slide carries the ball over the ice to the arrow's block
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 13, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  // the way it has come passed over every ice block
  await page.locator("#keepBtn").click();
  await expect(page.locator("#courseLine")).toContainText("2 stops");
  const stations = await page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    return current().stations;
  });
  expect(stations).toEqual(
    [
      [17, 17, 17],
      [17, 16, 17],
      [17, 15, 17],
      [17, 14, 17],
      [17, 13, 17],
    ].map((cell) => ({ cell, face: 0 })),
  );
  // against the arrow Up moves nothing and the strip says why, while turning in place is allowed,
  // two quarter turns bringing the ball about
  await page.keyboard.press("ArrowUp");
  await expect(status(page)).toHaveText(
    "The ball cannot roll off here: the arrow points another way.",
  );
  expect((await probe(page)).station).toEqual({
    block: [17, 13, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("-x");
  await expect(status(page)).toHaveText("");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await probe(page)).station.heading).toBe("+y");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // along the arrow's way the ball rolls off, and the ice slides it back to the start's block
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 17, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
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

test("a crumbling block breaks under the ball, scoring, and is gone a third of a second later, out of the frame, the ball falling with it and casting no shadow from the frame the block goes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a crumbling block on, with nothing below it
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 6 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  // a point of the block's top that the ball and its shadow leave clear
  const corner = [17.15, 16.15, 17];
  const stood = await pixelAt(page, corner);
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // with Motion on the level runs at rest, so the block goes while the ball stands on it, and
  // the ball stands a frame or two over the gone block before the game drops it
  const sampled = shadowed(page, [17, 16, 17]);
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 16, 17]);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  expect(await status(page).textContent()).toBe("");
  await expect.poll(() => pixelAt(page, corner), { intervals: [25] }).not.toEqual(stood);
  await expect(status(page)).toHaveText(LOST_BROKEN, { timeout: 10_000 });
  await expect.poll(() => said(page)).toContain(BROKE);
  await expect.poll(() => said(page)).toContain(GONE);
  const frames = await sampled;
  const gone = frames.findIndex((f) => f.gone);
  expect(gone).toBeGreaterThan(0);
  expect(frames.slice(0, gone).every((f) => f.height !== null)).toBe(true);
  expect(frames.slice(gone).every((f) => f.height === null)).toBe(true);
  expect(errors).toEqual([]);
});

test("a vanishing block drops the ball as its cycle takes it out of the lattice, and the ball lands on the block below", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a vanishing block on that stands as the
  // level opens, and a block a gap below it
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 7, phase: 2 });
  await laid(page, [17, 16, 19], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 16, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect(await status(page).textContent()).toBe("");
  // the level runs at rest, and the block goes from under the ball as its cycle has it
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 16, 19]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 19],
    face: 0,
    heading: "-y",
    moving: false,
  });
  expect(await frameAt(page)).toBeGreaterThan(100);
  await expect(say(page)).toHaveText("17,16,19, top");
  expect(errors).toEqual([]);
});

test("a lone crumbling block, reached by a jump, goes with a burst of dust where it stood, drawn over the nearest block the frame still draws", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a crumbling block a jump on, with nothing
  // beside it or below it
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 15, 17], { kind: 6 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // Up held past the level's opening, whose frames sample it as the game's frames do, until the jump
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await page.keyboard.up("ArrowUp");
  await expect
    .poll(async () => (await probe(page)).station.block, { intervals: [25] })
    .toEqual([17, 15, 17]);
  await expect(page.locator("#playPoints")).toHaveText("50 points");
  // the gone block's cell is drawn no longer, so its dust is drawn over the start's block, the
  // only other one
  await expect.poll(() => dustOver(page, [17, 17, 17]), { intervals: [25] }).toBeGreaterThan(0);
  await expect.poll(() => said(page)).toContain("The crumbling block at 17,15,17 is gone.");
  await expect(status(page)).toHaveText(LOST_BROKEN, { timeout: 10_000 });
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
    // a touch leaves no hover look behind, on the arrow or on the strip's button
    const border = (sel) => page.locator(sel).evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(await border('#pad [data-pad="up"]')).toBe(await border('#pad [data-pad="left"]'));
    await page.locator("#padBtn").tap();
    await expect(page.locator("#pad")).toBeHidden();
    expect(await border("#padBtn")).toBe(await border("#forgiveBtn"));
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

/** The depth the frame is handed for the ball and the depth of the platform's body cell under the
    ball's centre, each as the frame last drew them; a cell sorts at its corner. */
const rideDepths = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ depth }, { draw, overlayWith }, P, { FACE_NORMAL }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/render.js", "play/play.js", "format/lattice.js"].map(at),
    );
    const bodies = [];
    let drawing = true;
    overlayWith({
      block: (ctx, c) => {
        if (drawing && c.body) bodies.push([c.x, c.y, c.z]);
      },
    });
    draw();
    drawing = false;
    const g = P.handed();
    const n = FACE_NORMAL[g.w.face];
    const centre = [g.w.c.x, g.w.c.y, g.w.c.z].map((v, i) => v + 0.5 + 0.5 * n[i] + g.offset[i]);
    const under = bodies.find((b) =>
      b.every((v, i) => n[i] !== 0 || Math.abs(centre[i] - v - 0.5) < 0.5),
    );
    return { ball: g.depth, cell: under ? depth(...under) : null };
  });

test("a jump onto a moving platform rides it: the strip says so, the ball stands where the platform has carried it, the station follows the platform to and fro, and the ball sorts nearer than the body cell under it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a platform three blocks long runs a block
  // along x two blocks before the start, so the cell a jump comes down on is always under it
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [16, 15, 17], { kind: 5, far: [17, 15, 17], length: 3, speed: 30 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  // Up held past the level's opening, whose frames sample it as the game's frames do, and the tap of
  // Space kept for the first frame that reads the pad, which jumps the ball from rest
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await expect.poll(async () => (await probe(page)).station.moving, { intervals: [25] }).toBe(true);
  await page.keyboard.up("ArrowUp");
  await expect(status(page)).toHaveText(RIDING, { timeout: 5000 });
  await expect(say(page)).toHaveText(`17,15,17, top. ${RIDING}`);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // the platform goes back to its cell and comes again, the ball standing on it meanwhile
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([16, 15, 17]);
  await expect(line(page)).toHaveText("Playing · on the top of 16,15,17, facing -y");
  await expect(status(page)).toHaveText(RIDING);
  const carried = await probe(page);
  expect(carried.station.moving).toBe(false);
  expect(carried.target[1]).toBeCloseTo(15.5, 1);
  expect(carried.target[0]).toBeLessThan(17.5);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 15, 17]);
  // facing +y, the camera behind it, the ball must sort nearer than the body cell under it, which
  // is drawn off its lattice cell, or the cell's top paints over the ball
  for (const heading of ["+x", "+y"]) {
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await station(page)).heading).toBe(heading);
    await expect.poll(async () => (await station(page)).moving).toBe(false);
  }
  await expect(status(page)).toHaveText(RIDING);
  const depths = await rideDepths(page);
  expect(depths.cell).not.toBeNull();
  expect(depths.ball).toBeLessThan(depths.cell);
  expect(errors).toEqual([]);
});

test("a boost button launches the ball three blocks on, and a landing on another launches it again on the frame after, the strip and the live region saying so and dust rising at the launch", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; a row of blocks with a boost button two on
  // and another three past it, so the first launch comes down on the second
  await faced(page, [17, 17, 17], 1, { type: 31 });
  for (let y = 16; y >= 9; y--) await laid(page, [17, y, 17], { kind: 0 });
  await faced(page, [17, 15, 17], 0, { type: 10 });
  await faced(page, [17, 12, 17], 0, { type: 10 });
  await expect(page.locator("#chipLine")).toContainText("9 blocks");
  await expect(page.locator("#chipLine")).toContainText("4 objects");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  // held on until the strip says the ball is launched, which it does through the flight
  await page.keyboard.down("ArrowUp");
  await expect(status(page)).toHaveText(LAUNCHED, { timeout: 10_000 });
  await page.keyboard.up("ArrowUp");
  expect(await dustOver(page, [17, 15, 17])).toBeGreaterThan(0);
  await expect
    .poll(async () => (await probe(page)).station.block, { timeout: 10_000, intervals: [25] })
    .toEqual([17, 9, 17]);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await expect(status(page)).toHaveText("");
  await expect(line(page)).toHaveText("Playing · on the top of 17,9,17, facing -y");
  await expect.poll(async () => (await said(page)).filter((t) => t === LAUNCHED)).toHaveLength(2);
  await expect.poll(() => said(page)).toContain(`17,12,17, top. ${LAUNCHED}`);
  await expect.poll(() => said(page)).toContain(`17,9,17, top. ${LAUNCHED}`);
  expect(errors).toEqual([]);
});

/** Hold the page's clock still and draw on it, so the level runs only as `stepped` steps it. */
const frozen = (page) =>
  page.evaluate(async () => {
    const real = performance.now.bind(performance);
    let now = real();
    performance.now = () => now;
    // a hair over, as on the held clock a frame's milliseconds can come to a hair under a frame
    window.__step = (ms) => {
      now += ms + 1e-6;
    };
    window.__thaw = () => {
      performance.now = real;
    };
    (await import(new URL("js/viewer/draw/render.js", location.href).href)).draw();
  });
/** Step the frozen level a game frame at a time through `frames` frames, reading on each the frame
    drawn, whether the frame says every invisible block is seen, the strip's status and a hash of
    the pixels of the tops of `near` and `far`. */
const stepped = (page, frames, near, far) =>
  page.evaluate(
    async ([frames, near, far]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw, clock, overlayWith }, { motionTable }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/render.js", "viewer/data.js"].map(at),
      );
      let seen = null;
      overlayWith({
        block: (ctx, c, home, key, ghost, scene) => {
          seen = scene.seeing;
        },
      });
      const g = document.getElementById("cv").getContext("2d");
      const k = state.view.dpr;
      const top = ([x, y, z]) => {
        const quad = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([dx, dy]) => screen(x + dx, y + dy, z).map((v) => v * k));
        const xs = quad.map((p) => p[0]);
        const ys = quad.map((p) => p[1]);
        const x0 = Math.floor(Math.min(...xs));
        const y0 = Math.floor(Math.min(...ys));
        const w = Math.ceil(Math.max(...xs)) - x0 + 1;
        const h = Math.ceil(Math.max(...ys)) - y0 + 1;
        const d = g.getImageData(x0, y0, w, h).data;
        const inside = (px, py) => {
          let turn = 0;
          for (let i = 0; i < 4; i++) {
            const [ax, ay] = quad[i];
            const [bx, by] = quad[(i + 1) % 4];
            const s = Math.sign((bx - ax) * (py - ay) - (by - ay) * (px - ax));
            if (s && turn && s !== turn) return false;
            turn ||= s;
          }
          return true;
        };
        let hash = 2166136261;
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++) {
            if (!inside(x0 + i + 0.5, y0 + j + 0.5)) continue;
            const o = (j * w + i) * 4;
            for (let ch = 0; ch < 3; ch++) hash = Math.imul(hash ^ d[o + ch], 16777619);
          }
        return hash >>> 0;
      };
      const out = [];
      const status = document.getElementById("playStatus");
      for (let i = 0; i < frames; i++) {
        window.__step(1000 / motionTable().hz);
        draw();
        out.push({
          frame: clock(),
          seeing: seen,
          status: status.textContent,
          near: top(near),
          far: top(far),
        });
      }
      return out;
    },
    [frames, near, far],
  );

test("the sunglasses show every invisible block as the game does, the ball's light off them while they last, then blink them as they wear off, the strip saying so, and the ball's light alone shows them again", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; the sunglasses on the block ahead, an
  // invisible block within the ball's light once it stands there and another well out of it,
  // whose shimmer runs in the same phase, since the game spreads it by the cell's position
  const near = [18, 15, 17];
  const far = [20, 13, 17];
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await faced(page, [17, 16, 17], 0, { type: 38 });
  await laid(page, near, { kind: 3 });
  await laid(page, far, { kind: 3 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await textured(page);
  const table = await page.evaluate(async () => {
    const { motionTable, skinsTable } = await import(
      new URL("js/viewer/data.js", location.href).href
    );
    const { frames, level } = skinsTable().cycles.invisible;
    return {
      hz: motionTable().hz,
      lasts: motionTable().types["38"].lasts,
      cycle: [frames.length, level.length],
    };
  });
  const { word, step, blink } = table.lasts;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // the shimmer and the pulse come round together once in this many frames
  const period = (table.cycle[0] * table.cycle[1]) / gcd(...table.cycle);
  const standing = Math.floor(word / step) + 1;
  const blinking = blink.times * blink.frames;
  // the frames the view takes to settle behind the ball once it has stopped
  const settled = 2 * table.hz;
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect.poll(() => frameAt(page)).toBeGreaterThan(settled);
  await frozen(page);
  await page.keyboard.press("ArrowUp");
  const run = await stepped(page, settled + standing + blinking + period, near, far);
  await page.evaluate(() => window.__thaw());
  await expect(page.locator("#playPoints")).toHaveText("500 points");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  const taken = run.findIndex((r) => r.seeing);
  expect(taken).toBeGreaterThan(0);
  expect(taken).toBeLessThan(settled);
  const after = run.slice(taken);
  expect(after.slice(0, standing).every((r) => r.seeing)).toBe(true);
  const spells = Array.from({ length: blink.times }, (_, s) =>
    Array(blink.frames).fill(s % 2 === 1),
  ).flat();
  expect(after.slice(standing, standing + blinking).map((r) => r.seeing)).toEqual(spells);
  expect(after.slice(standing + blinking).every((r) => !r.seeing)).toBe(true);
  expect(after.slice(0, standing).every((r) => r.status === "")).toBe(true);
  expect(after.slice(standing, standing + blinking).every((r) => r.status === WEARING_OFF)).toBe(
    true,
  );
  expect(after.slice(standing + blinking).every((r) => r.status === "")).toBe(true);
  // once the view has settled, a top's pixels at a phase of the shimmer are the same on every
  // frame of the same state: the look every face takes while the blocks are seen, read off the
  // word's frames, and the light's, read off the frames after the blink
  const phase = (r) => r.frame % period;
  const look = new Map();
  const unlit = new Map();
  for (const r of after.slice(settled, standing)) {
    look.set(phase(r), r.near);
    unlit.set(phase(r), r.far);
  }
  const lit = new Map();
  for (const r of after.slice(standing + blinking)) lit.set(phase(r), r.near);
  expect(look.size).toBe(period);
  expect(lit.size).toBe(period);
  const odd = after
    .slice(settled)
    .filter(
      (r) => r.far !== unlit.get(phase(r)) || r.near !== (r.seeing ? look : lit).get(phase(r)),
    )
    .map((r) => r.frame);
  expect(odd).toEqual([]);
  // and the two states look different, the ball's light reaching the near block's corner
  expect([...look.keys()].filter((p) => look.get(p) !== lit.get(p)).length).toBeGreaterThan(
    period / 2,
  );
  expect(errors).toEqual([]);
});

/** Run the frozen level `n` game frames on, drawing each. */
const onward = (page, n) =>
  page.evaluate(async (n) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    for (let i = 0; i < n; i++) {
      window.__step(1000 / motionTable().hz);
      draw();
    }
  }, n);

for (const motion of [false, true])
  test(`two taps of Left turn the ball twice where the second comes before the frame after the one that read the first, with Motion ${motion ? "on" : "off"}`, async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await opened(page, { motion });
    await startPlay(page);
    // past the level's opening, which holds the pad dead
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await station(page)).heading).toBe("+x");
    await expect.poll(async () => (await station(page)).moving).toBe(false);
    await frozen(page);
    await page.keyboard.press("ArrowLeft");
    await onward(page, 1);
    expect((await station(page)).heading).toBe("-y");
    await page.keyboard.press("ArrowLeft");
    await onward(page, 40);
    expect((await station(page)).heading).toBe("-x");
    expect(errors).toEqual([]);
  });

test("a key pressed while the level runs takes no time from it: every frame the clock owes is run", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await startPlay(page);
  await expect.poll(async () => (await probe(page)).frame).toEqual(IDENTITY);
  await frozen(page);
  const ran = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const frame = 1000 / motionTable().hz;
    const key = (type) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowLeft", bubbles: true }));
    draw();
    const from = clock();
    for (let i = 0; i < 10; i++) {
      window.__step(frame / 2);
      key("keydown");
      key("keyup");
      window.__step(frame / 2);
      draw();
    }
    return clock() - from;
  });
  expect(ran).toBe(10);
  expect(errors).toEqual([]);
});

test("every sentence the level says has an animation frame of its own, however many game frames one drawn frame runs", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect.poll(() => frameAt(page)).toBeGreaterThan(30);
  await listening(page);
  await frozen(page);
  // two taps of Up round an edge to the next face's middle, drawn a frame at a time, then batched
  const spoken = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const region = document.getElementById("say");
    const tap = () => {
      for (const type of ["keydown", "keyup"])
        document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowUp", bubbles: true }));
    };
    const run = async (frames) => {
      window.__step((frames * 1000) / motionTable().hz);
      draw();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    };
    tap();
    const start = clock();
    const frames = [];
    while (clock() - start < 60) {
      const before = region.textContent;
      await run(1);
      if (region.textContent !== before) frames.push(clock() - start);
    }
    tap();
    const again = clock();
    while (clock() - again < frames[0] - 1) await run(1);
    const from = clock() - again;
    await run(frames[1] - from);
    const batched = { from, to: clock() - again };
    for (let f = 0; f < 60; f++) await run(1);
    return { frames, batched };
  });
  expect(spoken.frames).toHaveLength(2);
  expect(spoken.batched.from).toBeLessThan(spoken.frames[0]);
  expect(spoken.batched.to).toBeGreaterThanOrEqual(spoken.frames[1]);
  await expect
    .poll(() => said(page))
    .toEqual([
      "-y side of 17,17,17, now underfoot",
      "17,17,17, -y side",
      "underside of 17,17,17, now underfoot",
      "17,17,17, underside",
    ]);
  expect(errors).toEqual([]);
});

test("with Motion off the ball stands where a move brought it on the game frame it came, however many game frames one drawn frame runs", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await frozen(page);
  // Up held from the level's opening, a frame drawn for each game frame, or with `batch` one drawn
  // frame for the game frames from its `from` to its `to`
  const roll = (batch) =>
    page.evaluate(async (batch) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw, clock }, { motionTable }, P] = await Promise.all(
        ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
      );
      const key = (type) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: "ArrowUp", bubbles: true }));
      const run = (frames) => {
        window.__step((frames * 1000) / motionTable().hz);
        draw();
      };
      const start = clock();
      const seen = () => ({
        frame: clock() - start,
        block: P.station().block,
        line: document.getElementById("playLine").textContent,
        offset: P.handed().offset,
      });
      key("keydown");
      const states = [];
      if (batch) {
        while (clock() - start < batch.from) run(1);
        run(batch.to - batch.from);
        states.push(seen());
      } else
        while (clock() - start < 90) {
          run(1);
          states.push(seen());
        }
      key("keyup");
      return states;
    }, batch);
  const single = await roll(null);
  const on = (f) => single.find((s) => s.frame === f);
  const came = single.find((s) => s.block.join() !== single[0].block.join()).frame;
  const left = single.find((s) => s.frame > came && s.block.join() !== on(came).block.join());
  await page.keyboard.press("Escape");
  await startPlay(page);
  const [batched] = await roll({ from: came - 2, to: came + 10 });
  expect(left?.frame ?? Infinity).toBeGreaterThan(came + 10);
  expect(batched).toEqual(on(came + 10));
  expect(errors).toEqual([]);
});

test("the bouncy pill bounds the ball as the game does: taken with the keys released it hops where it came down, up pressed at the landing, leaves the ground two blocks on from the hop's end, bound after bound, and with up released it hops where it is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(PILL_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,23,17, facing -y");
  await listening(page);
  await frozen(page);
  // a gap ahead with blocks beside refuses the roll, so up held and Space jump the ball onto the
  // pill's block, up released as the jump starts, so the pill is taken with the latch clear, and
  // pressed again on the frame the ball comes down; then released on the frame it comes down two
  // bounds on
  const { bounds, hops } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const run = () => {
      window.__step(1000 / motionTable().hz);
      draw();
    };
    const seen = () => {
      const s = P.station();
      const g = P.handed();
      return { block: s.block, moving: s.moving, height: g.height, offset: g.offset };
    };
    key("keydown", "ArrowUp");
    key("keydown", " ");
    key("keyup", " ");
    const bounds = [];
    let released = false;
    let pressed = false;
    for (let f = 0; f < 400; f++) {
      run();
      const s = seen();
      bounds.push(s);
      if (!released && s.moving) {
        key("keyup", "ArrowUp");
        released = true;
      } else if (released && !pressed && !s.moving && s.block.join() === "19,21,17") {
        key("keydown", "ArrowUp");
        pressed = true;
      }
      if (s.block.join() === "19,17,17") break;
    }
    key("keyup", "ArrowUp");
    const hops = [];
    for (let f = 0; f < 120; f++) {
      run();
      hops.push(seen());
    }
    return { bounds, hops };
  });
  expect(await said(page)).toContain("Bouncy pill taken.");
  const rest = bounds[0].height;
  const blocks = bounds.map((s) => s.block.join());
  expect(blocks.filter((b, i) => i === 0 || b !== blocks[i - 1])).toEqual([
    "19,23,17",
    "19,21,17",
    "19,19,17",
    "19,17,17",
  ]);
  const over = (block) => bounds.filter((s) => s.block.join() === block);
  const stops = (on) => on.map((s, i) => (s.moving ? -1 : i)).filter((i) => i >= 0);
  const flat = (s) => s.offset.slice(0, 2).map((v) => Math.round(v * 1000) / 1000 + 0);
  const aloft = (frames) => frames.filter((s) => s.height > rest).length > frames.length / 2;
  // down on the pill's block's middle at rest, and the first leave from it a hop, in the air
  // over the middle until it comes down there again, at rest for the one frame of its end, and
  // off two blocks on only from the frame after that, the jump's first row along the ground
  const pill = over("19,21,17");
  const stopped = stops(pill);
  expect(stopped.length).toBe(2);
  expect(stopped[0]).toBe(0);
  const ended = stopped[1];
  expect(pill[0].height).toBe(rest);
  expect(flat(pill[0])).toEqual([0, 0]);
  const hop = pill.slice(1, ended);
  expect(hop.length).toBeGreaterThan(1);
  expect(hop.every((s) => flat(s).every((v) => v === 0))).toBe(true);
  expect(aloft(hop)).toBe(true);
  expect(flat(pill[ended])).toEqual([0, 0]);
  const bound = pill.slice(ended + 1);
  expect(bound.length).toBeGreaterThan(1);
  expect(aloft(bound)).toBe(true);
  // down on the next block's middle at rest, up held past the latch's count by then, and off it
  // from the frame after with no hop first
  const next = over("19,19,17");
  expect(stops(next)).toEqual([0]);
  expect(next[0].height).toBe(rest);
  expect(flat(next[0])).toEqual([0, 0]);
  expect(aloft(next.slice(1))).toBe(true);
  expect(bounds.at(-1).moving).toBe(false);
  // hop after hop, each at rest for the one frame of its end, on the block the ball came down on
  expect(hops.every((s) => s.block.join() === "19,17,17")).toBe(true);
  expect(hops.filter((s) => !s.moving).length).toBeGreaterThanOrEqual(3);
  expect(aloft(hops)).toBe(true);
  expect(errors).toEqual([]);
});
