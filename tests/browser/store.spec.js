import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import {
  EDIT,
  EDITOR_FILES,
  KEPT,
  KEY,
  NO_ROOM,
  flush,
  refusing,
  room,
  shown,
  stored,
  toasts,
  written,
} from "./drafthelpers.js";

const SETTLE = 300;

const FULL = "This browser cannot hold more drafts; save them to files and delete some.";

const NUMBERED_OUT =
  "This browser has run out of numbers for its levels, so no more can be made here.";

test("a draft in the store that cannot be read is kept as it is, with one toast, and the rest stay", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const good = {
    format: "kula-world-level",
    version: 1,
    title: "Good",
    world: "MARS",
    time: 50,
    blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
  };
  const unread = {
    2: { doc: { format: "something-else", blocks: [] }, updated: 2 },
    3: null,
    4: { doc: { ...good, world: "NOWHERE" }, updated: 3 },
  };
  await page.addInitScript(
    ([key, good, unread]) => {
      const store = {
        version: 1,
        next: 5,
        drafts: { 1: { doc: good, updated: 1, saved: null, edits: 2 }, ...unread },
      };
      // the script also runs on the blank page between the two loads, which has no storage
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* ignore */
      }
    },
    [KEY, good, unread],
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  const out = await shown(page);
  expect(out).toMatchObject({ li: -1, draft: 1, theme: "MARS", time: 50 });
  expect(out.chip).toContain("Good");
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button .state")).toHaveText(
    "not saved to a file · 2 changes",
  );
  expect((await toasts(page)).filter((t) => t.includes("could not be read"))).toEqual([
    "3 drafts in this browser could not be read and are kept as they are.",
  ]);
  const row = page.locator("#draftUnread");
  await expect(row.locator(".state")).toHaveText("3 drafts in this browser could not be read");
  // a change here writes the store with those entries as they were
  await page.locator("#draftTitle").fill("Good II");
  await written(page, (s) => s?.drafts[1]?.doc.title).toBe("Good II");
  const after = await stored(page);
  expect(after.next).toBe(5);
  expect([after.drafts[2], after.drafts[3], after.drafts[4]]).toEqual([
    unread[2],
    unread[3],
    unread[4],
  ]);

  // a link to one that was left out gives way to the first level, and the session is told once
  await page.goto("about:blank");
  await page.goto("/#DRAFT/2/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftRows button")).toHaveAttribute("aria-current", "false");
  await expect(row).toHaveCount(1);
  expect(await toasts(page)).toEqual([]);

  // the row's remove asks to be pressed again, then lets them go, the readable draft kept
  const remove = row.locator("button");
  await expect(remove).toHaveText("remove");
  await remove.click();
  await expect(remove).toHaveText("remove?");
  await expect(remove).toHaveClass(/warn/);
  await expect(remove).toHaveAttribute(
    "title",
    "Press again to remove what could not be read from this browser",
  );
  await remove.click();
  await expect(row).toHaveCount(0);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Good"]);
  await expect(page.locator("#say")).toHaveText("Removed 3 drafts that could not be read.");
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual(["1"]);
  expect((await stored(page)).next).toBe(5);
  expect(errors).toEqual([]);
});

test("entries that cannot be read do not load the editor by themselves, and a key the language reserves is kept like any other", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const text = '{"version":1,"next":1,"drafts":{"__proto__":{"doc":1},"9":null}}';
  await page.addInitScript(
    ([key, text]) => {
      try {
        localStorage.setItem(key, text);
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, text],
  );
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator("#draftEmpty")).toBeVisible();

  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect(fetched()).toContain("/js/editor/editor.js");
  expect((await shown(page)).draft).toBe(10);
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "2 drafts in this browser could not be read and are kept as they are.",
  ]);
  await expect(page.locator("#draftUnread .state")).toHaveText(
    "2 drafts in this browser could not be read",
  );
  await expect(page.locator("#draftEmpty")).toBeHidden();
  // read inside the page, since a key named __proto__ does not survive the trip out of it
  const keys = () =>
    page.evaluate((key) => {
      const drafts = JSON.parse(localStorage.getItem(key) ?? "{}").drafts ?? {};
      return Object.keys(drafts)
        .sort()
        .map((k) => `${k}=${JSON.stringify(drafts[k])}`);
    }, KEY);
  await expect.poll(keys).toHaveLength(3);
  expect((await keys()).slice(1)).toEqual(["9=null", '__proto__={"doc":1}']);
  expect(errors).toEqual([]);
});

test("an entry of a draft's shape loads the editor at the start under a key that is an id, whatever its document holds, and under any other key not", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requested = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  const fetched = () => requested.filter((p) => EDITOR_FILES.test(p));
  const kept = KEPT.drafts[1];
  const unreadable = { ...kept, doc: { ...kept.doc, world: "NOWHERE" } };
  await page.addInitScript(
    ([key, store]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page between the loads has no storage */
      }
    },
    [KEY, { version: 1, next: 2, drafts: { "01": kept } }],
  );
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toEqual([]);
  expect(await toasts(page)).toEqual([]);
  await expect(page.locator("#draftEmpty")).toBeVisible();

  await page.evaluate(
    ([key, store]) => localStorage.setItem(key, JSON.stringify(store)),
    [KEY, { version: 1, next: 2, drafts: { 1: unreadable } }],
  );
  requested.length = 0;
  await page.goto("about:blank");
  await page.goto(EDIT);
  await settle(page);
  expect(fetched()).toContain("/js/editor/editor.js");
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftUnread .state")).toHaveText(
    "1 draft in this browser could not be read",
  );
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "1 draft in this browser could not be read and is kept as it is.",
  ]);
  expect(errors).toEqual([]);
});

test("a change waits a moment before it is written, the moment's changes landing as one write, and none waits past the page being hidden or left", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    window.__writes = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__writes++;
      return set.call(this, k, v);
    };
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(1);
  const writes = () => page.evaluate(() => window.__writes);
  expect(await writes()).toBe(1);
  // a run of changes in one breath, then the store as it stands before the moment has passed
  const retitle = (titles, then) =>
    page.evaluate(
      async ([key, titles, then]) => {
        const at = (p) => import(new URL(`js/${p}`, location.href).href);
        const [{ state }, { get, update }] = await Promise.all(
          ["viewer/state.js", "editor/drafts.js"].map(at),
        );
        const id = state.lvl.draft;
        for (const title of titles) update(id, { ...get(id).doc, title });
        if (then === "hidden") {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          document.dispatchEvent(new Event("visibilitychange"));
          delete document.hidden;
        } else if (then === "left")
          dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
        return JSON.parse(localStorage.getItem(key)).drafts[id].doc.title;
      },
      [KEY, titles, then],
    );
  expect(await retitle(["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"])).toBe("Untitled level");
  await written(page, (s) => Object.values(s?.drafts ?? {})[0]?.doc.title).toBe("Step 5");
  expect(await writes()).toBe(2);
  expect(await retitle(["Hidden"], "hidden")).toBe("Hidden");
  expect(await writes()).toBe(3);
  expect(await retitle(["Left"], "left")).toBe("Left");
  expect(await writes()).toBe(4);
  // a timer set after the flush and as long as the settle fires after any the flush left behind
  expect(
    await page.evaluate(
      (ms) => new Promise((r) => setTimeout(() => r(window.__writes), ms)),
      SETTLE,
    ),
  ).toBe(4);
  expect(errors).toEqual([]);
});

test("a browser whose storage cannot be read keeps the levels in memory alone, and says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    window.__writes = 0;
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) {
      if (k === key) throw new DOMException("denied", "SecurityError");
      return get.call(this, k);
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === key) window.__writes++;
      return set.call(this, k, v);
    };
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  expect(await toasts(page)).toEqual([]);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([
    "This browser cannot keep your levels, so they will live only until the page is closed.",
  ]);
  expect((await shown(page)).li).toBe(-1);
  await page.locator("#draftTitle").fill("Fleeting");
  await expect(page.locator("#draftRows button .name")).toHaveText(["Fleeting"]);
  await flush(page);
  expect(await page.evaluate(() => window.__writes)).toBe(0);
  await page.reload();
  await settle(page);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a browser with no room at all keeps the draft on screen and says so once", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, k, v);
    };
  }, KEY);
  await page.clock.install();
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([NO_ROOM]);
  expect((await shown(page)).li).toBe(-1);
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect(await stored(page)).toBeNull();

  await page.clock.runFor(3000 + 150);
  await expect(page.locator("#toastStack .toast")).toHaveCount(0);
  await page.locator("#draftTitle").fill("Spiral");
  await expect(page.locator("#chipLine b")).toHaveText("Spiral");
  await flush(page);
  expect(await toasts(page)).toEqual([]);
  expect(await stored(page)).toBeNull();
  expect(errors).toEqual([]);
});

test("a browser with levels kept and no room for more says so, and keeps what it holds", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key) throw new DOMException("full", "QuotaExceededError");
        return set.call(this, k, v);
      };
    },
    [KEY, KEPT],
  );
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button .name")).toHaveText(["Untitled level", "Kept"]);
  await expect(page.locator("#toastStack .toast")).toHaveText([FULL]);
  expect(Object.keys((await stored(page)).drafts)).toEqual(["1"]);
  expect(errors).toEqual([]);
});

test("a browser that refuses a write for a reason other than room says so plainly, and writes once it can", async ({
  page,
}) => {
  const REFUSED =
    "This browser could not keep your levels just now. Save them to files to be safe.";
  const errors = trackErrors(page);
  await refusing(page, "SecurityError");
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast")).toHaveText([REFUSED]);
  expect(await stored(page)).toBeNull();
  await room(page, true);
  await page.locator("#draftTitle").fill("Spiral");
  await written(page, (s) => Object.values(s?.drafts ?? {})[0]?.doc.title).toBe("Spiral");
  expect(await toasts(page)).toEqual([REFUSED]);
  expect(errors).toEqual([]);
});

test("a store that has handed out every number it has makes no more levels, and says so", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const spent = { ...KEPT, next: Number.MAX_SAFE_INTEGER + 1 };
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, spent],
  );
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect((await shown(page)).li).toBe(0);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect((await stored(page)).next).toBe(Number.MAX_SAFE_INTEGER + 1);
  expect(errors).toEqual([]);
});

test("w on a disc level over a spent store makes no copy and leaves editing off", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, next: 2 ** 53, drafts: {} }));
  }, KEY);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("w");
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  expect((await shown(page)).li).toBe(0);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).not.toHaveClass(/editing/);
  expect(errors).toEqual([]);
});

test("new on a store that has handed out every number it has leaves editing off where a draft is on screen", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const spent = { ...KEPT, next: Number.MAX_SAFE_INTEGER + 1 };
  await page.addInitScript(
    ([key, store]) => {
      try {
        localStorage.setItem(key, JSON.stringify(store));
      } catch {
        /* the blank page has no storage */
      }
    },
    [KEY, spent],
  );
  await page.goto("/#DRAFT/1/45,35/fit/33");
  await settle(page);
  expect((await shown(page)).draft).toBe(1);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#draftNew").click();
  await expect(page.locator("#toastStack .toast")).toHaveText([NUMBERED_OUT]);
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("body")).not.toHaveClass(/editing/);
  expect((await shown(page)).draft).toBe(1);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept"]);
  expect(errors).toEqual([]);
});
