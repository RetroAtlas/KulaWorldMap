import { expect, test } from "@playwright/test";
import { cellUnder, frame, hovered, settle, still, trackErrors } from "./helpers.js";

/** Rest the pointer on the top of the level's start, and give the client point it rests at. */
const restOnStart = (page) =>
  page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const [start] = state.lvl.records.filter((r) => r.on.some((o) => o.type === 30));
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(start.x + 0.5, start.y + 0.5, start.z);
    const at = [r.left + x, r.top + y];
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: at[0], clientY: at[1] }));
    return at;
  });

test("a level changed under a still pointer leaves no word of the cell it was over", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  await expect(page.locator("#tip")).toContainText("Start · top");
  await expect(page.locator("#readout")).toContainText("19, 19, 17");
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).toContainText("LEVEL 44");
  // a block of the new level lies under the pointer, named only once it moves
  expect(await cellUnder(page, point)).toBeTruthy();
  await frame(page);
  expect(await hovered(page)).toBeNull();
  await expect(page.locator("#tip")).toBeHidden();
  await expect(page.locator("#readout")).not.toContainText("19, 19, 17");
  expect(errors).toEqual([]);
});

test("the readout follows the camera with the pointer off the map", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HAZEFI/1");
  await settle(page);
  await still(page);
  const zoom = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return `×${state.cam.zoom.toFixed(2)}`;
    });
  const fitted = await zoom();
  expect(fitted).not.toBe("×1.00");
  await expect(page.locator("#readout")).toHaveText(`${fitted}  45° / 35°`);
  await page.keyboard.press("+");
  const zoomed = await zoom();
  expect(zoomed).not.toBe(fitted);
  await expect(page.locator("#readout")).toHaveText(`${zoomed}  45° / 35°`);
  expect(errors).toEqual([]);
});

test("the readout says nothing and the corner stays hidden while no level is on screen", async ({
  page,
}) => {
  // the blocked data is an error on the console, so only the page's own errors are counted
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/map_data.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#chip")).toContainText("could not be loaded");
  await still(page);
  await expect(page.locator("#readout")).toHaveText("");
  await expect(page.locator("#corner")).toBeHidden();
  await page.evaluate(() => {
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: 700, clientY: 400 }));
    cv.dispatchEvent(new PointerEvent("pointerleave", { clientX: 700, clientY: 400 }));
  });
  await frame(page);
  await expect(page.locator("#readout")).toHaveText("");
  expect(errors).toEqual([]);
});

test("a camera moved under a still pointer names the cell now under it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  let was = await cellUnder(page, point);
  expect(await hovered(page)).toBe(was);
  const moves = [
    ["a snap of the turn", () => page.keyboard.press("e")],
    ["a zoom key", () => page.keyboard.press("+")],
    // the view is not framed, so a resize moves the picture and writes no link
    [
      "a resize",
      async () => {
        await page.setViewportSize({ width: 1100, height: 640 });
        await still(page);
      },
    ],
  ];
  for (const [what, move] of moves) {
    await move();
    const now = await cellUnder(page, point);
    expect(now, what).toBeTruthy();
    expect(now, what).not.toBe(was);
    await expect.poll(() => hovered(page), what).toBe(now);
    await expect(page.locator("#tip"), what).toContainText(now);
    await expect(page.locator("#readout"), what).toContainText(now);
    was = now;
  }
  expect(errors).toEqual([]);
});

test("a zoom under a still pointer paints the pick about the pointer alone", async ({ page }) => {
  const errors = trackErrors(page);
  // the pick is the one canvas read back often, and its fills are counted
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      if (opts?.willReadFrequently) window.__pick = this;
      return getContext.call(this, type, opts);
    };
    const fill = CanvasRenderingContext2D.prototype.fill;
    window.__fills = 0;
    CanvasRenderingContext2D.prototype.fill = function (...a) {
      if (this.canvas === window.__pick) window.__fills++;
      return fill.apply(this, a);
    };
  });
  await page.goto("/#INCA/14/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  const was = await cellUnder(page, point);
  expect(await hovered(page)).toBe(was);
  const fills = () => page.evaluate(() => window.__fills);
  const whole = await page.evaluate(async ([x, y]) => {
    const { invalidatePick, cellAt } = await import(
      new URL("js/viewer/draw/render.js", location.href).href
    );
    const r = document.getElementById("cv").getBoundingClientRect();
    window.__fills = 0;
    invalidatePick();
    cellAt(x - r.left, y - r.top);
    return window.__fills;
  }, point);
  expect(whole).toBeGreaterThan(100);
  await page.evaluate(([x, y]) => {
    window.__fills = 0;
    document
      .getElementById("cv")
      .dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: x, clientY: y, cancelable: true }),
      );
  }, point);
  await frame(page);
  // the zoom keeps the point under the pointer where it is, so the cell holds
  await expect.poll(() => hovered(page)).toBe(was);
  expect(await fills()).toBeGreaterThan(0);
  expect(await fills()).toBeLessThan(whole / 4);
  // a move elsewhere finds the cell there as a whole pick does
  const other = await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/viewer/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/viewer/draw/render.js", location.href).href);
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const tops = [...state.idx.cells.values()].sort((a, b) => a.z - b.z);
    for (const c of tops) {
      const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
      const at = cellAt(x, y);
      if (!at || (at.x === c.x && at.y === c.y && at.z === c.z)) continue;
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }),
      );
      return `${at.x}, ${at.y}, ${at.z}`;
    }
    const c = tops.at(-1);
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
    return `${c.x}, ${c.y}, ${c.z}`;
  });
  expect(other).not.toBe(was);
  await expect.poll(() => hovered(page)).toBe(other);
  expect(errors).toEqual([]);
});

test("a zoom under a still pointer leaves the tip as it stands", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const point = await restOnStart(page);
  await expect(page.locator("#tip")).toContainText("Start · top");
  const was = await hovered(page);
  await page.evaluate(([x, y]) => {
    window.__changes = 0;
    new MutationObserver((records) => (window.__changes += records.length)).observe(
      document.getElementById("tip"),
      { childList: true, characterData: true, attributes: true, subtree: true },
    );
    document
      .getElementById("cv")
      .dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: x, clientY: y, cancelable: true }),
      );
  }, point);
  await frame(page);
  await frame(page);
  expect(await hovered(page)).toBe(was);
  await expect(page.locator("#tip")).toContainText("Start · top");
  expect(await page.evaluate(() => window.__changes)).toBe(0);
  expect(errors).toEqual([]);
});

test("a drag names the cell under the pointer once it lets go, and not before", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#INCA/12/45,35");
  await settle(page);
  await still(page);
  const [x, y] = await restOnStart(page);
  const was = await hovered(page);
  const at = (type, point) =>
    page.evaluate(
      ([type, [x, y]]) =>
        document
          .getElementById("cv")
          .dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1 })),
      [type, point],
    );
  const to = [x + 40, y + 20];
  await at("pointerdown", [x, y]);
  await at("pointermove", to);
  await frame(page);
  expect(await hovered(page)).toBe(was);
  await at("pointerup", to);
  const now = await cellUnder(page, to);
  expect(now).toBeTruthy();
  expect(now).not.toBe(was);
  await expect.poll(() => hovered(page)).toBe(now);
  await expect(page.locator("#tip")).toContainText(now);
  await expect(page.locator("#readout")).toContainText(now);
  expect(errors).toEqual([]);
});

test("a write inside the settle window carries the view it is given: a slice, a change of level, Back, a hash, a dialog, the page out of sight or leaving", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await still(page);
  await page.evaluate(() => {
    window.__wrote = { push: 0, replace: 0 };
    for (const way of ["pushState", "replaceState"]) {
      const orig = history[way].bind(history);
      history[way] = (...a) => {
        window.__wrote[way === "pushState" ? "push" : "replace"]++;
        return orig(...a);
      };
    }
  });
  const wrote = () => page.evaluate(() => ({ ...window.__wrote }));
  const entries = () => page.evaluate(() => history.length);
  const key = (k) =>
    `document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "${k}", bubbles: true }))`;
  // a script of inputs in one breath, with a drag among them; the turn the drag made comes back
  const script = (steps) =>
    page.evaluate(async (steps) => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      const cv = document.getElementById("cv");
      const at = (type, x) =>
        cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: 400, pointerId: 1 }));
      let yaw = null;
      for (const step of steps) {
        if (step === "drag") {
          at("pointerdown", 600);
          at("pointermove", 660);
          at("pointerup", 660);
          yaw = ((Math.round(state.cam.yaw) % 360) + 360) % 360;
        } else if (step === "hide") {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
        } else if (step === "leave") dispatchEvent(new Event("pagehide"));
        else if (step === "back") history.back();
        else if (step.startsWith("#")) location.hash = step;
        else new Function(step)();
      }
      return yaw;
    }, steps);
  // a slice straight after a drag names the slice, and the turn the drag made
  let turned = await script(["drag", key(",")]);
  expect(turned).not.toBe(45);
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${turned},35/.*/32$`));
  // a slice, a drag and a change of level in one frame: the entry left holds the slice and the turn
  let booted = await entries();
  turned = await script([key(","), "drag", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\//);
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/0/${turned},35/.*/31$`));
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/1\//);
  // a change of level straight after a drag pushes the new level over an entry holding the turn
  booted = await entries();
  turned = await script(["drag", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 3");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/1/${turned},35/`));
  const beneath = page.url();
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  // Back straight after a drag drops the write waiting: the entry gone back to stands, and nothing is written
  const before = await wrote();
  await script(["drag", "back"]);
  await expect.poll(() => page.url()).toBe(beneath);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 2");
  // whatever write still waits is made now rather than after the settle
  await page.evaluate(() =>
    import(new URL("js/viewer/chrome/navigate.js", location.href).href).then((N) => N.settle()),
  );
  expect(page.url()).toBe(beneath);
  expect(await wrote()).toEqual(before);
  // a hash arriving in the frame of a change of level drops the push, and the hash is read
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/2\//);
  booted = await entries();
  await script(["#HIRO/5", key("]")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 6");
  await expect.poll(() => page.url()).toMatch(/#HIRO\/5\//);
  expect(await entries()).toBe(booted + 1);
  // a change of level, a drag and a slice in one frame: the drag belongs to the level entered,
  // whose slice stands at its top again
  booted = await entries();
  const stood = page.url();
  turned = await script([key("]"), "drag", key(",")]);
  await expect(page.locator("#chip b")).toHaveText("LEVEL 7");
  await expect.poll(() => page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/32$`));
  expect(await entries()).toBe(booted + 1);
  await page.goBack();
  await expect.poll(() => page.url()).toBe(stood);
  await page.goForward();
  await expect.poll(() => page.url()).toMatch(/#HIRO\/6\//);
  // a dialog opened straight after a drag stands on an entry holding the turn
  turned = await script(["drag", key("?")]);
  await expect(page.locator("#help")).toBeVisible();
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/`));
  await page.keyboard.press("Escape");
  await expect(page.locator("#help")).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/`));
  // a page put out of sight, or on its way out, writes the state of the moment: a slice made
  // after the drag, which a kept view written on its own would leave out
  turned = await script([key(","), "drag", key(","), "hide"]);
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/30$`));
  turned = await script([key(","), "drag", key(","), "leave"]);
  expect(page.url()).toMatch(new RegExp(`#HIRO/6/${turned},35/.*/28$`));
});
