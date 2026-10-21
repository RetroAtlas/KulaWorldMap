import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
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
// HIDDEN 3: the start two blocks before a row of four corkscrews, the first of them at the top of
// its bounce as the level opens
const CORKSCREW_LEVEL = "/#INCA/18/45,35/fit/33";
// LEVEL 43: the start at one end of a row of three blocks, a lethargy pill on the block at the
// other end, to the ball's left as the level opens
const LETHARGY_LEVEL = "/#INCA/12/45,35/fit/33";
// HIDDEN 1: a field of blocks two apart, the start on the one nearest the player, so a jump to
// either side comes down on nothing
const HIDDEN_LEVEL = "/#HIRO/18/45,35/fit/33";
// SIMON 1: the start on the top row of a ring, facing along it, with nothing two blocks on
const SIMON_LEVEL = "/#COPYCAT/0/45,35/fit/33";
const SIMON_PACK = "/HIRO/COPYCAT.PAK";
// the points are the layout's, a pickup standing on the block the first move rolls onto
const ROUND_DONE =
  "^Well Done! The round is done\\. \\d+ points, \\d+ seconds left\\. Space or Enter starts the level again\\.$";
const AXES = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};
// LEVEL 3: the fruit on the top of 15,15,17, of the common type, which the map draws as the third
// of the five by the level's number
const FRUIT_LEVEL = "/#HIRO/2/45,35/fit/33";
const FRUIT = [15, 15, 17];
const FRUIT_TYPE = 46;
// BONUS 1: a level with no key, which the game opens from white
const BONUS_LEVEL = "/#HIRO/15/45,35/fit/33";
const PLAY_FILES = /\/js\/play\/(play|ball|dust|effects|rules|world|drive|contact|hazards)\.js$/;
const TIME_UP = "TIME OUT! 0 points, 0 seconds left. Space or Enter starts the level again.";
const TIME_UP_PAD =
  "TIME OUT! 0 points, 0 seconds left. Space, Enter or a tap on the pad starts the level again.";
const LOST = /^FELL OFF! 0 points, 9\d seconds left\. Space or Enter starts the level again\.$/;
const DONE =
  /^Out by the exit: the level is done\. 1500 points, \d+ seconds left\. 1500 points banked, 1500 points in all\. Space or Enter goes on to LEVEL 2\.$/;
// the same way out with no run on, as there is none until Settings turns one on
const DONE_ALONE =
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
/** The ball's body as handed to the frame and in the world, rounded. */
const bodyHanded = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [P, { faceAxes, times }, { FACE_NORMAL }] = await Promise.all(
      ["play/play.js", "viewer/motion.js", "format/lattice.js"].map(at),
    );
    const round = (v) => Math.round(v * 1000) / 1000 + 0;
    const g = P.handed();
    const laid = faceAxes(FACE_NORMAL[g.w.face], g.fwd);
    return {
      body: g.body.map((row) => row.map(round)),
      world: times(laid, g.body).map((row) => row.map(round)),
    };
  });
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

async function opened(page, { motion = true, hash = LEVEL } = {}) {
  await page.goto(hash);
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
      "/js/play/effects.js",
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

test("the ball turns in place, Down moves nothing and Settings has no switch for it, and it is refused an edge beside a neighbour, which the strip leaves unsaid", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await startPlay(page);
  await expect(line(page)).toContainText("facing -y");
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +x");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  // the game's pad has no Down, so Down moves nothing, and play still takes the key, so it does
  // not pan the view off the ball
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(200);
  await expect(line(page)).toContainText("facing +x");
  expect((await probe(page)).station.moving).toBe(false);
  expect((await probe(page)).fitted).toBe(true);
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await expect(page.locator("#turnAbout")).toHaveCount(0);
  await expect(page.locator("#settings")).not.toContainText("Down");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  // an about turn is two quarter turns, as on the game's pad
  await page.keyboard.press("ArrowRight");
  await expect(line(page)).toContainText("facing +y");
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
  await page.keyboard.press("ArrowRight");
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
  // the block under the ball scored as the level opened, and a death on a level with no key
  // scores nothing, run or no run
  await expect
    .poll(() => status(page).textContent(), { timeout: 10_000, intervals: [50] })
    .toBe(TIME_UP);
  const since = Date.now();
  const over = await probe(page);
  expect(over.frame).toBeNull();
  // a level with no key swings the quicker way: within one swing of its eye the view draws nearer
  // than it stood, and the verdict stands past that swing
  const { zooms, held } = await swung(page, over.cam.yaw);
  expect(held).toBe(true);
  expect(zooms.length).toBeGreaterThan(1);
  expect(Math.max(...zooms)).toBeGreaterThan(zooms[0]);
  expect(await status(page).textContent()).toBe(TIME_UP);
  // the view runs the length of the slower swing, near six seconds, which the frames cannot run
  // ahead of the wall clock, and then the level starts again by itself
  await expect(status(page)).toHaveText("", { timeout: 10_000 });
  expect(Date.now() - since).toBeGreaterThan(5000);
  await expect(say(page)).toContainText(
    "again. The ball stands on the top of 17,17,17, facing -y.",
  );
  await expect.poll(async () => (await probe(page)).frame, { intervals: [50] }).toEqual(IDENTITY);
  await expect(status(page)).toHaveText(TIME_UP, { timeout: 10_000 });
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
  // onto the coin's block, whose take bursts the game's sparks and no dust
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

test("the ball takes the coin it rolls onto, which is gone from the frame, the last key opens the exits, rolling onto the open exit ends the level, and with Play on through the levels on Space goes on to LEVEL 2 with the total carried", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { motion: false });
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  const coin = [17, 16, 17];
  const keys = page.locator("#playKeys");
  const points = page.locator("#playPoints");
  const total = page.locator("#playTotal");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  await expect(total).toHaveText("Total 0");
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
  await expect(total).toHaveText("Total 1500");
  const done = await probe(page);
  expect(done.playing).toBe(true);
  expect(done.frame).toBeNull();
  expect(done.fitted).toBe(true);
  // Space goes on to the level the game loads next, with play on and the run's total carried
  await page.keyboard.press(" ");
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect(status(page)).toHaveText("");
  await expect(keys).toHaveText("Keys 1");
  await expect(points).toHaveText("0 points");
  await expect(total).toHaveText("Total 1500");
  const on = await probe(page);
  expect(on.playing).toBe(true);
  expect(on.station).toEqual({ block: [17, 18, 17], face: 0, heading: "-y", moving: false });
  expect(errors).toEqual([]);
});

/** What one frame paints about the fruit's disc, a cross of five pixels, with the level titled
    `shown` for that frame where given. */
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
      const [x, y] = thingDisc(m, { x: c[0], y: c[1], z: c[2] }, state.lvl);
      const was = state.lvl.shown;
      if (shown) state.lvl.shown = shown;
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
      if (shown) draw();
      return out;
    },
    [FRUIT, FRUIT_TYPE, shown],
  );

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

// the way from LEVEL 1's start to its key and round to its exit: a tap a roll and a tap a turn,
// each run to its rest
const WAY_OUT = [
  ["ArrowUp", "17,17,17"],
  ["ArrowUp", "17,16,17"],
  ["ArrowUp", "17,15,17"],
  ["ArrowRight", "+x"],
  ["ArrowUp", "18,15,17"],
  ["ArrowUp", "19,15,17"],
  ["ArrowUp", "20,15,17"],
  ["ArrowLeft", "-y"],
  ["ArrowUp", "20,14,17"],
  ["ArrowUp", "20,13,17"],
  ["ArrowUp", "20,12,17"],
  ["ArrowLeft", "-x"],
  ["ArrowUp", "19,12,17"],
  ["ArrowUp", "18,12,17"],
  ["ArrowUp", "17,12,17"],
];
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
  // Esc leaves play on LEVEL 2 with the ball's view, LEVEL 1's parked view being another level's
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
  await page.keyboard.press("y");
  await expect(page.locator("#play")).toBeHidden();
  await startPlay(page);
  await expect(total).toHaveText("Total 0");
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

test("with Motion off a hop on a coin's block takes the coin on the first frame, nothing draws once the ball rests, and the tip and the panel say the coin is taken", async ({
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
  expect(await drawn(page)).toBe(0);
  await page.keyboard.press(" ");
  await expect(page.locator("#playPoints")).toHaveText("250 points");
  await expect(say(page)).toHaveText("Coin (bronze) taken, 250 points.");
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

// LEVEL 1's key, on the top of 20,15,17, three blocks on from the turn
const KEY_BLOCK = [20, 15, 17];
const KEY_TYPE = 31;
/** Drive the frozen level along `way` to the block before the key's, roll onto the key's and step
    on through its burst, reading on each frame the mean brightness the frame paints within most of
    a block of the key's place: the frame the key was taken on, the table's frames and the
    samples. */
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
        if (took === null && keys.textContent === "Keys 0") took = f;
        samples.push(about());
        // the sheet lands between frames
        await new Promise((r) => setTimeout(r));
      }
      return { took, frames, samples };
    },
    [way, KEY_BLOCK, KEY_TYPE],
  );

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

test("rolling over a switch throws it, and an on teleporter sends the ball to its far end, the view cutting there and the body keeping its turn, with a leap in the way it has come", async ({
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
  // the roll has turned the body, which the send carries onto the far face as it stands within the
  // frame, the body in the world turning with the frame
  const held = await bodyHanded(page);
  expect(held.body).not.toEqual(UNTURNED);
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
  const landed = await bodyHanded(page);
  expect(landed.body).toEqual(held.body);
  expect(landed.world).not.toEqual(held.world);
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
    await expect(page.locator('#pad [data-pad="down"]')).toHaveCount(0);
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
      // the game's pad has no Down, so the pad has no down arrow and no row under the jump's
      await expect(page.locator('#pad [data-pad="down"]')).toHaveCount(0);
      const up = await page.locator('#pad [data-pad="up"]').boundingBox();
      const jump = await page.locator("#padBall").boundingBox();
      expect(pad.y + pad.height - (jump.y + jump.height)).toBeCloseTo(up.y - pad.y, 0);
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
  const lengths = [blink.first, ...Array(blink.times - 1).fill(blink.frames)];
  const blinking = lengths.reduce((a, b) => a + b, 0);
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
  const spells = lengths.flatMap((n, s) => Array(n).fill(s % 2 === 1));
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

test("a corkscrew catches the ball from where it bounces: rolled under one that is up the ball stands uncaught until the frame the table's rise comes down within reach, when the strip says it is caught", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(CORKSCREW_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await listening(page);
  await frozen(page);
  // the opening wait and the corkscrew's first landing pass before Up is held, which rolls the
  // ball two blocks on, released as the ball reaches the corkscrew's block so that it stops under
  // it, the corkscrew near its top by then; the strip is read on every game frame
  const { seen, table } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { phaseField }, { state }, { cellKey }, P] =
      await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/motion.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const el = document.getElementById("playStatus");
    const { types, turn, hz } = motionTable();
    const corkscrew = state.idx.markers.get(cellKey(17, 15, 17)).find((m) => m.face === 0);
    const entry = types[String(corkscrew.type)];
    const table = {
      turn,
      ...entry.bounce,
      phase: entry.phases[phaseField(corkscrew)],
      square: entry.catch.square,
      stand: entry.catch.stand,
      radius: types["30"].rolling.resume,
    };
    const seen = [];
    let held = false;
    for (let f = 0; f < 400; f++) {
      if (f === 60) {
        key("keydown", "ArrowUp");
        held = true;
      }
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,15,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      seen.push({
        frame: clock(),
        block: s.block.join(),
        moving: s.moving,
        status: el.textContent,
        dying: el.classList.contains("dying"),
      });
      if (seen.at(-1).dying) break;
    }
    return { seen, table };
  });
  await page.evaluate(() => window.__thaw());
  const { turn, rate, wrap, rise, phase, square, stand, radius } = table;
  const lift = (f) => rise * Math.sin((((phase + rate * f) % wrap) / turn) * 2 * Math.PI);
  // straight under the point, the ball's centre is the point's height off the face less its
  // radius short of it, and is within reach while the rise is at most the reach less that
  const bound = Math.sqrt(square) - (stand - radius);
  const rested = seen.findIndex((s) => s.block === "17,15,17" && !s.moving);
  expect(rested).toBeGreaterThan(0);
  const caught = seen.findIndex((s) => s.dying);
  expect(caught).toBeGreaterThan(rested + 10);
  expect(seen[caught].status).toBe("Caught");
  expect(lift(seen[rested].frame)).toBeGreaterThan(bound);
  let predicted = seen[rested].frame;
  while (lift(predicted) > bound) predicted++;
  expect(seen[caught].frame).toBe(predicted);
  expect(
    seen.slice(rested, caught).every((s) => s.block === "17,15,17" && !s.moving && !s.dying),
  ).toBe(true);
  expect(seen.slice(rested, caught).every((s) => lift(s.frame) > bound)).toBe(true);
  expect(seen.slice(0, caught).every((s) => s.status === "")).toBe(true);
  expect(await said(page)).toContain("Caught");
  expect(errors).toEqual([]);
});

test("the lethargy pill halves the pace as the game does: from the frame after its take two steps of a sixtieth run one game frame, through the passes the table gives, and one step runs one again from the frame it predicts", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LETHARGY_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,19,17, facing -y");
  await listening(page);
  // a quarter turn toward the pill, past the level's opening, which holds the pad dead
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  // Up held until the ball reaches the pill's block, where it stops; the frame drawn is read after
  // every step of a sixtieth
  const { seen, table } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { state }, { cellKey }, P] = await Promise.all(
      [
        "viewer/draw/render.js",
        "viewer/data.js",
        "viewer/state.js",
        "format/lattice.js",
        "play/play.js",
      ].map(at),
    );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const { types, hz } = motionTable();
    const pill = state.idx.markers.get(cellKey(17, 19, 17)).find((m) => m.face === 0);
    const { word, step, blanks, screen } = types[String(pill.type)].lasts;
    const seen = [];
    let held = true;
    key("keydown", "ArrowUp");
    for (let f = 0; f < 600; f++) {
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,19,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      seen.push({ frame: clock(), block: s.block.join(), moving: s.moving });
    }
    return { seen, table: { word, step, blanks, fade: screen.fade } };
  });
  await page.evaluate(() => window.__thaw());
  const { word, step, blanks, fade } = table;
  const standing = word / step + 1 + fade.from / fade.by + 1;
  const frames = seen.map((s) => s.frame);
  // every step to the take's ran a frame, so the first that ran none follows the take's frame
  const slowed = frames.findIndex((f, i) => i > 0 && f === frames[i - 1]);
  expect(slowed).toBeGreaterThan(0);
  const took = slowed - 1;
  expect(frames.length).toBeGreaterThan(took + standing * blanks + 30);
  // from the take's frame on, a frame every `blanks` steps for `standing` frames, then one a step
  const predicted = (i) => {
    const d = i - took;
    return d <= standing * blanks
      ? frames[took] + Math.floor(d / blanks)
      : frames[took] + standing + d - standing * blanks;
  };
  const odd = frames
    .map((f, i) => (f === (i < took ? frames[0] + i : predicted(i)) ? -1 : i))
    .filter((i) => i >= 0);
  expect(odd).toEqual([]);
  expect(seen.at(-1)).toEqual({ frame: frames.at(-1), block: "17,19,17", moving: false });
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});

test("the lethargy pill rolls the view and ghosts the screen as the game does: the pill's frame flashes white and rolls the view by the first angle, the roll follows the word frame by frame about the line of sight with the picture trailing greenish behind it, and once the word has run out the view is the ball's frame again and a white glow fades", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LETHARGY_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,19,17, facing -y");
  await listening(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  const seen = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { state, camera, basisAt }, { cellKey }, P] =
      await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const { types, hz, turn } = motionTable();
    const pill = state.idx.markers.get(cellKey(17, 19, 17)).find((m) => m.face === 0);
    const { word, step, blanks, rock, screen } = types[String(pill.type)].lasts;
    const g = document.getElementById("cv").getContext("2d");
    // the mean red, green and blue over a grid of points of the canvas
    const sampled = () => {
      const { w, h, dpr } = state.view;
      const sum = [0, 0, 0];
      let n = 0;
      for (let j = 1; j <= 6; j++)
        for (let i = 1; i <= 8; i++) {
          const x = Math.round((w * i * dpr) / 9);
          const y = Math.round((h * j * dpr) / 7);
          const d = g.getImageData(x, y, 1, 1).data;
          for (let ch = 0; ch < 3; ch++) sum[ch] += d[ch];
          n++;
        }
      return sum.map((v) => Math.round(v / n));
    };
    // the view's right, up and toward in the world for the frame `f` at the orbit's yaw and pitch
    const viewOf = (f) => {
      const b = basisAt(state.cam.yaw, state.cam.pitch);
      const inWorld = (v) => [0, 1, 2].map((i) => v[0] * f[i] + v[1] * f[3 + i] + v[2] * f[6 + i]);
      return { right: inWorld(b.right), up: inWorld(b.up), toward: inWorld(b.toward) };
    };
    // the angle the table predicts for the pill's word
    const angleOf = (w) => {
      if (w <= 0) return 0;
      const sine = Math.round(turn * Math.sin((((w * rock.scale) % turn) / turn) * 2 * Math.PI));
      return Math.trunc(sine / 2 ** rock.shift);
    };
    // the view rolled about its toward by `angle`, its up tipping left for a positive one
    const rolledView = ({ right, up, toward }, angle) => {
      const c = Math.cos((angle / turn) * 2 * Math.PI);
      const s = Math.sin((angle / turn) * 2 * Math.PI);
      return {
        right: right.map((v, i) => c * v + s * up[i]),
        up: up.map((v, i) => c * v - s * right[i]),
        toward,
      };
    };
    const off = (a, b) =>
      Math.max(
        ...["right", "up", "toward"].flatMap((k) => a[k].map((v, i) => Math.abs(v - b[k][i]))),
      );
    // the view settles on the ball after the turn
    for (let f = 0; f < 30; f++) {
      window.__step(1000 / hz);
      draw();
    }
    const ballFrame = [...state.frame];
    const rest = viewOf(ballFrame);
    const differs = () => state.frame.some((v, i) => Math.abs(v - ballFrame[i]) > 1e-9);
    const before = sampled();
    // the pass the end is asked on, which draws the ghost once more, and the fade's passes after
    const end = word / step + 1;
    const fades = screen.fade.from / screen.fade.by;
    const wanted = [0, 1, end + 1, end + Math.ceil(fades / 2), end + fades, end + fades + 1];
    const samples = {};
    const odd = [];
    const angles = [];
    let took = -1;
    let clockTook = 0;
    let held = true;
    key("keydown", "ArrowUp");
    for (let f = 0; f < 700; f++) {
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,19,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      if (took < 0) {
        if (!differs()) continue;
        took = f;
        clockTook = clock();
      }
      const pass = clock() - clockTook;
      const angle = angleOf(word - step * pass);
      const err = off(camera(), rolledView(rest, angle));
      if (err > 1e-6) odd.push({ f, pass, angle, err });
      if (pass < 3 && !angles.includes(angle)) angles.push(angle);
      if (wanted.includes(pass) && !(pass in samples)) samples[pass] = sampled();
      if (pass > end + fades + 1) break;
    }
    return {
      took,
      odd,
      angles,
      samples,
      before,
      end,
      fades,
      blanks,
      back: took >= 0 && !differs(),
      block: P.station().block.join(),
    };
  });
  await page.evaluate(() => window.__thaw());
  const { took, odd, angles, samples, before, end, fades, back } = seen;
  expect(took).toBeGreaterThan(0);
  expect(odd).toEqual([]);
  // three frames apart in the cycle roll three ways, the first to the right
  expect(angles).toHaveLength(3);
  expect(angles[0]).toBeLessThan(0);
  expect(back).toBe(true);
  expect(seen.block).toBe("17,19,17");
  const bright = (c) => (c[0] + c[1] + c[2]) / 3;
  const base = samples[end + fades + 1];
  // the flash: white everywhere on the pill's frame, over a scene far darker before and after
  expect(bright(before)).toBeLessThan(160);
  expect(bright(base)).toBeLessThan(160);
  expect(samples[0].every((v) => v >= 250)).toBe(true);
  // the ghost of the flash on the pass after: half the scene and half a greenish white
  const ghost = samples[1];
  expect(bright(ghost)).toBeGreaterThan(bright(base) / 2 + 60);
  expect(bright(ghost)).toBeLessThan(250);
  expect(ghost[1] - ghost[0] - (base[1] - base[0]) / 2).toBeGreaterThan(8);
  // the glow fades from the end: brighter first, dimmer midway, the scene's own at its last pass
  expect(bright(samples[end + 1])).toBeGreaterThan(bright(samples[end + Math.ceil(fades / 2)]));
  expect(bright(samples[end + Math.ceil(fades / 2)])).toBeGreaterThan(bright(samples[end + fades]));
  expect(Math.abs(bright(samples[end + fades]) - bright(base))).toBeLessThanOrEqual(10);
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});

test("a teleport flashes the screen as the game does: the frame after the send is white over the whole canvas, the white wanes on each pass after, the last pass still lifting the scene, and past the derived passes the scene is its own again", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // the switch test's level: a key out of reach, a yellow switch and two blue teleporters a block
  // apart, the far one facing across the row
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
  await expect(page.locator("#chipLine")).toContainText("5 objects");
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
        await new Promise((r) => setTimeout(r));
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

test("a teleport's shell is laid as the game lays it: the sprite's third corner at the teleport's point, its first the size on at the angle, the fourth a quarter on and the second the two summed, the angle running on by the table's step a frame", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // the switch test's level: a key out of reach, a yellow switch and two blue teleporters a block
  // apart, the far one facing across the row
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
  await expect(page.locator("#chipLine")).toContainText("5 objects");
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

test("a level with no key opens from white as the game's does: the first frame is white over the whole canvas, the white wanes on each pass at full pace, and the frame the derived passes on is the scene's own again", async ({
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
/** Step the frozen level `n` frames of the clock, drawing each. */
const passed = (page, n) =>
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
  await expect(page.locator("#playKeys")).toHaveText("Blocks 48");
  await passed(page, 1);
  await expect(page.locator("#playKeys")).toHaveText("Blocks 47");
  await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked({ checked: false });
  const marked = await faceColour(page, BONUS_START, PLUS_Y);
  const built = await faceColour(page, BONUS_BESIDE, PLUS_Y);
  await page.evaluate(() => window.__thaw());
  expect(marked[1]).toBeGreaterThan(built[1] + 50);
  expect(marked[2]).toBeLessThan(built[2] - 15);
  expect(errors).toEqual([]);
});

test("the invincibility pill colours the ball's light as the game does: from the pill's frame each channel is raised by the table's gain times the sine of a counter stepping by its step round its round, red first, through every frame the word stands and no further, and a later pill carries the counter on from where the pill before left it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; the pill on the block ahead of the start
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await faced(page, [17, 16, 17], 0, { type: 34 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await listening(page);
  /** The ball rolled onto the pill's block on the held clock, and on each game frame from the
      pill's, through the word's frames and three after, the light the frame is handed with the
      raise the table predicts for the counter stepped on from `counter`, null where no light is
      handed, with the counter as left, the frame the pill was taken on and the ball's block. */
  const glowing = (counter) =>
    page.evaluate(async (counter) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw }, { motionTable }, { state }, { cellKey }, P] = await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
      const key = (type, k) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
      const { types, hz, turn } = motionTable();
      const pill = state.idx.markers.get(cellKey(17, 16, 17)).find((m) => m.face === 0);
      const { word, step, glow } = types[String(pill.type)].lasts;
      const frames = word / step + 1;
      const raised = (c) =>
        glow.from.map((start) => {
          const angle = c - start;
          if (angle < 0 || angle >= turn) return 0;
          return glow.gain * Math.round(turn * Math.sin((angle / turn) * 2 * Math.PI));
        });
      const seen = [];
      let took = -1;
      let held = true;
      key("keydown", "ArrowUp");
      for (let f = 0; f < 1200 && seen.length < frames + 3; f++) {
        window.__step(1000 / hz);
        draw();
        if (held && P.station().block.join() === "17,16,17") {
          key("keyup", "ArrowUp");
          held = false;
        }
        const tint = P.handed()?.tint ?? null;
        if (took < 0) {
          if (!tint) continue;
          took = f;
        }
        if (!tint) {
          seen.push(null);
          continue;
        }
        counter = (counter + glow.step) % glow.round;
        seen.push({ tint, lift: raised(counter) });
      }
      return { took, seen, counter, frames, block: P.station().block.join() };
    }, counter);
  /** Whether every frame's light is the untinted light `base` raised by the predicted lift, a
      channel below nothing held at nothing. */
  const predicted = (seen, base) =>
    seen.every(({ tint, lift }) => tint.every((v, ch) => v === Math.max(0, base + lift[ch])));
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const first = await glowing(0);
  await page.evaluate(() => window.__thaw());
  expect(first.took).toBeGreaterThan(0);
  expect(first.block).toBe("17,16,17");
  expect(first.seen).toHaveLength(first.frames + 3);
  const lit = first.seen.slice(0, first.frames);
  expect(lit.every((s) => s !== null)).toBe(true);
  // the pill's own frame raises the red alone, from which the untinted light is read
  expect(lit[0].lift[0]).toBeGreaterThan(0);
  expect(lit[0].lift.slice(1)).toEqual([0, 0]);
  const base = lit[0].tint[0] - lit[0].lift[0];
  expect(base).toBeGreaterThan(0);
  expect(predicted(lit, base)).toBe(true);
  // the three channels each have their turn, and the light is the plain ball's light once the word is out
  for (const ch of [0, 1, 2]) expect(lit.some((s) => s.lift[ch] > base)).toBe(true);
  expect(first.seen.slice(first.frames)).toEqual([null, null, null]);
  await expect.poll(() => said(page)).toContain("Invincibility pill taken.");
  // out of play and in again on the same page: the pill is back on its face, the counter is not
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const again = await glowing(first.counter);
  await page.evaluate(() => window.__thaw());
  expect(again.took).toBeGreaterThan(0);
  const relit = again.seen.slice(0, again.frames);
  expect(relit.every((s) => s !== null)).toBe(true);
  expect(relit[0].lift).not.toEqual(lit[0].lift);
  expect(predicted(relit, base)).toBe(true);
  expect(again.seen.slice(again.frames)).toEqual([null, null, null]);
  expect(errors).toEqual([]);
});

/** Step the frozen level a game frame at a time until the strip's status matches `verdict`, at
    most `most` frames: the frames stepped, or null where it never matched. */
const stepTo = (page, verdict, most) =>
  page.evaluate(
    async ([verdict, most]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw }, { motionTable }] = await Promise.all(
        ["viewer/draw/render.js", "viewer/data.js"].map(at),
      );
      const status = document.getElementById("playStatus");
      const re = new RegExp(verdict);
      for (let i = 1; i <= most; i++) {
        window.__step(1000 / motionTable().hz);
        draw();
        if (re.test(status.textContent)) return i;
      }
      return null;
    },
    [verdict, most],
  );
/** The camera's zoom and yaw as the ending's view stands and after each of `frames` frozen frames
    more. */
const orbited = (page, frames) =>
  page.evaluate(async (frames) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { draw }, { motionTable }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/render.js", "viewer/data.js"].map(at),
    );
    const seen = [{ zoom: state.cam.zoom, yaw: state.cam.yaw }];
    for (let i = 0; i < frames; i++) {
      window.__step(1000 / motionTable().hz);
      draw();
      seen.push({ zoom: state.cam.zoom, yaw: state.cam.yaw });
    }
    return seen;
  }, frames);
/** Hold Up and tap Space over one frozen frame, which reads both as the forward jump. */
async function jumped(page) {
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await onward(page, 1);
  await page.keyboard.up("ArrowUp");
}

test("on a hidden level the ending's view turns the level under an eye that does not swing, as the game's does", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: HIDDEN_LEVEL });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,21,17, facing -y");
  // past the level's opening, which holds the pad dead, and facing the gap beside the start
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  // a jump two blocks on comes down on nothing, and the ball falls off the level
  await jumped(page);
  expect(await stepTo(page, "^FELL OFF!", 400)).not.toBeNull();
  const seen = await orbited(page, 40);
  await page.evaluate(() => window.__thaw());
  // the zoom stands from frame to frame while the yaw turns
  expect(new Set(seen.map((s) => s.zoom)).size).toBe(1);
  expect(new Set(seen.map((s) => s.yaw)).size).toBe(seen.length);
  expect(errors).toEqual([]);
});

test("in a Simon room the clock stands and the ending's view swings the arcade's way, as the game plays the rooms by their own mode's word", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: SIMON_LEVEL });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  await frozen(page);
  expect(await seconds(page)).toBe(99);
  await onward(page, 60);
  expect(await seconds(page)).toBe(99);
  // a jump along the row comes down past its end, on nothing, and the ball falls off the level
  await jumped(page);
  expect(await stepTo(page, "^FELL OFF!", 400)).not.toBeNull();
  const seen = await orbited(page, 100);
  await page.evaluate(() => window.__thaw());
  const { turn, view } = await page.evaluate(async () => {
    const { motionTable } = await import(new URL("js/viewer/data.js", location.href).href);
    const { turn, play } = motionTable();
    return { turn, view: play.view };
  });
  // the eye draws further off through a quarter of the arcade's swing, well past a quarter of the
  // quicker one, before it comes back
  const zooms = seen.map((s) => s.zoom);
  const rise = zooms.findIndex((z, i) => i > 0 && z > zooms[i - 1]);
  expect(Math.abs(rise - turn / (4 * view.swing))).toBeLessThanOrEqual(1);
  expect(rise).toBeGreaterThan(turn / (4 * view.bonus.swing) + 1);
  expect(errors).toEqual([]);
});

test("a Simon room takes the pad one move at a time: Up held rolls the ball one block on the latch's fifth frame at rest and not before, a held Left turns it, and the round's two moves done end the room with the game's word", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { levels } = JSON.parse(
    readFileSync(new URL("../../public/map_data.json", import.meta.url), "utf8"),
  );
  const room = levels.find((l) => l.pack === SIMON_PACK && l.index === 0);
  const start = room.records.find((r) => r.on.some((o) => o.type === 30));
  await opened(page, { hash: SIMON_LEVEL });
  await startPlay(page);
  const before = await station(page);
  expect(before.block).toEqual([start.x, start.y, start.z]);
  const ahead = before.block.map((v, i) => v + AXES[before.heading][i]);
  await frozen(page);
  // past the opening and long at rest, so the latch runs from the first frame Up is read
  await onward(page, 40);
  const rolled = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { hz, play } = motionTable();
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    const seen = [];
    key("keydown", "ArrowUp");
    for (let f = 0; f < play.simon.latch + 2 && !seen.includes(true); f++) {
      run();
      seen.push(P.station().moving);
    }
    key("keyup", "ArrowUp");
    for (let f = 0; f < 40; f++) run();
    return { seen, after: P.station(), latch: play.simon.latch };
  });
  expect(rolled.seen).toEqual(
    Array.from({ length: rolled.latch }, (_, i) => i === rolled.latch - 1),
  );
  expect(rolled.after).toEqual({ ...before, block: ahead });
  // Left held turns the ball at once, the ball long at rest, which is the round's second move,
  // and the verdict ends the room as the ball comes to rest from the turn
  await page.evaluate(() =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })),
  );
  expect(await stepTo(page, ROUND_DONE, 120)).not.toBeNull();
  await page.evaluate(() =>
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true })),
  );
  await expect(status(page)).toHaveText(new RegExp(ROUND_DONE));
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
  await page.keyboard.press("ArrowLeft");
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

// the round lost by the second player's wrong move, which scores for the first
const ROUND_LOST =
  "^Wrong Move! The round is lost, a point to Player 1\\. \\d+ points, 99 seconds left\\. Space or Enter starts the level again\\.$";
/** The strip's figures for a room and its match, each its text or null while hidden. */
const roomFigures = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      ["playRound", "playMoves", "playTurn", "playMatch", "playTotal"].map((id) => {
        const el = document.getElementById(id);
        return [id, el.hidden ? null : el.textContent];
      }),
    ),
  );
/** Hold `key` on the frozen room until the ball moves, let it go and run the level on until the
    ball is still: whether the ball moved. */
const copied = (page, key) =>
  page.evaluate(async (key) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { hz, play } = motionTable();
    const press = (type) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    const most = play.simon.idle[1] + play.simon.latch + 2;
    let moved = false;
    press("keydown");
    for (let f = 0; f < most && !moved; f++) {
      run();
      moved = P.station().moving;
    }
    press("keyup");
    for (let f = 0; f < 60 && P.station().moving; f++) run();
    return moved;
  }, key);
/** Run the frozen ending's view out, to the room's load that follows it: the round the strip then
    says, whether play is on, the status and the level named. */
const roundAgain = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { turn, play, hz } = motionTable();
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    const round = () => document.getElementById("playRound").textContent;
    const was = round();
    const length = Math.floor(turn / play.view.swing);
    for (let f = 0; f < length + 5 && round() === was; f++) run();
    return {
      round: round(),
      playing: P.playing(),
      status: document.getElementById("playStatus").textContent,
      level: document.querySelector("#chip b").textContent,
    };
  });

test("with Play on through the levels on a Simon room plays the game's match: the first player opens the first round, which done passes the turn to the second player for round 2 with four moves to make, and the second player's wrong move gives the first a point and loads the room again for its second match, which the second player opens", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: SIMON_LEVEL });
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 1's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  await frozen(page);
  // past the opening and long at rest, so each key is read as the rooms read it
  await onward(page, 40);
  // the first round's two moves, a roll and a turn, which the first player stores
  expect(await copied(page, "ArrowUp")).toBe(true);
  expect(await copied(page, "ArrowLeft")).toBe(true);
  expect(await stepTo(page, ROUND_DONE, 120)).not.toBeNull();
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  // the ending's view runs out into the same room, started again for the second player
  expect(await roundAgain(page)).toEqual({
    round: "Round 2",
    playing: true,
    status: "",
    level: "SIMON 1",
  });
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 2",
    playMoves: "4 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  await onward(page, 40);
  // the second player turns where the first rolled, a wrong move, which fails the round
  expect(await copied(page, "ArrowLeft")).toBe(true);
  expect(await stepTo(page, ROUND_LOST, 200)).not.toBeNull();
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 2",
    playMoves: "4 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 1 : 0",
    playTotal: null,
  });
  await expect(line(page)).toHaveText(ENDED);
  // Space loads the room again: the same room, its second match, which the second player opens
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(page.locator("#chip b")).toHaveText("SIMON 1");
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 1 : 0",
    playTotal: null,
  });
  await page.evaluate(() => window.__thaw());
  expect(errors).toEqual([]);
});
