// Renders the map from the working tree and from a git ref, HEAD unless one
// is given, over the matrix in cases.js with the page's clock held still,
// and names every capture that differs: the map canvas, the pick canvas, the
// hit test over a grid of points, whether the frame goes on redrawing, and
// whether a world's atlas redraws the map when it lands. A change that is to
// draw exactly as before passes with nothing named.
//
//     npm run pixels -- [<ref>] [--save <dir>] [--all]
//
// --save writes both sides of every capture that differs as PNGs. Past a few
// differing captures the rest are counted by what differs rather than named,
// and --all names every one.
import { spawnSync } from "node:child_process";
import http from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { cases, live } from "./cases.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
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
const LISTED = 20; // how many differing captures are named before the rest are counted
const ref = args[0] || "HEAD";

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

function serve(root) {
  return new Promise((done) => {
    const server = http.createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) return res.writeHead(403).end();
      try {
        const body = await readFile(file);
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, "127.0.0.1", () => done(server));
  });
}

/** The clock held at a time the runner sets, animation frames asked for and
    never run, and the atlases and the pick canvas where the runner finds them. */
function instrument() {
  let now = 0;
  performance.now = () => now;
  window.__setNow = (t) => {
    now = t;
  };
  window.__realRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = () => 0;
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

async function open(page, base) {
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  await page.addInitScript(instrument);
  await page.goto(`${base}/#HIRO/0`);
  await page.evaluate(async () => {
    const { state } = await import("/js/state.js");
    const deadline = Date.now() + 30000;
    while (!(state.lvl && document.getElementById("cv").clientWidth > 0)) {
      if (Date.now() > deadline) throw new Error("the map did not load");
      await new Promise((r) => setTimeout(r, 20));
    }
    await new Promise((r) => setTimeout(r, 600));
    window.__defaults = { ...state.show };
  });
}

/** What is on the canvas once a world's atlas lands, against what a draw of
    its own paints then. */
async function arrival(page) {
  return page.evaluate(async () => {
    const { state } = await import("/js/state.js");
    const R = await import("/js/render.js");
    const N = await import("/js/navigate.js");
    const cv = document.getElementById("cv");
    const shot = async () => {
      const data = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))].join(",");
    };
    const out = [];
    for (const world of ["HIRO", "INCA", "HAZE"]) {
      if (world !== "HIRO") {
        N.selectLevel(state.data.levels.findIndex((l) => l.theme === world));
        R.draw();
      }
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
    const { state } = await import("/js/state.js");
    const R = await import("/js/render.js");
    const N = await import("/js/navigate.js");
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
      const { state, cellKey, SIDE } = await import("/js/state.js");
      const R = await import("/js/render.js");
      const N = await import("/js/navigate.js");
      const { frameAt } = await import("/js/motion.js");
      const { motionTable } = await import("/js/data.js");
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
      // a pose rather than a fit, which a resize leaves where it is
      if (c.zoom || c.pan) state.framing = null;
      const l = state.lvl;
      const idx = state.idx;
      if (c.slice === "mid") state.slice = SIDE - 1 - Math.round((l.min[2] + l.max[2]) / 2);
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
      if (c.survey) {
        state.survey.on = true;
        state.survey.marks = new Map();
        [...idx.cells.values()].slice(0, c.survey).forEach((at, i) =>
          state.survey.marks.set(cellKey(at.x, at.y, at.z), {
            name: ["coin", "key", "exit"][i % 3],
            face: ["top", "", "+x"][i % 3],
          }),
        );
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
        for (let y = 2; y < cv.clientHeight; y += 8)
          for (let x = 2; x < cv.clientWidth; x += 8) {
            const at = R.cellAt(x, y);
            grid.push(at ? `${at.x},${at.y},${at.z}` : "");
          }
        // the pick as the hit test found it
        const pick = pk.getContext("2d").getImageData(0, 0, pk.width, pk.height).data;
        const shot = {
          id: `${c.id}@${t}`,
          main: await hash(main),
          pick: await hash(pick),
          grid: await hash(new TextEncoder().encode(grid.join(";"))),
          view: [cv.width, cv.height, state.view.dpr],
        };
        if (keep) shot.png = [cv.toDataURL("image/png"), pk.toDataURL("image/png")];
        shots.push(shot);
      }
      state.selected = null;
      state.hover = null;
      state.hiddenKinds = new Set();
      state.survey.on = false;
      state.survey.marks = new Map();
      state.presses = new Map();
      return shots;
    },
    { c, keep },
  );
}

/** Whether the map goes on drawing, frame after frame, the clock held still. */
async function liveness(page, c) {
  return page.evaluate(async (c) => {
    const { state } = await import("/js/state.js");
    const R = await import("/js/render.js");
    const N = await import("/js/navigate.js");
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

/** Every capture of the public/ at `root`, or of the cases in `only`. */
async function render(browser, root, { only = null, keep = null } = {}) {
  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}`;
  const out = [];
  try {
    for (const dpr of [1, 2]) {
      const todo = cases.filter((c) => (c.dpr || 1) === dpr && (!only || only.has(c.id)));
      if (!todo.length) continue;
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: dpr,
      });
      await open(page, base);
      if (dpr === 1 && !only) out.push(...(await arrival(page)));
      await preload(page);
      for (const c of todo) {
        for (const shot of await capture(page, c, !!keep)) {
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
      if (dpr === 1 && !only) for (const c of live) out.push(await liveness(page, c));
      await page.close();
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
  const archive = join(scratch, "ref.tar");
  for (const [cmd, ...rest] of [
    ["git", "archive", "--format=tar", "-o", archive, ref, "public"],
    ["tar", "-x", "-f", archive, "-C", scratch],
  ]) {
    const run = spawnSync(cmd, rest, { cwd: ROOT, encoding: "utf8" });
    if (run.status !== 0) throw new Error(`${cmd} failed: ${run.stderr}`);
  }
  const started = Date.now();
  const before = await render(browser, join(scratch, "public"));
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
    found.map((f) => f.id.split("@")[0]).filter((id) => cases.some((c) => c.id === id)),
  );
  if (save && shown.size) {
    const dir = resolve(save);
    await mkdir(dir, { recursive: true });
    const files = [];
    await render(browser, join(scratch, "public"), {
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
