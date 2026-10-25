import { test, expect } from "@playwright/test";
import { frozen, laid, onward, roomed, trackErrors } from "./helpers.js";
import {
  line,
  opened,
  seconds,
  startPlay,
  station,
  status,
  stepTo,
  toggled,
} from "./playhelpers.js";
import { ENDED } from "../../public/js/play/phrases.js";

// SIMON 1: the start on the top row of a ring, facing along it
const SIMON_LEVEL = "/#COPYCAT/0/45,35/fit/33";

// the points are the layout's points, a pickup standing on the block the first move rolls onto
const ROUND_DONE =
  "^Well Done! The round is done\\. \\d+ points, \\d+ seconds left\\. Space or Enter starts the level again\\.$";

// the round lost by the second player's wrong move, which scores for the first
const ROUND_LOST =
  "^Wrong Move! The round is lost, a point to Player 1\\. \\d+ points, 99 seconds left\\. Space or Enter starts the level again\\.$";

/** The strip's figures for a room and its match, each its text or null while hidden. */
const roomFigures = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      ["playRound", "playMoves", "playTurn", "playMatch", "playTotal"].map((id) => {
        const el = document.getElementById(id);
        return [id, el.hidden ? null : el.textContent];
      }),
    ),
  );

/** Hold `key` on the frozen room until the ball moves, let it go and run the level on until the
    ball is still: whether the ball moved. */
const copied = (page, key) =>
  page.evaluate(async (key) => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { hz, play } = motionTable();
    const press = (type) =>
      document.body.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    const most = play.simon.idle[1] + play.simon.latch + 2;
    let moved = false;
    press("keydown");
    for (let f = 0; f < most && !moved; f++) {
      run();
      moved = P.station().moving;
    }
    press("keyup");
    for (let f = 0; f < 60 && P.station().moving; f++) run();
    return moved;
  }, key);

/** Run the frozen ending's view out, to the room's load that follows it: the round the strip then
    says, whether play is on, the status and the level named. */
const roundAgain = (page) =>
  page.evaluate(async () => {
    const at = (p) => import(new URL(`js/${p}`, location.href).href);
    const [{ draw }, { motionTable }, P] = await Promise.all(
      ["viewer/draw/render.js", "viewer/data.js", "play/play.js"].map(at),
    );
    const { turn, play, hz } = motionTable();
    const run = () => {
      window.__step(1000 / hz);
      draw();
    };
    const round = () => document.getElementById("playRound").textContent;
    const was = round();
    const length = Math.floor(turn / play.view.swing);
    for (let f = 0; f < length + 5 && round() === was; f++) run();
    return {
      round: round(),
      playing: P.playing(),
      status: document.getElementById("playStatus").textContent,
      level: document.querySelector("#chip b").textContent,
    };
  });

test("a Simon room takes the pad one move at a time: Up held rolls the ball one block on, a held Left turns it, and the round's two moves done end the room with the game's word", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: SIMON_LEVEL });
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  const before = await station(page);
  expect(before).toEqual({ block: [19, 10, 20], face: 0, heading: "+x", moving: false });
  await frozen(page);
  // past the opening and long at rest, so each key is read as the rooms read it
  await onward(page, 40);
  expect(await copied(page, "ArrowUp")).toBe(true);
  expect(await station(page)).toEqual({ ...before, block: [20, 10, 20] });
  // Left held turns the ball, which is the round's second move, and the verdict ends the room as
  // the ball comes to rest from the turn
  await page.evaluate(() =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })),
  );
  expect(await stepTo(page, ROUND_DONE, 120)).not.toBeNull();
  await page.evaluate(() =>
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft", bubbles: true })),
  );
  await expect(status(page)).toHaveText(new RegExp(ROUND_DONE));
  expect(errors).toEqual([]);
});

test("with Play on through the levels on a Simon room plays the game's match: the first player opens the first round, which done passes the turn to the second player for round 2 with four moves to make, and the second player's wrong move gives the first a point and loads the room again for its second match, which the second player opens", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page, { hash: SIMON_LEVEL });
  await toggled(page, "playOn", "off by default");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 1's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  await frozen(page);
  // past the opening and long at rest, so each key is read as the rooms read it
  await onward(page, 40);
  // the first round's two moves, a roll and a turn, which the first player stores
  expect(await copied(page, "ArrowUp")).toBe(true);
  expect(await copied(page, "ArrowLeft")).toBe(true);
  expect(await stepTo(page, ROUND_DONE, 120)).not.toBeNull();
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  // the ending's view runs out into the same room, started again for the second player
  expect(await roundAgain(page)).toEqual({
    round: "Round 2",
    playing: true,
    status: "",
    level: "SIMON 1",
  });
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 2",
    playMoves: "4 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 0 : 0",
    playTotal: null,
  });
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  await onward(page, 40);
  // the second player turns where the first rolled, a wrong move, which fails the round
  expect(await copied(page, "ArrowLeft")).toBe(true);
  expect(await stepTo(page, ROUND_LOST, 200)).not.toBeNull();
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 2",
    playMoves: "4 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 1 : 0",
    playTotal: null,
  });
  await expect(line(page)).toHaveText(ENDED);
  // Space loads the room again: the same room, its second match, which the second player opens
  await page.keyboard.press(" ");
  await expect(status(page)).toHaveText("");
  await expect(page.locator("#chip b")).toHaveText("SIMON 1");
  await expect(line(page)).toHaveText("Playing · on the top of 19,10,20, facing +x");
  expect(await roomFigures(page)).toEqual({
    playRound: "Round 1",
    playMoves: "2 moves",
    playTurn: "Player 2's turn",
    playMatch: "Match 1 : 0",
    playTotal: null,
  });
  await page.evaluate(() => window.__thaw());
  expect(errors).toEqual([]);
});

test("a level of your own marked a Simon room plays as the rooms do: the HUD counts the round and its moves and no blocks, the clock stands, and Up held rolls the ball one block on", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await opened(page);
  await page.locator("#draftNew").click();
  await expect(page.locator("#editBtn")).toHaveAttribute("aria-pressed", "true");
  // two blocks on from the start, which faces -y, so a move has somewhere to roll to
  await laid(page, [17, 16, 17], { kind: 0 });
  await laid(page, [17, 15, 17], { kind: 0 });
  await expect(page.locator("#chipLine")).toContainText("3 blocks");
  await expect(page.locator("#draftPlays")).toHaveText(
    "Plays as a bonus level since it has no key.",
  );
  await roomed(page, true);
  await expect(page.locator("#draftPlays")).toHaveText("Plays as a Simon room.");
  await startPlay(page);
  await expect(line(page)).toHaveText("Playing · on the top of 17,17,17, facing -y");
  await expect(page.locator("#playKeys")).toHaveText("Keys 0");
  await expect
    .poll(() => roomFigures(page))
    .toEqual({
      playRound: "Round 1",
      playMoves: "2 moves",
      playTurn: null,
      playMatch: null,
      playTotal: null,
    });
  const before = await station(page);
  expect(before).toEqual({ block: [17, 17, 17], face: 0, heading: "-y", moving: false });
  await frozen(page);
  expect(await seconds(page)).toBe(99);
  // past the opening and long at rest, with the clock standing through it all
  await onward(page, 40);
  expect(await seconds(page)).toBe(99);
  expect(await copied(page, "ArrowUp")).toBe(true);
  expect(await station(page)).toEqual({ ...before, block: [17, 16, 17] });
  expect(await seconds(page)).toBe(99);
  await page.evaluate(() => window.__thaw());
  expect(errors).toEqual([]);
});
