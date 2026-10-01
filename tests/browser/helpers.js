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
