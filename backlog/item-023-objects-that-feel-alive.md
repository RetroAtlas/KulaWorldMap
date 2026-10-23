# 23. Objects that feel alive

## What and why

The boost button showed the way (2026-09-26): the game has rules for how things react to the ball, and the map can run them with the pointer, the selected block and the ball at its start standing in for the ball, so the map moves the way play does without inventing anything.

Four more things in the game react or give off life that the map did not draw. Each is its own piece of work and can land alone; the order below is the nearest to done first.

The rule for all four is the boost button's: draw only what the game does, from the executable's own numbers, in the table `tools/kula_motion.py` ships, and let a stand-in for the ball trigger it only where the game's trigger is the ball. The press's machinery is the model for the first: `press` and `inReach` in [motion.js](../public/js/viewer/motion.js), `ballsFor` and `pressedAt` in [things.js](../public/js/viewer/draw/things.js), which measures from where the ball touches its face to where the thing stands, the pointer and the selection standing on the face the thing is on.

Each takes its frame from the level's clock (`clock` in [render.js](../public/js/viewer/draw/render.js)), which stands at the level's first frame while the Motion switch is off, and the page draws again only while Motion is on, so the switch holds it still with everything else; where that first frame would hide what the thing is, the pose it holds instead is that part's to choose.

Each is an effect rather than motion: what lights, flickers or reacts to the ball asks `effectsOn` in [state.js](../public/js/viewer/state.js) whether it runs and takes its frame from `effectFrame`, as the beams' flicker, the faces' painted cycles and the boost button's press do, while what moves stays on the Motion switch. The effects follow that switch until they are given one of their own, which no part here needs.

## Sketch

**1. Invisible blocks lit near the pointer.** Done (2026-09-29): the light is read in [motion.md](../docs/motion.md) under "The invisible block", shipped as kind 3's `light`, and drawn with the sunglasses look filling in what the light leaves dark, or on the seven levels in place of that look, by the stand-ins the boost button takes.

**2. Sparkles from devices that are on.** Done (2026-09-29), and not sparkles: what the draw turns over every 19 frames is a light, the thing's own face and the faces past its edges lit in its colour, read in [motion.md](../docs/motion.md) under "The devices' light", shipped as `glow` with each device's colours by its type, and cast by every teleporter and switch that is on. The hidden exit casts none.

**3. The open exit, from its panel.** Done (2026-10-14): one button, on the panel of either exit, opens the level's exits as taking the last key does, and shuts them again, read in [motion.md](../docs/motion.md): the exit's green model, turning at the open rate from the frame it opens, the green cross on its face, and the light an open exit casts, which flashes its model, and the hidden exit turning at the open rate. Like a switch's press, an opening lasts until the level is left, and a level with no key, which has no last key to take, has no button.

The hidden exit is drawn all along, turning at the slower rate until opened, though the game keeps it out of sight and still until the last key; and in a level with several exits the button opens them all, where the game opens the last exit and the last hidden exit it loads and marks the last exit face it builds, which can be another exit's. The reading also found that the loader gives every exit its red model, even on a level with no key, which the map draws.

**4. A pickup's collect effect, maybe.** Read (2026-10-20), and bigger than a sparkle: a pickup taken starts a burst of two sprites at its place, played a frame at a time off a table of its kind, over the scene, and the light the contact walk makes from its cell and face is the burst's, coloured each frame by the sprites' colours and let go as the effect ends; a teleport starts one on the HUD and flashes the screen white, the game at half pace through the flash. All of it is in [motion.md](../docs/motion.md) under "The effects" and shipped under `effects` in the motion table.

What is left is drawing it in play: a square a particle, turned by its angle and added to the map, and the light's colour onto the faces as the devices' light is.

The map could also play it once when a pickup is clicked and leave the pickup where it is, which is the least certain to be worth it, since the selection's outline already answers a click.

## Ruled out

Anything the game has no rule for. A crumbling block breaking as the pointer leaves it was the obvious one: the game never brings a crumbled block back, so the map would have to invent its return, and the level would no longer look the way it loads.
