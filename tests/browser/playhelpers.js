import { expect } from "@playwright/test";
import { drafted, drawn, frozen, onward, settle, still, written } from "./helpers.js";
import { KEY } from "../../public/js/play/world.js";

// the levels the tests open, and what the strip and the live region say
export const LEVEL = "/#HIRO/0/45,35/fit/33";

// BONUS 1: a level with no key, which the game opens from white
export const BONUS_LEVEL = "/#HIRO/15/45,35/fit/33";

export const DONE =
  /^Out by the exit: the level is done\. 1500 points, \d+ seconds left\. 1500 points banked, 1500 points in all\. Space or Enter goes on to LEVEL 2\.$/;

export const TAKEN = "Taken: Coin (bronze) on the top";

export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const UNTURNED = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

// the page and the ball as the page holds them
/** The page point over a point of the level. */
export const at = (page, x, y, z) =>
  page.evaluate(
    async ([x, y, z]) => {
      const { screen } = await import(new URL("js/viewer/state.js", location.href).href);
      const r = document.getElementById("cv").getBoundingClientRect();
      const [px, py] = screen(x, y, z);
      return { x: r.left + px, y: r.top + py };
    },
    [x, y, z],
  );

export const top = (page, c) => at(page, c[0] + 0.5, c[1] + 0.5, c[2]);

/** The view and the ball as the page holds them. */
export const probe = (page) =>
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

export const station = async (page) => (await probe(page)).station;

/** The red, green and blue the frame paints at a point of the level. */
export const pixelAt = (page, [x, y, z]) =>
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

/** Where the ball's centre is on the page, and the top of what the strip takes. */
export const anchor = (page) =>
  page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const cv = document.getElementById("cv").getBoundingClientRect();
    const [x, y] = screen(...state.target);
    const strip = document.getElementById("play");
    const top = strip.hidden ? cv.bottom : strip.getBoundingClientRect().top;
    return { x: cv.left + x, y: cv.top + y, free: top - cv.top, top, w: cv.width };
  });

// the strip, the HUD and the live region
export const say = (page) => page.locator("#say");

export const line = (page) => page.locator("#playLine");

export const status = (page) => page.locator("#playStatus");

export const clockLine = (page) => page.locator("#playClock");

/** The seconds the strip's clock shows. */
export const seconds = async (page) =>
  Number((await clockLine(page).textContent()).replace(/\D/g, ""));

/** Wait for the strip's clock to pass `n` seconds, which proves the level ran frames meanwhile,
    a whole second of them for each past the first. */
export const ticked = async (page, n = 1) => {
  for (let i = 0; i < n; i++) {
    const before = await seconds(page);
    await expect.poll(() => seconds(page)).not.toBe(before);
  }
};

/** The frame the map draws at. */
export const frameAt = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/viewer/draw/render.js", location.href).href)).clock(),
  );

// the circuits as the map holds them
/** The panel's presses as the map holds them. */
export const presses = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return [...state.presses];
  });

export const flipped = (page, circuit, frame) =>
  page.evaluate(
    async ([circuit, frame]) => {
      const { flip } = await import(new URL("js/viewer/data.js", location.href).href);
      flip(circuit, frame);
    },
    [circuit, frame],
  );

/** What one frame paints about a canvas point, a cross of five pixels. */
export const about = (page, [x, y]) =>
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

// the level as the model and the frame hold it
/** How many starts the shown level has. */
export const starts = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { startsOf } = await import(new URL("js/viewer/data.js", location.href).href);
    return startsOf(state.lvl).length;
  });

/** What the panel's presses make of the switch on the draft's block at `c`. */
export const switched = (page, c) =>
  page.evaluate(async (c) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { markerNow }, { cellKey }] = await Promise.all(
      ["viewer/state.js", "viewer/data.js", "format/lattice.js"].map(at),
    );
    return markerNow(state.idx.markers.get(cellKey(...c)).find((m) => m.type === 9));
  }, c);

/** How many motes of dust are over the block at `c`. */
export const dustOver = (page, c) =>
  page.evaluate(async (c) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ dustOver }, { cellKey }] = await Promise.all(
      ["play/dust.js", "format/lattice.js"].map(at),
    );
    return dustOver(cellKey(...c));
  }, c);

/** The camera's frame for a ball heading `h` on a face of normal `n`, rounded as `probe` rounds. */
export const frameFor = (page, h, n) =>
  page.evaluate(
    async ([h, n]) => {
      const { frameOf } = await import(new URL("js/viewer/state.js", location.href).href);
      return frameOf(h, n).map((v) => Math.round(v * 1000) / 1000 + 0);
    },
    [h, n],
  );

/** Keep every sentence the live region says from here on. */
export const listening = (page) =>
  page.evaluate(() => {
    window.__said = [];
    const el = document.getElementById("say");
    new MutationObserver(() => window.__said.push(el.textContent)).observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

export const said = (page) => page.evaluate(() => window.__said);

/** A finger held still on `point` until the hold shows, then lifted. */
export const hold = async (page, point) => {
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
export const ballOver = (c) => [c[0] + 0.5, c[1] + 0.5, c[2] - 0.03 - 100 / 512];

// entering play
export async function opened(page, { motion = true, hash = LEVEL } = {}) {
  await page.goto(hash);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  if (!motion) await page.keyboard.press("v");
  await expect(page.locator("#showMotion")).toBeChecked({ checked: motion });
  // the frame the map asked for while Motion ran still lands after it is switched off
  if (!motion) await expect.poll(() => drawn(page, 2, 0)).toBe(0);
}

/** Press p, and wait for play to load and the strip to show. */
export async function startPlay(page) {
  await page.keyboard.press("p");
  await expect(page.locator("#play")).toBeVisible();
}

// the levels of your own the tests lay
/** A new level with a key on the +x side of the start's block, out of the ball's reach, so that
    the level plays as an arcade one rather than ending once every block is rolled onto, with what
    `more` lays and asks of `drafted`. */
export const arcadeDraft = (page, more = {}) =>
  drafted(page, { ...more, faces: [[[17, 17, 17], 1, { type: KEY }], ...(more.faces ?? [])] });

/** The arcade level with a yellow switch on the block ahead of the start and two blue teleporters
    on the two beyond, leading to each other a block apart, the far one facing across the row. */
export const teleportDraft = (page, more = {}) =>
  arcadeDraft(page, {
    ...more,
    blocks: [
      [[17, 16, 17], { kind: 0 }],
      [[17, 15, 17], { kind: 0 }],
      [[17, 14, 17], { kind: 0 }],
      ...(more.blocks ?? []),
    ],
    faces: [
      [[17, 16, 17], 0, { type: 9, variant: 0 }],
      [[17, 15, 17], 0, { type: 5, variant: 1 }],
      [[17, 14, 17], 0, { type: 5, variant: 1, facing: 4 }],
      ...(more.faces ?? []),
    ],
  });

// the route, the switches and the rolls
/** The planner's route as it stands: its stations, steps and sorted marks, or null. */
export const route = (page) =>
  page.evaluate(async () => {
    const { current } = await import(new URL("js/viewer/chrome/course.js", location.href).href);
    const c = current();
    return c && { stations: c.stations, steps: c.steps, marks: [...c.marks].sort((a, b) => a - b) };
  });

/** Open Settings, click the switch `id` and close it, saying what its row says of the default. */
export const toggled = async (page, id, def) => {
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator(`#${id}`).click();
  await expect(page.locator(`#settings label:has(#${id}) .def`)).toHaveText(def);
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
};

/** Roll the ball a block on and wait for it to rest on `block`. */
export const rolled = async (page, block) => {
  await betweenFrames(page, () => page.keyboard.press("ArrowUp"));
  await expect.poll(async () => (await probe(page)).station.block).toEqual(block);
  await expect.poll(async () => (await probe(page)).station.moving).toBe(false);
};

/** Click the top of `c`, which with the planner on adds a stop there. */
export const stopOn = async (page, c) => {
  const p = await top(page, c);
  await page.mouse.click(p.x, p.y);
};

/** How many markers one frame writes `text` into. */
export const marked = async (page, text) => (await written(page)).filter((t) => t === text).length;

/** Whether the frame is handed a ball. */
export const handed = (page) =>
  page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    return P.handed() !== null;
  });

// the way from LEVEL 1's start to its key and round to its exit: a tap a roll and a tap a turn,
// each run to its rest
export const WAY_OUT = [
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

// the held clock's drivers
/** Press `keys` on the held clock, so that no frame comes between a key's down and its up. */
export const betweenFrames = async (page, keys) => {
  await frozen(page);
  await keys();
  await page.evaluate(() => window.__thaw());
};

/** Step the frozen level a game frame at a time through `frames` frames, reading on each the frame
    drawn, whether the frame says every invisible block is seen, the strip's status and a hash of
    the pixels of the tops of `near` and `far`. */
export const stepped = (page, frames, near, far) =>
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

/** Step the frozen level a game frame at a time until the strip's status matches `verdict`, at
    most `most` frames: the frames stepped, or null where it never matched. */
export const stepTo = (page, verdict, most) =>
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
export const orbited = (page, frames) =>
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
export async function jumped(page) {
  await page.keyboard.down("ArrowUp");
  await page.keyboard.press(" ");
  await onward(page, 1);
  await page.keyboard.up("ArrowUp");
}
