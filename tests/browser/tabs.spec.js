import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import {
  EDIT,
  KEPT,
  KEY,
  NO_ROOM,
  docOf,
  flush,
  refusing,
  room,
  shown,
  stored,
  toasts,
  written,
} from "./drafthelpers.js";

/** Another tab's copy of the store, written and announced as the browser would. */
const arrives = (page, copy) =>
  page.evaluate(
    ([key, copy]) => {
      const text = JSON.stringify(copy);
      localStorage.setItem(key, text);
      dispatchEvent(
        new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
      );
    },
    [KEY, copy],
  );

test("a draft deleted here is not taken back from another tab's copy, and one changed here is kept, until the write", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  const gone = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(2);
  const copy = await stored(page);
  const kept = Number(Object.keys(copy.drafts).find((id) => Number(id) !== gone));
  // the other tab's copy lacks the draft kept here and still holds the one deleted here
  const theirs = structuredClone(copy);
  delete theirs.drafts[kept];
  // in one breath: a change here, a deletion here, and the other tab's copy arriving
  const out = await page.evaluate(
    async ([key, theirs, kept, gone]) => {
      const { get, update, remove } = await import(
        new URL("js/editor/drafts.js", location.href).href
      );
      update(kept, { ...get(kept).doc, title: "Kept here" });
      remove(gone);
      const text = JSON.stringify(theirs);
      dispatchEvent(
        new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
      );
      return { kept: get(kept)?.doc.title ?? null, gone: get(gone) !== null };
    },
    [KEY, theirs, kept, gone],
  );
  expect(out).toEqual({ kept: "Kept here", gone: false });
  await expect(page.locator("#draftRows button .name")).toHaveText(["Kept here"]);
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(kept)]);
  expect((await stored(page)).drafts[kept].doc.title).toBe("Kept here");
  expect(errors).toEqual([]);
});

test("another tab clearing the store takes every draft not changed here, and the disc's level comes back", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("]");
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  expect((await shown(page)).li).toBe(-1);
  await written(page, (s) => Object.keys(s?.drafts ?? {}).length).toBe(1);
  await page.evaluate(() => {
    localStorage.clear();
    dispatchEvent(new StorageEvent("storage", { key: null, storageArea: localStorage }));
  });
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  await expect(page.locator("#draftEmpty")).toBeVisible();
  const back = await shown(page);
  expect(back.li).toBe(1);
  expect(back.chip).toContain("LEVEL 2");
  expect(errors).toEqual([]);
});

test("another tab's copy of the store reloads the list, the draft changed later winning", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(id)]);
  const send = (copy) =>
    page.evaluate(
      ([key, copy]) => {
        const text = JSON.stringify(copy);
        localStorage.setItem(key, text);
        dispatchEvent(
          new StorageEvent("storage", { key, newValue: text, storageArea: localStorage }),
        );
      },
      [KEY, copy],
    );
  const copy = await stored(page);
  const mine = copy.drafts[id];
  mine.doc.title = "From another tab";
  mine.updated += 1000;
  copy.drafts[copy.next] = {
    doc: { ...mine.doc, title: "Theirs", world: "HELL" },
    updated: mine.updated - 5,
    saved: null,
    edits: 0,
  };
  copy.next += 1;
  await send(copy);
  await expect(page.locator("#draftRows button")).toHaveCount(2);
  await expect(page.locator("#draftRows button .name")).toHaveText(["From another tab", "Theirs"]);
  await expect(page.locator("#chipLine b")).toHaveText("From another tab");
  await expect(page.locator("#draftTitle")).toHaveValue("From another tab");
  expect((await shown(page)).draft).toBe(id);

  // an older copy changes nothing here
  const stale = structuredClone(copy);
  stale.drafts[id].doc.title = "Stale";
  stale.drafts[id].updated -= 5000;
  await send(stale);
  await expect(page.locator("#chipLine b")).toHaveText("From another tab");
  await expect(page.locator("#draftRows button .name")).toHaveText(["From another tab", "Theirs"]);
  expect(errors).toEqual([]);
});

test("a page back from the cache or thawed, and every write, takes in what another tab stored while it could not hear", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const id = (await shown(page)).draft;
  await written(page, (s) => Object.keys(s?.drafts ?? {})).toEqual([String(id)]);
  const quietly = (copy) =>
    page.evaluate(([key, copy]) => localStorage.setItem(key, JSON.stringify(copy)), [KEY, copy]);
  const another = (title, updated) => ({
    doc: { ...KEPT.drafts[1].doc, title },
    updated,
    saved: null,
    edits: 0,
  });
  const names = page.locator("#draftRows button .name");

  const copy = await stored(page);
  copy.drafts[id].doc.title = "Renamed away";
  copy.drafts[id].updated += 1;
  copy.drafts[id + 1] = another("Theirs", 1);
  copy.next = id + 2;
  await quietly(copy);
  await expect(page.locator("#chipLine b")).toHaveText("Untitled level");
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  await expect(page.locator("#chipLine b")).toHaveText("Renamed away");
  await expect(names).toHaveText(["Renamed away", "Theirs"]);

  copy.drafts[id + 2] = another("Third", 2);
  copy.next = id + 3;
  await quietly(copy);
  await page.evaluate(() => document.dispatchEvent(new Event("resume")));
  await expect(names).toHaveText(["Renamed away", "Third", "Theirs"]);

  copy.drafts[id + 1] = another("Theirs II", 3);
  await quietly(copy);
  await page.locator("#draftTitle").fill("Mine now");
  await written(page, (s) => s?.drafts[id]?.doc.title).toBe("Mine now");
  const out = await stored(page);
  expect(Object.keys(out.drafts).sort()).toEqual([id, id + 1, id + 2].map(String));
  expect(out.drafts[id + 1].doc.title).toBe("Theirs II");
  expect(out.next).toBe(id + 3);
  await expect(names).toHaveText(["Mine now", "Theirs II", "Third"]);
  expect(errors).toEqual([]);
});

test("a draft and a disc level that share a number are two levels, so showing one after the other is a change", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.keyboard.press("]");
  expect((await shown(page)).li).toBe(1);
  await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { on }] = await Promise.all(["viewer/state.js", "viewer/ui/dom.js"].map(at));
    state.hiddenKinds.add("t31");
    window.counts = { changed: 0, updated: 0 };
    on("level-changed", () => window.counts.changed++);
    on("level-updated", () => window.counts.updated++);
  });
  // the first draft is number 1, as LEVEL 2 is among the disc's levels
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const made = await page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return { draft: state.lvl.draft, hidden: [...state.hiddenKinds], ...window.counts };
  });
  expect(made).toEqual({ draft: 1, hidden: [], changed: 1, updated: 0 });
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^Draft, Untitled level/);
  await expect(page.locator("#worlds .levels button[aria-current='true']")).toHaveCount(0);
  await page.locator("#worlds .levels button[data-i='1']").click();
  expect(await page.evaluate(() => window.counts)).toEqual({ changed: 2, updated: 0 });
  await expect(page.locator("#worlds .levels button[data-i='1']")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.locator("#cv")).toHaveAttribute("aria-label", /^LEVEL 2/);
  expect(errors).toEqual([]);
});

test("a write the browser refused is tried again at a flush, and when another tab writes", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const id = (await shown(page)).draft;
  expect(await stored(page)).toBeNull();
  // room made: the flush that leaves the page writes what waited
  await room(page, true);
  await flush(page);
  expect((await stored(page)).drafts[id].doc.title).toBe("Untitled level");
  // refused again, a change waits; the other tab's write is the moment to try once more
  await room(page, false);
  await page.locator("#draftTitle").fill("Spiral");
  await flush(page);
  expect((await stored(page)).drafts[id].doc.title).toBe("Untitled level");
  await room(page, true);
  await arrives(page, await stored(page));
  await written(page, (s) => s?.drafts[id]?.doc.title).toBe("Spiral");
  expect(errors).toEqual([]);
});

test("a draft whose id another tab handed out before this tab's write landed moves to a new id", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const mine = (await shown(page)).draft;
  await page.locator("#draftTitle").fill("Mine");
  await expect(page.locator("#chipLine b")).toHaveText("Mine");
  // the other tab, with room, makes a level of its own under the same id
  const theirs = {
    version: 1,
    next: mine + 1,
    drafts: {
      [mine]: {
        doc: {
          format: "kula-world-level",
          version: 1,
          title: "Theirs",
          world: "HELL",
          time: 99,
          blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
        },
        updated: Date.now() + 1000,
        saved: null,
        edits: 0,
      },
    },
  };
  await room(page, true);
  await arrives(page, theirs);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Theirs", "Mine"]);
  // the screen follows this tab's draft to its new id
  expect((await shown(page)).draft).toBe(mine + 1);
  await expect(page.locator("#chipLine b")).toHaveText("Mine");
  await expect(page.locator("#draftRows button").nth(1)).toHaveAttribute("aria-current", "true");
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toMatch(new RegExp(`^#DRAFT/${mine + 1}/`));
  expect(await docOf(page, mine)).toMatchObject({ title: "Theirs" });
  expect(await docOf(page, mine + 1)).toMatchObject({ title: "Mine" });
  const trails = await page.evaluate(
    async ([a, b]) => {
      const { steps } = await import(new URL("js/editor/trail.js", location.href).href);
      return [steps(a).past, steps(b).past];
    },
    [mine, mine + 1],
  );
  expect(trails).toEqual([0, 1]);
  expect(await toasts(page)).toContain(
    "Another tab's level took the place of Mine, which stays in the list under a new link.",
  );
  await written(page, (s) => s && [s.next, Object.keys(s.drafts)]).toEqual([
    mine + 2,
    [String(mine), String(mine + 1)],
  ]);
  expect((await stored(page)).drafts[mine + 1].doc.title).toBe("Mine");
  expect(errors).toEqual([]);
});

test("deleting a draft that never reached storage leaves another tab's level under its id alone", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await refusing(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#toastStack .toast", { hasText: NO_ROOM })).toHaveCount(1);
  const id = (await shown(page)).draft;
  const del = page.locator("#draftCard button", { hasText: /^delete/ });
  await del.click();
  await del.click();
  await expect(page.locator("#draftRows button")).toHaveCount(0);
  expect(await stored(page)).toBeNull();
  // the other tab, with room, made a level of its own under the id this tab let go
  const theirs = {
    version: 1,
    next: id + 1,
    drafts: {
      [id]: {
        doc: {
          format: "kula-world-level",
          version: 1,
          title: "Theirs",
          world: "HELL",
          time: 99,
          blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
        },
        updated: Date.now() + 1000,
        saved: null,
        edits: 0,
      },
    },
  };
  await room(page, true);
  await arrives(page, theirs);
  await expect(page.locator("#draftRows button .name")).toHaveText(["Theirs"]);
  expect((await stored(page)).drafts[id].doc.title).toBe("Theirs");
  // and this tab's next write carries it along
  await page.locator("#draftNew").click();
  await written(page, (s) => Object.keys(s?.drafts ?? {}).sort()).toEqual([
    String(id),
    String(id + 1),
  ]);
  expect((await stored(page)).drafts[id].doc.title).toBe("Theirs");
  expect(errors).toEqual([]);
});
