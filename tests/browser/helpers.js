import { expect } from "@playwright/test";

export function trackErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Wait for the data to land and the canvas to have a size to fit against. */
export async function settle(page) {
  await page.evaluate(async () => {
    const st = await import(new URL("js/viewer/state.js", location.href).href);
    const deadline = Date.now() + 10000;
    while (!(st.state.lvl && document.getElementById("cv").clientWidth > 0)) {
      if (Date.now() > deadline) throw new Error("settle timeout");
      await new Promise(requestAnimationFrame);
    }
    // the suite works "Your levels" open; the fold itself has checks of its own
    document.getElementById("yoursFold").open = true;
  });
}

/** The steps a draft can take back and take again, the shown draft's steps where no id is given. */
export const steps = (page, id = null) =>
  page.evaluate(async (id) => {
    const [{ state }, { steps }] = await Promise.all(
      ["viewer/state.js", "editor/trail.js"].map(
        (p) => import(new URL(`js/${p}`, location.href).href),
      ),
    );
    return steps(id ?? state.lvl.draft);
  }, id);

export const frame = (page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Wait for the page's transitions to end and the canvas to take the size they leave it. */
export async function still(page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
  await frame(page);
}

/** Wait for the world's textures, whose landing builds the legend anew. */
export const textured = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/atlas.js"].map(at),
    );
    const deadline = Date.now() + 10000;
    while (!atlasFor(state.lvl.theme)) {
      if (Date.now() > deadline) throw new Error("textured timeout");
      await new Promise(requestAnimationFrame);
    }
  });

export const headings = (page) =>
  page.locator("#detail h3").evaluateAll((hs) =>
    hs.map((h) =>
      [...h.childNodes]
        .filter((n) => !n.classList?.contains("tag"))
        .map((n) => n.textContent)
        .join("")
        .trim(),
    ),
  );

export const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The text one frame writes on the canvas. */
export const written = (page) =>
  page.evaluate(async () => {
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const g = document.getElementById("cv").getContext("2d");
    const seen = [];
    const fillText = g.fillText;
    g.fillText = (text, ...rest) => (seen.push(text), fillText.call(g, text, ...rest));
    draw();
    g.fillText = fillText;
    return seen;
  });

/** Wait for the world's textures to land and the drawer to finish sliding,
    after which only what moves draws the map again. */
export const landed = async (page) => {
  await textured(page);
  await still(page);
};

/** How many frames the map draws of its own over a spell that lasts both so
    many of the page's frames and so long. */
export const drawn = (page, frames = 24, ms = 400) =>
  page.evaluate(
    async ([frames, ms]) => {
      const g = document.getElementById("cv").getContext("2d");
      let n = 0;
      const clear = g.clearRect;
      g.clearRect = function (...a) {
        n++;
        return clear.apply(this, a);
      };
      const end = performance.now() + ms;
      for (let i = 0; i < frames || performance.now() < end; i++)
        await new Promise(requestAnimationFrame);
      g.clearRect = clear;
      return n;
    },
    [frames, ms],
  );

/** The red, green and blue of every pixel of the top of the block at `cell`, drawn afresh. */
export const topPixels = (page, cell) =>
  page.evaluate(async ([x, y, z]) => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const { draw } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    state.hover = null;
    draw();
    const g = document.getElementById("cv").getContext("2d");
    const k = state.view.dpr;
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
    const out = [];
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (!inside(x0 + i + 0.5, y0 + j + 0.5)) continue;
        const o = (j * w + i) * 4;
        out.push([d[o], d[o + 1], d[o + 2]]);
      }
    return out;
  }, cell);

/** Whether a pixel is the route's gold. */
export const gold = ([r, g, b]) => r > 230 && g > 170 && b < 150;

/** Hold the page's clock still and draw on it, so the level runs only as `stepped` steps it; a
    thaw lets the clock run on from where the steps left it, never back. */
export const frozen = (page) =>
  page.evaluate(async () => {
    const real = performance.now.bind(performance);
    let now = real();
    performance.now = () => now;
    // a hair over, as on the held clock a frame's milliseconds can come to a hair under a frame
    window.__step = (ms) => {
      now += ms + 1e-6;
    };
    window.__thaw = () => {
      const ahead = now - real();
      performance.now = () => real() + ahead;
    };
    (await import(new URL("js/viewer/draw/render.js", location.href).href)).draw();
  });

/** Run the frozen level `n` game frames on, drawing each. */
export const onward = (page, n) =>
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

/** Step the frozen level a game frame at a time, each drawn, until every reading `until` names
    holds, at most `most` frames, or through `most` frames with `until` null: the strip's status,
    its line or the live region matching a pattern, the ball's `block`, whether it is `moving`,
    whether the status is `dying`, whether the view has `eased` to where it was going, or a
    `frame` reached. Each frame's `readings` come back, with those `until` names: the `frame`
    count, the ball's `station`, the texts of `status`, `line` and `say`, `dying`, `eased`, the
    colour of a `pixel` at a point of the level and a hash of the `top` of a cell, the last of
    them the frame `until` held on where it held within `most`. */
export const stepUntil = (page, until, most, readings = {}) =>
  page.evaluate(
    async ([until, most, readings]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state, screen }, { draw, clock }, { motionTable }, P, { easeOn }] =
        await Promise.all(
          [
            "viewer/state.js",
            "viewer/draw/render.js",
            "viewer/data.js",
            "play/play.js",
            "play/eye.js",
          ].map(at),
        );
      const g = document.getElementById("cv").getContext("2d");
      const status = document.getElementById("playStatus");
      const k = state.view.dpr;
      const pixel = ([x, y, z]) => {
        const [px, py] = screen(x, y, z);
        return [...g.getImageData(Math.round(px * k), Math.round(py * k), 1, 1).data.slice(0, 3)];
      };
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
      const read = {
        frame: () => clock(),
        station: () => P.station(),
        status: () => status.textContent,
        line: () => document.getElementById("playLine").textContent,
        say: () => document.getElementById("say").textContent,
        dying: () => status.classList.contains("dying"),
        eased: () => !easeOn(),
        pixel: () => pixel(readings.pixel),
        top: () => top(readings.top),
      };
      const matching = (name) => (pattern) => new RegExp(pattern).test(read[name]());
      const holds = {
        status: matching("status"),
        line: matching("line"),
        say: matching("say"),
        dying: (want) => read.dying() === want,
        eased: (want) => read.eased() === want,
        moving: (want) => P.station()?.moving === want,
        block: (cell) => P.station()?.block.every((v, i) => v === cell[i]) === true,
        frame: (n) => clock() >= n,
      };
      const named = (name) => (name === "block" || name === "moving" ? "station" : name);
      const names = new Set([
        ...Object.keys(readings).filter((name) => readings[name]),
        ...Object.keys(until ?? {}).map(named),
      ]);
      const out = [];
      for (let i = 0; i < most; i++) {
        window.__step(1000 / motionTable().hz);
        draw();
        out.push(Object.fromEntries([...names].map((name) => [name, read[name]()])));
        if (until && Object.entries(until).every(([name, want]) => holds[name](want))) break;
      }
      return out;
    },
    [until, most, readings],
  );

/** Put `block` into the shown draft at `cell`, or take the block there out with null, through the
    model. */
export const laid = (page, cell, block) =>
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
export const faced = (page, cell, face, object) =>
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

/** Give the shown draft `time` seconds through the model. */
export const timed = (page, time) =>
  page.evaluate(async (time) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js"].map(at),
    );
    update(state.lvl.draft, { ...get(state.lvl.draft).doc, time });
  }, time);

/** Mark the shown draft a Simon room through the model. */
export const roomed = (page, simon) =>
  page.evaluate(async (simon) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setMeta }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    update(state.lvl.draft, setMeta(get(state.lvl.draft).doc, { simon }));
  }, simon);

/** Open the editor on a new level of your own in the world of the level at `hash`, lay `blocks`
    and `faces` in it through the model and give it `time` seconds where given, and wait for the
    chip to count the blocks and the objects the document yields; `motion: false` and
    `textures: false` press `v` and `t` and see their switches off, and `textures: true` waits for
    the world's textures. */
export async function drafted(
  page,
  { hash = "/#HIRO/0/45,35/fit/33", blocks = [], faces = [], time, motion, textures } = {},
) {
  await page.goto(hash);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  if (time !== undefined) await timed(page, time);
  for (const [cell, block] of blocks) await laid(page, cell, block);
  for (const [cell, face, object] of faces) await faced(page, cell, face, object);
  const counts = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get }, { toLevel }, { blockCount, counted, objectCount }] =
      await Promise.all(
        ["viewer/state.js", "editor/drafts.js", "format/project.js", "viewer/data.js"].map(at),
      );
    const l = toLevel(get(state.lvl.draft).doc, state.lvl.draft);
    return [counted(blockCount(l), "block"), counted(objectCount(l), "object")];
  });
  const chip = page.locator("#chipLine");
  for (const count of counts) await expect(chip).toContainText(count);
  if (time !== undefined) await expect(chip).toContainText(`time ${time}`);
  if (motion === false) {
    await page.keyboard.press("v");
    await expect(page.locator("#showMotion")).not.toBeChecked();
  }
  if (textures === false) {
    await page.keyboard.press("t");
    await expect(page.locator("#showSkins")).not.toBeChecked();
  }
  if (textures === true) await textured(page);
}

// One thing drawn by itself onto a grey canvas the map's size, with the fills it made.
export const alone = (page, cell, type, frame = 0) =>
  page.evaluate(
    async ([cell, type, frame]) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ state }, { drawThing }, { cellKey }] = await Promise.all(
        ["viewer/state.js", "viewer/draw/things.js", "format/lattice.js"].map(at),
      );
      const key = cellKey(...cell);
      const m = state.idx.markers.get(key).find((m) => m.type === type);
      const { w, h, dpr } = state.view;
      const cv = document.createElement("canvas");
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "rgb(100 100 100)";
      g.fillRect(0, 0, w, h);
      const fills = [];
      const fill = g.fill;
      g.fill = function (...a) {
        fills.push([this.globalCompositeOperation, this.fillStyle]);
        return fill.apply(this, a);
      };
      drawThing(g, m, state.idx.cells.get(key), state.lvl, frame);
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      const changed = [];
      for (let i = 0; i < d.length; i += 4)
        if (d[i] !== 100 || d[i + 1] !== 100 || d[i + 2] !== 100)
          changed.push([d[i], d[i + 1], d[i + 2]]);
      return { fills, changed };
    },
    [cell, type, frame],
  );

/** The zoom the view is at, and the one a fit taken now gives it. */
export const fitted = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { fit } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    const zoom = state.cam.zoom;
    fit();
    const width = document.getElementById("cv").clientWidth;
    return { zoom, fit: state.cam.zoom, width, measured: state.view.w };
  });

/** The cell under a client point, as the readout writes it. */
export const cellUnder = (page, point) =>
  page.evaluate(async ([x, y]) => {
    const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const r = document.getElementById("cv").getBoundingClientRect();
    const c = cellAt(x - r.left, y - r.top);
    return c && `${c.x}, ${c.y}, ${c.z}`;
  }, point);

/** The hovered cell, as the readout writes it. */
export const hovered = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const c = state.hover;
    return c && `${c.x}, ${c.y}, ${c.z}`;
  });
