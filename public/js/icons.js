// A model drawn small, once, in the same three-quarter view for every one, so
// a legend or a heading can show the thing rather than a dot beside a number.
// The view is fixed rather than the map's, since an icon is for telling a key
// from a coin, not for saying which way either faces.
const DEG = Math.PI / 180;
const YAW = 35 * DEG;
const PITCH = 28 * DEG;
const RIGHT = [Math.cos(YAW), 0, -Math.sin(YAW)];
const UP = [-Math.sin(PITCH) * Math.sin(YAW), Math.cos(PITCH), -Math.sin(PITCH) * Math.cos(YAW)];
const TOWARD = [Math.cos(PITCH) * Math.sin(YAW), Math.sin(PITCH), Math.cos(PITCH) * Math.cos(YAW)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const GLASS = 0.55;

const drawn = new WeakMap();

/** A fresh canvas of the model, `size` CSS pixels square. */
export function iconFor(model, size = 22) {
  let sizes = drawn.get(model);
  if (!sizes) drawn.set(model, (sizes = new Map()));
  let master = sizes.get(size);
  if (!master) sizes.set(size, (master = render(model, size)));
  const cv = document.createElement("canvas");
  cv.width = master.width;
  cv.height = master.height;
  cv.style.width = cv.style.height = `${size}px`;
  cv.className = "icon";
  cv.getContext("2d").drawImage(master, 0, 0);
  return cv;
}

function render(model, size) {
  const cv = document.createElement("canvas");
  const dpr = Math.min(devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(size * dpr);
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const [lo, hi] = model.box;
  const centre = lo.map((v, i) => (v + hi[i]) / 2);
  const frame = model.frames[0];
  let reach = 1;
  for (let i = 0; i < frame.length; i += 3) {
    reach = Math.max(reach, Math.hypot(...[0, 1, 2].map((k) => frame[i + k] - centre[k])));
  }
  const scale = (size / 2 - 1) / reach;
  const pts = [];
  for (let i = 0; i < frame.length; i += 3) {
    const p = [0, 1, 2].map((k) => frame[i + k] - centre[k]);
    pts.push([size / 2 + dot(p, RIGHT) * scale, size / 2 - dot(p, UP) * scale, dot(p, TOWARD)]);
  }
  const polys = model.polys.map((poly, k) => {
    const p = poly.map((i) => pts[i]);
    const rgb = model.rgb[k];
    const n = poly.length;
    const mean = [0, 1, 2].map((ch) => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += rgb[i * 3 + ch];
      return Math.round(sum / n);
    });
    return { p, z: p.reduce((s, q) => s + q[2], 0) / n, mean, blend: model.flags[k] & 2 };
  });
  polys.sort((a, b) => a.z - b.z);
  for (const { p, mean, blend } of polys) {
    g.fillStyle = `rgba(${mean[0]} ${mean[1]} ${mean[2]} / ${blend ? GLASS : 1})`;
    g.beginPath();
    const ring = p.length === 4 ? [p[0], p[1], p[3], p[2]] : p;
    ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
  return cv;
}
