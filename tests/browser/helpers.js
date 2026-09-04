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
