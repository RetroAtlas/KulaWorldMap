# 19. The wandering ball's dice

## What and why

Everything the game leaves to chance the map draws from a hash of the thing's place, so a level looks the same on every visit: which of the world's four stones a face wears and how it is turned, the frame a fire or an invisible block starts on, the three angles a pickup spins from, where each line of a beam starts its flicker (`seed` in [skins.js](../public/js/skins.js), `phasesOf` in [motion.js](../public/js/motion.js)). The wandering ball, type 53, is the one thing left that is not: it draws its next way from `Math.random` ([travel.js](../public/js/travel.js), `dice` on the walker), so two viewers watching the same level see different walks, a reload changes one, and no test can pin the route. Its way really is drawn at load in play, so the map cannot show the walk the game will take; what it can do is take one of the walks the game could take and take the same one every time.

## Sketch

A small generator seeded from the ball's cell and face, in place of `Math.random`, of the shape `seed` already has; `walker` takes it, `decide` calls it. Then a test can assert a known route on a level with a wandering ball, which nothing does today, and the drift the user found on 2026-09-17 (the ball leaving the floor, the reset after a move) would have a regression test. Whether the generator belongs beside `seed` in skins.js or in a module of its own is for whoever does it; both files hash the same way, which [item 21](item-021-two-duplications.md) is about.

## Ruled out

Reading the game's own dice: `0x8003c730` draws from the console's random source at load, so the sequence is not in the data.
