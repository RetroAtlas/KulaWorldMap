import { expect, test } from "@playwright/test";
import { settle, still, written } from "./helpers.js";

/** The map's colour where the game's camera rests behind the ball on its start. */
const atEye = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state, screen }, { startCamera }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/overlays.js"].map(at),
    );
    const [x, y] = screen(...startCamera(state.lvl).eye);
    const cv = document.getElementById("cv");
    const k = cv.width / cv.clientWidth;
    return [...cv.getContext("2d").getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data];
  });

const amber = ([r, g, b]) => r > 200 && g > 150 && b < 150;

test("the settings hold the start camera, which keeps its key", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await expect(panel.locator("#showCamera")).toHaveCount(1);
  await expect(page.locator("#display #showCamera")).toHaveCount(0);
  await expect(panel).toBeHidden();
  expect(amber(await atEye(page))).toBe(false);
  await page.keyboard.press("c");
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  await page.locator("#settingsBtn").click();
  await expect(panel).toBeVisible();
  await expect(page.locator("#settings .x")).toBeFocused();
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await panel.getByText("Start camera").click();
  await expect(page.locator("#showCamera")).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  await expect.poll(async () => amber(await atEye(page))).toBe(false);
  await panel.getByText("Start camera").click();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
  expect(await kept()).toEqual({ camera: true });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page.locator("#settingsBtn")).toBeFocused();
  // the display's reset puts back what is under its heading, and no setting
  await page.keyboard.press("l");
  await page.keyboard.press("x");
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({ camera: true });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showCamera")).toBeChecked();
  await expect.poll(async () => amber(await atEye(page))).toBe(true);
});

test("a setting's key works inside the settings, once a press", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const panel = page.locator("#settings");
  const box = page.locator("#showCamera");
  await page.keyboard.press("Shift+s");
  await expect(panel).toBeVisible();
  await expect(box).not.toBeChecked();
  await page.keyboard.press("c");
  await expect(box).toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("off by default");
  await page.locator("#showCameraSays").click();
  await page.keyboard.press("c");
  await expect(box).not.toBeChecked();
  await expect(panel.locator("label:has(#showCamera) .def")).toHaveText("");
  // a key of the display stays the map's key, and the dialog keeps it from the map
  await page.keyboard.press("t");
  await expect(page.locator("#showSkins")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("a switch clicked leaves the keys to the map, and the slider keeps its own keys", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await page.locator("#showLabels").click();
  await expect(page.locator("#showLabels")).toBeFocused();
  await page.keyboard.press("b");
  await expect(page.locator("#showOutlines")).toBeChecked();
  const view = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/viewer/state.js", location.href).href);
      return { pan: [state.cam.panX, state.cam.panY], slice: state.slice };
    });
  const before = await view();
  await page.locator("#slice").focus();
  await page.keyboard.press("ArrowLeft");
  const after = await view();
  expect(after.pan).toEqual(before.pan);
  expect(after.slice).toBe(before.slice - 1);
});

test("a switch that does something only under another is greyed while it is off, its tick kept", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  // the clicks below are forced, which does not wait for the sidebar to finish sliding in
  await still(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  const greyed = async (ids) => {
    const all = ["showModels", "showThrough", "showLabels", "showFaces", "showHidden"];
    for (const id of all)
      if (ids.includes(id)) await expect(page.locator(`#${id}`), id).toBeDisabled();
      else await expect(page.locator(`#${id}`), id).toBeEnabled();
  };
  // the labels open off and the slice cuts nothing
  await greyed(["showFaces", "showHidden"]);
  await page.keyboard.press("l");
  await page.keyboard.press("n");
  await greyed(["showHidden"]);
  await page.keyboard.press("o");
  await greyed(["showModels", "showThrough", "showLabels", "showFaces", "showHidden"]);
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showFaces")).toBeChecked();
  expect(await kept()).toEqual({ labels: true, faces: true, objects: false });
  // its key and a click leave it as it is and say for a moment what holds it
  // back, by the whole of each name however the label is marked up
  await page.evaluate(() => {
    const label = document.getElementById("showFaces").closest("label");
    const text = [...label.childNodes].find((n) => n.textContent.includes("face"));
    const word = text.splitText(text.textContent.indexOf("face"));
    word.splitText(4);
    const em = document.createElement("em");
    word.replaceWith(em);
    em.append(word);
  });
  const said = page.locator("#toastStack .toast").first();
  await page.keyboard.press("n");
  await expect(said).toHaveText("“Name the face in labels” needs “Objects” on.");
  await page.locator("label", { has: page.locator("#showLabels") }).click({ force: true });
  await expect(said).toHaveText("“Object labels” needs “Objects” on.");
  await page.locator("#showModels").click({ force: true });
  await expect(said).toHaveText("“Objects as models” needs “Objects” on.");
  await expect(page.locator("#showFaces")).toBeChecked();
  await expect(page.locator("#showLabels")).toBeChecked();
  await expect(page.locator("#showModels")).toBeChecked();
  await expect(page.locator("label", { has: page.locator("#showFaces") })).toHaveAttribute(
    "title",
    "“Name the face in labels” needs “Objects” on.",
  );
  // a reader hears it by its name, greyed, and why
  const faces = page.getByRole("checkbox", { name: "Name the face in labels", exact: false });
  await expect(faces).toBeDisabled();
  await expect(faces).toHaveAccessibleDescription("“Name the face in labels” needs “Objects” on.");
  await page.keyboard.press("o");
  await greyed(["showHidden"]);
  expect(await written(page)).toContain("Key · top");
  // the dim waits on the slice
  await page.keyboard.press("h");
  await expect(said).toHaveText("“Dim what the slice hides” needs the slice lowered.");
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await greyed([]);
  await page.keyboard.press("h");
  await expect(page.locator("#showHidden")).toBeChecked();
  await page.keyboard.press("\\");
  await greyed(["showHidden"]);
  await expect(page.locator("#showHidden")).toBeChecked();
});

test("every switch's key is the one its row shows and the key list names", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("label.check")].map((l) => ({
      id: l.querySelector("input").id,
      key: l.querySelector("kbd")?.textContent,
    })),
  );
  expect(rows.map((r) => r.id).sort()).toEqual(
    [
      ...["showSkins", "showObjects", "showModels", "showMotion", "showThrough", "showLabels"],
      ...["showOutlines", "showBase", "panMode", "showFaces", "showHidden", "showCamera"],
      ...["showCompass", "showInvisible", "showCourse", "showDust", "playFrom", "playOn"],
    ].sort(),
  );
  // the compass and the Play switches have no key, every letter that reads as the compass being
  // taken
  expect(rows.filter((r) => !r.key).map((r) => r.id)).toEqual([
    "showCompass",
    "showInvisible",
    "showDust",
    "playFrom",
    "playOn",
  ]);
  const keyed = rows.filter((r) => r.key);
  const keys = keyed.map((r) => r.key);
  expect(new Set(keys).size).toBe(keys.length);
  // every switch free to be set: the labels on, and the slice cutting into the level
  await page.keyboard.press("l");
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    const { SIDE } = await import(new URL("js/format/lattice.js", location.href).href);
    const { setSlice } = await import(new URL("js/viewer/chrome/navigate.js", location.href).href);
    setSlice(SIDE - 2 - state.lvl.min[2]);
  });
  await expect(page.locator("input:disabled")).toHaveCount(0);
  for (const { id, key } of keyed) {
    const box = page.locator(`#${id}`);
    const was = await box.isChecked();
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id}`).toBe(!was);
    await page.keyboard.press(key);
    expect(await box.isChecked(), `${key} sets ${id} back`).toBe(was);
  }
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const listed = await page.locator("#help dt kbd").allTextContents();
  for (const key of keys) expect(listed).toContain(key);
  // Settings is no switch, so its row is found by its chord and its words
  const settings = await page.evaluate(() => {
    const dt = [...document.querySelectorAll("#help dt")].find((d) => d.textContent === "Shift+s");
    return dt?.nextElementSibling.textContent;
  });
  expect(settings).toBe("settings");
});

test("each of the six controls answers to the letter that names it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("m");
  await expect(page.locator("#showModels")).not.toBeChecked();
  await page.keyboard.press("d");
  await expect(page.locator("#panMode")).toBeChecked();
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  await expect(page.locator("#course")).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).not.toBeChecked();
  // a plain s is the sidebar's key, and Settings waits on the shifted key
  const menu = page.locator("#menuBtn");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("s");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#settings")).toBeHidden();
  await page.keyboard.press("s");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Shift+s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await page.keyboard.press("p");
  await expect(page.locator("#play")).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.locator("#play")).toBeHidden();
});

test("Display puts the game's own look first, then what the map adds, then the controls", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#display .group")].map((g) =>
      [...g.querySelectorAll("input")].map((i) => `${i.id}${i.checked ? " on" : ""}`),
    ),
  );
  expect(groups).toEqual([
    ["showSkins on", "showObjects on", "showModels on", "showMotion on"],
    ["showThrough", "showLabels", "showFaces", "showOutlines", "showBase"],
    ["panMode", "slice", "showHidden", "showCourse"],
  ]);
});

test("the keys open in a wider box than the settings and the about, which a phone narrows", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  const help = await page.locator("#help .box").boundingBox();
  expect(help.width).toBe(640);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Shift+s");
  const settings = await page.locator("#settings .box").boundingBox();
  expect(settings.width).toBe(460);
  await page.keyboard.press("Escape");
  await page.locator("#aboutBtn").click();
  const about = await page.locator("#help .box").boundingBox();
  expect(about.width).toBe(460);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 375, height: 700 });
  await page.keyboard.press("?");
  const phone = await page.locator("#help .box").boundingBox();
  expect(phone.x).toBeGreaterThanOrEqual(0);
  expect(phone.x + phone.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  // the keys take no more than half the row, the gestures wrapping before the words do
  const dl = await page.locator("#help dl").first().boundingBox();
  const dt = await page.locator("#help dt").first().boundingBox();
  expect(dt.width).toBeLessThanOrEqual(dl.width / 2 + 1);
});

test("the keys stand in one column across the sections, a long key cell wrapping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("?");
  await expect(page.locator("#help")).toBeVisible();
  const firsts = await page.evaluate(() =>
    [...document.querySelectorAll("#help section")].map((s) => {
      const key = s.querySelector("dt").getBoundingClientRect();
      const said = s.querySelector("dd").getBoundingClientRect();
      return { x: key.x, width: key.width, saidX: said.x };
    }),
  );
  expect(firsts).toHaveLength(5);
  for (const f of firsts) {
    expect(Math.abs(f.x - firsts[0].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.width - firsts[0].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(f.saidX - firsts[0].saidX)).toBeLessThanOrEqual(1);
  }
  const widths = await page
    .locator("#help dt")
    .evaluateAll((ds) => ds.map((d) => d.getBoundingClientRect().width));
  for (const w of widths) expect(w).toBeLessThanOrEqual(200);
  // a key cell longer than the column wraps onto a second line
  const rows = page.locator("#help dt");
  const drag = await rows.first().boundingBox();
  const pan = await rows.filter({ hasText: "right-drag" }).boundingBox();
  expect(pan.height).toBeGreaterThan(drag.height);
  // the narrowest phone keeps the column at the widest chord, so no key cell runs past it
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.keyboard.press("?");
  await expect(page.locator("#help")).toBeVisible();
  const cells = await page
    .locator("#help dt")
    .evaluateAll((ds) =>
      ds.map((d) => [d.getBoundingClientRect().width, d.clientWidth, d.scrollWidth]),
    );
  for (const [width, inside, needed] of cells) {
    expect(Math.abs(width - cells[0][0])).toBeLessThanOrEqual(1);
    expect(needed).toBeLessThanOrEqual(inside);
  }
});

test("the display keeps only the switches set away from their defaults", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true });
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ labels: true, motion: false });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ motion: false });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showMotion")).not.toBeChecked();
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).not.toBeChecked();
});

test("a saved switch the display does not have is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: true, gone: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).toBeChecked();
  const show = await page.evaluate(
    async () => (await import(new URL("js/viewer/state.js", location.href).href)).state.show,
  );
  expect(show).not.toHaveProperty("gone");
  await page.keyboard.press("b");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved value not of its switch's kind is left behind", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.evaluate(() =>
    localStorage.setItem(
      "kula.display",
      JSON.stringify({ labels: "yes", through: 1, outlines: true, panMode: "yes" }),
    ),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showThrough")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).toBeChecked();
  await expect(page.locator("#panMode")).not.toBeChecked();
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, outlines: true });
});

test("a saved switch stays saved until it is set again, though it matches the default", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  // a switch saved at its default, which is what a choice made against another
  // default leaves
  await page.evaluate(() =>
    localStorage.setItem("kula.display", JSON.stringify({ labels: false })),
  );
  await page.reload();
  await settle(page);
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await page.keyboard.press("x");
  expect(await kept()).toEqual({ labels: false, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true, through: true });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ through: true });
  await page.locator("#resetDisplay").click();
  expect(await kept()).toEqual({});
});
