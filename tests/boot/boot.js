// Measures how the map boots: the page opened in Chromium over a throttled
// network with the cache off, and when the page lands, when the boot's modules
// and its data have all arrived, when the first frame with a level on it is
// drawn, and when the shown world's textures are asked for and land, which is
// the first textured frame. Given a ref, the ref's public/ is measured beside
// the working tree's, a round of each in turn, since two runs of the same tree
// differ by a few per cent. The server here is HTTP/1.1 over six connections,
// where the host's HTTP/2 carries every request on one, so the modules cost
// more here than there: the sides compare fairly and the figures are on the
// conservative side.
//
//     npm run boot -- [<ref>] [--views a,b] [--net 10000/60] [--rounds 3] [--detail]
//
// A view is a permalink's hash, or "-" for a visit without one; --net is the
// downlink in kbit/s and the round trip in ms; --detail lists every request of
// the last round, in the order it was asked for.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { ROOT, serve, checkout } from "../public.js";

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
const views = option("--views", "-,#INCA/11/45,35/fit/33").split(/,(?=[-#])/);
const [down, rtt] = option("--net", "10000/60").split("/").map(Number);
const rounds = Number(option("--rounds", "3"));
const detail = flag("--detail");
const ref = args[0] || null;

/** Mark the first animation frame with a level on the map, read off a small
    downscale of the canvas: the map's own background and nothing else is no
    level yet. */
function instrument() {
  window.__firstFrame = null;
  const sample = Object.assign(document.createElement("canvas"), { width: 48, height: 48 });
  const g = sample.getContext("2d", { willReadFrequently: true });
  const bg = [0x11, 0x17, 0x25];
  const look = () => {
    const cv = document.getElementById("cv");
    if (cv && cv.width) {
      g.clearRect(0, 0, 48, 48);
      g.drawImage(cv, 0, 0, 48, 48);
      const d = g.getImageData(0, 0, 48, 48).data;
      let other = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3] && bg.some((v, k) => Math.abs(d[i + k] - v) > 6)) other++;
      if (other > 20) {
        window.__firstFrame = performance.now();
        return;
      }
    }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

const TEXTURE = /(^|\/)tex\/[A-Z]+\.png$/;

/** One visit: the page's own timings, in ms from the navigation's start. */
async function visit(browser, base, view) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: rtt,
    downloadThroughput: (down * 1000) / 8,
    uploadThroughput: (down * 1000) / 8,
  });
  await page.addInitScript(instrument);
  await page.goto(`${base}/${view === "-" ? "" : view}`, { waitUntil: "commit" });
  await page
    .waitForFunction(
      (re) =>
        window.__firstFrame !== null &&
        performance.getEntriesByType("resource").some((e) => re.test(e.name) && e.responseEnd),
      new RegExp(TEXTURE.source),
      { timeout: 60000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const rs = performance.getEntriesByType("resource").map((e) => ({
      name: e.name.replace(/^https?:\/\/[^/]+\//, ""),
      start: e.startTime,
      end: e.responseEnd,
      bytes: e.encodedBodySize,
    }));
    return { html: nav.responseEnd, resources: rs, firstFrame: window.__firstFrame };
  });
  await context.close();
  const ended = (test) =>
    Math.max(0, ...out.resources.filter((r) => test(r.name)).map((r) => r.end));
  const atlas = out.resources.find((r) => TEXTURE.test(r.name));
  const by = atlas?.end ?? Infinity;
  return {
    html: out.html,
    modules: ended((n) => /^js\/.*\.js$/.test(n)),
    data: ended((n) => /\.json$/.test(n)),
    frame: out.firstFrame,
    asked: atlas?.start ?? null,
    textured: atlas?.end ?? null,
    bytes: out.resources.filter((r) => r.end <= by).reduce((n, r) => n + r.bytes, 0),
    resources: out.resources,
  };
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const ms = (v) => (v === null ? "   -" : String(Math.round(v)).padStart(6));
const COLUMNS = ["html", "modules", "data", "frame", "asked", "textured"];

async function measure(browser, base, label) {
  const rows = [];
  for (const view of views) {
    const runs = [];
    for (let i = 0; i < rounds; i++) runs.push(await visit(browser, base, view));
    const last = runs.at(-1);
    rows.push({
      view,
      ...Object.fromEntries(COLUMNS.map((c) => [c, median(runs.map((r) => r[c]))])),
      kb: Math.round(last.bytes / 1024),
      last,
    });
  }
  console.log(`\n${label}  (${down} kbit/s, ${rtt} ms round trip, median of ${rounds})`);
  console.log(`${"view".padEnd(28)}${COLUMNS.map((c) => c.padStart(9)).join("")}       KB`);
  for (const r of rows) {
    console.log(
      `${r.view.padEnd(28)}${COLUMNS.map((c) => "   " + ms(r[c])).join("")}   ${String(r.kb).padStart(6)}`,
    );
    if (detail)
      for (const e of [...r.last.resources].sort((a, b) => a.start - b.start))
        console.log(`    ${ms(e.start)} ${ms(e.end)} ${String(e.bytes).padStart(8)}  ${e.name}`);
  }
}

const browser = await chromium.launch();
const tmp = ref ? await mkdtemp(join(tmpdir(), "kula-boot-")) : null;
const sides = [[join(ROOT, "public"), "working tree"]];
if (ref) sides.push([checkout(ref, tmp), ref]);
const servers = [];
try {
  for (const [root, label] of sides) {
    const server = await serve(root, { gzip: true });
    servers.push(server);
    await measure(browser, `http://127.0.0.1:${server.address().port}`, label);
  }
} finally {
  for (const s of servers) s.close();
  await browser.close();
  if (tmp) await rm(tmp, { recursive: true, force: true });
}
