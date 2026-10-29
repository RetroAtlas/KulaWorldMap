export const SIDE = 34;
export const cellKey = (x, y, z) => (x * SIDE + y) * SIDE + z;

// The six faces of a block, in the order the game numbers them.
export const FACE_NORMAL = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [-1, 0, 0],
  [0, 0, 1],
];
export const FACE_NAME = ["top", "+x side", "+y side", "-y side", "-x side", "underside"];
export const DIRECTION_NAME = ["-z", "+x", "+y", "-y", "-x", "+z"];

// The game's numbers for the kinds of block and for the types of what stands on a face; the fruit
// is several types under one name.
export const KIND = {
  PLAIN: 0,
  FIRE: 1,
  ICE: 2,
  INVISIBLE: 3,
  ACID: 4,
  PLATFORM: 5,
  CRUMBLING: 6,
  VANISHING: 7,
  LASER: 8,
  SETTINGS: 9,
  TRAILER: 666,
};
export const TYPE = {
  FIRE: 1,
  ICE: 2,
  TELEPORTER: 5,
  EXIT: 7,
  CLOCK: 8,
  SWITCH: 9,
  BOOST_BUTTON: 10,
  MOVING_SPIKES: 11,
  SPIKES: 12,
  HIDDEN_EXIT: 26,
  ARROW: 28,
  START_ON_CLOCK: 29,
  START: 30,
  KEY: 31,
  LETHARGY_PILL: 32,
  BOUNCY_PILL: 33,
  INVINCIBILITY_PILL: 34,
  HOURGLASS: 35,
  GEM: 36,
  COIN: 37,
  SUNGLASSES: 38,
  STAR: 42,
  FRUIT: [43, 44, 45, 46, 47],
  CAPTIVATOR_SLOW: 50,
  ROLLING_STONE: 51,
  CAPTIVATOR_QUICK: 52,
  CAPTIVATOR_WANDERING: 53,
  CAPTIVATOR_BOUNCING: 56,
};
// The kinds of block a level with no key counts, as the game builds them.
export const COUNTED_KINDS = new Set([
  KIND.PLAIN,
  KIND.FIRE,
  KIND.ICE,
  KIND.ACID,
  KIND.CRUMBLING,
  KIND.VANISHING,
]);
// The ball starts on a plain face or on a clock.
export const STARTS = new Set([TYPE.START, TYPE.START_ON_CLOCK]);
