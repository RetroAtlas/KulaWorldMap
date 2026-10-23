# The viewer

What the map under `public/` does for whoever is looking at it, control by control, and how it is built.

The readings it draws are in [level-format.md](level-format.md), [tgi.md](tgi.md), [ggi.md](ggi.md) and [motion.md](motion.md), the game's camera, at a level's start, in play and at an ending, in [camera.md](camera.md), and the names it shows in [annotations.md](annotations.md).

What Your levels and the editor keep, read and write is specified in [editor.md](editor.md), and what the disc holds for a level written back onto it is set out in [disc.md](disc.md).

## Turning, panning and zooming

**Drag to turn the level.** A lattice has no side that is the right one to look from, so dragging orbits the camera around it rather than sliding the view: left and right swing around, up and down raise and lower the eye between looking along the floor and looking straight down. `q` and `e` snap the swing to 45°.

A level opens framed to fit the window and keeps fitting it as the window changes, until you turn, pan or zoom it or go to a find; `f`, or the button at the map's bottom right, frames it again, and the button is dim for as long as the level stays framed.

Once a search has centred the view on a find, dragging turns about the find for as long as it stays selected; `Esc` clears it and the level is back under the hand, with nothing on screen moving until the next drag.

**Pan** with Shift-drag, a right-drag, two fingers, or the arrow keys. If you would rather drag panned all the time, `d` switches a plain drag between panning and turning.

**Zoom** with the wheel, a pinch, or `+` / `-`, anchored wherever the pointer is.

## The slice, the textures and the lines

**Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back, and `h` leaves what the slice takes off on the map, faint.

`t` puts the game's own block textures on and off; with them off, and until a world's textures arrive, the lattice draws in the world's own colour, the mean of the textures its plain blocks wear, which the swatch beside the world in the sidebar shows too.

`b` puts on the lines the map draws over the blocks, none of which the game draws: their edges, the broken outline of a block that is not solidly there, the route a moving platform runs, and a laser's beam while it is switched off.

`g` lays a faint grid under the level's lowest layer.

## The panel

**Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields the record carries, each by its word in the slot and, where what it holds is known, by name. Where a click has another meaning, a right click selects all the same, and on a touch screen so does a long press. `Esc` clears.

A switch's panel has a button that presses it, as the ball would: every laser, teleporter and switch of its colour turns on or off, and what travels finds the beams' cells open or shut, until you leave the level.

The panel of an exit, or of a hidden exit, has one that opens every exit of the level as taking its last key would, and shuts them again, until you leave the level: open, an exit is green and turns faster, the cross on its face is green, and from 19 frames on it casts its light as a device that is on does, and a hidden exit, which the map draws turning slowly all along where the game keeps it out of sight until the last key, turns faster too. A level with no key has no last key to take, and no button.

Where a level has more than one exit, or more than one hidden exit, the button opens them all, as the last key does while the ball is on the level, where the game opens only the last exit and the last hidden exit it loads and marks only the last exit face it builds, which need not be the face of the exit it opens ([motion.md](motion.md)).

A teleporter's panel names the one it sends the ball to, which the map draws an arrow to while it is selected, looping where one stands in front of the other, broken while it is switched off, and a click on the name goes there as a find does, so where three or more share a colour the names lead round their ring.

A teleporter's facing is the way the ball faces as it comes out of it.

The panel folds to its title line with the chevron beside its cross, and stays folded from block to block until it is opened again.

## The legend

The sidebar's "On this level" lists what the level holds, by name and count: the objects first, then the blocks and the faces, which are the kinds of block the level uses and the things that are paint on a face rather than standing on it, fire, ice and the clock among them.

A row with a button hides and shows its kind on the map, and with it everything the kind shows, the light a device casts and the paint it puts on its face included; Shift-click shows that kind alone, and again shows all of them; the heading's reset puts every kind back; a kind of block's row only counts.

## The compass

The block at the map's bottom right is a compass, turned as the level is and shaded as the map shades a face, with the textures or without, so the brightest side on it is the brightest on the level.

It names each face turned to you on the block, a side by the way it faces (`+x`, `-y`) and the top and the underside by name, and beyond the block, where each way points, every way it leaves unnamed, faint where the way points away from you: `-z` is up and `+z` down, since `z` counts downward. These are the words the panel and the search use, for the side a thing stands on (`on the +x side`) and the way it faces (`facing=-y`).

## The objects

`m` switches the objects between the game's own meshes and markers, a diamond with its type number off the face it stands on, and `o` hides them, and with them the shadow the game paints into the face under a pickup; what a device, an exit or the clock paints on its face stays. The level's settings have no mesh, so among the meshes their marker shows only on the selected block.

A thing on a face turned away from you is hidden by its own block wherever the block covers it, as in play, and `x` shows what the blocks cover faintly through them; what stands on the selected block always shows through.

`l` labels each object by its name, and `n` adds the face it stands on.

## What moves

What moves in play moves here, as the game moves it:

- The platforms, the stars, the wheel and the wandering ball travel.
- What stands in place turns, bobs, tilts and breathes.
- The spikes, the vanishing blocks, the fire and the beams run their cycles.
- A gem's facets flash white and fade back a few at a time, the same facets on every gem of its colour.
- A teleporter or a switch that is on, or an exit opened from the panel, casts a light of its colour over the faces round it and brightens with it, on and off every third of a second.
- A boost button sinks under the ball, the pointer and the selection, beside which an invisible block lights up as it does beside the ball, or on the few levels that show them from afar, fades away.

`v` switches Motion off and holds the level still, every thing where and as the level starts it, except that the moving spikes stand up, a vanishing block shows as it does when it starts to go, there and seen through, and a beam and an invisible block shine at their brightest, the invisible block unlit. Switching it on again starts the level afresh. A system set to reduce motion opens the map with it off.

## The switches and Settings

A switch that does something only while another is on is greyed while that one is off, and keeps its tick for when it comes back: the models, seeing through the blocks and the labels need the objects on, the face in the labels needs the labels, and dimming what the slice hides needs the slice lowered. Its key, or a click or tap on it, then leaves it as it is and says for a moment at the foot of the map what it needs.

The gear at the top of the sidebar, or `Shift-s`, opens Settings, for the switches used less, their keys working from the map as the others do and in the panel itself. The Display's reset leaves them as they are.

Among them, `c` draws where the game's camera comes to rest at the level's start, behind the ball and above it, and the wedge it sees ([camera.md](camera.md)), and the compass at the map's bottom right can be put away.

Under Play, the golden dust the ball leaves, the map's and not the game's, can be put away, and a block's panel can be given Play from here, off by default so that the map opens as a map, which stands the ball on the face you clicked and plays from there, and the ball can be given the game's own run with Play on through the levels, off by default so that a level plays on its own, which banks a done level's points into a total as the game does, takes a death's cost from it, goes on from a way out to the level the game loads next and plays the Simon rooms as the game's match between two players, as Rolling the ball below says.

`s` shows and hides the sidebar itself.

`?` opens the list of the keys and gestures, in sections by what they are for.

In the list and in the buttons' tooltips the map names Ctrl and Alt as the keyboard in front of you does, Cmd and Option on an Apple one, and takes Ctrl and Cmd alike in the chords it lists.

## Search

**Search** with `/` for a level (`level 42`, `bonus`, `final 7`), a world (`inca`), a cell (`17,12,17`), an object by name or type (`key`, `type 34`), or a block by the name or number of its kind (`ice block`, `kind=2`), where `block` alone finds every block named for its kind and none of the plain ones.

A search for objects or blocks lists every one the game places, this level's first, then the rest of its world's, then the other worlds'; Enter or a click goes to one and selects it, and the list stays for the next. The cross in the box clears it, as `Esc` does.

A space means every term must match and a comma or `or` means any (`coin, key`), and a field is searched as `name=value` (`starts=off`, `facing=+x`, or `type 34 f10=2` for the raw fields the panel shows).

The bar under the box narrows a search to the world or the level in hand, or, by level, lists the levels that hold the thing with the one holding most of it first.

## The level line and the order of the levels

The line at the top of the map names the level and counts what it holds, with the level's note under it where there is one.

While the ball is on the level a HUD stands in the line's place, naming the level and showing the clock, the points and the keys, as Rolling the ball below says, and the line is back when play is left.

A click or a tap on the line folds the note away and back, a dot on the line saying there is one, and the map keeps it as it was left, from level to level and from one visit to the next.

On a level of your own the note is the level's overview instead, editing or not: how it plays, as an arcade level with a key or a bonus level without, hidden or not, in the sentence the Level card also says, the chip spreading to the map's width on a phone so that it takes fewer rows; and, under one line that counts the errors and the warnings and says the counts are below it, its counts against the room the game has, every one that could be counted, those at nought dimmed, red where one is over it and amber where it is more than any level on the disc, and everything the checks find, errors first, each at a cell a click on it selects, so the panel is right there, a fold that stands open where the sidebar has a column of its own and closed on a phone, where the sidebar overlays the map, until it is opened, and then stays as it was last left, from draft to draft, for the rest of the visit.

It is brought up to date at every change, a link that holds the focus keeping it, and folds as any note does.

One finding is the map's own rather than the file's: where a key, a coin or anything else the ball takes stands where no roll from the start reaches it, over the blocks alone as the planner reckons a route, the note names each with the face and the block it stands on, the keys first, a face that looks into another block left to the checks, and says that a jump, a teleporter, a platform, ice and a fall are not counted.

The sidebar lists a world's levels in the order of its pack, then its two finals, then the Simon room the game's Simon mode plays in it on its first round, and `[` and `]` step to the previous and next level in that order, on from a world's last level to the next world's first and back, and stop at the first level of the first world and the last of the last.

While the ball is on the level with Play on through the levels on in Settings, a way out moves the line on to the level the game loads next, and in the Simon rooms a failed round to the room the game loads next, as Rolling the ball below says.

## Your levels

The sidebar's "Your levels", after the worlds, lists the levels of your own this browser holds, folded under its heading as the worlds are, with how many it holds and a chevron beside the name: the fold is closed on a first visit, opens by itself when a level of your own is made, copied, opened or followed to, and otherwise stays as it was last left, across visits and reloads.

The editor loads only when it is wanted, when a level of your own is made, opened or linked to, or, once the map has drawn its first level, when this browser already holds one, so a plain visit loads none of its code, though the strip's and the palette's markup and the editor's styles are in every page, hidden until they are wanted.

`new` makes a level of one plain block and a start in the world on screen and opens it editing, and `copy this level` makes one out of the level on screen, a shipped level as the game loads it or a copy of a draft, and opens it as it is; either is a draft at once, marked "Draft" on the level line and shown on the map as the game would load it.

A level of your own marked a Simon room is shown as the game shows the rooms, with its world's artwork and not the bonus artwork a level with no key wears, and the ball plays it as one, as Rolling the ball below says; a key on it makes it an arcade level all the same, since the game decides that from the keys.

A row shows a draft, with "not saved to a file" and, once there have been changes, how many, undo taking one away and redo giving it back and a typed title counting once; choosing one shows it, as choosing a level does, and a link to it (`#DRAFT/3/...`) opens it on the device that holds it, pasted into the address bar as well as followed at the start, and anywhere else gives way to the view on screen, saying once that the level is kept in another browser.

Where this browser holds levels of its own that could not be read, a row under the drafts counts them and offers to remove them, which asks to be pressed again; they are otherwise kept as they are, and said once, the first time a tab finds them, rather than at every reload.

For the shown draft a Level card edits its title, up to eighty characters, its world, the time its clock starts at, any number of seconds from 1 to 32767, rounded to whole seconds, which says so when it keeps the old value, and whether it plays as a hidden level or shows invisible blocks from afar, each change redrawing the map with the view, the slice, the hidden kinds, the selection, the clock and the switch presses kept; a Plays as choice above Hidden level lets a level with no key play as a bonus level or as a Simon room, one step undo takes back, and shows a level with a key as an arcade level with no choice, since the game decides that from the keys, its tip saying so and that taking every key away opens the choice.

Under those, Circuits lists the four colours, each with its swatch, whether it starts on or off, which its button turns over as one step undo takes back, and how many switches, teleporters and lasers of it the level has, or that it has none, so a colour's starting state is set beside the level's other settings, each row a group named Circuit, as the panel's is, and each button named for a reader by its colour, "green circuit", with whether it starts on in whether it is pressed, since "starts on" is the state and not the name, and the swatch there for the eye alone.

The card announces none of its changes to the level's settings, where the panel does, so a change made from it clears what the panel last said.

Under the settings the card says how the level plays, as the level line's note does, and, when the checks find errors, how many and that the level line's note lists them.

The card offers `duplicate` and `delete`, which asks to be pressed again, each saying what it did and which level is then on screen.

The card's `save as .json` writes the draft as the map's own file and `save as .kwl` as the file the game loads, each named after the title, after which the row reads "saved to a file" and counts the changes since, with a dot on the save button while there are any; `open a file…` in the row above takes either back, or a level file from elsewhere, read for what it holds rather than by its name, opens it as a new draft and says what it had to repair, or that it has notes on what it read where it repaired nothing.

`open a file…` also takes a pack of the game's, which asks which of its levels to open and opens it in the world on screen, since a pack does not say which world it is from, a disc image, which asks for the pack and the level and opens it in the world the map lists the level that lies there under, named as the pause screen names it, and in the pack's own world where none of the game's lies there, and a level saved by the community's level viewer, read in the world on screen; declining the question opens nothing.

`paste a link…` in the same row opens a box for the link to a level shared from the community's level viewer, which opens as a new draft in the world on screen, or in the world the link names where that is one of the ten; a text that is no such link is said so under the field, which stays for another try.

Your levels stay in this browser, written a moment after each change, with "Saved in this browser" shown for a moment on the card, until they are saved to a file; a browser that cannot keep them, one that gives the map no room for them, one with no room for more, or one that refuses to keep them for another reason, says so.

### Put it on the disc

A draft goes onto the disc from its Level card, which opens "Put it on the disc", three steps in one box, and the box takes several of your levels as one patch.

The levels: a row for each, the draft the box was opened for first, and under the rows `add a level…`, which lists the other levels this browser holds by title and adds a row for the one chosen, with `a file…` last, and `take all out`; each row has `take out`, and with no rows the box says to add a level and offers no download.

`a file…` takes what the sidebar's `open a file…` takes, a level file of the map's or the game's, a pack or a disc image, or a level saved by the community's level viewer, and opens it as a new level of your own, listed under Your levels as saved to a file, with what the reader had to repair said once, as the sidebar says it; a pack or a disc image asks which level to take as it does there, in the box's place, and the box comes back once the question is answered or declined.

The new level's row takes the slot its file names, else the slot its title names, else the slot its copy came from, else the first slot no other row takes, a Simon room's where the level plays as one, and the map stays on the level it showed.

A row shows the level's title, how it plays, and what the checks find, the errors listed with the sentence that a level with errors cannot go on the disc until they are fixed, the warnings folded away, and a level the checks pass said to have no warnings.

A row shows its slot, one of any of the ten worlds' packs or their finals packs, or one of the ten Simon rooms', named as the pause screen names the level there and grouped by world, the Simon rooms last as a group of their own, with whose place the level takes and how the game reaches it, a new game starting at the first slot, the rest of a world's slots taking a save that has got that far, the finals coming once the arcade is finished and a room being the one Simon mode plays in its world on its first round, and a note that the level will wear that world's artwork where it is not the draft's own.

Where the level and its slot disagree on how it plays, the row says so under that: a level that is not a Simon room in a room's slot is played in Simon mode there, and a Simon room in any other slot as a bonus level there, since the game decides by where a level lies.

The choice stays with the draft and in its file, a draft that has made none offered the slot its title names, the level whose title stands in it or the level its first number counts to, a bonus, final or hidden level or a Simon room where that word stands before the number, else the slot its copy came from, else the first slot no other row takes, a Simon room's where the level plays as one, and never a slot another row has.

A row shows its fit, whether the level fits the slot's own bytes, needs the pack rebuilt, with its other levels packed tighter where that is what makes room, or moves the pack into the disc's free sectors, with the bytes to spare, each level fitted after the rows above it, so two levels in one pack are fitted together, worked out from the disc as pressed until the image is given and read from the image after, and from the disc as pressed again while the rows cannot be placed as they stand.

Two rows on one slot are an error under the rows, which names the level whose place they both take and holds the patches back until a slot changes, and the later of the two shows no fit until then.

The disc: the image, dropped onto the box or chosen with the browser's own file control, which names the image chosen or dropped, read in the browser and sent nowhere, anything about it that is not the disc's said as a warning rather than a refusal, and then the downloads, a PPF patch, an xdelta patch, and the patched disc with its cue sheet, each named after the level, or after the first level and how many more there are, the disc saved through the browser's own picker where it has one.

Playing it, which appears once there is a patch: where each emulator wants the patch, DuckStation and PCSX-Redux beside the image under its name, ePSXe and PCSX-ReARMed in their patches folder under the game's serial, how xdelta3 applies the other, and that Mednafen, Beetle and RetroArch take the patched disc instead.

A browser that cannot unpack the game's files says a newer one is needed.

Before any download is offered the plan is read back through the patched disc, each level placed over the disc as the rows above it leave it, the directory, the packs and the slots read as the game reads them and every written sector checked, and the patches are then the stretches where those sectors differ from the image, so a browser that cannot put that disc together is told on the row of the level it cannot place that the level cannot be placed, and gets no patch.

The box follows its drafts while it is open: when another tab's copy of a level arrives, the checks, the fits and the downloads are worked out again, when another tab deletes a level its row goes with a word that the patch goes on without it, and when the last row goes that way the box closes and says so.

The box keeps its levels and the image once it is closed, for as long as the page lives.

Opening it from any level's card adds a row for that level under the others, where no row holds it, and a level deleted while the box was closed is gone from the rows without a word.

`take all out` takes every row out and keeps the image, and the focus goes to `add a level…`.

## The editor

On a draft, `w` or the strip's Edit button turns editing on and off, and on a shipped level `w` makes a copy and opens it editing in one step; choosing a shipped level turns it off, and editing is never in the link, never stored and not a Display switch. Turning editing on turns the Ground grid on with it, so the floor that blocks are laid against is shown. The grid can be turned off while editing, and turning editing off leaves it as it stands.

### The tools

The strip at the map's bottom left holds the tools:

- Place (`a`) lays the brush's block in the cell across the face you click, a plain block until a palette row is pressed.
- Erase (`z`) takes what stands on the face you click, or the block with everything on it where nothing does, a platform or a laser whole.
- Select (`i`) is the viewer's own click, with a rectangle for several blocks at once, below.
- Turn (`r`) turns the selected thing a quarter turn where its kind faces, or else what the next placement will face, Shift-`r` the other way.

Shift-click erases and a right click selects from any tool, and `Esc` clears the selection without leaving the mode.

While Place or Erase is the tool the face under the pointer is washed and outlined, Place stands a dashed ghost in the cell it would fill, red where the click would be refused, and the tip's last line says what it would place and on which side, or that the side holds it already.

With the Ground grid on the grid spans the whole floor under the level, the ghost follows the pointer across it and a click lays a block there, so a first floor has somewhere to land.

While the slice is lowered the grid follows the slice instead, under the topmost layer still shown, and a click lays a block in that layer, so `,` and `.` choose the height a floor is built at, which the strip says the first time the grid is used that way, and a level with no blocks has its grid at the lattice's foot.

The game builds nothing past the edge, a cell cannot be filled twice or across a platform's run or a laser's beam, a face is not given what it holds already, and a level keeps its last block: each refusal is said at the foot of the strip, where it stays until the next change or a change of tool or brush clears it, and changes nothing, a block laid above the slice raises the slice to show it, and what was laid is selected, so the panel is right there.

### Undo and redo

Every step can be taken back: `Ctrl-Z` undoes the last change to the draft on screen and `Ctrl-Shift-Z` takes it again, as the strip's Undo and Redo do, a new step after an undo lets the steps taken back go, a change that leaves the draft as it stands is no step and counts as no change, letters typed into the title within a second of each other join one step, so a pause starts another and a run of them that ends where it began leaves none, and `Delete` or `Backspace` erases what is selected, its object first and then its block, or every block of a selected set.

The steps are this visit's alone, kept for each draft until the page is left, and a form field keeps the browser's own keys.

### Several blocks at once

With Select, a drag that begins on no block draws a rectangle on the screen, and the blocks whose middles lie in it when the mouse is let go are selected together, a platform or a laser whole when any cell of its run is, each outlined, and the strip says how many are selected and what can be done with them; what the slice has taken off stays out of it, and the panel keeps the block last clicked, which a rectangle round nothing clears along with the set.

Dragging one of the set moves it whole: it follows the pointer across the floor at its own height, a cell at a time, or with Shift held as the drag begins it rises and sinks instead, a cell for each cell's height the pointer moves, and the set's ghosts stand where it would land, red where a block would land past the edge or on a block that is not moving, or where the game's rules refuse the result, in which case letting go says why and moves nothing; what stands on the blocks travels with them, the panel's block goes with the set where it is one of them, and the move is one step for undo.

With a set selected, Shift with the arrow keys moves it a cell along the two ground axes nearest the screen's directions, as the compass names them, Shift-PageUp and Shift-PageDown a cell up and down, `Delete` or `Backspace` erases every block of the set in one step, a level keeping its last block, and `Esc` clears the set before anything else it does.

A click on a block selects that block alone and clears the set, as a rectangle round nothing does, changing the tool, leaving editing, or undoing or redoing a step clears it too, and a drag that begins on a block outside the set turns the level as ever, so a set is always begun from empty space.

A set is made with a mouse or a pen: a finger's drag turns the level, so there is no rectangle and no dragging a set by touch, though once a set is made the keys work on it there as anywhere.

### The palette and the brush

The palette floats above the strip while editing, and the strip's Palette button puts it away and brings it back.

Its tabs are the groups a player meets, blocks, what is paint on a face or the ball's start, the devices, the hazards and the pickups, and its rows are every kind of block and every thing the game places, by name and with the legend's icon, a teleporter or a switch of each colour, a coin of each worth and a gem of each colour a row of their own, the fruit as one row since the game shows the player's next fruit whichever is placed, which the map draws by the level's number and a run places by what it has kept, as below, and the one thing the game never names by its number.

The pressed row is the brush: a block makes Place lay that kind, and a thing makes Place put it on the face you click in place of whatever stood there, so the tip's last line names it and its icon stands on the hovered face. Choosing a row makes Place the tool, whichever tool was pressed, so the next click lays what was chosen.

`1` to `9` press the shown group's rows and `j` and `k` step through every row across the groups; Alt-click takes whatever is under the pointer as the brush, the thing on the face with its colour and its facing, or the kind of the block.

A teleporter, a switch, an exit, a hidden exit or moving spikes work on a plain block only, nothing stands on a crumbling or vanishing block's faces, and a face that looks into another block takes nothing: each is said and refused.

Placing a thing of a kind the legend hides brings the kind back.

### Laying a run

A moving platform or a laser is a run, laid in two clicks.

The first sets the run's own block where a block would be laid, against the face you click or on the floor through the grid, and the strip says the run waits for its far end, telling a finger to tap where it ends.

The pointer then previews the run from that block to the cell you hover, or to the grid's cell under the pointer, straight along whichever way it leaves the block by most, the earlier of `x`, `y` and `z` where two tie, every cell tinted where the run may go and red where it may not.

The second click lays it, the far end across the face you click, on the floor through the grid, or, for a laser, on the plain bare block or the other laser's block you click, which a laser may end on.

A run keeps to one line and to the lattice, a platform's run stays empty, a laser's two ends are each empty, a plain bare block or another laser's with nothing between, and a run needs two cells: each refusal is said and lays nothing, and `Esc` cancels a waiting run, as changing the tool or the brush does.

The palette's laser rows come in the four colours and Alt-click on a laser takes its colour; a click with a platform or laser brush on a run's own block takes that block as the first click, whatever the brush's kind or colour, so the second re-lays its run in one step and the run keeps its own kind and colour; Erase on a run's block takes the run whole; and nothing stands on a platform's or a laser's faces.

### The panel's form

While editing, the panel that opens on a selected block of the draft is also its form, standing above the block's own rows, which fold under "Block information" and stay open or folded as they were last left, from block to block.

A row of six buttons, Faces, stands for the block's faces, a dot on each that holds something, the chosen one pressed and a face that looks into another block greyed and saying which; choosing one selects it, as a click on the map does.

Under it the block's kind can be changed, a vanishing block's phase set, a platform's length and speed typed and a laser's colour chosen, the axis and the far end of a run shown as they are, and a run's other cells show the run's own block; what the chosen face holds is a list grouped as the palette is, with nothing at its head, and the thing on it can be faced one of its four ways, under Facing, given its colour, worth or phase, and a teleporter says where it leads.

A face that holds a switch or a teleporter, and a laser's block, show the circuit of their colour in one row: its swatch, whether it starts on or off, which the button turns over, and how many switches, teleporters and lasers share the colour, the row the Level card shows for all four, read as the card's is, the button named by its colour and the swatch for the eye alone.

"Place the brush here" and "Build against this face" lay what a click on that face would, so a level can be built from the keyboard; the Place button is greyed while the face holds what it would place, keeping the focus and saying so when pressed, and with a platform or a laser for the brush there is none, since a run is laid on the map in two clicks.

The panel keeps to the block and its face: how the level plays, its counts and what the checks find are the level line's note, so they are read once rather than on every block.

Every change is one step that undo takes back, a change the game would not forgive is refused and put back, as the tools refuse it, a Length or a Speed that is not a number is put back and says so, an emptied one, or one that rounds to what the block holds, in silence, and the field being worked keeps the focus while the map redraws.

### Touch screens and phones

On a touch screen there is no hover, so Place and Erase take two taps: the first tap on a face marks it as the hover would, with the wash, the ghost or the brush's icon and a line on the strip saying what a second tap does, and the second tap on the same face does it, though a first tap on a face that holds what the brush would put there says so and marks nothing; a tap elsewhere marks that face instead, and a drag or a pinch, which turn and pan and zoom as ever, marks nothing. On a phone the strip keeps a row for that line while editing, so its appearing moves no button under the second tap.

A run takes two such pairs.

A long press selects whatever is under the finger from any tool, as a right click does with a mouse.

On a phone the palette and the panel open as sheets at the foot of the map, one at a time, each with a close button, the strip standing above whichever is open and the map still turning above that; the strip's Palette button opens the palette, which does not open of itself there, and `Esc` or the close button puts a sheet away, `Esc` taking the palette's before it clears the selection, which takes the panel's with it.

What a tap places or clears is selected and outlined as with a mouse, but the panel's sheet stays down, through a change of brush or of mode too, and through every redraw of the draft, a second block, an erase, an undo or a card edit, and the palette's stays as it was, so a floor is built without a sheet to put away at every block; a long press, or a tap with Select, opens the panel.

## Planning a route

`r`, or Route planner among the Display switches, turns the planner on.

While it is on, a click or a tap on a block's face adds a stop there, and the stops are joined by a golden route drawn over the faces, a chevron at every roll but one that runs back over a roll already drawn, that reads from the first stop to the last; the first click on a level that has a start begins the route there, heading the way the ball faces as the level opens, so the route starts where the game does.

A right click, or a long press on a touch screen, opens a block's panel as it does with the planner off.

A stop one roll from the last is joined by that roll; one further off is joined by the shortest way the ball could roll there by the game's own rules for a step, over the faces, up a wall where a block stands ahead, round an edge where one ends and nothing stands beside it, turning at the corners as the ball turns; and where no roll reaches a stop, a dashed leap joins it to the last.

A route can hold a jump as well: with Shift held, a click adds a jump from the last stop instead of a roll, two blocks on along the face it leaves, over a gap or down onto a lower block, drawn as a solid golden arc.

A jump stands where the blocks let the ball jump as the game's jump goes, with the two cells ahead at the ball's height and the three above them empty, and a block two on, or straight below that, to come down on, and where no jump from the last stop comes down on the face clicked, the click is refused and says so.

The route knows the blocks and nothing of what stands on them or of ice, so it runs through a laser's beam and over spikes as readily as over a coin, and what it says is where the blocks let the ball go, not whether the ball would live or how long it would take.

A face that looks into another block, or a moving platform's block, takes no stop and says so, and though the shortest way may run over a platform at rest, the route is not drawn across it.

A click on the last stop takes it back, as Backspace does while nothing is selected, and the strip at the map's bottom left counts the stops, the jumps and the leaps, undoes and redoes the route's changes, from the keyboard too with the keys the editor uses, clears the route, which asks to be pressed again, and copies a link that carries it.

A change is a stop added or taken back, the route cleared, the ball's way kept as the route or a link's route opened over it, and the changes are kept while the level is shown.

On a level of your own the strip stands above the editor's strip, and while editing the editor's tools take the clicks and `r`, the strip keeping only its line that says to leave editing to plan, and on a phone put away until editing ends.

The route is kept with its level in this browser, for levels of your own as well, and it rides in the link, so a link copied with it opens with it wherever it is opened; a link without one leaves the kept route as it is.

The switch itself is not kept from one visit to the next, and a route stays on the map with the switch off.

A level of your own edited under a route keeps the route as it was: a stop whose face no longer stands is a dashed ring and a roll or a jump the blocks no longer allow a dashed leap, so an undo of the edit makes the route whole again.

While the ball is on the level, Follow on the play strip rolls it along the route, as Rolling the ball below says.

## Rolling the ball

`p` or the ball at the map's bottom right stands the ball on the level at its start, where the game puts it, and with Play from a block's panel on in Settings, which it is not until you turn it on, a block's panel has Play from here, which stands the ball on the face you clicked and plays from there; while the ball is on the level the start's own ball is not drawn, so the level shows one ball wherever play began, the start the game takes showing the clock alone where it stands on one, until the level has ended and the ball is gone.

Either way the map takes the ball's view: the camera stands behind the ball and above it, looking the way it faces, with the face it stands on for the floor, and a little to one side so that the blocks keep their depth.

A level with no start stands the ball on the first face it could, and says so.

### The keys, the pad, the strip and the HUD

The arrow keys move the ball, up rolling it onto the next block for as long as it is held and left and right turning it a quarter turn each way, and on a touch screen a pad does the same, a bar for the roll over the two turns at the map's bottom left and the jump, the ball on a round button, at the bottom right, so one thumb can hold the roll while the other taps the jump, and both lie over the view, which keeps the ball clear of the strip alone and does not move as the pad is shown or put away; play asks nothing of Down, as the game's ball asks nothing of it, so down does nothing; the strip at the map's bottom left, under the pad while the pad shows, says which block and face the ball stands on and which way it faces.

On a phone the strip is a bar at the foot of the screen, over the scale bar, its one row of text the ball's block, face and heading, or a notice or a verdict while one stands, with the buttons in one row beneath, the planner's strip standing on the bar where it shows and the pad's two parts and the corner's widgets above them.

While the ball is on the level a HUD at the top of the map takes the level line's place, naming the level and showing the seconds it has left in the middle, the points at its left and the keys still to take at its right, the key drawn as the legend draws it, with the run's total and the Simon rooms' figures in a smaller row under them where they apply; the HUD lies over the view as the pad does, so the ball is framed clear of the strip alone.

### The jump, the fall and the dust

Space jumps the ball two blocks on, from rest with up held or while it rolls, and standing still hops it in place, hop after hop for as long as Space is held; a jump that comes down on a block lands there and rolls on only while up is held, one that comes down on nothing falls straight down, a wall met in the air throws the ball back, and a ball that falls off the level is lost, which ends the level as the clock running out does; the ball's shadow fades as it rises and is gone while nothing is under it.

The ball leaves golden dust behind it, which lifts off the face, settles and fades, until Settings puts the dust away.

### Keep and Follow

Keep on the strip, pressed, hands the way the ball has come to the planner as the level's route, a jump the ball made kept as a jump, and goes on handing it over as the ball goes on, so the route grows under the ball until it is pressed again, the level ends, the route is followed or the route is changed on the planner's side; while another route stands the button is dim, until the route is cleared.

While a route stands, Follow on the strip rolls the ball along it as a player would, from where it stands on the route, or from the first stop, where the ball is put, when it stands nowhere on the route or on its last stop, rolling on through a stop the route runs straight on from and coming to rest only where the route turns, which it does the shorter way, or jumps, jumping where the route jumps and coming to rest where it lands, and the strip says when the ball has reached the route's end, when it has come to a leap, which no roll or jump follows, the dashed leap of a roll or a jump the blocks no longer allow among them, so it stops there, or when it has left the route; an arrow, Space, the pad or the button again takes the ball back at any moment.

### Round an edge and up a wall

Where the block ahead ends and nothing stands beside it the ball rolls round the edge onto the side below, and where a block stands in its way it climbs onto that block's face, and either way the whole level tumbles with it until the face it now stands on is the floor again; the compass turns with it and goes on naming the world's own ways, so it always says where the world's up has gone. Where a block stands beside the edge the ball will not roll off, as in the game.

Where a block comes between you and the ball, as the one it has just climbed from does, the ball shows through it faintly rather than vanishing behind it.

Turning the ball in place turns the view round it, the ball itself keeping the turn it has, as in the game; round an edge it turns with its tumble, and up a wall it keeps its turn while the level turns under it.

The ball rolls at the game's own pace, turns and tumbles over the game's own frames and spins as the game spins it, all read from the game's code as the rest of what moves is.

### What the ball takes

The ball takes what the game's ball takes: a coin, a gem, a key, the sunglasses, a fruit, the hourglass or a pill is gone from its face, its painted shadow with it, as the ball comes within reach of it, in the game's own burst of sparks, which lights the faces about it for a moment.

The hourglass turns the clock round as it does in the game, leaving two minutes less what it had and scoring for each second it leaves.

A pill sets what it sets in the game.

The bouncy pill jumps the ball whenever it is not rolling, in place with up released, two blocks on with up held and three with Space held too.

The lethargy pill slows the level to half pace for as long as it lasts, as the game does and as a teleport does for a moment after it sends the ball, rolling the view from side to side and trailing the picture behind whatever moves, with a flash of white as it is taken and a glow that fades as it wears off, and hurrying the clock meanwhile.

The invincibility pill keeps the ball from being killed while it lasts and runs the ball's light through red, green and blue while it does.

The sunglasses show every invisible block as the game shows them, in the look the map gives one the ball's light does not reach, so for as long as they last no invisible block lights up beside the ball, and as they wear off the invisible blocks beside the ball blink between lit and that look for a few seconds, which the strip says as the blink begins, before the ball's light alone shows them again.

The last key opens the exits, which turn green and faster and cast their light as they do from the panel, and rolling onto an open exit, or landing on one, leaves the level.

On a level with no key, the Simon rooms apart, the HUD counts the blocks still to roll onto instead, every block the ball stands on scoring the first time, the invisible blocks excepted, and taking the game's colour for a block rolled onto, which fades in over half a second as it does in the game and stands at once with Motion off, and the level is done with the last of them; such a level opens from white with Motion on, as the game opens one, the white clearing over its first moment, a level of your own with no key too.

The tip and the panel still list a thing the ball has taken, and say it is taken.

### A run through the levels

By default a level plays on its own: it starts again after any ending, as below, and no total is kept or shown.

With Play on through the levels on in Settings, which it is not until you turn it on, the ball plays a run as the game does, and the HUD shows the run's total on a level of the disc, the game's own count across a run's levels:

- A level that is done banks its points into it.
- A death on an ordinary level costs the level's points and 50 a level of its number, at most 5000, so from LEVEL 100 on every death costs 5000 and the level's points, while a death on a bonus or a hidden level costs nothing and banks nothing, and leaves the level with no points, which a death on a level with no key or on a hidden level does whether or not a run is on, on a level of your own too.

A fruit taken is kept across the run unless the ball dies on an ordinary level, when the fruit taken on it are lost with it, and each level of the run holds the first fruit the run has not kept, as in the game, in place of the one the map draws for it by its number, so a fruit missed comes round again on the next level.

A total below nothing is the game's end, which the verdict says in the game's own word, and the run starts afresh at nothing as the level starts again; a level of your own and the Simon rooms keep no total.

Leaving play ends the run, and so does turning the switch off while the ball is on the level, at the level's next ending, while turning it on begins a run as the ball is next put on a level.

### The devices under the ball

Rolling over a switch throws it as the ball comes near its middle, as in the game, turning every laser and teleporter of its colour on or off as the panel's button does, and not again until the ball has left the switch's middle and come back.

Rolling onto a teleporter that is on holds the ball at its middle for a moment, the keys and the pad reading nothing meanwhile and the strip saying so, and then sets it down at rest on the teleporter it leads to, facing the way that one faces and keeping the turn it had, as in the game, the view cutting there with it rather than tumbling, the screen flashing white, with Motion on, as the ball is sent and clearing over the next moment, the game's own burst playing below the screen's middle from the moment the teleporter takes hold of the ball, and the way the ball has come taking a leap there, which Keep hands on as a route's leap, while a teleporter that is off sends it nowhere, nor does the one it has just arrived on until it has left and come back.

### What harms the ball

What harms the ball in the game harms it here:

- A lit laser beam kills it in the cell it is in, on the ground or in the air.
- A fire block heats it while it stands or rolls on fire, by a jolt more as it lands on one, and burns it once it is hot enough, the heat cooling again off the fire.
- The acid block dissolves it in a moment.
- The spikes kill it at once and the moving spikes while they are up or just about to rise.
- A captivator catches it as it comes within reach, as the catalogue star does in its brown form.

The ball reddens with heat and greens in acid, flashes as the spikes or a captivator take it, and the strip says in red what is killing it while the game's own countdown runs, after which the level has ended as it does when the time runs out, the strip saying how, and starts again the same way, though the ball does not swell as it burns.

Forgive on the strip, off until it is pressed and kept for the visit, undoes each death as it comes: the ball is put back at rest where it last rested, or on the rest before that where it died standing there, a ball that was riding a platform set down in the level where it last rested rather than riding again, the strip says what would have happened, a lost ball comes back the same way, and the clock running out is not forgiven.

### What is under the ball

On ice the ball slides as it does in the game: it rolls on through every block's middle whether or not up is held, cannot be turned, and goes on until the first block that is not ice, where it stops at the middle unless up is held, or until the ice sends it round an edge, up a wall, or off an edge beside a neighbour that would have held it on stone and down into a fall, and Space on ice is the forward jump; the ball's light flickers blue while it slides.

An arrow lets the ball roll off its block the way it points alone: facing any other way the ball will not roll, and the strip says so until it is turned, though it turns in place and hops as before, and a jump that passes over an arrow heading any way but the one it points is thrown back as off a wall.

A crumbling block breaks the moment the ball stands on it, scoring as in the game, and is gone a third of a second later, dropping a ball still on it; a rolling ball crosses one before it goes, and one that stops on it has a moment to roll off, onto a block ahead, up a wall or into a jump, but cannot be rolled round a crumbling block's free edge, which holds it short of the edge until the block goes, as in the game.

A block that has gone is gone from the map, with a burst of dust where it stood, though the game's debris and its shrinking faces are not drawn.

A vanishing block carries the ball while it is there and drops it as it goes, and the ball rolls onto one about to go as readily as onto stone.

A moving platform carries the ball: a ball that comes down on one from a jump or a fall rides it, the strip saying so, and goes where it goes, to and fro along its run, standing on it or rolling along it and round its ends and sides as round a free block, and never falls off it; the platform's blocks are all it can reach while it rides, so it takes nothing and goes round the platform's end rather than onto a block the platform stands against, though a lit beam it is carried through still kills it, and a jump or a hop is the only way off, onto whatever is under it when it comes down.

Rolling onto a platform's block from a neighbour stands the ball on it as on stone, as a hop in place sets a riding ball down on it, and the platform moving off from under it leaves it to fall.

A boost button launches the ball as the game's does: rolled onto one, the ball is taken from the keys, rolls on by itself past the button's middle and leaps three blocks on, higher than a jump, and one that comes down on a button, from a jump, a fall or a hop, leaps from it on the next frame whatever the keys, so buttons three blocks apart send the ball from one to the next; the strip says so and dust rises at the launch, without the game's sounds or the pad's shudder.

### The Simon rooms

A Simon room, one of the game's or a level of your own marked one, is played as the game plays it, one move at a time:

- Up rolls the ball a block at a time, a held up rolling on after a short rest on each block.
- Space held with up jumps the ball two blocks on.
- Left and right turn the ball a quarter turn each for as long as they are held, a turn every few frames at rest.

The HUD counts the round and the moves it asks: the first round asks two moves, after which the strip says Well Done! and the room starts again asking those two moves as they were made and two more, round after round, while a move unlike the one made in the round before ends the room with the game's Wrong Move!, the round lost, and the moves start afresh from the first round, as they do after a fall.

By default a room plays alone that way, and no one scores.

With Play on through the levels on in Settings the rooms play the game's match, two players at one keyboard taking the rounds in turn: the first player makes the first round's two moves, the second repeats them and adds two, and so on, the HUD saying whose turn it is and the two players' points.

A wrong move, or a fall, loses the round and scores a point for the other player, and the room is played again from its first round, the second player opening it this time, before the next room opens for the first player, so each room is played twice over, round the ten rooms; and once the rooms have come round to the first with a player past five points the strip names the winner, Player 1 Won!, Player 2 Won! or Equal Time!, and the match starts afresh with the points at nothing, since the game goes back to its menu there and the map has none.

### The clock and the opening

The level's clock runs from the time the level gives, counting down as the game's does while the ball is on the level; the level opens with the view coming to the ball and the keys live after the game's own short hold, with no fly-in, so it takes no key for its first few frames, and a key tapped before then is kept for the opening's end, while a key held through them is read as held, not pressed, once they are over.

The clock stands while the ball is on a clock face, and through the Simon rooms, as it does in the game.

### The ending

When the time runs out, the ball falls off the level, or the level is done, the level has ended:

- The ball is gone.
- The strip says the level has ended and how, a death or the clock running out in the word the game's end screen shows for it, with the points and the time left, what the ending did to the run's total where a run is on and what the key goes on to.
- The keys and the pad move nothing.
- The view lets go of the ball and turns about the level's middle as the game's does at an ending, the level turning over and the view drawing nearer and further by turns, quicker and wider on a level with no key as the game's is, standing still on a hidden level, where the game's eye does not swing, and swinging the slower way in the Simon rooms, which the game plays as the arcade's whatever a room holds.

The ending lasts until Space, Enter or a tap on the pad, or the time one of the slower swings takes, near six seconds on any level, starts a level again, with the clock full and the view coming round behind the ball, as the game loads a level after an ending: the same level from its start, everything the ball took back on its face and the level's switches as it was loaded with, unless a run is on, with Play on through the levels on in Settings, when a way out goes on instead to the level the game picks, the world's next level, or, once the five fruit are banked, one of its three bonus levels, the first opened by the world's first five levels, the second by the next five levels and the third by the last five levels, and by the hidden exit its hidden level, a bonus or a hidden level going back to the level after the one that led to it, or on to the next world's first level where that was the world's last level, as the last level itself does.

The run's total goes with the ball, and the HUD, the level line and the sidebar follow the level as choosing it would.

A level of your own and a final start again from their own start after every ending, run or no run, as do the last world's last level and the bonus or hidden level it leads to, the game having no world to go on to, and a Simon room with no run on, while with a run on a failed round goes on to the room the match picks, as above.

With Motion off the view cuts to the level and stands, and waits for the key.

A button the keyboard has moved the focus to, as Tab does, keeps Enter and is pressed by it; one a click has left the focus on does not, so Enter goes on from the ending after any button has been clicked.

### The view, leaving play and Motion

Dragging turns the view about the ball, the wheel zooms, and `f` frames the ball again; `Esc` leaves play with the view and the slice as they were before, or with the ball's view where the run has gone on to another level since, choosing another level, opening a link or going to a find leaves play too, keeping the view it goes to, and a link copied while playing opens the level the ball is on with the view the ball was first put down from, since playing is never in the link.

With Motion on the level runs as the game's does while the ball rests, the clock counting down and what moves on the blocks moving; with Motion off the level jumps to its new footing rather than tumbling, the ball from one block's middle to the next, its dust lies still along the way, and the level waits between moves, its clock and what moves on it standing until the ball is driven again.

## Permalinks

The URL is a permalink: `#INCA/11/45,35/0.90/17,17,17/0,0/33` is the level by its pack and its slot in it (LEVEL 42, the numbering the cheat in [level-format.md](level-format.md) takes), the yaw and pitch it is turned to, zoom, the cell it orbits around, the pan away from that cell, and the slice, and after those the selected block where there is one, and a planned route, which rides at the tail as one word the planner reads back and every earlier version of the map passes over.

While the level is framed to fit the window, the link says `fit` in place of the zoom, the cell and the pan (`#INCA/11/45,35/fit/33`), so it opens framed to whatever window it is opened in, as one that stops at the turn does; a link that names the zoom, the cell or the pan holds the view there, and one that names the zoom alone opens at that zoom centred on the blocks, as a fit is.

While the ball is being rolled the link keeps the view it was put down from, so a link copied then opens the level as it looked before, and playing itself is never in a link.

Turning, panning, zooming, slicing and picking bring the entry up to date once the view has rested; choosing a level or a find makes a history entry at once, with what waits written onto the entry beneath it first, so Back returns to where you were; and Back and Forward read the bar rather than write it.

A segment never changes what it means, and what a link carries grows at its tail, which the reader takes by shape and passes over where it does not know it; a unit test holds one link to where it puts the lattice on the screen.

## How it is built

`public/` is the deploy artifact: dependency-free ES modules, no build step, but for pako's deflate under `js/vendor/`, vendored with its licence, which writes a zlib stream byte for byte as zlib does where the browser's own compressor does not, so that a level fits a slot on the disc the same in every browser.

`js/main.js` boots, `js/viewer/state.js` holds shared state and the camera, and modules talk through the `emit`/`on` pair in `js/viewer/ui/dom.js` rather than importing each other both ways.

### The layers

The modules lie in layers, and a module imports only its own layer and those beneath it:

- Under `js/viewer/`, what a plain visit loads, the root is the model, which touches neither the page nor a canvas, `ui/` the page's primitives, which know nothing of the map, `draw/` what paints the canvases and `chrome/` what stands beside the map and speaks for it.
- `js/format/` reads and writes the level, the project, the pack, the disc image, the patch and the store, touches no DOM and nothing of the viewer, and holds the lattice, its side, the key of a cell and the six faces in the game's order, which every layer imports.
- `js/editor/` is what loads when a level of your own is wanted.
- `js/play/` is what loads when the ball is wanted.

### What the page fetches

The page itself starts what the boot will ask for before any of its modules has arrived: every module the boot imports, so they load in one round rather than as each is found in the last, the data files, and the textures of the world the link's pack names, or the first world's where there is no link, so everything is on its way together.

Once that world's textures have landed and the page is idle, the other worlds' are fetched one at a time behind whatever the page asks for itself, from the next world on, unless the browser is set to save data, so a change of world finds them here; `js/viewer/draw/atlas.js` keeps every atlas for the visit, and a frame redraws for a landing only when it is the shown world's.

Beside the worlds' atlases under `tex/` the build lays the sheet of the seven sprites the game's effects draw, for play alone, which the page does not preload.

### How a level reaches the screen

Every level reaches the screen through one funnel in `js/viewer/chrome/navigate.js`, the disc's by their place in the data and any other through `showLevel`, and a module may provide levels for a link to name beyond the disc's slots, or keep a segment of its own at the link's tail, written with the view and handed back to it when a link opens; a level from elsewhere installed again is an update, which keeps the hidden kinds, the slice and the selection where the level still has its cell.

### Drawing the frame

`js/viewer/draw/render.js` draws the frame: it puts the cells in the painter's order, keeps the pick canvas that turns a point on the screen into a cell, lays what shows through the blocks over the map, and draws again while anything moves.

It draws the blocks through `js/viewer/draw/blocks.js`, which lays each world's textures from `js/viewer/draw/atlas.js` and the light a device casts on them from `js/viewer/draw/lights.js`, which casts a light a module hands it as it casts a device's, from a cell and a face in a colour of the module's own, on the faces a device there would light and at the same levels, so that nothing on the blocks changes until a module hands one.

It draws what stands on them through `js/viewer/draw/things.js`, a laser's beam through `js/viewer/draw/beams.js`, and what is neither, from a platform's route and the ground grid to the scale bar and the lettering of a label, through `js/viewer/draw/overlays.js`, which draws the arrow to where a teleporter leads with `js/viewer/draw/arrow.js`, a link drawn as OddworldMap draws its links and knowing nothing of either map.

### The seams

What draws over the map from outside it registers with the frame's four hooks, one run before any block where the ground grid is drawn, which may skip the grid by returning true, one on each block once it is drawn and before the things standing on it, one after each block with what stands on it, and one once the see-through layer is laid, which may ask for another frame by returning true.

A module may also hand the frame travellers of its own, each keyed as the level's own walkers are, by a cell and a face, or by a name of its own, and drawn, sorted and picked as they are, or sorted at a depth of its own where it hands one, reckoned as a block's is, from the corner of the unit cube about it, standing in for the thing whose cell and face its key names where it names one.

A traveller that asks to show through the blocks that cover it is drawn again on the see-through layer, without its shadow, as a thing on a face turned away is while that switch is on.

A traveller that hands a body, a rotation by rows relative to the axes the thing is laid on, across, forward and up, is turned by it in place of the thing's own spin, its squash and its shadow laid as before.

A module may give the things on the blocks the points its ball stands at in place of the level's starts, so the invisible blocks light and the boost buttons sink under a ball that moves.

It may tint a traveller it hands by three numbers, one a channel, which the thing's colours are drawn through.

A module that runs the level may hand the frame the clock it draws at, the index of cells and things it draws from, shaped as the level's own with a thing only on a block it holds, and what travels, each standing in for the frame's own while it is registered, and may say that every invisible block is seen.

So what is gone from the level as it runs is neither drawn nor picked, the walkers stand where the module has stepped them and no invisible face is lit while every one is seen, while the hover, the tip and the panel read the level as installed and the frame's own clock, index and walkers are its again once it stops.

What listens to the pointer registers with `js/viewer/chrome/interaction.js` for a click, for a drag, which what registers may take from the camera at the press, and for what about the cell under the pointer matters to the hover, which is how the editor draws its grid, washes and ghost and takes its clicks and drags.

A module may fill the panel through `onShow` in `js/viewer/chrome/detail.js` and stand a note of its own under the level line through `noteWith` in `js/viewer/chrome/navigate.js`, which asks what is registered before it falls back to the level's own note, and those two seams are how the editor's form and a draft's overview come in.

The route planner is built on the same seams and loads with the boot, since a linked route must draw on the first frame:

- `js/viewer/walk.js` is the model, pure and testable without a page, the ball's three moves and the side rule over a probe of the lattice, the shortest walk between two faces, every face a walk from one reaches, which is how a draft's note knows what the start cannot roll to, the course's codec and its pieces.
- `js/viewer/draw/ribbon.js` paints a block's pieces, the leaps and the rings and nothing of the page.
- `js/viewer/chrome/course.js` is the planner's chrome, the clicks, the strip, the store and the link, drawing through the block hook and listening through the pointer lists and the link's tail.

### Loading the editor and play mode

`js/editor/editor.js` and what it imports, pako included, load when a level of your own is first made, opened or linked to, or when this browser already holds one, after the map's first frame unless the link names one of them, which waits for the editor, and never on a plain visit, which carries the editor's markup and styles alone.

Play mode loads the same way, under `js/play/`, when the ball is first asked for by its key, the corner's button or a block's panel, and never on a plain visit.

### The ball's motion

`js/play/ball.js` is the ball's motion, pure and testable without a page, one game frame at a time by the executable's rules, in two halves a caller may come between, the pad read into the ball's requests and the frame run from them.

The frame run clears the last frame's landing as it begins.

The frame run holds the ball's state, its move and its landings still while the ball is frozen, a ramp, the look and the spin going on.

The frame run drops a ball at rest, or one rolling between the roll's bounds, where its last read of the cells found no block under it, which is the frame after the block has gone.

The frame run rolls on over an edge beside a neighbour where the probe says the block under is slick.

The frame run holds a rolling ball on a block its last read found brittle short of its free edge, the forward request and the speed dropped from the table's progress and the centre set back from its further mark.

The frame run comes down on a platform's body before a block where the probe names one a block under its centre, riding it, its position kept the platform's and the platform's own blocks all the probe calls solid while it rides, so that it never drops off one, and leaves the platform by the forward jump or the hop alone, its position the level's again and the hop's end standing it by the lattice as it stands.

The frame run throws a jump back as off a wall from the wall's progress where a way a caller set differs from its heading and clears the way where it lies along.

The frame run leaves a lost ball where it fell, saying so.

The frame run tells the probe the ball between its state and its move step, where the game reads the cells about it.

A caller may place the ball at rest on any face, its ramp and its look gone, and it keeps the body's turn as a rotation of its own in the world, turned about the side by the spin and straightened each frame, which a turn in place, a wall and an edge leave where it stands while the frame turns under it, the edge's arc turning it a frame behind, and which placing lays aligned again.

### The level as play holds it

`js/play/world.js` is the level as play holds it, pure as well, the lattice's words and kinds by cell, the faces' types, where each pickup stands with its points and the angles the draw gives it, the devices, the crumbling blocks, the platforms, the blocks a level with no key counts, what travels and the dice, laid once from the level and its index.

`js/play/world.js` is the probe the ball's rules ask of it, which answers the lattice as the last frame's step left it, the one the frame drawn before showed, as the game's read of the cells about the ball does, a vanishing block there on the frame after each it is drawn there, a block that has gone never and a platform's body where the platform stands now, its home cell empty while it is away, and names the platform whose body fills a cell with how far it has carried it and what the ball stands on by the game's own word.

`js/play/world.js` is what the ball has taken and marked, each mark with the frame it is first drawn on, and the blocks that have gone.

`js/play/world.js` is the index the frame draws, the level's own less what is taken and the blocks gone with what stood on them, carrying the marked blocks with their frames, and, until the level's outcome stands, less the starts, whose ball the ball on the level is, the start the game takes leaving the clock's own marker where it stands on one.

### The game's frame

`js/play/rules.js` is the game's frame over the ball's motion and the level as play holds it, pure too, one game frame in the order the executable runs it:

- The level's clock.
- The guard a level that follows an ending opens with.
- The wait that holds the pad off and clears the ball's requests.
- The pad read, a press a key held now and not on the frame before, whose word is kept whether or not that frame read the pad, as the game's loop keeps it.
- The walkers stepped.
- What is under the ball on the ground, the block a level with no key marks or the exit the ball leaves by with no key left.
- The pills' words run down.
- The devices under the ball and a riding ball's travel taken afresh from its platform's.
- The ball run, reading what it stands on where the game does.
- The ball's contact with what stands about it.
- The endings, with a run's start, its start again after an ending and the return of a lost ball, and the run's total and its fruit, settled on the frame an ending stands and carried through the start again.

The module has every count and threshold read from the motion table and no wall clock in it, so a run of pad words replays frame for frame.

`js/play/contact.js` is that contact, pure too, the walk over the cells about the ball that takes a pickup within reach of its centre, each type by its own case, the key count and the last key's opening of the exits among them.

`js/play/hazards.js` is what that routine runs under and about the ball, pure too:

- What harms it, a lit beam in its own cell by the last frame's read of the cells about it, on the ground or in the air, fire under it on the ground, heating it a frame and by the landing's measure on the frame after a landing, and cooling off fire, acid on the ground, the spikes, and the moving spikes on the frames the table says their flag held the deadly value, read as the game's hazards read it, what the last frame's step left, each death the countdown the game sets, with its ending and its wait, the ball frozen and marked where the game freezes and marks it and its speeds dropped where the game drops them, refused while a wait runs or the invincibility pill stands, with the burning ball's swell and the acid's melt growing in the wait's slot.
- The arrow under the ball, on the ground or in the air, whose way is laid from its facing as the start's heading is and which drops the forward request where the ball's heading differs from it, the strip told where the ball is at rest, the way standing for the jump's wall test while the ball is in the air over an arrow and cleared on the ground.
- Ice under the ball, which makes the forward request and drops a turn's on every frame and on the ground cools the heat by the chill and grows the cold, set back past its top, the cold waning off ice.
- The crumbling block under the ball on the ground, scored while its word is whole and written broken on every frame, and the frame's last part, where the game's draw runs the crumbling blocks, which breaks a broken block, shrinks a breaking one a frame and empties its cell as the size goes negative, so that nothing stands or rolls on it and the frame draws it no longer.
- The captivators' hit test that follows the routine every frame the pill does not stand, over each walker where the rules have stepped it and each other entry where the loader stands it, the corkscrew's point risen with its bounce as the frame draws it, a ball rolling under it while it is up and a jump over it caught then, from the ball's position words as they stand, so that a ball riding a platform is caught by nothing, as in the game, which catches the ball over any countdown but its own, the captivators standing while it stands.
- The switch thrown as the ball comes within the table's band of its middle along and across, which turns its circuit over through the map's own presses as the panel's button does.
- The teleporter that is on counting its frames while the ball stands within its band, the wait held and the ball's requests cleared, and then placing the ball at rest on the face its slot names, facing as that teleporter does.
- The marker that keeps a device from acting twice in one visit, cleared where the ball has left the middle by more than the table's reach, read between the ball's state and its move step where the game reads it.

### Pad words

`js/play/drive.js` gives pad words per frame:

- The keys as they are pressed, each press down on a frame of its own and read up for a frame first where the frame before had its key down, so that no two presses read as one key held on, a key down as a frame that does not read the pad runs sampled by that frame as the game's loop samples the pad on every frame, so that it is no press when the pad is read again, and a key tapped over such frames, which the game never sees, kept for the first that reads the pad, one a key.
- A planned route followed, which reads the ball's block, face and heading off the ball each frame and, with the ball at rest and no turn asked or running, asks the turn the route's next step wants, by the shorter way, or the roll, which it holds while the ball rolls and the step on from the station it has come to is a roll the way it heads, so the ball rests only where the route turns, leaps or ends, and is done at the route's end, at a leap, which no roll follows, a roll the lattice as it stands no longer allows counting as one, as the planner draws it, read through the probe the rules ask of the level, or where the ball stands on no station of the route's.
- A recording replayed.
- The recorder that keeps a recording, run-length coded.

### The ball on the map

`js/play/play.js` stands the ball on the map as a traveller of the frame's, keyed as nothing of the level's is and handed the body's turn relative to the axes the frame lays it on:

- It steps the game's frames from the frame's under hook by the wall clock, each through the rules with the pad as the keys give it, the words of a driver following the planner's route, read through an export of its chrome, added to it while one runs and the driver let go on an arrow, Space or a press of the pad, the level running while the ball rests with Motion on and only while the ball moves, a key is held or a driver runs without it.
- It hands the frame play's own clock, the frame the rules last ran, which is the one the game's frame draws after its step, the level's index less what the ball has taken, the walkers as the rules stepped them and whether every invisible block is seen through `runWith`, so the phases, the lights and what travels draw as the game's frame draws them, a taken thing is neither drawn nor picked and the face it stood on is painted bare, and while the sunglasses last, and in the on spells of their blink, the blocks light no invisible face and every one keeps the look the map draws it in out of the light.
- It parks the panel's presses with the view and gives the level its circuits as the game loads them while the ball is on it, and the presses back as it leaves.
- It shows the clock, the keys or the blocks left and the points in the HUD.
- It bursts dust where the ball throws a switch, under the ball as a crumbling block breaks, where a block has gone, clearing the panel where it showed that block, and at a boost button's launch.
- It cuts the view to a teleport's far end rather than easing after the ball and makes a leap of the way the ball has come.
- It says on the strip that the ball rides a platform while it does and draws it, its dust and the view's target where the platform has carried it.
- It says through `tipWith` in `js/viewer/chrome/interaction.js` and the panel's `onShow` that a thing the level as installed still lists is taken.
- It shows the cause of a death in red on the strip while its countdown runs and says it.
- It tints the ball through the traveller's tint by its heat, its melt and its cold as the game tints the ball's light, each into its own channel and off the other two, raises it red, green and blue in turn by the game's counter while the invincibility pill's word stands, the counter stepping on each frame the ball is drawn under the pill and kept for the page's life as the game keeps it, and flashes it between white and black by the game's own angle while it is marked dying.
- With Forgive pressed it puts the ball back at rest instead, where it last rested or on the rest before where it died standing there, and says what would have happened.
- Once the level has ended, by its clock, the ball lost off the lattice, a death, the exit or the last block of a level with no key, it shows no ball, reads no key, lets the camera's frame go and turns the view about the level's middle by the game's own angles, the yaw by the third of the three, which the game turns about the lattice's upright, and the pitch by the first, which it turns about the view's own across, the second, whose axis the orbit has not, left out, and with the zoom standing in for the game's eye, since the orbit has none, the eye standing the level's radius and the table's offset off the middle and swinging its reach nearer and further by turns, and the zoom following how large the level would look from it, for the length of one swing of an arcade level's eye, whichever figures the level's own eye swings by, or until Space, Enter or a tap of the pad starts the level again, the view easing back behind the ball.
- It asks for the next frame through the frame hook while the level runs, the ending's view turns or something moves.
- It takes the camera through the frame, the anchored target and the parked view in `js/viewer/state.js` and frames it in the fit's place through `js/viewer/chrome/navigate.js`.
- It lends the things on the blocks the live ball's point in place of the starts'.
- It fills the panel through `onShow`.
- It ends editing through an event the editor listens to.
- It draws, behind a switch of Settings, the dust of `js/play/dust.js`, born over a block and drawn in its cell hook, on by default and neither born nor kept while its switch is off.
- It draws the game's bursts through `js/play/effects.js` in the frame hook, before the pill's screen, from the rows the rules resolved, each particle a sprite of the sheet on a square turned by its angle and added to the frame, a world effect's particles where the camera puts its place and the teleporter's particles at its point of the game's screen scaled to the canvas, the sheet fetched as the first burst needs it, which casts a world effect's light on the faces about the pickup through `lightsWith` in the colour the rules summed.
- It hands the walk to the planner through an export of its chrome that takes a route where none stands or where the one standing is the last it took, so the route grows under the ball as the walk is handed over again at each station.

### The compass's canvas

Beside the frame, `js/viewer/draw/compass.js` paints the compass on a canvas of its own: a block in the camera's own projection whose faces take the shades the level's faces do, so it turns exactly as the level does. Every frame drawn asks for it, and it paints again only when the turn, its frame, the world or the textures have changed.

### The camera, the depth and the light

The camera is a plain orbit: a yaw and a pitch give three unit vectors, and every point is projected orthographically onto two of them with the third as depth.

A module may hand `js/viewer/state.js` a frame, a rotation in world coordinates, and the three are then turned about it, so the yaw and pitch count from the frame's axes rather than the world's and the compass turns with them; and a module may park the camera, the target, the framing and the slice as they were and frame the view in the fit's place through `js/viewer/chrome/navigate.js`, so that `f`, the button and a resize go through it, the button is dim while it holds the view, and a link written meanwhile carries the parked view rather than the one on screen.

Cubes are drawn back to front by that depth, which is exact for equal cubes on a lattice, and a face is drawn only when its outward normal turns toward the camera and no block the game hides that face behind stands against it.

Lighting comes from a fixed direction in the world rather than from the screen, so a face keeps its brightness as the view turns and the solid goes on reading as solid.
