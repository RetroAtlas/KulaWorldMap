# 24. Frames over picture, by the visitor's choice

## What and why

The map draws a frame on every tick of the display while Motion is on, and on a fast Android phone a busy view drops frames (the user, 2026-09-29, on BONUS 29 turned so that every object is in view). The commits from "Draw a model's polygons without building them afresh every frame" to "Draw what a drag or a key moves with the frame already coming" made the drawing faster without changing a pixel: the median frame's script fell by 37-48% on every view `npm run frame` names, at its defaults (2026-09-29). What is left is mostly the canvas's own work: 2,000-2,500 polygon fills a frame for the models, each with its colour set, a clip and a `drawImage` for every textured face, and the flush of all of it to the GPU; and the GPU's work, which the harness cannot see on a phone.

Going further changes the picture, however slightly, so each step below is the visitor's to take: a setting in the Settings panel, off by default, so the map looks as it does unless the visitor asks for frames over picture (the user, 2026-09-29). Whether the map should ever say that a setting would help, when it sees frames dropped, is open. The order is the one the user and the session that filed this agreed on, the one that saves most and shows least first; the fourth saves least for what it changes.

## Sketch

The figures are `npm run frame` at its defaults (the CPU throttled 4x, 412x915 at a device pixel ratio of 3, an M4 Max's GPU), taken 2026-09-29.

**1. Frames at the game's rate.** Most fast Android phones run the display at 90 or 120 Hz, and the loop draws on every tick, while the game's own clock steps 60 times a second. Drawing at most once a game frame halves the work on a 120 Hz screen, the main thread's and the GPU's, and changes nothing on a 60 Hz one. The cost is that a turning coin shows 60 poses a second rather than twice as many. `animate` in [render.js](../public/js/render.js) is where: a tick that comes less than a game frame after the last draw asks for the next. Whether a drag keeps every tick is part of the question.

**2. A lower pixel ratio.** `resize` in [render.js](../public/js/render.js) caps the canvas at a device pixel ratio of 2. A cap of 1.5 draws 44% fewer pixels and 1 draws 75% fewer. The saving is all the GPU's: on the machine the harness runs on, the main thread's time does not move with the ratio (1 and 3 within 0.3 ms of each other). The cost is softer edges, lines and lettering on a sharp screen; the 64x64 textures change little. A slider over the steps, rather than a switch.

**3. Faces without their clip.** Each textured face is clipped to its outline before its texture is laid on it (`cube` in [blocks.js](../public/js/blocks.js)). Laying the texture alone saves a save, a clip and a restore a face, about 0.3 ms a frame on LEVEL 45, and the GPU's clipping. The cost is a face's edge anti-aliased by its texture rather than its outline, which may leave hairline seams between faces.

**4. A model's polygons of one colour in one fill.** The shading is baked into each polygon's colour and few share one, so this cuts the fills and the colour sets by only about 40% (1,832 polygons to 1,147 fills on BONUS 29), about 0.6-0.8 ms a frame on LEVEL 45. The cost is a model's polygons no longer strictly back to front where two of a colour lie apart in depth, and translucent ones no longer doubled where they overlap.

**5. Simpler models when they are small.** Leave out the polygons smaller than a pixel, or draw a model far off from a sprite of it. The models are about half of what is left of a frame's script. The cost is detail on small things, and with sprites a turn in steps.

**6. A coarser pick.** The pick canvas at a pixel ratio of 1 rasterises a quarter of the pixels whenever a hover or a click repaints it, which on a phone, where nothing hovers, is seldom. The cost is a hit test that settles a block's edge to a whole pixel.

The Settings panel holds switches only so far: `mark` in [settings.js](../public/js/settings.js) notes a switch standing away from its default, and `restore` in [sidebar.js](../public/js/sidebar.js) keeps a saved value only of its default's type, so a slider needs a number for its default and a note of its own. A setting's words are for a visitor, and say what it trades rather than how.

## Ruled out

Without changing the picture, measured with `npm run frame` on 2026-09-29: painting the pick only when a hit test reads it, since the canvas rasterises a pick painted with the draw at the end of that frame and one painted just before the read inside the read, at about three times the cost, so the pick waits for its hit test only while the pointer is pressed; and caching each block's face corners and the neighbours its faces hide behind, which saved about 0.1 ms a frame. The colour set before each model polygon is the costliest line left, about 1 ms a frame on LEVEL 45, and no spelling of the colour parses faster.
