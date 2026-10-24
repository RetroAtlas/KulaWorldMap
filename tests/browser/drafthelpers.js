import { expect } from "@playwright/test";

export const EDIT = "/#HIRO/0/45,35/fit/33";

export const KEY = "kula.drafts";

export const NO_ROOM =
  "This browser gives the map no room to keep levels, so they will live only until the page is closed.";

/** A store holding one draft, as another tab or an earlier visit would have left it. */
export const KEPT = {
  version: 1,
  next: 2,
  drafts: {
    1: {
      doc: {
        format: "kula-world-level",
        version: 1,
        title: "Kept",
        world: "INCA",
        time: 60,
        blocks: [{ cell: [17, 17, 17], kind: 0, faces: { 0: { type: 30, facing: 3 } } }],
      },
      updated: 1,
      saved: null,
      edits: 0,
    },
  },
};

export const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

/** What `pick` reads off the store once the write that waits has landed. */
export const written = (page, pick = (s) => s) => expect.poll(async () => pick(await stored(page)));

export const flush = (page) =>
  page.evaluate(async () =>
    (await import(new URL("js/editor/drafts.js", location.href).href)).flush(),
  );

/** A browser that refuses the store's writes, with the error named, until `window.__room` is set. */
export const refusing = (page, name = "QuotaExceededError") =>
  page.addInitScript(
    ([key, name]) => {
      const set = Storage.prototype.setItem;
      window.__room = false;
      Storage.prototype.setItem = function (k, v) {
        if (k === key && !window.__room) throw new DOMException("refused", name);
        return set.call(this, k, v);
      };
    },
    [KEY, name],
  );

export const room = (page, yes) => page.evaluate((yes) => void (window.__room = yes), yes);

export const toasts = (page) => page.locator("#toastStack .toast").allTextContents();

export const shown = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return {
      li: state.li,
      draft: state.lvl.draft,
      theme: state.lvl.theme,
      time: state.lvl.time,
      hash: location.hash,
      chip: document.getElementById("chipLine").textContent,
    };
  });

export const docOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/editor/drafts.js", location.href).href);
    return get(id)?.doc ?? null;
  }, id);

export const EDITOR_FILES =
  /\/js\/(editor\/(editor|drafts|draftlist|palette|trail)|format\/(project|kwl)|vendor\/pako_deflate\.min|play\/(play|ball|dust))\.js$/;
