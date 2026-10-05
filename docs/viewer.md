# The viewer

What the map under `public/` does for whoever is looking at it, control by control, and how it is built. The readings it draws are in [level-format.md](level-format.md), [tgi.md](tgi.md), [ggi.md](ggi.md) and [motion.md](motion.md), the start camera it can draw in [camera.md](camera.md), and the names it shows in [annotations.md](annotations.md).

## Turning, panning and zooming

**Drag to turn the level.** A lattice has no side that is the right one to look from, so dragging orbits the camera around it rather than sliding the view: left and right swing around, up and down raise and lower the eye between looking along the floor and looking straight down. `q` and `e` snap the swing to 45°. A level opens framed to fit the window and keeps fitting it as the window changes, until you turn, pan or zoom it or go to a find; `f`, or the button at the map's bottom right, frames it again, and the button is dim for as long as the level stays framed. Once a search has centred the view on a find, dragging turns about the find for as long as it stays selected; `Esc` clears it and the level is back under the hand, with nothing on screen moving until the next drag.

**Pan** with shift-drag, a right-drag, two fingers, or the arrow keys. If you would rather drag panned all the time, `p` switches a plain drag between panning and turning.

**Zoom** with the wheel, a pinch, or `+` / `-`, anchored wherever the pointer is.

## The slice, the textures and the lines

**Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back, and `h` leaves what the slice takes off on the map, faint.

`t` puts the game's own block textures on and off; with them off the lattice draws in a flat tint per world. `b` puts on the lines the map draws over the blocks, none of which the game draws: their edges, the broken outline of a block that is not solidly there, the route a moving platform runs, and a laser's beam while it is switched off. `g` lays a faint grid under the level's lowest layer.

## The panel

**Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields the record carries, each by its word in the slot and, where what it holds is known, by name. `Esc` clears. A switch's panel has a button that presses it, as the ball would: every laser, teleporter and switch of its colour turns on or off, and what travels finds the beams' cells open or shut, until you leave the level. A teleporter's panel names the one it sends the ball to, which the map draws an arrow to while it is selected, looping where one stands in front of the other, broken while it is switched off, and a click on the name goes there as a find does, so where three or more share a colour the names lead round their ring. A teleporter's facing is the way the ball faces as it comes out of it.

The panel folds to its title line with the chevron beside its cross, and stays folded from block to block until it is opened again.

## The legend

The sidebar's "On this level" lists what the level holds, by name and count: the objects first, then the blocks and the faces, which are the kinds of block the level uses and the things that are paint on a face rather than standing on it, fire, ice, acid and the clock among them. A row with a button hides and shows its kind on the map, and with it everything the kind shows, the light a device casts and the paint it puts on its face included; a kind of block's row only counts.

## The compass

The block at the map's bottom right is a compass, turned as the level is and shaded as the map shades a face, with the textures or without, so the brightest side on it is the brightest on the level. It names each face turned to you on the block, a side by the way it faces (`+x`, `-y`) and the top and the underside by name, and beyond the block, where each way points, every way it leaves unnamed, faint where the way points away from you: `-z` is up and `+z` down, since `z` counts downward. These are the words the panel and the search use, for the side a thing stands on (`on the +x side`) and the way it faces (`facing=-y`).

## The objects

`d` switches the objects between the game's own meshes and markers, a diamond with its type number off the face it stands on, and `o` hides them. The level's settings have no mesh, so among the meshes their marker shows only on the selected block. A thing on a face turned away from you is hidden by its own block wherever the block covers it, as in play, and `x` shows what the blocks cover faintly through them; what stands on the selected block always shows through. `l` labels each object by its name, and `n` adds the face it stands on.

## What moves

What moves in play moves here, as the game moves it: the platforms, the stars, the wheel and the wandering ball travel, what stands in place turns, bobs, tilts and breathes, the spikes, the vanishing blocks, the fire and the beams run their cycles, a teleporter or a switch that is on casts a light of its colour over the faces round it, on and off every third of a second, and a boost button sinks under the ball, the pointer and the selection, beside which an invisible block lights up as it does beside the ball, or on the few levels that show them from afar, fades away. `v` switches Motion off and holds the level still, every thing where and as the level starts it, except that the moving spikes stand up, a vanishing block shows as it does when it starts to go, there and seen through, and a beam and an invisible block shine at their brightest, the invisible block unlit. Switching it on again starts the level afresh. A system set to reduce motion opens the map with it off.

## The switches and Settings

A switch that does something only while another is on is greyed while that one is off, and keeps its tick for when it comes back: the models, seeing through the blocks and the labels need the objects on, the face in the labels needs the labels, and dimming what the slice hides needs the slice lowered. Its key, or a click or tap on it, then leaves it as it is and says for a moment at the foot of the map what it needs.

The gear at the top of the sidebar, or `s`, opens Settings, for the switches used less, their keys working from the map as the others do and in the panel itself. The Display's reset leaves them as they are. Among them, `c` draws where the game's camera stands as the level opens, behind the ball and above it, and the wedge it sees ([camera.md](camera.md)), and the compass at the map's bottom right can be put away. `m` shows and hides the sidebar itself.

## Search

**Search** with `/` for a level (`level 42`, `bonus`, `final 7`), a world (`inca`), a cell (`17,12,17`), an object by name or type (`key`, `type 34`), or a block by the name or number of its kind (`ice block`, `kind=2`), where `block` alone finds every block named for its kind and none of the plain ones. A search for objects or blocks lists every one the game places, this level's first, then the rest of its world's, then the other worlds'; Enter or a click goes to one and selects it, and the list stays for the next. The cross in the box clears it, as `Esc` does. A space means every term must match and a comma or `or` means any (`coin, key`), and a field is searched as `name=value` (`starts=off`, `facing=+x`, or `type 34 f10=2` for the raw fields the panel shows). The bar under the box narrows a search to the world or the level in hand, or, by level, lists the levels that hold the thing with the one holding most of it first.

## The level line and the order of the levels

The line at the top of the map names the level and counts what it holds, with the level's note under it where there is one. A click or a tap on the line folds the note away and back, a dot on the line saying there is one, and the map keeps it as it was left, from level to level and from one visit to the next.

`[` and `]` step to the previous and next level in the order the sidebar lists them, on from a world's last level to the next world's first and back, and stop at the first level of the first world and the last of the last.

## Permalinks

The URL is a permalink: `#INCA/11/45,35/0.90/17,17,17/0,0/33` is the level by its pack and its slot in it (LEVEL 42, the numbering the cheat in [level-format.md](level-format.md) takes), the yaw and pitch it is turned to, zoom, the cell it orbits around, the pan away from that cell, and the slice, and after those the selected block where there is one. While the level is framed to fit the window, the link says `fit` in place of the zoom, the cell and the pan (`#INCA/11/45,35/fit/33`), so it opens framed to whatever window it is opened in, as one that stops at the turn does; a link that names the zoom, the cell or the pan holds the view there, and one that names the zoom alone opens at that zoom centred on the blocks, as a fit is. Choosing a level or a find makes a history entry, so Back returns to where you were; turning, panning, zooming and slicing only bring the entry up to date. A segment never changes what it means, and what a link carries grows at its tail, which the reader takes by shape and passes over where it does not know it; a unit test holds one link to where it puts the lattice on the screen.

## How it is built

`public/` is the deploy artifact: dependency-free ES modules, no build step. `js/main.js` boots, `js/state.js` holds shared state and the camera, and modules talk through the `emit`/`on` pair in `js/dom.js` rather than importing each other both ways. `js/render.js` draws the frame: it puts the cells in the painter's order, keeps the pick canvas that turns a point on the screen into a cell, lays what shows through the blocks over the map, and draws again while anything moves. It draws the blocks through `js/blocks.js`, which lays each world's textures from `js/atlas.js` and the light a device casts on them from `js/lights.js`, what stands on them through `js/things.js`, a laser's beam through `js/beams.js`, and what is neither, from a platform's route and the ground grid to the scale bar and the lettering of a label, through `js/overlays.js`, which draws the arrow to where a teleporter leads with `js/arrow.js`, a link drawn as OddworldMap draws its links and knowing nothing of either map. Beside the frame, `js/compass.js` paints the compass on a canvas of its own: a block in the camera's own projection whose faces take the shades the level's faces do, so it turns exactly as the level does. Every frame drawn asks for it, and it paints again only when the turn, the world or the textures have changed.

The camera is a plain orbit: a yaw and a pitch give three unit vectors, and every point is projected orthographically onto two of them with the third as depth. Cubes are drawn back to front by that depth, which is exact for equal cubes on a lattice, and a face is drawn only when its outward normal turns toward the camera and no block the game hides that face behind stands against it. Lighting comes from a fixed direction in the world rather than from the screen, so a face keeps its brightness as the view turns and the solid goes on reading as solid.
