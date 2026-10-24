// Renders the map from the working tree and from a git ref, HEAD unless one
// is given, over the matrix in cases.js with the page's clock held still,
// with the editor absent and again with it loaded by a draft kept in storage,
// and names every capture that differs: the map canvas, the pick canvas, the
// hit test over a grid of points, the cell and the face it finds, whether the
// frame goes on redrawing, and whether a world's atlas redraws the map when it
// lands. The play captures stand the ball on a level and hash the frame, the
// strip and the HUD at held game frames. A change that is to draw exactly as
// before passes with nothing named.
//
//     npm run pixels -- [<ref>] [--save <dir>] [--all]
//
// --save writes both sides of every capture that differs as PNGs. Past a few
// differing captures the rest are counted by what differs rather than named,
// and --all names every one.
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, serve, checkout, locate } from "../public.js";
import { cases, live, play } from "./cases.js";
import { WORLDS } from "../../public/js/format/kwl.js";
import { blank } from "../../public/js/format/project.js";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [, value] = args.splice(i, 2);
  return value;
};
const save = option("--save");
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const all = flag("--all");
const LISTED = 20;
const ref = args[0] || "HEAD";

// A store holding one draft loads the editor at boot, with editing off, and
// the captures taken with it loaded carry this prefix.
const DRAFTS = "kula.drafts";
const seeded = JSON.stringify({ drafts: { 1: { doc: blank(WORLDS[0]) } } });
const EDITOR = "editor/";
const SIDES = [
  ["", null],
  [EDITOR, seeded],
];
const caseOf = (id) => (id.startsWith(EDITOR) ? id.slice(EDITOR.length) : id).split("@")[0];

/** The clock held at a time the runner sets, animation frames and idle
    callbacks asked for and never run, so no atlas is fetched ahead, and the
    atlases and the pick canvas where the runner finds them. */
function instrument() {
  let now = 0;
  performance.now = () => now;
  window.__setNow = (t) => {
    now = t;
  };
  window.__realRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = () => 0;
  window.requestIdleCallback = () => 0;
  window.__images = [];
  const Img = window.Image;
  window.Image = class extends Img {
    constructor(...a) {
      super(...a);
      window.__images.push(this);
    }
  };
  window.__atlasesIn = () =>
    new Promise((done, fail) => {
      const deadline = Date.now() + 30000;
      const check = () => {
        if (window.__images.every((i) => i.complete && i.naturalWidth > 0))
          return setTimeout(done, 300);
        if (Date.now() > deadline) return fail(new Error("an atlas did not load"));
        setTimeout(check, 20);
      };
      check();
    });
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    if (opts && opts.willReadFrequently) window.__pick = this;
    return getContext.call(this, type, opts);
  };
}

async function open(page, base, store) {
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.addInitScript(instrument);
  await page.addInitScript(locate);
  if (store)
    await page.addInitScript(([key, text]) => localStorage.setItem(key, text), [DRAFTS, store]);
  // a world none of the arrive captures take, so each starts before its atlas lands
  await page.goto(`${base}/#FIELD/0`);
  await page.evaluate(async (seeded) => {
    const { state } = await window.__module("state.js");
    const deadline = Date.now() + 30000;
    // a held draft boots the editor once the map has drawn, which lists it
    const up = () =>
      state.lvl &&
      document.getElementById("cv").clientWidth > 0 &&
      (!seeded || document.querySelector("#draftRows button"));
    while (!up()) {
      if (Date.now() > deadline) throw new Error("the map did not load");
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 600));
    window.__defaults = { ...state.show };
  }, !!store);
}

/** What is on the canvas once a world's atlas lands, against what a draw of
    its own paints then. */
async function arrival(page) {
  return page.evaluate(async () => {
    const { state } = await window.__module("state.js");
    const R = await window.__module("render.js");
    const N = await window.__module("navigate.js");
    const cv = document.getElementById("cv");
    const shot = async () => {
      const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].join(",");
    };
    const out = [];
    for (const world of ["HIRO", "INCA", "HAZE"]) {
      N.selectLevel(state.data.levels.findIndex((l) => l.theme === world));
      R.draw();
      const flat = await shot();
      await window.__atlasesIn();
      const arrived = await shot();
      R.invalidatePick();
      R.draw();
      out.push({
        id: `arrive/${world}`,
        changed: flat !== arrived,
        same: arrived === (await shot()),
      });
    }
    return out;
  });
}

async function preload(page) {
  await page.evaluate(async () => {
    const { state } = await window.__module("state.js");
    const R = await window.__module("render.js");
    const N = await window.__module("navigate.js");
    for (const t of state.data.themes) {
      state.show.skins = true;
      N.selectLevel(state.data.levels.findIndex((l) => l.theme === t.id));
      R.draw();
    }
    await window.__atlasesIn();
  });
}

/** Draw one case at each of its times and hash what it painted. */
async function capture(page, c, keep) {
  return page.evaluate(
    async ({ c, keep }) => {
      const { state } = await window.__module("state.js");
      const R = await window.__module("render.js");
      const N = await window.__module("navigate.js");
      const { frameAt } = await window.__module("motion.js");
      const { motionTable } = await window.__module("data.js");
      const li = state.data.levels.findIndex(
        (l) => l.pack.endsWith("/" + c.level[0]) && l.index === c.level[1],
      );
      if (li < 0) throw new Error(`no level ${c.level}`);
      // the level's clock starts again at page time zero, before anything
      // is pressed
      window.__setNow(0);
      Object.assign(state.show, window.__defaults, c.show || {}, { motion: false });
      state.cam.yaw = c.yaw;
      state.cam.pitch = c.pitch;
      N.selectLevel(li);
      state.show.motion = c.show?.motion ?? window.__defaults.motion;
      R.draw();
      // a press is a colour pressed before the first frame, or a colour and a page time
      state.presses = new Map();
      for (const press of c.flip || []) {
        const [colour, ms] = Array.isArray(press) ? press : [press, 0];
        const at = frameAt(motionTable(), ms);
        state.presses.set(colour, [...(state.presses.get(colour) ?? []), at]);
      }
      if (c.zoom) state.cam.zoom = c.zoom;
      if (c.pan) [state.cam.panX, state.cam.panY] = c.pan;
      if (c.zoom || c.pan) state.framing = null;
      const l = state.lvl;
      const idx = state.idx;
      if (c.slice === "mid")
        state.slice = state.data.side - 1 - Math.round((l.min[2] + l.max[2]) / 2);
      // a cell's key as the index keys it
      const keys = new Map([...idx.cells].map(([k, at]) => [`${at.x},${at.y},${at.z}`, k]));
      const cellKey = (x, y, z) => keys.get(`${x},${y},${z}`);
      R.invalidatePick();
      R.draw();

      const kindAt = (at) =>
        at.v >= state.data.firstRecord
          ? idx.records.get(cellKey(at.x, at.y, at.z))?.[0]?.kind
          : at.v;
      const marks = (at) => idx.markers.get(cellKey(at.x, at.y, at.z)) || [];
      const TESTS = {
        things: (at) => marks(at).length,
        plain: (at) => kindAt(at) === 0,
        end: (at) => idx.beamEnds.has(cellKey(at.x, at.y, at.z)),
      };
      const pickCell = (how) => {
        if (!how) return null;
        const test =
          TESTS[how] ||
          (how.startsWith("kind")
            ? (at) => kindAt(at) === Number(how.slice(4))
            : (at) => marks(at).some((m) => m.face !== null && m.type === Number(how.slice(4))));
        const list = [...idx.cells.values()].filter(test);
        const at = list[Math.min(c.nth || 0, list.length - 1)];
        if (!at) throw new Error(`no cell ${how} in ${c.level}`);
        return { ...at, key: cellKey(at.x, at.y, at.z) };
      };
      state.selected = pickCell(c.select);
      state.hover = pickCell(c.hover);
      if (c.hide) {
        const ids = [...new Set([...idx.markers.values()].flat().map((m) => m.id))];
        state.hiddenKinds = new Set(ids.slice(0, c.hide));
      }

      const hash = async (bytes) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const cv = document.getElementById("cv");
      const shots = [];
      for (const t of c.frames) {
        window.__setNow(t);
        R.invalidatePick();
        R.draw();
        const pk = window.__pick;
        const main = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        const grid = [];
        const faces = [];
        for (let y = 2; y < cv.clientHeight; y += 8)
          for (let x = 2; x < cv.clientWidth; x += 8) {
            const at = R.cellAt(x, y);
            grid.push(at ? `${at.x},${at.y},${at.z}` : "");
            faces.push(at ? String(at.face ?? "") : "");
          }
        // the pick as the hit test found it
        const pick = pk.getContext("2d").getImageData(0, 0, pk.width, pk.height).data;
        const text = (list) => new TextEncoder().encode(list.join(";"));
        const shot = {
          id: `${c.id}@${t}`,
          main: await hash(main),
          pick: await hash(pick),
          grid: await hash(text(grid)),
          face: await hash(text(faces)),
          view: [cv.width, cv.height, state.view.dpr],
        };
        if (keep) shot.png = [cv.toDataURL("image/png"), pk.toDataURL("image/png")];
        shots.push(shot);
      }
      state.selected = null;
      state.hover = null;
      state.hiddenKinds = new Set();
      state.presses = new Map();
      return shots;
    },
    { c, keep },
  );
}

/** Whether the map goes on drawing, frame after frame, the clock held still. */
async function liveness(page, c) {
  return page.evaluate(async (c) => {
    const { state } = await window.__module("state.js");
    const R = await window.__module("render.js");
    const N = await window.__module("navigate.js");
    const li = state.data.levels.findIndex(
      (l) => l.pack.endsWith("/" + c.level[0]) && l.index === c.level[1],
    );
    window.__setNow(10617);
    Object.assign(state.show, window.__defaults, c.show || {});
    state.cam.yaw = c.yaw;
    state.cam.pitch = c.pitch;
    N.selectLevel(li);
    const g = document.getElementById("cv").getContext("2d");
    let n = 0;
    const clear = g.clearRect;
    g.clearRect = function (...a) {
      n++;
      return clear.apply(this, a);
    };
    window.requestAnimationFrame = window.__realRAF;
    R.draw();
    await new Promise((r) => setTimeout(r, 400));
    window.requestAnimationFrame = () => 0;
    await new Promise((r) => setTimeout(r, 100));
    g.clearRect = clear;
    return { id: `live/${c.id}`, live: n >= 8 };
  }, c);
}

// Play's captures enter at a held page time, step the game by the most frames one draw runs, as
// play caps a step, and leave with the clock stepped past the view's ease back.
const PLAY_AT = 10000;
const STEP_MS = 250;
const LEFT_MS = 500;

async function playBoot(page) {
  await page.evaluate(async () => {
    const P = await import(new URL("js/play/play.js", location.href).href);
    P.bootPlay();
  });
}

/** Stand the ball on one case's level and hash what the frame paints and what the strip and the
    HUD show at each of its game frames, and at the ending where it has one. */
async function playCapture(page, c, keep) {
  return page.evaluate(
    async ({ c, keep, at, step, left }) => {
      const { state } = await window.__module("state.js");
      const R = await window.__module("render.js");
      const N = await window.__module("navigate.js");
      const { probeOf } = await window.__module("walk.js");
      const { motionTable } = await window.__module("data.js");
      const P = await import(new URL("js/play/play.js", location.href).href);
      const li = state.data.levels.findIndex(
        (l) => l.pack.endsWith("/" + c.level[0]) && l.index === c.level[1],
      );
      if (li < 0) throw new Error(`no level ${c.level}`);
      const cv = document.getElementById("cv");
      const strip = document.getElementById("play");
      const hud = document.getElementById("hud");
      const pad = document.getElementById("pad");
      const jump = document.getElementById("jump");
      const padBtn = document.getElementById("padBtn");
      const padOn = () => padBtn.getAttribute("aria-pressed") === "true";
      const hz = motionTable().hz;
      const most = Math.floor((step * hz) / 1000);
      let now = at;
      const tick = (ms) => {
        now += ms;
        window.__setNow(now);
        R.draw();
      };
      const run = (frames) => {
        while (frames > 0) {
          const n = Math.min(frames, most);
          // a hair over, as the held clock's differences can come to a hair under a frame
          tick((n * 1000) / hz + 1e-6);
          frames -= n;
        }
      };
      // the strip's height and the canvas's size arrive through ResizeObservers, delivered in
      // the browser's rendering step
      const settled = async () => {
        let was = null;
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => window.__realRAF(r));
          await new Promise((r) => setTimeout(r, 0));
          const sizes = [state.view.w, state.view.h, strip.offsetHeight, cv.width, cv.height];
          if (sizes.join() === was) return;
          was = sizes.join();
        }
        throw new Error(`the layout did not settle on ${c.id}`);
      };
      // the effects sheet is fetched on the first particle
      const landed = async () => {
        if (window.__images.every((i) => i.complete && i.naturalWidth > 0)) return;
        await window.__atlasesIn();
      };
      const hash = async (bytes) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const text = (s) => new TextEncoder().encode(s);
      const shot = async (frame) => {
        await landed();
        R.invalidatePick();
        R.draw();
        // the hit test paints the pick whole
        R.cellAt(0, 0);
        const pk = window.__pick;
        const main = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        const pick = pk.getContext("2d").getImageData(0, 0, pk.width, pk.height).data;
        const out = {
          id: `${c.id}@${frame}`,
          main: await hash(main),
          pick: await hash(pick),
          strip: await hash(text(strip.innerText)),
          hud: await hash(text(hud.innerText)),
          clock: R.clock(),
          pad: [!pad.hidden, !jump.hidden, document.body.classList.contains("padded")],
          view: [cv.width, cv.height, state.view.dpr],
        };
        if (keep) out.png = [cv.toDataURL("image/png"), pk.toDataURL("image/png")];
        return out;
      };

      window.__setNow(0);
      Object.assign(state.show, window.__defaults, c.show, { motion: false });
      state.cam.yaw = c.yaw;
      state.cam.pitch = c.pitch;
      N.selectLevel(li);
      state.show.motion = c.show.motion;
      R.draw();
      const had = padOn();
      if (had !== !!c.pad) padBtn.click();
      window.__setNow(at);
      if (c.at) {
        const probe = probeOf(state.idx);
        const list = [...state.idx.cells.values()].filter((x) =>
          probe.standable([x.x, x.y, x.z], c.at.face),
        );
        const x = list[Math.min(c.at.nth || 0, list.length - 1)];
        if (!x) throw new Error(`no face ${c.at.face} to stand on in ${c.level}`);
        P.playAt({ x: x.x, y: x.y, z: x.z, face: c.at.face });
      } else P.togglePlay();
      if (!P.playing()) throw new Error(`play did not start on ${c.id}`);
      await settled();
      const shots = [];
      let done = 0;
      for (const f of c.frames) {
        run(f - done);
        done = f;
        // the frame drawn is the one before the frame the rules stand at
        if (R.clock() !== Math.max(0, f - 1))
          throw new Error(`the clock reads ${R.clock()} after ${f} frames on ${c.id}`);
        shots.push(await shot(f));
      }
      if (c.ending) {
        const clock = document.getElementById("playClock");
        const seconds = () => Number(clock.textContent.replace(/\D/g, ""));
        // the largest steps to the clock's last second, then a frame at a time to the ending,
        // which is when the frame is handed no ball
        for (let i = 0; seconds() >= 1; i++) {
          if (i > 10000) throw new Error(`the clock did not run out on ${c.id}`);
          run(most);
        }
        for (let i = 0; P.handed() !== null; i++) {
          if (i > 1000) throw new Error(`the level did not end on ${c.id}`);
          run(1);
        }
        shots.push(await shot("end"));
        for (const k of [1, 2]) {
          run(1);
          shots.push(await shot(`end+${k}`));
        }
      }
      P.togglePlay();
      tick(left);
      if (P.playing()) throw new Error(`play did not leave on ${c.id}`);
      if (padOn() !== had) padBtn.click();
      return shots;
    },
    { c, keep, at: PLAY_AT, step: STEP_MS, left: LEFT_MS },
  );
}

/** Every capture of the public/ at `root`, or of the cases in `only`, with
    the editor absent and with it loaded, and the ball on a level with it absent. */
async function render(browser, root, { only = null, keep = null } = {}) {
  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = [];
  try {
    for (const [side, store] of SIDES) {
      for (const dpr of [1, 2]) {
        const todo = cases.filter((c) => (c.dpr || 1) === dpr && (!only || only.has(c.id)));
        const starts = side === "" && dpr === 1 ? play.filter((c) => !only || only.has(c.id)) : [];
        if (!todo.length && !starts.length) continue;
        const page = await browser.newPage({
          viewport: { width: 1280, height: 720 },
          deviceScaleFactor: dpr,
        });
        await open(page, base, store);
        const shots = [];
        if (dpr === 1 && !only) shots.push(...(await arrival(page)));
        await preload(page);
        for (const c of todo) shots.push(...(await capture(page, c, !!keep)));
        if (dpr === 1 && !only) for (const c of live) shots.push(await liveness(page, c));
        if (starts.length) await playBoot(page);
        for (const c of starts) shots.push(...(await playCapture(page, c, !!keep)));
        await page.close();
        for (const shot of shots) {
          shot.id = side + shot.id;
          if (shot.png) {
            shot.png.forEach((url, i) => {
              const name = `${shot.id}.${i ? "pick" : "map"}.${keep.side}.png`;
              keep.files.push(
                writeFile(
                  join(keep.dir, name.replace(/[^\w.@-]/g, "_")),
                  Buffer.from(url.split(",")[1], "base64"),
                ),
              );
            });
            delete shot.png;
          }
          out.push(shot);
        }
      }
    }
  } finally {
    server.close();
  }
  return out;
}

function differences(before, after) {
  const was = new Map(before.map((r) => [r.id, r]));
  const now = new Set(after.map((r) => r.id));
  const out = before.filter((r) => !now.has(r.id)).map((r) => ({ id: r.id, differ: ["gone"] }));
  for (const r of after) {
    const s = was.get(r.id);
    if (!s) {
      out.push({ id: r.id, differ: ["new"] });
      continue;
    }
    const keys = new Set([...Object.keys(s), ...Object.keys(r)]);
    const differ = [...keys].filter((k) => JSON.stringify(s[k]) !== JSON.stringify(r[k]));
    if (differ.length) out.push({ id: r.id, differ });
  }
  return out;
}

const scratch = await mkdtemp(join(tmpdir(), "kula-pixels-"));
const browser = await chromium.launch();
try {
  const theirs = checkout(ref, scratch);
  const started = Date.now();
  const before = await render(browser, theirs);
  const after = await render(browser, join(ROOT, "public"));
  const found = differences(before, after);
  const took = ((Date.now() - started) / 1000).toFixed(0);
  const listed = all ? found : found.slice(0, LISTED);
  for (const { id, differ } of listed) console.log(`${id}: ${differ.join(" ")}`);
  if (listed.length < found.length) {
    const by = new Map();
    for (const { differ } of found) for (const k of differ) by.set(k, (by.get(k) || 0) + 1);
    const counts = [...by].map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(
      `and ${found.length - listed.length} more (--all names them); differing: ${counts}`,
    );
  }
  console.log(
    found.length
      ? `${found.length} of ${after.length} captures differ from ${ref} (${took}s)`
      : `all ${after.length} captures match ${ref} (${took}s)`,
  );
  const shown = new Set(
    found.map((f) => caseOf(f.id)).filter((id) => [...cases, ...play].some((c) => c.id === id)),
  );
  if (save && shown.size) {
    const dir = resolve(save);
    await mkdir(dir, { recursive: true });
    const files = [];
    await render(browser, theirs, {
      only: shown,
      keep: { dir, side: ref, files },
    });
    await render(browser, join(ROOT, "public"), {
      only: shown,
      keep: { dir, side: "tree", files },
    });
    await Promise.all(files);
    console.log(`both sides of every capture that differs are in ${dir}`);
  }
  process.exitCode = found.length ? 1 : 0;
} finally {
  await browser.close();
  await rm(scratch, { recursive: true, force: true });
}
