// Play's chrome: the strip and the HUD that stand beside the map while the ball is on it, the pad
// and the keys that roll it, and the live region's queue of what play says.
import { $, dialogOpen, typing } from "../viewer/ui/dom.js";
import { current, measureStrip } from "../viewer/chrome/course.js";
import { state } from "../viewer/state.js";
import { BASE, current as disc, releaseOf } from "../viewer/release.js";
import { ballFor, levelTitle, markerModel, motionTable, worldName } from "../viewer/data.js";
import { iconFor } from "../viewer/draw/icons.js";
import { sidebarOverlays } from "../viewer/chrome/sidebar.js";
import { say as announce } from "../viewer/chrome/a11y.js";
import { PAD } from "./ball.js";
import { MODE } from "./game.js";
import { ENDED, FOLLOWING, FOLLOWING_PAD, LINE, hudOf, isFollowing, thenOn } from "./phrases.js";
import { shown } from "./traveller.js";
import { TYPE } from "../format/lattice.js";

const KEY_MARKER = { type: TYPE.KEY, face: 0, variant: null, f: [] };
const BITS = {
  ArrowUp: PAD.up,
  ArrowLeft: PAD.left,
  ArrowRight: PAD.right,
  ArrowDown: PAD.down,
  " ": PAD.cross,
};
const PAD_BITS = { up: PAD.up, left: PAD.left, right: PAD.right, jump: PAD.cross };

let framing = false;
let saying = null;
const unsaid = [];
let telling = false;
export let measure = () => {};
export let padShown = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
export let forgiving = false;
let keyed = false;

// --- the live region ----------------------------------------------------------------------

// a sentence waits for an animation frame of its own, as the live region keeps only its last
function told(text) {
  if (telling) {
    unsaid.push(text);
    return;
  }
  announce(text);
  telling = true;
  requestAnimationFrame(() => {
    telling = false;
    if (unsaid.length) told(unsaid.shift());
  });
}

export const say = (text) => {
  if (framing) saying = text;
  else told(text);
};

/** Hold what a game frame says until the frame is done, so that only its last sentence is said. */
export function holdSaying() {
  framing = true;
  saying = null;
}

export function releaseSaying() {
  framing = false;
  if (saying !== null) told(saying);
}

export const clearSaying = () => {
  unsaid.length = 0;
};

// --- the strip and the HUD ----------------------------------------------------------------

export function status(live, text, dying = false) {
  if (!live) return;
  live.status = text;
  live.dire = dying;
  const el = $("playStatus");
  if (el.textContent !== (text ?? "")) el.textContent = text ?? "";
  el.classList.toggle("dying", dying);
}

function figure(id, text, title = null) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
  if (title !== null && el.title !== title) el.title = title;
}

/** Fill a figure of the HUD's row from its phrase: the number in its bold, what stands before
    the number in the span a reader alone gets and the word after it in its small, each with its
    own space, so the figure reads as the phrase, written only where it changed. */
function reading(id, phrase, title = null) {
  const el = $(id);
  const [, before, n, after] = /^(.*?)\s*(\d+)\s*(.*)$/.exec(phrase);
  const parts = [
    [".sr", before && `${before} `],
    ["b", n],
    ["small", after && ` ${after}`],
  ];
  for (const [part, text] of parts) {
    const node = el.querySelector(part);
    if (node && node.textContent !== text) node.textContent = text;
  }
  if (title !== null && el.title !== title) el.title = title;
}

/** Keep the keys figure's mark to the level: the legend's key where keys are counted and
    nothing where blocks are, drawn again when `fresh`. */
function marked(bonus, fresh = false) {
  const mark = $("playKeys").querySelector(".mark");
  if (!fresh && mark.hasChildNodes() === !bonus) return;
  const model = bonus ? null : markerModel(KEY_MARKER, state.lvl);
  if (model) mark.replaceChildren(iconFor(model, 18));
  else mark.replaceChildren();
}

export function line(live) {
  if (!live) return;
  const s = shown(live);
  const text = live.ended ? ENDED : LINE(s.face, s.block, s.h);
  const el = $("playLine");
  if (el.textContent !== text) el.textContent = text;
  const w = live.run.words;
  const game = live.run.game;
  const hud = hudOf(w, game, live.run.match, motionTable().play);
  reading("playClock", hud.clock);
  reading("playKeys", hud.keys, hud.keysTitle);
  marked(w.bonus);
  reading("playPoints", hud.points);
  const room = w.mode === MODE.simon;
  for (const id of ["playRound", "playMoves"]) $(id).hidden = !room;
  for (const id of ["playTurn", "playMatch"]) $(id).hidden = !(room && game);
  if (room) {
    figure("playRound", hud.round);
    figure("playMoves", hud.moves);
    if (game) {
      figure("playTurn", hud.turn);
      figure("playMatch", hud.match);
    }
  }
  $("playTotal").hidden = !game || room;
  if (game && !room) figure("playTotal", hud.total);
}

export function sync(live) {
  $("play").hidden = !live;
  $("hud").hidden = !live;
  document.body.classList.toggle("playing", live !== null);
  const padUp = live !== null && padShown;
  $("pad").hidden = !padUp;
  $("jump").hidden = !padUp;
  document.body.classList.toggle("padded", padUp);
  $("padBtn").setAttribute("aria-pressed", String(padShown));
  $("forgiveBtn").setAttribute("aria-pressed", String(forgiving));
  if (live) {
    line(live);
    $("playStatus").textContent = live.status ?? "";
    $("playStatus").classList.toggle("dying", live.dire);
  }
}

/** Draw the pad's ball for the level shown and, while the ball is on it, the HUD's key and the
    level's name. */
export function icon(live) {
  const l = state.lvl;
  const model = l && ballFor(l);
  $("padBall").replaceChildren(model ? iconFor(model, 40) : "");
  if (!live) return;
  marked(live.run.words.bonus, true);
  caption();
}

/** Name the level in the HUD as the level line names it. */
export function caption() {
  const l = state.lvl;
  const parts = [levelTitle(l), worldName(l.theme)];
  if (disc() !== BASE) parts.push(releaseOf(disc()).label);
  $("hudTitle").textContent = parts.join(" · ");
}

/** The strip's route buttons: Keep while no route stands or the route is the way the ball has
    come, pressed while that way goes on being handed over, Follow while a route stands, pressed
    while the ball follows it and dim once the level has ended. */
export function routing(live) {
  const route = current();
  const keep = $("keepBtn");
  keep.disabled = !live || (route !== null && route !== live.kept);
  keep.setAttribute("aria-pressed", String(!!live?.keeping));
  const follow = $("followBtn");
  follow.hidden = !live || route === null;
  follow.disabled = !live || live.ended !== null;
  follow.setAttribute("aria-pressed", String(live?.driver != null));
}

/** How much of the map's height the strip takes, as it stands, from its foot; the pad lies over
    the view and takes none. */
export function chrome() {
  const strip = $("play");
  if (strip.hidden) return 0;
  return $("cv").getBoundingClientRect().bottom - strip.getBoundingClientRect().top;
}

/** The strip's verdict: how the level ended and what the key goes on to, the level the game loads
    next or this one again, the pad named while it shows. */
export const verdict = (live) => `${live.ended.how} ${thenOn(live.ended.next, padShown)}`;

/** The strip's word while the ball follows the route, the pad named while it shows. */
export const following = () => (padShown ? FOLLOWING_PAD : FOLLOWING);

// --- the pad and the keys -----------------------------------------------------------------

function wirePad(hub) {
  const bitOf = (e) => PAD_BITS[e.target.closest("[data-pad]")?.dataset.pad] ?? 0;
  const release = (e) => {
    const bit = bitOf(e);
    if (bit) hub.keys.up(bit);
  };
  const press = (e) => {
    const bit = bitOf(e);
    const live = hub.live();
    if (!bit || !live) return;
    e.preventDefault();
    if (live.ended) {
      hub.startOver();
      hub.wake();
      return;
    }
    hub.retire();
    e.target.setPointerCapture(e.pointerId);
    hub.keys.down(bit);
    hub.wake();
  };
  for (const group of [$("pad"), $("jump")]) {
    group.addEventListener("pointerdown", press);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      group.addEventListener(type, release);
  }
  $("padBtn").onclick = () => {
    const live = hub.live();
    padShown = !padShown;
    if (live?.ended) status(live, verdict(live));
    else if (isFollowing(live?.status)) status(live, following());
    sync(live);
  };
  $("forgiveBtn").onclick = () => {
    forgiving = !forgiving;
    sync(hub.live());
  };
  $("followBtn").onclick = hub.followRoute;
  $("keepBtn").onclick = hub.keep;
  $("leaveBtn").onclick = () => hub.leave();
}

const modified = (e) => e.metaKey || e.ctrlKey || e.altKey;

function keydown(e, hub) {
  if (!state.lvl || typing(e) || dialogOpen()) return;
  if (e.key === "p" && !modified(e) && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) hub.togglePlay();
    return;
  }
  const live = hub.live();
  if (!live) return;
  if (e.key === "Escape") {
    if (e.defaultPrevented || state.selected) return;
    if (sidebarOverlays() && document.body.classList.contains("sidebar-open")) return;
    e.preventDefault();
    e.stopPropagation();
    hub.leave();
    return;
  }
  if (live.ended) {
    const starts =
      e.key === " " || (e.key === "Enter" && !(keyed && e.target.tagName === "BUTTON"));
    if (!(starts || BITS[e.key]) || e.shiftKey || modified(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (starts && !e.repeat) {
      hub.startOver();
      hub.wake();
    }
    return;
  }
  const bit = BITS[e.key];
  if (!bit || e.shiftKey || modified(e)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  hub.retire();
  hub.keys.down(bit);
  hub.wake();
}

function keyup(e, hub) {
  const bit = BITS[e.key];
  if (bit) hub.keys.up(bit);
}

/** Wire the keys, the focus, the pad and the strip's buttons to the hub's handlers, `hub` holding
    them with its keys and a reader of the live level, and measure the strip's height into the
    map's style. */
export function wireStrip(hub) {
  document.addEventListener("keydown", (e) => keydown(e, hub), { capture: true });
  document.addEventListener("keyup", (e) => keyup(e, hub), { capture: true });
  // read as the focus lands, since by the keydown a clicked button's focus is visible too
  document.addEventListener("focusin", (e) => {
    keyed = e.target.matches(":focus-visible");
  });
  addEventListener("blur", () => hub.keys.up());
  wirePad(hub);
  measure = measureStrip($("play"), "--play-h");
}
