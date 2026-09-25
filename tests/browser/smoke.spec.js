import { test, expect } from "@playwright/test";
import { trackErrors, settle, frame } from "./helpers.js";

test("the map boots into standards mode with nothing on the console", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await settle(page);
  expect(await page.evaluate(() => document.compatMode)).toBe("CSS1Compat");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  expect(errors).toEqual([]);
});

test("a permalink opens on the level and the camera it names", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/1.25/18,13,17/0,0/25");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { name: state.lvl.name, ...state.cam, slice: state.slice, target: state.target };
  });
  expect(cam.name).toBe("LEVEL 12");
  expect(cam.yaw).toBe(30);
  expect(cam.pitch).toBe(20);
  expect(cam.zoom).toBeCloseTo(1.25, 5);
  expect(cam.slice).toBe(25);
  expect(cam.target).toEqual([18, 13, 17]);
});

test("a permalink keeps the parts it can read and drops the rest", async ({ page }) => {
  await page.goto("/#HIRO/11/30,20/0/18,13,17/x/3.5");
  await settle(page);
  const cam = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { ...state.cam, slice: state.slice, target: state.target };
  });
  expect([cam.yaw, cam.pitch]).toEqual([30, 20]);
  expect(cam.zoom).toBeGreaterThan(0);
  expect(cam.target).toEqual([18, 13, 17]);
  expect(cam.slice).toBe(33);
});

test("a permalink carries the selected block, and opens with it selected", async ({ page }) => {
  await page.goto("/#HIRO/11/45,35/1/21.5,13.5,18.5/0,0/33/21,13,18");
  await settle(page);
  await expect(page.locator("#detail")).toContainText("cell 21,13,18");
  await expect(page.locator("#detail")).toContainText("Key");
  // a click selects without making an entry, and Escape takes the block back out
  const entries = await page.evaluate(() => history.length);
  await page.keyboard.press("Escape");
  await frame(page);
  expect(page.url()).toMatch(/\/33$/);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell([...state.idx.cells.values()][0]);
  });
  await frame(page);
  expect(page.url()).toMatch(/\/33\/\d+,\d+,\d+$/);
  expect(await page.evaluate(() => history.length)).toBe(entries);
});

test("a link naming a pack and a slot opens that level, whatever its case", async ({ page }) => {
  await page.goto("/#copycat/4/30,20");
  await settle(page);
  await frame(page);
  await expect(page.locator("#chip")).toContainText("SIMON 5");
  expect(page.url()).toContain("#COPYCAT/4/30,20/");
});

test("a hash naming no level puts the address bar back", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.evaluate(() => (location.hash = "#nonsense"));
  await frame(page);
  expect(page.url()).toContain("#HIRO/11/");
  await page.evaluate(() => (location.hash = "#HIRO/99"));
  await frame(page);
  expect(page.url()).toContain("#HIRO/11/");
});

test("a change of level or a find is a history entry; a turn is not", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await frame(page);
  const entries = () => page.evaluate(() => history.length);
  const level = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return { li: state.li, target: state.target, selected: !!state.selected };
    });
  const drag = () =>
    page.evaluate(() => {
      const cv = document.getElementById("cv");
      cv.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 640, clientY: 420, pointerId: 1 }),
      );
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 640, clientY: 420, pointerId: 1 }));
    });
  const booted = await entries();
  await drag();
  await frame(page);
  expect(await entries()).toBe(booted);

  await page.keyboard.press("]");
  await frame(page);
  expect(await entries()).toBe(booted + 1);
  expect(page.url()).toContain("#HIRO/1/");
  await page.locator("#search").fill("key");
  await page.locator("#search").press("Enter");
  await frame(page);
  expect(await entries()).toBe(booted + 2);
  const found = await level();
  expect(found.selected).toBe(true);

  // the entry the viewer made is not read back, so the find stays selected
  await frame(page);
  expect((await level()).selected).toBe(true);

  await page.goBack();
  await expect.poll(async () => (await level()).target).not.toEqual(found.target);
  expect((await level()).li).toBe(1);
  await page.goBack();
  await expect.poll(async () => (await level()).li).toBe(0);
  await expect(page.locator("#chip")).toContainText("LEVEL 1");
  await page.goForward();
  await expect.poll(async () => (await level()).li).toBe(1);
});

test("going back to another view of the same level keeps the kinds hidden in it", async ({
  page,
}) => {
  await page.goto("/#HIRO/1");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("coin");
  await search.press("Enter");
  await page.keyboard.press("/");
  await search.press("ArrowDown");
  await search.press("Enter");
  await frame(page);
  await page.locator("#kinds .kind").first().click();
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  const before = await hidden();
  expect(before).toHaveLength(1);
  const selected = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return state.selected && [state.selected.x, state.selected.y, state.selected.z];
    });
  const second = await selected();
  await page.goBack();
  await expect.poll(selected).not.toEqual(second);
  await frame(page);
  expect(await hidden()).toEqual(before);
  // the find gone back to is selected again, and the view turns about it
  const first = await selected();
  expect(first).not.toBeNull();
  const target = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return state.target;
  });
  expect(target).toEqual(first.map((v) => v + 0.5));
});

test("the camera writes the URL once a frame, not once an event", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const calls = await page.evaluate(() => {
    let n = 0;
    const orig = history.replaceState.bind(history);
    history.replaceState = (...a) => {
      n++;
      return orig(...a);
    };
    const cv = document.getElementById("cv");
    cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }));
    for (let i = 0; i < 60; i++)
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 600 + i, clientY: 400 + i, pointerId: 1 }),
      );
    for (let i = 0; i < 20; i++)
      cv.dispatchEvent(
        new WheelEvent("wheel", { deltaY: -50, clientX: 600, clientY: 400, cancelable: true }),
      );
    cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 660, clientY: 460, pointerId: 1 }));
    history.replaceState = orig;
    return n;
  });
  expect(calls).toBe(0);
  await frame(page);
  expect(page.url()).toMatch(/#HIRO\/0\//);
});

test("clicking the start's block opens the object standing on it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 30));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  const detail = page.locator("#detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Start");
  await expect(detail).toContainText("on the top");
  await expect(detail.locator(".tag", { hasText: "Hazard" })).toHaveCount(0);
});

test("a hazard says so in its heading", async ({ page }) => {
  await page.goto("/#HIRO/3");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 12));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  const spikes = page.locator("#detail h3", { hasText: "Spikes" });
  await expect(spikes.locator(".tag")).toHaveText("Hazard");
  const gap = await spikes.evaluate(
    (h) => h.getBoundingClientRect().right - h.querySelector(".tag").getBoundingClientRect().right,
  );
  expect(gap).toBeLessThan(1);

  await page.goto("/#INCA/4");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const c = state.lvl.cells;
    const i = c.findIndex((v, j) => j % 4 === 3 && v === 1) - 3;
    showCell({ x: c[i], y: c[i + 1], z: c[i + 2], v: 1 });
  });
  const block = page.locator("#detail h3").first();
  await expect(block).toContainText("Fire block");
  await expect(block.locator(".tag")).toHaveText("Hazard");

  const farEnd = async (hash) => {
    await page.goto(hash);
    await settle(page);
    await page.evaluate(async () => {
      const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const r = state.lvl.records.find((r) => r.kind === 8);
      const own = [r.x, r.y, r.z].join();
      const end = [r.f.slice(2, 5), r.f.slice(5, 8)].find((e) => e.join() !== own);
      showCell(state.idx.cells.get(cellKey(...end)));
    });
    return page.locator("#detail h3").first();
  };
  const added = await farEnd("/#COPYCAT/7");
  await expect(added).toContainText("Laser end");
  await expect(added.locator(".tag")).toHaveText("Hazard");
  const plain = await farEnd("/#INCAFI/1");
  await expect(plain).toContainText("Block");
  await expect(plain.locator(".tag")).toHaveText("Hazard");
  await expect(page.locator("#detail")).toContainText("One end of a laser.");
});

const headings = (page) =>
  page.locator("#detail h3").evaluateAll((hs) =>
    hs.map((h) =>
      [...h.childNodes]
        .filter((n) => !n.classList?.contains("tag"))
        .map((n) => n.textContent)
        .join("")
        .trim(),
    ),
  );

test("a block that is a thing of its own is named once, with what its record holds", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex(
      (r) =>
        r.kind === 6 &&
        state.lvl.records.some((s) => s.kind === 9 && s.x === r.x && s.y === r.y && s.z === r.z),
    );
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  expect(await headings(page)).toEqual(["Crumbling block", "Level settings"]);
  const block = page.locator("#detail table").first();
  for (const label of ["points", "kind", "type", "record", "f2 position x", "unset"])
    await expect(block.locator("td", { hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
  await expect(page.locator("#detail p", { hasText: /^Placed / })).toHaveCount(2);
});

test("a whole block of fire or ice reads apart from one face of it", async ({ page }) => {
  for (const [hash, title, kind, block, face] of [
    ["#INCA/7", "LEVEL 38", 1, "Fire block", "Fire"],
    ["#ARCTIC/1", "LEVEL 47", 2, "Ice block", "Ice"],
  ]) {
    await page.goto(`/${hash}`);
    await settle(page);
    // a second goto only changes the hash, and the level before it is still loaded
    await expect(page.locator("#chip")).toContainText(title);
    const open = (whole) =>
      page.evaluate(
        async ([kind, whole]) => {
          const { state } = await import(new URL("js/state.js", location.href).href);
          const { showCell } = await import(new URL("js/detail.js", location.href).href);
          const records = state.lvl.records;
          const c = [...state.idx.cells.values()].find((c) => {
            const r = records[c.v - state.data.firstRecord];
            if (whole) return c.v === kind || r?.kind === kind;
            return r?.kind === 0 && r.on.some((o) => o.type === kind);
          });
          showCell(c);
        },
        [kind, whole],
      );
    await open(true);
    expect((await headings(page))[0]).toBe(block);
    expect(await headings(page)).not.toContain(face);
    await open(false);
    expect((await headings(page))[0]).toBe("Block");
    expect(await headings(page)).toContain(face);
  }
});

test("a raw field reads by its number, then what it holds where that is known", async ({
  page,
}) => {
  await page.goto("/#ATLANT/7");
  await settle(page);
  const labels = (type) =>
    page.evaluate(async (type) => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === type));
      const { x, y, z } = state.lvl.records[i];
      showCell({ x, y, z, v: state.data.firstRecord + i });
      return [...document.querySelectorAll("#detail td:first-child")].map((td) => td.textContent);
    }, type);
  expect(await labels(9)).toContain("f3 circuit");
  expect(await labels(9)).toContain("f4 state");
  expect(await labels(28)).toContain("f2 facing");
  expect(await labels(31)).toContain("f5 pickup number");
});

test("the catalogue's own note reaches the catalogue", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const note = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { levelNote } = await import(new URL("js/data.js", location.href).href);
    const i = state.data.levels.findIndex((l) => l.name === "OBJ LEVEL");
    const { selectLevel } = await import(new URL("js/navigate.js", location.href).href);
    selectLevel(i);
    return levelNote(state.data.levels[i]);
  });
  expect(note).toMatch(/object catalogue/i);
  await expect(page.locator("#chip .note")).toContainText("object catalogue");
});

test("the drawer stays dismissable on the narrowest phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.locator("#menuBtn").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "true");
  const btn = await page.locator("#menuBtn").boundingBox();
  expect(btn.x + btn.width).toBeLessThanOrEqual(320);
  await expect(page.locator("#scrim")).toBeVisible();
  await page.locator("#scrim").click();
  await expect(page.locator("#menuBtn")).toHaveAttribute("aria-expanded", "false");
});

test("Escape leaves the drawer alone where it sits beside the map", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#scrim")).toBeHidden();
  expect(await page.evaluate(() => document.body.classList.contains("sidebar-open"))).toBe(true);
});

test("search answers a number as a whole word, and says when nothing matches", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level 45");
  await expect(page.locator("#results [role=option]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 45");
  await expect(page.locator("#results [role=option] mark")).toHaveText(["LEVEL", "45"]);
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit0");

  await search.fill("zzzz");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  await expect(page.locator("#results")).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await expect(search).not.toHaveAttribute("aria-activedescendant", /./);

  await search.fill("");
  await expect(page.locator("#found")).toBeHidden();
  await expect(search).toHaveAttribute("aria-expanded", "false");
});

test("a cell is answered by itself alone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("17,12,17");
  await expect(page.locator("#results [role=group]")).toHaveCount(1);
  await expect(page.locator("#results [role=option]")).toHaveText(
    "17, 12, 17 centre the view here",
  );
  await expect(page.locator("#found")).toBeHidden();
  await search.fill("40,1,1");
  await expect(page.locator("#results")).toBeHidden();
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
});

test("the places are eight to a group like the objects, and keep to the scope", async ({
  page,
}) => {
  await page.goto("/");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("level");
  const levels = page.locator("#results [role=group][aria-label=Levels]");
  await expect(levels.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await expect(levels.locator(".showmore")).toHaveText(/^show \d+ more$/);
  await search.fill("hiro");
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(1);
  await page.locator("#scope button").nth(2).click();
  await expect(page.locator("#results [aria-label=Worlds]")).toHaveCount(0);
});

test("a search counts objects, blocks by their kind, and settings apart", async ({ page }) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const search = page.locator("#search");
  const more = page.locator("#found");
  await search.fill("key, crumbling, settings");
  await expect(more).toHaveText(
    /^\d+ objects, \d+ crumbling blocks and the settings of \d+ levels$/,
  );
  await page.locator("#scope button").nth(2).click();
  await expect(more).toContainText("1 object, 6 crumbling blocks and the level's settings in");
  await search.fill("level 94");
  await expect(more).toContainText("no objects, blocks or settings in");
});

test("an object search lists every one round the level in hand, and a row goes there", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/11");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  const groups = page.locator("#results [role=group]");
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(groups.nth(1)).toHaveAttribute("aria-label", "HIRO");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("LEVEL 12");
  await expect(rows.first()).toContainText(/top · \d+,\d+,\d+$/);
  await expect(page.locator("#found")).toHaveText(/^\d+ objects$/);
  // eight to a group, the rest a row away that the keys reach too
  const hiro = groups.nth(1);
  await expect(hiro.locator("[role=option]:not(.showmore)")).toHaveCount(8);
  await search.focus();
  for (let i = 0; i < 9; i++) await search.press("ArrowDown");
  await expect(hiro.locator(".showmore")).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(hiro.locator(".showmore")).toHaveCount(0);
  expect(await hiro.locator("[role=option]").count()).toBeGreaterThan(8);
  await expect(hiro.locator("[role=option]").nth(8)).toHaveAttribute("aria-selected", "true");
  await expect(search).toBeFocused();

  // a row in another level goes there and leaves the list as it was
  const row = hiro.locator("[role=option]").first();
  const where = await row.textContent();
  await row.click();
  const at = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { x, y, z } = state.selected;
    return { name: state.lvl.name, target: state.target, selected: [x, y, z] };
  });
  expect(where).toContain(at.name);
  const [, x, y, z] = /(\d+),(\d+),(\d+)/.exec(where);
  expect(at.target).toEqual([x, y, z].map((v) => Number(v) + 0.5));
  // the find is selected, so the panel and the outline say which one it was
  expect(at.selected).toEqual([x, y, z].map(Number));
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#detail")).toContainText("Key");
  await expect(page.locator("#detail")).toContainText(`cell ${x},${y},${z}`);
  await expect(page.locator("#say")).toHaveText(`Key, top, ${x},${y},${z}, ${at.name}`);
  await expect(page.locator("#results")).toBeVisible();
  await expect(groups.first()).toHaveAttribute("aria-label", "HIRO · LEVEL 12");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(search).not.toBeFocused();

  // the scope bar narrows the list to the level in hand
  await page.locator("#scope button").nth(2).click();
  await expect(rows).toHaveCount(1);
  await expect(page.locator("#found")).toContainText(`1 object in ${at.name}`);
  await page.locator("#found .widen").click();
  expect(await rows.count()).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test("down and Enter walk the finds in order, wherever the view has gone", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  const walked = [];
  for (let i = 0; i < 3; i++) {
    // choosing gives the keys back to the map, and / takes them again
    if (i) await page.keyboard.press("/");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    walked.push(
      await page.evaluate(async () => {
        const { state } = await import(new URL("js/state.js", location.href).href);
        return state.lvl.name;
      }),
    );
  }
  expect(walked).toEqual(["LEVEL 1", "LEVEL 2", "LEVEL 3"]);
});

test("a field is searched as name=value, and a match outside the row is appended to it", async ({
  page,
}) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("starts=off");
  const rows = page.locator("#results [role=option]");
  await expect(rows.first()).toContainText("starts=off");
  await expect(rows.first().locator("mark")).toHaveText("starts=off");
  await search.fill("f9=500");
  await expect(rows.first()).toContainText("f9=500");
  await search.fill("f9=50");
  await expect(page.locator("#found")).toHaveText("Nothing matches that.");
  // the keys walk the rows and Enter chooses
  await search.fill("coin");
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", "hit1");
  const before = await page.evaluate(() => location.hash);
  await search.press("Enter");
  await frame(page);
  expect(await page.evaluate(() => location.hash)).not.toBe(before);
});

test("a find above the slice's ceiling lifts the ceiling to it", async ({ page }) => {
  await page.goto("/#HIRO/11/45,35/1/17,17,17/0,0/14");
  await settle(page);
  const search = page.locator("#search");
  await search.fill("key");
  await expect(page.locator("#results [role=option]").first()).toContainText("LEVEL 12");
  await search.press("Enter");
  const at = await page.evaluate(async () => {
    const { state, sliceZ } = await import(new URL("js/state.js", location.href).href);
    return { z: state.selected.z, ceiling: sliceZ(), slice: state.slice };
  });
  expect(at.z).toBeLessThan(19);
  expect(at.ceiling).toBe(at.z);
  await expect(page.locator("#chip")).toContainText(`sliced to z≥${at.z}`);
  await expect(page.locator("#slice")).toHaveValue(String(at.slice));
});

test("the view turns about a find only while it stays selected", async ({ page }) => {
  await page.goto("/#HIRO/11");
  await settle(page);
  await page.locator("#search").fill("key");
  await page.locator("#search").press("Enter");
  const probe = () =>
    page.evaluate(async () => {
      const { state, screen } = await import(new URL("js/state.js", location.href).href);
      const l = state.lvl;
      return {
        target: state.target,
        centre: [0, 1, 2].map((i) => (l.min[i] + l.max[i] + 1) / 2),
        at: screen(20, 15, 17),
        yaw: state.cam.yaw,
        selected: !!state.selected,
      };
    });
  const drag = () =>
    page.evaluate(() => {
      const cv = document.getElementById("cv");
      cv.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 600, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(
        new PointerEvent("pointermove", { clientX: 640, clientY: 400, pointerId: 1 }),
      );
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: 640, clientY: 400, pointerId: 1 }));
    });
  const found = await probe();
  expect(found.selected).toBe(true);
  expect(found.target).not.toEqual(found.centre);
  await drag();
  const turned = await probe();
  expect(turned.yaw).not.toBe(found.yaw);
  expect(turned.target).toEqual(found.target);

  await page.keyboard.press("Escape");
  const cleared = await probe();
  expect(cleared.selected).toBe(false);
  // the pivot goes back to the level as the next turn begins, moving nothing
  const moved = await page.evaluate(async () => {
    const { state, screen, pivot } = await import(new URL("js/state.js", location.href).href);
    const before = screen(20, 15, 17);
    pivot();
    const after = screen(20, 15, 17);
    return { target: state.target, dx: after[0] - before[0], dy: after[1] - before[1] };
  });
  expect(moved.target).toEqual(cleared.centre);
  expect(Math.abs(moved.dx)).toBeLessThan(1e-6);
  expect(Math.abs(moved.dy)).toBeLessThan(1e-6);
  await drag();
  expect((await probe()).target).toEqual(cleared.centre);
});

test("arriving somewhere is spoken, and names the map with it", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const line = "LEVEL 1, HIRO, 20 blocks, 6 objects, 4000 points, time 99.";
  await expect(page.locator("#say")).toHaveText(line);
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", line);
  await page.keyboard.press("]");
  await expect(page.locator("#say")).toContainText("LEVEL 2");
});

test("the legend lists the objects the chip counts, every kind of block but the plain one, and the settings apart", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("19 blocks");
  await expect(page.locator("#chip")).toContainText("10 objects");
  const groups = await page.evaluate(() =>
    [...document.querySelectorAll("#kinds ul")].map((list) => ({
      head: document.getElementById(list.getAttribute("aria-labelledby"))?.textContent ?? "",
      rows: [...list.querySelectorAll(".kind")].map((c) => [
        c.children[1].textContent,
        Number(c.querySelector(".n").textContent),
      ]),
    })),
  );
  const sum = (g) => g.rows.reduce((n, [, k]) => n + k, 0);
  expect(groups.map((g) => g.head)).toEqual(["Objects", "Blocks", ""]);
  await expect(page.locator("#kinds ul[role=list]")).toHaveCount(groups.length);
  expect(sum(groups[0])).toBe(10);
  expect(groups[1].rows).toContainEqual(["Ice block", 1]);
  expect(sum(groups[1])).toBe(10);
  expect(groups[2].rows).toEqual([["Level settings", 1]]);
});

test("a legend row of objects shows and hides them, and a row of blocks only counts", async ({
  page,
}) => {
  await page.goto("/#ATLANT/3");
  await settle(page);
  const objects = page.getByRole("list", { name: "Objects" });
  const blocks = page.getByRole("list", { name: "Blocks" });
  const rows = await objects.getByRole("listitem").count();
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(rows);
  await expect(blocks.getByRole("listitem")).toHaveCount(4);
  await expect(blocks.getByRole("button")).toHaveCount(0);
  await expect(blocks.locator("[aria-pressed]")).toHaveCount(0);
  const hidden = () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      return [...state.hiddenKinds];
    });
  await blocks.getByRole("listitem").first().click();
  expect(await hidden()).toEqual([]);
  const toggles = await page.locator("#kinds").getByRole("button").count();
  await objects
    .getByRole("button")
    .first()
    .click({ modifiers: ["Shift"] });
  expect(await hidden()).toHaveLength(toggles - 1);
  await expect(objects.getByRole("button", { pressed: true })).toHaveCount(1);
  await page.locator("#resetKinds").click();
  expect(await hidden()).toEqual([]);
});

test("a panel is a dialog that a click inside does not dismiss", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.locator("#aboutBtn").click();
  const help = page.locator("#help");
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("aria-label", "About this map");
  await expect(page.locator("#help .x")).toBeFocused();

  await page.locator("#help .box p").first().click();
  await expect(help).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(page.locator("#aboutBtn")).toBeFocused();

  await page.locator("#aboutBtn").click();
  await page.locator("#help").click({ position: { x: 5, y: 5 } });
  await expect(help).toBeHidden();
});

test("an invisible block's icon shows it at the peak of its pulse", async ({ page }) => {
  await page.goto("/#HILLS/19");
  await settle(page);
  const { median, peak } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { atlasFor }, { SKINNED_LOOK }, { blockIcon }] = await Promise.all(
      ["state.js", "atlas.js", "blocks.js", "icons.js"].map(at),
    );
    while (!atlasFor(state.lvl.theme)) await new Promise(requestAnimationFrame);
    const cv = blockIcon(state.lvl, 3);
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const alphas = [];
    for (let i = 3; i < px.length; i += 4) if (px[i]) alphas.push(px[i]);
    alphas.sort((a, b) => a - b);
    return { median: alphas[alphas.length >> 1], peak: SKINNED_LOOK[3].alpha * 255 };
  });
  expect(Math.abs(median - peak)).toBeLessThan(8);
});

test("objects draw as themselves, keep turning, and go back to markers on d", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0");
  await settle(page);
  const probe = async () =>
    page.evaluate(async () => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { markerModel, levelMarkers } = await import(new URL("js/data.js", location.href).href);
      const marks = levelMarkers(state.lvl);
      return {
        models: state.show.models,
        drawn: marks.filter((m) => markerModel(m, state.lvl)).length,
        of: marks.length,
      };
    });
  const before = await probe();
  expect(before.models).toBe(true);
  // LEVEL 1: two coins, a key, a fruit, the exit, and the ball at the start
  expect(before.drawn).toBe(6);
  expect(before.of).toBe(6);
  // the coins turn, so the frame is drawn again without anyone touching the page
  const frames = await page.evaluate(
    () =>
      new Promise((done) => {
        let n = 0;
        const cv = document.getElementById("cv");
        const g = cv.getContext("2d");
        const fill = g.fill.bind(g);
        g.fill = (...a) => (n++, fill(...a));
        setTimeout(() => done(n), 400);
      }),
  );
  expect(frames).toBeGreaterThan(50);
  await page.keyboard.press("d");
  const after = await probe();
  expect(after.models).toBe(false);
  await expect(page.locator("#showModels")).not.toBeChecked();
  expect(errors).toEqual([]);
});

/** The text one frame writes on the canvas. */
const written = (page) =>
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

test("a label names the face its thing stands on, and n leaves the face out", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await expect(page.locator("#showFaces")).toBeChecked();
  await page.keyboard.press("l");
  // LEVEL 1 puts all six of its things on top
  const named = (await written(page)).filter((t) => t.endsWith(" · top"));
  expect(named).toHaveLength(6);
  await page.keyboard.press("n");
  await expect(page.locator("#showFaces")).not.toBeChecked();
  const plain = await written(page);
  expect(plain.filter((t) => t.includes(" · top"))).toEqual([]);
  for (const t of named) expect(plain).toContain(t.slice(0, -" · top".length));
  // a marker's label says the same, and so does the tooltip, whatever the switch
  await page.keyboard.press("n");
  await page.keyboard.press("d");
  expect((await written(page)).filter((t) => t.endsWith(" · top")).sort()).toEqual(named.sort());
  await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { markerLabel } = await import(new URL("js/data.js", location.href).href);
    const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => markerLabel(m) === "Key"));
    const c = state.idx.cells.get(key);
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
  });
  await expect(page.locator("#tip")).toContainText("Key · top");
  expect(errors).toEqual([]);
});

test("a switch's panel presses it, turning its colour over until the level is left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/19/45,35/1");
  await settle(page);
  await page.keyboard.press("l");
  const select = (type) =>
    page.evaluate(async (type) => {
      const { state } = await import(new URL("js/state.js", location.href).href);
      const { showCell } = await import(new URL("js/detail.js", location.href).href);
      const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === type));
      const { x, y, z } = state.lvl.records[i];
      showCell({ x, y, z, v: state.data.firstRecord + i });
    }, type);
  const off = async () => (await written(page)).filter((t) => t.includes(" · off")).length;
  // LESSON's yellow switch and its two teleporters start off
  expect(await off()).toBe(3);
  await select(9);
  const press = page.locator("#detail .press button");
  await expect(press).toHaveText(/Off · press to turn on/);
  const url = page.url();
  await press.click();
  await expect(press).toHaveText(/On · press to turn off/);
  await expect(press).toBeFocused();
  await expect(page.locator("#detail")).toContainText("startsoff");
  expect(await off()).toBe(0);
  expect(page.url()).toBe(url);
  await select(5);
  await expect(page.locator("#detail .press")).toHaveCount(0);
  await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 5));
    const c = state.lvl.records[i];
    const cv = document.getElementById("cv");
    const r = cv.getBoundingClientRect();
    const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z);
    cv.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + x, clientY: r.top + y }));
  });
  await expect(page.locator("#tip")).toContainText("Yellow teleporter · top");
  await expect(page.locator("#tip")).not.toContainText("off");
  await page.keyboard.press("]");
  await expect(page.locator("#chip")).not.toContainText("LESSON");
  await page.keyboard.press("[");
  await expect(page.locator("#chip")).toContainText("LESSON");
  expect(await off()).toBe(3);
  expect(errors).toEqual([]);
});

test("a teleporter's panel names where it leads, and going there is a find", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#COWBOY/7/45,35/1");
  await settle(page);
  await page.evaluate(async () => {
    const { state, cellKey } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    showCell(state.idx.cells.get(cellKey(17, 7, 17)));
  });
  // LEVEL 68's blue teleporters send the ball round a ring of three
  const go = page.locator("#detail .goto");
  await expect(go).toHaveText("17, 25, 17 · top");
  const entries = await page.evaluate(() => history.length);
  await go.click();
  await expect(page.locator("#detail")).toContainText("cell 17,25,17");
  await expect(go).toHaveText("17, 21, 17 · top");
  const view = await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    return { target: state.target, pan: [state.cam.panX, state.cam.panY] };
  });
  expect(view).toEqual({ target: [17.5, 25.5, 17.5], pan: [0, 0] });
  await frame(page);
  expect(page.url()).toMatch(/\/17,25,17$/);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  await expect(page.locator("#say")).toContainText("Blue teleporter, top, 17,25,17");
  await go.click();
  await go.click();
  await expect(page.locator("#detail")).toContainText("cell 17,7,17");
  // a teleporter alone in its colour sends the ball back onto itself
  await page.goto("/#HILLS/19");
  await settle(page);
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const i = state.lvl.records.findIndex((r) => r.on.some((o) => o.type === 5));
    const { x, y, z } = state.lvl.records[i];
    showCell({ x, y, z, v: state.data.firstRecord + i });
  });
  await expect(page.locator("#detail")).toContainText("leads toitself");
  await expect(page.locator("#detail .goto")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("b takes the lines off the blocks", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  const strokes = () =>
    page.evaluate(async () => {
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const g = document.getElementById("cv").getContext("2d");
      let n = 0;
      const stroke = g.stroke;
      g.stroke = (...a) => (n++, stroke.apply(g, a));
      draw();
      g.stroke = stroke;
      return n;
    });
  await expect(page.locator("#showOutlines")).toBeChecked();
  const lined = await strokes();
  await page.keyboard.press("b");
  await expect(page.locator("#showOutlines")).not.toBeChecked();
  // each of LEVEL 1's twenty blocks shows its top at least
  expect(lined - (await strokes())).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});

test("a thing on a face turned away shows where no block covers it, and x shows the rest", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 1's things all stand on top; at 45° a block's middle would fall on its near edge
  await page.goto("/#HIRO/0/30,35");
  await settle(page);
  await expect(page.locator("#showThrough")).not.toBeChecked();
  /** Whether the middle of the ball at the start, seen from `pitch`, is drawn
      over what is there without it; both in one frame, as the canvas may
      still be settling to its size. */
  const shows = (pitch) =>
    page.evaluate(async (pitch) => {
      const { state, screen } = await import(new URL("js/state.js", location.href).href);
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const { ballFor, modelUnit } = await import(new URL("js/data.js", location.href).href);
      const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => m.type === 30));
      const c = state.idx.cells.get(key);
      const [lo, hi] = ballFor(state.lvl).box;
      const g = document.getElementById("cv").getContext("2d");
      state.cam.pitch = pitch;
      const at = (objects) => {
        state.show.objects = objects;
        draw();
        const [x, y] = screen(c.x + 0.5, c.y + 0.5, c.z - ((hi[1] - lo[1]) / 2) * modelUnit());
        return String(g.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      };
      return at(true) !== at(false);
    }, pitch);
  // from just below the tops the ball stands clear of its block, and from
  // further down its block covers its middle
  expect(await shows(-6)).toBe(true);
  expect(await shows(-40)).toBe(false);
  // but the selected block's shows through whatever the switch says
  await page.evaluate(async () => {
    const { state } = await import(new URL("js/state.js", location.href).href);
    const { showCell } = await import(new URL("js/detail.js", location.href).href);
    const [key] = [...state.idx.markers].find(([, ms]) => ms.some((m) => m.type === 30));
    showCell(state.idx.cells.get(key));
  });
  expect(await shows(-40)).toBe(true);
  await page.keyboard.press("Escape");
  expect(await shows(-40)).toBe(false);
  await page.keyboard.press("x");
  await expect(page.locator("#showThrough")).toBeChecked();
  expect(await shows(-40)).toBe(true);
  expect(errors).toEqual([]);
});

test("what travels does so from the start, its label with it, until v stops it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 22's fast stars sway along their stretch without a stop
  await page.goto("/#HILLS/6/45,35/1");
  await settle(page);
  await expect(page.locator("#showTravel")).toBeChecked();
  await page.keyboard.press("l");
  const at = () =>
    page.evaluate(async () => {
      const { draw } = await import(new URL("js/render.js", location.href).href);
      const g = document.getElementById("cv").getContext("2d");
      const seen = [];
      const fillText = g.fillText;
      g.fillText = (text, x, y, ...rest) => (
        text.startsWith("Captivator") && seen.push([text, x, y]),
        fillText.call(g, text, x, y, ...rest)
      );
      draw();
      g.fillText = fillText;
      return seen;
    });
  const before = await at();
  expect(before.length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  expect(await at()).not.toEqual(before);
  await page.keyboard.press("v");
  await expect(page.locator("#showTravel")).not.toBeChecked();
  const still = await at();
  await page.waitForTimeout(300);
  expect(await at()).toEqual(still);
  expect(errors).toEqual([]);
});

test("the camera target shows only on s", async ({ page }) => {
  await page.goto("/#HIRO/0/45,35/1");
  await settle(page);
  await expect(page.locator("#showStart")).not.toBeChecked();
  expect(await written(page)).not.toContain("camera target");
  await page.keyboard.press("s");
  await expect(page.locator("#showStart")).toBeChecked();
  expect(await written(page)).toContain("camera target");
});

test("the display keeps only the switches set away from their defaults", async ({ page }) => {
  await page.goto("/#HIRO/0");
  await settle(page);
  const kept = () => page.evaluate(() => JSON.parse(localStorage.getItem("kula.display")));
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ labels: true });
  await page.keyboard.press("v");
  expect(await kept()).toEqual({ labels: true, travel: false });
  await page.keyboard.press("l");
  expect(await kept()).toEqual({ travel: false });
  await page.reload();
  await settle(page);
  await expect(page.locator("#showTravel")).not.toBeChecked();
  await expect(page.locator("#showLabels")).not.toBeChecked();
  await expect(page.locator("#showOutlines")).toBeChecked();
});

test("a travelling thing, and every block of a platform, picks the cell its record is on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // LEVEL 22's one fast star on a top, as a marker, once it has swayed off its own block
  await page.goto("/#HILLS/6/45,35/1.5");
  await settle(page);
  await page.keyboard.press("d");
  await page.keyboard.press("l");
  const star = () =>
    page.evaluate(async () => {
      const { state, screen, BLOCK } = await import(new URL("js/state.js", location.href).href);
      const { draw, cellAt, invalidatePick } = await import(
        new URL("js/render.js", location.href).href
      );
      const g = document.getElementById("cv").getContext("2d");
      const seen = [];
      const fillText = g.fillText;
      g.fillText = (text, x, y, ...rest) => (
        text === "Captivator · top" && seen.push([x, y]),
        fillText.call(g, text, x, y, ...rest)
      );
      invalidatePick();
      draw();
      g.fillText = fillText;
      const [key] = [...state.idx.markers].find(([, ms]) =>
        ms.some((m) => m.type === 52 && m.face === 0),
      );
      const home = state.idx.cells.get(key);
      const r = Math.max(4, 7 * state.cam.zoom);
      const [x, y] = [seen[0][0] - r - 4, seen[0][1] - 4];
      const [hx, hy] = screen(home.x + 0.5, home.y + 0.5, home.z - 8 / BLOCK);
      const c = cellAt(x, y);
      return {
        away: Math.hypot(x - hx, y - hy) / (state.cam.zoom * BLOCK),
        picked: c && [c.x, c.y, c.z],
        home: [home.x, home.y, home.z],
      };
    });
  let seen = await star();
  for (let i = 0; i < 40 && seen.away < 0.6; i++) {
    await page.waitForTimeout(50);
    seen = await star();
  }
  expect(seen.away).toBeGreaterThanOrEqual(0.6);
  expect(seen.picked).toEqual(seen.home);

  // LEVEL 94's platform, two blocks long, standing where its level puts it
  await page.goto("/#ATLANT/3/45,35/1.5");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("LEVEL 94");
  await page.keyboard.press("v");
  const picked = await page.evaluate(async () => {
    const { state, screen } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    const r = state.lvl.records.find((r) => r.kind === 5);
    const [x, y] = screen(r.x + 0.5, r.y + 1.5, r.z);
    const c = cellAt(x, y);
    return { picked: c && [c.x, c.y, c.z], record: [r.x, r.y, r.z] };
  });
  expect(picked.picked).toEqual(picked.record);
  expect(errors).toEqual([]);
});

test("a point on the edge between two blocks names one drawn there, never one far off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  // HIDDEN 10: nothing travels or runs a route, so every cell the pick names
  // is drawn where its cell is, and its 178 blocks take pick colours past one
  // byte, so a blend of two can decode as a block anywhere
  await page.goto("/#HELL/18/45,35");
  await settle(page);
  await expect(page.locator("#chip")).toContainText("HIDDEN 10");
  const far = await page.evaluate(async () => {
    const { screen } = await import(new URL("js/state.js", location.href).href);
    const { cellAt } = await import(new URL("js/render.js", location.href).href);
    /** How far a point lies outside a cell's cube as the screen shows it. */
    const away = (c, x, y) => {
      const pts = [];
      for (const dx of [0, 1])
        for (const dy of [0, 1])
          for (const dz of [0, 1]) pts.push(screen(c.x + dx, c.y + dy, c.z + dz));
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const half = (list) =>
        list.reduce((h, p) => {
          while (h.length >= 2 && turn(h.at(-2), h.at(-1), p) <= 0) h.pop();
          return [...h, p];
        }, []);
      const hull = [...half(pts).slice(0, -1), ...half([...pts].reverse()).slice(0, -1)];
      let inside = true;
      let nearest = Infinity;
      hull.forEach((a, i) => {
        const b = hull[(i + 1) % hull.length];
        const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
        if (ex * (y - a[1]) - ey * (x - a[0]) < 0) inside = false;
        const t = Math.max(
          0,
          Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)),
        );
        nearest = Math.min(nearest, Math.hypot(a[0] + t * ex - x, a[1] + t * ey - y));
      });
      return inside ? 0 : nearest;
    };
    const cv = document.getElementById("cv");
    const out = [];
    for (let y = 0; y < cv.clientHeight; y += 2)
      for (let x = 0; x < cv.clientWidth; x += 2) {
        const c = cellAt(x, y);
        if (c && away(c, x, y) > 4) out.push(`${x},${y} names ${c.x},${c.y},${c.z}`);
      }
    return out;
  });
  expect(far.length, far.slice(0, 3).join("; ")).toBe(0);
  expect(errors).toEqual([]);
});

test("the page a link lands on says what it is", async ({ page }) => {
  await page.goto("/");
  const head = await page.evaluate(() => ({
    canonical: document.querySelector("link[rel=canonical]")?.href,
    ogTitle: document.querySelector("meta[property='og:title']")?.content,
    ogImage: document.querySelector("meta[property='og:image']")?.content,
    twitter: document.querySelector("meta[name='twitter:card']")?.content,
    manifest: document.querySelector("link[rel=manifest]")?.href,
  }));
  expect(head.canonical).toBe("https://kulaworld.retroatlas.org/");
  expect(head.ogTitle).toBe("Kula World Map");
  expect(head.ogImage).toMatch(/og-image\.png$/);
  expect(head.twitter).toBe("summary_large_image");
  for (const path of [
    "og-image.png",
    "favicon-96.png",
    "apple-touch-icon.png",
    "robots.txt",
    "sitemap.xml",
    "site.webmanifest",
    "404.html",
  ]) {
    const res = await page.request.get(`/${path}`);
    expect(res.status(), path).toBe(200);
  }
});
