# The .TGI files: the artwork format

Each world keeps its artwork in one `.TGI`, between 626 KB and 682 KB. The container is decoded, read off the game's own parser rather than guessed at, and `tools/kula_tgi.py` reads it; which texture the game paints on which face is the level loader's business, and `tools/kula_skins.py` reads that off the executable.

```bash
python3 tools/kula_tgi.py --world HIRO --sections
python3 tools/kula_tgi.py --world HIRO --vram        # the whole VRAM page
python3 tools/kula_tgi.py --world HIRO --textures    # the 56 textures
python3 tools/kula_skins.py                          # what goes on which face, with the addresses
python3 tools/kula_tex.py                            # the atlases the viewer draws with
python3 tools/kula_tex.py --release jp               # the cells the Japanese disc changes, as sheets laid over the atlases
```

## How it was found

The filenames are built at `0x8004ccf8`, which takes a world index, an extension index into a table of five at `0x80073504` (`.TGI` is the first), and a destination address. `0x8004034c` calls it with extension 0 and destination `0x8013a000`, and `0x800403a0` then hands that address to `0x800253e0`, which is the parser.

## Settled

**A 400-byte header, then eleven sections.** The parser reads eleven `u32` at header offsets 356 to 396, each a count of `u16`, and walks cumulative pointers from `base + 400`. The eleventh boundary lands exactly on the file size in all ten worlds, which is what says the reading is right.

The thirty files of the three discs share the container: the eleventh boundary lands on the file size in every one, the uploads below come in the same order at the same places and sizes but one, HIRO's second palette block on the PAL disc, the 56 textures are paired with the same palette rows, and the header words the loader reads are the same but one count where any differs between the discs, section 7's, or in HIRO on the PAL disc section 10's.

**The last section is not a picture, it is a list of VRAM uploads.** The loop at `0x800254e0` reads `u16 x, y, w, h`, hands the four of them and the bytes that follow to the Psy-Q `LoadImage` at `0x8005c580`, then skips `w * h * 2` bytes and goes round again. So `w` counts 16-bit VRAM words, not pixels, and an 8bpp texture is twice that many pixels wide. The walk consumes every section-10 byte exactly, with nothing left over, in every world.

**Each world ships 56 textures.** They arrive as 32x64-word uploads, which is 64x64 pixels at 8bpp, and each carries three smaller levels: 8x32, 4x16 and 2x8 words. Those only make sense as 32x32, 16x16 and 8x8 at 4bpp, so the mip levels are half-depth. 56 of each, four levels, 224 uploads.

Replaying the uploads recovers the page exactly, and `tools/kula_tex.py` writes an atlas per world from it, every texture in its three shades, which the page starts fetching for the world a link opens on before the viewer's code has arrived, the viewer fetches ahead for the other worlds once that one has landed and the page is idle, and otherwise fetches when it first draws a level of the world.

Until it arrives, and with the textures off, the viewer draws the world's blocks in one colour, the mean of the world's stones as a top wears them, which `tools/kula_skins.py` takes from the same texels and the build ships under `skins` as `tint`.

That colour differs for HAZE alone on the Japanese disc, [159, 124, 114] against [132, 81, 93], and a release's sheets, the cells its disc draws otherwise on the atlases' own grid, and any tint of its own go in its release file under `art`, which `tools/kula_tex.py` cuts and `tools/kula_build.py` writes ([tools.md](tools.md)).

**Palettes are two uploads parked off the side of the page**, 256 words wide at VRAM x=768: one of 72 rows from the top, which is the 72 palettes of 256 colours the textures are paired with, and one from row 90 whose height the world sets, 25 rows in Hiro and 72 in Atlantis, whose rows are the 16-colour palettes the renderer draws through, below.

They are ordinary VRAM writes like anything else, which is why looking for them by scanning the file for smooth 16-bit runs found impostors: pixel data read as colour is smooth too. Arctic's stones show that a scan is no way to pick them out either: their palettes hold 23 greys in the dark shade and 25 in the bright, which a scan asking for 32 distinct words refuses, so the atlas reads the rows a texture's record names and nothing else.

On the PAL disc HIRO's second block is 24 rows against 25, the one upload of the thirty files whose shape differs, and its file is 512 bytes the shorter for it.

**Section 6 pairs each texture with its palettes.** A CLUT id for a palette at VRAM x=768 is `(row << 6) | 48`, so `id & 63 == 48` is a fingerprint, and section 6 is 16.5% such values against a fraction of a percent everywhere else. Its record is 20 `u16`, 427 of them, and the fingerprint falls on fixed slots within that stride.

A record opens with three CLUT ids, and the same three palettes appear again as bare VRAM rows next to the position of each of the texture's four levels: `clut[3]`, then four times over a level's `x, y` and those rows again. Keying on the level-0 position pairs **all 56 textures with exactly one palette triple, in all ten worlds**, and that lack of any contradiction is what says the reading is right rather than merely possible. The 50 records whose position matches no texture point elsewhere in VRAM and are not needed for this.

**The three palettes are three lighting levels.** The header's three fixed-point triples are `0.7 0.6 0.6`, `0.9 0.8 0.8` and `1.2 1.1 1.1`, and the three palettes come out at mean luminance `0.86 : 1.00 : 1.18` in the same order. The measured spread is narrower than the multipliers because 15-bit colour clamps at both ends, but the ordering and the count match, so the game ships each texture pre-shaded three ways rather than lighting it at runtime, and the three shades are the three brightnesses a face can wear: the map's lighting is taken from the game rather than invented, and so is the way up a texture is laid on each face, below.

The triples, at bytes 24 to 59 of the header and Hiro's figures above, are also the light the game puts on what stands on a face, by the same face's shade, and a level played as a bonus level lights its things with the header's second set at byte 156, 4096 in every channel in every world ([ggi.md](ggi.md)).

The PAL disc changes no texel and one set of palettes: in HIRO the dark shade's palettes of the first set, textures 0 to 37, come out at 0.69 of the US luminance, 0.68 to 0.70 texture by texture, with the other two shades as the US disc has them, so HIRO's three palettes measure `0.73 : 1.00 : 1.18` there and the face its dark shade is worn by, the `-y` side, is about a third darker on that disc, the exit's crosses among them; no other world's texture or palette differs on that disc.

The 16-colour palettes the renderer draws the mips through come out darkened with it, to 0.69 of the US luminance at the nearest steps of depth, and section 0's table is rewritten to name them, so the game draws HIRO's `-y` faces darker as the map does, and not only in the 64x64 textures the map takes.

**Section 5 is a table of 119 models, and it is byte-identical in all ten worlds.** Each entry is `i16 first, i16 count` naming a run of section-6 quads (`0x800259b8` reads one by its model's index, four bytes an entry), so a model index means the same thing everywhere and only the pixels behind it change.

It is byte-identical on all three discs as well, and so is section 6, so a texture index and a model index mean the same texture on every disc, which is what lets a disc ship sheets of only the cells it draws otherwise, laid over the US atlases, and the build holds both sections of every disc's files to the US file's digest before it cuts one ([tools.md](tools.md)).

The copy loop at `0x8002569c` walks it and builds, at `0x800afe94`, a 32-byte entry per quad per shade, laid model by model with the shades of a model side by side; for each quad it works out `u = (x mod 64) * 2` and `v = y mod 256` before calling `getTPage(1, 0, ...)`, whose `tp` of 1 is what says the textures are 8bpp.

A model with several quads is an animation or a set of variants, and a face shows the quad its flags' top byte picks: the animator at `0x8004f3b8` writes it once a frame for every face on the lists `0x80026f2c` builds, the laser builder puts a beam's colour there, and the loader puts a 1 there for a face with a pickup on it, as the frame does for the exit's face once no keys are left (`0x8002c150`).

**The models are block faces, and the header at bytes 336 to 352 says how the table is cut**: five groups of 7, 4, 50, 1 and 50.

The first 61 models are what a level with a key draws from and the other 58 a level without one, which is every bonus level (the loader at `0x80027b2c` counts the keys on the records of kinds below 5 and sets mode 1 when there are none, and `0x80025c7c` moves the base of the table to model 61 for it). A hidden level would keep the first set whatever its keys, since the same routine marks it mode 2 after the count (`0x80027c74`) and only mode 1 moves the base, though every hidden level has a key.

The Simon rooms hold no key either, and draw the first set all the same: the last thing that routine does is read the mode the game is in, at `0x800a33b0`, and put the set back to the first when it is 1 (`0x80027cc4`). Mode 1 is the mode those rooms are played in, which the namer at `0x8004ccf8` says: in it, and only for the level pack, it takes the path one past the ten worlds out of the table at `0x800734d8`, `\HIRO\COPYCAT`, which is the pack the ten Simon rooms are in and the only pack no world's directory holds. The artwork is named without that override, by the world word at `0x800a340c`, which that mode steps with the room, below.

Each set is the same shape: seven special models, then the world's stones, then one model per object type.

In the first set the specials are models 0 to 3, the moving platform's own textures 8, 9, 10 and 11, model 4 the crumbling block's cracked stone at 12, model 5 the four laser plates at 13 to 16 in circuit order, yellow, blue, green, red, each with the four nozzles the beam's four lines leave from, and model 6 the invisible block's seven frames of shimmer at 26 to 32, added to what is behind them, which is why through the sunglasses an invisible block reads as pale blue glass; the stones are models 7 to 10 onto textures 0 to 3, the four the world changes.

Models 11 to 60 are indexed by type, so 12 is the fire's five frames at 33 to 37, which run a 54-frame cycle, 13 the ice at 19 and, with a shadow on it, 20, 15 the acid block's green splat at 24, 16, 20 and 21 the round plate at 21 that a teleporter, a switch and a boost button stand on, 18 the exit's red cross and green cross at 17 and 18, 19 the clock face at 25, 22 the moving spikes' four holes at 22, 23 the spikes' plate at 23, and from 37 on, the hidden exit, the arrow, the start and the pickups, the stone plain at 4 and, where a pickup stands, with its painted shadow, texture 5, 6 or 7 by the size of the thing.

On the PAL disc the fire's cycle runs 45 frames and the invisible block's shimmer 120 with a brightness cycle of 88, the counts of its executable's tables (`SCES_010.00`, `0x80027814` to `0x80027820`, `0x80027874` to `0x80027894`), the first two the frames of the same seconds at fifty and the brightness cycle 88 against 90.

So a pickup's shadow on the map is the game's texture and only the ball and the captivators cast a drawn one ([motion.md](motion.md)).

In HAZE alone the Japanese disc changes the first set too, 21 textures, 0 to 7, 9, 10, 12, 19 to 21, 24, 25 and 33 to 37: the stones a pale peach where the US disc's are a dusky rose, the fire an orange X in place of the red cracks, and the round plate at 21 and the acid splat at 24 soft dark blobs like the painted shadows; its section 9 differs as well, in 192,549 of its 225,224 bytes, which no other world's does on either disc.

The exit's crosses, textures 17 and 18, are the same texels on every disc and drawn the same on the Japanese one, so the Japanese release's own sign at its exit is a model in the one `.GGI` ([ggi.md](ggi.md)) and not a face.

The second set has one stone, model 68, the animated swirl at 38 to 45, run through its eight frames and a pair of colour cycles that the world's parity picks out of four (`0x80027024`, `0x80027034`), the first for a face as built, the same magenta in every world left for violet and red in the even worlds and for red and brown in the odd, and the second for one the ball has marked on a level with no key, orange in the even worlds and blue in the odd ([motion.md](motion.md)), which the map spreads across the level by position, a marked block's colour coming the same way.

On the PAL disc the swirl's eight frames run a 56-frame cycle against 70, the count of its executable's table (`SCES_010.00`, `0x80027994` to `0x800279a8`), and its colour cycles stand in its release file ([motion.md](motion.md)).

Its crumbling block is the grey cracked stone at 54, its plates the green target at 55, and its pickups' models run through the swirl and the swirl with a shadow, 38 to 53.

On the Japanese disc the second set is another picture, the same in every world: textures 38 to 55 and the palette rows 60 to 71 they are drawn through change in all ten files and to the same bytes in each, the swirl a dark grey with no green in it, the cracked stone darker and the target two green rings with no centre dot, and since the set's three shades are one picture on every disc, the colour a face of a level with no key takes there comes from the colour cycles alone.

The Japanese executable's swirl's colour cycles are its own, four of 256 colours where the US table holds four of 192, through the same hues at levels of their own, read from a table of its own (`SCPS_100.64`, `0x80077a30`, its length at `0x80077a2c`, reached from `0x800272d0` and `0x80027310`) and standing in its release file under `objects`, so the map colours that disc's grey swirl with its own cycles.

A model whose only quad is texture 8 is a placeholder for a type the loader never puts on a face.

**A Simon room is played in the world of its number on the mode's first round, where the player has reached that world.** The world word and the room's number beside it at `0x800a3408` are 0 at power-on and are put back to 0 as a game in the mode ends (`0x80041e84`, and `0x80041eb4`, which the test of the mode at `0x80041e9c` leads to), and the menu that starts the mode (`0x80049674`) leaves both as they are, so the mode opens on its first room in Hiro.

Each time it moves on to its next room, the routine at `0x8004246c` steps the room's number and the world word on by one together (`0x80042670` to `0x80042684`) and has the next room's files loaded (`0x800426ac`), so the second room is played in Hills and the tenth in Hell, and the build files each room under that world.

The loader writes the world word itself only for the attract demo, which plays LEVEL 5, LEVEL 20 and LEVEL 42 in turn (`0x80040210`, `0x800402dc`).

A world the player has not reached is passed over: where the furthest level reached, at `0x800a3404`, divided by fifteen falls short of the next world, the routine takes Hiro instead (`0x8004269c`) and the rooms step on from there, so they go round the open worlds in order, the fourth room in Hiro while three are open. That word is 30 in the executable, so the first three worlds count as reached from the start, as they do for the menu that offers a world to start a game in (`0x80049b54`), and it rises as levels are played (`0x80040780`) and as a saved game is loaded (`0x80046114`), though never past 149, Hell's fifteenth level, since it counts a world's fifteen levels alone (`0x80040774`).

So the routine's step on from Hell is passed over to Hiro as well, before its own return to the first world past the tenth (`0x800426b8`) can take it, and a round of the rooms ends at the routine's check for the end of the loaded pack (`0x800428d0`), which, as the word it switches on at `0x800a3448` is never written anything but 0, puts the room's number back to the first (`0x8004291c`) and steps the world word on once more, asking nothing of how far the player has reached (`0x80042970`).

After the first round the rooms are so played in other worlds: where every world is open, each round to the tenth is played a world further on than the one before, the second with its first room in Hills and the tenth with its first in Hell and its last in Mars.

From Mars the routine steps the world word on to Hell, which is open, and the check for the pack's end steps it once more, onto the path one past the ten worlds, so the loader names the next room's artwork `\HIRO\COPYCAT.TGI` (`0x80040348`), which the disc does not hold, and as the namer looks for a file again and again until it is found (`0x8004ce48` to `0x8004ce68`), the eleventh round never begins.

On the Japanese disc the executable fixes no world for a room's first round, its branch picking the next room and its world by the player's progress and a word the level loop counts ("The Simon rooms" in [motion.md](motion.md)).

**Which model a face draws is a rule in the loader, at `0x800271d8`**, and `tools/kula_skins.py` reads it and the build ships it under `skins` in `public/objects.json`.

For each face of each cell the walk selects on the block's kind where that is not plain and on the type of the object on the face where it is (`0x80027338`; type 29 counts as the clock, `0x8002733c`, and a type from 50, the captivators, as nothing): a plain face draws a stone at random among the world's stones (`0x800276ac`), which the map hashes from the face's place so it is the same on every visit, a fire, ice or acid block or a face with an object of type `t` draws model 11 + `t` (`0x800276cc`), an invisible block model 6, a crumbling block model 4 and a vanishing block the first stone.

The request goes through `0x80028d64`, which builds the face and reads the header word at 300 + 4 × face for its shade.

What stands on a face picks the model and nothing more: the walk reads no word of the slot but its type, and lays the face square (`0x8002768c`), save that where the second set is drawn a face of type 20 or more takes a quarter turn from the game's dice (`0x80027710`), as a stone there does.

So a clock, which carries 4 in its `f2` on 27 of its 51 placements, and fire and ice are painted the same whatever that field holds, and none of the three is among the types the loader's walk over the objects turns by their `f2`: its table at `0x80010188` sends a clock to the case that skips the turn (`0x80035924`), and fire and ice fall below the table's range to the same case.

A moving platform's faces come from the tables at `0x80072f28` (`0x80027cd4`), by axis and by the block's place in the run, each face a model and a turn, or the value the loader takes for a stone at random, which ships beside the tables as `stone`: the caps at the ends of the run, the striped edge turned to the outer end beside them, a plate on a lone block and the world's stone between; a laser's two ends wear model 5 on the faces that look along the beam, in the circuit's colour (`0x800280d0`).

The header word at 324 says whether a stone may be turned on its face, not at all, a half turn on some or any quarter turn, which only HILLS asks for, so there a plain face is turned a random quarter as well.

The routines at `0x800a3228`, one per face, lay a texture's four corners on the block, and the turn is quarter turns clockwise as seen from outside the face; `kula_skins.py` runs them rather than reading them.

The three fixed-point triples at the head of the file are the shades, and the six words at 300 say which face wears which: the top, both x sides and the underside the middle one, the +y side the bright one and the -y side the dark one, except in INCA, COWBOY and HAZE, where the x sides take the bright and the dark.

**A face is built only where no block that hides it stands against it.** Before it builds a face the walk asks the kind of the block beyond (`0x8002dfac`), and each of its four paths has its own list: an ordinary face is not built toward a plain, fire, ice or acid block and is built unseen behind a crumbling one until that goes (`0x800277d8`); the crumbling block's own faces are hidden toward the same five; the invisible block's faces are not built toward a plain, fire, ice, acid or other invisible block; and the vanishing block's path asks nothing.

An empty cell, a beam's cells and every other kind let the face be built, so the stone behind an invisible block, a vanishing one or a platform's home is there to be seen, and through an invisible block it is. The build ships the lists under `skins.hides`, and the kind an ordinary face is built unseen behind apart as `unseen`, since such a face is there to be found though it is not drawn.

On the PAL disc the face builder makes the same tests of the same kinds at addresses of its own (`SCES_010.00`, an ordinary face's path at `0x80027c78`, `0x80027f4c` and `0x80027f54`, the crumbling block's at `0x80027d54` to `0x80027d70`, the invisible block's at `0x80027c8c` to `0x80027ca0` and the kind an ordinary face is built unseen behind at `0x8002809c`), so its lists are this disc's and none stand in its release file.

On the Japanese disc the face builder folds the kinds into ranges and the lists come out the same: an ordinary face's path tests kinds below 3 and then kind 4 (`SCPS_100.64`, `0x80027638`, `0x800278d8`) where this disc's tests kinds below 2, kind 2 and kind 4 (`0x800273a8`, `0x8002767c`, `0x80027684`), the crumbling block's path kinds below 3, then 4 and 6 (`0x80027708`, `0x80027714`, `0x8002771c`) where this disc's tests below 2, 2, 4 and 6 (`0x80027484` to `0x800274a0`), and the invisible block's path kinds below 5 in one test (`0x80027650`), a test of kinds below 3 before it overwritten before anything reads it (`0x8002764c`), where this disc's tests below 2, 2 to 3 and 4 (`0x800273bc` to `0x800273d0`), the kind an ordinary face is built unseen behind 6 on both (`0x80027a20`; here `0x800277cc`).

**The record table is not a skin table.** A cell holds either a style or a record index, never both, so a block carrying a record has no style of its own, and the record every level ends with holds the level's time. Nothing in a level says how a block looks: the kind and the type say what it is, and the loader's rule above says the rest.

**A face is drawn from the 4bpp levels, through palettes fogged by depth.** The renderer's texture pass at `0x8004f9e0` reads a face's texture entry at 8, 16 or 24 bytes in, the three mip levels, never the 8bpp level at 0, and takes the CLUT from section 0: 72 records of 99 `u16`, one per palette row of the first block, each a CLUT id per step of depth, half a dozen distinct ones down the run, into the second palette block, whose rows hold 16-colour palettes.

The 64x64 textures with their 256-colour palettes are what the mips were cut from, and the map draws those.

**Sections 1 to 4 are fades by depth, 1024 `u16` each in 4096ths.** A thing is faded toward the far colour by the entry for its depth over 64, the step it sorts into (`0x8002d71c`), from section 1, or from section 3 where the word at `0x800a53d4` is 1; the draw queues it with the thing (`0x8002d7dc`), and the renderer puts it in `IR0` for the `dcpl` that lights each polygon (`0x80053608`, `0x80053620`).

Section 1 is 0 for the first 20 steps and rises evenly to the world's figure at step 99, 1229 in HIRO, 1638 in HILLS and HAZE, 2048 in INCA, ARCTIC and HELL, 2867 in MARS, 3277 in FIELD and ATLANT and nothing in COWBOY, and section 3 is 0 in every world. Section 2 fades a face whose flags carry 8 the same way (`0x800569b0` to `0x800569d4`), rising to 4096, and is 0 in MARS; section 4, the same rise in every world, is read by nothing. The far colour is mixed each frame from words of the header (`0x8002a7c8` to `0x8002a938`) and set at `0x8002aa18`.

The table holds block faces and nothing else: a type's model is the face under the thing, not the thing, and the objects themselves are solids in the one `.GGI` on the disc ([ggi.md](ggi.md)).

## Not settled

**Sections 7 to 9 are unread.** Section 9 is 225 KB and the largest after the artwork, and the geometry may live there.

Section 7 is the one section whose size the discs change beyond HIRO's palette block above, 8,604 to 35,216 bytes larger on the PAL disc in eight worlds and the US disc's size in HIRO and HILLS, 1,760 to 3,600 bytes smaller on the Japanese disc in every world, and nothing settled above draws on what it holds.

**What the 8bpp level of each texture is for.** It is uploaded like the rest and the renderer never reads it for a block face; the level select or a near view may.
