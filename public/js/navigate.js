import { $, emit } from "./dom.js";
import { state, SIDE, plane } from "./state.js";
import { index, worldName } from "./data.js";
import { draw, invalidatePick } from "./render.js";

export function selectLevel(i, { keepView = false } = {}) {
  const l = state.data.levels[i];
  if (!l) return;
  state.li = i;
  state.lvl = l;
  state.idx = index(l);
  state.selected = null;
  state.hover = null;
  if (!keepView) {
    state.slice = SIDE - 1;
    fit();
  }
  invalidatePick();
  emit("level-changed", i);
  chip();
  draw();
  writeHash();
}

export function fit() {
  const l = state.lvl;
  if (!l) return;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < l.cells.length; i += 4) {
    const [x, y, z] = l.cells.slice(i, i + 3);
    for (const [cx, cy, cz] of [
      [x, y, z],
      [x, y, z + 1],
    ]) {
      const [px, py] = plane(cx, cy, cz);
      x0 = Math.min(x0, px - 30);
      x1 = Math.max(x1, px + 30);
      y0 = Math.min(y0, py - 30);
      y1 = Math.max(y1, py + 30);
    }
  }
  if (!Number.isFinite(x0)) return;
  state.cam.x = (x0 + x1) / 2;
  state.cam.y = (y0 + y1) / 2;
  const { w, h } = state.view;
  state.cam.z = Math.max(0.12, Math.min(2.4, Math.min(w / (x1 - x0), h / (y1 - y0)) * 0.88));
}

export function centreOn(x, y, z) {
  const [px, py] = plane(x, y, z);
  state.cam.x = px;
  state.cam.y = py;
}

export function chip() {
  const l = state.lvl;
  if (!l) return;
  const t = l.start?.time;
  const parts = [
    `<b>${l.name}</b>`,
    `<span class="sep">·</span>${worldName(l.theme)}`,
    `<span class="sep">·</span>${l.blocks} blocks`,
  ];
  if (l.objects.length) parts.push(`<span class="sep">·</span>${l.objects.length} objects`);
  if (t !== undefined) parts.push(`<span class="sep">·</span><span class="t">time ${t}</span>`);
  if (state.slice < l.max[2]) parts.push(`<span class="sep">·</span>sliced at z=${state.slice}`);
  $("chip").innerHTML = parts.join("");
}

let writing = false;

export function writeHash() {
  const l = state.lvl;
  if (!l) return;
  const c = state.cam;
  const h = `#L${state.li}/${Math.round(c.x)},${Math.round(c.y)}/${c.z.toFixed(2)}/${state.rot}/${state.slice}`;
  if (location.hash === h) return;
  writing = true;
  history.replaceState(null, "", h);
  writing = false;
}

export function applyHash() {
  const m = /^#L(\d+)(?:\/(-?\d+),(-?\d+))?(?:\/([\d.]+))?(?:\/(\d))?(?:\/(\d+))?/.exec(
    location.hash,
  );
  if (!m) return false;
  const i = Number(m[1]);
  if (!state.data.levels[i]) return false;
  state.rot = m[5] ? Number(m[5]) & 3 : 0;
  selectLevel(i, { keepView: true });
  state.slice = m[6] !== undefined ? Math.min(SIDE - 1, Number(m[6])) : SIDE - 1;
  if (m[2] !== undefined) {
    state.cam.x = Number(m[2]);
    state.cam.y = Number(m[3]);
    state.cam.z = m[4] ? Number(m[4]) : 1;
  } else {
    fit();
  }
  invalidatePick();
  emit("slice-changed");
  chip();
  draw();
  return true;
}

addEventListener("hashchange", () => {
  if (!writing) applyHash();
});

export function stepLevel(delta, crossWorld) {
  const data = state.data;
  const l = state.lvl;
  const world = data.themes.find((t) => t.id === l.theme);
  const at = world.levels.indexOf(state.li);
  let next = at + delta;
  if (next >= 0 && next < world.levels.length) return selectLevel(world.levels[next]);
  if (!crossWorld) return;
  const wi = data.themes.indexOf(world) + Math.sign(delta);
  const w2 = data.themes[wi];
  if (!w2) return;
  selectLevel(delta > 0 ? w2.levels[0] : w2.levels[w2.levels.length - 1]);
}
