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
    const st = await import(new URL("js/state.js", location.href).href);
    const deadline = Date.now() + 30000;
    while (!(st.state.lvl && document.getElementById("cv").clientWidth > 0)) {
      if (Date.now() > deadline) throw new Error("settle timeout");
      await new Promise(requestAnimationFrame);
    }
  });
}

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
    const [{ state }, { atlasFor }] = await Promise.all(["state.js", "atlas.js"].map(at));
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
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
    const { draw } = await import(new URL("js/render.js", location.href).href);
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
