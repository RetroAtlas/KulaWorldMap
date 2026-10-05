// Measures where the map's frames spend the main thread: the map opened at a
// phone's size in Chromium on this machine's own GPU, the CPU slowed through
// CDP, and the animation loop left running while a sampling profile is
// taken. Each view prints its frames a second, the median frame's script,
// and the milliseconds per frame each part of the renderer takes, a sample
// counting to the outermost part it falls in. Given a ref, the ref's public/
// is measured beside the working tree's, a round of each in turn, since two
// runs of the same tree differ by a few per cent.
//
//     npm run frame -- [<ref>] [--views a,b] [--dpr 1,3] [--rate 4] [--secs 4]
//         [--rounds 2] [--size 412x915] [--pointer hover|drag]
//         [--show key=value,...] [--detail] [--lines <file pattern>]
//
// A view is one of VIEWS by name or a permalink's hash. --pointer moves the
// mouse over the map for the whole run, pressed or not; --show sets display
// switches; --detail names what each part spends its time in; --lines counts
// the time in each line of the files whose names the pattern matches.
//
// The full Chromium draws on the GPU. The headless shell that Playwright
// launches by default draws on SwiftShader, which puts the canvas's raster
// on the main thread and makes it look like most of a frame.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, serve, checkout } from "../public.js";

const VIEWS = {
  bonus29: "#HELL/16/-333,-3/fit/33",
  obj: "#HILLS/19/45,35/fit/33",
  invisible: "#INCA/14/45,35/fit/33",
  lasers: "#HELL/13/45,35/fit/33",
  travellers: "#FIELD/9/45,35/fit/33",
};

// The parts of a frame, by the function the renderer draws each through.
// A sample under draw in none of them is the draw's own, and one outside
// the page's script is the browser's: the canvas's flush to the GPU, the
// compositor, input.
const PARTS = {
  visible: "sort",
  travelling: "travel",
  deviceLights: "lights",
  drawBlock: "blocks",
  drawThing: "things",
  drawBeams: "beams",
  paintPick: "pick",
  drawRails: "overlays",
  drawBase: "overlays",
  drawScale: "overlays",
  drawLink: "overlays",
  outline: "overlays",
  drawMark: "overlays",
};
const OUTSIDE = { "(idle)": "idle", "(program)": "native", "(garbage collector)": "gc" };

/** The parts whose function the viewer at `root` does not define, where a
    rename would count their time to the draw's own without a word. */
async function unknownParts(root) {
  const dir = join(root, "js");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  const source = (await Promise.all(files.map((f) => readFile(join(dir, f), "utf8")))).join("\n");
  const defines = (name) =>
    new RegExp(`\\b(function\\s+${name}|(const|let)\\s+${name}\\s*=)`).test(source);
  return Object.keys(PARTS).filter((name) => !defines(name));
}

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return value;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
// a hash has commas of its own, and a view begins with a letter or a hash sign
const views = option("--views", Object.keys(VIEWS).join(",")).split(/,(?=[#a-z])/);
const dprs = option("--dpr", "3").split(",").map(Number);
const rate = Number(option("--rate", "4"));
const secs = Number(option("--secs", "4"));
const rounds = Number(option("--rounds", "2"));
const [width, height] = option("--size", "412x915").split("x").map(Number);
const pointer = option("--pointer", null);
const show = Object.fromEntries(
  option("--show", "")
    .split(",")
    .filter(Boolean)
    .map((kv) => kv.split("="))
    .map(([k, v]) => [k, v === "true"]),
);
const lines = option("--lines", null);
const detail = flag("--detail");
const ref = args[0] || null;

/** Every animation frame's script, summed over the callbacks it runs. */
function instrument() {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = null;
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const start = performance.now();
      cb(t);
      const f = window.__frames;
      if (f) f.set(t, (f.get(t) || 0) + performance.now() - start);
    });
}

async function open(browser, base, view, dpr) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.addInitScript(instrument);
  await page.goto(`${base}/${VIEWS[view] || view}`);
  const about = await page.evaluate(async (show) => {
    const { state } = await import("/js/state.js");
    const { atlasFor } = await import("/js/atlas.js");
    const R = await import("/js/render.js");
    const wait = () => new Promise((r) => setTimeout(r, 20));
    while (!(state.lvl && document.getElementById("cv").clientWidth > 0)) await wait();
    while (!atlasFor(state.lvl.theme)) await wait();
    Object.assign(state.show, show);
    R.invalidatePick();
    R.draw();
    const cv = document.getElementById("cv");
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      level: state.lvl.shown || state.lvl.name,
      canvas: `${cv.width}x${cv.height}`,
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
    };
  }, show);
  return { page, about };
}

/** Move the mouse round the middle of the map until stopped, pressed for a drag. */
async function move(page, how) {
  const [cx, cy] = [width / 2, height / 2];
  await page.mouse.move(cx, cy);
  if (how === "drag") await page.mouse.down();
  let going = true;
  const done = (async () => {
    for (let i = 0; going; i++) {
      await page.mouse.move(
        cx + 0.3 * width * Math.sin(i / 20),
        cy + 0.1 * height * Math.cos(i / 20),
      );
      await page.waitForTimeout(8);
    }
  })();
  return async () => {
    going = false;
    await done;
  };
}

/** A profile's samples summed into parts, and into their leaves and lines. */
function digest(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const leafName = ({ functionName, url, lineNumber }) =>
    url
      ? `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber + 1}`
      : functionName;
  const parts = new Map();
  const leaves = new Map();
  const add = (map, key, ms) => map.set(key, (map.get(key) || 0) + ms);
  let total = 0;
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] || 0) / 1000;
    total += ms;
    const stack = [];
    for (let at = id; at !== undefined; at = parent.get(at)) stack.unshift(byId.get(at).callFrame);
    const leaf = stack.at(-1);
    let part = OUTSIDE[leaf.functionName];
    if (!part) {
      const named = stack.find((f) => PARTS[f.functionName]);
      part = named
        ? PARTS[named.functionName]
        : stack.some((f) => f.functionName === "draw")
          ? "draw"
          : "other script";
    }
    add(parts, part, ms);
    if (!leaves.has(part)) leaves.set(part, new Map());
    add(leaves.get(part), leafName(leaf), ms);
  });
  const perLine = new Map();
  if (lines) {
    const pattern = new RegExp(lines);
    const ticks = profile.samples.length;
    for (const n of profile.nodes) {
      const { url, functionName } = n.callFrame;
      if (!url || !pattern.test(url.split("/").pop())) continue;
      for (const t of n.positionTicks || []) {
        const key = `${url.split("/").pop()}:${t.line} ${functionName || "(anonymous)"}`;
        add(perLine, key, (t.ticks * total) / ticks);
      }
    }
  }
  return { parts, leaves, perLine };
}

/** The animation frames a page draws over `ms`: each frame's script, by its time. */
async function frames(page, ms) {
  await page.evaluate(() => (window.__frames = new Map()));
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const f = [...window.__frames.values()];
    window.__frames = null;
    return f;
  });
}

/** One view at one ratio: how fast it draws, left alone, and then, under the
    profiler, where its frames' time goes. */
async function measure(browser, base, view, dpr) {
  const { page, about } = await open(browser, base, view, dpr);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const stop = pointer ? await move(page, pointer) : null;
  await page.waitForTimeout(500);
  const quiet = await frames(page, secs * 1000);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const profiled = await frames(page, secs * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  if (stop) await stop();
  await page.close();
  const script = [...quiet].sort((a, b) => a - b);
  return {
    ...about,
    fps: quiet.length / secs,
    script: script[Math.floor(script.length / 2)],
    frames: profiled.length,
    ...digest(profile),
  };
}

// a view that draws no animation frames has no frame to divide its time by
const fixed = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");
const top = (map, n) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n);

function report(view, dpr, sides) {
  const [first] = Object.values(sides)[0];
  console.log(`\n${view}: ${first.level}, ${first.canvas} at DPR ${dpr} on ${first.gpu}`);
  const names = Object.keys(sides);
  const row = (label, value) =>
    console.log(
      `  ${label.padEnd(26)}` +
        names.map((s) => sides[s].map(value).join("  ").padEnd(24)).join(""),
    );
  if (Object.values(sides).some((runs) => runs.some((r) => !r.frames)))
    console.log("  drew no animation frames on a run: nothing moves there, or Motion is off");
  if (names.length > 1) console.log(`  ${"".padEnd(26)}${names.map((s) => s.padEnd(24)).join("")}`);
  row("frames a second", (r) => r.fps.toFixed(1));
  row("median frame script, ms", (r) => fixed(r.script));
  console.log("  ms a frame in");
  const parts = new Map();
  for (const runs of Object.values(sides))
    for (const r of runs) for (const [p, ms] of r.parts) parts.set(p, (parts.get(p) || 0) + ms);
  for (const [part] of top(parts, parts.size)) {
    row(`  ${part}`, (r) => fixed((r.parts.get(part) || 0) / r.frames));
    if (!detail) continue;
    for (const s of names) {
      const r = sides[s].at(-1);
      for (const [leaf, ms] of top(r.leaves.get(part) || new Map(), 5))
        console.log(`        ${fixed(ms / r.frames)}  ${leaf}${names.length > 1 ? ` (${s})` : ""}`);
    }
  }
  if (lines)
    for (const s of names) {
      const r = sides[s].at(-1);
      console.log(`  ms a frame by line${names.length > 1 ? `, ${s}` : ""}`);
      for (const [line, ms] of top(r.perLine, 25))
        console.log(`        ${fixed(ms / r.frames)}  ${line}`);
    }
}

let scratch = null;
const servers = {};
let browser = null;
try {
  if (ref) scratch = await mkdtemp(join(tmpdir(), "kula-frame-"));
  const roots = { ...(ref && { [ref]: checkout(ref, scratch) }), tree: join(ROOT, "public") };
  for (const [side, root] of Object.entries(roots)) {
    servers[side] = await serve(root);
    const unknown = await unknownParts(root);
    if (unknown.length)
      console.warn(`${side} defines no ${unknown.join(", ")}: time there counts to draw`);
  }
  browser = await chromium.launch({ channel: "chromium" });
  console.log(
    `CPU throttled ${rate}x, ${width}x${height}, ${secs}s a run, ${ref ? rounds : 1} round${ref && rounds > 1 ? "s" : ""}` +
      (pointer ? `, the mouse ${pointer === "drag" ? "dragging" : "hovering"}` : ""),
  );
  for (const view of views)
    for (const dpr of dprs) {
      const sides = Object.fromEntries(Object.keys(servers).map((s) => [s, []]));
      for (let round = 0; round < (ref ? rounds : 1); round++)
        for (const [side, server] of Object.entries(servers)) {
          const base = `http://127.0.0.1:${server.address().port}`;
          sides[side].push(await measure(browser, base, view, dpr));
        }
      report(view, dpr, sides);
    }
} finally {
  await browser?.close();
  for (const server of Object.values(servers)) server.close();
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
