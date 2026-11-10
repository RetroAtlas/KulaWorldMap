import { expect } from "@playwright/test";
import { mapData } from "../unit/fixtures.js";
import { fromLevel, setMeta } from "../../public/js/format/project.js";
import { LICENCE, entryOf, writeCatalogue } from "../../public/js/format/catalogue.js";

// The index the page reads the community levels from, served in the page's place by a route.
export const INDEX_PATH = "/community/index.json";
export const EMPTY = "Nothing here yet.";
export const FAILED =
  "The community's levels could not be loaded. Open the panel again to try once more.";
export const TAKEN_DOWN = "That level was taken down.";
export const NO_SUCH = "The community levels hold no such level.";
export const UNLOADED =
  "The community's levels could not be loaded, so that link could not be followed.";

/** The document of the shipped level at `at` among the data's levels, titled and credited as `meta` says, as a player's own level: it names no slot it came from. */
const template = (at, meta) => {
  const doc = setMeta(fromLevel(mapData.levels[at]), meta);
  delete doc.from;
  return doc;
};
const INCA = mapData.levels.findIndex((l) => l.pack === "/INCA/INCA.PAK" && l.index === 0);
// the first level of HIRO, credited and noted, and the first of INCA, by no one
export const SPIRAL = template(0, { title: "Spiral", author: "Ada", notes: "Mind the gap." });
export const TOWER = template(INCA, { title: "Tower", author: "", notes: "" });

/** The index's text over `records`, each a document under its id, with the ids retired. */
export const indexOf = (records, retired = []) =>
  writeCatalogue({
    version: 1,
    licence: LICENCE,
    entries: Object.entries(records).map(([id, doc]) => entryOf(Number(id), doc)),
    retired,
  });
export const TWO = indexOf({ 1: SPIRAL, 2: TOWER });

/** Serve `text` as the index, or `status` with no body where one is given, counting the page's
    requests for it in `n`. */
export async function serving(page, text, status = 200) {
  const asked = { n: 0 };
  await page.route(`**${INDEX_PATH}`, (route) => {
    asked.n++;
    return status === 200
      ? route.fulfill({ contentType: "application/json", body: text })
      : route.fulfill({ status, body: "" });
  });
  return asked;
}

/** Open the fold by its summary and wait for `n` tiles. */
export async function opened(page, n) {
  await page.locator("#communityFold summary").click();
  await expect(page.locator("#communityTiles .tile")).toHaveCount(n);
}

/** How many pixels of the tile of record `id` are not the background; none where it has not been painted. */
export const drawn = (page, id) =>
  page.evaluate((id) => {
    const cv = document.querySelector(`#communityTiles .tile[data-key="${id}"] canvas`);
    if (!cv?.width) return 0;
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 0; i < px.length; i += 4)
      if (px[i + 3] && (px[i] !== 0x11 || px[i + 1] !== 0x17 || px[i + 2] !== 0x25)) n++;
    return n;
  }, id);
