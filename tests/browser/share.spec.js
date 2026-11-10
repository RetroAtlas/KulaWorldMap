import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { settle, trackErrors } from "./helpers.js";
import { EDIT, docOf, faced, shown, toasts } from "./drafthelpers.js";
import { carriesLevel, parseHash } from "../../public/js/viewer/permalink.js";
import { decodeSegment } from "../../public/js/format/share.js";
import { readProject, writeProject } from "../../public/js/format/project.js";
import { address } from "../../public/js/viewer/ui/address.js";
import { ISSUE_FORM } from "../../public/js/editor/sendlink.js";

const NOTE =
  "This link carries the whole level, so anyone who opens it sees it on the map and can copy it to make it their own. The link holds the level as it is now. Share it again after you change it.";
const HAS_ERRORS =
  "A level with errors has no link until they are fixed. The level line's note lists them.";
const TOO_LONG = "This level is too large for a link. Save it as a file instead.";
const UNCOPIED = "The link could not be copied. Select it in the field and copy it yourself.";
const SEND_NOTE =
  "A level sent in is shared under CC BY 4.0 with credit to its author, and a person looks at every level before it appears.";
const GATE = "Give the level an author first, so it can be credited.";
const PASTE =
  "This link is too long to fill the form in by itself, so copy it and paste it into the form's Link field.";
const KIN = (title) =>
  `This level still holds much of the game's ${title}, so it cannot be sent in. The community levels take levels of your own. The link and the file work as they are.`;

/** Give the shown draft the blocks `blocks` through the model. */
const shaped = (page, blocks) =>
  page.evaluate(async (blocks) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js"].map(at),
    );
    update(state.lvl.draft, { ...get(state.lvl.draft).doc, blocks });
  }, blocks);
/** Open the page at `hash`, make a new level titled `title`, by `author` where one is given and of `blocks` where they are given, and open its share box. */
async function sharing(
  page,
  { hash = EDIT, title = "Shared one", author = "", blocks = null } = {},
) {
  await page.goto(hash);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  if (blocks) await shaped(page, blocks);
  await page.locator("#draftTitle").fill(title);
  if (author) await page.locator("#draftAuthor").fill(author);
  const id = (await shown(page)).draft;
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  return { id, box, link: await box.locator("#shareLink").inputValue() };
}
/** The link's own row of ways, the second row of the box left out. */
const ways = (box) => box.locator(".box > .row button:visible");
/** Have the page record what `window.open` is handed in place of opening anything. */
const opened = (page) =>
  page.addInitScript(() => {
    window.__opened = [];
    window.open = (...args) => {
      window.__opened.push(args);
      return null;
    };
  });
const seeded = (seed) => () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
/** `n` characters from the planes above the first, which deflate shortens little, drawn by a fixed rule so a length holds. */
const wide = (n, next) =>
  Array.from({ length: n }, () =>
    String.fromCodePoint(0x10000 + Math.floor(next() * 0x100000)),
  ).join("");
/** Give the shown draft the texts of `meta` through the model. */
const texted = (page, meta) =>
  page.evaluate(async (meta) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get, update }, { setMeta }] = await Promise.all(
      ["viewer/state.js", "editor/drafts.js", "format/project.js"].map(at),
    );
    update(state.lvl.draft, setMeta(get(state.lvl.draft).doc, meta));
  }, meta);

test("share… on the Level card opens the box with a link that carries the level, framed to fit and turned as the map is, selected in its field", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { id, box, link } = await sharing(page, { hash: "/#HIRO/0/30,20/fit/33" });
  await expect(box.locator("#shareTitle")).toHaveText("Share this level");
  await expect(box.locator("#shareNote")).toHaveText(NOTE);
  const field = box.locator("#shareLink");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("readonly", "");
  expect(await field.evaluate((f) => [f.selectionStart, f.selectionEnd])).toEqual([0, link.length]);
  expect(link.startsWith(`${page.url().split("#")[0]}#SHARED/`)).toBe(true);
  const hash = link.slice(link.indexOf("#"));
  const read = parseHash(hash);
  expect(read.slot).toMatch(/^SHARED\/L[0-9A-Z]+$/);
  expect(read.turn).toEqual([30, 20]);
  expect([read.zoom, read.target, read.pan, read.picked, read.slice]).toEqual([
    null,
    null,
    null,
    null,
    33,
  ]);
  expect(read.tails).toHaveLength(1);
  expect(read.tails[0]).toMatch(/^s/);
  expect(carriesLevel(hash)).toBe(true);
  const { project } = await decodeSegment(read.tails[0]);
  expect(writeProject(project)).toBe(writeProject(await docOf(page, id)));
  // the share sheet is offered only where the browser has one, which this one has not
  expect(await page.evaluate(() => typeof navigator.share)).toBe("undefined");
  await expect(box.locator("#shareApp")).toBeHidden();
  await expect(box.locator("#shareSays")).toBeEmpty();
  await expect(ways(box)).toHaveText([
    "copy the link",
    "email it to someone",
    "save the file instead",
    "cancel",
  ]);
  await box.locator("#shareCancel").click();
  await expect(box).toBeHidden();
  await expect(page.locator("#draftShare")).toBeFocused();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("copy the link writes it to the clipboard, says so and closes the box", async ({
  page,
  context,
}) => {
  const errors = trackErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { box, link } = await sharing(page);
  await box.locator("#shareCopy").click();
  await expect(box).toBeHidden();
  await expect(page.locator("#toastStack .toast")).toHaveText(["Link copied."]);
  await expect(page.locator("#say")).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  expect(errors).toEqual([]);
});

test("a copy the browser refuses keeps the box open and points at the field", async ({ page }) => {
  const errors = trackErrors(page);
  const { box } = await sharing(page);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () =>
      Promise.reject(new DOMException("refused", "NotAllowedError"));
  });
  await box.locator("#shareCopy").click();
  await expect(box.locator("#shareSays")).toHaveText(UNCOPIED);
  await expect(box).toBeVisible();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("save the file instead downloads the map's file, marks the draft saved and closes the box", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { id, box } = await sharing(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    box.locator("#shareFile").click(),
  ]);
  expect(download.suggestedFilename()).toBe("shared-one.kula.json");
  const text = readFileSync(await download.path(), "utf8");
  expect(readProject(text).project).toEqual(await docOf(page, id));
  await expect(box).toBeHidden();
  await expect(page.locator("#draftRows button .line")).toHaveText("HIRO · saved to a file");
  expect(errors).toEqual([]);
});

test("email it to someone opens a new message with the title as its subject and the link in its body", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const { box, link } = await sharing(page, { title: "Spiral & Co" });
  await box.locator("#shareMail").click();
  expect(await page.evaluate(() => window.__opened)).toEqual([
    [
      `mailto:?subject=${encodeURIComponent("Spiral & Co")}&body=${encodeURIComponent(link)}`,
      "_blank",
      "noopener",
    ],
  ]);
  await expect(box).toBeHidden();
  expect(errors).toEqual([]);
});

test("send to an app… leads the row where the browser can share, and hands the sheet the title and the link", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.share = (data) => {
      window.__shared.push(data);
      return Promise.resolve();
    };
    navigator.canShare = (data) => typeof data?.url === "string";
  });
  const { box, link } = await sharing(page, { title: "Sent one" });
  await expect(ways(box)).toHaveText([
    "send to an app…",
    "copy the link",
    "email it to someone",
    "save the file instead",
    "cancel",
  ]);
  await box.locator("#shareApp").click();
  await expect(box).toBeHidden();
  expect(await page.evaluate(() => window.__shared)).toEqual([{ title: "Sent one", url: link }]);
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a share sheet dismissed says nothing, and one the browser cannot show points at the field", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    window.__sheet = "AbortError";
    navigator.share = () => Promise.reject(new DOMException("no sheet", window.__sheet));
    navigator.canShare = () => true;
  });
  const { box } = await sharing(page);
  await box.locator("#shareApp").click();
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSays")).toBeEmpty();
  await page.evaluate(() => {
    window.__sheet = "NotAllowedError";
  });
  await box.locator("#shareApp").click();
  await expect(box.locator("#shareSays")).toHaveText(UNCOPIED);
  await expect(box).toBeVisible();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a level the checks find errors in opens the box refusing, with the file alone, and gets its link back once they are fixed", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await faced(page, 0, null);
  await expect(page.locator("#draftErrors")).toHaveText("1 error, listed under the level line");
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSays")).toHaveText(HAS_ERRORS);
  await expect(box.locator("#shareNote")).toBeHidden();
  await expect(box.locator("#shareLink")).toBeHidden();
  await expect(ways(box)).toHaveText(["save the file instead", "cancel"]);
  await expect(box.locator("#shareFile")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(box).toBeHidden();
  await faced(page, 0, { type: 30, facing: 3 });
  await expect(page.locator("#draftErrors")).toBeHidden();
  await page.locator("#draftShare").click();
  await expect(box).toBeVisible();
  await expect(box.locator("#shareLink")).toBeVisible();
  await expect(box.locator("#shareNote")).toBeVisible();
  await expect(box.locator("#shareSays")).toBeEmpty();
  const link = await box.locator("#shareLink").inputValue();
  expect(carriesLevel(link.slice(link.indexOf("#")))).toBe(true);
  expect(errors).toEqual([]);
});

test("a level too large for a link leads with the file and says so", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const next = seeded(7);
  const notes = wide(2000, next);
  await texted(page, { author: wide(2000, next), notes });
  await expect(page.locator("#draftNotes")).toHaveValue(notes);
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSays")).toHaveText(TOO_LONG);
  const link = await box.locator("#shareLink").inputValue();
  expect(link.length).toBeGreaterThan(8000);
  expect(carriesLevel(link.slice(link.indexOf("#")))).toBe(true);
  await expect(ways(box)).toHaveText([
    "save the file instead",
    "copy the link",
    "email it to someone",
    "cancel",
  ]);
  expect(errors).toEqual([]);
});

test("send it in by email opens a message to the map's makers carrying the title, the link and the grant, and closes the box", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const { box, link } = await sharing(page, { title: "Spiral & Co", author: "Ada" });
  await expect(box.locator("#shareSend h4")).toHaveText("Send it to the community levels");
  await expect(box.locator("#shareSendNote")).toBeVisible();
  await expect(box.locator("#shareSendNote")).toHaveText(SEND_NOTE);
  await expect(box.locator("#shareGate")).toBeHidden();
  await expect(box.locator("#shareKin")).toBeHidden();
  await expect(box.locator("#shareSendPaste")).toBeHidden();
  await expect(box.locator("#shareSend .row button:visible")).toHaveText([
    "send it in by email",
    "send it in as a GitHub issue (needs an account)",
  ]);
  await box.locator("#shareSendMail").click();
  const calls = await page.evaluate(() => window.__opened);
  expect(calls).toHaveLength(1);
  const [url, target, features] = calls[0];
  expect([target, features]).toEqual(["_blank", "noopener"]);
  const at = new URL(url);
  expect(at.protocol).toBe("mailto:");
  expect(at.pathname).toBe(address());
  expect([...at.searchParams.keys()]).toEqual(["subject", "body"]);
  expect(at.searchParams.get("subject")).toBe("A level for the community levels: Spiral & Co");
  const body = at.searchParams.get("body");
  expect(body).toContain(link);
  expect(body).toContain("Spiral & Co, by Ada.");
  expect(body).toContain("I made this level and share it under CC BY 4.0, credited to Ada.");
  await expect(box).toBeHidden();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("send it in as a GitHub issue opens the repository's form with the title and the link filled in, and closes the box", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  const { box, link } = await sharing(page, { title: "Spiral & Co", author: "Ada" });
  await box.locator("#shareSendIssue").click();
  const calls = await page.evaluate(() => window.__opened);
  expect(calls).toHaveLength(1);
  const [url, target, features] = calls[0];
  expect([target, features]).toEqual(["_blank", "noopener"]);
  const at = new URL(url);
  expect(at.origin).toBe("https://github.com");
  expect(at.pathname).toBe("/RetroAtlas/KulaWorldMap/issues/new");
  expect([...at.searchParams.keys()]).toEqual(["template", "title", "link"]);
  expect(at.searchParams.get("template")).toBe("level.yml");
  expect(at.searchParams.get("title")).toBe("A level for the community levels: Spiral & Co");
  expect(at.searchParams.get("link")).toBe(link);
  await expect(box).toBeHidden();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a level with no author is asked for one in place of the ways to send it in, which stand once it has one", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const { box } = await sharing(page);
  await expect(box.locator("#shareSend h4")).toHaveText("Send it to the community levels");
  await expect(box.locator("#shareGate")).toHaveText(GATE);
  await expect(box.locator("#shareSendNote")).toBeHidden();
  await expect(box.locator("#shareSendMail")).toBeHidden();
  await expect(box.locator("#shareSendIssue")).toBeHidden();
  await expect(box.locator("#shareSendPaste")).toBeHidden();
  await box.locator("#shareCancel").click();
  await expect(box).toBeHidden();
  await page.locator("#draftAuthor").fill("   ");
  await page.locator("#draftShare").click();
  await expect(box).toBeVisible();
  await expect(box.locator("#shareGate")).toBeVisible();
  await expect(box.locator("#shareSendMail")).toBeHidden();
  await box.locator("#shareCancel").click();
  await page.locator("#draftAuthor").fill("Ada");
  await page.locator("#draftShare").click();
  await expect(box).toBeVisible();
  await expect(box.locator("#shareGate")).toBeHidden();
  await expect(box.locator("#shareSendNote")).toBeVisible();
  await expect(box.locator("#shareSendNote")).toHaveText(SEND_NOTE);
  await expect(box.locator("#shareSendMail")).toBeVisible();
  await expect(box.locator("#shareSendIssue")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a copy of one of the game's levels is told it cannot be sent in, in place of the offer, once it names an author, while the link and its ways stand", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftCopy").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await expect(page.locator("#draftFrom")).toHaveText("Copied from LEVEL 1");
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  await expect(box.locator("#shareGate")).toHaveText(GATE);
  await expect(box.locator("#shareKin")).toBeHidden();
  await box.locator("#shareCancel").click();
  await expect(box).toBeHidden();
  await page.locator("#draftAuthor").fill("Ada");
  await page.locator("#draftShare").click();
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSend h4")).toHaveText("Send it to the community levels");
  await expect(box.locator("#shareKin")).toHaveText(KIN("LEVEL 1"));
  await expect(box.locator("#shareGate")).toBeHidden();
  await expect(box.locator("#shareSendNote")).toBeHidden();
  await expect(box.locator("#shareSendPaste")).toBeHidden();
  await expect(box.locator("#shareSendMail")).toBeHidden();
  await expect(box.locator("#shareSendIssue")).toBeHidden();
  await expect(box.locator("#shareSays")).toBeEmpty();
  await expect(box.locator("#shareNote")).toHaveText(NOTE);
  const field = box.locator("#shareLink");
  await expect(field).toBeVisible();
  const link = await field.inputValue();
  expect(carriesLevel(link.slice(link.indexOf("#")))).toBe(true);
  await expect(ways(box)).toHaveText([
    "copy the link",
    "email it to someone",
    "save the file instead",
    "cancel",
  ]);
  await box.locator("#shareCancel").click();
  await expect(box).toBeHidden();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a level that only resembles one of the game's levels is offered the send-in as any other", async ({
  page,
}) => {
  const errors = trackErrors(page);
  const slab = [];
  for (let x = 17; x <= 20; x++)
    for (let y = 17; y <= 20; y++) slab.push({ cell: [x, y, 17], kind: 0 });
  slab[0].faces = { 0: { type: 30, facing: 3 } };
  const { box } = await sharing(page, { title: "Slab", author: "Ada", blocks: slab });
  await expect(box.locator("#shareSend h4")).toHaveText("Send it to the community levels");
  await expect(box.locator("#shareKin")).toBeHidden();
  await expect(box.locator("#shareGate")).toBeHidden();
  await expect(box.locator("#shareSendNote")).toHaveText(SEND_NOTE);
  await expect(box.locator("#shareSendMail")).toBeVisible();
  await expect(box.locator("#shareSendIssue")).toBeVisible();
  expect(await toasts(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a link past the form's room and short of the link's own bound opens the form bare, says to paste the link in and keeps the box up for the copy", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  const notes = wide(1000, seeded(7));
  await texted(page, { author: "Ada", notes });
  await expect(page.locator("#draftNotes")).toHaveValue(notes);
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSays")).toBeEmpty();
  await expect(box.locator("#shareSendPaste")).toBeVisible();
  await expect(box.locator("#shareSendPaste")).toHaveText(PASTE);
  await box.locator("#shareSendIssue").click();
  expect(await page.evaluate(() => window.__opened)).toEqual([[ISSUE_FORM, "_blank", "noopener"]]);
  await expect(box).toBeVisible();
  await expect(box.locator("#shareLink")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a level with errors has no second part, since there is no link to send in", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(EDIT);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#draftRows button")).toHaveCount(1);
  await page.locator("#draftAuthor").fill("Ada");
  await faced(page, 0, null);
  await expect(page.locator("#draftErrors")).toHaveText("1 error, listed under the level line");
  await page.locator("#draftShare").click();
  const box = page.locator("#share");
  await expect(box).toBeVisible();
  await expect(box.locator("#shareSays")).toHaveText(HAS_ERRORS);
  await expect(box.locator("#shareSend")).toBeHidden();
  expect(errors).toEqual([]);
});
