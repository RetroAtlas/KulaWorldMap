import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { settle, still } from "./helpers.js";
import { startPlay } from "./playhelpers.js";

const LOCKED = "Leave play to change the release";
const BONUS_30 = "/HELL/HELL.PAK#17";
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../../public/${path}`, import.meta.url), "utf8"));
const [us, eu, jp] = ["us", "eu", "jp"].map((id) => read(`releases/${id}.json`));
const mapData = read("map_data.json");
const slotIndex = (key) => mapData.levels.findIndex((l) => `${l.pack}#${l.index}` === key);

const bar = (page) => page.locator("#release");
const pressed = (page) => bar(page).locator('button[aria-pressed="true"]');
const press = (page, id) => bar(page).locator(`button[data-release="${id}"]`).click();

/** The release shown, the level and the view as the page holds them, and the choice kept. */
const shown = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { current }] = await Promise.all(
      ["viewer/state.js", "viewer/release.js"].map(at),
    );
    return {
      release: current(),
      from: state.lvl.release ?? "us",
      li: state.li,
      draft: state.lvl.draft ?? null,
      selected: state.selected?.key ?? null,
      yaw: state.cam.yaw,
      pitch: state.cam.pitch,
      zoom: state.cam.zoom,
      fitted: state.framing !== null,
      kept: localStorage.getItem("kula.release"),
    };
  });

/** The points the level line counts. */
const points = async (page) =>
  Number(/(\d+) points/.exec(await page.locator("#chipLine").textContent())[1]);

test("the bar stands in the Worlds heading with US pressed, and a press of EU installs the PAL BONUS 30", async ({
  page,
}) => {
  await page.goto("/#HELL/17");
  await settle(page);
  const heading = page.locator("h2", { has: bar(page) });
  await expect(heading).toHaveCount(1);
  await expect(heading).toContainText("Worlds");
  const buttons = bar(page).getByRole("button");
  await expect(buttons).toHaveText([us.label, eu.label, jp.label]);
  await expect(buttons.nth(1)).toHaveAttribute(
    "title",
    `${eu.name}, the PAL release (${eu.serial})`,
  );
  await expect(buttons.nth(2)).toHaveAttribute(
    "aria-label",
    `${jp.name}, the Japanese release (${jp.serial})`,
  );
  await expect(pressed(page)).toHaveText("US");
  const chip = page.locator("#chipLine");
  await expect(chip).toContainText(`${mapData.levels[slotIndex(BONUS_30)].placed} blocks`);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect(chip).toContainText(`${eu.levels[BONUS_30].placed} blocks`);
  expect(await shown(page)).toMatchObject({ release: "eu", from: "eu", li: slotIndex(BONUS_30) });
});

test("a press on a level the discs share keeps the view and the selected cell", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/40,30/1.20/17.5,17.5,17.5/0,0/33/17,17,17");
  await settle(page);
  const where = page.locator("#detail .sub").first();
  await expect(where).toContainText("cell 17,17,17");
  const before = await shown(page);
  expect(before.selected).not.toBeNull();
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect(page.locator("#detail")).toBeVisible();
  await expect(where).toContainText("cell 17,17,17");
  expect(await shown(page)).toMatchObject({
    release: "eu",
    from: "us",
    li: 0,
    selected: before.selected,
    yaw: before.yaw,
    pitch: before.pitch,
    zoom: before.zoom,
  });
});

test("a press on BONUS 30 while it is fitted frames the PAL level afresh, and after a hand turn keeps the view", async ({
  page,
}) => {
  await page.goto("/#HELL/17/45,35/fit/33");
  await settle(page);
  await still(page);
  const fit = await shown(page);
  expect(fit.fitted).toBe(true);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  const refit = await shown(page);
  expect(refit.fitted).toBe(true);
  expect(refit.yaw).toBe(fit.yaw);
  expect(refit.zoom).not.toBe(fit.zoom);
  const box = await page.locator("#cv").boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 4 });
  await page.mouse.up();
  const turned = await shown(page);
  expect(turned.fitted).toBe(false);
  expect(turned.yaw).not.toBe(refit.yaw);
  await press(page, "us");
  await expect(pressed(page)).toHaveText("US");
  expect(await shown(page)).toMatchObject({
    from: "us",
    yaw: turned.yaw,
    pitch: turned.pitch,
    zoom: turned.zoom,
    fitted: false,
  });
});

test("the choice survives a reload of the bare site, and a bare level link opens the US level with EU kept", async ({
  page,
}) => {
  await page.goto("/");
  await settle(page);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  expect((await shown(page)).kept).toBe("eu");
  await page.goto("about:blank");
  await page.goto("/");
  await settle(page);
  await expect(pressed(page)).toHaveText("EU");
  expect(await shown(page)).toMatchObject({ release: "eu", li: 0, kept: "eu" });
  await page.goto("about:blank");
  await page.goto("/#MARS/11");
  await settle(page);
  await expect(pressed(page)).toHaveText("US");
  await expect(page.locator("#chipLine")).toContainText("LEVEL 132");
  expect(await shown(page)).toMatchObject({ release: "us", from: "us", kept: "eu" });
});

test("the bar is disabled while the ball is on the level, and enabled again once play is left", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await still(page);
  await startPlay(page);
  await expect(bar(page).locator("button:disabled")).toHaveCount(3);
  await expect(bar(page)).toHaveAttribute("title", LOCKED);
  await page.locator("#leaveBtn").click();
  await expect(page.locator("#play")).toBeHidden();
  await expect(bar(page).locator("button:disabled")).toHaveCount(0);
  await expect(bar(page)).not.toHaveAttribute("title", /./);
});

test("the live region says the disc on a press", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const level = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(level);
  await press(page, "jp");
  await expect(page.locator("#say")).toHaveText(
    `Showing ${jp.name}, the Japanese release. ${level}`,
  );
});

test("a draft on screen keeps the bar live, and a press changes the points its line shows where it holds an hourglass", async ({
  page,
}) => {
  await page.goto("/#HIRO/5");
  await settle(page);
  // an override on the hourglass's points stands in for the disc's own figures
  await page.evaluate(async () => {
    const { setAnnotations } = await import(new URL("js/viewer/data.js", location.href).href);
    const ann = await (await fetch("annotations.json")).json();
    const [, hourglass] = Object.entries(ann.types).find(([, e]) => e.name === "Hourglass");
    hourglass.releases = { eu: { points: hourglass.points - 200 } };
    setAnnotations(ann);
  });
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  const before = await points(page);
  await expect(bar(page).locator("button:disabled")).toHaveCount(0);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect.poll(() => points(page)).toBe(before - 200);
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  expect(await shown(page)).toMatchObject({ release: "eu", li: -1, draft: 1 });
});
