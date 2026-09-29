# 23. Objects that feel alive

## What and why

The boost button showed the way (2026-09-26): the game has rules for how things react to the ball, and the map can run them with the pointer, the selected block and the ball at its start standing in for the ball, so the map moves the way play does without inventing anything. Four more things in the game react or give off life that the map did not draw. Each is its own piece of work and can land alone; the order below is the one the user and the session that filed this agreed on, the nearest to done first.

The rule for all four is the boost button's: draw only what the game does, from the executable's own numbers, in the table `tools/kula_motion.py` ships, and let a stand-in for the ball trigger it only where the game's trigger is the ball. The press's machinery is the model for the first: `press` and `inReach` in [motion.js](../public/js/motion.js), `ballsFor` and `pressedAt` in [things.js](../public/js/things.js), which measures from the ball's middle, its radius off its face, to where the thing stands, the pointer and the selection standing on the face the thing is on. Each takes its frame from the level's clock (`clock` in [render.js](../public/js/render.js)), which stands at the level's first frame while the Motion switch is off, and the page draws again only while Motion is on, so the switch holds it still with everything else; where that first frame would hide what the thing is, the pose it holds instead is the user's to choose. Each is an effect rather than motion (the user, 2026-09-29): what lights, flickers, sparkles or reacts to the ball asks `effectsOn` in [state.js](../public/js/state.js) whether it runs and takes its frame from `effectFrame`, as the beams' flicker, the faces' painted cycles and the boost button's press do, while what moves stays on the Motion switch. The effects follow that switch until they are given one of their own, which no part here needs.

## Sketch

**1. Invisible blocks lit near the pointer.** Done (2026-09-29): the light is read in [motion.md](../docs/motion.md) under "The invisible block", shipped as kind 3's `light`, and drawn over the sunglasses look, or on the seven levels in place of it, by the stand-ins the boost button takes.

**2. Sparkles from devices that are on.** A teleporter or a switch that is on, and an exit that is open, gives off a sprite every 19 frames, counted in the last pad of its slot, with the sprite's handle kept in the kind word of the slot after (`0x8002d424`, in the draw rather than the walk). The images are in the .GGI's sprite section, which `tools/kula_ggi.py --textures` draws. Not yet read: which sprite it is, how it moves and how long it lives; the sprite system's own routine is where that is. A new reading, so it starts in the disc.

**3. The open exit, from its panel.** When the last key is taken the game gives the exit its green model (`f3` to 0) and its turn goes from −20 a frame to −45 (`0x80038a78`), and the hidden exit gets back the `f4` the loader took from it (`0x80035898`). The table already ships the open rate as `open` on types 7 and 26, unused, since the map shows every exit as the level loads it, shut. The panel already presses a switch; an exit's panel could open it the same way, the green model turning at the open rate, and with its sparkles once item 2's are drawn.

**4. A pickup's collect effect, maybe.** Taking a pickup starts an effect through `0x800118c4`, called from the ball's contact walk (`0x80038548` onward), and the effects run in `0x80011ac0`, a list of up to 16 entries of 2944 bytes each that draws from the game's dice while one runs. The map could play it once when a pickup is clicked and leave the pickup where it is. The least certain to be worth it, since the selection's outline already answers a click, and the effect is unread.

## Ruled out

Anything the game has no rule for. A crumbling block breaking as the pointer leaves it was the obvious one: the game never brings a crumbled block back, so the map would have to invent its return, and the level would no longer look the way it loads.
