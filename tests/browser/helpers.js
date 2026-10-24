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

/** Hold the page's clock still and draw on it, so the level runs only as `stepped` steps it. */
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
      performance.now = real;
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
