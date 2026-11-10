import { expect, test } from "@playwright/test";
import { drafted, frozen, onward, trackErrors } from "./helpers.js";
import { TYPE } from "../../public/js/format/lattice.js";

// The draft: the start's block, a plain block on the block ahead of it, a boost
// button on the one beyond, out of the start's reach, and a gem on the one after,
// the button pressed by the plain block once that is selected and the gem
// glinting as the level runs.
const PLAIN = [17, 16, 17];
const BUTTON = [17, 15, 17];
const GEM = [17, 14, 17];

// the frame's fields a still paint swaps, and the two it must leave alone
const FIELDS = [
  "cam",
  "target",
  "frame",
  "view",
  "slice",
  "show",
  "hiddenKinds",
  "presses",
  "selected",
  "hover",
  "framing",
  "idx",
];

/** A digest of the map's pixels after one draw, with whether each field of the state is the
    object `window.__kept` holds for it, which the first call fills. */
const mapped = (page) =>
  page.evaluate(async (fields) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { draw }] = await Promise.all(
      ["viewer/state.js", "viewer/draw/render.js"].map(at),
    );
    draw();
    const cv = document.getElementById("cv");
    const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const digest = await crypto.subtle.digest("SHA-256", px);
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    window.__kept ??= Object.fromEntries(fields.map((k) => [k, state[k]]));
    const same = Object.fromEntries(fields.map((k) => [k, state[k] === window.__kept[k]]));
    return { hash, same };
  }, FIELDS);

/** Paint the shown draft's level, built afresh from its document, into a canvas of 160 by 120 CSS
    pixels off the page's flow, textured and then flat: what each paint says and how many of its
    pixels are not the background. */
const painted = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ state }, { get }, { toLevel }, { index }, { paintLevel }] = await Promise.all(
      [
        "viewer/state.js",
        "editor/drafts.js",
        "format/project.js",
        "viewer/data.js",
        "viewer/draw/still.js",
      ].map(at),
    );
    const id = state.lvl.draft;
    const l = toLevel(get(id).doc, id);
    const idx = index(l);
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:0;top:0;width:160px;height:120px;visibility:hidden";
    document.body.append(cv);
    const paint = (opts) => {
      const { textured } = paintLevel(cv, l, idx, opts);
      const px = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let drawn = 0;
      for (let i = 0; i < px.length; i += 4)
        if (px[i] !== 0x11 || px[i + 1] !== 0x17 || px[i + 2] !== 0x25) drawn++;
      return { textured, size: [cv.width, cv.height], drawn };
    };
    const out = { textured: paint(), flat: paint({ textures: false }) };
    cv.remove();
    return out;
  });

test("a still paint of the shown draft leaves the frame's fields, its stores and the map's pixels as they were", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await drafted(page, {
    blocks: [
      [PLAIN, { kind: 0 }],
      [BUTTON, { kind: 0 }],
      [GEM, { kind: 0 }],
    ],
    faces: [
      [BUTTON, 0, { type: TYPE.BOOST_BUTTON }],
      [GEM, 0, { type: TYPE.GEM, variant: 0 }],
    ],
    textures: true,
  });
  await frozen(page);
  // the plain block selected stands a ball beside the button, which the start's own ball is out
  // of reach of, so the frame's press is on from the next frame
  await page.evaluate(async ([x, y, z]) => {
    const { showCell } = await import(new URL("js/viewer/chrome/detail.js", location.href).href);
    showCell({ x, y, z });
  }, PLAIN);
  await onward(page, 4);
  const before = await mapped(page);
  const still = await painted(page);
  expect(still.textured).toEqual({ textured: true, size: [160, 120], drawn: expect.any(Number) });
  expect(still.flat).toEqual({ textured: false, size: [160, 120], drawn: expect.any(Number) });
  expect(still.textured.drawn).toBeGreaterThan(0);
  expect(still.flat.drawn).toBeGreaterThan(0);
  const after = await mapped(page);
  expect(after.same).toEqual(Object.fromEntries(FIELDS.map((k) => [k, true])));
  expect(after.hash).toBe(before.hash);
  expect(errors).toEqual([]);
});
