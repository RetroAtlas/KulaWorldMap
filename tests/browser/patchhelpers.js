import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { writeProject } from "../../public/js/format/project.js";

export const EDIT = "/#HIRO/0/45,35/fit/33";

export const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL("../fixtures/patch-digests.json", import.meta.url)), "utf8"),
);

export const CASE = fixture.cases[0];

export const ADD = "add a level…";

export const FILE = "a file…";

export const WARNINGS = [
  "the image has 43 sectors, not the 109,607 of the Roll Away disc",
  "19 of the 21 packs are missing",
];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const file = (name, data) => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(data),
});

export const shownDraft = (page) =>
  page.evaluate(async () => {
    const { state } = await import(new URL("js/viewer/state.js", location.href).href);
    return state.lvl.draft;
  });

export const docOf = (page, id) =>
  page.evaluate(async (id) => {
    const { get } = await import(new URL("js/editor/drafts.js", location.href).href);
    return get(id)?.doc ?? null;
  }, id);

export const toasts = (page) => page.locator("#toastStack .toast").allTextContents();

/** Every draft this browser holds: its id, title, target and save, as the store lists them. */
export const listed = (page) =>
  page.evaluate(async () => {
    const { list } = await import(new URL("js/editor/drafts.js", location.href).href);
    return list().map((d) => ({
      id: d.id,
      title: d.doc.title,
      into: d.doc.into ?? null,
      saved: d.saved,
      edits: d.edits,
    }));
  });

export const openPatch = (page, id) =>
  page.evaluate(async (id) => {
    const { openPatchDialog } = await import(
      new URL("js/editor/patchdialog.js", location.href).href
    );
    await openPatchDialog(id);
  }, id);

export const saved = async (page, locator) => {
  const [download] = await Promise.all([page.waitForEvent("download"), locator.click()]);
  return { name: download.suggestedFilename(), bytes: readFileSync(await download.path()) };
};

export const rows = (dialog) => dialog.locator("#patchRows .level");

/** Open a project as a draft through the sidebar's file input, and give its id. */
export async function opened(page, name, project) {
  await page.locator("#draftFile").setInputFiles(file(name, writeProject(project)));
  await expect(page.locator("#chipLine b")).toHaveText(project.title);
  return shownDraft(page);
}

/** The store as another tab would write it, once this tab's write of the draft has landed. */
export async function stored(page, id) {
  await page.evaluate(async () => {
    const { flush } = await import(new URL("js/editor/drafts.js", location.href).href);
    flush();
  });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("kula.drafts")))
    .toContain(`"${id}":`);
  return page.evaluate(() => JSON.parse(localStorage.getItem("kula.drafts")));
}

/** Write the store from a second tab of the same browser, which reaches the first as a storage event. */
export async function elsewhere(page, store) {
  const other = await page.context().newPage();
  await other.goto("/");
  await other.evaluate((s) => localStorage.setItem("kula.drafts", JSON.stringify(s)), store);
  await other.close();
}
