import { test, expect } from "@playwright/test";
import { faced, frozen, laid, settle, still, textured, trackErrors } from "./helpers.js";
import {
  LEVEL,
  betweenFrames,
  frameAt,
  line,
  listening,
  probe,
  said,
  startPlay,
  station,
  stepped,
} from "./playhelpers.js";

// LEVEL 86: the start on a ring of blocks, a bouncy pill two blocks on across a gap and blocks two
// apart beyond it
const PILL_LEVEL = "/#FIELD/10/45,35/fit/33";

// LEVEL 43: the start at one end of a row of three blocks, a lethargy pill on the block at the
// other end, to the ball's left as the level opens
const LETHARGY_LEVEL = "/#INCA/12/45,35/fit/33";

const WEARING_OFF = "The sunglasses are wearing off: the invisible blocks are about to hide again.";

test("the sunglasses show every invisible block as the game does, the ball's light off them while they last, then blink them as they wear off, the strip saying so, and the ball's light alone shows them again", async ({
  page,
}) => {
  test.slow();
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; the sunglasses on the block ahead, an
  // invisible block within the ball's light once it stands there and another well out of it,
  // whose shimmer runs in the same phase, since the game spreads it by the cell's position
  const near = [18, 15, 17];
  const far = [20, 13, 17];
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await faced(page, [17, 16, 17], 0, { type: 38 });
  await laid(page, near, { kind: 3 });
  await laid(page, far, { kind: 3 });
  await expect(page.locator("#chipLine")).toContainText("4 blocks");
  await textured(page);
  const table = await page.evaluate(async () => {
    const { motionTable, skinsTable } = await import(
      new URL("js/viewer/data.js", location.href).href
    );
    const { frames, level } = skinsTable().cycles.invisible;
    return {
      hz: motionTable().hz,
      lasts: motionTable().types["38"].lasts,
      cycle: [frames.length, level.length],
    };
  });
  const { word, step, blink } = table.lasts;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // the shimmer and the pulse come round together once in this many frames
  const period = (table.cycle[0] * table.cycle[1]) / gcd(...table.cycle);
  const standing = Math.floor(word / step) + 1;
  const lengths = [blink.first, ...Array(blink.times - 1).fill(blink.frames)];
  const blinking = lengths.reduce((a, b) => a + b, 0);
  // the frames the view takes to settle behind the ball once it has stopped
  const settled = 2 * table.hz;
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect.poll(() => frameAt(page)).toBeGreaterThan(settled);
  await frozen(page);
  await page.keyboard.press("ArrowUp");
  const run = await stepped(page, settled + standing + blinking + period, near, far);
  await page.evaluate(() => window.__thaw());
  await expect(page.locator("#playPoints")).toHaveText("500 points");
  expect((await probe(page)).station).toEqual({
    block: [17, 16, 17],
    face: 0,
    heading: "-y",
    moving: false,
  });
  const taken = run.findIndex((r) => r.seeing);
  expect(taken).toBeGreaterThan(0);
  expect(taken).toBeLessThan(settled);
  const after = run.slice(taken);
  expect(after.slice(0, standing).every((r) => r.seeing)).toBe(true);
  const spells = lengths.flatMap((n, s) => Array(n).fill(s % 2 === 1));
  expect(after.slice(standing, standing + blinking).map((r) => r.seeing)).toEqual(spells);
  expect(after.slice(standing + blinking).every((r) => !r.seeing)).toBe(true);
  expect(after.slice(0, standing).every((r) => r.status === "")).toBe(true);
  expect(after.slice(standing, standing + blinking).every((r) => r.status === WEARING_OFF)).toBe(
    true,
  );
  expect(after.slice(standing + blinking).every((r) => r.status === "")).toBe(true);
  // once the view has settled, a top's pixels at a phase of the shimmer are the same on every
  // frame of the same state: the look every face takes while the blocks are seen, read off the
  // word's frames, and the light's look, read off the frames after the blink
  const phase = (r) => r.frame % period;
  const look = new Map();
  const unlit = new Map();
  for (const r of after.slice(settled, standing)) {
    look.set(phase(r), r.near);
    unlit.set(phase(r), r.far);
  }
  const lit = new Map();
  for (const r of after.slice(standing + blinking)) lit.set(phase(r), r.near);
  expect(look.size).toBe(period);
  expect(lit.size).toBe(period);
  const odd = after
    .slice(settled)
    .filter(
      (r) => r.far !== unlit.get(phase(r)) || r.near !== (r.seeing ? look : lit).get(phase(r)),
    )
    .map((r) => r.frame);
  expect(odd).toEqual([]);
  // and the two states look different, the ball's light reaching the near block's corner
  expect([...look.keys()].filter((p) => look.get(p) !== lit.get(p)).length).toBeGreaterThan(
    period / 2,
  );
  expect(errors).toEqual([]);
});

test("the bouncy pill bounds the ball as the game does: taken with the keys released it hops where it came down, up pressed at the landing, leaves the ground two blocks on from the hop's end, bound after bound, and with up released it hops where it is", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(PILL_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,23,17, facing -y");
  await listening(page);
  await frozen(page);
  // a gap ahead with blocks beside refuses the roll, so up held and Space jump the ball onto the
  // pill's block, up released as the jump starts, so the pill is taken with the latch clear, and
  // pressed again on the frame the ball comes down; then released on the frame it comes down two
  // bounds on
  const { bounds, hops } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const run = () => {
      window.__step(1000 / motionTable().hz);
      draw();
    };
    const seen = () => {
      const s = P.station();
      const g = P.handed();
      return { block: s.block, moving: s.moving, height: g.height, offset: g.offset };
    };
    key("keydown", "ArrowUp");
    key("keydown", " ");
    key("keyup", " ");
    const bounds = [];
    let released = false;
    let pressed = false;
    for (let f = 0; f < 400; f++) {
      run();
      const s = seen();
      bounds.push(s);
      if (!released && s.moving) {
        key("keyup", "ArrowUp");
        released = true;
      } else if (released && !pressed && !s.moving && s.block.join() === "19,21,17") {
        key("keydown", "ArrowUp");
        pressed = true;
      }
      if (s.block.join() === "19,17,17") break;
    }
    key("keyup", "ArrowUp");
    const hops = [];
    for (let f = 0; f < 120; f++) {
      run();
      hops.push(seen());
    }
    return { bounds, hops };
  });
  expect(await said(page)).toContain("Bouncy pill taken.");
  const rest = bounds[0].height;
  const blocks = bounds.map((s) => s.block.join());
  expect(blocks.filter((b, i) => i === 0 || b !== blocks[i - 1])).toEqual([
    "19,23,17",
    "19,21,17",
    "19,19,17",
    "19,17,17",
  ]);
  const over = (block) => bounds.filter((s) => s.block.join() === block);
  const stops = (on) => on.map((s, i) => (s.moving ? -1 : i)).filter((i) => i >= 0);
  const flat = (s) => s.offset.slice(0, 2).map((v) => Math.round(v * 1000) / 1000 + 0);
  const aloft = (frames) => frames.filter((s) => s.height > rest).length > frames.length / 2;
  // down on the pill's block's middle at rest, and the first leave from it a hop, in the air
  // over the middle until it comes down there again, at rest for the one frame of its end, and
  // off two blocks on only from the frame after that, the jump's first row along the ground
  const pill = over("19,21,17");
  const stopped = stops(pill);
  expect(stopped.length).toBe(2);
  expect(stopped[0]).toBe(0);
  const ended = stopped[1];
  expect(pill[0].height).toBe(rest);
  expect(flat(pill[0])).toEqual([0, 0]);
  const hop = pill.slice(1, ended);
  expect(hop.length).toBeGreaterThan(1);
  expect(hop.every((s) => flat(s).every((v) => v === 0))).toBe(true);
  expect(aloft(hop)).toBe(true);
  expect(flat(pill[ended])).toEqual([0, 0]);
  const bound = pill.slice(ended + 1);
  expect(bound.length).toBeGreaterThan(1);
  expect(aloft(bound)).toBe(true);
  // down on the next block's middle at rest, up held past the latch's count by then, and off it
  // from the frame after with no hop first
  const next = over("19,19,17");
  expect(stops(next)).toEqual([0]);
  expect(next[0].height).toBe(rest);
  expect(flat(next[0])).toEqual([0, 0]);
  expect(aloft(next.slice(1))).toBe(true);
  expect(bounds.at(-1).moving).toBe(false);
  // hop after hop, each at rest for the one frame of its end, on the block the ball came down on
  expect(hops.every((s) => s.block.join() === "19,17,17")).toBe(true);
  expect(hops.filter((s) => !s.moving).length).toBeGreaterThanOrEqual(3);
  expect(aloft(hops)).toBe(true);
  expect(errors).toEqual([]);
});

test("the lethargy pill halves the pace as the game does: from the frame after its take two steps of a sixtieth run one game frame, through the passes the table gives, and one step runs one again from the frame it predicts", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LETHARGY_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,19,17, facing -y");
  await listening(page);
  // a quarter turn toward the pill, past the level's opening, which holds the pad dead
  await betweenFrames(page, () => page.keyboard.press("ArrowLeft"));
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  // Up held until the ball reaches the pill's block, where it stops; the frame drawn is read after
  // every step of a sixtieth
  const { seen, table } = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { state }, { cellKey }, P] = await Promise.all(
      [
        "viewer/draw/render.js",
        "viewer/data.js",
        "viewer/state.js",
        "format/lattice.js",
        "play/play.js",
      ].map(at),
    );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const { types, hz } = motionTable();
    const pill = state.idx.markers.get(cellKey(17, 19, 17)).find((m) => m.face === 0);
    const { word, step, blanks, screen } = types[String(pill.type)].lasts;
    const seen = [];
    let held = true;
    key("keydown", "ArrowUp");
    for (let f = 0; f < 600; f++) {
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,19,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      seen.push({ frame: clock(), block: s.block.join(), moving: s.moving });
    }
    return { seen, table: { word, step, blanks, fade: screen.fade } };
  });
  await page.evaluate(() => window.__thaw());
  const { word, step, blanks, fade } = table;
  const standing = word / step + 1 + fade.from / fade.by + 1;
  const frames = seen.map((s) => s.frame);
  // every step to the take's ran a frame, so the first that ran none follows the take's frame
  const slowed = frames.findIndex((f, i) => i > 0 && f === frames[i - 1]);
  expect(slowed).toBeGreaterThan(0);
  const took = slowed - 1;
  expect(frames.length).toBeGreaterThan(took + standing * blanks + 30);
  // from the take's frame on, a frame every `blanks` steps for `standing` frames, then one a step
  const predicted = (i) => {
    const d = i - took;
    return d <= standing * blanks
      ? frames[took] + Math.floor(d / blanks)
      : frames[took] + standing + d - standing * blanks;
  };
  const odd = frames
    .map((f, i) => (f === (i < took ? frames[0] + i : predicted(i)) ? -1 : i))
    .filter((i) => i >= 0);
  expect(odd).toEqual([]);
  expect(seen.at(-1)).toEqual({ frame: frames.at(-1), block: "17,19,17", moving: false });
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});

test("the lethargy pill rolls the view and ghosts the screen as the game does: the pill's frame flashes white and rolls the view by the first angle, the roll follows the word frame by frame about the line of sight with the picture trailing greenish behind it, and once the word has run out the view is the ball's frame again and a white glow fades", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LETHARGY_LEVEL);
  await settle(page);
  await still(page);
  await page.keyboard.press("t");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,19,17, facing -y");
  await listening(page);
  await betweenFrames(page, () => page.keyboard.press("ArrowLeft"));
  await expect.poll(async () => (await station(page)).heading).toBe("-x");
  await expect.poll(async () => (await station(page)).moving).toBe(false);
  await frozen(page);
  const seen = await page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw, clock }, { motionTable }, { state, camera, basisAt }, { cellKey }, P] =
      await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
    const key = (type, k) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    const { types, hz, turn } = motionTable();
    const pill = state.idx.markers.get(cellKey(17, 19, 17)).find((m) => m.face === 0);
    const { word, step, blanks, rock, screen } = types[String(pill.type)].lasts;
    const g = document.getElementById("cv").getContext("2d");
    // the mean red, green and blue over a grid of points of the canvas
    const sampled = () => {
      const { w, h, dpr } = state.view;
      const sum = [0, 0, 0];
      let n = 0;
      for (let j = 1; j <= 6; j++)
        for (let i = 1; i <= 8; i++) {
          const x = Math.round((w * i * dpr) / 9);
          const y = Math.round((h * j * dpr) / 7);
          const d = g.getImageData(x, y, 1, 1).data;
          for (let ch = 0; ch < 3; ch++) sum[ch] += d[ch];
          n++;
        }
      return sum.map((v) => Math.round(v / n));
    };
    // the view's right, up and toward in the world for the frame `f` at the orbit's yaw and pitch
    const viewOf = (f) => {
      const b = basisAt(state.cam.yaw, state.cam.pitch);
      const inWorld = (v) => [0, 1, 2].map((i) => v[0] * f[i] + v[1] * f[3 + i] + v[2] * f[6 + i]);
      return { right: inWorld(b.right), up: inWorld(b.up), toward: inWorld(b.toward) };
    };
    // the angle the table predicts for the pill's word
    const angleOf = (w) => {
      if (w <= 0) return 0;
      const sine = Math.round(turn * Math.sin((((w * rock.scale) % turn) / turn) * 2 * Math.PI));
      return Math.trunc(sine / 2 ** rock.shift);
    };
    // the view rolled about its toward by `angle`, its up tipping left for a positive one
    const rolledView = ({ right, up, toward }, angle) => {
      const c = Math.cos((angle / turn) * 2 * Math.PI);
      const s = Math.sin((angle / turn) * 2 * Math.PI);
      return {
        right: right.map((v, i) => c * v + s * up[i]),
        up: up.map((v, i) => c * v - s * right[i]),
        toward,
      };
    };
    const off = (a, b) =>
      Math.max(
        ...["right", "up", "toward"].flatMap((k) => a[k].map((v, i) => Math.abs(v - b[k][i]))),
      );
    // the view settles on the ball after the turn
    for (let f = 0; f < 30; f++) {
      window.__step(1000 / hz);
      draw();
    }
    const ballFrame = [...state.frame];
    const rest = viewOf(ballFrame);
    const differs = () => state.frame.some((v, i) => Math.abs(v - ballFrame[i]) > 1e-9);
    const before = sampled();
    // the pass the end is asked on, which draws the ghost once more, and the fade's passes after
    const end = word / step + 1;
    const fades = screen.fade.from / screen.fade.by;
    const wanted = [0, 1, end + 1, end + Math.ceil(fades / 2), end + fades, end + fades + 1];
    const samples = {};
    const odd = [];
    const angles = [];
    let took = -1;
    let clockTook = 0;
    let held = true;
    key("keydown", "ArrowUp");
    for (let f = 0; f < 700; f++) {
      window.__step(1000 / hz);
      draw();
      const s = P.station();
      if (held && s.block.join() === "17,19,17") {
        key("keyup", "ArrowUp");
        held = false;
      }
      if (took < 0) {
        if (!differs()) continue;
        took = f;
        clockTook = clock();
      }
      const pass = clock() - clockTook;
      const angle = angleOf(word - step * pass);
      const err = off(camera(), rolledView(rest, angle));
      if (err > 1e-6) odd.push({ f, pass, angle, err });
      if (pass < 3 && !angles.includes(angle)) angles.push(angle);
      if (wanted.includes(pass) && !(pass in samples)) samples[pass] = sampled();
      if (pass > end + fades + 1) break;
    }
    return {
      took,
      odd,
      angles,
      samples,
      before,
      end,
      fades,
      blanks,
      back: took >= 0 && !differs(),
      block: P.station().block.join(),
    };
  });
  await page.evaluate(() => window.__thaw());
  const { took, odd, angles, samples, before, end, fades, back } = seen;
  expect(took).toBeGreaterThan(0);
  expect(odd).toEqual([]);
  // three frames apart in the cycle roll three ways, the first to the right
  expect(angles).toHaveLength(3);
  expect(angles[0]).toBeLessThan(0);
  expect(back).toBe(true);
  expect(seen.block).toBe("17,19,17");
  const bright = (c) => (c[0] + c[1] + c[2]) / 3;
  const base = samples[end + fades + 1];
  // the flash: white everywhere on the pill's frame, over a scene far darker before and after
  expect(bright(before)).toBeLessThan(160);
  expect(bright(base)).toBeLessThan(160);
  expect(samples[0].every((v) => v >= 250)).toBe(true);
  // the ghost of the flash on the pass after: half the scene and half a greenish white
  const ghost = samples[1];
  expect(bright(ghost)).toBeGreaterThan(bright(base) / 2 + 60);
  expect(bright(ghost)).toBeLessThan(250);
  expect(ghost[1] - ghost[0] - (base[1] - base[0]) / 2).toBeGreaterThan(8);
  // the glow fades from the end: brighter first, dimmer midway, the scene's own brightness at its
  // last pass
  expect(bright(samples[end + 1])).toBeGreaterThan(bright(samples[end + Math.ceil(fades / 2)]));
  expect(bright(samples[end + Math.ceil(fades / 2)])).toBeGreaterThan(bright(samples[end + fades]));
  expect(Math.abs(bright(samples[end + fades]) - bright(base))).toBeLessThanOrEqual(10);
  await expect.poll(() => said(page)).toContain("Lethargy pill taken.");
  expect(errors).toEqual([]);
});

test("the invincibility pill colours the ball's light as the game does: from the pill's frame each channel is raised by the table's gain times the sine of a counter stepping by its step round its round, red first, through every frame the word stands and no further, and a later pill carries the counter on from where the pill before left it", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto(LEVEL);
  await settle(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // a key out of reach keeps the level an arcade one; the pill on the block ahead of the start
  await faced(page, [17, 17, 17], 1, { type: 31 });
  await laid(page, [17, 16, 17], { kind: 0 });
  await faced(page, [17, 16, 17], 0, { type: 34 });
  await expect(page.locator("#chipLine")).toContainText("2 blocks");
  await listening(page);
  /** The ball rolled onto the pill's block on the held clock, and on each game frame from the
      pill's, through the word's frames and three after, the light the frame is handed with the
      raise the table predicts for the counter stepped on from `counter`, null where no light is
      handed, with the counter as left, the frame the pill was taken on and the ball's block. */
  const glowing = (counter) =>
    page.evaluate(async (counter) => {
      const at = (p) => import(new URL(`js/${p}`, location.href).href);
      const [{ draw }, { motionTable }, { state }, { cellKey }, P] = await Promise.all(
        [
          "viewer/draw/render.js",
          "viewer/data.js",
          "viewer/state.js",
          "format/lattice.js",
          "play/play.js",
        ].map(at),
      );
      const key = (type, k) =>
        document.body.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
      const { types, hz, turn } = motionTable();
      const pill = state.idx.markers.get(cellKey(17, 16, 17)).find((m) => m.face === 0);
      const { word, step, glow } = types[String(pill.type)].lasts;
      const frames = word / step + 1;
      const raised = (c) =>
        glow.from.map((start) => {
          const angle = c - start;
          if (angle < 0 || angle >= turn) return 0;
          return glow.gain * Math.round(turn * Math.sin((angle / turn) * 2 * Math.PI));
        });
      const seen = [];
      let took = -1;
      let held = true;
      key("keydown", "ArrowUp");
      for (let f = 0; f < 1200 && seen.length < frames + 3; f++) {
        window.__step(1000 / hz);
        draw();
        if (held && P.station().block.join() === "17,16,17") {
          key("keyup", "ArrowUp");
          held = false;
        }
        const tint = P.handed()?.tint ?? null;
        if (took < 0) {
          if (!tint) continue;
          took = f;
        }
        if (!tint) {
          seen.push(null);
          continue;
        }
        counter = (counter + glow.step) % glow.round;
        seen.push({ tint, lift: raised(counter) });
      }
      return { took, seen, counter, frames, block: P.station().block.join() };
    }, counter);
  /** Whether every frame's light is the untinted light `base` raised by the predicted lift, a
      channel below nothing held at nothing. */
  const predicted = (seen, base) =>
    seen.every(({ tint, lift }) => tint.every((v, ch) => v === Math.max(0, base + lift[ch])));
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const first = await glowing(0);
  await page.evaluate(() => window.__thaw());
  expect(first.took).toBeGreaterThan(0);
  expect(first.block).toBe("17,16,17");
  expect(first.seen).toHaveLength(first.frames + 3);
  const lit = first.seen.slice(0, first.frames);
  expect(lit.every((s) => s !== null)).toBe(true);
  // the pill's own frame raises the red alone, from which the untinted light is read
  expect(lit[0].lift[0]).toBeGreaterThan(0);
  expect(lit[0].lift.slice(1)).toEqual([0, 0]);
  const base = lit[0].tint[0] - lit[0].lift[0];
  expect(base).toBeGreaterThan(0);
  expect(predicted(lit, base)).toBe(true);
  // the three channels each have their turn, and the light is the plain ball's light once the word is out
  for (const ch of [0, 1, 2]) expect(lit.some((s) => s.lift[ch] > base)).toBe(true);
  expect(first.seen.slice(first.frames)).toEqual([null, null, null]);
  await expect.poll(() => said(page)).toContain("Invincibility pill taken.");
  // out of play and in again on the same page: the pill is back on its face, the counter is not
  await page.keyboard.press("Escape");
  await expect(page.locator("#play")).toBeHidden();
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await frozen(page);
  const again = await glowing(first.counter);
  await page.evaluate(() => window.__thaw());
  expect(again.took).toBeGreaterThan(0);
  const relit = again.seen.slice(0, again.frames);
  expect(relit.every((s) => s !== null)).toBe(true);
  expect(relit[0].lift).not.toEqual(lit[0].lift);
  expect(predicted(relit, base)).toBe(true);
  expect(again.seen.slice(again.frames)).toEqual([null, null, null]);
  expect(errors).toEqual([]);
});
