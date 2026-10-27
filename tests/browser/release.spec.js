import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { settle, still } from "./helpers.js";
import { route, startPlay, stopOn, top } from "./playhelpers.js";

const LOCKED = "Leave play to change the release";
const BONUS_30 = "/HELL/HELL.PAK#17";
const BONUS_26 = "/MARS/MARS.PAK#16";
const SLOT_19 = "/HIRO/HIRO.PAK#19";
const GEM = 36;
const read = (path) =>
  JSON.parse(readFileSync(new URL(`../../public/${path}`, import.meta.url), "utf8"));
const [us, eu, jp] = ["us", "eu", "jp"].map((id) => read(`releases/${id}.json`));
const mapData = read("map_data.json");
const annotations = read("annotations.json");
const slotIndex = (key) => mapData.levels.findIndex((l) => `${l.pack}#${l.index}` === key);

const bar = (page) => page.locator("#release");
const button = (page, key) => page.locator(`#worlds .levels button[data-i='${slotIndex(key)}']`);
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

/** How many gems a level holds. */
const gems = (l) => l.records.reduce((n, r) => n + r.on.filter((o) => o.type === GEM).length, 0);

/** The points the level line counts. */
const points = async (page) =>
  Number(/(\d+) points/.exec(await page.locator("#chipLine").textContent())[1]);

/** The points the level on screen holds, as the map counts them. */
const total = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { levelPoints }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/points.js"].map(at),
    );
    return levelPoints(state.lvl);
  });

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
  await expect(button(page, SLOT_19)).toHaveText("OBJ LEVEL");
  expect(await shown(page)).toMatchObject({ release: "eu", li: 0, kept: "eu" });
  await page.goto("about:blank");
  await page.goto("/#MARS/11");
  await settle(page);
  await expect(pressed(page)).toHaveText("US");
  await expect(page.locator("#chipLine")).toContainText("LEVEL 132");
  expect(await shown(page)).toMatchObject({ release: "us", from: "us", kept: "eu" });
});

test("a press writes the disc at the link's tail, and a press on US takes it off", async ({
  page,
}) => {
  await page.goto("/#HELL/17/45,35/fit/33");
  await settle(page);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect.poll(() => page.url()).toMatch(/#HELL\/17\/45,35\/fit\/33\/d-eu$/);
  await press(page, "us");
  await expect(pressed(page)).toHaveText("US");
  await expect.poll(() => page.url()).toMatch(/#HELL\/17\/45,35\/fit\/33$/);
});

test("a link carrying the disc, in any case, opens its level on that disc in one install, the bar following", async ({
  page,
}) => {
  // every sentence the live region is given, in order
  await page.addInitScript(() => {
    const said = (window.__said = []);
    new MutationObserver((records) => {
      for (const r of records)
        if (r.target.id === "say") for (const n of r.addedNodes) said.push(n.textContent);
    }).observe(document, { subtree: true, childList: true });
  });
  await page.goto("/#HELL/17/45,35/fit/33/d-EU");
  await settle(page);
  await expect(pressed(page)).toHaveText("EU");
  const pal = eu.levels[BONUS_30];
  await expect(page.locator("#chipLine")).toContainText(`${pal.placed} blocks`);
  expect(await shown(page)).toMatchObject({
    release: "eu",
    from: "eu",
    li: slotIndex(BONUS_30),
    fitted: true,
    kept: null,
  });
  const said = await page.evaluate(() => window.__said);
  expect(said).toHaveLength(1);
  expect(said[0]).toMatch(
    new RegExp(`^Showing the PAL release\\. ${eu.name}, ${pal.name}, HELL, ${pal.placed} blocks`),
  );
  await expect.poll(() => page.url()).toMatch(/#HELL\/17\/45,35\/fit\/33\/d-eu$/);
});

test("a link carrying a disc code the map does not know opens the US level", async ({ page }) => {
  await page.goto("/#HELL/17/45,35/fit/33/d-eu");
  await settle(page);
  await expect(pressed(page)).toHaveText("EU");
  await page.evaluate(() => (location.hash = "#HELL/17/45,35/fit/33/d-xx"));
  await expect(pressed(page)).toHaveText("US");
  expect(await shown(page)).toMatchObject({ release: "us", from: "us" });
  await expect.poll(() => page.url()).toMatch(/#HELL\/17\/45,35\/fit\/33$/);
});

test("Back after a press returns to the US level, the bar following", async ({ page }) => {
  await page.goto("/#HELL/17");
  await settle(page);
  const chip = page.locator("#chipLine");
  await press(page, "eu");
  await expect(chip).toContainText(`${eu.levels[BONUS_30].placed} blocks`);
  await expect(button(page, SLOT_19)).toHaveText("OBJ LEVEL");
  await page.goBack();
  await expect(pressed(page)).toHaveText("US");
  await expect(button(page, SLOT_19)).toHaveText("LESSON");
  const us30 = mapData.levels[slotIndex(BONUS_30)];
  await expect(chip).toContainText(`${us30.placed} blocks`);
  await expect(page.locator("#say")).toHaveText(
    new RegExp(`^Showing the North American release\\. ${us30.name}, HELL, ${us30.placed} blocks`),
  );
  expect(await shown(page)).toMatchObject({
    release: "us",
    from: "us",
    li: slotIndex(BONUS_30),
    kept: "eu",
  });
});

test("a link carrying the disc opened while the ball is on the level leaves play, as any link does", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await still(page);
  await startPlay(page);
  await page.evaluate(() => (location.hash = "#HIRO/0/45,35/fit/33/d-eu"));
  await expect(page.locator("#play")).toBeHidden();
  await expect(pressed(page)).toHaveText("EU");
  await expect(bar(page).locator("button:disabled")).toHaveCount(0);
  expect(await shown(page)).toMatchObject({ release: "eu", li: 0 });
});

test("the bar is disabled while the ball is on the level, and enabled again once play is left", async ({
  page,
}) => {
  await page.goto("/#HIRO/0/45,35/fit/33");
  await settle(page);
  await still(page);
  await startPlay(page);
  await expect(bar(page).locator("button:disabled")).toHaveCount(3);
  await expect(bar(page).locator(`button[title="${LOCKED}"]`)).toHaveCount(3);
  await page.locator("#leaveBtn").click();
  await expect(page.locator("#play")).toBeHidden();
  await expect(bar(page).locator("button:disabled")).toHaveCount(0);
  await expect(bar(page).locator('button[data-release="eu"]')).toHaveAttribute(
    "title",
    `${eu.name}, the PAL release (${eu.serial})`,
  );
});

test("the live region says the disc on a press", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const level = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(level);
  await press(page, "jp");
  await expect(page.locator("#say")).toHaveText(
    `Showing the Japanese release. ${jp.name}, ${level}`,
  );
});

test("the disc's tag stands on the level line after a press of EU, the game and its release in its tooltip, and goes on US", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const tag = page.locator("#chipLine .tag");
  await expect(tag).toHaveCount(0);
  await press(page, "eu");
  await expect(tag).toHaveText("EU");
  await expect(tag).toHaveAttribute("title", `${eu.name}, the PAL release`);
  await press(page, "us");
  await expect(tag).toHaveCount(0);
});

test("the canvas's label opens with the game's name on a disc other than the US one", async ({
  page,
}) => {
  await page.goto("/#HELL/17/45,35/fit/33/d-eu");
  await settle(page);
  const pal = eu.levels[BONUS_30];
  await expect(page.locator("#cv")).toHaveAttribute(
    "aria-label",
    new RegExp(`^${eu.name}, ${pal.name}, HELL, ${pal.placed} blocks`),
  );
  await press(page, "us");
  const us30 = mapData.levels[slotIndex(BONUS_30)];
  await expect(page.locator("#cv")).toHaveAttribute(
    "aria-label",
    new RegExp(`^${us30.name}, HELL, ${us30.placed} blocks`),
  );
});

test("a draft on screen keeps the bar live, a press changes the points its line shows where it holds an hourglass, and Back takes the game's name off the canvas's label", async ({
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
  await expect(page.locator("#chipLine .tag")).toHaveText(["Draft", "EU"]);
  await expect(page.locator("#cv")).toHaveAttribute(
    "aria-label",
    new RegExp(`^${eu.name}, Draft, `),
  );
  expect(await shown(page)).toMatchObject({ release: "eu", li: -1, draft: 1 });
  await page.goBack();
  await expect(pressed(page)).toHaveText("US");
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^Draft, /);
});

test("a dot stands on the button of every slot that differs between the discs, whichever is shown, its title naming them", async ({
  page,
}) => {
  await page.goto("/#MARS/11");
  await settle(page);
  const marked = page.locator("#worlds .levels button:has(.diff)");
  const slots = [...new Set([...Object.keys(eu.levels), ...Object.keys(jp.levels)])]
    .map(slotIndex)
    .sort((a, b) => a - b);
  expect(slots).toHaveLength(17);
  await expect(marked).toHaveCount(17);
  const dotted = await marked.evaluateAll((bs) => bs.map((b) => Number(b.dataset.i)));
  expect(dotted.sort((a, b) => a - b)).toEqual(slots);
  const titles = await marked.evaluateAll((bs) => bs.map((b) => b.title));
  for (const t of titles) expect(t).toMatch(/, differs on the .+ discs?$/);
  await expect(button(page, "/MARS/MARS.PAK#11")).toHaveAttribute(
    "title",
    "LEVEL 132, differs on the PAL and Japanese discs",
  );
  await expect(button(page, BONUS_30)).toHaveAttribute(
    "title",
    "BONUS 30, differs on the PAL disc",
  );
  await expect(button(page, "/HILLS/HILLS.PAK#15")).toHaveAttribute(
    "title",
    "BONUS 4, differs on the Japanese disc",
  );
  await expect(marked.first().locator(".diff")).toHaveAttribute("aria-hidden", "true");
  await expect(button(page, "/HIRO/HIRO.PAK#0")).toHaveAttribute("title", "LEVEL 1");
  await expect(button(page, "/HIRO/HIRO.PAK#0").locator(".diff")).toHaveCount(0);
  await press(page, "jp");
  await expect(pressed(page)).toHaveText("JP");
  await expect(marked).toHaveCount(17);
});

test("HIRO's slot 19 reads OBJ LEVEL after a press of EU and LESSON after US, its mark and its dot kept", async ({
  page,
}) => {
  await page.goto("/#HIRO/19");
  await settle(page);
  const b = button(page, SLOT_19);
  await expect(b).toHaveText("LESSON");
  await expect(b).toHaveAttribute("title", "LESSON, differs on the PAL disc");
  await expect(b).toHaveAttribute("aria-current", "true");
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect(b).toHaveText("OBJ LEVEL");
  await expect(b).toHaveAttribute("title", "OBJ LEVEL, differs on the PAL disc");
  await expect(b).toHaveAttribute("aria-current", "true");
  await expect(b.locator(".diff")).toHaveCount(1);
  await press(page, "us");
  await expect(pressed(page)).toHaveText("US");
  await expect(b).toHaveText("LESSON");
});

test("a search's list shown under US is built anew after a press of JP, with the gems that disc has", async ({
  page,
}) => {
  await page.goto("/#MARS/16");
  await settle(page);
  await page.locator("#search").fill("gem");
  const here = page.locator("#results [role=group]").first();
  await expect(here).toHaveAttribute("aria-label", "MARS · BONUS 26");
  const rows = here.locator("[role=option]");
  await expect(rows).toHaveCount(gems(mapData.levels[slotIndex(BONUS_26)]));
  await press(page, "jp");
  await expect(pressed(page)).toHaveText("JP");
  await expect(rows).toHaveCount(gems(jp.levels[BONUS_26]));
  await expect(page.locator("#search")).toHaveValue("gem");
});

test("a search's list shown beside a draft is built anew when the disc changes, LESSON leaving on a press of EU and returning with Back", async ({
  page,
}) => {
  await page.goto("/#HIRO/19");
  await settle(page);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#chipLine .tag")).toHaveText("Draft");
  await page.locator("#search").fill("lesson");
  const rows = page.locator("#results [role=group][aria-label=Levels] [role=option]");
  await expect(rows).toHaveCount(1);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect(rows).toHaveCount(0);
  await page.goBack();
  await expect(pressed(page)).toHaveText("US");
  await expect(rows).toHaveCount(1);
});

test("a route planned on BONUS 30 under US is kept apart from one planned under EU, each back on its disc", async ({
  page,
}) => {
  await page.goto("/#HELL/17/45,35/fit/33");
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  await expect(page.locator("#showCourse")).toBeChecked();
  const line = page.locator("#courseLine");
  await expect(line).toHaveText("Route planner · 0 stops");
  const first = await top(page, [18, 21, 21]);
  await page.mouse.click(first.x, first.y);
  await expect(line).toHaveText("Route planner · 2 stops");
  const onUs = await route(page);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  await expect(line).toHaveText("Route planner · 0 stops");
  expect(await route(page)).toBeNull();
  await still(page);
  const second = await top(page, [20, 8, 7]);
  await page.mouse.click(second.x, second.y);
  await expect(line).toHaveText("Route planner · 2 stops");
  const onEu = await route(page);
  expect(onEu).not.toEqual(onUs);
  await press(page, "us");
  await expect(pressed(page)).toHaveText("US");
  await expect(line).toHaveText("Route planner · 2 stops");
  expect(await route(page)).toEqual(onUs);
  await press(page, "eu");
  await expect(pressed(page)).toHaveText("EU");
  expect(await route(page)).toEqual(onEu);
  const keys = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem("kula.course")).by).sort(),
  );
  expect(keys).toEqual(["HELL/17", "HELL/17@eu"]);
});

test("a route planned on BONUS 30 under US stays through a press of JP, which ships the US level there", async ({
  page,
}) => {
  await page.goto("/#HELL/17/45,35/fit/33");
  await settle(page);
  await still(page);
  await page.keyboard.press("r");
  const line = page.locator("#courseLine");
  await expect(line).toHaveText("Route planner · 0 stops");
  await stopOn(page, [18, 21, 21]);
  await expect(line).toHaveText("Route planner · 2 stops");
  const planned = await route(page);
  await press(page, "jp");
  await expect(pressed(page)).toHaveText("JP");
  await expect(line).toHaveText("Route planner · 2 stops");
  expect(await route(page)).toEqual(planned);
});

test("BONUS 26's note after a press of JP is that disc's own, and its line reads the total with no best score", async ({
  page,
}) => {
  await page.goto("/#MARS/16");
  await settle(page);
  const chip = page.locator("#chipLine");
  const note = page.locator("#chipNote");
  const entry = annotations.levels[BONUS_26];
  await expect(chip).toContainText(`${entry.score} of ${await total(page)} points`);
  await expect(note).toContainText(entry.note);
  await press(page, "jp");
  await expect(pressed(page)).toHaveText("JP");
  await expect(note).toContainText(entry.releases.jp.note);
  await expect(chip).toContainText(`${await total(page)} points`);
  await expect(chip).not.toContainText(" of ");
});
