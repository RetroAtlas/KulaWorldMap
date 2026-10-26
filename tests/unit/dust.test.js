import { test } from "node:test";
import assert from "node:assert/strict";
import { objects } from "./fixtures.js";
import { FACE_NORMAL, cellKey } from "../../public/js/format/lattice.js";
import { state } from "../../public/js/viewer/state.js";
import {
  CAP,
  LIFE,
  PER_BLOCK,
  ageDust,
  burstDust,
  drawDust,
  dustAlive,
  dustOver,
  resetDust,
  travelDust,
} from "../../public/js/play/dust.js";

state.show.dust = true;

const FRAME = 1 / objects.motion.hz;

// The row of blocks along y at x 17, z 17, the ball on their tops.
const TOP = FACE_NORMAL[0];
const block = (y) => [17, y, 17];
const over = (y) => dustOver(cellKey(...block(y)));

/** The ball's foot on the row's tops at `y`. */
const foot = (y) => [17.5, y, 17];

/** The block whose top the foot `p` lies on. */
const blockOf = (p) => p.map((v, i) => Math.floor(v - 0.5 * TOP[i]));

/** The foot's travel along the tops from `y0` to `y1`, born still where `still`. */
const strewn = (y0, y1, still = false) => travelDust(foot(y0), foot(y1), TOP, blockOf, still);

const BURST = 12;

/** Where each core over the row's block at `y` is drawn, as "x,y", the canvas stood in for. */
function drawn(y) {
  const at = [];
  const nothing = () => {};
  drawDust(
    {
      arc: (px, py) => at.push(`${px},${py}`),
      save: nothing,
      restore: nothing,
      beginPath: nothing,
      fill: nothing,
      stroke: nothing,
      moveTo: nothing,
      lineTo: nothing,
    },
    cellKey(...block(y)),
  );
  return at;
}

test("a burst makes its motes over the block it is given and no other, and the dust is alive", () => {
  resetDust(null);
  assert.ok(!dustAlive());
  // where a gone block stood, over the nearest block still drawn
  burstDust([17.5, 12.5, 17.5], TOP, block(14), BURST, false);
  assert.ok(dustAlive());
  assert.equal(over(14), BURST);
  for (const y of [11, 12, 13, 15]) assert.equal(over(y), 0, `${y}`);
});

test("a travel strews so many motes a block over the blocks its path crosses, and over no other", () => {
  resetDust(null);
  strewn(10, 14);
  for (const y of [10, 11, 12, 13]) assert.equal(over(y), PER_BLOCK, `${y}`);
  for (const y of [9, 14]) assert.equal(over(y), 0, `${y}`);
});

test("ageing by less than the shortest life keeps every mote, and on past the longest kills them all", () => {
  resetDust(null);
  burstDust(foot(10.5), TOP, block(10), BURST, false);
  ageDust(LIFE[0] - FRAME);
  assert.equal(over(10), BURST);
  assert.ok(dustAlive());
  ageDust(LIFE[1]);
  assert.equal(over(10), 0);
  assert.ok(!dustAlive());
});

test("the cap holds whatever is strewn, the oldest motes going first", () => {
  resetDust(null);
  // a travel long enough to strew past the cap
  const blocks = Math.ceil(CAP / PER_BLOCK) + 1;
  strewn(0, blocks);
  let all = 0;
  for (let y = 0; y < blocks; y++) all += over(y);
  assert.equal(all, CAP);
  assert.equal(over(0), 0);
  assert.equal(over(blocks - 1), PER_BLOCK);
});

test("a reset empties everything", () => {
  resetDust(null);
  strewn(10, 12);
  burstDust(foot(14.5), TOP, block(14), BURST, false);
  assert.ok(dustAlive());
  resetDust(null);
  assert.ok(!dustAlive());
  for (const y of [10, 11, 14]) assert.equal(over(y), 0, `${y}`);
});

test("a still level's motes stand where they were born over a step, where a moving level's motes lift off", () => {
  // the places a block's motes are drawn at before and after a step, as one set: motes that stand
  // are drawn at no more places than there are motes, whichever motes the twinkle hides in each pass
  const places = (still) => {
    resetDust(null);
    strewn(10, 11, still);
    assert.equal(over(10), PER_BLOCK);
    const seen = new Set(drawn(10));
    ageDust(FRAME);
    for (const p of drawn(10)) seen.add(p);
    return seen.size;
  };
  assert.ok(places(true) <= PER_BLOCK);
  assert.ok(places(false) > PER_BLOCK);
});
