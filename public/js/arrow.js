// A curve is a cubic, eight numbers from its start to its end. It bows always
// to the same side of the way it goes, so a pair leading both ways draws apart.

// filled arrowhead at (tx, ty) pointing along (dx, dy), h long in draw units
export function arrowhead(ctx, tx, ty, dx, dy, h) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l,
    uy = dy / l;
  const bx = tx - h * ux,
    by = ty - h * uy;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx - 0.45 * h * uy, by + 0.45 * h * ux);
  ctx.lineTo(bx + 0.45 * h * uy, by - 0.45 * h * ux);
  ctx.closePath();
  ctx.fill();
}

/**
 * At a distance, the quadratic whose control point stands off the middle of
 * the way by `share` of its length, held between `min` and `max`. As the ends
 * close within twice `loop` of each other the bow swells, into a loop about
 * `loop` tall where they meet.
 */
export function bow(sx, sy, tx, ty, { share = 0.18, min = 24, max = 110, loop = 0 } = {}) {
  const dx = tx - sx,
    dy = ty - sy;
  const len = Math.hypot(dx, dy);
  const ux = len ? dx / len : 1,
    uy = len ? dy / len : 0;
  const k = Math.min(Math.max(share * len, min), max);
  const w = loop ? Math.max(0, 1 - len / (2 * loop)) ** 2 : 0;
  const along = len / 3 - (4 / 3) * loop * w;
  const across = (2 / 3) * k * (1 - w) + (4 / 3) * loop * w;
  return [
    sx,
    sy,
    sx + along * ux - across * uy,
    sy + along * uy + across * ux,
    tx - along * ux - across * uy,
    ty - along * uy + across * ux,
    tx,
    ty,
  ];
}

export function pointAt(c, t) {
  const s = 1 - t;
  const a = s * s * s,
    b = 3 * s * s * t,
    d = 3 * s * t * t,
    e = t * t * t;
  return [a * c[0] + b * c[2] + d * c[4] + e * c[6], a * c[1] + b * c[3] + d * c[5] + e * c[7]];
}

/** How far along curve `c` it last stands `d` from its end, or 0 where it never gets that far. */
export function fromEnd(c, d) {
  const away = (t) => {
    const [x, y] = pointAt(c, t);
    return Math.hypot(x - c[6], y - c[7]);
  };
  const STEPS = 64;
  let hi = 1;
  let lo = 1;
  while (lo > 0 && away(lo) < d) {
    hi = lo;
    lo = Math.max(0, lo - 1 / STEPS);
  }
  if (away(lo) < d) return 0;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (away(mid) < d) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Curve `c` from its start to `t` of the way along. */
export function cut(c, t) {
  const mix = (a, b) => a + (b - a) * t;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = c;
  const ax = mix(x0, x1),
    ay = mix(y0, y1);
  const bx = mix(x1, x2),
    by = mix(y1, y2);
  const cx = mix(x2, x3),
    cy = mix(y2, y3);
  const abx = mix(ax, bx),
    aby = mix(ay, by);
  const bcx = mix(bx, cx),
    bcy = mix(by, cy);
  return [x0, y0, ax, ay, abx, aby, mix(abx, bcx), mix(aby, bcy)];
}

/**
 * The line stops inside the head so that its end does not blunt the point.
 * The head is left as the path, and the dash cleared, so the caller can stroke
 * a rim round it.
 */
export function arrow(ctx, c, h) {
  const [bx, by] = pointAt(c, fromEnd(c, h));
  const line = cut(c, fromEnd(c, h / 2));
  ctx.beginPath();
  ctx.moveTo(line[0], line[1]);
  ctx.bezierCurveTo(line[2], line[3], line[4], line[5], line[6], line[7]);
  ctx.stroke();
  ctx.setLineDash([]);
  arrowhead(ctx, c[6], c[7], c[6] - bx, c[7] - by, h);
}
