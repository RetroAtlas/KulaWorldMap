# The viewer

What the map under `public/` does for whoever is looking at it, control by control, and how it is built.

The readings it draws are in [level-format.md](level-format.md), [tgi.md](tgi.md), [ggi.md](ggi.md) and [motion.md](motion.md), the game's camera, at a level's start, in play and at an ending, in [camera.md](camera.md), and the names it shows in [annotations.md](annotations.md).

What Your levels and the editor keep, read and write is specified in [editor.md](editor.md), and what the disc holds for a level written back onto it is set out in [disc.md](disc.md).

Each control is given briefly, with the choices behind it; what a control says, greys or waits for, and the steps a mechanic of play runs through, are held by the browser and unit tests, whose titles say them ([testing.md](testing.md)).

## Turning, panning and zooming

**Drag to turn the level.** A lattice has no side that is the right one to look from, so dragging orbits the camera around it rather than sliding the view, the eye anywhere from along the floor to straight down; `q` and `e` snap the swing to 45°.

A level opens framed to fit the window and stays fitted as the window changes, until you turn, pan or zoom it or go to a find; `f`, or the button at the map's bottom right, frames it again.

Once a search has centred the view on a find, dragging turns about the find for as long as it stays selected.

**Pan** with Shift-drag, a right-drag, two fingers or the arrow keys, and `d` makes a plain drag pan rather than turn.

**Zoom** with the wheel, a pinch, or `+` / `-`, anchored wherever the pointer is.

## The slice, the textures and the lines

**Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back, and `h` leaves what the slice takes off on the map, faint.

`t` puts the game's own block textures on and off; with them off, and until a world's textures arrive, the lattice draws in the world's own colour, the mean of the textures its plain blocks wear, which the swatch beside the world in the sidebar shows too.

`b` puts on the lines the map draws over the blocks, none of which the game draws: their edges, the broken outline of a block that is not solidly there, the route a moving platform runs, and a laser's beam while it is switched off.

`g` lays a faint grid under the level's lowest layer.

## The panel

**Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields its record carries, each by its word in the slot and, where what it holds is known, by name. Where a click has another meaning, a right click or a long press selects all the same, and `Esc` clears.

A switch's panel has a button that presses it as the ball would, turning every laser, teleporter and switch of its colour over, what travels finding the beams' cells open or shut, until you leave the level.

The panel of an exit, or of a hidden exit, has one that opens every exit of the level as taking its last key would, and shuts them again, until you leave the level; a level with no key has no last key to take, and no button.

Where a level has more than one exit, or more than one hidden exit, the button opens them all, as the last key does in play, where the game opens only the last exit and the last hidden exit it loads ([motion.md](motion.md)).

A teleporter's panel names the teleporter it sends the ball to, which the map draws an arrow to while it is selected, and a click on the name goes there as a find does; a teleporter's facing is the way the ball faces as it comes out of it.

The panel folds to its title line, and stays folded from block to block until it is opened again.

## The legend

The sidebar's "On this level" lists what the level holds, by name and count: the objects first, then the kinds of block the level uses and the things that are paint on a face rather than standing on it, fire, ice and the clock among them.

A row of objects hides and shows its kind on the map, the light a device casts and the paint it puts on its face with it, and Shift-click shows that kind alone; a row of blocks only counts, and the heading's reset puts every kind back.

## The compass

The block at the map's bottom right is a compass, turned as the level is and shaded as the map shades a face, so the brightest side on it is the brightest on the level.

It names each face turned to you, a side by the way it faces (`+x`, `-y`) and the top and the underside by name, and beyond the block the ways it leaves unnamed, `-z` up and `+z` down since `z` counts downward: the words the panel and the search use for the side a thing stands on (`on the +x side`) and the way it faces (`facing=-y`).

## The objects

`m` switches the objects between the game's own meshes and markers, a diamond with its type number, and `o` hides them with the shadow the game paints into the face under a pickup, leaving what a device, an exit or the clock paints on its face. The level's settings have no mesh, so among the meshes their marker shows only on the selected block.

A thing on a face turned away from you is hidden by its own block wherever the block covers it, as in play, and `x` shows what the blocks cover faintly through them; what stands on the selected block always shows through.

`l` labels each object by its name, and `n` adds the face it stands on.

## What moves

What moves in play moves here, as the game moves it:

- The platforms, the stars, the wheel and the wandering ball travel.
- What stands in place turns, bobs, tilts and breathes.
- The spikes, the vanishing blocks, the fire and the beams run their cycles.
- A gem's facets glint white, the same facets on every gem of its colour.
- A teleporter or a switch that is on, or an exit opened from the panel, casts a light of its colour over the faces round it.
- A boost button sinks under the ball, the pointer and the selection, beside which an invisible block lights up as it does beside the ball, or on the few levels that show them from afar, fades away.

`v` switches Motion off and holds the level still, every thing where and as the level starts it, except that the moving spikes stand up, a vanishing block shows as it does when it starts to go, there and seen through, and a beam and an invisible block shine at their brightest, the invisible block unlit. Switching it on again starts the level afresh, and a system set to reduce motion opens the map with it off.

## The switches and Settings

The gear at the top of the sidebar, or `Shift-s`, opens Settings, for the switches used less, whose keys work from the map as the others do.

Among them, `c` draws where the game's camera comes to rest at the level's start, behind the ball and above it, and the wedge it sees ([camera.md](camera.md)), and the compass at the map's bottom right can be put away.

Invisible blocks, on by default so that the map shows the whole level, draws every invisible block in the look it has beside the ball; off, one is drawn only where the game would show it, beside the ball or beside the selected block or the pointer, which stand in for the ball on the map, while the sunglasses in play still show them all.

Under Play, the golden dust the ball leaves, which comes from the map and not from the game, can be put away.

Play from a block's panel, off by default so that the map opens as a map, gives the panel a Play from here button, which stands the ball on the face you clicked.

Play on through the levels gives the ball the game's own run, off by default so that a level plays on its own ("A run through the levels" below).

`s` shows and hides the sidebar itself.

`?` opens the list of the keys and gestures.

The list and the buttons' tooltips name Ctrl and Alt as the keyboard in front of you does, Cmd and Option on an Apple one, and the map takes Ctrl and Cmd alike in the chords it lists.

## Search

**Search** with `/` for a level (`level 42`, `bonus`, `final 7`), a world (`inca`), a cell (`17,12,17`), an object by name or type (`key`, `type 34`), or a block by the name or number of its kind (`ice block`, `kind=2`), where `block` alone finds every block named for its kind and none of the plain ones.

A space means every term must match and a comma or `or` means any (`coin, key`), and a field is searched as `name=value` (`starts=off`, `facing=+x`, or `type 34 f10=2` for the raw fields the panel shows).

A search for objects or blocks lists every one the game places, those on this level first, then the rest of those in its world, then those in the other worlds; Enter or a click goes to one and selects it, and the list stays for the next.

The bar under the box narrows a search to the world or the level in hand, or, by level, lists the levels that hold the thing with the one holding most of it first.

A search is of the disc shown, and a list on screen is built anew when the disc changes, so it never names a cell the disc shown lacks.

## The level line and the order of the levels

The line at the top of the map names the level and counts what it holds, with the level's note under it where there is one.

Its time is the figure the disc shown's HUD counts as the level starts, once its clock has ticked, one more than the whole seconds the clock holds in the ticks that HUD counts a second, so a level whose file gives 99 reads 83 under the US disc, whose clock runs 82.5 seconds, 99 under the PAL disc and 119 under the Japanese, as The three discs below says of play's clock.

The game's HUD draws its digits only once the clock is down to 50 ([motion.md](motion.md)), and the map shows the figure from the start, on the line and in play's HUD.

While the ball is on the level a HUD stands in the line's place, naming the level and showing the clock, the points and the keys, as Rolling the ball below says, and the line is back when play is left.

Where the disc shown is not the US one, the line and the HUD's title carry its tag, EU or JP, after the title, and the level as it is spoken puts the game's name first, while under the US disc none of them names it.

A click or a tap on the line folds the note away and back, and the map keeps the fold as it was left, from level to level and from one visit to the next.

On a level of your own the note is the level's overview, editing or not, brought up to date at every change: how it plays, its counts against the room the game has, amber past any level on the disc and red past the room, and everything the checks find, each at a cell a click on it selects, so the panel is right there.

The overview widens the line as far as the map allows, to the map's width on a phone, so that it takes fewer rows.

The sidebar lists a world's levels in the order of its pack, then its two finals, then the Simon room the game's Simon mode plays in it on its first round, and `[` and `]` step through them in that order, on from one world into the next.

The sidebar heads each world with its id on the disc, the directory its pack lies in, except ATLANT, which it heads ATLANTIS, the name `public/annotations.json` gives the one directory the disc cuts short ([annotations.md](annotations.md)); the map names a world the same way wherever it names one, and the search answers to the id too.

The Japanese disc's Simon rooms, the US rooms byte for byte, are listed under the worlds the US release plays them in on its first round, since that disc's game fixes no world for a room.

## The three discs

Beside the Worlds heading stand three buttons, US, EU and JP, one for each disc the game shipped on, Roll Away in North America, Kula World in PAL territories and Kula Quest in Japan, and the one pressed is the disc whose levels the map shows.

A press shows the level on screen as that disc ships it, most levels being the same on all three, keeps the view where it was turned by hand and frames the level afresh where it was fitted, since a slot's level on another disc may have another extent, and keeps the selected block where that disc's level still has its cell.

A level that differs on the disc shown carries that disc's own note under the line, saying what its level there has or lacks.

A level that is the same on the disc shown keeps its note, and carries that disc's own where the note speaks for the US release alone or that disc has no way into the level.

The line reads the disc's best score where one is known for that disc, and the whole total otherwise.

In the sidebar a level button carries a dot after its title where its slot holds another level on any of the discs, the same whichever disc is shown, since differing is a fact of the slot, and its tooltip names the discs it differs on.

The buttons are titled by the level each slot holds on the disc shown, so HIRO's slot 19, the Lesson on the US and Japanese discs, reads OBJ LEVEL under EU, where the PAL disc has a copy of the object catalogue instead.

The choice is kept from one visit to the next, so a visit with no link opens on the disc chosen last, while a link that names a level opens it on the disc the link carries, the US release where it carries none, whatever is kept.

A press is a history entry, so Back returns to the level as the other disc ships it.

While the ball is on the level the bar is disabled, since play holds the level it started on.

A level of your own stays on screen under any disc, since it belongs to none until it is put on one.

The artwork follows the disc too: a world the chosen disc paints otherwise is drawn in that disc's own textures ([tgi.md](tgi.md)), and its colour, which its swatch, its untextured blocks and the dust the ball raises take, is that disc's own.

The objects follow the disc too: a thing the chosen disc models otherwise is drawn, on the map and in the legend, with that disc's own model ([ggi.md](ggi.md)).

The PAL disc's jump is lower and over fewer frames, landing where the US one does, and a planned route's jump and the ball's jump in play follow it.

The motion follows the disc too: the PAL disc runs fifty frames a second, in play and in what moves on the map, with the frame counts its game was compiled for, and play runs by the tables and the rules of the disc shown ([motion.md](motion.md)).

Play's clock follows the disc shown, filled as that disc's game fills it and counted as its HUD counts it, so a 99-second level opens at 83 on the US disc, whose clock runs 82.5 seconds, at 99 on the PAL disc, where it runs its 99, and at 119 on the Japanese disc, where every 99-second level runs 119.

Play's strip gives an ending in the word the disc shown's end screen letters for it, so the Japanese disc's are in Japanese, with that disc's Perfect! where its end screen shows one.

## Your levels

The sidebar's "Your levels", after the worlds, lists the levels of your own this browser holds, in a fold that opens by itself when one of them is made, copied, opened or followed to, and otherwise stays as it was last left, across visits.

The editor loads only when it is wanted, so a plain visit loads none of its code ("Loading the editor and play mode" below).

`new` makes a level of one plain block and a start in the world on screen and opens it editing, and `copy this level` makes one out of the level on screen, a shipped level as the game loads it and a level that came by its link or from the community levels as its own document, its author and notes kept; either is a draft at once, drawn as the game would load it.

A copy of a level that is the PAL or the Japanese disc's own carries that disc's tag after its title, `BONUS 30 (EU)`, so copies of one slot from two discs are told apart among your levels.

A level of your own marked a Simon room is shown as the game shows the rooms, with its world's artwork and not the bonus artwork a level with no key wears, and the ball plays it as one; a key on it makes it an arcade level all the same, since the game decides that from the keys.

Each level of your own is a tile: a picture of the level, turned as the social card shows a level, its title, its world, whether it is saved to a file and, once there are changes, how many; choosing one shows it, as choosing a level does.

The picture is painted from the level itself as the tile comes into view, never fetched or stored, flat in its world's colour until that world's textures land, and flat for good where the browser is set to save data.

A link to a level of your own (`#DRAFT/3/...`) opens it on the device that holds it, and anywhere else gives way to the view on screen, saying that the level is kept in another browser.

Once this browser holds two levels or more, a row above them offers `list` and `tiles`, a sort and a filter by title or world.

The view and the sort are kept from one visit to the next, the view starting as tiles, or as the list on a phone, and the filter starts empty on every visit.

A bundle of your levels stands among them as a group under the bundle's title, its author and how many levels it holds, the groups first in the order the bundles were made, each with its levels in the bundle's order whatever the sort.

A group opens when one of its levels comes on screen, or when it comes to hold the level on screen, so the shown level never disappears into a closed group, and nothing of the groups' folds is kept across visits.

Levels this browser holds that could not be read are kept as they are, and a row under the drafts counts them and offers to remove them.

For the shown draft a Level card edits its title, author, notes and world, its time as its file holds it with what the clock starts at on each disc under it, whether it is a hidden level or shows invisible blocks from afar, and whether a level with no key plays as a bonus level or a Simon room; a level with a key plays as an arcade level, since the game decides that from the keys.

The name typed into Author is remembered in this browser and given to every level `new` makes and to every copy of one of the game's levels, while a copy of a draft, of a level that came by its link or of a community level, and a level opened from a file, keep the author they have.

Under the settings Circuits lists the four colours, whether each starts on or off, which its button turns over, and how many switches, teleporters and lasers of it the level has, so a colour's starting state is set beside the level's other settings.

A circuit's button is named for a reader by its colour, "green circuit", with whether it starts on in whether it is pressed, since "starts on" is the state and not the name, and the swatch is there for the eye alone.

The card announces none of its changes to the level's settings, where the panel does, so a change made from it clears what the panel last said.

The card offers `duplicate` and `delete`.

The card's `share…` opens a box with the link that carries the level whole, as Permalinks says, which holds the level as it is now and opens it framed to fit any window and turned as the map was turned when the box opened, with the slice kept and no block selected.

The box copies the link, hands it to the system's share sheet where the browser has one, emails it, or saves the file instead.

The box's second part says that a level sent in is shared under CC BY 4.0 with credit to its author and that a person looks at every level before it appears, and sends the level in by email to the map's makers, the message carrying the sender's statement that the level is their own with the grant of the licence, or as a GitHub issue.

The part adds that the community levels take levels of your own, not edits of the game's levels, the rule [community.md](community.md) states under "Adding a level by hand", so a sender reads it before either road opens.

A level with no author is asked for one before it can be sent in, since the name in the Author field is the name the level is credited to.

A level that names an author but is a copy of one of the game's levels by that rule cannot be sent in, the part saying so in place of the offer and naming the level it came from, with its disc where that is not the US one, while its link and its file work as for any level.

A level the rule only notes, as resembling one of the game's levels or keeping part of the one it was copied from, is offered the send-in as any other, since the catalogue's tool notes it for the person who adds it.

A level the checks find errors in gets no link until they are fixed, only the file.

A level whose link would run past 8,000 characters has the file put first, the box saying the level is too large for a link.

The card's `save as .json` writes the draft as the map's own file and `save as .kwl` as the file the game loads, and for a level in a bundle `save as a bundle` writes the bundle as one file, its levels in order.

`open a file…`, beside `new`, opens either file, or a level file from elsewhere, read for what it holds rather than by its name, as a new draft, saying what it had to repair, and a bundle file as new levels of your own gathered into a bundle.

It takes one of the game's packs too, which asks which of its levels to open and opens it in the world on screen, since a pack does not say which world it is from, and a disc image, which asks for the pack and the level and opens it in the world the map lists the level under, named as the disc its boot line names names it, or as the disc the map shows where it names none of the three.

It takes a level saved by the community's level viewer too, read in the world on screen.

It takes a patch the disc box made too, a PPF or an xdelta, which asks for the disc image it was made for, since a patch carries only what it changes and its levels come back whole only over that image, and opens the levels the patch puts on the disc as drafts on their slots.

`paste a link…` beside it makes a level of your own out of a link that carries a level, the map's own or one shared from the community's level viewer, where following the map's link shows the level without keeping it.

The card's `add to a bundle…` puts the level last in a bundle this browser holds or in a new one, a level standing in one bundle at most, and `take out of the bundle` leaves it in none.

A group's `arrange…` opens the bundle's card under its levels: the bundle's title, author and notes, its levels in play order to move up or down or take out, `save as a bundle` while the bundle holds a level, since a bundle file with no level would open as nothing, and `take apart`, which forgets the bundle and leaves its levels among your levels.

Your levels stay in this browser, written a moment after each change, and travel only as a file or as a link that carries one whole; a browser that cannot keep them says so.

### Put it on the disc

A draft goes onto the disc from its Level card, which opens "Put it on the disc", three steps in one box, and the box takes several of your levels as one patch.

The levels: a row for each, the draft the box was opened for first, with `add a level…` under them for another level this browser holds, or `a file…`, which takes what the sidebar's `open a file…` takes and adds a row for each level it opens.

A row shows the level's title, how it plays and what the checks find, and a level with errors cannot go on the disc until they are fixed.

A row's slot is one of any of the ten worlds' packs or their finals packs, or one of the ten Simon rooms' slots, named as the pause screen names the level there, with whose place the level takes and how the game reaches it, and a note that the level will wear that world's artwork where it is not the draft's own artwork.

The game decides how a level plays by where it lies, so a row says where the level and its slot disagree: a level that is not a Simon room is played in Simon mode in a room's slot, and a Simon room in any other slot as a bonus level.

A row opens on the slot its file names, else the slot its title names, else the slot its copy came from, else the first slot no other row takes, a Simon room's slot where the level plays as one, and the choice stays with the draft and in its file.

A row shows its fit, whether the level fits the slot's own bytes, needs the pack rebuilt or moves the pack into the disc's free sectors, each level fitted after the rows above it, worked out from the chosen disc until the image is given and read from the image after.

The disc: the image, dropped onto the box or chosen, read in the browser and sent nowhere, anything about it that differs from the disc said as a warning rather than a refusal, and then the downloads, a PPF patch, an xdelta patch, and the patched disc with its cue sheet, the disc saved through the browser's own picker where it has one.

Above the image's file control stands the bar `US · EU · JP`, the disc the patch is for, which stands on the disc the map shows until one is pressed, titles the slots and works out the fits as that disc would, and once the image is read is locked to the disc its boot line names.

Playing it, which appears once there is a patch, says where each emulator wants the patch, or that it plays the patched disc instead.

Before any download is offered the plan is read back through the patched disc, the directory, the packs and the slots read as the game reads them and every written sector checked, and the patches are then the stretches where those sectors differ from the image, so a level the browser cannot place is said so on its row and gets no patch.

The box follows its drafts while it is open, and keeps its levels and the image once it is closed, for as long as the page lives.

## Community levels

The sidebar's "Community levels", after Your levels, lists the levels players made and sent in, folded under its heading as Your levels is.

The levels are read from this site when the fold is first opened, or once the map has drawn where the fold was left open, or at the start where the link names one of them, and never on a plain visit; nothing of them is kept in this browser until one is copied.

Each is a tile as a level of your own is, its picture, its title, its author and its world, newest first, and a bundle of levels is one tile, with its first level's picture, its title, its author and how many levels it holds; choosing a tile shows the level, or the bundle's first, marked "Community" on the level line.

Once there are two or more, a row above them offers a sort, newest first, by title, by author or by world, and a filter, which start afresh on every visit.

Under the level line the note names the author, gives the notes as written and offers `copy this level`, which makes a level of your own out of it with its author and notes kept, and `save the file`, which saves it as the map's own file, or for a level of a bundle the whole bundle.

Under a level of a bundle the note also says where the level stands in the bundle and lists the bundle's levels as links, so the rest of the bundle is a step away wherever the level was opened from.

A link to a community level (`#COMMUNITY/17/...`) opens it on any device, the levels read before the link is, and a link to a level of a bundle (`#COMMUNITY/17-3/...`) opens that level, the third of record 17, which is what the links under the line are.

The levels are their authors' work, shared under CC BY 4.0 with credit to the name in the Author field, which the fold's sentence and the About say, and [community.md](community.md) has the catalogue they are read from and how a level is added to it.

## The editor

On a draft, `w` or the strip's Edit button turns editing on and off, and on a shipped level `w` makes a copy and opens it editing in one step; choosing a shipped level turns it off, and editing is never in the link, never stored and not a Display switch.

Turning editing on turns the Ground grid on with it, so the floor that blocks are laid against is shown.

### The tools

The strip at the map's bottom left holds the tools:

- Place (`a`) lays the brush's block in the cell across the face you click, a plain block until a palette row is pressed.
- Erase (`z`) takes what stands on the face you click, or the block with everything on it where nothing does, a platform or a laser whole.
- Select (`i`) is the viewer's own click, with a rectangle for several blocks at once, below.
- Turn (`r`) turns the selected thing a quarter turn where its kind faces, or else what the next placement will face, Shift-`r` the other way.

Shift-click erases and a right click selects from any tool, and `Esc` clears the selection without leaving the mode.

While Place or Erase is the tool the face under the pointer is washed and outlined, Place stands a ghost in the cell it would fill, red where the click would be refused, and the tip says what a click would do.

With the Ground grid on the grid spans the whole floor under the level and a click lays a block there, so a first floor has somewhere to land.

While the slice is lowered the grid follows the slice instead, under the topmost layer still shown, so `,` and `.` choose the height a floor is built at.

What the game would not forgive is refused and changes nothing, the strip saying why: nothing is built past the edge, a cell is not filled twice or across a platform's run or a laser's beam, a face is not given what it holds already or what it cannot take, and a level keeps its last block.

What was laid is selected, so the panel is right there, and a block laid above the slice raises the slice to show it.

### Undo and redo

`Ctrl-Z` undoes the last change to the draft on screen and `Ctrl-Shift-Z` takes it again, as the strip's Undo and Redo do, letters typed into the title close together joining one step, and `Delete` or `Backspace` erases what is selected.

The steps belong to this visit alone, kept for each draft until the page is left, and a form field keeps the browser's own keys.

### Several blocks at once

With Select, a drag that begins on no block draws a rectangle, and the blocks whose middles lie in it are selected together, a platform or a laser whole, what the slice has taken off staying out of it.

Dragging one of the set moves it whole, across the floor at its own height or, with Shift held as the drag begins, up and down, with what stands on its blocks, as one step, its ghosts standing where it would land, red where the game's rules would refuse it.

With a set selected, Shift with the arrow keys moves it a cell along the ground, Shift-PageUp and Shift-PageDown a cell up and down, and `Delete` or `Backspace` erases it.

A drag that begins on a block outside the set turns the level as ever, so a set is always begun from empty space.

A set is made with a mouse or a pen, since a finger's drag turns the level, though once a set is made its keys work by touch as anywhere.

### The palette and the brush

The palette floats above the strip while editing, and the strip's Palette button puts it away and brings it back.

Its tabs are the groups a player meets and its rows every kind of block and every thing the game places, by name and with the legend's icon, each colour or worth a row of its own and the fruit one row, since the game shows the player's next fruit whichever is placed.

The pressed row is the brush, which Place lays, a thing in place of whatever stood on the face you click, and choosing a row makes Place the tool, so the next click lays what was chosen.

`1` to `9` press the shown group's rows and `j` and `k` step through every row across the groups; Alt-click takes whatever is under the pointer as the brush.

### Laying a run

A moving platform or a laser is a run, laid in two clicks: the first sets the run's own block, against the face you click or on the floor through the grid, the pointer then previews the run along whichever way it leaves the block by most, every cell tinted by whether the run may go there, and the second click lays it; `Esc` cancels a waiting run.

A click with a platform or laser brush on a run's own block takes that block as the first click, so the second re-lays its run in one step and the run keeps its own kind and colour, and Erase on a run's block takes the run whole.

### The panel's form

While editing, the panel that opens on a selected block of the draft is also its form, standing above the block's own rows, which fold under "Block information".

A row of six buttons, Faces, stands for the block's faces, and under it the block's kind, a vanishing block's phase, a platform's length and speed and a laser's colour can be changed, and what the chosen face holds, faced, coloured or given its worth.

A switch, a teleporter and a laser show the circuit of their colour in the row the Level card shows for all four.

"Place the brush here" and "Build against this face" lay what a click on that face would, so a level can be built from the keyboard, and with a platform or a laser for the brush there is no Place button, since a run is laid on the map in two clicks.

The panel keeps to the block and its face: how the level plays, its counts and what the checks find are the level line's note, so they are read once rather than on every block.

Every change is one step that undo takes back, and a change the game would not forgive is refused and put back, as the tools refuse it.

### Touch screens and phones

On a touch screen there is no hover, so Place and Erase take two taps, the first marking the face as the hover would and the second, on the same face, doing it, and a run takes two such pairs; on a phone the strip keeps a row for the prompt, so nothing moves under the second tap.

A long press selects whatever is under the finger from any tool, as a right click does with a mouse.

On a phone the palette and the panel open as sheets at the foot of the map, one at a time, the strip standing above whichever is open and the map still turning above that.

What a tap places or clears is selected as with a mouse, but the panel's sheet stays down, through every redraw of the draft, so a floor is built without a sheet to put away at every block; a long press, or a tap with Select, opens it.

## Planning a route

`r`, or Route planner among the Display switches, turns the planner on.

While it is on, a click or a tap on a block's face adds a stop there, and the stops are joined by a golden route drawn over the faces; the first click on a level that has a start begins the route there, heading the way the ball faces as the level opens, so the route starts where the game does.

A right click, or a long press on a touch screen, opens a block's panel as it does with the planner off.

A stop is joined to the last by the shortest way the ball could roll there by the game's own rules for a step, over the faces, up a wall where a block stands ahead and round an edge where one ends, and where no roll reaches it, by a dashed leap.

With Shift held a click adds a jump from the last stop instead, two blocks on along the face it leaves, over a gap or down onto a lower block, drawn as a solid golden arc, and is refused where the blocks let no jump come down on the face clicked.

The route knows the blocks and nothing of what stands on them or of ice, so it runs through a laser's beam and over spikes as readily as over a coin, and what it says is where the blocks let the ball go, not whether the ball would live or how long it would take.

A face that looks into another block, or a moving platform's block, takes no stop, and though the shortest way may run over a platform at rest, the route is not drawn across it.

A click on the last stop takes it back, and the strip at the map's bottom left counts the stops, the jumps and the leaps, undoes and redoes the route's changes, clears the route and copies a link that carries it.

A change is a stop added or taken back, the route cleared, the ball's way kept as the route or a link's route opened over it, and the changes are kept while the level is shown.

While editing, the editor's tools take the clicks and `r`, and the planner waits until editing ends.

The route is kept with its level in this browser, for levels of your own as well, and it rides in the link, so a link copied with it opens with it wherever it is opened; a link without one leaves the kept route as it is.

A route is kept by the level shown, its slot and, where that is another disc's level, its disc, so a route planned on the PAL BONUS 30 never stands over the US one, while a level the discs share keeps one route whichever disc is shown.

The switch itself is not kept from one visit to the next, and a route stays on the map with the switch off.

A level of your own edited under a route keeps the route as it was, a stop whose face no longer stands a dashed ring and a step the blocks no longer allow a dashed leap, so an undo of the edit makes the route whole again.

While the ball is on the level, Follow on the play strip rolls it along the route, as Rolling the ball below says.

## Rolling the ball

`p` or the ball at the map's bottom right stands the ball on the level at its start, where the game puts it, and with Play from a block's panel on in Settings a block's panel stands it on the face you clicked; while the ball is on the level the start's own ball is not drawn, so the level shows one ball wherever play began.

Either way the map takes the ball's view: the camera stands behind the ball and above it, looking the way it faces, with the face it stands on for the floor, and a little to one side so that the blocks keep their depth.

A level with no start stands the ball on the first face it could, and says so.

### The keys, the pad, the strip and the HUD

The arrow keys move the ball, up rolling it onto the next block for as long as it is held and left and right turning it a quarter turn each way; play asks nothing of Down, as the game's ball asks nothing of it.

On a touch screen a pad does the same, a bar for the roll over the two turns at the map's bottom left and the jump at the bottom right, so one thumb can hold the roll while the other taps the jump, both lying over the view without moving it.

The strip at the map's bottom left says which block and face the ball stands on and which way it faces, and on a phone it is a bar at the foot of the screen.

While the ball is on the level a HUD at the top of the map takes the level line's place, naming the level and showing in the middle the clock as the game's HUD counts it, the points at its left and the keys still to take at its right, with the run's total and the Simon rooms' figures under them where they apply.

### The jump, the fall and the dust

Space jumps the ball two blocks on, from rest with up held or while it rolls, and standing still hops it in place; a ball that falls off the level is lost, which ends the level as the clock running out does.

The ball leaves golden dust behind it, which comes from the map and not from the game, until Settings puts the dust away.

### Keep and Follow

Keep on the strip hands the way the ball has come to the planner as the level's route, a jump the ball made kept as a jump, and goes on handing it over as the ball goes on, so the route grows under the ball until it is pressed again.

While a route stands, Follow rolls the ball along it as a player would, coming to rest only where the route turns or jumps, and stops at the route's end or at a leap, which no roll or jump follows; an arrow, Space, the pad or the button again takes the ball back.

### Round an edge and up a wall

Where the block ahead ends and nothing stands beside it the ball rolls round the edge onto the side below, and where a block stands in its way it climbs onto that block's face, and either way the whole level tumbles with it until the face it now stands on is the floor again; the compass turns with it and goes on naming the world's own ways, so it always says where the world's up has gone.

Where a block comes between you and the ball, as the one it has just climbed from does, the ball shows through it faintly rather than vanishing behind it.

The ball rolls at the game's own pace, turns and tumbles over the game's own frames and spins as the game spins it, all read from the game's code as the rest of what moves is.

### What the ball takes

The ball takes what the game's ball takes, in the game's own burst of sparks, and a pill or the hourglass does what it does in the game, by the rules of the disc shown.

The last key opens the exits, which turn green and faster and cast their light as they do from the panel, and rolling onto an open exit, or landing on one, leaves the level.

The hidden exit stands unseen while a key remains and appears as the last key opens the exits, as in the game; the map itself shows it from the first, turning slowly, a thing to find.

On a level with no key, the Simon rooms apart, the HUD counts the blocks still to roll onto instead, each block taking the game's colour as the ball first stands on it, and the level is done with the last of them.

The tip and the panel still list a thing the ball has taken, and say it is taken.

### A run through the levels

By default a level plays on its own: it starts again after any ending, and no total is kept or shown.

With Play on through the levels on in Settings the ball plays a run as the game does: a level done banks its points into the run's total, a death costs what the game takes for it, a total below nothing is the game's end, and a way out goes on to the level the game loads next.

Each level of a run holds the first fruit the run has not banked, as in the game, where the map otherwise draws a level's fruit by its number.

A level of your own and the Simon rooms keep no total.

Leaving play ends the run, and so does turning the switch off while the ball is on the level, at the level's next ending, while turning it on begins a run as the ball is next put on a level.

### The devices under the ball

Rolling over a switch throws it, as in the game, turning its colour over as the panel's button does.

A teleporter that is on sends the ball to the one it leads to, facing the way that one faces, the view cutting there with it rather than tumbling, and the way the ball has come takes a leap there.

### What harms the ball

What harms the ball in the game harms it here:

- A lit laser beam kills it in the cell it is in, on the ground or in the air.
- A fire block heats it while it stands or rolls on fire, and burns it once it is hot enough.
- The acid block dissolves it in a moment.
- The spikes kill it at once and the moving spikes while they are up or just about to rise.
- A captivator catches it as it comes within reach, as the hedgehog does in its brown form.

The strip says in red what is killing the ball while the game's countdown runs, and the ball reddens with heat, greens in acid and flashes as the spikes or a captivator take it, though it does not swell as it burns.

Forgive on the strip, off until it is pressed and kept for the visit, undoes each death as it comes, putting the ball back at rest where it last rested, a lost ball too and a ball that was riding a platform set down in the level, and saying what would have happened; the clock running out is not forgiven.

### What is under the ball

What is under the ball acts as it does in the game:

- Ice slides the ball on to the first block that is not ice.
- An arrow lets the ball roll off its block the way it points alone.
- A crumbling block breaks the moment the ball stands on it and is gone a third of a second later, dropping a ball still on it.
- A vanishing block carries the ball while it is there and drops it as it goes.
- A moving platform carries a ball that comes down on it from a jump or a fall, and a jump or a hop is the only way off.
- A boost button launches the ball three blocks on, without the game's sounds or the pad's shudder.

A block that has gone is gone from the map, with a burst of dust where it stood, which is the map's own.

### The Simon rooms

A Simon room, one of the game's rooms or a level of your own marked one, is played as the game plays it, one move at a time: each round asks again for the moves made in the round before and two more, and a move unlike the one made before ends the room with the round lost.

By default a room plays alone that way, and no one scores.

With Play on through the levels on in Settings the rooms play the game's match, two players at one keyboard taking the rounds in turn, the HUD saying whose turn it is and the two players' points, and once the match names its winner it starts afresh with the points at nothing, since the game goes back to its menu there and the map has none.

### The clock and the opening

The level's clock counts down as the game's clock does while the ball is on the level, and the level opens with the view coming to the ball and the keys live after the game's own short hold, with no fly-in ([camera.md](camera.md)).

### The ending

When the time runs out, the ball is lost or the level is done, the level has ended: the ball is gone, the keys and the pad move nothing, the strip says how the level ended, in the word the game's end screen shows for a death or the clock running out, and the view lets go of the ball and turns about the level's middle as the game's view does at an ending.

The ending lasts until Space, Enter or a tap on the pad, or the time one of the slower swings takes, near six seconds on any level, and the level then starts again from its start, as the game loads a level after an ending, unless a run goes on to the level the game picks.

With Motion off the view cuts to the level and stands, and the ending waits for the key.

A level of your own and a final start again from their own start after every ending, run or no run, as do the last world's last level and the bonus or hidden level it leads to, the game having no world to go on to.

### The view, leaving play and Motion

Dragging turns the view about the ball, the wheel zooms, and `f` frames the ball again.

`Esc` leaves play with the view and the slice as they were before, or with the ball's view where the run has gone on to another level since, and choosing a level, opening a link, going to a find on another level or a click on the name a teleporter's panel gives for where it leads leaves play too, keeping the view it goes to; a find on the level shown selects its block while play goes on.

With Motion on the level runs as the game's level does while the ball rests, and the view eases round behind the ball as play starts and back as it leaves; with Motion off the view cuts, the ball jumps from one block's middle to the next and the level waits between moves.

## Permalinks

The URL is a permalink: `#INCA/11/45,35/0.90/17,17,17/0,0/33` is the level by its pack and its slot in it (LEVEL 42, the numbering the cheat in [level-format.md](level-format.md) takes), the yaw and pitch it is turned to, zoom, the cell it orbits around, the pan away from that cell, and the slice, and after those the selected block where there is one, and a planned route, which rides at the tail as one word the planner reads back and every earlier version of the map passes over.

The disc rides at the tail too, as `d-eu` or `d-jp`, the US release writing none, so a link with no disc opens the US level for everyone, whatever disc the browser kept, and a code the map does not know opens the US level as a link with no disc does.

A level can travel whole in its link: a segment lettered `s` at the tail carries it, under a slot of its own, `#SHARED/L3K9ZQ2/...`, whose index stands for the level's text, and the link opens the level on any device, marked "Shared" on the level line, with the author and the notes it carries under the line and `copy this level` there, which makes a level of your own out of it; nothing of it is kept in the browser until it is copied. [editor.md](editor.md) has the segment's codec.

A link whose segment will not read, or one to that slot that carries no segment, cut short on its way, gives way to the view on screen and says so once, whether it opens the page or arrives while the page is up.

A community level opens under a slot of its own, `#COMMUNITY/17/...`, the id of its record in the catalogue, which is read from this site before the link is, so the link opens the level on any device, marked "Community" on the level line with its note under it; [community.md](community.md) has the slots, a bundle's levels among them.

A link to a community level taken down, to one the catalogue never held or arriving while the catalogue could not be read gives way the same way, saying which in one toast.

While the level is framed to fit the window, the link says `fit` in place of the zoom, the cell and the pan (`#INCA/11/45,35/fit/33`), so it opens framed to whatever window it is opened in, as one that stops at the turn does; a link that names the zoom, the cell or the pan holds the view there, and one that names the zoom alone opens at that zoom centred on the blocks, as a fit is.

While the ball is being rolled the link keeps the view the ball was first put down from, so a link copied then opens the level as it looked before, or, once a run has gone on to another level, opens that level in the same view, and playing itself is never in a link.

Turning, panning, zooming, slicing and picking bring the entry up to date once the view has rested; choosing a level, a disc or a find makes a history entry at once, with what waits written onto the entry beneath it first, so Back returns to where you were; and Back and Forward read the bar rather than write it.

A segment never changes what it means, and what a link carries grows at its tail, which the reader takes by shape and passes over where it does not know it; a unit test holds one link to where it puts the lattice on the screen.

## How it is built

`public/` is the deploy artifact: dependency-free ES modules, no build step, but for pako's deflate under `js/vendor/`, vendored with its licence, which writes a zlib stream byte for byte as zlib does where the browser's own compressor does not, so that a level fits a slot on the disc the same in every browser.

`js/main.js` boots, `js/viewer/state.js` holds shared state and the camera, and modules talk through the `emit`/`on` pair in `js/viewer/ui/dom.js` rather than importing each other both ways.

### The layers

The modules lie in layers, and a module imports only its own layer and those beneath it:

- Under `js/viewer/`, what a plain visit loads, the root is the model, which touches neither the page nor a canvas, `ui/` the page's primitives, which know nothing of the map, `draw/` what paints the canvases and `chrome/` what stands beside the map and speaks for it.
- `js/format/` reads and writes the level, the project, the pack, the disc image, the patch, the store, the link that carries a level and the community catalogue, judges whether a level is a copy of one of the game's levels or resembles one, touches no DOM and nothing of the viewer, and holds the lattice, its side, the key of a cell, the six faces in the game's order, the game's numbers for the kinds of block and the types of thing and the sets of them the layers share, which every layer imports.
- `js/editor/` is what loads when a level of your own is wanted.
- `js/play/` is what loads when the ball is wanted.
- `js/community/` is what loads when a level comes by its link or the community levels are wanted, decoding the segment or reading the catalogue and standing the levels beside the map, and reaches nothing of the editor.

`js/viewer/ui/tiles.js` lays a list of items out as tiles, each a button with a picture, and knows nothing of levels: whoever mounts it hands each item a key, a stamp, its words and a function that paints its picture into the tile's canvas, and hands the items anew as they change, the tiles keeping the picture of an item whose stamp stands and the focus where it was.

A tile's picture is painted as the tile comes within a screen of showing, again when its item's stamp changes or the screen's density does, and on request, at once for a tile within that screen and when it next nears for one farther off, and a paint that says it was not whole is asked again the next time the tile nears, so a long list paints only what shows.

### The stylesheet

The stylesheet is the partials under `css/`, each linked by its own `<link>` from `index.html` in name order, and that order is the cascade: where two rules of equal specificity set one property of one element, the rule of the later partial wins.

A partial is named `NN-word.css`, a two-digit rank and one lowercase word, so the folder listed by name is the order the page links the partials in; `tests/unit/stylesheet.test.js` holds the page's links to that listing, each partial once and no other stylesheet.

The ranks start at 10 and leave numbers free between them, and a new partial takes a free rank between the partial it must follow and the one that must follow it, a multiple of five where one is free, so none is renamed to make room.

The links stand after the page's inline script, since a script that follows a stylesheet still loading waits for it, and the world's textures the script asks for would wait with it.

The partials are named for what they hold, and the page links them in this order:

- `10-base.css` holds the tokens, the resets, the body, `.sr` and `.mono`, which any surface may wear, and the frame the sidebar and the map stand in.
- `20-sidebar.css` holds the sidebar: its head, its sections, whose class is `.panel`, the small button of a heading and the link-like button, which the count line and the level line's notes wear too, the worlds and their levels, the folds, the switches, the keys' caps, the slice and the legend.
- `25-search.css` holds the search box, the scope bar, whose look the release's buttons and the palette's tabs wear, the count line and the results.
- `27-yours.css` holds Your levels, with a level's row, a bundle, the Level card, and the tiles and the row that stands above a list and sorts and filters it, both worn by the community levels too, and the sidebar's foot.
- `30-map.css` holds the map and its canvas.
- `40-readouts.css` holds the readout, the corner with its buttons and the compass, and the tip.
- `50-panels.css` holds the panel, which a click on a block opens, and the tags, with the toasts.
- `60-play.css` holds play's strip, the HUD, the pad and the jump.
- `65-palette.css` holds the palette.
- `70-chrome.css` holds the menu button, the scrim, the level line with its notes, the rules the three strips share and the planner's strip.
- `80-dialogs.css` holds the dialogs' shell, the list of the keys, Settings and the editor's boxes: the disc box, the import boxes and the paste, share and bundle boxes.
- `90-narrow.css` holds the rules under reduced motion and under a phone's width, and the panel's form.

A new rule goes in the partial of the surface it styles, and a rule two surfaces share stands with the surface it names first.

The rules under reduced motion and under a phone's width stand in `90-narrow.css`, linked last: where one restates a selector another partial writes at the same specificity, the later rule wins.

The page for a missing path links the same partials by paths from the root, since the host answers a missing path at any depth with the page.

### What the page fetches

The page itself starts what the boot will ask for before any of its modules has arrived: every module the boot imports, so they load in one round rather than as each is found in the last, the data files, and the textures of the world the link's pack names, or the first world's textures where there is no link, so everything is on its way together.

The page fetches the three release files beside the data, one a release, each carrying only what its disc changes, the levels, the artwork, the models and the motion and skins tables that differ from the US one, and a file that cannot be loaded leaves that release out.

The US release is built into the model, so the map shows it under its own name where its file cannot be loaded.

Once that world's textures have landed and the page is idle, the other worlds' textures are fetched one at a time behind whatever the page asks for itself, from the next world on, unless the browser is set to save data, so a change of world finds them here; `js/viewer/draw/atlas.js` keeps every atlas for the visit, and a frame redraws for a landing only when it is the shown world's atlas.

A disc that draws a world otherwise names sheets of the atlas's size, transparent but for the cells its textures change, which the page does not preload: they are fetched with the world's atlas when a level of that world is first drawn on that disc, or ahead behind the atlas as the other worlds' are, and composited over the atlas once all have landed, while a world the disc names no sheet for draws the atlas itself, with no canvas and no extra fetch.

A module may ask `js/viewer/draw/atlas.js` whether a world's textures have landed on the disc shown, the sheets drawn over them where the disc names any, without starting their fetch, so what paints a world's blocks before its textures arrive can draw them flat and wait on `atlas-loaded` rather than put the atlas ahead of whatever the page asks for itself.

Beside the worlds' atlases under `tex/` the build lays the sheet of the seven sprites the game's effects draw, for play alone, which the page does not preload.

A link that carries a level fetches the community module and what it imports beside the data, since the level comes whole in the link; the page cannot read the world off the segment before the decode, so that world's textures are fetched once the level is decoded, as a draft's textures are.

The community levels' index, `community/index.json`, is fetched with the module that reads it when their fold is first opened or once the map has drawn where the fold was left open, and at the start, once the data has come and before the first link is read, where the link names one of them, and never on a plain visit; an index that did not arrive is said in the fold and fetched again the next time the fold is opened.

### How a level reaches the screen

Every level reaches the screen through one funnel in `js/viewer/chrome/navigate.js`, the disc's levels by their place in the data, the release shown choosing the level installed at that place, and any other through `showLevel`, and a module may provide levels for a link to name beyond the disc's slots through `provideLevels`, or keep a segment of its own at the link's tail through `tailWith`, written with the view and handed back to it when a link opens; a level from elsewhere installed again is an update, as is a level installed again at its own slot where the module asks, which keeps the hidden kinds, the slice and the selection where the level still has its cell.

A draft reaches the screen as `toLevel` in `js/format/project.js` makes it, the level the reader in `js/format/kwl.js` makes of the bytes the writer there writes for the draft, so what the frame draws is what the game would load of it, drawn as a disc level is.

A level `toLevel` makes carries a tag naming its origin, `Draft` for a level of your own, `Shared` for one that came by its link and `Community` for one of the community levels, which the level line shows as a pill after the title and the level as it is spoken says before the title.

A level under the drafts' pack carries its store id as `draft` beside the tag, the mark the editor reads, and a level drawn under another pack carries no `draft` at all.

### Drawing the frame

`js/viewer/draw/render.js` draws the frame: it keeps the pick canvas that turns a point on the screen into a cell, lays what shows through the blocks over the map, and draws again while anything moves.

`js/viewer/draw/cells.js` puts the cells in the painter's order, back to front, and paints them in it, each block with what stands on it and the frame's block and cell hooks run on it, handing back what is to show through the blocks and whether anything it drew is moving, so the one loop can paint a level into any canvas.

`js/viewer/draw/still.js` paints a level frozen at its first frame into any canvas through the cell painter, the frame's camera, view, slice, switches, hidden kinds, circuits, selection and hover swapped for the still's own and given back once the paint returns or throws, with the stores and the registrations the frame keeps set aside through the seams, so a tile has a picture and the frame none of the paint.

A still is framed as the social card's levels are, turned to the card's yaw and pitch with a slim margin, the outlines on and the labels, the grid, the camera and see-through off.

A still draws the world's textures where they have landed and the world's flat tint otherwise, never starting a fetch of its own, saying which it drew so what asked can paint again once the textures land.

The frame draws the blocks through `js/viewer/draw/blocks.js`, which lays each world's textures from `js/viewer/draw/atlas.js` and the light a device casts on them from `js/viewer/draw/lights.js`, which casts a light a module hands it through `lightsWith` as it casts a device's light, from a cell and a face in a colour of the module's own, on the faces a device there would light and at the same levels, so that nothing on the blocks changes until a module hands one.

`js/viewer/draw/atlas.js` keeps its atlases by disc and world, a disc's atlas of a world being the US atlas with that disc's sheets drawn over it at the origin in the order its file names them, built once all have landed and said with `atlas-loaded` as the atlas's own landing is, so `js/viewer/draw/blocks.js` and whatever else paints a face asks for the world's atlas alone and carries no branch for the disc.

Where the index the frame draws from marks a block, with the frame of its mark, `js/viewer/draw/blocks.js` hands `faceSkin` in `js/viewer/skins.js` the frames since the mark for each of the block's faces, or with Motion off a count past the whole fade, and `faceSkin` paints such a face as the game paints a block the ball has rolled onto, faded in from grey, so play's marks reach the faces with no branch for play in either module.

It draws what stands on them through `js/viewer/draw/things.js`, a laser's beam through `js/viewer/draw/beams.js`, and what is neither, from a platform's route and the ground grid to the scale bar and the lettering of a label, through `js/viewer/draw/overlays.js`, which draws the arrow to where a teleporter leads with `js/viewer/draw/arrow.js`, a link drawn as OddworldMap draws its links and knowing nothing of either map.

A disc's models reach `js/viewer/draw/things.js`, the legend's icons and play through `js/viewer/data.js`, which hands out each type's model list and the jump's arc from the release shown's file where that file carries them and from the base's otherwise, the file's own objects every time, so what draws a thing carries no branch for the disc and its caches keyed by model hold.

A disc's motion and skins tables reach the frame, the legend and play the same way, through `js/viewer/data.js`, which composes a release's file over the base's tables by the release's id, the disc shown's for the frame, the legend and play and any disc's for the editor's card, an entry of the motion table's types and kinds whole and every other key whole, once per release, so what reads a table carries no branch for the disc and an entry the file does not carry stays the base's own object, which the caches keyed by an entry rest on.

The caches keyed by a level or its index, the light sets in `js/viewer/data.js`, the invisible block's light in `js/viewer/draw/blocks.js` and the devices' takes in `js/viewer/draw/lights.js`, are keyed first by the table they read, so a slot the discs share never serves another disc's sets or takes after a change of disc.

The frame's run keeps the time the level's clock started at and reads its frame from the time since at the rate of the table shown, the time the page was hidden added to the start, so a change of disc keeps a level's elapsed time and counts its frames at the new rate, and lays what travels afresh where it was laid from another table.

### The seams

What draws over the map from outside it registers with the frame's four hooks through `overlayWith` in `js/viewer/draw/render.js`, one run before any block where the ground grid is drawn, which may skip the grid by returning true, one on each block once it is drawn and before the things standing on it, one after each block with what stands on it, and one once the see-through layer is laid, which may ask for another frame by returning true.

A module may also hand the frame travellers of its own through `movingWith`, each keyed as the level's own walkers are, by a cell and a face, or by a name of its own, and drawn, sorted and picked as they are, or sorted at a depth of its own where it hands one, reckoned as a block's depth is, from the corner of the unit cube about it, standing in for the thing whose cell and face its key names where it names one.

A traveller that asks to show through the blocks that cover it is drawn again on the see-through layer, without its shadow, as a thing on a face turned away is while that switch is on.

A traveller that hands a body, a rotation by rows relative to the axes the thing is laid on, across, forward and up, is turned by it in place of the thing's own spin, its squash and its shadow laid as before.

A module may give the things on the blocks the points its ball stands at in place of the level's starts through `ballsWith` in `js/viewer/draw/things.js`, so the invisible blocks light and the boost buttons sink under a ball that moves.

It may tint a traveller it hands by three numbers, one a channel, which the thing's colours are drawn through.

A module that paints a level still, outside the frame, may run its paint through `stillWith` in `js/viewer/draw/things.js`, under which the things on the blocks read the level's own starts and not the points a module stands through `ballsWith`, so a ball that moves on the map lights and sinks nothing in a paint outside the frame.

It may ask `deviceLights` in `js/viewer/draw/lights.js` for the devices' light alone, with `cast` off, under which the lights a module hands through `lightsWith` are neither asked for nor cast, so a burst on the map reaches the frame's own paint and no other.

It may run its paint through `apart` in `js/viewer/motion.js`, under which the boost buttons' counts, the orbits and the glint generator are fresh stores of its own and the frame's own stores are back once the paint returns or throws, so a paint of another level, or of the level shown at another frame, steps nothing the frame keeps.

A module that runs the level may hand the frame, through `runWith`, the clock it draws at, the index of cells and things it draws from, shaped as the level's own index with a thing only on a block it holds, and what travels, each standing in for the frame's own counterpart while it is registered, and may say that every invisible block is seen.

The handed index may carry the blocks breaking up with the size of each in the game's units, which the frame draws as cubes of that side about their middles, every face turned to the camera drawn and the faces of the blocks beside them toward them shown, a platform's apart, the pick following the shrunk cube.

The handed run may shift the whole scene by a vector of canvas pixels, under which everything from the ground grid to the frame hooks is drawn and the scale bar is not, and the pick follows it, so a point of the screen finds the cell drawn under it.

So what is gone from the level as it runs is neither drawn nor picked, the walkers stand where the module has stepped them and no invisible face is lit while every one is seen, while the hover, the tip and the panel read the level as installed and the frame's own clock, index and walkers are in use again once it stops.

What listens to the pointer registers with `js/viewer/chrome/interaction.js` for a click through `onCellClick`, for a drag through `dragWith`, which what registers may take from the camera at the press, and through `hoverBy` for what about the cell under the pointer matters to the hover, which is how the editor draws its grid, washes and ghost and takes its clicks and drags.

A module may add lines of its own to the tip through `tipWith` in `js/viewer/chrome/interaction.js`, under what the tip says of the cell, which is how the editor and the planner say what a click there would do and play says what the ball has taken from it.

A module may fill the panel through `onShow` in `js/viewer/chrome/detail.js` and stand a note of its own under the level line through `noteWith` in `js/viewer/chrome/navigate.js`, which asks what is registered before it falls back to the level's own note, and those two seams are how the editor's form, a draft's overview and the notes under a level that came by its link or from the community levels come in.

A module may take the panel down through `clearDetail` and build it again for the cell it shows through `refreshDetail`, both in `js/viewer/chrome/detail.js`, which is how play keeps what the panel says true as the level runs.

A module may reinstall the slot shown in place through `reshow` in `js/viewer/chrome/navigate.js`, which keeps the selection where its cell stands and frames the level afresh where it was fitted, and may register a segment of the link's tail with `before` beside `read`, told the segment before the slot is resolved, so that what it names is installed once.

A module may answer a link's slot with a level of its own through `provideLevels` in `js/viewer/chrome/navigate.js`, each source asked with the slot the link names, in upper case, and answering with a level or nothing; a link to a slot a source answers installs the level where that slot is not the one shown, whatever level is on screen, which is a change of level, or an update where the level's own slot is the one shown, while a link to the slot shown installs nothing and lays its view on the level there.

A module may read what the link writes for the level shown through `viewParts` in `js/viewer/chrome/navigate.js`, the view a module parked or the camera and the target as they stand, whether the level is framed to fit, the slice and the selected cell, which is how the editor's share box writes its link with the turn the map has.

The route planner is built on the same seams and loads with the boot, since a linked route must draw on the first frame:

- `js/viewer/walk.js` is the model, pure and testable without a page, the ball's three moves and the side rule over a probe of the lattice, the shortest walk between two faces, the course's codec and its pieces.
- `js/viewer/draw/ribbon.js` paints a block's pieces, the leaps and the rings and nothing of the page.
- `js/viewer/chrome/course.js` is the planner's chrome, the clicks, the strip, the store and the link, drawing through the block hook and listening through the pointer lists and the link's tail.

The planner hands play the route standing through `current` in `js/viewer/chrome/course.js` and takes the way the ball has come as the route through `adoptCourse` there.

### What the bus carries

The viewer tells the editor, the planner and play what has changed through the `emit`/`on` pair, and they tell it and each other there, by these events:

- `level-changed` and `level-updated`, which the funnel says with the level's place as it installs a level, the second where the install is an update, and which the editor, the planner and play follow as the chrome beside the map does, the search building a list narrowed to the level anew on either.
- `link-opening`, which the funnel says as a link opens, once the link's level is installed and before its view is laid, on which play lets the ball go.
- `selection-changed`, which the panel says as the cell it shows changes or it closes, and which the editor follows.
- `go-to`, which the panel says with the cell a click on a name in it leads to, on which the search finds that cell and play centres the view there and lets the ball go.
- `show-changed`, which the sidebar says with a switch's key as it is turned and the level line as its note folds, on which play puts the dust away as its switch goes off.
- `density-changed`, which the frame says once the canvas is sized again for a change in the screen's pixel density, on which whatever paints an icon or a tile paints it again.
- `atlas-loaded`, which `js/viewer/draw/atlas.js` says with the world as that world's textures land, and again as the disc's sheets are drawn over them, on which the editor draws its palette, its icons and the tiles of that world's levels among your levels again.
- `slice-changed`, which whatever moves the slice says, play among them as it takes the view and gives it back, and which the slice's control follows.
- `course-changed`, which the planner says with the route as it changes, on which Follow and Keep let go of a route that no longer stands.
- `editing-changed`, which the editor says as editing turns on or off, on which the planner drops the refusal its strip shows.
- `drafts-moved`, which the editor says with the ids it moves drafts from and to, on which the planner moves the routes it keeps for those drafts to their new ids.
- `play-changed`, which play says as the ball is put on the map or taken off, on which the editor ends editing and the disc's bar is disabled.

### Loading the editor and play mode

`js/editor/editor.js` and what it imports, pako included, load when a level of your own is first made, opened or linked to, or when this browser already holds one, after the map's first frame unless the link names one of them, which waits for the editor, and never on a plain visit, which carries the editor's markup and styles alone.

Play mode loads the same way, under `js/play/`, when the ball is first asked for by its key, the corner's button or a block's panel, and never on a plain visit.

The community layer's `js/community/community.js` loads when a link carries a level, with the data where the page opens on such a link, so the level is decoded before the first link is read, and on the hashchange that brings one, after which the link is read again once the level is decoded, the last link asked for winning where another arrives within one decode; it never loads on a plain visit, nor for a link to the shared slot that carries no segment.

The same module loads for the community levels, when their fold is first opened or once the map has drawn where the fold was left open, and with the data where the link names one of them, `#COMMUNITY/17/...`, which waits for the index as a carried level waits for its decode; a module that could not be fetched is said in the fold and fetched again at its next opening.

### The ball's motion

`js/play/ball.js` is the ball's motion, pure and testable without a page, one game frame at a time by the executable's rules, in two halves a caller may come between, the pad read into the ball's requests and the frame run from them.

The frame run clears the last frame's landing as it begins.

The frame run says, on a landing on a block, the speed the ball came down at along the normal, which a landing on a platform leaves unsaid.

The frame run holds the ball's state, its move and its landings still while the ball is frozen, a ramp, the look and the spin going on.

The frame run drops a ball at rest, or one rolling between the roll's bounds, where its last read of the cells found no block under it, which is the frame after the block has gone.

The frame run rolls on over an edge beside a neighbour where the probe says the block under is slick.

The frame run holds a rolling ball on a block its last read found brittle short of its free edge, the forward request and the speed dropped from the table's progress and the centre set back from its further mark.

The frame run comes down on a platform's body before a block where the probe names one a block under its centre, riding it, its position kept relative to the platform and the platform's own blocks all the probe calls solid while it rides, so that it never drops off one, and leaves the platform by the forward jump or the hop alone, its position in the level again and the hop's end standing it by the lattice as it stands.

The frame run throws a jump back as off a wall from the wall's progress where a way a caller set differs from its heading and clears the way where it lies along.

The frame run reads a skip the table has none of as no skip, the arc's count falling to nothing by one, and a hop's fall start the table has none of as the last frame's change along the normal, the height of the row the hop reached less the row before it, as the game reads their absence.

The frame run leaves a lost ball where it fell, saying so.

The frame run tells the probe the ball between its state and its move step, where the game reads the cells about it.

A caller may place the ball at rest on any face, its ramp and its look gone, and it keeps the body's turn as a rotation of its own in the world, turned about the side by the spin and straightened each frame, which a turn in place, a wall and an edge leave where it stands while the frame turns under it, the edge's arc turning it a frame behind, and which placing lays aligned again.

### The level as play holds it

`js/play/world.js` is the level as play holds it, pure as well, the lattice's words and kinds by cell, the faces' types, where each pickup stands with its points and the angles the draw gives it, the devices, the crumbling blocks, the platforms, the blocks a level with no key counts, what travels and the dice, laid once from the level and its index.

`js/play/world.js` is the probe the ball's rules ask of it, which answers the lattice as the last frame's step left it, the one the frame drawn before showed, as the game's read of the cells about the ball does, a vanishing block there on the frame after each it is drawn there, a block that has gone never and a platform's body where the platform stands now, its home cell empty while it is away, and names the platform whose body fills a cell with how far it has carried it and what the ball stands on by the game's own word.

`js/play/world.js` is what the ball has taken and marked, each mark with the frame it is first drawn on, the blocks breaking up with the size of each, and the blocks that have gone.

`js/play/world.js` is the index the frame draws, the level's own index less what is taken and the blocks gone with what stood on them, carrying the marked blocks with their frames and the blocks breaking up with the size of each as it stands, and, until the level's outcome stands, less the starts, whose ball the ball on the level is, the start the game takes leaving the clock's own marker where it stands on one.

### The game's frame

`js/play/rules.js` is the game's frame over the ball's motion and the level as play holds it, pure too, one game frame in the order the executable runs it:

- The screen's shake stepped, which the game's loop draws before the level's routine, and which is all the frame runs once the outcome stands, the draw's part going on in the ending's view.
- The level's clock.
- The guard a level that follows an ending opens with.
- The wait that holds the pad off and clears the ball's requests.
- The pad read, a press a key held now and not on the frame before, whose word is kept whether or not that frame read the pad, as the game's loop keeps it.
- The walkers stepped.
- What is under the ball on the ground, the block a level with no key marks or the exit the ball leaves by with no key left.
- The pills' words run down.
- The devices under the ball and a riding ball's travel taken afresh from its platform's travel.
- The ball run, reading what it stands on where the game does.
- The screen's shake started by a block landing at the fall's top speed, with the ball's `fall.shake`, along the screen's y axis alone.
- The ball's contact with what stands about it.
- The endings, with a run's start, its start again after an ending and the return of a lost ball, the game carried through the start again.

The module has every count and threshold read from the motion table, the clock's fill from the rules of the disc shown, and no wall clock in it, so a run of pad words replays frame for frame.

`js/play/contact.js` is that contact, pure too, the walk over the cells about the ball that takes a pickup within reach of its centre, each type by its own case, the key count, the last key's opening of the exits and the hourglass's turn of the clock by the disc's rules among them.

`js/play/hazards.js` is what that routine runs under and about the ball, pure too:

- What harms it, a lit beam in its own cell by the last frame's read of the cells about it, on the ground or in the air, fire under it on the ground, heating it a frame and by the landing's measure on the frame after a landing, and cooling off fire, acid on the ground, the spikes, and the moving spikes on the frames the table says their flag held the deadly value, read as the game's hazards read it, what the last frame's step left, each death the countdown the game sets, with its ending and its wait, the ball frozen and marked where the game freezes and marks it and its speeds dropped where the game drops them, refused while a wait runs or the invincibility pill stands, with the burning ball's swell and the acid's melt growing in the wait's slot.
- The arrow under the ball, on the ground or in the air, whose way is laid from its facing as the start's heading is and which drops the forward request where the ball's heading differs from it, the strip told where the ball is at rest, the way standing for the jump's wall test while the ball is in the air over an arrow and cleared on the ground.
- Ice under the ball, which makes the forward request and drops a turn's request on every frame and on the ground cools the heat by the chill and grows the cold, set back past its top, the cold waning off ice.
- The crumbling block under the ball on the ground, scored while its word is whole and written broken on every frame, and the frame's last part, where the game's draw runs the crumbling blocks, which breaks a broken block, starting the screen's shake afresh with the table's figures, shrinks a breaking one a frame, keeping its size for the frame to draw it at, and empties its cell as the size goes negative, so that nothing stands or rolls on it and the frame draws it no longer.
- The captivators' hit test that follows the routine every frame the pill does not stand, over each walker where the rules have stepped it and each other entry where the loader stands it, the corkscrew's point risen with its bounce as the frame draws it, a ball rolling under it while it is up and a jump over it caught then, from the ball's position words as they stand, so that a ball riding a platform is caught by nothing, as in the game, which catches the ball over any countdown but its own countdown, the captivators standing while it stands.
- The switch thrown as the ball comes within the table's band of its middle along and across, which turns its circuit over through the map's own presses as the panel's button does.
- The teleporter that is on counting its frames while the ball stands within its band, the wait held and the ball's requests cleared, and then placing the ball at rest on the face its slot names, facing as that teleporter does.
- The marker that keeps a device from acting twice in one visit, cleared where the ball has left the middle by more than the table's reach, read between the ball's state and its move step where the game reads it.

`js/play/game.js` is the game's words, pure too: the mode a level is played in and where it stands in the game's count, the run's total and its fruit, settled on the frame an ending stands, whether the disc's end screen calls the ending perfect, the slot the game loads next, and the Simon rooms' match, its rounds, its two players' turns and points, the room it goes on to and the moves the rooms read from the pad, pack and hold to the sequence.

`js/play/passes.js` is the draw's passes, pure too: the lethargy pill's screen, its mode moved on and its fade stepped as each pass ends, the effects' rows, each burst a pickup or the teleporter starts drawing the row of its frame count and a world effect's light in the colour its particles sum to, the flash a send and a level with no key start, waning by its step as each pass ends, the blanks the frame loop waits before a pass while the pill's screen or the teleport's flash stands, the view's roll by the pill's word, the invincible ball's glow by its counter, and whether every invisible block is seen, while the sunglasses' word stands and in the on spells of their blink.

The screen's shake is among its words too, which a break and the thud landing start with the table's figures, its timer losing one a frame and its shift along each axis of its mask drawn from the game's dice, the draw less the magnitude times the timer over the frames added to the display's origin, the sum clamped at nothing and the origin taken off again, let go as the timer passes nothing.

### Pad words

`js/play/drive.js` gives pad words per frame, pure too:

- The keys as they are pressed, each press down on a frame of its own and read up for a frame first where the frame before had its key down, so that no two presses read as one key held on, a key down as a frame that does not read the pad runs sampled by that frame as the game's loop samples the pad on every frame, so that it is no press when the pad is read again, and a key tapped over such frames, which the game never sees, kept for the first that reads the pad, one a key.
- A planned route followed, which reads the ball's block, face and heading off the ball each frame and, with the ball at rest and no turn asked or running, asks the turn the route's next step wants, by the shorter way, or the roll, which it holds while the ball rolls and the step on from the station it has come to is a roll the way it heads, so the ball rests only where the route turns, leaps or ends, and is done at the route's end, at a leap, which no roll follows, a roll the lattice as it stands no longer allows counting as one, as the planner draws it, read through the probe the rules ask of the level, or where the ball stands on none of the route's stations.
- A recording replayed.
- The recorder that keeps a recording, run-length coded.

### The ball on the map

`js/play/play.js` stands the ball on the map as one of the frame's travellers, built by `js/play/traveller.js`:

- It steps the game's frames from the frame's under hook by the wall clock, each through the rules with the pad as the keys give it, the words of a driver following the planner's route, read through an export of its chrome, added to it while one runs and the driver let go on an arrow, Space or a press of the pad, the level running while the ball rests with Motion on and only while the ball moves, a key is held or a driver runs without it.
- It parks the panel's presses with the view and gives the level its circuits as the game loads them while the ball is on it, and as it leaves, where the level shown is the one they were parked on, gives the presses back, and the view with them unless choosing a level, opening a link or a click on the name a teleporter's panel gives for where it leads is what leaves play.
- Where a click on the name a teleporter's panel gives for where it leads leaves play, it centres the view there as it leaves, since the click's find is drawn before play hears of it, with the view still following the ball, and writes the history entry the find opened at once, which the find wrote with the view from before play.
- It draws the ball, its dust and the view's target where a platform has carried it.
- It jolts the picture by the game's shake, through the shift it hands the frame, as a crumbling block breaks under the ball and as the ball lands from the fall's top speed, the hit test following the picture.
- It shows the cause of a death in red on the strip while its countdown runs.
- It asks for the next frame through the frame hook while the level runs, the ending's view turns or something moves.
- It fills the panel through `onShow`.
- It ends editing through an event the editor listens to.
- It draws, behind a switch of Settings, the dust of `js/play/dust.js`, born over a block and drawn in its cell hook, on by default and neither born nor kept while its switch is off, `js/play/dust.js` checking the switch itself as it is asked for dust.
- It draws the game's bursts through `js/play/effects.js` in the frame hook, before the pill's screen, from the rows the rules resolved, each particle a sprite of the sheet on a square turned by its angle and added to the frame, a world effect's particles where the camera puts its place and the teleporter's particles at its point of the game's screen scaled to the canvas, the sheet fetched as the first burst needs it, which casts a world effect's light on the faces about the pickup through `lightsWith` in the colour the rules summed.

### The ball as the frame draws it

`js/play/traveller.js` is the ball as the frame draws it, pure too: the ball as one of the frame's travellers, keyed as nothing on the level is and handed the body's turn relative to the axes the frame lays it on, what the frame draws at and with while the ball is on the map, the ball's tint, the start the game takes and the ball as it last stood, which Motion off draws, each reaching the map through a seam `js/play/play.js` registers.

- It hands the frame play's own clock, the frame the rules last ran, which is the one the game's frame draws after its step, the level's index less what the ball has taken and less the hidden exits while a key remains, the walkers as the rules stepped them and whether every invisible block is seen through `runWith`, so the phases, the lights and what travels draw as the game's frame draws them, a taken thing is neither drawn nor picked and the face it stood on is painted bare, and while the sunglasses last, and in the on spells of their blink, the blocks light no invisible face and every one keeps the look the map draws it in out of the light.
- It hands the frame the shake's shift of the scene, the words' offset in the game's screen pixels scaled to the canvas by the lesser of the canvas's width over the game's screen's and its height over it and rounded to whole pixels, as the game's display jolts, right and down where its origin rests at nothing and up as well on the PAL disc, and nothing with Motion off, when the words run and the picture stands still.
- It tints the ball through the traveller's tint by its heat, its melt and its cold as the game tints the ball's light, each into its own channel and off the other two, raises it red, green and blue in turn by the game's counter while the invincibility pill's word stands, the counter stepping on each frame the ball is drawn under the pill and kept for the page's life as the game keeps it, and flashes it between white and black by the game's own angle while it is marked dying.
- It lends the things on the blocks the live ball's point in place of the starts' points.
- It says through `tipWith` in `js/viewer/chrome/interaction.js` and the panel's `onShow` that a thing the level as installed still lists is taken.

### The camera behind the ball

`js/play/eye.js` is the camera behind the ball and the ending's eye, pure too: the view framed behind the ball as drawn in the height the strip leaves free and drawn after it as it moves, the ball's frame pitched down while it falls and rolled about the line of sight while the lethargy pill works, the ending's eye swinging about the level's middle by the game's own angles, and the ease that brings the view round behind the ball as play opens or a level starts again and back to where it stood as play leaves, each written into the camera's frame, orbit and target, with the level, the ball as drawn, the free height and the clock handed in by `js/play/play.js`, which registers the framing in the fit's place.

- Once the level has ended, by its clock, the ball lost off the lattice, a death, the exit or the last block of a level with no key, it shows no ball, reads no key, lets the camera's frame go and turns the view about the level's middle by the game's own angles, the yaw by the third of the three, which the game turns about the lattice's upright, and the pitch by the first, which it turns about the view's own across, the second, whose axis the orbit has not, left out, and with the zoom standing in for the game's eye, since the orbit has none, the eye standing the level's radius and the table's offset off the middle and swinging its reach nearer and further by turns, and the zoom following how large the level would look from it, for the length of one swing of an arcade level's eye, whichever figures the level's own eye swings by, or until Space, Enter or a tap of the pad starts the level again, the view easing back behind the ball.
- It takes the camera through the frame, the anchored target and the parked view in `js/viewer/state.js` and frames it in the fit's place through `js/viewer/chrome/navigate.js`.
- Each frame of the ending's view steps the screen's shake, breaks the crumbling blocks on and steps the screen's words, as the game's loop and its draw run them on through an ending, so a block breaking as the level ends shrinks and goes on the frames it would have, its fall handed to the page as an event.

### The pill's screen

`js/play/screen.js` is the pill's screen and the flash on the canvas, painted in the frame hook over the game's bursts: the flash of white on the pill's own pass, the frame last drawn as a ghost at half strength over the scene on each pass the pill works and on the end's pass, and a white glow at the fade's level on each pass after, the frame drawn kept, tinted by the table's colour over its grey, for the next pass's ghost, on a canvas made as the first is kept and let go as the screen is off, and the flash's quad, white added over everything at the strength the pass left, a byte a channel, on every frame it stands above nothing with Motion on, the words running and nothing drawn with it off, with the run, whether a pass ran since the frame hook last drew and whether the pass last run took the pill handed in by `js/play/play.js`.

The frame kept for the ghost was drawn under the shake's shift of its own frame, so the ghost is laid back by that shift under the frame's own and stays on the scene, as the game's frame before does under the display's offset now.

### Play's chrome

`js/play/strip.js` is play's chrome, the strip, the HUD, the pad, the keys and the live region: the strip's line, the ball's block, face and heading or that the level has ended, and its status, a notice, the route's word or the verdict, in red while a death's countdown runs, the HUD's title, the level's as the level line names it with the disc's word where the disc shown is not the US one, and the HUD's figures, each written only where it changed, with the key drawn as the legend draws it where keys are counted.

Beside those stand Keep and Follow as the route stands, the pad, shown on a touch screen until its button puts it away, `p`, the arrow keys, Space, Enter and Esc, read into the keys the frame samples or passed to the handlers it is wired with, Forgive's flag, the height the strip takes from the map for the camera's framing, and the sentences the live region is told, one an animation frame, those a game frame says held until the frame is done so that only its last is heard, with the live level handed in by `js/play/play.js`, which wires it once with its handlers.

- It shows the clock, the keys or the blocks left and the points in the HUD.

### The way the ball has come

`js/play/route.js` is the way the ball has come and the planner handshake: the stops the ball has come to, each joined to the one before by the roll or the jump that reaches it or by a leap where the ball was sent or put back, the last two stations it rested on, where following the planner's route begins, the stop the ball stands on short of the last or the first, which the ball is put on, the driver set on the route and let go, and the way handed to the planner as the route, with the live level handed in by `js/play/play.js`, which puts the ball on the first stop, says that it follows and wires Keep and Follow to it.

- It makes a leap of the way the ball has come where the ball is sent.
- It keeps the last two stations the ball rested on, so with Forgive pressed the ball is put back where it last rested or on the rest before where it died standing there.
- It hands the walk to the planner through an export of its chrome that takes a route where none stands or where the one standing is the last it took, so the route grows under the ball as the walk is handed over again at each station.

### What the game's events do on the map

`js/play/events.js` is the game's events as play answers them: the thing taken said and the panel brought up to date, the switch thrown and the boost button's launch with dust at the ball's foot, the crumbling block's break with dust each time and said the first and its fall with dust where it stood and the panel cleared where it showed it, the teleporter's send with a leap of the way and the view cut to its far end, the stop the ball comes to said with what happened on the way, the ending, with the run's points settled or the match's point given and the level the game loads next picked as the game's loop does them, the view let go and the verdict on the strip, and a death forgiven with the ball put back at rest, with the live level handed in by `js/play/play.js`, which steps the frames the events come from and lets the keys go and counts the clock afresh as the level ends or starts over.

It starts the level over, or goes on to the next by its slot, the level of the release shown at the pack and the index the game picked, through the viewer's funnel with play kept on.

- It bursts dust where the ball throws a switch, under the ball as a crumbling block breaks, where a block has gone, clearing the panel where it showed that block, and at a boost button's launch.
- It cuts the view to a teleport's far end rather than easing after the ball.
- It says on the strip that the ball rides a platform while it does.
- It says the cause of a death as its countdown starts.
- With Forgive pressed it puts the ball back at rest instead and says what would have happened.

### What play says

`js/play/phrases.js` is what play says, pure too: every sentence the strip, the HUD and the live region say, composed from what each names, the level's title, the ball's block, face and heading, the run's words, the thing or the circuit at hand, the table's words and the disc's rules for the seconds the clock shows, and nothing of the page.

- The stop the ball comes to, its block and face, with what happened on the way to it, which a sentence of its own said mid-roll would lose to the stop's within the frame, and the face that is underfoot after a turn round an edge.
- What happens on the way: the thing taken with its points, the switch thrown with its circuit, the hourglass's turn of the clock, the crumbling block's break and its fall, the last key's opening of the exits, the boost button's launch, the platform the ball rides, the teleporter sending the ball and where it is sent, the sunglasses wearing off and the arrow that refuses the roll.
- Where the ball stands and which way it faces, as play opens, as the ball is put on a face and as the level starts again or the next is gone on to, the strip's line while the ball is on the map, and what leaving says.
- The route's words: the ball following it, the pad named while it shows, the ball put on its first stop, why the route is done, the way the ball has come kept as the route, and a route that already stands.
- The cause of a death, read from the words' ending while its countdown runs, and what Forgive spared the ball.
- The verdict: how the level ended, the end screen's word for the ending or the map's for a way out, on the Japanese disc with that disc's 大変良くできました Perfect! after the map's sentence where its end screen shows it, a room's with whether the round is done or lost and whose point it is, the points and the seconds left, what the ending did to the run's total, the penalty taken or the points banked, the total and the game's word where the total has gone below nothing, or that a won match starts afresh, and what a key goes on to, the level the game loads next or this one again, the pad named while it shows.
- The HUD's figures: the time as the game's HUD counts it, one more than the whole seconds the clock holds by the disc's rules, the keys or the blocks left with the title that says which, the points, and in a Simon room the round and its moves, with the match's turn and points where a match is on, else the run's total where a run is on.

### The compass's canvas

Beside the frame, `js/viewer/draw/compass.js` paints the compass on a canvas of its own: a block in the camera's own projection whose faces take the shades the level's faces do, so it turns exactly as the level does. Every frame drawn asks for it, and it paints again only when the turn, its frame, the world or the textures have changed.

### The camera, the depth and the light

The camera is a plain orbit: a yaw and a pitch give three unit vectors, and every point is projected orthographically onto two of them with the third as depth.

A module may hand `js/viewer/state.js` a frame, a rotation in world coordinates, and the three are then turned about it, so the yaw and pitch count from the frame's axes rather than the world's axes and the compass turns with them; and a module may park the camera, the target, the framing and the slice as they were and frame the view in the fit's place through `fitWith` in `js/viewer/chrome/navigate.js`, so that `f`, the button and a resize go through it, the button is dim while it holds the view, and a link written meanwhile carries the parked view rather than the one on screen.

Cubes are drawn back to front by that depth, which is exact for equal cubes on a lattice, and a face is drawn only when its outward normal turns toward the camera and no block the game hides that face behind stands against it.

A face toward a block the index holds as breaking up is drawn all the same, the game making the faces toward a breaking block active at the break, a platform's apart, and a breaking block's own faces are drawn whole as it shrinks about its middle, hidden by no neighbour.

Lighting comes from a fixed direction in the world rather than from the screen, so a face keeps its brightness as the view turns and the solid goes on reading as solid.
