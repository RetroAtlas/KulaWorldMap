# 38. Playing a bundle through

## What and why

A bundle is a set of your levels in play order, saved as one file, which is what "Add to a bundle" says as it opens, and on the map that order is the order of the group's tiles, of the bundle card's rows and of the file's list, and has no part in play: the ball goes on from a way out only to a level of the disc, and a level of your own starts again after every ending, run or no run ([docs/viewer.md](../docs/viewer.md)).

Bundles landed as a file format with saving and opening, and a play-through, the way out of one level going on to the next in the bundle's order, was left for later.

This item holds what a play-through would need, each piece with where it stands in the code, so that the next reading starts where this one stopped.

## Sketch

**The strip and the words need nothing.** `verdict` in `public/js/play/strip.js` joins the ending's `how` to `thenOn` of `public/js/play/phrases.js`, which names whatever level object stands in `live.ended.next` by `levelTitle`, its `shown` or its `name`, and says the level starts again where it is null, and `STARTED` there says "On to" a level that changed; so a bundle's next level, a level object as the drafts list makes one, is offered and announced as a disc level is.

**The pick is the disc's arithmetic.** `ended` in `public/js/play/events.js` picks the next level as `pickedLevel(live, nextOf(run.game, run, count))`, and only where the run has a game.

- A draft outside the Simon rooms has no game: `gameFor` there and `gameOf` in `public/js/play/game.js` give the arcade's game only where `stationOf` gives a station, the level's theme among the worlds and its pack that world's `.PAK` or `FI.PAK`, so `/DRAFT/DRAFT.PAK` gives null, which `tests/unit/game.test.js` holds.
- A draft marked a Simon room gets the rooms' game whatever its pack, since `gameOf` asks `modeOf` first and `simonRoom` of `public/js/viewer/skins.js` reads the room from the level's flag and its having no key, which the editor's Plays as sets and the ball plays as a room.
- `nextOf` is the disc's slot arithmetic over that station and the table's words, with `count` from `levelsIn` of `public/js/viewer/data.js`, nothing for a pack off the disc, and for a Simon room the room its branch picks under the level's own pack, so a draft played as a room picks a slot under `/DRAFT/DRAFT.PAK` after a round.
- `pickedLevel` resolves either pick through `levelAt` there, which searches the release shown's levels alone and so finds nothing under the drafts' pack.
- So neither can name a bundle's level, and the next level has to be asked for beside them, where `ended` sets no next: the run has no game, `nextOf` gives nothing or its pick lies off the disc.
- `ended` sets no next under a death or the clock running out as under a way out for a level with no game, so a resolver asked wherever that resolution finds nothing would send a dead ball on to the bundle's next level, where the game starts the level again.
- The bundle is therefore asked at a way out alone, an ending whose code is above nothing as `ending.exit` is in `motion.play.ending` of `public/objects.json`, and any other ending leaves the level to start again as it does today.
- A draft marked a Simon room ends its rounds under the rooms' own codes, `ending.simon` for a failed round, which is the ending that sends the rooms on, so the code the resolver reads is also what decides whether such a level in a bundle goes on after a failed round as the rooms do, or at nothing.

**The go-on runs through the funnel.** `startOver` in `public/js/play/events.js` goes on through `goOn`, which finds `live.ended.next` by `pack` and `index` in `state.data.levels` and calls `selectLevel` of `public/js/viewer/chrome/navigate.js` with `live.changing` set, the flag under which the `level-changed` listener in `public/js/play/play.js` keeps play on instead of leaving and `advance` steps nothing.

- A bundle's level is not in `state.data.levels`, so its go-on is `showLevel`, the funnel's call for a level from elsewhere, under the same flag.
- `install` then emits `level-changed` for a slot other than the one shown, pushes a history entry and fits the view, as `selectLevel` does, and writes the level's `DRAFT/<id>` slot to the bar, which `levelFor` answers in the browser that holds the draft.

**Who answers is a seam of the viewer.** Play may import the viewer's layers, its own modules and the lattice, nothing of `format/` or `editor/`, and the editor nothing of play (`tests/unit/imports.test.js`), so the bundle's answer reaches play through neither's import.

- A viewer-layer registration is the shape the drafts already use: `provideLevels` in `public/js/viewer/chrome/navigate.js` takes sources that answer a link's slot with a level, the editor registering `levelFor` of `public/js/editor/draftlist.js` and the community module a source of its own in `public/js/community/link.js`.
- A registration beside it would take the level shown and give the level after it, a level object made by `toLevel` of `public/js/format/project.js` as the drafts list makes one, or null, asked source by source so that a catalogue bundle answers as the store's bundles do.
- A bus event is the other shape, though no event today carries an answer back to play, and every seam play has is a registration or an import of a viewer export.
- A seam added is listed under "How it is built" in [docs/viewer.md](../docs/viewer.md) in the commit that adds it, as [CLAUDE.md](../CLAUDE.md) asks.

**The tests to copy.** The browser test of a go-on is in `tests/browser/play-run.spec.js`, stepping the ending's swing in-page until the chip names the next level, and the unit test of the pick in `tests/unit/game.test.js` drives `nextOf` through a level built at a world's slot; a bundle's pick is held in a unit test of its own where it is arithmetic, the browser test asserting the wiring alone.

## Open

- A total across a bundle is a decision, not a hook: `startOver` recomputes the game on every go-on through `gameFor`, `restart` in `public/js/play/rules.js` carries it or starts it afresh where the total is below nothing, and a level with no station gets none, so a bundle's levels keep no total and the HUD shows none, as "a level of your own and the Simon rooms keep no total" says.
- A total would need a game for a level the game counts nowhere, with `conclude` banking its points and a death's cost taken, `perfectOf` already false where there is no station, and words for the game's end; the game has no run over levels of its own, so what a bundle's total would mean is to be decided before it is built.
- The death's cost needs a count of its own for such a level: `settle` takes it as `countOf` over `stationOf`, which gives no station for a draft to read a place and a slot from, so a death in the arcade form would throw there, spared today only by `conclude` returning before `settle` where the run has no game.
- `ended` drops the run's game where Play on through the levels is off, which is what keeps a disc level from going on, so whether a bundle goes on under that setting, always, or under a setting of its own is open, a bundle's order being its author's choice rather than the game's arithmetic.
- At the bundle's last level the answer is null and the verdict says the level starts again, as a level of your own does today; whether the last way out goes back to the first level instead is open.
- `stepLevel` in `public/js/viewer/chrome/navigate.js` returns early for a level from elsewhere and steps in the sidebar's order of the disc's levels, so `[` and `]` cannot step through a bundle's levels without a change there or a source of its own.

## Ruled out

- A bundle's own pack as a target on the disc, so that a bundle might play through on an emulator as one pack: the disc box places levels on the disc's slots alone, `keyShaped` in `public/js/editor/patchslots.js` taking a world's `.PAK`, its `FI.PAK` or the Simon rooms' pack with an index in range, and a level's `into` stays the slot of the disc it is meant for ([docs/editor.md](../docs/editor.md)); a bundle's levels go onto the disc as any draft does, each on a slot of its own.
- A station for a draft, so that `nextOf` would go on from it: a station is a place among the disc's worlds and a slot in a pack, and the count, the bonus and hidden slots and the next world read from it are the disc's tables, so the arithmetic would go on to a disc level and never to the bundle's next level.
