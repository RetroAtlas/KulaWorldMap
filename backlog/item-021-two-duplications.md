# 21. Two duplications in the viewer

## What and why

Small, and both in code that two sessions wrote a day apart from the same reading, so they are worth a note rather than a hunt.

`seed` in [skins.js](../public/js/skins.js) and the opening of `phasesOf` in [motion.js](../public/js/motion.js) are the same hash of a cell and a face, written twice; they are meant to agree, since both stand for the dice the game throws per face, and nothing says so.

[skins.js](../public/js/skins.js) tests kinds as bare numbers, `kind === 2`, `kind === 3`, `kind === 6`, `kind === 7`, where every other module names them (`VANISHING`, `PLATFORM_KIND`, `BEAM_KIND`). The names are the reader's only clue that the branch is about ice, the invisible block, a crumbling block and a vanishing one.

By [the folder's own rule](README.md) neither earns a file on its own, since each is an hour's work; they are here so that whoever is next in those files does them rather than adding a third copy, and [item 19](item-019-the-wandering-balls-dice.md) and [item 20](item-020-split-the-renderer.md) both pass through them.

## Sketch

One hash, exported once, taken by both; the kinds named where they are used.

## Ruled out

Nothing yet.
